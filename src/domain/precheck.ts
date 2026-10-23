import type { FlagSeverity, PrecheckAnswers, Question } from "./types";

export interface ComputedFlag {
  questionId: string;
  severity: FlagSeverity;
  message: string;
  detail: string;
}

/** Questions that apply to a given planned act (spine-only questions, etc.). */
export function applicableQuestions(questions: Question[], plannedAct: string): Question[] {
  const act = plannedAct.toLowerCase();
  return questions.filter(
    (q) => !q.onlyForActs || q.onlyForActs.some((k) => act.includes(k.toLowerCase())),
  );
}

export type AnswersValidation = { ok: true } | { ok: false; missing: string[] };

/** Every applicable question must be answered; "oui" with a detail prompt needs a detail. */
export function validateAnswers(
  questions: Question[],
  plannedAct: string,
  answers: PrecheckAnswers,
): AnswersValidation {
  const missing: string[] = [];
  for (const q of applicableQuestions(questions, plannedAct)) {
    const a = answers.items[q.id];
    if (!a || (a.answer !== "oui" && a.answer !== "non")) missing.push(q.id);
    else if (a.answer === "oui" && q.detailPrompt && !a.detail?.trim()) missing.push(q.id);
  }
  return missing.length ? { ok: false, missing } : { ok: true };
}

/** Turns "oui" answers on flagged questions into practitioner alerts. */
export function computeFlags(
  questions: Question[],
  plannedAct: string,
  answers: PrecheckAnswers,
): ComputedFlag[] {
  const flags: ComputedFlag[] = [];
  for (const q of applicableQuestions(questions, plannedAct)) {
    const a = answers.items[q.id];
    if (a?.answer === "oui" && q.flag) {
      flags.push({
        questionId: q.id,
        severity: q.flag.severity,
        message: q.flag.message,
        detail: (a.detail ?? "").trim().slice(0, 500),
      });
    }
  }
  const rank: Record<FlagSeverity, number> = { block: 0, warn: 1, info: 2 };
  return flags.sort((x, y) => rank[x.severity] - rank[y.severity]);
}
