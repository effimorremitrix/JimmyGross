"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import type { Locale } from "@/domain/i18n";
import { patientText, type PatientText } from "@/i18n/patient";
import { sendAccessCode, verifyAccessCode, verifyBirthDate } from "./actions";

/**
 * Lightweight identity check before any health content is shown: birth date
 * when the practice has it, otherwise a one-time code to the patient's phone or e-mail.
 */
export function IdentityGate({
  token,
  locale,
  firstName,
  mode,
  demoMode,
}: {
  token: string;
  locale: Locale;
  firstName: string;
  mode: "birth_date" | "code";
  demoMode: boolean;
}) {
  const t = patientText(locale);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold leading-tight">{t.hello(firstName)}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{mode === "birth_date" ? t.gateBirthDate : t.gateCode}</p>
      </div>
      {mode === "birth_date" ? <BirthDateForm token={token} t={t} /> : <CodeForm token={token} t={t} demoMode={demoMode} />}
      <p className="text-[13px] leading-relaxed text-muted">{t.gatePrivacy}</p>
    </div>
  );
}

function BirthDateForm({ token, t }: { token: string; t: PatientText }) {
  const router = useRouter();
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const complete = day.length >= 1 && month.length >= 1 && year.length === 4;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    start(async () => {
      const res = await verifyBirthDate(token, iso);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const field = "h-14 w-full rounded-xl border border-line-strong bg-white text-center text-xl font-semibold tabular-nums text-ink";
  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[15px] font-semibold">{t.birthDate}</legend>
        <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-3">
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t.day}
            <input className={field} inputMode="numeric" autoComplete="bday-day" maxLength={2} placeholder={t.dayPh} value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t.month}
            <input className={field} inputMode="numeric" autoComplete="bday-month" maxLength={2} placeholder={t.monthPh} value={month} onChange={(e) => setMonth(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t.year}
            <input className={field} inputMode="numeric" autoComplete="bday-year" maxLength={4} placeholder={t.yearPh} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
          </label>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!complete || pending} className="h-13">
        {pending ? t.checking : t.continue}
      </Button>
    </form>
  );
}

function CodeForm({ token, t, demoMode }: { token: string; t: PatientText; demoMode: boolean }) {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [demo, setDemo] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    start(async () => {
      const res = await sendAccessCode(token);
      if (res.ok) {
        setSentTo(res.sentTo);
        setDemo(res.demoCode);
      } else setError(res.error);
    });
  }

  function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await verifyAccessCode(token, code);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  if (!sentTo) {
    return (
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
            {error}
          </p>
        )}
        <Button onClick={send} disabled={pending} className="h-13">
          {pending ? t.sending : t.getMyCode}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
      <p className="text-[15px] text-ink-2">{t.codeSentTo(sentTo)}</p>
      {demoMode && demo && (
        <p className="rounded-xl bg-brand-soft px-4 py-3 text-[14px]">
          {t.demoCode} <strong className="tabular-nums tracking-widest">{demo}</strong>
        </p>
      )}
      <label className="flex flex-col gap-2 text-[15px] font-semibold">
        {t.verificationCode}
        <input
          className="h-14 rounded-xl border border-line-strong bg-white text-center text-2xl font-semibold tracking-[0.5em] tabular-nums"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {error}
        </p>
      )}
      <Button type="submit" className="h-13" disabled={code.length !== 6 || pending}>
        {pending ? t.checking : t.continue}
      </Button>
      <button type="button" onClick={send} disabled={pending} className="min-h-11 self-start text-[15px] font-medium text-brand hover:underline">
        {t.resendCode}
      </button>
    </form>
  );
}
