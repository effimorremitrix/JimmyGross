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
      templateTitle: c.content.title,
      templateSubtitle: c.content.subtitle,
      templateVersion: c.version.version,
      intro: c.content.intro,
      sections: c.content.sections,
      consent: c.content.consent,
      questions: c.content.questions,
      patient: c.patient,
      plannedAct: c.plannedAct,
      actKey: c.request.plannedAct,
      plannedLocation: c.request.plannedLocation,
      appointmentAt: c.appointment.scheduledAt,
      answers: { items: {} },
      ackAt: new Date(),
      signaturePng: null,
      requestId: c.request.id,
      locale: c.locale,
      translation: c.translation,
    },
    { infoOnly: true },
  );
  await audit({ practiceId: c.request.practiceId, requestId: c.request.id, actor: "patient", type: "patient.full_document_opened", data: { locale: c.locale } });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${c.locale === "fr" ? "fiche-information" : `information-sheet-${c.locale}`}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
