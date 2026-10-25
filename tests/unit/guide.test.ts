import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { GUIDE_IDS, guideIdForPath, guideIndex, guideProblems, isSafeHref, MARKS, renderGuide } from "@/guide";
import { answerQuestion, AssistantError, CONTEXT_MARK, READ_GUIDE_TOOL, systemPrompt, takesFallbacks, type CreateMessage } from "@/guide/assistant";
import { GUIDES_EN } from "@/guide/en";
import { GUIDES_FR } from "@/guide/fr";
import type { Guides } from "@/guide/types";

describe("Practice guide content", () => {
  it("has an English line for every French line, with the same links and controls", () => {
    expect(guideProblems(GUIDES_FR, GUIDES_EN)).toEqual([]);
  });

  it("reports a missing line and a link that moved", () => {
    const broken = structuredClone(GUIDES_EN) as Guides;
    broken.agenda.sections[0]!.steps!.pop();
    broken.nouveau.sections[0]!.steps![0] = "Open [New request](/cabinet/modeles).";
    const problems = guideProblems(GUIDES_FR, broken);
    expect(problems).toContain("agenda section 1: steps differ");
    expect(problems).toContain("nouveau section 1 step 1: links differ");
  });

  it("reports a link to a page that doesn't exist", () => {
    const broken = structuredClone(GUIDES_EN) as Guides;
    broken.agenda.intro = "See [Settings](/cabinet/reglages).";
    expect(guideProblems(GUIDES_FR, broken).some((p) => p.includes("unknown page /cabinet/reglages"))).toBe(true);
  });

  // The guide names buttons as they are on screen. A renamed button with an unchanged guide sends
  // people looking for something that isn't there, so every French control the guide puts in bold
  // has to appear in the app's own source.
  it("names only controls that exist in the app", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f)) files.push(p);
      }
    };
    for (const dir of ["src/app", "src/i18n"]) walk(dir);
    files.push("src/domain/status.ts");
    const corpus = files
      .filter((f) => !f.includes("/cabinet/assistant-drawer"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n")
      .replace(/&apos;/g, "'")
      .replace(/\{"\s*"\}/g, " ");
    // Labels built at runtime: the variable part replaced by a placeholder in the guide.
    const dynamic = new Set(["Créer N demande(s)", "J'ai relu la traduction en … et je la valide"]);
    const missing: string[] = [];
    for (const id of GUIDE_IDS) {
      const g = GUIDES_FR[id];
      const text = [g.intro ?? "", ...g.sections.flatMap((s) => [...(s.steps ?? []), ...(s.items ?? [])])].join("\n");
      for (const m of text.matchAll(MARKS)) {
        const label = m[4];
        if (label && !dynamic.has(label) && !corpus.includes(label)) missing.push(`${id}: ${label}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("Guide lookup", () => {
  it("maps each cabinet page to its guide", () => {
    expect(guideIdForPath("/cabinet")).toBe("agenda");
    expect(guideIdForPath("/cabinet/")).toBe("agenda");
    expect(guideIdForPath("/cabinet/import")).toBe("import");
    expect(guideIdForPath("/cabinet/nouveau")).toBe("nouveau");
    expect(guideIdForPath("/cabinet/modeles")).toBe("modeles");
    expect(guideIdForPath("/cabinet/demandes/0b7c6f1e-2c1d-4c6e-9a51-1d5c0c7b4c21")).toBe("demande");
    expect(guideIdForPath("/login")).toBeNull();
    expect(guideIdForPath("/p/abc")).toBeNull();
  });

  it("indexes every guide, in both languages", () => {
    for (const lang of ["fr", "en"] as const) {
      const index = guideIndex(lang);
      for (const id of GUIDE_IDS) expect(index).toContain(`- ${id} (`);
    }
    expect(guideIndex("fr")).toContain("demande (ouverte depuis l'agenda)");
  });

  it("renders a guide with numbered steps and its marks kept", () => {
    const text = renderGuide("import", "en");
    expect(text).toMatch(/^# Importing the week's agenda \(\/cabinet\/import\)/);
    expect(text).toContain("## Preparing the file [to prepare first]");
    expect(text).toContain("1. Open [Importer l'agenda](/cabinet/import)");
  });

  it("only turns cabinet paths into links", () => {
    expect(isSafeHref("/cabinet")).toBe(true);
    expect(isSafeHref("/cabinet/import")).toBe(true);
    expect(isSafeHref("/cabinet?jour=2026-10-26")).toBe(true);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("//evil.example/cabinet")).toBe(false);
    expect(isSafeHref("https://evil.example")).toBe(false);
    expect(isSafeHref("/api/requests/x/documents/signed")).toBe(false);
  });
});

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;

function message(content: Anthropic.Beta.BetaContentBlock[], stop: Anthropic.Beta.BetaMessage["stop_reason"]): Anthropic.Beta.BetaMessage {
  return { id: "msg", type: "message", role: "assistant", model: "m", content, stop_reason: stop } as unknown as Anthropic.Beta.BetaMessage;
}
const text = (t: string) => ({ type: "text", text: t }) as Anthropic.Beta.BetaContentBlock;
const toolUse = (id: string, guide: string) => ({ type: "tool_use", id, name: "read_guide", input: { guide } }) as Anthropic.Beta.BetaContentBlock;

/** A stand-in for the API that answers from a script and keeps every request it got. */
function scripted(...replies: Anthropic.Beta.BetaMessage[]) {
  const calls: Params[] = [];
  const create: CreateMessage = async (params) => {
    calls.push(structuredClone(params));
    const next = replies.shift();
    if (!next) throw new Error("no more replies");
    return next;
  };
  return { create, calls };
}

const ctx = { role: "assistant" as const, lang: "fr" as const, page: "agenda" as const };

describe("Cabinet assistant", () => {
  it("reads the guide it asks for, then answers", async () => {
    const api = scripted(message([toolUse("t1", "import")], "tool_use"), message([text("Ouvrez [Importer l'agenda](/cabinet/import).")], "end_turn"));
    const reply = await answerQuestion(api.create, "claude-opus-5-5", [{ role: "user", text: "Comment importer ?" }], ctx);

    expect(reply).toBe("Ouvrez [Importer l'agenda](/cabinet/import).");
    expect(api.calls).toHaveLength(2);
    const first = api.calls[0]!;
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.tools).toEqual([READ_GUIDE_TOOL]);
    expect(first.fallbacks).toBe("default");
    const question = first.messages[0]!.content as Anthropic.Beta.BetaTextBlockParam[];
    expect(question[0]!.text).toContain(CONTEXT_MARK);
    expect(question[0]!.text).toContain("guide id agenda, /cabinet");
    expect(question[1]!.text).toBe("Comment importer ?");

    const result = (api.calls[1]!.messages[2]!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0]!;
    expect(result.tool_use_id).toBe("t1");
    expect(result.is_error).toBeUndefined();
    expect(result.content).toContain("# Importer l'agenda de la semaine");
  });

  it("asks for the refusal fallback only on models that take it", async () => {
    const haiku = scripted(message([text("Oui.")], "end_turn"));
    await answerQuestion(haiku.create, "claude-haiku-5-5", [{ role: "user", text: "?" }], ctx);
    expect(haiku.calls[0]!.fallbacks).toBeUndefined();
    expect(haiku.calls[0]!.betas).toBeUndefined();
    expect(takesFallbacks("claude-sonnet-5-5")).toBe(true);
    expect(takesFallbacks("claude-fable-5-1")).toBe(true);
  });

  it("answers an unknown guide id with an error the model can recover from", async () => {
    const api = scripted(message([toolUse("t1", "settings")], "tool_use"), message([text("Ce n'est pas couvert.")], "end_turn"));
    await answerQuestion(api.create, "m", [{ role: "user", text: "Réglages ?" }], ctx);
    const result = (api.calls[1]!.messages[2]!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0]!;
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("There is no guide 'settings'");
  });

  it("replays earlier turns as text and marks only the last question", async () => {
    const api = scripted(message([text("Oui.")], "end_turn"));
    await answerQuestion(
      api.create,
      "m",
      [
        { role: "user", text: "Première question" },
        { role: "assistant", text: "Première réponse" },
        { role: "user", text: "Et ensuite ?" },
      ],
      ctx,
    );
    const msgs = api.calls[0]!.messages;
    expect(msgs[0]).toEqual({ role: "user", content: "Première question" });
    expect(msgs[1]).toEqual({ role: "assistant", content: "Première réponse" });
    expect(JSON.stringify(msgs[2])).toContain(CONTEXT_MARK);
  });

  it("treats a refusal, an empty answer and a runaway loop as no answer", async () => {
    const q = [{ role: "user" as const, text: "?" }];
    await expect(answerQuestion(scripted(message([], "refusal")).create, "m", q, ctx)).rejects.toBeInstanceOf(AssistantError);
    await expect(answerQuestion(scripted(message([], "end_turn")).create, "m", q, ctx)).rejects.toBeInstanceOf(AssistantError);
    const loop = scripted(...Array.from({ length: 4 }, (_, i) => message([toolUse(`t${i}`, "agenda")], "tool_use")));
    await expect(answerQuestion(loop.create, "m", q, ctx)).rejects.toThrow("ran out of steps");
    expect(loop.calls).toHaveLength(4);
  });

  it("tells staff who aren't the doctor which steps are the doctor's", () => {
    expect(systemPrompt({ ...ctx, role: "assistant" })).toContain("say the doctor does it");
    expect(systemPrompt({ ...ctx, role: "practitioner" })).toContain("You are talking to the practitioner");
  });

  it("reads the guide in the language picked, and keeps patients out of it", () => {
    const en = systemPrompt({ ...ctx, lang: "en" });
    expect(en).toContain("Importing the week's agenda");
    expect(en).toContain("Never ask for a patient's name");
    expect(en).toContain("You give no medical advice");
  });
});
