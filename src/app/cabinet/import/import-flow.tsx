"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, buttonClass, Card, Chip, cx, Icon, type Tone } from "@/components/ui";
import type { ChannelPref, CommitResult, Preview, RowStatus, SendPref } from "@/server/agenda-import";
import { commit, mapMotif, preview } from "./actions";

const STATUS: Record<RowStatus, { label: string; tone: Tone }> = {
  ready: { label: "À envoyer", tone: "ok" },
  skipped_motif: { label: "Sans consentement", tone: "muted" },
  past: { label: "Passé", tone: "muted" },
  duplicate: { label: "Déjà créé", tone: "idle" },
  error: { label: "À corriger", tone: "warn" },
};

const CHANNEL: Record<string, string> = { sms: "SMS", email: "E-mail", sms_email: "SMS + e-mail" };

/** Decode as UTF-8, falling back to Windows-1252 (Excel's French default). */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

const fmtSend = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(
    new Date(iso),
  );

export function ImportFlow({ templates, leadHours }: { templates: { id: string; title: string; acts: string[] }[]; leadHours: number }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [channel, setChannel] = useState<ChannelPref>("sms_first");
  const [send, setSend] = useState<SendPref>("scheduled");
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CommitResult | null>(null);
  const [filter, setFilter] = useState<RowStatus | "all">("all");
  const [pending, start] = useTransition();

  function run(next?: { text?: string; channel?: ChannelPref; send?: SendPref }) {
    const text = next?.text ?? file?.text;
    if (!text) return;
    setError(null);
    start(async () => {
      const res = await preview(text, { channel: next?.channel ?? channel, send: next?.send ?? send });
      if ("rows" in res) {
        setResult(res);
        if (!res.ok) setError(res.error ?? "Fichier illisible.");
      } else setError(res.error);
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setDone(null);
    setResult(null);
    if (!f) return;
    if (f.size > 2_000_000) return setError("Fichier trop volumineux (2 Mo maximum).");
    if (/\.xlsx?$/i.test(f.name)) return setError("Fichier Excel : enregistrez-le d'abord au format CSV (Fichier › Enregistrer sous › CSV).");
    const text = await readText(f);
    setFile({ name: f.name, text });
    run({ text });
  }

  function confirm() {
    if (!file) return;
    start(async () => {
      const res = await commit(file.name, file.text, { channel, send });
      if (res.ok) setDone(res);
      else setError(res.error ?? "Import impossible.");
    });
  }

  if (done) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-ok">
          <Icon name="check" className="h-7 w-7" />
          <h2 className="text-[19px] font-semibold text-ink">{done.created} demande(s) créée(s)</h2>
        </div>
        <p className="mt-2 text-[15px] text-ink-2">
          {done.sentNow > 0 && `${done.sentNow} lien(s) envoyé(s) maintenant. `}
          {done.scheduled > 0 && `${done.scheduled} lien(s) programmé(s) ${leadHours} h avant le rendez-vous.`}
        </p>
        {done.failed.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-[14px] text-warn">
            {done.failed.map((f) => (
              <li key={f.line}>
                Ligne {f.line} : {f.reason}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className={buttonClass("primary")} href="/cabinet">
            Voir l&apos;agenda
          </Link>
          <button type="button" className={buttonClass("secondary")} onClick={() => (setDone(null), setResult(null), setFile(null))}>
            Importer un autre fichier
          </button>
        </div>
      </Card>
    );
  }

  const rows = result?.rows.filter((r) => filter === "all" || r.status === filter) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-5 p-5">
        <label className="flex flex-col gap-2 text-[15px] font-semibold">
          Fichier de l&apos;agenda (CSV)
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="rounded-xl border border-dashed border-line-strong bg-canvas p-4 text-[15px] font-normal file:mr-4 file:min-h-11 file:rounded-xl file:border-0 file:bg-brand file:px-4 file:font-semibold file:text-white"
          />
          <span className="text-[13px] font-normal text-muted">
            Colonnes reconnues : date, heure, nom, prénom (ou patient), date de naissance, téléphone, e-mail, motif. L&apos;ordre
            n&apos;a pas d&apos;importance.
          </span>
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="text-[15px] font-semibold">Canal</legend>
            {(
              [
                ["sms_first", "SMS si mobile, sinon e-mail"],
                ["email_first", "E-mail si connu, sinon SMS"],
                ["both", "SMS et e-mail"],
              ] as const
            ).map(([v, t]) => (
              <label key={v} className="mt-1 flex min-h-11 items-center gap-3 text-[15px]">
                <input type="radio" name="channel" value={v} checked={channel === v} onChange={() => (setChannel(v), run({ channel: v }))} className="h-5 w-5 accent-brand" />
                {t}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="text-[15px] font-semibold">Envoi</legend>
            {(
              [
                ["scheduled", `Automatique, ${leadHours} h avant chaque rendez-vous`],
                ["now", "Tout envoyer maintenant"],
              ] as const
            ).map(([v, t]) => (
              <label key={v} className="mt-1 flex min-h-11 items-center gap-3 text-[15px]">
                <input type="radio" name="send" value={v} checked={send === v} onChange={() => (setSend(v), run({ send: v }))} className="h-5 w-5 accent-brand" />
                {t}
              </label>
            ))}
          </fieldset>
        </div>
      </Card>

      {pending && !result && <p className="text-[15px] text-muted">Lecture du fichier…</p>}
      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {error}
        </p>
      )}

      {result?.ok && (
        <>
          <Card className="p-5">
            <h2 className="text-[17px] font-semibold">Aperçu · {file?.name}</h2>
            <p className="mt-1 text-[13px] text-muted">
              Colonnes détectées :{" "}
              {Object.entries(result.detected)
                .map(([k, v]) => `${k} ← « ${v} »`)
                .join(" · ")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrer les lignes">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
                Tout ({result.rows.length})
              </FilterButton>
              {(Object.keys(STATUS) as RowStatus[]).map((s) =>
                result.counts[s] ? (
                  <FilterButton key={s} active={filter === s} onClick={() => setFilter(s)}>
                    {STATUS[s].label} ({result.counts[s]})
                  </FilterButton>
                ) : null,
              )}
            </div>
          </Card>

          {result.unmappedMotifs.length > 0 && (
            <Card className="p-5">
              <h2 className="text-[17px] font-semibold">Motifs sans consentement</h2>
              <p className="mt-1 text-[14px] text-muted">
                Ces rendez-vous sont ignorés. Si un motif nécessite un consentement, associez-le à un modèle une fois pour toutes.
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {result.unmappedMotifs.map((m) => (
                  <MotifMapper key={m.motif} motif={m.motif} count={m.count} templates={templates} onMapped={() => run()} />
                ))}
              </ul>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-[14px]">
                <caption className="sr-only">Lignes du fichier importé</caption>
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-wider text-muted">
                    <th scope="col" className="px-4 py-3 font-semibold">Ligne</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Statut</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Rendez-vous</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Patient</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Motif</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Contact</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Envoi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-t border-[#e8eef5] align-top">
                      <td className="px-4 py-3 tabular-nums text-muted">{r.line}</td>
                      <td className="px-4 py-3">
                        <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip>
                        {r.reason && <p className="mt-1 max-w-48 text-[13px] text-muted">{r.reason}</p>}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{r.when}</td>
                      <td className="px-4 py-3">
                        {r.patient}
                        {r.status === "ready" && r.identity === "code" && <p className="text-[12px] text-muted">sans date de naissance : code</p>}
                      </td>
                      <td className="px-4 py-3">
                        {r.motif || "-"}
                        {r.reasonLabel && r.reasonLabel !== r.motif && <p className="text-[12px] text-muted">→ {r.reasonLabel}</p>}
                      </td>
                      <td className="px-4 py-3 text-ink-2">{r.contact}</td>
                      <td className="px-4 py-3">
                        {r.status === "ready" && r.channel && r.sendAtIso ? (
                          <>
                            {CHANNEL[r.channel]}
                            <p className="text-[12px] text-muted">{send === "now" ? "maintenant" : fmtSend(r.sendAtIso)}</p>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-6 py-3 backdrop-blur">
            <Button onClick={confirm} disabled={pending || result.counts.ready === 0}>
              {pending ? "Création…" : `Créer ${result.counts.ready} demande(s)`}
            </Button>
            <span className="text-[14px] text-muted">
              {send === "now" ? "Les liens partent immédiatement." : `Les liens partiront automatiquement ${leadHours} h avant chaque rendez-vous.`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "min-h-11 rounded-full border px-4 text-[14px] font-medium",
        active ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-white text-ink-2 hover:bg-canvas",
      )}
    >
      {children}
    </button>
  );
}

function MotifMapper({
  motif,
  count,
  templates,
  onMapped,
}: {
  motif: string;
  count: number;
  templates: { id: string; title: string; acts: string[] }[];
  onMapped(): void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const acts = templates.find((t) => t.id === templateId)?.acts ?? [];
  const [act, setAct] = useState(acts[0] ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "h-11 rounded-xl border border-line-strong bg-white px-3 text-[14px]";
  return (
    <li className="grid items-end gap-3 rounded-xl border border-line p-3 lg:grid-cols-[1fr_auto_auto_auto]">
      <p className="self-center text-[15px] font-medium">
        « {motif} » <span className="text-muted">({count})</span>
      </p>
      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        Modèle
        <select className={input} value={templateId} onChange={(e) => (setTemplateId(e.target.value), setAct(templates.find((t) => t.id === e.target.value)?.acts[0] ?? ""))}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        Geste prérempli
        <select className={input} value={act} onChange={(e) => setAct(e.target.value)}>
          {acts.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={pending || !templateId || !act}
        className={buttonClass("secondary", "text-[14px]")}
        onClick={() =>
          start(async () => {
            const res = await mapMotif({ label: motif, templateId, act });
            if (res.ok) onMapped();
            else setMsg(res.error ?? "Erreur");
          })
        }
      >
        Demander un consentement pour ce motif
      </button>
      {msg && <p className="w-full text-[13px] text-danger">{msg}</p>}
    </li>
  );
}
