import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit, type AuditActor } from "@/lib/audit";
import { deliverLink, rotateToken, sendTimeFor, type Channel, type ConsentRequest } from "./consent";

export interface PatientInput {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
}

type VisitReason = typeof schema.visitReasons.$inferSelect;
type Practice = typeof schema.practices.$inferSelect;

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Finds the practice's patient (same name and same birth date, or same phone/e-mail
 * when the birth date is unknown) or creates one; fills in missing contact details.
 */
export async function upsertPatient(practiceId: string, p: PatientInput) {
  const candidates = await db.query.patients.findMany({
    where: and(eq(schema.patients.practiceId, practiceId), eq(schema.patients.lastName, p.lastName), eq(schema.patients.firstName, p.firstName)),
  });
  const digits = (x: string | null) => (x ?? "").replace(/\D/g, "").slice(-9);
  const match = candidates.find((c) =>
    p.birthDate && c.birthDate
      ? c.birthDate === p.birthDate
      : (!!p.phone && digits(c.phone) === digits(p.phone)) || (!!p.email && !!c.email && norm(c.email) === norm(p.email)),
  );
  if (!match) {
    const [created] = await db.insert(schema.patients).values({ practiceId, ...p }).returning();
    return created;
  }
  const patch: Partial<PatientInput> = {};
  if (p.phone && digits(match.phone) !== digits(p.phone)) patch.phone = p.phone;
  if (p.email && match.email !== p.email) patch.email = p.email;
  if (p.birthDate && !match.birthDate) patch.birthDate = p.birthDate;
  if (!Object.keys(patch).length) return match;
  const [updated] = await db.update(schema.patients).set(patch).where(eq(schema.patients.id, match.id)).returning();
  return updated;
}

/** An open (not cancelled) request already exists for this patient at this exact time. */
export async function findOpenRequestAt(practiceId: string, patientId: string, scheduledAt: Date): Promise<ConsentRequest | null> {
  const appts = await db.query.appointments.findMany({
    where: and(eq(schema.appointments.practiceId, practiceId), eq(schema.appointments.patientId, patientId), eq(schema.appointments.scheduledAt, scheduledAt)),
  });
  for (const a of appts) {
    const r = await db.query.consentRequests.findFirst({ where: eq(schema.consentRequests.appointmentId, a.id) });
    if (r && r.status !== "cancelled") return r;
  }
  return null;
}

export type SendMode = "now" | "scheduled" | "none";

/**
 * Creates appointment + consent request from a Doctolib visit reason, then sends
 * now, schedules the send at the practice's lead time, or leaves it for a manual link.
 */
export async function createConsentRequest(p: {
  practice: Practice;
  actor: AuditActor;
  userId: string | null;
  patient: typeof schema.patients.$inferSelect;
  scheduledAt: Date;
  reason: VisitReason;
  location: string;
  channel: Channel;
  sendMode: SendMode;
  source?: "manual" | "import";
  importBatchId?: string | null;
}): Promise<{ request: ConsentRequest; token: string; sendAt: Date | null; sent: boolean }> {
  const version = await db.query.templateVersions.findFirst({
    where: eq(schema.templateVersions.templateId, p.reason.templateId),
    orderBy: desc(schema.templateVersions.version),
  });
  if (!version) throw new Error("Aucun modèle publié pour ce motif.");

  const [appointment] = await db
    .insert(schema.appointments)
    .values({ practiceId: p.practice.id, patientId: p.patient.id, scheduledAt: p.scheduledAt, visitReasonLabel: p.reason.label, source: p.source ?? "manual" })
    .returning();
  const sendAt = p.sendMode === "scheduled" ? sendTimeFor(p.scheduledAt, p.practice.sendLeadHours) : null;
  const [request] = await db
    .insert(schema.consentRequests)
    .values({
      practiceId: p.practice.id,
      appointmentId: appointment.id,
      patientId: p.patient.id,
      templateVersionId: version.id,
      channel: p.channel,
      signatureLevel: p.reason.signatureLevelOverride ?? version.signatureLevel,
      plannedAct: p.reason.defaultAct,
      plannedLocation: p.location,
      tokenHash: `pending-${crypto.randomUUID()}`,
      tokenExpiresAt: new Date(),
      scheduledSendAt: sendAt,
      importBatchId: p.importBatchId ?? null,
      createdById: p.userId,
    })
    .returning();
  await audit({ practiceId: p.practice.id, requestId: request.id, actor: p.actor, type: p.source === "import" ? "request.imported" : "request.created" });

  const token = await rotateToken(request.id);
  const due = p.sendMode === "now" || (sendAt !== null && sendAt.getTime() <= Date.now() + 60_000);
  if (due && p.channel !== "manual_link") {
    await deliverLink({ request, token, patient: p.patient, practice: p.practice, appointmentAt: p.scheduledAt, actor: p.actor });
    return { request, token, sendAt: null, sent: true };
  }
  if (sendAt) {
    await audit({ practiceId: p.practice.id, requestId: request.id, actor: p.actor, type: "request.scheduled", data: { sendAt: sendAt.toISOString() }, withRequestMeta: false });
  }
  return { request, token, sendAt, sent: false };
}

