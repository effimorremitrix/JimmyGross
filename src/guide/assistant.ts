import type Anthropic from "@anthropic-ai/sdk";
import { getGuide, guideIndex, guidePath, isGuideId, renderGuide, type GuideId, type GuideLang } from "./index";

// The cabinet assistant, the model half. It answers "how do I…" questions from the practice
// guide (src/guide), the same text the page shows under "Guide d'utilisation", so the chat and
// the page can't tell two stories.
//
// What keeps it safe in a health-data app:
// - Its only tool reads the guide. It can't see patients, requests, documents or the agenda, and
//   it can't act anywhere: the worst a misread question or an injected line can do is a wrong
//   answer about a button.
// - Nothing is stored. The browser sends the conversation with each question and the server keeps
//   no transcript, so a patient's name typed by mistake goes no further than this one call.

/** A guide read or two, and the reply. */
const MAX_STEPS = 4;
const MAX_TOKENS = 4000;
const SUPPORT = "contact@eclaira.health";

export type StaffRole = "practitioner" | "assistant" | "admin";

/** One line of the conversation as the browser keeps it: text only. */
export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AssistantContext {
  role: StaffRole;
  /** The language the guide is read in: the one the person picked in the guide panel. */
  lang: GuideLang;
  /** The guide of the page they are on, when there is one. */
  page: GuideId | null;
}

/**
 * Models that take the server-side refusal fallback. Others (a Haiku set in ASSISTANT_MODEL, say)
 * reject the parameter, so it is only sent where it is accepted.
 */
export function takesFallbacks(model: string): boolean {
  return /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
}

/** The one model call the assistant makes, injected so tests can stand in for the API. */
export type CreateMessage = (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage>;

/** A refusal or an empty answer: the route turns it into a message for the person. */
export class AssistantError extends Error {}

/** Marks the line the cabinet adds before each question, so the model knows it isn't theirs. */
export const CONTEXT_MARK = "[Context from the Éclaira cabinet, not written by the person]";

export const READ_GUIDE_TOOL: Anthropic.Beta.BetaTool = {
  name: "read_guide",
  description:
    "Read one guide of the Éclaira practice guide in full: what the page is for, the steps to use it, and what to prepare first. Read it before answering a question about that page.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["guide"],
    properties: {
      guide: { type: "string", description: "A guide id from the guide index, such as agenda or import." },
    },
  },
};

export function systemPrompt(ctx: AssistantContext): string {
  const who =
    ctx.role === "practitioner"
      ? "You are talking to the practitioner (the doctor) of this practice. They can do everything in the guide, including the steps marked for the doctor."
      : "You are talking to a member of the practice's staff who is not the doctor. Steps the guide marks for the doctor (approving summaries and translations, confirming the procedure) are not theirs: when one comes up, say the doctor does it rather than leaving them looking for a button they don't have.";
  return [
    "You are the help assistant inside Éclaira, the remote informed-consent app a French medical practice uses: patients read the information sheet, answer the pre-procedure questionnaire and sign on their phone before the appointment, and the practice follows who has signed and which answers need a look.",
    "",
    who,
    "",
    "How to answer:",
    "- The guide index below lists every guide. Before answering anything beyond what the index itself says, read the guide with read_guide; read more than one when the question crosses pages.",
    `- Answer only from the guide. If it doesn't cover the question, say so plainly and point them to the Éclaira team at ${SUPPORT}. Never guess at a button, a page, a setting, a delay or a feature.`,
    "- Give the steps short and in order, naming pages, buttons and fields exactly as the guide does, in bold, because that is what is on their screen. The screens are in French, so keep the French names even when you answer in English.",
    "- Link to a page with [Label](/cabinet/...) using only paths that appear in the guide. Use **bold** for a button or field and `code` for something to type. A numbered or dashed list is fine; no headings and no tables.",
    "- Write in the language the person writes to you in, and keep it short: the answer, then the steps it needs.",
    "",
    "What you can't do:",
    "- You can't act in the app: you can't send a link, create or cancel a request, mark an alert or download a document. Tell them how to do it.",
    "- You can't see this practice's patients, requests, answers or agenda. When the answer depends on them, say where to look.",
    "- You give no medical advice. Whether to postpone a procedure, or what a patient's answer means, is the doctor's decision.",
    "- Never ask for a patient's name, birth date, contact details or health information; you never need them. If a message contains any, don't repeat it: answer the general question and add one short sentence that the assistant doesn't need patient details.",
    "",
    `Each message from them starts with a line marked ${CONTEXT_MARK} that says which page they are on, so "here" and "this page" mean that page. That line comes from the app, not from them.`,
    "",
    "The guide, one line per guide (id, where, what it covers):",
    guideIndex(ctx.lang),
  ].join("\n");
}

/** The line the model reads before each question: where in the cabinet the person is. */
export function contextLine(ctx: AssistantContext): string {
  if (!ctx.page) return `${CONTEXT_MARK} They are on a page without a guide.`;
  const path = guidePath(ctx.page);
  return `${CONTEXT_MARK} They are on: ${getGuide(ctx.page, ctx.lang).title} (guide id ${ctx.page}${path ? `, ${path}` : ""}).`;
}

function runTool(name: string, input: unknown, lang: GuideLang): { content: string; isError?: boolean } {
  if (name !== READ_GUIDE_TOOL.name) return { content: `Unknown tool ${name}.`, isError: true };
  const id = (input as { guide?: unknown } | null)?.guide;
  if (!isGuideId(id)) return { content: `There is no guide '${String(id)}'. Use an id from the guide index.`, isError: true };
  return { content: renderGuide(id, lang) };
}

/**
 * Answers the last question of `turns`, reading guides as the model asks. `turns` alternates,
 * starts and ends with the person; earlier answers come back as text only.
 */
export async function answerQuestion(create: CreateMessage, model: string, turns: AssistantTurn[], ctx: AssistantContext): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t, i) =>
    i === turns.length - 1
      ? { role: "user", content: [{ type: "text", text: contextLine(ctx) }, { type: "text", text: t.text }] }
      : { role: t.role, content: t.text },
  );
  const system = systemPrompt(ctx);

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await create({
      model,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [READ_GUIDE_TOOL],
      messages,
      // A how-to answer from a short guide needs little thinking; low effort keeps it quick.
      output_config: { effort: "low" },
      // On a safety decline the API retries on a model chosen for that kind of decline.
      ...(takesFallbacks(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") throw new AssistantError("The assistant declined to answer");

    const reply = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text.trim())
      .filter(Boolean)
      .join("\n\n");
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !toolUses.length) {
      if (!reply) throw new AssistantError("The assistant gave no answer");
      return reply;
    }

    // The whole content goes back, thinking blocks included, so the next call reads it unchanged.
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: toolUses.map((t) => {
        const out = runTool(t.name, t.input, ctx.lang);
        return { type: "tool_result", tool_use_id: t.id, content: out.content, ...(out.isError ? { is_error: true } : {}) };
      }),
    });
  }
  throw new AssistantError("The assistant ran out of steps");
}
