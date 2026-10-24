import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit, AUDIT_LABEL, auditDetail } from "@/lib/audit";
import { getStaff } from "@/lib/auth";
import { buildEvidencePdf } from "@/lib/pdf";
import { latestDocument } from "@/server/consent";
import { requestDetail } from "@/server/dashboard";

const KIND = {
  signed: "signed_consent",
  unsigned: "unsigned_consent",
  "provider-trail": "provider_audit_trail",
} as const;

export async function GET(_req: Request, ctx: RouteContext<"/api/requests/[id]/documents/[kind]">) {
  const staff = await getStaff();
  if (!staff) return new Response("Unauthorized", { status: 401 });
  const { id, kind } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const d = await requestDetail(staff.practiceId, id);
  if (!d) return new Response("Not found", { status: 404 });

  const name = `${d.patient.lastName}-${d.patient.firstName}`.normalize("NFD").replace(/[^\w-]/g, "").toLowerCase();
  let bytes: Uint8Array;
  let filename: string;

  if (kind === "evidence") {
    const signed = await latestDocument(id, "signed_consent");
    const users = await db.query.users.findMany({ where: eq(schema.users.practiceId, staff.practiceId) });
    const practice = await db.query.practices.findFirst({ where: eq(schema.practices.id, staff.practiceId) });
    bytes = await buildEvidencePdf({
      practiceName: practice?.name ?? "",
      patientName: `${d.patient.firstName} ${d.patient.lastName.toUpperCase()}`,
      templateTitle: d.version.title,
      templateVersion: d.version.version,
      requestId: d.request.id,
      language: d.language,
      signedSha256: signed?.sha256 ?? null,
      fullDocumentOpenedAt: d.events.find((e) => e.type === "patient.full_document_opened")?.at ?? null,
      sections: d.version.sections.map((s) => {
        const e = d.reads.find((x) => x.sectionId === s.id);
        return { title: s.title, visibleMs: e?.visibleMs ?? 0, acknowledgedAt: e?.acknowledgedAt ?? null, fullTextOpenedAt: e?.fullTextOpenedAt ?? null };
      }),
      flags: d.flags.map((f) => ({ message: f.message, detail: f.detail, reviewedAt: f.reviewedAt })),
      supersededFlags: d.supersededFlags.map((f) => ({ message: f.message, detail: f.detail, reviewedAt: f.reviewedAt, supersededAt: f.supersededAt! })),
      chain: d.chain,
      events: d.events.map((e) => ({
        at: e.at,
        label: AUDIT_LABEL[e.type] ?? e.type,
        actor: e.actor.startsWith("user:") ? users.find((u) => `user:${u.id}` === e.actor)?.name ?? "cabinet" : e.actor,
        ip: e.ip,
        details: auditDetail(e.type, e.data),
      })),
    });
    filename = `preuve-${name}.pdf`;
  } else if (kind in KIND) {
    const doc = await latestDocument(id, KIND[kind as keyof typeof KIND]);
    if (!doc) return new Response("Not found", { status: 404 });
    bytes = new Uint8Array(doc.bytes);
    filename = `${kind === "signed" ? "consentement-signe" : kind === "unsigned" ? "consentement" : "preuve-prestataire"}-${name}.pdf`;
  } else {
    return new Response("Not found", { status: 404 });
  }

  await audit({ practiceId: staff.practiceId, requestId: id, actor: `user:${staff.userId}`, type: "document.downloaded", data: { kind } });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
