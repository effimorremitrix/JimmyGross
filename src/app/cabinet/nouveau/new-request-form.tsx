"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, buttonClass, Card, Icon } from "@/components/ui";
import { DEFAULT_LOCALE, LOCALE_LABEL_FR, LOCALES, type Locale } from "@/domain/i18n";
import { createRequest, type CreateState } from "../actions";

interface Reason {
  id: string;
  label: string;
  act: string;
  aes: boolean;
  /** Languages with an approved text for this motif (French always). */
  locales: Locale[];
}

export function NewRequestForm({ reasons, defaultDate }: { reasons: Reason[]; defaultDate: string }) {
  const [state, action, pending] = useActionState<CreateState | undefined, FormData>(createRequest, undefined);
  const [reasonId, setReasonId] = useState(reasons[0]?.id ?? "");
  const [locale, setLocale] = useState<string>(state?.values?.locale ?? DEFAULT_LOCALE);
  const [copied, setCopied] = useState(false);
  const reason = reasons.find((r) => r.id === reasonId);

  if (state?.link) {
    return (
      <Card className="mt-6 p-6">
        <div className="flex items-center gap-3 text-ok">
          <Icon name="check" className="h-7 w-7" />
          <h2 className="text-[19px] font-semibold text-ink">Demande créée</h2>
        </div>
        <p className="mt-3 text-[15px] text-ink-2">
          {state.sentTo
            ? `Lien envoyé (${state.sentTo}). Vous pouvez aussi le coller dans le message de rendez-vous Doctolib :`
            : "Collez ce lien dans le message de rendez-vous Doctolib du patient :"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input readOnly value={state.link} aria-label="Lien patient" className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-canvas px-3 font-mono text-[13px]" />
          <Button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(state.link!).catch(() => {});
              setCopied(true);
            }}
          >
            <Icon name="copy" />
            {copied ? "Copié" : "Copier"}
          </Button>
        </div>
        <p className="mt-2 text-[13px] text-muted">Ce lien n&apos;est affiché qu&apos;une fois. Vous pourrez en générer un nouveau depuis l&apos;agenda.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className={buttonClass("secondary")} href={`/cabinet/demandes/${state.requestId}`}>
            Voir la demande
          </Link>
          <a className={buttonClass("ghost")} href="/cabinet/nouveau">
            Créer une autre demande
          </a>
        </div>
      </Card>
    );
  }

  const err = (k: string) => state?.fieldErrors?.[k];
  const val = (k: string) => state?.values?.[k];
  const input = "h-12 rounded-xl border border-line-strong bg-white px-3 text-[16px] font-normal aria-[invalid=true]:border-danger";
  const label = "flex flex-col gap-1 text-[14px] font-semibold";

  return (
    <form action={action} className="mt-6 flex flex-col gap-5" noValidate>
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-[16px] font-semibold">Patient</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom" error={err("firstName")} className={label}>
            <input name="firstName" defaultValue={val("firstName")} autoComplete="off" required aria-invalid={!!err("firstName")} className={input} />
          </Field>
          <Field label="Nom" error={err("lastName")} className={label}>
            <input name="lastName" defaultValue={val("lastName")} autoComplete="off" required aria-invalid={!!err("lastName")} className={input} />
          </Field>
          <Field label="Date de naissance (conseillée)" error={err("birthDate")} className={label} hint="Vérifie l'identité à l'ouverture du lien. Sans elle, le patient reçoit un code.">
            <input name="birthDate" defaultValue={val("birthDate")} type="date" aria-invalid={!!err("birthDate")} className={input} />
          </Field>
          <Field label="Téléphone mobile" error={err("phone")} className={label}>
            <input name="phone" defaultValue={val("phone")} type="tel" inputMode="tel" placeholder="06 12 34 56 78" aria-invalid={!!err("phone")} className={input} />
          </Field>
          <Field label="E-mail" error={err("email")} className={`${label} sm:col-span-2`}>
            <input name="email" defaultValue={val("email")} type="email" aria-invalid={!!err("email")} className={input} />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-[16px] font-semibold">Rendez-vous</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" error={err("date")} className={label}>
            <input name="date" type="date" defaultValue={val("date") ?? defaultDate} required className={input} />
          </Field>
          <Field label="Heure" error={err("time")} className={label}>
            <input name="time" type="time" defaultValue={val("time") ?? "10:00"} step={300} required className={input} />
          </Field>
          <Field label="Motif Doctolib" error={err("visitReasonId")} className={`${label} sm:col-span-2`}>
            <select name="visitReasonId" value={reasonId} onChange={(e) => setReasonId(e.target.value)} className={input}>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          {reason && (
            <p className="rounded-xl bg-brand-soft px-4 py-3 text-[14px] sm:col-span-2">
              Geste prérempli : <strong>{reason.act}</strong>. Signature {reason.aes ? "avancée (pièce d'identité + SMS)" : "simple + code SMS"}.
            </p>
          )}
          <Field label="Localisation prévue" error={err("location")} className={`${label} sm:col-span-2`}>
            <input name="location" defaultValue={val("location")} placeholder="Ex. genou droit" className={input} />
          </Field>
          <Field
            label="Langue du patient"
            error={err("locale")}
            className={`${label} sm:col-span-2`}
            hint={
              reason && !reason.locales.includes(locale as Locale)
                ? "Traduction pas encore validée par le médecin (page Modèles) : le patient recevra la version française."
                : "SMS, écrans et document signé dans cette langue. Le patient peut aussi changer de langue lui-même."
            }
          >
            <select name="locale" value={locale} onChange={(e) => setLocale(e.target.value)} className={input}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABEL_FR[l].replace(/^./, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <fieldset>
          <legend className="text-[16px] font-semibold">Envoi</legend>
          <div className="mt-3 flex flex-col gap-2 text-[15px]">
            {[
              ["sms", "Envoyer le lien par SMS maintenant"],
              ["email", "Envoyer le lien par e-mail maintenant"],
              ["sms_email", "SMS et e-mail"],
              ["manual_link", "Je colle le lien moi-même dans Doctolib"],
            ].map(([value, text]) => (
              <label key={value} className="flex min-h-11 items-center gap-3">
                <input type="radio" name="channel" value={value} defaultChecked={(val("channel") ?? "sms") === value} className="h-5 w-5 accent-brand" />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      {state?.error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {state.error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending} className="h-12">
          {pending ? "Création…" : "Créer la demande"}
        </Button>
        <Link href="/cabinet" className={buttonClass("secondary", "h-12")}>
          Annuler
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      {label}
      {children}
      {hint && <span className="text-[13px] font-normal text-muted">{hint}</span>}
      {error && <span className="text-[13px] font-medium text-danger">{error}</span>}
    </label>
  );
}
