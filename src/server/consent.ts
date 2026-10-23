import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit, type AuditActor } from "@/lib/audit";
import { config } from "@/lib/config";
import { newLinkToken, sha256 } from "@/lib/crypto";
import { providerByName } from "@/lib/signature";
import type { ProviderRef } from "@/lib/signature/types";
import { smsSender } from "@/lib/sms";
import { advance } from "@/domain/status";
import type { RequestStatus } from "@/domain/types";

export type ConsentRequest = typeof schema.consentRequests.$inferSelect;

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

/** Sends the link by SMS (no health data in the message). */
export async function sendLinkSms(params: {
  request: ConsentRequest;
  token: string;
  phone: string;
  practitionerName: string;
  appointmentAt: Date;
  actor: AuditActor;
}) {
  const date = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }).format(
    params.appointmentAt,
  );
  const body = `${params.practitionerName} : merci de compléter vos documents avant votre rendez-vous du ${date}. ${patientLink(params.token)}`;
  await smsSender().send(params.phone, body);
  await db
    .update(schema.consentRequests)
    .set({
      status: advance(params.request.status, "sent"),
      lastSentAt: new Date(),
      sendCount: params.request.sendCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(schema.consentRequests.id, params.request.id));
  await audit({
    practiceId: params.request.practiceId,
    requestId: params.request.id,
    actor: params.actor,
    type: "request.sent",
    data: { channel: "sms" },
  });
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

export function providerRef(r: ConsentRequest, phone: string): ProviderRef {
  return {
    requestId: r.id,
    providerRequestId: r.providerRequestId ?? "",
    signerId: r.providerSignerId ?? "",
    documentId: r.providerDocumentId ?? "",
    phone,
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
  const ref = providerRef(r, patient.phone);
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
