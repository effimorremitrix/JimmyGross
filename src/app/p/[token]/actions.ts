"use server";

import { and, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { startPatientSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { sha256 } from "@/lib/crypto";
import { checkOtp, issueOtp } from "@/lib/otp";
import { buildConsentPdf } from "@/lib/pdf";
import { requestMeta } from "@/lib/request-meta";
import { providerByName, signatureProvider } from "@/lib/signature";
import { computeFlags, reviewedFlagChanges, validateAnswers, withdrawnAfterReviewFlag } from "@/domain/precheck";
import { isLocale } from "@/domain/i18n";
import { atLeast } from "@/domain/status";
import type { PrecheckAnswers } from "@/domain/types";
import { patientText } from "@/i18n/patient";
import { finalizeSigned, providerRef, setStatus } from "@/server/consent";
import { accessState, loadByToken, requirePatient, type PatientContext } from "@/server/patient";

const MAX_ACCESS_ATTEMPTS = 5;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ---------- identity gate ----------

async function gateContext(token: string): Promise<PatientContext | string> {
  const ctx = await loadByToken(token);
  if (!ctx) return patientText().errLinkInvalid;
  const state = await accessState(ctx);
  if (state === "locked") return ctx.t.errLocked;
  if (state === "expired" || state === "cancelled") return ctx.t.errLinkExpired;
  return ctx;
}

/** Records a wrong birth date or code; returns the message and whether access is now locked. */
async function failedAttempt(ctx: PatientContext): Promise<{ message: string; locked: boolean }> {
  const r = ctx.request;
  const attempts = r.failedDobAttempts + 1;
  const locked = attempts >= MAX_ACCESS_ATTEMPTS;
  await db
    .update(schema.consentRequests)
    .set({ failedDobAttempts: attempts, lockedAt: locked ? new Date() : null })
    .where(eq(schema.consentRequests.id, r.id));
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: "patient", type: locked ? "patient.locked" : "patient.identity_failed" });
  return { locked, message: locked ? ctx.t.errTooManyLocked : ctx.t.errAttemptsLeft(MAX_ACCESS_ATTEMPTS - attempts) };
}

async function grantAccess(ctx: PatientContext, method: "birth_date" | "code") {
  const r = ctx.request;
  await db.update(schema.consentRequests).set({ failedDobAttempts: 0 }).where(eq(schema.consentRequests.id, r.id));
  await startPatientSession(r.id);
  await setStatus(r, "opened");
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: "patient", type: "patient.identity_ok", data: { method } });
}

export async function verifyBirthDate(token: string, birthDate: string): Promise<Result> {
  const ctx = await gateContext(token);
  if (typeof ctx === "string") return { ok: false, error: ctx };
  if (!ctx.patient.birthDate) return { ok: false, error: ctx.t.errCodeRequired };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { ok: false, error: ctx.t.errBirthDateIncomplete };
  if (birthDate !== ctx.patient.birthDate) {
    const f = await failedAttempt(ctx);
    return { ok: false, error: f.locked ? f.message : `${ctx.t.errBirthDateWrong} ${f.message}` };
  }
  await grantAccess(ctx, "birth_date");
  return { ok: true };
}

/** When no birth date is on file (agenda import), a code to the patient's phone or e-mail proves access. */
export async function sendAccessCode(token: string): Promise<Result<{ sentTo: string; demoCode?: string }>> {
  const ctx = await gateContext(token);
  if (typeof ctx === "string") return { ok: false, error: ctx };
  if (ctx.patient.birthDate) return { ok: false, error: ctx.t.errBirthDateMode };
  const { code, sentTo } = await issueOtp(ctx.request.id, "access", ctx.patient, ctx.locale);
  await audit({ practiceId: ctx.request.practiceId, requestId: ctx.request.id, actor: "system", type: "patient.access_code_sent" });
  return { ok: true, sentTo, ...(config().DEMO_MODE ? { demoCode: code } : {}) };
}

export async function verifyAccessCode(token: string, code: string): Promise<Result> {
  const ctx = await gateContext(token);
  if (typeof ctx === "string") return { ok: false, error: ctx };
  const res = await checkOtp(ctx.request.id, "access", code.replace(/\D/g, ""));
  if (!res.ok) {
    if (res.reason === "expired") return { ok: false, error: ctx.t.errCodeExpired };
    const f = await failedAttempt(ctx);
    return { ok: false, error: f.locked ? f.message : `${ctx.t.errCodeWrong} ${f.message}` };
  }
  await grantAccess(ctx, "code");
  return { ok: true };
}

// ---------- language ----------

/**
 * The patient switches language (French or an approved translation). Allowed
 * until consent is given: the signed document is built in the language in use then.
 * Works before the identity gate too, since it reveals nothing.
 */
export async function setLanguage(token: string, locale: string): Promise<Result> {
  const ctx = await gateContext(token);
  if (typeof ctx === "string") return { ok: false, error: ctx };
  const r = ctx.request;
  if (atLeast(r.status, "awaiting_otp") || r.patientAckAt) return { ok: false, error: ctx.t.errLanguageLocked };
  if (!isLocale(locale) || !ctx.locales.includes(locale)) return { ok: false, error: ctx.t.errLanguageUnavailable };
  if (locale === ctx.locale && locale === r.locale) return { ok: true };
  await db.update(schema.consentRequests).set({ locale, updatedAt: new Date() }).where(eq(schema.consentRequests.id, r.id));
  await db.update(schema.patients).set({ preferredLocale: locale }).where(eq(schema.patients.id, ctx.patient.id));
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: "patient", type: "patient.language_changed", data: { from: ctx.locale, to: locale } });
  return { ok: true };
}

// ---------- information sheet ----------

export async function markSectionRead(token: string, sectionId: string, visibleMs: number): Promise<Result<{ allRead: boolean }>> {
  const ctx = await requirePatient(token);
  const r = ctx.request;
  if (r.status === "signed") return { ok: false, error: ctx.t.errAlreadySigned };
  if (!ctx.version.sections.some((s) => s.id === sectionId)) return { ok: false, error: ctx.t.errUnknownPart };
  const ms = Math.max(0, Math.min(Math.round(visibleMs), 60 * 60 * 1000));
  const now = new Date();
  await db
    .insert(schema.readingEvents)
    .values({ requestId: r.id, sectionId, visibleMs: ms, acknowledgedAt: now })
    .onConflictDoUpdate({
      target: [schema.readingEvents.requestId, schema.readingEvents.sectionId],
      set: { visibleMs: ms, acknowledgedAt: now },
    });
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: "patient", type: "patient.section_read", data: { sectionId, visibleMs: ms, locale: ctx.locale } });

  const read = await db.query.readingEvents.findMany({ where: eq(schema.readingEvents.requestId, r.id) });
  const allRead = ctx.version.sections.every((s) => read.some((e) => e.sectionId === s.id && e.acknowledgedAt));
  if (allRead) await setStatus(r, "info_read");
  return { ok: true, allRead };
}

/** The patient expanded the practitioner's full text for one section. Logged once. */
export async function markFullTextOpened(token: string, sectionId: string): Promise<Result> {
  const ctx = await requirePatient(token);
  const r = ctx.request;
  if (!ctx.version.sections.some((s) => s.id === sectionId)) return { ok: false, error: ctx.t.errUnknownPart };
  const existing = await db.query.readingEvents.findFirst({
    where: (t, { and }) => and(eq(t.requestId, r.id), eq(t.sectionId, sectionId)),
  });
  if (existing?.fullTextOpenedAt) return { ok: true };
  await db
    .insert(schema.readingEvents)
    .values({ requestId: r.id, sectionId, fullTextOpenedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.readingEvents.requestId, schema.readingEvents.sectionId],
      set: { fullTextOpenedAt: new Date() },
    });
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: "patient", type: "patient.full_text_opened", data: { sectionId, locale: ctx.locale } });
  return { ok: true };
}

// ---------- Pre-Check ----------

const answersSchema = z.object({
  items: z.record(
    z.string().max(64),
    z.object({ answer: z.enum(["oui", "non"]), detail: z.string().max(300).optional() }),
  ),
  emergencyContact: z
    .object({ name: z.string().max(120), phone: z.string().max(30), relation: z.string().max(60) })
    .optional(),
});

export async function submitPrecheck(token: string, input: PrecheckAnswers): Promise<Result<{ flagged: number }>> {
  const ctx = await requirePatient(token);
  const r = ctx.request;
  if (r.status === "signed") return { ok: false, error: ctx.t.errAlreadySigned };
  if (!atLeast(r.status, "info_read")) return { ok: false, error: ctx.t.errReadFirst };
  const parsed = answersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: ctx.t.errInvalidAnswers };
  const answers = parsed.data as PrecheckAnswers;
  const check = validateAnswers(ctx.version.questions, r.plannedAct, answers);
  if (!check.ok) return { ok: false, error: ctx.t.errAnswerAll };

  const flags = computeFlags(ctx.version.questions, r.plannedAct, answers);
  // Append, never overwrite: the earlier declaration and the practitioner's
  // review of it stay in the evidence; the old flags are only marked superseded.
  const { submission, changes } = await db.transaction(async (tx) => {
    // Serializes concurrent submissions of the same request.
    await tx.execute(sql`SELECT 1 FROM consent_requests WHERE id = ${r.id} FOR UPDATE`);
    const [{ last }] = await tx
      .select({ last: max(schema.precheckSubmissions.seq) })
      .from(schema.precheckSubmissions)
      .where(eq(schema.precheckSubmissions.requestId, r.id));
    const [submission] = await tx
      .insert(schema.precheckSubmissions)
      .values({ requestId: r.id, seq: (last ?? 0) + 1, answers })
      .returning();
    const active = await tx.query.precheckFlags.findMany({
      where: and(eq(schema.precheckFlags.requestId, r.id), isNull(schema.precheckFlags.supersededAt)),
    });
    const changes = reviewedFlagChanges(active, flags);
    if (active.length) {
      await tx
        .update(schema.precheckFlags)
        .set({ supersededAt: submission.submittedAt, supersededBySubmissionId: submission.id })
        .where(inArray(schema.precheckFlags.id, active.map((f) => f.id)));
    }
    // A reviewed answer the patient withdrew becomes a fresh alert to look at again.
    const raised = [...flags, ...changes.filter((c) => c.kind === "withdrawn").map(withdrawnAfterReviewFlag)];
    if (raised.length) {
      await tx.insert(schema.precheckFlags).values(raised.map((f) => ({ requestId: r.id, submissionId: submission.id, ...f })));
    }
    await tx.update(schema.consentRequests).set({ answers, updatedAt: new Date() }).where(eq(schema.consentRequests.id, r.id));
    return { submission, changes };
  });
  await setStatus(r, "precheck_done");
  await audit({
    practiceId: r.practiceId,
    requestId: r.id,
    actor: "patient",
    type: "patient.precheck_submitted",
    data: { submissionId: submission.id, seq: submission.seq, flags: flags.map((f) => f.questionId), locale: ctx.locale },
  });
  for (const c of changes) {
    await audit({
      practiceId: r.practiceId,
      requestId: r.id,
      actor: "patient",
      type: c.kind === "withdrawn" ? "flag.withdrawn_after_review" : "flag.changed_after_review",
      data: { questionId: c.questionId, submissionId: submission.id },
    });
  }
  return { ok: true, flagged: flags.length };
}

// ---------- consent + signature ----------

function decodePng(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[1], "base64");
  const isPng = buf.length > 100 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return isPng && buf.length < 400_000 ? buf : null;
}

export type ConsentStart =
  | { ok: true; mode: "otp"; demoCode?: string; sentTo: string }
  | { ok: true; mode: "redirect"; url: string }
  | { ok: false; error: string };

export async function submitConsent(token: string, input: { signaturePng: string; acknowledged: boolean }): Promise<ConsentStart> {
  const ctx = await requirePatient(token);
  const r = ctx.request;
  if (r.status === "signed") return { ok: false, error: ctx.t.errAlreadySigned };
  if (!atLeast(r.status, "precheck_done") || !r.answers) return { ok: false, error: ctx.t.errCompletePrecheck };
  if (!input.acknowledged) return { ok: false, error: ctx.t.errTickConsent };
  const png = decodePng(input.signaturePng);
  if (!png) return { ok: false, error: ctx.t.errSignatureUnreadable };
  if (r.signatureLevel === "AES" && !ctx.patient.phone) {
    return { ok: false, error: ctx.t.errAesNeedsMobile(ctx.practice.phone) };
  }

  const ackAt = new Date();
  const { bytes, box } = await buildConsentPdf({
    practiceName: ctx.practice.name,
    practitionerName: ctx.practice.practitionerName,
    practicePhone: ctx.practice.phone,
    templateTitle: ctx.content.title,
    templateSubtitle: ctx.content.subtitle,
    templateVersion: ctx.version.version,
    intro: ctx.content.intro,
    sections: ctx.content.sections,
    consent: ctx.content.consent,
    questions: ctx.content.questions,
    patient: ctx.patient,
    plannedAct: ctx.plannedAct,
    actKey: r.plannedAct,
    plannedLocation: r.plannedLocation,
    appointmentAt: ctx.appointment.scheduledAt,
    answers: r.answers,
    ackAt,
    signaturePng: png,
    requestId: r.id,
    locale: ctx.locale,
    translation: ctx.translation,
  });
  await db.insert(schema.documents).values({
    requestId: r.id,
    kind: "unsigned_consent",
    sha256: sha256(bytes),
    bytes: Buffer.from(bytes),
  });

  const provider = signatureProvider();
  const started = await provider.start({
    requestId: r.id,
    level: r.signatureLevel,
    title: `${ctx.version.title} - ${ctx.patient.lastName.toUpperCase()}`,
    signer: {
      firstName: ctx.patient.firstName,
      lastName: ctx.patient.lastName,
      email: ctx.patient.email,
      phone: ctx.patient.phone,
    },
    pdf: bytes,
    box,
    returnUrl: `${config().APP_URL.replace(/\/$/, "")}/p/${token}/retour`,
    locale: ctx.locale,
  });

  await db
    .update(schema.consentRequests)
    .set({
      patientAckAt: ackAt,
      // The language actually signed in (the requested one may have no approved translation).
      locale: ctx.locale,
      signatureImage: png,
      providerName: provider.name,
      providerRequestId: started.providerRequestId,
      providerSignerId: started.signerId,
      providerDocumentId: started.documentId,
      providerSigningUrl: started.mode === "redirect" ? started.signingUrl : null,
      status: started.mode === "redirect" ? "awaiting_provider" : "awaiting_otp",
      updatedAt: new Date(),
    })
    .where(eq(schema.consentRequests.id, r.id));
  await audit({
    practiceId: r.practiceId,
    requestId: r.id,
    actor: "patient",
    type: "patient.consent_given",
    data: { unsignedSha256: sha256(bytes), level: r.signatureLevel, provider: provider.name, locale: ctx.locale },
  });

  if (started.mode === "redirect") {
    await audit({ practiceId: r.practiceId, requestId: r.id, actor: "system", type: "signature.provider_started" });
    return { ok: true, mode: "redirect", url: started.signingUrl };
  }
  const fresh = { ...r, locale: ctx.locale, providerRequestId: started.providerRequestId, providerSignerId: started.signerId, providerDocumentId: started.documentId };
  const sent = await provider.sendOtp(providerRef(fresh, ctx.patient));
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: "provider", type: "signature.otp_sent" });
  return { ok: true, mode: "otp", demoCode: sent.demoCode, sentTo: sent.sentTo };
}

export async function resendOtp(token: string): Promise<Result<{ demoCode?: string }>> {
  const ctx = await requirePatient(token);
  const r = ctx.request;
  if (r.status !== "awaiting_otp") return { ok: false, error: ctx.t.errNoPendingCode };
  const sent = await providerByName(r.providerName).sendOtp(providerRef(r, ctx.patient));
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: "provider", type: "signature.otp_sent", data: { resend: true } });
  return { ok: true, demoCode: sent.demoCode };
}

export async function confirmOtp(token: string, otp: string): Promise<Result> {
  const ctx = await requirePatient(token);
  const r = ctx.request;
  if (r.status === "signed") return { ok: true };
  if (r.status !== "awaiting_otp") return { ok: false, error: ctx.t.errNoPendingSignature };
  const code = otp.replace(/\D/g, "");
  const { ip } = await requestMeta();
  const provider = providerByName(r.providerName);
  const res = await provider.signWithOtp(providerRef(r, ctx.patient), {
    otp: code,
    ip,
    // Consent to sign electronically is given when the patient confirms the code.
    // Yousign requires it after the request was activated, so it cannot be the
    // earlier checkbox time (kept separately in our evidence as patientAckAt).
    consentGivenAt: new Date(Date.now() - 1000),
    signaturePng: r.signatureImage ? new Uint8Array(r.signatureImage) : null,
    signerName: `${ctx.patient.firstName} ${ctx.patient.lastName}`,
    level: r.signatureLevel,
  });
  if (!res.ok) {
    await audit({ practiceId: r.practiceId, requestId: r.id, actor: "patient", type: "signature.otp_failed", data: { reason: res.reason } });
    const msg = { bad_otp: ctx.t.errOtpBad, expired: ctx.t.errCodeExpired, too_many_attempts: ctx.t.errOtpTooMany }[res.reason];
    return { ok: false, error: msg };
  }
  await db
    .update(schema.consentRequests)
    .set({ signedAt: new Date(), signerIp: ip, status: "awaiting_provider", updatedAt: new Date() })
    .where(eq(schema.consentRequests.id, r.id));
  // Yousign may need a few seconds; the webhook or the patient's page will finish it.
  await finalizeSigned(r.id, "patient");
  return { ok: true };
}
