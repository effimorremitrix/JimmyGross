"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth";
import { parisToUtc } from "@/lib/dates";
import { isTerminal } from "@/domain/status";
import { deliveryLabel, patientLink, rotateToken, sendNow } from "@/server/consent";
import { createConsentRequest, upsertPatient } from "@/server/requests";

const phoneRe = /^(\+33|0)[1-9](\s?\d{2}){4}$|^\+\d{8,15}$/;

const createSchema = z
  .object({
    firstName: z.string().trim().min(1, "Prénom requis").max(80),
    lastName: z.string().trim().min(1, "Nom requis").max(80),
    birthDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de naissance invalide")]),
    phone: z.union([z.literal(""), z.string().trim().regex(phoneRe, "Numéro de téléphone invalide")]),
    email: z.union([z.literal(""), z.string().trim().email("E-mail invalide")]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date du rendez-vous invalide"),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide"),
    visitReasonId: z.string().uuid("Choisissez un motif"),
    location: z.string().trim().max(120),
    channel: z.enum(["sms", "email", "sms_email", "manual_link"]),
  })
  .superRefine((v, ctx) => {
    if (v.channel.startsWith("sms") && !v.phone) ctx.addIssue({ code: "custom", path: ["phone"], message: "Mobile requis pour l'envoi par SMS" });
    if ((v.channel === "email" || v.channel === "sms_email") && !v.email) ctx.addIssue({ code: "custom", path: ["email"], message: "E-mail requis pour l'envoi par e-mail" });
    if (v.channel === "manual_link" && !v.phone && !v.email && !v.birthDate) {
      ctx.addIssue({ code: "custom", path: ["birthDate"], message: "Date de naissance, mobile ou e-mail requis pour vérifier l'identité" });
    }
  });

export type CreateState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  link?: string;
  requestId?: string;
  sentTo?: string;
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
  const practice = await db.query.practices.findFirst({ where: eq(schema.practices.id, staff.practiceId) });
  if (!practice) return { error: "Cabinet introuvable." };

  const patient = await upsertPatient(staff.practiceId, {
    firstName: v.firstName,
    lastName: v.lastName,
    birthDate: v.birthDate || null,
    phone: v.phone || null,
    email: v.email || null,
  });
  try {
    const { request, token } = await createConsentRequest({
      practice,
      actor: `user:${staff.userId}`,
      userId: staff.userId,
      patient,
      scheduledAt: parisToUtc(v.date, v.time),
      reason,
      location: v.location,
      channel: v.channel,
      sendMode: v.channel === "manual_link" ? "none" : "now",
    });
    revalidatePath("/cabinet");
    return {
      link: patientLink(token),
      requestId: request.id,
      sentTo: v.channel === "manual_link" ? undefined : deliveryLabel(v.channel, patient),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

async function ownedRequest(practiceId: string, id: string) {
  return db.query.consentRequests.findFirst({
    where: and(eq(schema.consentRequests.id, id), eq(schema.consentRequests.practiceId, practiceId)),
  });
}

/** New link + reminder on the request's channel (SMS when manual). The previous link stops working. */
export async function remind(requestId: string): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const r = await ownedRequest(staff.practiceId, requestId);
  if (!r || isTerminal(r.status)) return { ok: false, error: "Relance impossible." };
  if (r.channel === "manual_link") {
    const patient = await db.query.patients.findFirst({ where: eq(schema.patients.id, r.patientId) });
    const channel = patient?.phone ? "sms" : patient?.email ? "email" : null;
    if (!channel) return { ok: false, error: "Ni mobile ni e-mail : copiez un lien." };
    await db.update(schema.consentRequests).set({ channel }).where(eq(schema.consentRequests.id, r.id));
  }
  try {
    await sendNow(r.id, `user:${staff.userId}`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Envoi impossible." };
  }
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

/** The practitioner approves the patient-facing summaries of a template version. */
export async function approveSummaries(versionId: string): Promise<void> {
  const staff = await requireStaff();
  if (staff.role !== "practitioner") return;
  const v = await db.query.templateVersions.findFirst({ where: eq(schema.templateVersions.id, versionId) });
  if (!v) return;
  const t = await db.query.templates.findFirst({ where: and(eq(schema.templates.id, v.templateId), eq(schema.templates.practiceId, staff.practiceId)) });
  if (!t) return;
  await db
    .update(schema.templateVersions)
    .set({ summariesApprovedAt: new Date(), summariesApprovedById: staff.userId })
    .where(eq(schema.templateVersions.id, v.id));
  await audit({ practiceId: staff.practiceId, actor: `user:${staff.userId}`, type: "template.summaries_approved", data: { versionId: v.id, version: v.version } });
  revalidatePath("/cabinet/modeles");
}
