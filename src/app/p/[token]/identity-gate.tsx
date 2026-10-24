"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { sendAccessCode, verifyAccessCode, verifyBirthDate } from "./actions";

/**
 * Lightweight identity check before any health content is shown: birth date
 * when the practice has it, otherwise a one-time code to the patient's phone or e-mail.
 */
export function IdentityGate({
  token,
  firstName,
  mode,
  demoMode,
}: {
  token: string;
  firstName: string;
  mode: "birth_date" | "code";
  demoMode: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold leading-tight">Bonjour {firstName}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {mode === "birth_date"
            ? "Pour protéger vos informations de santé, confirmez votre date de naissance."
            : "Pour protéger vos informations de santé, nous allons vous envoyer un code de vérification."}
        </p>
      </div>
      {mode === "birth_date" ? <BirthDateForm token={token} /> : <CodeForm token={token} demoMode={demoMode} />}
      <p className="text-[13px] leading-relaxed text-muted">
        Vos réponses sont transmises uniquement à votre médecin et conservées chez un hébergeur de données de santé certifié.
      </p>
    </div>
  );
}

function BirthDateForm({ token }: { token: string }) {
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
        <legend className="mb-2 text-[15px] font-semibold">Date de naissance</legend>
        <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-3">
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            Jour
            <input className={field} inputMode="numeric" autoComplete="bday-day" maxLength={2} placeholder="JJ" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            Mois
            <input className={field} inputMode="numeric" autoComplete="bday-month" maxLength={2} placeholder="MM" value={month} onChange={(e) => setMonth(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            Année
            <input className={field} inputMode="numeric" autoComplete="bday-year" maxLength={4} placeholder="AAAA" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
          </label>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!complete || pending} className="h-13">
        {pending ? "Vérification…" : "Continuer"}
      </Button>
    </form>
  );
}

function CodeForm({ token, demoMode }: { token: string; demoMode: boolean }) {
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
          {pending ? "Envoi…" : "Recevoir mon code"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
      <p className="text-[15px] text-ink-2">Code envoyé {sentTo}.</p>
      {demoMode && demo && (
        <p className="rounded-xl bg-brand-soft px-4 py-3 text-[14px]">
          Mode démonstration : votre code est <strong className="tabular-nums tracking-widest">{demo}</strong>
        </p>
      )}
      <label className="flex flex-col gap-2 text-[15px] font-semibold">
        Code de vérification
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
        {pending ? "Vérification…" : "Continuer"}
      </Button>
      <button type="button" onClick={send} disabled={pending} className="min-h-11 self-start text-[15px] font-medium text-brand hover:underline">
        Renvoyer le code
      </button>
    </form>
  );
}
