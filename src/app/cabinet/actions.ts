"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth";
import { parisToUtc } from "@/lib/dates";
import { isTerminal } from "@/domain/status";
import { patientLink, rotateToken, sendLinkSms } from "@/server/consent";

const createSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(80),
  lastName: z.string().trim().min(1, "Nom requis").max(80),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de naissance invalide"),
  phone: z
    .string()
    .trim()
    .regex(/^(\+33|0)[1-9](\s?\d{2}){4}$|^\+\d{8,15}$/, "Numéro de téléphone invalide"),
  email: z.union([z.literal(""), z.string().trim().email("E-mail invalide")]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date du rendez-vous invalide"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide"),
  visitReasonId: z.string().uuid("Choisissez un motif"),
  location: z.string().trim().max(120),
  channel: z.enum(["sms", "manual_link"]),
});

export type CreateState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  link?: string;
  requestId?: string;
  sms?: boolean;
};

export async function createRequest(_: CreateState | undefined, form: FormData): Promise<CreateState> {
  const staff = await requireStaff();
  const parsed = createSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    const values = Object.fromEntries([...form.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")) as [string, string][]);
    return { error: "Merci de corriger les champs indiqués.", fieldErrors, values };
  }
  const v = parsed.data;
  const reason = await db.query.visitReasons.findFirst({
    where: and(eq(schema.visitReasons.id, v.visitReasonId), eq(schema.visitReasons.practiceId, staff.practiceId)),
  });
  if (!reason) return { error: "Motif inconnu." };
  const version = await db.query.templateVersions.findFirst({
    where: eq(schema.templateVersions.templateId, reason.templateId),
    orderBy: desc(schema.templateVersions.version),
  });
  if (!version) return { error: "Aucun modèle publié pour ce motif." };
  const practice = await db.query.practices.findFirst({ where: eq(schema.practices.id, staff.practiceId) });
  if (!practice) return { error: "Cabinet introuvable." };

  const existing = await db.query.patients.findFirst({
    where: and(
      eq(schema.patients.practiceId, staff.practiceId),
      eq(schema.patients.lastName, v.lastName),
      eq(schema.patients.firstName, v.firstName),
      eq(schema.patients.birthDate, v.birthDate),
    ),
  });
  const patient =
    existing ??
    (
      await db
        .insert(schema.patients)
        .values({ practiceId: staff.practiceId, firstName: v.firstName, lastName: v.lastName, birthDate: v.birthDate, phone: v.phone, email: v.email || null })
        .returning()
    )[0];
  if (existing && (existing.phone !== v.phone || (v.email && existing.email !== v.email))) {
    await db.update(schema.patients).set({ phone: v.phone, email: v.email || existing.email }).where(eq(schema.patients.id, existing.id));
  }

  const scheduledAt = parisToUtc(v.date, v.time);
  const [appointment] = await db
    .insert(schema.appointments)
    .values({ practiceId: staff.practiceId, patientId: patient.id, scheduledAt, visitReasonLabel: reason.label })
    .returning();
  const [request] = await db
    .insert(schema.consentRequests)
    .values({
      practiceId: staff.practiceId,
      appointmentId: appointment.id,
      patientId: patient.id,
      templateVersionId: version.id,
      channel: v.channel,
      signatureLevel: reason.signatureLevelOverride ?? version.signatureLevel,
      plannedAct: reason.defaultAct,
      plannedLocation: v.location,
      tokenHash: `pending-${crypto.randomUUID()}`,
      tokenExpiresAt: new Date(),
      createdById: staff.userId,
    })
    .returning();
  await audit({ practiceId: staff.practiceId, requestId: request.id, actor: `user:${staff.userId}`, type: "request.created" });

  const token = await rotateToken(request.id);
  if (v.channel === "sms") {
    await sendLinkSms({
      request,
      token,
      phone: v.phone,
      practitionerName: practice.practitionerName,
      appointmentAt: scheduledAt,
      actor: `user:${staff.userId}`,
    });
  }
  revalidatePath("/cabinet");
  return { link: patientLink(token), requestId: request.id, sms: v.channel === "sms" };
}

async function ownedRequest(practiceId: string, id: string) {
  return db.query.consentRequests.findFirst({
    where: and(eq(schema.consentRequests.id, id), eq(schema.consentRequests.practiceId, practiceId)),
  });
}

/** New link + SMS reminder. The previous link stops working. */
export async function remind(requestId: string): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const r = await ownedRequest(staff.practiceId, requestId);
  if (!r || isTerminal(r.status)) return { ok: false, error: "Relance impossible." };
  const [patient, appt, practice] = await Promise.all([
    db.query.patients.findFirst({ where: eq(schema.patients.id, r.patientId) }),
    db.query.appointments.findFirst({ where: eq(schema.appointments.id, r.appointmentId) }),
    db.query.practices.findFirst({ where: eq(schema.practices.id, r.practiceId) }),
  ]);
  if (!patient || !appt || !practice) return { ok: false, error: "Données manquantes." };
  const token = await rotateToken(r.id);
  await sendLinkSms({ request: r, token, phone: patient.phone, practitionerName: practice.practitionerName, appointmentAt: appt.scheduledAt, actor: `user:${staff.userId}` });
  revalidatePath("/cabinet");
  return { ok: true };
}

/** New link to paste into the Doctolib message (manual mode). */
export async function newLink(requestId: string): Promise<{ ok: boolean; link?: string; error?: string }> {
  const staff = await requireStaff();
  const r = await ownedRequest(staff.practiceId, requestId);
  if (!r || isTerminal(r.status)) return { ok: false, error: "Lien impossible pour cette demande." };
  const token = await rotateToken(r.id);
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: `user:${staff.userId}`, type: "request.link_rotated" });
  return { ok: true, link: patientLink(token) };
}

export async function reviewFlag(flagId: string): Promise<void> {
  const staff = await requireStaff();
  const flag = await db.query.precheckFlags.findFirst({ where: eq(schema.precheckFlags.id, flagId) });
  if (!flag) return;
  const r = await ownedRequest(staff.practiceId, flag.requestId);
  if (!r) return;
  const reviewed = !flag.reviewedAt;
  await db
    .update(schema.precheckFlags)
    .set({ reviewedAt: reviewed ? new Date() : null, reviewedById: reviewed ? staff.userId : null })
    .where(eq(schema.precheckFlags.id, flag.id));
  if (reviewed) {
    await audit({ practiceId: r.practiceId, requestId: r.id, actor: `user:${staff.userId}`, type: "flag.reviewed", data: { questionId: flag.questionId } });
  }
  revalidatePath("/cabinet");
  revalidatePath(`/cabinet/demandes/${r.id}`);
}

const confirmSchema = z.object({ act: z.string().trim().min(1).max(120), location: z.string().trim().max(120) });

export async function confirmAct(requestId: string, _: unknown, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const staff = await requireStaff();
  if (staff.role !== "practitioner") return { error: "Seul le médecin peut confirmer le geste." };
  const r = await ownedRequest(staff.practiceId, requestId);
  if (!r || r.status !== "signed") return { error: "Le consentement doit d'abord être signé." };
  const parsed = confirmSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Geste requis." };
  await db
    .update(schema.consentRequests)
    .set({ confirmedAct: parsed.data.act, confirmedLocation: parsed.data.location, confirmedById: staff.userId, confirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.consentRequests.id, r.id));
  await audit({
    practiceId: r.practiceId,
    requestId: r.id,
    actor: `user:${staff.userId}`,
    type: "act.confirmed",
    data: { act: parsed.data.act, location: parsed.data.location, matchesConsent: parsed.data.act === r.plannedAct },
  });
  revalidatePath(`/cabinet/demandes/${r.id}`);
  return { ok: true };
}

export async function cancelRequest(requestId: string): Promise<void> {
  const staff = await requireStaff();
  const r = await ownedRequest(staff.practiceId, requestId);
  if (!r || isTerminal(r.status)) return;
  await db.update(schema.consentRequests).set({ status: "cancelled", updatedAt: new Date() }).where(eq(schema.consentRequests.id, r.id));
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: `user:${staff.userId}`, type: "request.cancelled" });
  revalidatePath("/cabinet");
  revalidatePath(`/cabinet/demandes/${r.id}`);
}

/** Bulk: mark every open alert of a request as reviewed. */
export async function reviewAllFlags(requestId: string): Promise<void> {
  const staff = await requireStaff();
  const r = await ownedRequest(staff.practiceId, requestId);
  if (!r) return;
  const open = await db.query.precheckFlags.findMany({ where: eq(schema.precheckFlags.requestId, r.id) });
  const ids = open.filter((f) => !f.reviewedAt).map((f) => f.id);
  if (!ids.length) return;
  await db.update(schema.precheckFlags).set({ reviewedAt: new Date(), reviewedById: staff.userId }).where(inArray(schema.precheckFlags.id, ids));
  await audit({ practiceId: r.practiceId, requestId: r.id, actor: `user:${staff.userId}`, type: "flag.reviewed", data: { count: ids.length } });
  revalidatePath("/cabinet");
}
