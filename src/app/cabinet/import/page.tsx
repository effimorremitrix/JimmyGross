import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { frDateTime } from "@/lib/dates";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = { title: "Importer l'agenda" };

export default async function ImportPage() {
  const staff = await requireStaff();
  const [practice, templates, batches] = await Promise.all([
    db.query.practices.findFirst({ where: eq(schema.practices.id, staff.practiceId) }),
    db.query.templates.findMany({ where: eq(schema.templates.practiceId, staff.practiceId) }),
    db.query.importBatches.findMany({
      where: eq(schema.importBatches.practiceId, staff.practiceId),
      orderBy: desc(schema.importBatches.createdAt),
      limit: 5,
    }),
  ]);
  const versions = await Promise.all(
    templates.map((t) =>
      db.query.templateVersions.findFirst({ where: eq(schema.templateVersions.templateId, t.id), orderBy: desc(schema.templateVersions.version) }),
    ),
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-bold">Importer l&apos;agenda de la semaine</h1>
        <p className="mt-1 max-w-3xl text-[15px] text-muted">
          Déposez l&apos;export de votre agenda (CSV). Chaque rendez-vous dont le motif demande un consentement reçoit
          automatiquement son lien, {practice?.sendLeadHours ?? 72} h avant, par SMS ou e-mail. Les autres motifs sont ignorés.
        </p>
      </div>
      <ImportFlow
        templates={templates.map((t, i) => ({ id: t.id, title: t.title, acts: versions[i]?.consent.actOptions ?? [] }))}
        leadHours={practice?.sendLeadHours ?? 72}
      />
      {batches.length > 0 && (
        <Card className="p-5">
          <h2 className="text-[17px] font-semibold">Derniers imports</h2>
          <ul className="mt-2 flex flex-col gap-1 text-[14px]">
            {batches.map((b) => (
              <li key={b.id}>
                {frDateTime(b.createdAt)} · {b.filename} · {b.created} demande(s) créée(s), {b.skipped} ligne(s) ignorée(s)
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
