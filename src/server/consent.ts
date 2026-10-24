import "server-only";
import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit, type AuditActor } from "@/lib/audit";
import { config } from "@/lib/config";
import { newLinkToken, sha256 } from "@/lib/crypto";
import { emailSender, linkEmail, maskEmail } from "@/lib/email";
import { providerByName } from "@/lib/signature";
import type { ProviderRef } from "@/lib/signature/types";
import { maskPhone, smsSender } from "@/lib/sms";
import { effectiveLocale } from "./locale";
import { DEFAULT_LOCALE, isLocale, LOCALE_TAG } from "@/domain/i18n";
import { patientText } from "@/i18n/patient";
import { advance } from "@/domain/status";
import type { RequestStatus } from "@/domain/types";
export { pickChannel, sendTimeFor } from "@/domain/delivery";

export type ConsentRequest = typeof schema.consentRequests.$inferSelect;
export type Patient = typeof schema.patients.$inferSelect;
export type Channel = ConsentRequest["channel"];

export function patientLink(token: string): string {
  return `${config().APP_URL.replace(/\/$/, "")}/p/${token}`;
}

/** Issues a fresh link (the previous one stops working) and returns it. */
export async function rotateToken(requestId: string): Promise<string> {
  const token = newLinkToken();
  const ttl = config().LINK_TTL_DAYS * 24 * 3600 * 1000;
  await db
    .update(schema.consentRequests)
    .set({
      tokenHash: sha256(token),
      tokenExpiresAt: new Date(Date.now() + ttl),
      failedDobAttempts: 0,
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.consentRequests.id, requestId));
  return token;
}

/** Where the link goes, masked for display ("SMS 06 •• •• •• 12 + e-mail m•••@x.fr"). */
export function deliveryLabel(channel: Channel, patient: Pick<Patient, "phone" | "email">): string {
  const parts: string[] = [];
  if ((channel === "sms" || channel === "sms_email") && patient.phone) parts.push(`SMS ${maskPhone(patient.phone)}`);
  if ((channel === "email" || channel === "sms_email") && patient.email) parts.push(`e-mail ${maskEmail(patient.email)}`);
  return parts.join(" + ") || "lien manuel";
}

/**
 * Sends the link on the request's channel(s), in the request's language when its
 * translation is approved (French otherwise). Messages carry no health data:
 * practitioner name, appointment date, link.
 */
export async function deliverLink(params: {
  request: ConsentRequest;
  token: string;
  patient: Patient;
  practice: typeof schema.practices.$inferSelect;
  appointmentAt: Date;
  actor: AuditActor;
}) {
  const { request: r, patient, practice } = params;
  const link = patientLink(params.token);
  const { locale } = await effectiveLocale(r.templateVersionId, r.locale);
  const t = patientText(locale);
  const dateLabel = new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }).format(
    params.appointmentAt,
  );
  const sent: string[] = [];
  if ((r.channel === "sms" || r.channel === "sms_email") && patient.phone) {
    await smsSender().send(patient.phone, t.linkSms(practice.practitionerName, dateLabel, link));
    sent.push("sms");
  }
  if ((r.channel === "email" || r.channel === "sms_email") && patient.email) {
    const m = linkEmail({ practitioner: practice.practitionerName, dateLabel, link, practicePhone: practice.phone, locale });
    await emailSender().send(patient.email, m.subject, m.text, m.html);
    sent.push("email");
  }
  if (!sent.length) throw new Error("Aucun moyen de contact pour ce patient.");
  await db
    .update(schema.consentRequests)
    .set({
      status: advance(r.status, "sent"),
      lastSentAt: new Date(),
      scheduledSendAt: null,
      sendCount: r.sendCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(schema.consentRequests.id, r.id));
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: params.actor, type: "request.sent", data: { channels: sent, locale }, withRequestMeta: params.actor !== "system" });
}

/** Rotates the token and sends: used by reminders, immediate sends and the scheduler. */
export async function sendNow(requestId: string, actor: AuditActor) {
  const r = await db.query.consentRequests.findFirst({ where: eq(schema.consentRequests.id, requestId) });
  if (!r) throw new Error("Demande introuvable");
  const [patient, appt, practice] = await Promise.all([
    db.query.patients.findFirst({ where: eq(schema.patients.id, r.patientId) }),
    db.query.appointments.findFirst({ where: eq(schema.appointments.id, r.appointmentId) }),
    db.query.practices.findFirst({ where: eq(schema.practices.id, r.practiceId) }),
  ]);
  if (!patient || !appt || !practice) throw new Error("Données manquantes");
  const token = await rotateToken(r.id);
  await deliverLink({ request: r, token, patient, practice, appointmentAt: appt.scheduledAt, actor });
}

/** Sends every link whose scheduled time has come. Returns counts; errors don't stop the batch. */
export async function sendDue(now = new Date()): Promise<{ sent: number; failed: number }> {
  const due = await db
    .select({ id: schema.consentRequests.id })
    .from(schema.consentRequests)
    .where(
      and(
        isNotNull(schema.consentRequests.scheduledSendAt),
        lte(schema.consentRequests.scheduledSendAt, now),
        eq(schema.consentRequests.status, "created"),
      ),
    )
    .limit(500);
  let sent = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      await sendNow(id, "system");
      sent++;
    } catch (e) {
      failed++;
      console.error(`[send-due] ${id}`, e);
    }
  }
  return { sent, failed };
}

export async function setStatus(r: ConsentRequest, next: RequestStatus) {
  const status = advance(r.status, next);
  if (status !== r.status) {
    await db
      .update(schema.consentRequests)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.consentRequests.id, r.id));
  }
  return status;
}

export function providerRef(r: ConsentRequest, patient: Pick<Patient, "phone" | "email">): ProviderRef {
  return {
    requestId: r.id,
    providerRequestId: r.providerRequestId ?? "",
    signerId: r.providerSignerId ?? "",
    documentId: r.providerDocumentId ?? "",
    phone: patient.phone,
    email: patient.email,
    locale: isLocale(r.locale) ? r.locale : DEFAULT_LOCALE,
  };
}

/**
 * Pulls the signed PDF (and audit trail) from the provider, stores it with its
 * hash, and marks the request signed. Idempotent: safe from webhook and return.
 */
export async function finalizeSigned(requestId: string, actor: AuditActor): Promise<boolean> {
  const r = await db.query.consentRequests.findFirst({ where: eq(schema.consentRequests.id, requestId) });
  if (!r) return false;
  const existing = await db.query.documents.findFirst({
    where: and(eq(schema.documents.requestId, r.id), eq(schema.documents.kind, "signed_consent")),
  });
  if (existing && r.status === "signed") return true;

  const patient = await db.query.patients.findFirst({ where: eq(schema.patients.id, r.patientId) });
  if (!patient) return false;
  const provider = providerByName(r.providerName);
  const ref = providerRef(r, patient);
  if (provider.name !== "mock" && !(await provider.isDone(ref))) return false;

  const signedAt = r.signedAt ?? new Date();
  if (!r.signedAt) {
    await db.update(schema.consentRequests).set({ signedAt }).where(eq(schema.consentRequests.id, r.id));
  }
  const out = await provider.fetchSigned(ref);
  await db.insert(schema.documents).values({
    requestId: r.id,
    kind: "signed_consent",
    sha256: sha256(out.signedPdf),
    bytes: Buffer.from(out.signedPdf),
  });
  if (out.auditTrailPdf) {
    await db.insert(schema.documents).values({
      requestId: r.id,
      kind: "provider_audit_trail",
      sha256: sha256(out.auditTrailPdf),
      bytes: Buffer.from(out.auditTrailPdf),
    });
  }
  await db
    .update(schema.consentRequests)
    .set({ status: "signed", signedAt, updatedAt: new Date() })
    .where(eq(schema.consentRequests.id, r.id));
  await audit({
    practiceId: r.practiceId,
    requestId: r.id,
    actor,
    type: "signature.signed",
    data: { provider: provider.name, level: r.signatureLevel, sha256: sha256(out.signedPdf) },
    withRequestMeta: actor === "patient",
  });
  return true;
}

export async function latestDocument(requestId: string, kind: "unsigned_consent" | "signed_consent" | "provider_audit_trail") {
  return db.query.documents.findFirst({
    where: and(eq(schema.documents.requestId, requestId), eq(schema.documents.kind, kind)),
    orderBy: desc(schema.documents.createdAt),
  });
}
