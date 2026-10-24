import "server-only";
import { db, schema } from "@/db";
import { isLocale, LOCALE_LABEL_FR } from "@/domain/i18n";
import { requestMeta } from "./request-meta";

export type AuditActor = "patient" | "system" | "provider" | `user:${string}`;

/**
 * Appends one event to the evidence log. The database chains it to the
 * previous event of the practice (sha256) and rejects any later UPDATE or
 * DELETE; see drizzle/0003_evidence_integrity.sql.
 */
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
  "patient.identity_ok": "Identité vérifiée (date de naissance ou code)",
  "patient.identity_failed": "Vérification d'identité échouée",
  "patient.locked": "Accès bloqué après trop d'essais",
  "patient.section_read": "Partie lue et confirmée",
  "patient.full_text_opened": "Texte intégral d'une partie ouvert",
  "patient.full_document_opened": "Document intégral (PDF) ouvert",
  "patient.access_code_sent": "Code d'accès envoyé",
  "request.scheduled": "Envoi programmé",
  "request.imported": "Créée depuis l'agenda importé",
  "template.summaries_approved": "Résumés validés par le médecin",
  "template.translation_approved": "Traduction validée par le médecin",
  "patient.language_changed": "Langue changée par le patient",
  "request.language_changed": "Langue du patient changée par le cabinet",
  "patient.precheck_submitted": "Questionnaire envoyé",
  "patient.consent_given": "Consentement exprimé et signature tracée",
  "signature.otp_sent": "Code de signature envoyé",
  "signature.otp_failed": "Code de signature incorrect",
  "signature.signed": "Document signé",
  "signature.provider_started": "Signature avancée démarrée",
  "flag.reviewed": "Alerte vérifiée",
  "flag.unreviewed": "Vérification d'alerte annulée",
  "flag.withdrawn_after_review": "Réponse retirée par le patient après vérification",
  "flag.changed_after_review": "Réponse modifiée par le patient après vérification",
  "act.confirmed": "Geste confirmé par le médecin",
  "document.downloaded": "Document téléchargé",
};

/** Short French detail shown next to an event's label (language changes, confirmed act). */
export function auditDetail(type: string, data: Record<string, unknown>): string {
  const lang = (x: unknown) => (isLocale(x) ? LOCALE_LABEL_FR[x] : String(x ?? ""));
  if (type === "patient.language_changed" || type === "request.language_changed") return `${lang(data.from)} → ${lang(data.to)}`;
  if (type === "template.translation_approved") return lang(data.locale);
  if (type === "act.confirmed") return String(data.act ?? "");
  if ((type === "request.sent" || type === "patient.consent_given") && isLocale(data.locale) && data.locale !== "fr") return `en ${lang(data.locale)}`;
  return "";
}
