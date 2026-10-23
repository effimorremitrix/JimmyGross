import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, Chip, Icon } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { frDay, frTime, isYmd, parisYmd, shiftYmd } from "@/lib/dates";
import { fmtDuration } from "@/lib/pdf";
import { STATUS_LABEL, statusTone } from "@/domain/status";
import { dayView } from "@/server/dashboard";
import { reviewFlag } from "./actions";
import { RowActions } from "./row-actions";

export const metadata: Metadata = { title: "Agenda des consentements" };

export default async function DayPage({ searchParams }: PageProps<"/cabinet">) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const ymd = isYmd(String(sp.jour ?? "")) ? String(sp.jour) : parisYmd();
  const { rows, kpi } = await dayView(staff.practiceId, ymd);
  const alerts = rows.flatMap((r) =>
    r.flags.filter((f) => f.severity !== "info").map((f) => ({ ...f, row: r })),
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold first-letter:uppercase">{frDay(ymd)}</h1>
          <p className="text-[14px] text-muted">Consentements et questionnaires avant chaque geste</p>
        </div>
        <nav aria-label="Changer de jour" className="flex gap-2">
          <Link className={buttonClass("secondary")} href={`/cabinet?jour=${shiftYmd(ymd, -1)}`}>
            <Icon name="back" />
            <span className="sr-only">Jour précédent</span>
          </Link>
          <Link className={buttonClass("secondary")} href="/cabinet">
            Aujourd&apos;hui
          </Link>
          <Link className={buttonClass("secondary")} href={`/cabinet?jour=${shiftYmd(ymd, 1)}`}>
            <span className="sr-only">Jour suivant</span>
            <Icon name="back" className="rotate-180" />
          </Link>
          <Link className={buttonClass("primary")} href="/cabinet/nouveau">
            Nouvelle demande
          </Link>
        </nav>
      </div>

      <section aria-label="Indicateurs du jour" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Gestes avec consentement" value={kpi.total} />
        <Kpi label="Signés" value={kpi.signed} tone="ok" />
        <Kpi label="En attente" value={kpi.pending} />
        <Kpi label="Alertes à vérifier" value={kpi.alerts} tone={kpi.alerts ? "warn" : undefined} />
      </section>

      {alerts.length > 0 && (
        <Card className="p-5">
          <h2 className="text-[17px] font-semibold">À vérifier avant les gestes</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={
                  a.reviewedAt
                    ? "flex flex-wrap items-center gap-4 rounded-xl bg-canvas p-4 opacity-75"
                    : "flex flex-wrap items-center gap-4 rounded-xl border border-warn-line bg-[#fff8ee] p-4"
                }
              >
                <Icon name="alert" className="h-6 w-6 text-warn" />
                <div className="min-w-0 flex-[1_1_320px]">
                  <p className="text-[15px] font-semibold">
                    {frTime(a.row.appointment.scheduledAt)} · {a.row.patient.firstName} {a.row.patient.lastName} · {a.row.request?.plannedAct}
                  </p>
                  <p className="text-[14px] text-ink-2">
                    {a.severity === "block" && <strong className="text-danger">Peut nécessiter un report. </strong>}
                    {a.message}
                    {a.detail ? ` : ${a.detail}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a className={buttonClass("secondary")} href={`tel:${a.row.patient.phone.replace(/\s/g, "")}`}>
                    <Icon name="phone" />
                    Appeler
                  </a>
                  <form action={reviewFlag.bind(null, a.id)}>
                    <button type="submit" className={buttonClass(a.reviewedAt ? "secondary" : "primary")} aria-pressed={!!a.reviewedAt}>
                      {a.reviewedAt ? "Vérifié" : "Marquer vérifié"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <h2 className="px-5 pb-1 pt-5 text-[17px] font-semibold">Patients du jour</h2>
        {rows.length === 0 ? (
          <p className="px-5 pb-6 pt-2 text-[15px] text-muted">Aucun rendez-vous avec consentement ce jour-là.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wider text-muted">
                  <th scope="col" className="px-5 py-3 font-semibold">Heure</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Patient</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Motif</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Consentement</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Questionnaire</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Preuve d&apos;information</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const r = row.request;
                  const hasAlert = row.flags.some((f) => f.severity !== "info");
                  return (
                    <tr key={row.appointment.id} className="border-t border-[#e8eef5]">
                      <td className="px-5 py-3.5 font-semibold tabular-nums">{frTime(row.appointment.scheduledAt)}</td>
                      <td className="px-5 py-3.5">
                        {r ? (
                          <Link className="font-medium text-brand hover:underline" href={`/cabinet/demandes/${r.id}`}>
                            {row.patient.firstName} {row.patient.lastName}
                          </Link>
                        ) : (
                          `${row.patient.firstName} ${row.patient.lastName}`
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-ink-2">
                        {row.appointment.visitReasonLabel}
                        {r?.plannedLocation ? `, ${r.plannedLocation}` : ""}
                        {r?.signatureLevel === "AES" && (
                          <span className="ml-2">
                            <Chip tone="info">AES</Chip>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">{r ? <Chip tone={statusTone(r.status)}>{STATUS_LABEL[r.status]}</Chip> : "-"}</td>
                      <td className="px-5 py-3.5">
                        {!r?.answers ? (
                          <Chip tone="idle">Non rempli</Chip>
                        ) : hasAlert ? (
                          <Chip tone="warn">Alerte</Chip>
                        ) : (
                          <Chip tone="ok">RAS</Chip>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-muted">
                        {row.readCount
                          ? `Lu ${fmtDuration(row.readMs)} · ${row.readCount} partie(s)`
                          : r?.lastSentAt
                            ? "Envoyé, pas encore lu"
                            : "-"}
                      </td>
                      <td className="px-5 py-2 text-right">
                        {r && <RowActions requestId={r.id} signed={r.status === "signed"} closed={r.status === "cancelled" || r.status === "expired"} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className={tone === "warn" ? "rounded-2xl border border-warn-line bg-warn-soft p-5" : "rounded-2xl border border-line bg-white p-5"}>
      <p className={tone === "warn" ? "text-[13px] font-semibold text-warn" : "text-[13px] font-medium text-muted"}>{label}</p>
      <p className={`mt-1 text-[32px] font-bold tabular-nums ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : ""}`}>{value}</p>
    </div>
  );
}
