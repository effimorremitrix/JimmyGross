import type { RequestStatus } from "./types";

/**
 * Patient journey. A request only moves forward; a re-sent link keeps the
 * progress already made. "signed", "expired" and "cancelled" are terminal.
 */
const ORDER: RequestStatus[] = [
  "created",
  "sent",
  "opened",
  "info_read",
  "precheck_done",
  "awaiting_otp",
  "awaiting_provider",
  "signed",
];

export const TERMINAL: RequestStatus[] = ["signed", "expired", "cancelled"];

export function isTerminal(s: RequestStatus): boolean {
  return TERMINAL.includes(s);
}

/** The furthest of the two statuses, never moving backwards. */
export function advance(current: RequestStatus, next: RequestStatus): RequestStatus {
  if (isTerminal(current)) return current;
  if (next === "expired" || next === "cancelled") return next;
  const a = ORDER.indexOf(current);
  const b = ORDER.indexOf(next);
  return b > a ? next : current;
}

export function atLeast(current: RequestStatus, step: RequestStatus): boolean {
  return ORDER.indexOf(current) >= ORDER.indexOf(step);
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  created: "Créé",
  sent: "Envoyé",
  opened: "Ouvert",
  info_read: "Fiche lue",
  precheck_done: "Questionnaire rempli",
  awaiting_otp: "Code SMS en attente",
  awaiting_provider: "Signature en cours",
  signed: "Signé",
  expired: "Expiré",
  cancelled: "Annulé",
};

/** Bucket used by the dashboard chips. */
export function statusTone(s: RequestStatus): "ok" | "progress" | "idle" | "muted" {
  if (s === "signed") return "ok";
  if (s === "expired" || s === "cancelled") return "muted";
  if (s === "created" || s === "sent") return "idle";
  return "progress";
}
