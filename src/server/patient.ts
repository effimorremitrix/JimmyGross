import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasPatientSession } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { DEFAULT_LOCALE, LOCALES, localizeAct, localizeContent, resolveLocale } from "@/domain/i18n";
import { patientText } from "@/i18n/patient";
import { approvedTranslations } from "./locale";

export type PatientContext = NonNullable<Awaited<ReturnType<typeof loadByToken>>>;

/**
 * Resolves a patient link. Returns null when the token is unknown. Also resolves
 * the language: the request's, when its translation is approved, else French.
 */
export async function loadByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const request = await db.query.consentRequests.findFirst({
    where: eq(schema.consentRequests.tokenHash, sha256(token)),
  });
  if (!request) return null;
  const [practice, patient, appointment, version, translations] = await Promise.all([
    db.query.practices.findFirst({ where: eq(schema.practices.id, request.practiceId) }),
    db.query.patients.findFirst({ where: eq(schema.patients.id, request.patientId) }),
    db.query.appointments.findFirst({ where: eq(schema.appointments.id, request.appointmentId) }),
    db.query.templateVersions.findFirst({ where: eq(schema.templateVersions.id, request.templateVersionId) }),
    approvedTranslations(request.templateVersionId),
  ]);
  if (!practice || !patient || !appointment || !version) return null;
  const locale = resolveLocale(
    request.locale,
    translations.map((t) => t.locale),
  );
  const translation = translations.find((t) => t.locale === locale) ?? null;
  const approver = translation?.approvedById
    ? await db.query.users.findFirst({ where: eq(schema.users.id, translation.approvedById) })
    : null;
  return {
    request,
    practice,
    patient,
    appointment,
    version,
    locale,
    /** French plus every approved translation, in display order. */
    locales: LOCALES.filter((l) => l === DEFAULT_LOCALE || translations.some((t) => t.locale === l)),
    /** The template text in the patient's language (structure always from the French source). */
    content: localizeContent(version, translation?.content ?? null),
    plannedAct: localizeAct(request.plannedAct, translation?.content ?? null),
    translation: translation ? { approvedAt: translation.approvedAt!, approvedBy: approver?.name ?? "" } : null,
    t: patientText(locale),
  };
}

export type AccessState = "ok" | "expired" | "cancelled" | "locked" | "needs_identity";

export async function accessState(ctx: PatientContext): Promise<AccessState> {
  const r = ctx.request;
  if (r.status === "cancelled") return "cancelled";
  if (r.status !== "signed" && (r.status === "expired" || r.tokenExpiresAt < new Date())) return "expired";
  if (r.lockedAt) return "locked";
  if (!(await hasPatientSession(r.id))) return "needs_identity";
  return "ok";
}

/** Loads by token and enforces the birth-date session; for server actions. */
export async function requirePatient(token: string): Promise<PatientContext> {
  const ctx = await loadByToken(token);
  if (!ctx) throw new Error("Lien invalide");
  const state = await accessState(ctx);
  if (state !== "ok") throw new Error("Accès refusé");
  return ctx;
}
