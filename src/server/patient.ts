import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasPatientSession } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";

export type PatientContext = NonNullable<Awaited<ReturnType<typeof loadByToken>>>;

/** Resolves a patient link. Returns null when the token is unknown. */
export async function loadByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const request = await db.query.consentRequests.findFirst({
    where: eq(schema.consentRequests.tokenHash, sha256(token)),
  });
  if (!request) return null;
  const [practice, patient, appointment, version] = await Promise.all([
    db.query.practices.findFirst({ where: eq(schema.practices.id, request.practiceId) }),
    db.query.patients.findFirst({ where: eq(schema.patients.id, request.patientId) }),
    db.query.appointments.findFirst({ where: eq(schema.appointments.id, request.appointmentId) }),
    db.query.templateVersions.findFirst({ where: eq(schema.templateVersions.id, request.templateVersionId) }),
  ]);
  if (!practice || !patient || !appointment || !version) return null;
  return { request, practice, patient, appointment, version };
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
