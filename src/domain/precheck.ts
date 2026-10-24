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

/** A flag the practitioner had already reviewed that a new submission withdrew or changed. */
export interface ReviewedFlagChange {
  questionId: string;
  kind: "withdrawn" | "changed";
  previousMessage: string;
  previousDetail: string;
  newDetail: string | null;
}

/**
 * Compares the active flags of the previous submission with the flags of a
 * new one. Only flags the practitioner had already reviewed matter here: an
 * unreviewed flag that disappears needs no attention, but a reviewed one means
 * the decision was taken on answers the patient has since changed.
 */
export function reviewedFlagChanges(
  previous: { questionId: string; message: string; detail: string; reviewedAt: Date | null }[],
  next: ComputedFlag[],
): ReviewedFlagChange[] {
  const changes: ReviewedFlagChange[] = [];
  for (const p of previous) {
    if (!p.reviewedAt) continue;
    const n = next.find((f) => f.questionId === p.questionId);
    if (!n) changes.push({ questionId: p.questionId, kind: "withdrawn", previousMessage: p.message, previousDetail: p.detail, newDetail: null });
    else if (n.detail !== p.detail) changes.push({ questionId: p.questionId, kind: "changed", previousMessage: p.message, previousDetail: p.detail, newDetail: n.detail });
  }
  return changes;
}

/**
 * The alert raised when the patient withdraws an answer the practitioner had
 * already reviewed: the decision was made on a declaration that no longer
 * stands, so it must be looked at again before the act.
 */
export function withdrawnAfterReviewFlag(c: ReviewedFlagChange): ComputedFlag {
  return {
    questionId: c.questionId,
    severity: "warn",
    message: `Réponse retirée après vérification : ${c.previousMessage}`,
    detail: c.previousDetail ? `Déclaré auparavant : ${c.previousDetail}`.slice(0, 500) : "",
  };
}
