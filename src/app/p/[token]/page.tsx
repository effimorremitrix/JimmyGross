import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "@/lib/config";
import { LOCALE_TAG } from "@/domain/i18n";
import { applicableQuestions } from "@/domain/precheck";
import { atLeast } from "@/domain/status";
import { patientText } from "@/i18n/patient";
import { finalizeSigned } from "@/server/consent";
import { accessState, loadByToken } from "@/server/patient";
import { IdentityGate } from "./identity-gate";
import { PatientFlow, type FlowStep } from "./patient-flow";
import { AutoRefresh, Shell, StatusMessage } from "./shell";

export async function generateMetadata({ params }: PageProps<"/p/[token]">): Promise<Metadata> {
  const { token } = await params;
  const ctx = await loadByToken(token);
  return { title: (ctx?.t ?? patientText()).pageTitle };
}

export default async function PatientPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const ctx = await loadByToken(token);
  if (!ctx) {
    const t = patientText();
    return (
      <Shell locale="fr">
        <StatusMessage title={t.linkNotFoundTitle} tone="warn">
          {t.linkNotFound}
        </StatusMessage>
      </Shell>
    );
  }

  const { request: r, practice, patient, appointment, version, content, locale, t } = ctx;
  const state = await accessState(ctx);
  const header = { practitioner: practice.practitionerName, specialty: practice.specialty };
  // The patient may switch language until consent is given.
  const switcher = !r.patientAckAt && !atLeast(r.status, "awaiting_otp") ? { token, locales: ctx.locales } : undefined;

  if (state === "cancelled" || state === "expired") {
    return (
      <Shell header={header} locale={locale}>
        <StatusMessage title={t.linkInvalidTitle} tone="warn">
          {t.linkInvalid(practice.phone)}
        </StatusMessage>
      </Shell>
    );
  }
  if (state === "locked") {
    return (
      <Shell header={header} locale={locale}>
        <StatusMessage title={t.lockedTitle} tone="warn">
          {t.locked(practice.phone)}
        </StatusMessage>
      </Shell>
    );
  }
  if (state === "needs_identity") {
    return (
      <Shell header={header} locale={locale} switcher={switcher}>
        <IdentityGate token={token} locale={locale} firstName={patient.firstName} mode={patient.birthDate ? "birth_date" : "code"} demoMode={config().DEMO_MODE} />
      </Shell>
    );
  }

  if (r.status === "awaiting_provider") {
    const done = await finalizeSigned(r.id, "patient");
    if (!done) {
      return (
        <Shell header={header} locale={locale}>
          <StatusMessage title={t.finalizingTitle} tone="info">
            {t.finalizing}
          </StatusMessage>
          {r.providerSigningUrl && (
            <a className="mt-4 inline-block font-semibold text-brand underline" href={r.providerSigningUrl}>
              {t.resumeSigning}
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
      <Shell header={header} locale={locale}>
        <StatusMessage title={t.signedTitle(patient.firstName)} tone="ok">
          {t.signed(practice.practitionerName)}
        </StatusMessage>
        <div className="mt-5 rounded-2xl border border-line bg-white p-4 text-[15px] leading-relaxed">
          <p className="font-semibold">{t.dayOfTitle}</p>
          <p className="mt-1 text-ink-2">
            {t.dayOf}{" "}
            <a className="font-semibold text-brand" href={`tel:${practice.phone.replace(/\s/g, "")}`}>
              {practice.phone}
            </a>
          </p>
        </div>
      </Shell>
    );
  }

  const allReads = await db.query.readingEvents.findMany({ where: eq(schema.readingEvents.requestId, r.id) });
  const reads = allReads.filter((e) => e.acknowledgedAt);
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
    <Shell header={header} locale={locale} switcher={switcher} wide>
      <PatientFlow
        token={token}
        locale={locale}
        initialStep={initialStep}
        firstName={patient.firstName}
        fullName={`${patient.firstName} ${patient.lastName}`}
        birthDate={patient.birthDate}
        practicePhone={practice.phone}
        appointmentLabel={new Intl.DateTimeFormat(LOCALE_TAG[locale], {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Paris",
        }).format(appointment.scheduledAt)}
        visitReason={appointment.visitReasonLabel}
        plannedAct={ctx.plannedAct}
        plannedLocation={r.plannedLocation}
        level={r.signatureLevel}
        mockAes={config().SIGNATURE_PROVIDER === "mock" && r.signatureLevel === "AES"}
        intro={content.intro}
        sections={content.sections}
        readIds={reads.map((e) => e.sectionId)}
        useSummaries={!!version.summariesApprovedAt || config().DEMO_MODE}
        fullTextIds={allReads.filter((e) => e.fullTextOpenedAt).map((e) => e.sectionId)}
        // Act keywords are matched on the French act, whatever the display language.
        questions={applicableQuestions(content.questions, r.plannedAct)}
        initialAnswers={r.answers ?? null}
        consent={content.consent}
        demoMode={config().DEMO_MODE}
      />
    </Shell>
  );
}
