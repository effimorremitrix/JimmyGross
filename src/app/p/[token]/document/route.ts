import { audit } from "@/lib/audit";
import { buildConsentPdf } from "@/lib/pdf";
import { accessState, loadByToken } from "@/server/patient";

/** The practitioner's full information sheet as a PDF, for patients who want to read everything. */
export async function GET(_req: Request, ctx: RouteContext<"/p/[token]/document">) {
  const { token } = await ctx.params;
  const c = await loadByToken(token);
  if (!c || (await accessState(c)) !== "ok") return new Response("Accès refusé", { status: 403 });
  const { bytes } = await buildConsentPdf(
    {
      practiceName: c.practice.name,
      practitionerName: c.practice.practitionerName,
      practicePhone: c.practice.phone,
      templateTitle: c.version.title,
      templateSubtitle: c.version.subtitle,
      templateVersion: c.version.version,
      intro: c.version.intro,
      sections: c.version.sections,
      consent: c.version.consent,
      questions: c.version.questions,
      patient: c.patient,
      plannedAct: c.request.plannedAct,
      plannedLocation: c.request.plannedLocation,
      appointmentAt: c.appointment.scheduledAt,
      answers: { items: {} },
      ackAt: new Date(),
      signaturePng: null,
      requestId: c.request.id,
    },
    { infoOnly: true },
  );
  await audit({ practiceId: c.request.practiceId, requestId: c.request.id, actor: "patient", type: "patient.full_document_opened" });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="fiche-information.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
