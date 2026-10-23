import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "@/lib/config";
import { applicableQuestions } from "@/domain/precheck";
import { atLeast } from "@/domain/status";
import { finalizeSigned } from "@/server/consent";
import { accessState, loadByToken } from "@/server/patient";
import { IdentityGate } from "./identity-gate";
import { PatientFlow, type FlowStep } from "./patient-flow";
import { AutoRefresh, Shell, StatusMessage } from "./shell";

export const metadata: Metadata = { title: "Vos documents avant le rendez-vous" };

export default async function PatientPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const ctx = await loadByToken(token);
  if (!ctx) {
    return (
      <Shell>
        <StatusMessage title="Lien introuvable" tone="warn">
          Ce lien n&apos;est pas valide. Vérifiez le SMS reçu ou contactez votre cabinet.
        </StatusMessage>
      </Shell>
    );
  }

  const { request: r, practice, patient, appointment, version } = ctx;
  const state = await accessState(ctx);
  const header = { practitioner: practice.practitionerName, specialty: practice.specialty };

  if (state === "cancelled" || state === "expired") {
    return (
      <Shell header={header}>
        <StatusMessage title="Ce lien n'est plus valide" tone="warn">
          Contactez le cabinet au {practice.phone} pour recevoir un nouveau lien.
        </StatusMessage>
      </Shell>
    );
  }
  if (state === "locked") {
    return (
      <Shell header={header}>
        <StatusMessage title="Accès bloqué" tone="warn">
          Trop d&apos;essais de date de naissance. Pour votre sécurité, contactez le cabinet au {practice.phone}.
        </StatusMessage>
      </Shell>
    );
  }
  if (state === "needs_identity") {
    return (
      <Shell header={header}>
        <IdentityGate token={token} firstName={patient.firstName} />
      </Shell>
    );
  }

  if (r.status === "awaiting_provider") {
    const done = await finalizeSigned(r.id, "patient");
    if (!done) {
      return (
        <Shell header={header}>
          <StatusMessage title="Signature en cours de finalisation" tone="info">
            Votre signature est en cours de validation. Cette page se met à jour automatiquement.
          </StatusMessage>
          {r.providerSigningUrl && (
            <a className="mt-4 inline-block font-semibold text-brand underline" href={r.providerSigningUrl}>
              Reprendre la signature
            </a>
          )}
          <AutoRefresh seconds={5} />
        </Shell>
      );
    }
  }

  const fresh = await db.query.consentRequests.findFirst({ where: eq(schema.consentRequests.id, r.id) });
  if (fresh?.status === "signed") {
    return (
      <Shell header={header}>
        <StatusMessage title={`C'est signé, merci ${patient.firstName}`} tone="ok">
          {practice.practitionerName} a reçu votre consentement et vos réponses. Gardez ce SMS : vous pourrez
          demander une copie de votre document signé au cabinet.
        </StatusMessage>
        <div className="mt-5 rounded-2xl border border-line bg-white p-4 text-[15px] leading-relaxed">
          <p className="font-semibold">Le jour du rendez-vous</p>
          <p className="mt-1 text-ink-2">
            Apportez vos imageries récentes, vos comptes rendus et votre ordonnance habituelle. Une question ? Cabinet :{" "}
            <a className="font-semibold text-brand" href={`tel:${practice.phone.replace(/\s/g, "")}`}>
              {practice.phone}
            </a>
          </p>
        </div>
      </Shell>
    );
  }

  const reads = await db.query.readingEvents.findMany({ where: eq(schema.readingEvents.requestId, r.id) });
  const status = fresh?.status ?? r.status;
  const initialStep: FlowStep =
    status === "awaiting_otp"
      ? "otp"
      : atLeast(status, "precheck_done")
        ? "consent"
        : atLeast(status, "info_read")
          ? "precheck"
          : reads.length
            ? "info"
            : "welcome";

  return (
    <Shell header={header} wide>
      <PatientFlow
        token={token}
        initialStep={initialStep}
        firstName={patient.firstName}
        fullName={`${patient.firstName} ${patient.lastName}`}
        birthDate={patient.birthDate}
        phoneMasked={`${patient.phone.replace(/\D/g, "").slice(0, 2)} •• •• •• ${patient.phone.replace(/\D/g, "").slice(-2)}`}
        practicePhone={practice.phone}
        appointmentLabel={new Intl.DateTimeFormat("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Paris",
        }).format(appointment.scheduledAt)}
        visitReason={appointment.visitReasonLabel}
        plannedAct={r.plannedAct}
        plannedLocation={r.plannedLocation}
        level={r.signatureLevel}
        mockAes={config().SIGNATURE_PROVIDER === "mock" && r.signatureLevel === "AES"}
        intro={version.intro}
        sections={version.sections}
        readIds={reads.map((e) => e.sectionId)}
        questions={applicableQuestions(version.questions, r.plannedAct)}
        initialAnswers={r.answers ?? null}
        consent={version.consent}
        demoMode={config().DEMO_MODE}
      />
    </Shell>
  );
}
