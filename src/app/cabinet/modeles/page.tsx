import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, Chip } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { frDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Modèles de consentement" };

export default async function TemplatesPage() {
  const staff = await requireStaff();
  const [templates, reasons] = await Promise.all([
    db.query.templates.findMany({ where: eq(schema.templates.practiceId, staff.practiceId) }),
    db.query.visitReasons.findMany({ where: eq(schema.visitReasons.practiceId, staff.practiceId) }),
  ]);
  const versions = await Promise.all(
    templates.map((t) =>
      db.query.templateVersions.findFirst({ where: eq(schema.templateVersions.templateId, t.id), orderBy: desc(schema.templateVersions.version) }),
    ),
  );

  return (
    <>
      <div>
        <h1 className="text-[26px] font-bold">Modèles</h1>
        <p className="text-[15px] text-muted">
          Chaque version est figée : un patient signe toujours la version exacte qu&apos;il a lue.
        </p>
      </div>

      <Card className="overflow-hidden">
        <h2 className="px-5 pb-1 pt-5 text-[17px] font-semibold">Motifs Doctolib reliés</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wider text-muted">
                <th scope="col" className="px-5 py-3 font-semibold">Motif Doctolib</th>
                <th scope="col" className="px-5 py-3 font-semibold">Modèle</th>
                <th scope="col" className="px-5 py-3 font-semibold">Geste prérempli</th>
                <th scope="col" className="px-5 py-3 font-semibold">Signature</th>
              </tr>
            </thead>
            <tbody>
              {reasons.map((r) => (
                <tr key={r.id} className="border-t border-[#e8eef5]">
                  <td className="px-5 py-3 font-medium">{r.label}</td>
                  <td className="px-5 py-3">{templates.find((t) => t.id === r.templateId)?.title}</td>
                  <td className="px-5 py-3">{r.defaultAct}</td>
                  <td className="px-5 py-3">
                    <Chip tone="info">{r.signatureLevelOverride ?? "Selon le modèle"}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {templates.map((t, i) => {
        const v = versions[i];
        if (!v) return null;
        return (
          <Card key={t.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[18px] font-semibold">{v.title}</h2>
              <div className="flex gap-2">
                <Chip tone="idle">Version {v.version}</Chip>
                <Chip tone="info">Signature {v.signatureLevel}</Chip>
              </div>
            </div>
            <p className="mt-1 text-[14px] text-muted">
              {v.subtitle} · publiée le {frDateTime(v.publishedAt)}
            </p>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="text-[14px] font-semibold uppercase tracking-wider text-muted">Fiche d&apos;information</h3>
                <ol className="mt-2 flex flex-col gap-1 text-[14px]">
                  {v.sections.map((s) => (
                    <li key={s.id}>{s.title}</li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className="text-[14px] font-semibold uppercase tracking-wider text-muted">Questionnaire</h3>
                <ul className="mt-2 flex flex-col gap-1.5 text-[14px]">
                  {v.questions.map((q) => (
                    <li key={q.id} className="flex items-start gap-2">
                      {q.flag && (
                        <Chip tone={q.flag.severity === "block" ? "danger" : q.flag.severity === "warn" ? "warn" : "info"}>
                          {q.flag.severity === "block" ? "Report" : q.flag.severity === "warn" ? "Alerte" : "Info"}
                        </Chip>
                      )}
                      <span>{q.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        );
      })}
    </>
  );
}
