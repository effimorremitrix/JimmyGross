import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass, Card, Chip, Icon } from "@/components/ui";
import { AUDIT_LABEL } from "@/lib/audit";
import { requireStaff } from "@/lib/auth";
import { frDateTime, parisYmd } from "@/lib/dates";
import { fmtDuration } from "@/lib/pdf";
import { applicableQuestions } from "@/domain/precheck";
import { isTerminal, STATUS_LABEL, statusTone } from "@/domain/status";
import { requestDetail } from "@/server/dashboard";
import { cancelRequest, reviewFlag } from "../../actions";
import { RowActions } from "../../row-actions";
import { ConfirmActForm } from "./confirm-act-form";

export const metadata: Metadata = { title: "Détail de la demande" };

const DOC_LABEL = {
  signed_consent: "Consentement signé (PDF)",
  unsigned_consent: "Document avant signature (PDF)",
  provider_audit_trail: "Fichier de preuve du prestataire (PDF)",
} as const;

export default async function RequestPage({ params }: PageProps<"/cabinet/demandes/[id]">) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await requestDetail(staff.practiceId, id);
  if (!d) notFound();
  const { request: r, patient, appointment, version, flags, reads, events, docs } = d;
  const questions = applicableQuestions(version.questions, r.plannedAct);
  const totalMs = reads.reduce((s, e) => s + e.visibleMs, 0);
  const kinds = [...new Set(docs.map((x) => x.kind))];

  return (
    <>
      <Link href={`/cabinet?jour=${parisYmd(appointment.scheduledAt)}`} className="inline-flex min-h-11 items-center gap-1 self-start text-[14px] font-medium text-brand hover:underline">
        <Icon name="back" />
        Retour à l&apos;agenda
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold">
            {patient.firstName} {patient.lastName}
          </h1>
          <p className="text-[15px] text-muted">
            {appointment.visitReasonLabel} · {frDateTime(appointment.scheduledAt)} · né(e) le {patient.birthDate.split("-").reverse().join("/")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={statusTone(r.status)}>{STATUS_LABEL[r.status]}</Chip>
          <Chip tone="info">{r.signatureLevel === "AES" ? "Signature avancée" : "Signature simple + SMS"}</Chip>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          {flags.length > 0 && (
            <Card className="p-5">
              <h2 className="text-[17px] font-semibold">Alertes du questionnaire</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {flags.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                    <Chip tone={f.severity === "block" ? "danger" : f.severity === "warn" ? "warn" : "info"}>
                      {f.severity === "block" ? "Report possible" : f.severity === "warn" ? "À vérifier" : "Info"}
                    </Chip>
                    <p className="min-w-0 flex-1 text-[14px]">
                      <strong>{f.message}</strong>
                      {f.detail ? ` : ${f.detail}` : ""}
                    </p>
                    <form action={reviewFlag.bind(null, f.id)}>
                      <button type="submit" aria-pressed={!!f.reviewedAt} className={buttonClass(f.reviewedAt ? "secondary" : "primary", "text-[14px]")}>
                        {f.reviewedAt ? "Vérifié" : "Marquer vérifié"}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="text-[17px] font-semibold">Questionnaire avant le geste</h2>
            {!r.answers ? (
              <p className="mt-2 text-[14px] text-muted">Pas encore rempli.</p>
            ) : (
              <dl className="mt-3 divide-y divide-line text-[14px]">
                {questions.map((q) => {
                  const a = r.answers!.items[q.id];
                  return (
                    <div key={q.id} className="flex gap-4 py-2.5">
                      <dt className="flex-1 text-ink-2">{q.text}</dt>
                      <dd className={a?.answer === "oui" ? "w-48 text-right font-semibold text-warn" : "w-48 text-right"}>
                        {a ? (a.answer === "oui" ? "Oui" : "Non") : "-"}
                        {a?.detail ? ` (${a.detail})` : ""}
                      </dd>
                    </div>
                  );
                })}
                {r.answers.emergencyContact?.name && (
                  <div className="flex gap-4 py-2.5">
                    <dt className="flex-1 text-ink-2">Personne à contacter</dt>
                    <dd className="text-right">
                      {r.answers.emergencyContact.name} ({r.answers.emergencyContact.relation}) · {r.answers.emergencyContact.phone}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-[17px] font-semibold">Preuve d&apos;information</h2>
            <p className="mt-1 text-[14px] text-muted">
              Modèle « {version.title} », version {version.version}. Temps de lecture total : {fmtDuration(totalMs)}.
            </p>
            <ul className="mt-3 flex flex-col gap-1.5 text-[14px]">
              {version.sections.map((s) => {
                const e = reads.find((x) => x.sectionId === s.id);
                return (
                  <li key={s.id} className="flex items-center gap-3">
                    <span className={e ? "text-ok" : "text-muted"}>
                      <Icon name={e ? "check" : "lock"} className="h-4 w-4" />
                    </span>
                    <span className="flex-1">{s.title}</span>
                    <span className="tabular-nums text-muted">{e ? `${fmtDuration(e.visibleMs)} · ${frDateTime(e.acknowledgedAt)}` : "non lue"}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="text-[17px] font-semibold">Journal horodaté</h2>
            <ol className="mt-3 flex flex-col gap-2 text-[14px]">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-3">
                  <span className="w-40 tabular-nums text-muted">{frDateTime(e.at)}</span>
                  <span className="flex-1">
                    {AUDIT_LABEL[e.type] ?? e.type}
                    <span className="text-muted"> · {e.actor.startsWith("user:") ? "cabinet" : e.actor === "patient" ? "patient" : e.actor}</span>
                    {e.ip ? <span className="text-muted"> · IP {e.ip}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="text-[17px] font-semibold">Documents</h2>
            <ul className="mt-3 flex flex-col gap-1">
              {kinds.map((k) => (
                <li key={k}>
                  <a className="inline-flex min-h-11 items-center gap-2 text-[14px] font-medium text-brand hover:underline" href={`/api/requests/${r.id}/documents/${k === "signed_consent" ? "signed" : k === "unsigned_consent" ? "unsigned" : "provider-trail"}`}>
                    <Icon name="doc" />
                    {DOC_LABEL[k]}
                  </a>
                </li>
              ))}
              <li>
                <a className="inline-flex min-h-11 items-center gap-2 text-[14px] font-medium text-brand hover:underline" href={`/api/requests/${r.id}/documents/evidence`}>
                  <Icon name="doc" />
                  Dossier de preuve (PDF)
                </a>
              </li>
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="text-[17px] font-semibold">Confirmation du geste</h2>
            <p className="mt-1 text-[14px] text-muted">
              Consenti : <strong className="text-ink">{r.plannedAct}</strong>
              {r.plannedLocation ? `, ${r.plannedLocation}` : ""}
            </p>
            {r.confirmedAt ? (
              <p className="mt-3 rounded-xl bg-ok-soft px-4 py-3 text-[14px] text-ok">
                Confirmé le {frDateTime(r.confirmedAt)} : {r.confirmedAct}
                {r.confirmedLocation ? `, ${r.confirmedLocation}` : ""}
                {r.confirmedAct !== r.plannedAct && <strong className="block text-warn">Différent du geste consenti : un nouveau consentement est conseillé.</strong>}
              </p>
            ) : r.status === "signed" ? (
              staff.role === "practitioner" ? (
                <ConfirmActForm requestId={r.id} options={version.consent.actOptions} planned={r.plannedAct} location={r.plannedLocation} />
              ) : (
                <p className="mt-3 text-[14px] text-muted">À confirmer par le médecin le jour de l&apos;acte.</p>
              )
            ) : (
              <p className="mt-3 text-[14px] text-muted">Disponible une fois le consentement signé.</p>
            )}
          </Card>

          {!isTerminal(r.status) && (
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-[17px] font-semibold">Actions</h2>
              <p className="text-[14px] text-muted">
                {r.sendCount} envoi(s){r.lastSentAt ? `, dernier le ${frDateTime(r.lastSentAt)}` : ""}. Un nouveau lien désactive le précédent.
              </p>
              <RowActions requestId={r.id} signed={false} closed={false} />
              <form action={cancelRequest.bind(null, r.id)}>
                <button type="submit" className={buttonClass("danger", "w-full text-[14px]")}>
                  Annuler la demande
                </button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
