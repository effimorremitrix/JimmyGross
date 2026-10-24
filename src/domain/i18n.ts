import type { ConsentBlock, InfoSection, Question, TemplateTranslation } from "./types";

/** Languages a patient can read the flow in. French is the reference and the fallback. */
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/** Each language named in itself, for the patient's switcher. */
export const LOCALE_NAME: Record<Locale, string> = { fr: "Français", en: "English" };
/** Language names in French, for the practice screens. */
export const LOCALE_LABEL_FR: Record<Locale, string> = { fr: "français", en: "anglais" };
/** BCP 47 tag used for dates and the PDF language. */
export const LOCALE_TAG: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

/**
 * The language the patient actually gets: the requested one when its
 * translation is approved by the practitioner, otherwise French.
 */
export function resolveLocale(requested: string | null | undefined, approved: readonly Locale[]): Locale {
  if (!isLocale(requested) || requested === DEFAULT_LOCALE) return DEFAULT_LOCALE;
  return approved.includes(requested) ? requested : DEFAULT_LOCALE;
}

/** The patient-facing content of a template version, in one language. */
export interface LocalizedContent {
  title: string;
  subtitle: string;
  intro: string[];
  sections: InfoSection[];
  consent: ConsentBlock;
  questions: Question[];
}

/**
 * Overlays a translation on the French source. Structure (ids, tones, flag
 * severities, act keywords) and practitioner-facing text (flag messages) always
 * come from the source, so alerts and rules never depend on the language.
 */
export function localizeContent(source: LocalizedContent, t: TemplateTranslation | null): LocalizedContent {
  if (!t) return source;
  return {
    title: t.title,
    subtitle: t.subtitle,
    intro: t.intro,
    sections: source.sections.map((s) => {
      const ts = t.sections[s.id];
      return {
        ...s,
        title: ts.title,
        summary: ts.summary,
        paragraphs: ts.paragraphs,
        callouts: s.callouts?.map((c, i) => ({ ...c, heading: ts.callouts![i].heading, items: ts.callouts![i].items })),
      };
    }),
    consent: { ...source.consent, statement: t.consentStatement },
    questions: source.questions.map((q) => {
      const tq = t.questions[q.id];
      return {
        ...q,
        text: tq.text,
        detailPrompt: q.detailPrompt ? tq.detailPrompt : undefined,
        flag: q.flag ? { ...q.flag, patientNotice: tq.patientNotice! } : undefined,
      };
    }),
  };
}

/** The act as the patient reads it: translated when the template's translation names it. */
export function localizeAct(act: string, t: TemplateTranslation | null): string {
  return t?.acts?.[act] ?? act;
}

/**
 * Checks that a translation covers every patient-facing string of the source,
 * item for item. Returns the problems (empty when complete).
 */
export function translationProblems(source: LocalizedContent, t: TemplateTranslation): string[] {
  const out: string[] = [];
  const blank = (s: string | undefined) => !s || !s.trim();
  if (blank(t.title)) out.push("title");
  if (source.subtitle && blank(t.subtitle)) out.push("subtitle");
  if (t.intro.length !== source.intro.length || t.intro.some(blank)) out.push("intro");
  for (const s of source.sections) {
    const ts = t.sections[s.id];
    if (!ts) {
      out.push(`section ${s.id}: missing`);
      continue;
    }
    if (blank(ts.title)) out.push(`section ${s.id}: title`);
    if (ts.summary.length !== s.summary.length || ts.summary.some(blank)) out.push(`section ${s.id}: summary`);
    if (ts.paragraphs.length !== s.paragraphs.length || ts.paragraphs.some(blank)) out.push(`section ${s.id}: paragraphs`);
    const sc = s.callouts ?? [];
    const tc = ts.callouts ?? [];
    if (sc.length !== tc.length) out.push(`section ${s.id}: callouts`);
    else
      sc.forEach((c, i) => {
        if (blank(tc[i].heading) || tc[i].items.length !== c.items.length || tc[i].items.some(blank)) {
          out.push(`section ${s.id}: callout ${i + 1}`);
        }
      });
  }
  for (const id of Object.keys(t.sections)) {
    if (!source.sections.some((s) => s.id === id)) out.push(`section ${id}: not in source`);
  }
  if (t.consentStatement.length !== source.consent.statement.length || t.consentStatement.some(blank)) {
    out.push("consent statement");
  }
  for (const q of source.questions) {
    const tq = t.questions[q.id];
    if (!tq || blank(tq.text)) out.push(`question ${q.id}: text`);
    else {
      if (q.detailPrompt && blank(tq.detailPrompt)) out.push(`question ${q.id}: detail prompt`);
      if (q.flag && blank(tq.patientNotice)) out.push(`question ${q.id}: patient notice`);
    }
  }
  return out;
}
