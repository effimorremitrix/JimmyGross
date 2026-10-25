import { GUIDES_EN } from "./en";
import { GUIDES_FR } from "./fr";
import type { Guide, GuideId, GuideLang, Guides } from "./types";

// The practice guide, as both the page panel and the assistant read it. One source, so the help
// under each page and the assistant's answers can't tell two stories. No server-only import: the
// panel renders it in the browser and the unit tests read it directly.

export type { Guide, GuideId, GuideLang, GuideSection } from "./types";

export const GUIDE_LANGS: GuideLang[] = ["fr", "en"];

const GUIDES: Record<GuideLang, Guides> = { fr: GUIDES_FR, en: GUIDES_EN };

/** In the order of the cabinet's menu; the patient's journey last. */
export const GUIDE_IDS: GuideId[] = ["agenda", "import", "nouveau", "modeles", "demande", "patient"];

/**
 * Where each guide's page lives. The request detail has no fixed path (it is opened from the
 * agenda) and the patient's journey happens on the patient's phone, so neither can be linked.
 */
const PAGE_PATHS: Record<GuideId, string | null> = {
  agenda: "/cabinet",
  import: "/cabinet/import",
  nouveau: "/cabinet/nouveau",
  modeles: "/cabinet/modeles",
  demande: null,
  patient: null,
};

const WHERE: Record<GuideLang, Partial<Record<GuideId, string>>> = {
  fr: { demande: "ouverte depuis l'agenda", patient: "sur le téléphone du patient" },
  en: { demande: "opened from the agenda", patient: "on the patient's phone" },
};

export function isGuideId(id: unknown): id is GuideId {
  return typeof id === "string" && (GUIDE_IDS as string[]).includes(id);
}

export function isGuideLang(lang: unknown): lang is GuideLang {
  return typeof lang === "string" && (GUIDE_LANGS as string[]).includes(lang);
}

export function getGuide(id: GuideId, lang: GuideLang): Guide {
  return GUIDES[lang][id];
}

export function guidePath(id: GuideId): string | null {
  return PAGE_PATHS[id];
}

/** The guide for a cabinet URL, or null on a page without one. */
export function guideIdForPath(pathname: string): GuideId | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/cabinet") return "agenda";
  if (path === "/cabinet/import") return "import";
  if (path === "/cabinet/nouveau") return "nouveau";
  if (path === "/cabinet/modeles") return "modeles";
  if (/^\/cabinet\/demandes\/[^/]+$/.test(path)) return "demande";
  return null;
}

function where(id: GuideId, lang: GuideLang): string {
  return PAGE_PATHS[id] ?? WHERE[lang][id] ?? "";
}

/** The paths a link may point to: the cabinet pages that have one. */
export function linkablePaths(): string[] {
  return GUIDE_IDS.map((id) => PAGE_PATHS[id]).filter((p): p is string => !!p);
}

/**
 * One line per guide: what it is for and what it covers. Enough for the model to pick the guide
 * to read, short enough to sit in every request's system prompt.
 */
export function guideIndex(lang: GuideLang): string {
  return GUIDE_IDS.map((id) => {
    const g = getGuide(id, lang);
    const headings = g.sections.map((s) => s.heading).join("; ");
    return `- ${id} (${where(id, lang)}): ${g.title}.${g.intro ? ` ${g.intro}` : ""}\n  Covers: ${headings}`;
  }).join("\n");
}

/** A guide in full, as plain text that keeps the guide's own marks (links, bold, code). */
export function renderGuide(id: GuideId, lang: GuideLang): string {
  const g = getGuide(id, lang);
  const out = [`# ${g.title} (${where(id, lang)})`];
  if (g.intro) out.push("", g.intro);
  for (const s of g.sections) {
    out.push("", `## ${s.heading}${s.kind === "install" ? " [to prepare first]" : ""}`);
    s.steps?.forEach((line, i) => out.push(`${i + 1}. ${line}`));
    for (const line of s.items ?? []) out.push(`- ${line}`);
  }
  return out.join("\n");
}

// `code`, [label](/path) and **bold** inside a guide line or an assistant answer.
export const MARKS = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

/**
 * Whether a link target may become a link. The assistant's answers are rendered with the same
 * marks, so only a cabinet path becomes a link; anything else (a javascript: URL in an injected
 * answer, an outside site) stays text.
 */
export function isSafeHref(href: string): boolean {
  return /^\/cabinet(\/[\w-]+)*\/?(\?[\w=&-]*)?$/.test(href);
}

function hrefs(line: string): string[] {
  return [...line.matchAll(MARKS)].filter((m) => m[3] !== undefined).map((m) => m[3]!);
}

function boldCount(line: string): number {
  return [...line.matchAll(MARKS)].filter((m) => m[4] !== undefined).length;
}

function lines(g: Guide): { where: string; text: string }[] {
  const out = [{ where: "title", text: g.title }];
  if (g.intro) out.push({ where: "intro", text: g.intro });
  g.sections.forEach((s, i) => {
    out.push({ where: `section ${i + 1} heading`, text: s.heading });
    for (const [k, list] of [["step", s.steps], ["item", s.items]] as const) {
      list?.forEach((text, j) => out.push({ where: `section ${i + 1} ${k} ${j + 1}`, text }));
    }
  });
  return out;
}

/**
 * Differences between a translated guide set and the French reference: a guide, section or line
 * missing or extra, a section of another kind, a link that points elsewhere, a different number
 * of bold controls, or a link to a page that doesn't exist. Empty when the two match.
 */
export function guideProblems(source: Guides, translated: Guides): string[] {
  const problems: string[] = [];
  for (const id of GUIDE_IDS) {
    const a = source[id];
    const b = translated[id];
    if (!b) {
      problems.push(`${id}: missing`);
      continue;
    }
    if (!!a.intro !== !!b.intro) problems.push(`${id}: intro present in one language only`);
    if (a.sections.length !== b.sections.length) {
      problems.push(`${id}: ${a.sections.length} sections in French, ${b.sections.length} translated`);
      continue;
    }
    a.sections.forEach((s, i) => {
      const t = b.sections[i]!;
      if (s.kind !== t.kind) problems.push(`${id} section ${i + 1}: kind differs`);
      if (!!s.steps !== !!t.steps || (s.steps?.length ?? 0) !== (t.steps?.length ?? 0)) problems.push(`${id} section ${i + 1}: steps differ`);
      if (!!s.items !== !!t.items || (s.items?.length ?? 0) !== (t.items?.length ?? 0)) problems.push(`${id} section ${i + 1}: items differ`);
    });
    if (problems.some((p) => p.startsWith(`${id} `))) continue;
    const la = lines(a);
    const lb = lines(b);
    la.forEach((line, k) => {
      const other = lb[k]!.text;
      if (hrefs(line.text).join() !== hrefs(other).join()) problems.push(`${id} ${line.where}: links differ`);
      if (boldCount(line.text) !== boldCount(other)) problems.push(`${id} ${line.where}: ${boldCount(line.text)} bold in French, ${boldCount(other)} translated`);
    });
  }
  for (const guides of [source, translated]) {
    for (const id of GUIDE_IDS) {
      for (const line of guides[id] ? lines(guides[id]) : []) {
        for (const href of hrefs(line.text)) {
          if (!linkablePaths().includes(href)) problems.push(`${id} ${line.where}: link to unknown page ${href}`);
        }
      }
    }
  }
  return problems;
}
