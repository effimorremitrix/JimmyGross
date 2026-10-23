"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, cx, Icon } from "@/components/ui";
import type { ConsentBlock, InfoSection, PrecheckAnswers, Question, SignatureLevel } from "@/domain/types";
import { confirmOtp, markSectionRead, resendOtp, submitConsent, submitPrecheck } from "./actions";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

export type FlowStep = "welcome" | "info" | "precheck" | "consent" | "id" | "otp";

interface Props {
  token: string;
  initialStep: FlowStep;
  firstName: string;
  fullName: string;
  birthDate: string;
  phoneMasked: string;
  practicePhone: string;
  appointmentLabel: string;
  visitReason: string;
  plannedAct: string;
  plannedLocation: string;
  level: SignatureLevel;
  mockAes: boolean;
  intro: string[];
  sections: InfoSection[];
  readIds: string[];
  questions: Question[];
  initialAnswers: PrecheckAnswers | null;
  consent: ConsentBlock;
  demoMode: boolean;
}

export function PatientFlow(p: Props) {
  const [step, setStep] = useState<FlowStep>(p.initialStep);
  const [otpInfo, setOtpInfo] = useState<{ demoCode?: string; phoneMasked: string }>({ phoneMasked: p.phoneMasked });
  const signatureRef = useRef<string | null>(null);
  const ackRef = useRef(false);

  const steps: FlowStep[] = p.mockAes ? ["info", "precheck", "consent", "id", "otp"] : ["info", "precheck", "consent", "otp"];
  const idx = steps.indexOf(step);
  const labels: Record<FlowStep, string> = {
    welcome: "",
    info: "Fiche d'information",
    precheck: "Questionnaire",
    consent: "Consentement",
    id: "Identité",
    otp: "Code SMS",
  };

  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.getElementById("step-title")?.focus();
  }, [step]);

  return (
    <div className="flex flex-col gap-5">
      {step !== "welcome" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-muted">
            Étape {idx + 1} sur {steps.length} · {labels[step]}
          </p>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-brand-soft"
            role="progressbar"
            aria-label="Progression"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={idx + 1}
          >
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
          </div>
        </div>
      )}

      {step === "welcome" && <Welcome {...p} onStart={() => setStep("info")} />}
      {step === "info" && <InfoStep {...p} onDone={() => setStep("precheck")} />}
      {step === "precheck" && <PrecheckStep {...p} onBack={() => setStep("info")} onDone={() => setStep("consent")} />}
      {step === "consent" && (
        <ConsentStep
          {...p}
          onBack={() => setStep("precheck")}
          onReady={(png, ack) => {
            signatureRef.current = png;
            ackRef.current = ack;
            if (p.mockAes) setStep("id");
            return !p.mockAes;
          }}
          onOtp={(info) => {
            setOtpInfo(info);
            setStep("otp");
          }}
        />
      )}
      {step === "id" && (
        <IdStep
          token={p.token}
          onBack={() => setStep("consent")}
          signature={() => ({ png: signatureRef.current, ack: ackRef.current })}
          onOtp={(info) => {
            setOtpInfo(info);
            setStep("otp");
          }}
        />
      )}
      {step === "otp" && <OtpStep token={p.token} info={otpInfo} demoMode={p.demoMode} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Welcome(p: Props & { onStart(): void }) {
  return (
    <section className="flex flex-col gap-5">
      <h1 id="step-title" tabIndex={-1} className="text-2xl font-bold leading-tight outline-none">
        Bonjour {p.firstName}, préparons votre rendez-vous
      </h1>
      <div className="rounded-2xl border border-line bg-white p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Votre rendez-vous</p>
        <p className="mt-1 text-[17px] font-semibold">{p.visitReason}</p>
        <p className="text-[14px] text-muted first-letter:uppercase">{p.appointmentLabel}</p>
      </div>
      <p className="text-[15px] leading-relaxed">Avant le geste, merci de compléter ces étapes. Comptez environ 5 minutes.</p>
      <ol className="flex flex-col gap-3">
        {["Lire la fiche d'information", "Répondre au questionnaire de sécurité", "Signer votre consentement"].map((t, i) => (
          <li key={t} className="flex items-center gap-3 text-[15px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand" aria-hidden="true">
              {i + 1}
            </span>
            {t}
          </li>
        ))}
      </ol>
      <div className="rounded-xl bg-brand-soft px-4 py-3 text-[14px] leading-relaxed">
        {p.level === "AES"
          ? "Signature avancée : vous signerez du doigt, puis nous vérifierons votre pièce d'identité et un code reçu par SMS."
          : "Signature : vous signerez du doigt, puis confirmerez avec un code reçu par SMS."}
      </div>
      <ul className="flex flex-col gap-1.5 text-[14px] leading-relaxed text-muted">
        {p.intro.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <Button onClick={p.onStart} className="h-13">
        Commencer
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------------

const TONE: Record<string, string> = {
  neutral: "bg-canvas",
  info: "bg-brand-soft",
  ok: "bg-ok-soft",
  warn: "bg-warn-soft",
  danger: "bg-danger-soft",
};

function InfoStep(p: Props & { onDone(): void }) {
  const [read, setRead] = useState<Set<string>>(new Set(p.readIds));
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const visible = useRef<Record<string, number>>({});
  const since = useRef<Record<string, number>>({});
  const nodes = useRef<Record<string, HTMLElement | null>>({});

  // Time each section actually spends on screen: part of the proof of information.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const now = performance.now();
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.section!;
          if (e.isIntersecting && e.intersectionRatio >= 0.35) {
            since.current[id] ??= now;
          } else if (since.current[id] !== undefined) {
            visible.current[id] = (visible.current[id] ?? 0) + (now - since.current[id]);
            delete since.current[id];
          }
        }
      },
      { threshold: [0, 0.35, 0.7] },
    );
    Object.values(nodes.current).forEach((n) => n && io.observe(n));
    return () => io.disconnect();
  }, []);

  async function ack(id: string) {
    const ms = (visible.current[id] ?? 0) + msSince(since.current[id]);
    setPendingId(id);
    setError(null);
    const res = await markSectionRead(p.token, id, ms);
    setPendingId(null);
    if (!res.ok) return setError(res.error);
    setRead((s) => new Set(s).add(id));
    const idx = p.sections.findIndex((s) => s.id === id);
    const next = p.sections.slice(idx + 1).find((s) => !read.has(s.id));
    if (next) nodes.current[next.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const allRead = p.sections.every((s) => read.has(s.id));

  return (
    <section className="flex flex-col gap-4">
      <h1 id="step-title" tabIndex={-1} className="text-2xl font-bold outline-none">
        Fiche d&apos;information
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-2">
        Lisez chaque partie puis confirmez. Vous pourrez poser toutes vos questions au médecin avant le geste.
      </p>
      <p className="text-[14px] font-medium text-muted" aria-live="polite">
        {read.size} partie{read.size > 1 ? "s" : ""} lue{read.size > 1 ? "s" : ""} sur {p.sections.length}
      </p>
      {p.sections.map((s) => {
        const done = read.has(s.id);
        return (
          <article
            key={s.id}
            data-section={s.id}
            ref={(n) => {
              nodes.current[s.id] = n;
            }}
            className={cx("scroll-mt-4 rounded-2xl border bg-white p-5", done ? "border-ok/30" : "border-line")}
            aria-labelledby={`h-${s.id}`}
          >
            <h2 id={`h-${s.id}`} className="text-[17px] font-semibold">
              {s.title}
            </h2>
            <div className="mt-2 flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2">
              {s.paragraphs.map((t) => (
                <p key={t}>{t}</p>
              ))}
              {s.callouts?.map((c) => (
                <div key={c.heading} className={cx("rounded-xl px-4 py-3", TONE[c.tone])}>
                  <p className="font-semibold text-ink">{c.heading}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {c.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => ack(s.id)}
              disabled={done || pendingId === s.id}
              aria-pressed={done}
              className={cx(
                "mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-[15px] font-semibold",
                done ? "border-ok/40 bg-ok-soft text-ok" : "border-line-strong bg-white text-brand hover:bg-brand-soft",
              )}
            >
              {done && <Icon name="check" />}
              {done ? "Lu" : pendingId === s.id ? "Enregistrement…" : "J'ai lu cette partie"}
            </button>
          </article>
        );
      })}
      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {error}
        </p>
      )}
      <StickyBar>
        <Button className="h-13 flex-1" disabled={!allRead} onClick={p.onDone}>
          {allRead ? "Continuer" : `Encore ${p.sections.length - read.size} partie(s) à lire`}
        </Button>
      </StickyBar>
    </section>
  );
}

// ---------------------------------------------------------------------------

function PrecheckStep(p: Props & { onBack(): void; onDone(): void }) {
  const [items, setItems] = useState<PrecheckAnswers["items"]>(p.initialAnswers?.items ?? {});
  const [ec, setEc] = useState(p.initialAnswers?.emergencyContact ?? { name: "", phone: "", relation: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const complete = p.questions.every((q) => {
    const a = items[q.id];
    return a && (a.answer === "non" || !q.detailPrompt || a.detail?.trim());
  });

  function set(id: string, patch: Partial<{ answer: "oui" | "non"; detail: string }>) {
    setItems((s) => ({ ...s, [id]: { ...(s[id] ?? { answer: "non" }), ...patch } as PrecheckAnswers["items"][string] }));
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await submitPrecheck(p.token, {
        items,
        emergencyContact: p.consent.collectEmergencyContact && ec.name ? ec : undefined,
      });
      if (res.ok) p.onDone();
      else setError(res.error);
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 id="step-title" tabIndex={-1} className="text-2xl font-bold outline-none">
        Questionnaire avant le geste
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-2">
        Une réponse « Oui » ne contre-indique pas toujours le geste, mais peut nécessiter une adaptation ou un report. Le
        cabinet en est informé avant votre venue.
      </p>
      {p.questions.map((q, i) => {
        const a = items[q.id];
        return (
          <fieldset key={q.id} className="rounded-2xl border border-line bg-white p-4">
            <legend className="sr-only">{q.text}</legend>
            <p className="text-[15px] font-medium leading-snug" aria-hidden="true">
              <span className="text-muted">{i + 1}. </span>
              {q.text}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["oui", "non"] as const).map((v) => (
                <label
                  key={v}
                  className={cx(
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-[15px] font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[#9cc0ea]",
                    a?.answer === v ? "border-brand bg-brand text-white" : "border-[#c9d4e2] bg-white text-ink",
                  )}
                >
                  <input type="radio" className="sr-only" name={q.id} value={v} checked={a?.answer === v} onChange={() => set(q.id, { answer: v })} />
                  {v === "oui" ? "Oui" : "Non"}
                </label>
              ))}
            </div>
            {a?.answer === "oui" && q.detailPrompt && (
              <label className="mt-3 flex flex-col gap-1 text-[14px] font-semibold">
                {q.detailPrompt}
                <input
                  className="h-12 rounded-xl border border-line-strong px-3 text-[16px] font-normal"
                  value={a.detail ?? ""}
                  maxLength={300}
                  onChange={(e) => set(q.id, { detail: e.target.value })}
                />
              </label>
            )}
            {a?.answer === "oui" && q.flag && (
              <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-[14px] text-warn">{q.flag.patientNotice}</p>
            )}
          </fieldset>
        );
      })}

      {p.consent.collectEmergencyContact && (
        <fieldset className="rounded-2xl border border-line bg-white p-4">
          <legend className="px-1 text-[15px] font-semibold">Personne à contacter en cas de problème (facultatif)</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[14px]">
              Nom
              <input className="h-12 rounded-xl border border-line-strong px-3 text-[16px]" value={ec.name} autoComplete="off" onChange={(e) => setEc({ ...ec, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[14px]">
              Téléphone
              <input className="h-12 rounded-xl border border-line-strong px-3 text-[16px]" inputMode="tel" value={ec.phone} autoComplete="off" onChange={(e) => setEc({ ...ec, phone: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[14px] sm:col-span-2">
              Lien de parenté ou relation
              <input className="h-12 rounded-xl border border-line-strong px-3 text-[16px]" value={ec.relation} onChange={(e) => setEc({ ...ec, relation: e.target.value })} />
            </label>
          </div>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {error}
        </p>
      )}
      <StickyBar>
        <Button variant="secondary" onClick={p.onBack} className="h-13">
          Retour
        </Button>
        <Button className="h-13 flex-1" disabled={!complete || pending} onClick={submit}>
          {pending ? "Envoi…" : "Continuer"}
        </Button>
      </StickyBar>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ConsentStep(
  p: Props & {
    onBack(): void;
    /** Returns true when the flow should start signing right away. */
    onReady(png: string, ack: boolean): boolean;
    onOtp(info: { demoCode?: string; phoneMasked: string }): void;
  },
) {
  const pad = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const onInk = useCallback((v: boolean) => setHasInk(v), []);
  const birth = useMemo(() => p.birthDate.split("-").reverse().join("/"), [p.birthDate]);

  function next() {
    const png = pad.current?.toPng();
    if (!png) return setError("Merci de signer dans le cadre.");
    if (!ack) return setError("Merci de cocher la déclaration.");
    setError(null);
    if (!p.onReady(png, ack)) return;
    start(async () => {
      const res = await submitConsent(p.token, { signaturePng: png, acknowledged: ack });
      if (!res.ok) return setError(res.error);
      if (res.mode === "redirect") window.location.assign(res.url);
      else p.onOtp({ demoCode: res.demoCode, phoneMasked: res.phoneMasked });
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 id="step-title" tabIndex={-1} className="text-2xl font-bold outline-none">
        Votre consentement
      </h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl border border-line bg-white p-4 text-[15px]">
        <dt className="text-muted">Patient</dt>
        <dd className="text-right font-semibold">{p.fullName}</dd>
        <dt className="text-muted">Né(e) le</dt>
        <dd className="text-right font-semibold">{birth}</dd>
        <dt className="text-muted">Geste prévu</dt>
        <dd className="text-right font-semibold">{p.plannedAct}</dd>
        {p.plannedLocation && (
          <>
            <dt className="text-muted">Localisation</dt>
            <dd className="text-right font-semibold">{p.plannedLocation}</dd>
          </>
        )}
        <dd className="col-span-2 text-[13px] text-muted">Le geste sera confirmé par le médecin le jour de l&apos;acte.</dd>
      </dl>

      <label className="flex cursor-pointer gap-3 rounded-2xl border border-line bg-white p-4 text-[15px] leading-relaxed">
        <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-brand" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span className="flex flex-col gap-2">
          {p.consent.statement.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold" id="sig-label">
          Votre signature
        </p>
        <SignaturePad ref={pad} onChange={onInk} fullName={p.fullName} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {error}
        </p>
      )}
      <StickyBar>
        <Button variant="secondary" onClick={p.onBack} className="h-13">
          Retour
        </Button>
        <Button className="h-13 flex-1" disabled={!hasInk || !ack || pending} onClick={next}>
          {pending ? "Préparation…" : p.level === "AES" ? "Continuer" : "Recevoir mon code SMS"}
        </Button>
      </StickyBar>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Demo-only identity step (mock AES). With Yousign, the ID check is hosted by Yousign. */
function IdStep(p: {
  token: string;
  onBack(): void;
  signature(): { png: string | null; ack: boolean };
  onOtp(info: { demoCode?: string; phoneMasked: string }): void;
}) {
  const [picked, setPicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function next() {
    const { png, ack } = p.signature();
    if (!png) return setError("Signature manquante, revenez à l'étape précédente.");
    start(async () => {
      const res = await submitConsent(p.token, { signaturePng: png, acknowledged: ack });
      if (!res.ok) return setError(res.error);
      if (res.mode === "redirect") window.location.assign(res.url);
      else p.onOtp({ demoCode: res.demoCode, phoneMasked: res.phoneMasked });
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 id="step-title" tabIndex={-1} className="text-2xl font-bold outline-none">
        Vérification d&apos;identité
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-2">
        Pour une signature avancée, votre pièce d&apos;identité est vérifiée. Elle sert uniquement à prouver que c&apos;est bien
        vous qui signez.
      </p>
      <label
        className={cx(
          "flex h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 text-[15px] font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[#9cc0ea]",
          picked ? "border-ok/40 bg-ok-soft text-ok" : "border-dashed border-line-strong bg-white text-brand",
        )}
      >
        <Icon name={picked ? "check" : "id"} className="h-10 w-10" />
        {picked ? "Pièce vérifiée" : "Photographier ma pièce d'identité"}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPicked(!!e.target.files?.length)} />
      </label>
      <p className="rounded-xl bg-warn-soft px-4 py-3 text-[13px] text-warn">
        Démonstration : la photo n&apos;est ni envoyée ni conservée. En production, cette étape est réalisée par le prestataire
        de signature certifié.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {error}
        </p>
      )}
      <StickyBar>
        <Button variant="secondary" onClick={p.onBack} className="h-13">
          Retour
        </Button>
        <Button className="h-13 flex-1" disabled={!picked || pending} onClick={next}>
          {pending ? "Préparation…" : "Recevoir mon code SMS"}
        </Button>
      </StickyBar>
    </section>
  );
}

// ---------------------------------------------------------------------------

function OtpStep({ token, info, demoMode }: { token: string; info: { demoCode?: string; phoneMasked: string }; demoMode: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [demo, setDemo] = useState(info.demoCode);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await confirmOtp(token, code);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function resend() {
    setError(null);
    start(async () => {
      const res = await resendOtp(token);
      if (res.ok) {
        setDemo(res.demoCode);
        setNotice("Un nouveau code vient d'être envoyé.");
      } else setError(res.error);
    });
  }

  return (
    <form onSubmit={confirm} className="flex flex-col gap-4">
      <h1 id="step-title" tabIndex={-1} className="text-2xl font-bold outline-none">
        Code de confirmation
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-2">Nous avons envoyé un code à 6 chiffres au {info.phoneMasked}.</p>
      {demoMode && demo && (
        <p className="rounded-xl bg-brand-soft px-4 py-3 text-[14px]">
          Mode démonstration : votre code est <strong className="tabular-nums tracking-widest">{demo}</strong>
        </p>
      )}
      <label className="flex flex-col gap-2 text-[15px] font-semibold">
        Code reçu par SMS
        <input
          className="h-14 rounded-xl border border-line-strong bg-white text-center text-2xl font-semibold tracking-[0.5em] tabular-nums"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </label>
      {notice && (
        <p className="text-[14px] text-ok" aria-live="polite">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {error}
        </p>
      )}
      <Button type="submit" className="h-13" disabled={code.length !== 6 || pending}>
        {pending ? "Signature…" : "Valider et signer"}
      </Button>
      <button type="button" onClick={resend} disabled={pending} className="min-h-11 self-start text-[15px] font-medium text-brand underline-offset-2 hover:underline">
        Renvoyer le code
      </button>
    </form>
  );
}

/** Milliseconds since a performance.now() mark (0 when unset). Event-handler use only. */
function msSince(mark: number | undefined): number {
  return mark === undefined ? 0 : performance.now() - mark;
}

function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-2 flex gap-3 border-t border-line bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      {children}
    </div>
  );
}
