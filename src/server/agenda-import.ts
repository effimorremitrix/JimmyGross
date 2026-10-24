import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { parisToUtc } from "@/lib/dates";
import { isMobile, matchReason, parseAgenda, type AgendaRow } from "@/domain/agenda";
import { pickChannel, sendTimeFor, type Channel } from "./consent";
import { createConsentRequest, findOpenRequestAt, upsertPatient } from "./requests";

export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_IMPORT_ROWS = 2000;

export type ChannelPref = "sms_first" | "email_first" | "both";
export type SendPref = "scheduled" | "now";

export type RowStatus = "ready" | "skipped_motif" | "past" | "duplicate" | "error";

export interface PreviewRow {
  line: number;
  status: RowStatus;
  reason: string;
  patient: string;
  when: string;
  motif: string;
  reasonLabel: string | null;
  channel: Channel | null;
  sendAtIso: string | null;
  contact: string;
  identity: "birth_date" | "code";
}

export interface Preview {
  ok: boolean;
  error?: string;
  missingColumns: string[];
  detected: Record<string, string>;
  rows: PreviewRow[];
  unmappedMotifs: { motif: string; count: number }[];
  counts: Record<RowStatus, number>;
}

const fmtWhen = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(d);

interface Analysed {
  row: AgendaRow;
  status: RowStatus;
  reason: string;
  at: Date | null;
  visitReason: typeof schema.visitReasons.$inferSelect | null;
  channel: Channel | null;
  sendAt: Date | null;
}

async function analyse(practiceId: string, text: string, prefs: { channel: ChannelPref; send: SendPref }, now = new Date()) {
  const practice = await db.query.practices.findFirst({ where: eq(schema.practices.id, practiceId) });
  if (!practice) throw new Error("Cabinet introuvable.");
  const reasons = await db.query.visitReasons.findMany({ where: eq(schema.visitReasons.practiceId, practiceId) });
  const parsed = parseAgenda(text, now);
  const seen = new Set<string>();
  const items: Analysed[] = [];

  for (const row of parsed.rows.slice(0, MAX_IMPORT_ROWS)) {
    const base = { row, at: null, visitReason: null, channel: null, sendAt: null } as const;
    if (row.errors.length) {
      items.push({ ...base, status: "error", reason: row.errors.join(", ") });
      continue;
    }
    const at = parisToUtc(row.date!, row.time!);
    const ref = matchReason(row.motif, reasons);
    const visitReason = ref ? reasons.find((r) => r.id === ref.id)! : null;
    if (!visitReason) {
      items.push({ ...base, at, status: "skipped_motif", reason: row.motif ? "motif sans consentement associé" : "motif vide" });
      continue;
    }
    if (at <= now) {
      items.push({ ...base, at, visitReason, status: "past", reason: "rendez-vous passé" });
      continue;
    }
    const smsPhone = row.phone && isMobile(row.phone) ? row.phone : null;
    const channel = pickChannel(prefs.channel, smsPhone, row.email);
    if (!channel) {
      items.push({
        ...base,
        at,
        visitReason,
        status: "error",
        reason: row.phone ? "numéro fixe sans e-mail : impossible d'envoyer le lien" : "ni mobile ni e-mail",
      });
      continue;
    }
    const key = `${row.lastName.toLowerCase()}|${row.firstName.toLowerCase()}|${at.toISOString()}`;
    let dup = seen.has(key);
    seen.add(key);
    if (!dup) {
      const existing = await db.query.patients.findMany({
        where: and(eq(schema.patients.practiceId, practiceId), eq(schema.patients.lastName, row.lastName), eq(schema.patients.firstName, row.firstName)),
      });
      for (const p of existing) if (await findOpenRequestAt(practiceId, p.id, at)) dup = true;
    }
    if (dup) {
      items.push({ ...base, at, visitReason, channel, status: "duplicate", reason: "demande déjà existante" });
      continue;
    }
    const sendAt = prefs.send === "now" ? now : sendTimeFor(at, practice.sendLeadHours, now);
    items.push({ row, at, visitReason, channel, sendAt, status: "ready", reason: "" });
  }
  return { practice, parsed, items };
}

export async function previewImport(practiceId: string, text: string, prefs: { channel: ChannelPref; send: SendPref }): Promise<Preview> {
  const empty = { missingColumns: [], detected: {}, rows: [], unmappedMotifs: [], counts: { ready: 0, skipped_motif: 0, past: 0, duplicate: 0, error: 0 } };
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: "Fichier trop volumineux (2 Mo maximum).", ...empty };
  const { parsed, items } = await analyse(practiceId, text, prefs);
  if (parsed.missing.length) {
    return {
      ok: false,
      error: `Colonnes introuvables : ${parsed.missing.join(", ")}. Vérifiez la ligne d'en-têtes de l'export.`,
      ...empty,
      missingColumns: parsed.missing,
      detected: detectedLabels(parsed),
    };
  }
  const counts = { ready: 0, skipped_motif: 0, past: 0, duplicate: 0, error: 0 } as Record<RowStatus, number>;
  const unmapped = new Map<string, number>();
  for (const it of items) {
    counts[it.status]++;
    if (it.status === "skipped_motif" && it.row.motif) unmapped.set(it.row.motif, (unmapped.get(it.row.motif) ?? 0) + 1);
  }
  return {
    ok: true,
    missingColumns: [],
    detected: detectedLabels(parsed),
    counts,
    unmappedMotifs: [...unmapped].map(([motif, count]) => ({ motif, count })).sort((a, b) => b.count - a.count),
    rows: items.map((it) => ({
      line: it.row.line,
      status: it.status,
      reason: it.reason,
      patient: `${it.row.firstName} ${it.row.lastName}`.trim() || "?",
      when: it.at ? fmtWhen(it.at) : `${it.row.date ?? "?"} ${it.row.time ?? ""}`,
      motif: it.row.motif,
      reasonLabel: it.visitReason?.label ?? null,
      channel: it.channel,
      sendAtIso: it.sendAt?.toISOString() ?? null,
      contact: [it.row.phone, it.row.email].filter(Boolean).join(" · ") || "-",
      identity: it.row.birthDate ? "birth_date" : "code",
    })),
  };
}

function detectedLabels(parsed: ReturnType<typeof parseAgenda>): Record<string, string> {
  const labels: Record<string, string> = {
    date: "Date",
    time: "Heure",
    datetime: "Date et heure",
    lastName: "Nom",
    firstName: "Prénom",
    fullName: "Patient",
    birthDate: "Date de naissance",
    phone: "Téléphone",
    email: "E-mail",
    motif: "Motif",
    location: "Localisation",
  };
  return Object.fromEntries(Object.entries(parsed.mapping).map(([f, i]) => [labels[f], parsed.headers[i!]]));
}

export interface CommitResult {
  ok: boolean;
  error?: string;
  created: number;
  sentNow: number;
  scheduled: number;
  failed: { line: number; reason: string }[];
  batchId?: string;
}

/** Re-analyses the same file server-side (never trusts the preview) and creates the ready rows. */
export async function commitImport(
  practiceId: string,
  userId: string,
  filename: string,
  text: string,
  prefs: { channel: ChannelPref; send: SendPref },
): Promise<CommitResult> {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: "Fichier trop volumineux.", created: 0, sentNow: 0, scheduled: 0, failed: [] };
  const { practice, parsed, items } = await analyse(practiceId, text, prefs);
  if (parsed.missing.length) return { ok: false, error: "Colonnes manquantes.", created: 0, sentNow: 0, scheduled: 0, failed: [] };
  const ready = items.filter((i) => i.status === "ready");
  const [batch] = await db
    .insert(schema.importBatches)
    .values({ practiceId, filename: filename.slice(0, 200), sha256: sha256(text), rows: items.length, created: 0, skipped: items.length - ready.length, createdById: userId })
    .returning();

  let created = 0;
  let sentNow = 0;
  let scheduled = 0;
  const failed: { line: number; reason: string }[] = [];
  for (const it of ready) {
    try {
      const patient = await upsertPatient(practiceId, {
        firstName: it.row.firstName,
        lastName: it.row.lastName,
        birthDate: it.row.birthDate,
        phone: it.row.phone,
        email: it.row.email,
      });
      const res = await createConsentRequest({
        practice,
        actor: `user:${userId}`,
        userId,
        patient,
        scheduledAt: it.at!,
        reason: it.visitReason!,
        location: it.row.location,
        channel: it.channel!,
        sendMode: prefs.send === "now" ? "now" : "scheduled",
        source: "import",
        importBatchId: batch.id,
      });
      created++;
      if (res.sent) sentNow++;
      else scheduled++;
    } catch (e) {
      failed.push({ line: it.row.line, reason: e instanceof Error ? e.message : "erreur" });
    }
  }
  await db.update(schema.importBatches).set({ created }).where(eq(schema.importBatches.id, batch.id));
  await audit({ practiceId, actor: `user:${userId}`, type: "agenda.imported", data: { batchId: batch.id, rows: items.length, created, sentNow, scheduled, failed: failed.length } });
  return { ok: true, created, sentNow, scheduled, failed, batchId: batch.id };
}
