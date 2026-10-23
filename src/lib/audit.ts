import "server-only";
import { db, schema } from "@/db";
import { requestMeta } from "./request-meta";

export type AuditActor = "patient" | "system" | "provider" | `user:${string}`;

/** Appends one event to the evidence log. Never updated, never deleted. */
export async function audit(params: {
  practiceId: string;
  requestId?: string | null;
  actor: AuditActor;
  type: string;
  data?: Record<string, unknown>;
  withRequestMeta?: boolean;
}): Promise<void> {
  const meta = params.withRequestMeta === false ? { ip: null, userAgent: null } : await requestMeta();
  await db.insert(schema.auditEvents).values({
    practiceId: params.practiceId,
    requestId: params.requestId ?? null,
    actor: params.actor,
    type: params.type,
    data: params.data ?? {},
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

/** Human-readable French labels for the evidence timeline. */
export const AUDIT_LABEL: Record<string, string> = {
  "request.created": "Demande créée",
  "request.sent": "Lien envoyé",
  "request.link_rotated": "Nouveau lien généré",
  "request.cancelled": "Demande annulée",
  "patient.opened": "Lien ouvert par le patient",
  "patient.identity_ok": "Date de naissance vérifiée",
  "patient.identity_failed": "Date de naissance incorrecte",
  "patient.locked": "Accès bloqué après trop d'essais",
  "patient.section_read": "Partie lue et confirmée",
  "patient.precheck_submitted": "Questionnaire envoyé",
  "patient.consent_given": "Consentement exprimé et signature tracée",
  "signature.otp_sent": "Code SMS envoyé",
  "signature.otp_failed": "Code SMS incorrect",
  "signature.signed": "Document signé",
  "signature.provider_started": "Signature avancée démarrée",
  "flag.reviewed": "Alerte vérifiée",
  "act.confirmed": "Geste confirmé par le médecin",
  "document.downloaded": "Document téléchargé",
};
