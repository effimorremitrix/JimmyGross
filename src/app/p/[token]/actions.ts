"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { startPatientSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { sha256 } from "@/lib/crypto";
import { buildConsentPdf } from "@/lib/pdf";
import { requestMeta } from "@/lib/request-meta";
import { providerByName, signatureProvider } from "@/lib/signature";
import { computeFlags, validateAnswers } from "@/domain/precheck";
import { atLeast } from "@/domain/status";
import type { PrecheckAnswers } from "@/domain/types";
import { finalizeSigned, providerRef, setStatus } from "@/server/consent";
import { accessState, loadByToken, requirePatient } from "@/server/patient";

const MAX_DOB_ATTEMPTS = 5;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ---------- identity gate ----------

export async function verifyBirthDate(token: string, birthDate: string): Promise<Result<{ remaining?: number }>> {
  const ctx = await loadByToken(token);
  if (!ctx) return { ok: false, error: "Ce lien n'est pas valide." };
  const state = await accessState(ctx);
  if (state === "locked") return { ok: false, error: "Accès bloqué. Contactez le cabinet pour recevoir un nouveau lien." };
  if (state === "expired" || state === "cancelled") return { ok: false, error: "Ce lien n'est plus valide." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { ok: false, error: "Date de naissance incomplète." };

  const r = ctx.request;
  if (birthDate !== ctx.patient.birthDate) {
    const attempts = r.failedDobAttempts + 1;
    const locked = attempts >= MAX_DOB_ATTEMPTS;
    await db
      .update(schema.consentRequests)
      .set({ failedDobAttempts: attempts, lockedAt: locked ? new Date() : null })
      .where(eq(schema.consentRequests.id, r.id));
    await audit({ practiceId: r.practiceId, requestId: r.id, actor: "patient", type: locked ? "patient.locked" : "patient.identity_failed" });
    return locked
      ? { ok: false, error: "Trop d'essais. L'accès est bloqué : contactez le cabinet." }
      : { ok: false, error: `Date de naissance incorrecte. Il vous reste ${MAX_DOB_ATTEMPTS - attempts} essai(s).` };
  }

  await db.update(schema.consentRequests).set({ failedDobAttempts: 0 }).where(eq(schema.consentRequests.id, r.id));
  await startPatientSession(r.id);
  await setStatus(r, "opened");
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: "patient", type: "patient.identity_ok" });
  return { ok: true };
}

// ---------- information sheet ----------

export async function markSectionRead(token: string, sectionId: string, visibleMs: number): Promise<Result<{ allRead: boolean }>> {
  const ctx = await requirePatient(token);
  const r = ctx.request;
  if (r.status === "signed") return { ok: false, error: "Document déjà signé." };
  const section = ctx.version.sections.find((s) => s.id === sectionId);
  if (!section) return { ok: false, error: "Partie inconnue." };
  const ms = Math.max(0, Math.min(Math.round(visibleMs), 60 * 60 * 1000));

  await db
    .insert(schema.readingEvents)
    .values({ requestId: r.id, sectionId, visibleMs: ms, acknowledgedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.readingEvents.requestId, schema.readingEvents.sectionId],
      set: { visibleMs: ms, acknowledgedAt: new Date() },
    });
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: "patient", type: "patient.section_read", data: { sectionId, visibleMs: ms } });

  const read = await db.query.readingEvents.findMany({ where: eq(schema.readingEvents.requestId, r.id) });
  const allRead = ctx.version.sections.every((s) => read.some((e) => e.sectionId === s.id));
  if (allRead) await setStatus(r, "info_read");
  return { ok: true, allRead };
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
  if (r.status === "signed") return { ok: false, error: "Document déjà signé." };
  if (!atLeast(r.status, "info_read")) return { ok: false, error: "Merci de lire d'abord la fiche d'information." };
  const parsed = answersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Réponses invalides." };
  const answers = parsed.data as PrecheckAnswers;
  const check = validateAnswers(ctx.version.questions, r.plannedAct, answers);
  if (!check.ok) return { ok: false, error: "Merci de répondre à toutes les questions." };

  const flags = computeFlags(ctx.version.questions, r.plannedAct, answers);
  await db.transaction(async (tx) => {
    await tx.update(schema.consentRequests).set({ answers, updatedAt: new Date() }).where(eq(schema.consentRequests.id, r.id));
    await tx.delete(schema.precheckFlags).where(eq(schema.precheckFlags.requestId, r.id));
    if (flags.length) {
      await tx.insert(schema.precheckFlags).values(flags.map((f) => ({ requestId: r.id, ...f })));
    }
  });
  await setStatus(r, "precheck_done");
  await audit({
    practiceId: r.practiceId,
    requestId: r.id,
    actor: "patient",
    type: "patient.precheck_submitted",
    data: { flags: flags.map((f) => f.questionId) },
  });
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
  | { ok: true; mode: "otp"; demoCode?: string; phoneMasked: string }
  | { ok: true; mode: "redirect"; url: string }
  | { ok: false; error: string };

export async function submitConsent(token: string, input: { signaturePng: string; acknowledged: boolean }): Promise<ConsentStart> {
  const ctx = await requirePatient(token);
  const r = ctx.request;
  if (r.status === "signed") return { ok: false, error: "Document déjà signé." };
  if (!atLeast(r.status, "precheck_done") || !r.answers) return { ok: false, error: "Merci de compléter le questionnaire." };
  if (!input.acknowledged) return { ok: false, error: "Merci de cocher la déclaration de consentement." };
  const png = decodePng(input.signaturePng);
  if (!png) return { ok: false, error: "Signature manquante ou illisible. Merci de signer à nouveau." };

  const ackAt = new Date();
  const { bytes, box } = await buildConsentPdf({
    practiceName: ctx.practice.name,
    practitionerName: ctx.practice.practitionerName,
    practicePhone: ctx.practice.phone,
    templateTitle: ctx.version.title,
    templateSubtitle: ctx.version.subtitle,
    templateVersion: ctx.version.version,
    intro: ctx.version.intro,
    sections: ctx.version.sections,
    consent: ctx.version.consent,
    questions: ctx.version.questions,
    patient: ctx.patient,
    plannedAct: r.plannedAct,
    plannedLocation: r.plannedLocation,
    appointmentAt: ctx.appointment.scheduledAt,
    answers: r.answers,
    ackAt,
    signaturePng: png,
    requestId: r.id,
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
  });

  await db
    .update(schema.consentRequests)
    .set({
      patientAckAt: ackAt,
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
    data: { unsignedSha256: sha256(bytes), level: r.signatureLevel, provider: provider.name },
  });

  if (started.mode === "redirect") {
    await audit({ practiceId: r.practiceId, requestId: r.id, actor: "system", type: "signature.provider_started" });
    return { ok: true, mode: "redirect", url: started.signingUrl };
  }
  const fresh = { ...r, providerRequestId: started.providerRequestId, providerSignerId: started.signerId, providerDocumentId: started.documentId };
  const sent = await provider.sendOtp(providerRef(fresh, ctx.patient.phone));
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: "provider", type: "signature.otp_sent" });
  return { ok: true, mode: "otp", demoCode: sent.demoCode, phoneMasked: maskedPhone(ctx.patient.phone) };
}

export async function resendOtp(token: string): Promise<Result<{ demoCode?: string }>> {
  const ctx = await requirePatient(token);
  const r = ctx.request;
  if (r.status !== "awaiting_otp") return { ok: false, error: "Aucun code en attente." };
  const sent = await providerByName(r.providerName).sendOtp(providerRef(r, ctx.patient.phone));
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: "provider", type: "signature.otp_sent", data: { resend: true } });
  return { ok: true, demoCode: sent.demoCode };
}

export async function confirmOtp(token: string, otp: string): Promise<Result> {
  const ctx = await requirePatient(token);
  const r = ctx.request;
  if (r.status === "signed") return { ok: true };
  if (r.status !== "awaiting_otp") return { ok: false, error: "Aucune signature en attente." };
  const code = otp.replace(/\D/g, "");
  const { ip } = await requestMeta();
  const provider = providerByName(r.providerName);
  const res = await provider.signWithOtp(providerRef(r, ctx.patient.phone), {
    otp: code,
    ip,
    consentGivenAt: r.patientAckAt ?? new Date(),
    signaturePng: r.signatureImage ? new Uint8Array(r.signatureImage) : null,
    signerName: `${ctx.patient.firstName} ${ctx.patient.lastName}`,
    level: r.signatureLevel,
  });
  if (!res.ok) {
    await audit({ practiceId: r.practiceId, requestId: r.id, actor: "patient", type: "signature.otp_failed", data: { reason: res.reason } });
    const msg = {
      bad_otp: "Code incorrect. Vérifiez le SMS et réessayez.",
      expired: "Ce code a expiré. Demandez un nouveau code.",
      too_many_attempts: "Trop d'essais. Demandez un nouveau code.",
    }[res.reason];
    return { ok: false, error: msg };
  }
  await db
    .update(schema.consentRequests)
    .set({ signedAt: new Date(), signerIp: ip, status: "awaiting_provider", updatedAt: new Date() })
    .where(and(eq(schema.consentRequests.id, r.id)));
  // Yousign may need a few seconds; the webhook or the patient's page will finish it.
  await finalizeSigned(r.id, "patient");
  return { ok: true };
}

function maskedPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `${d.slice(0, 2)} •• •• •• ${d.slice(-2)}`;
}
