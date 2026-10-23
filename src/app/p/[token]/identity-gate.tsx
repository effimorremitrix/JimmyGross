"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { verifyBirthDate } from "./actions";

/** Lightweight identity check before any health content is shown. */
export function IdentityGate({ token, firstName }: { token: string; firstName: string }) {
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

  const field =
    "h-14 w-full rounded-xl border border-line-strong bg-white text-center text-xl font-semibold tabular-nums text-ink";

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="text-2xl font-bold leading-tight">Bonjour {firstName}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Pour protéger vos informations de santé, confirmez votre date de naissance.
        </p>
      </div>
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
      <p className="text-[13px] leading-relaxed text-muted">
        Vos réponses sont transmises uniquement à votre médecin et conservées chez un hébergeur de données de santé certifié.
      </p>
    </form>
  );
}
