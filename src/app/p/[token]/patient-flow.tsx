"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, cx, Icon } from "@/components/ui";
import type { Locale } from "@/domain/i18n";
import type { ConsentBlock, InfoSection, PrecheckAnswers, Question, SignatureLevel } from "@/domain/types";
import { patientText, type PatientText } from "@/i18n/patient";
import { confirmOtp, markFullTextOpened, markSectionRead, resendOtp, submitConsent, submitPrecheck } from "./actions";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

type OtpInfo = { demoCode?: string; sentTo: string };

export type FlowStep = "welcome" | "info" | "precheck" | "consent" | "id" | "otp";

interface Props {
  token: string;
  locale: Locale;
  initialStep: FlowStep;
  firstName: string;
  fullName: string;
  birthDate: string | null;
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
  fullTextIds: string[];
  /** Summaries are shown only once the practitioner approved them (or in demo). */
  useSummaries: boolean;
  questions: Question[];
  initialAnswers: PrecheckAnswers | null;
  consent: ConsentBlock;
  demoMode: boolean;
}

export function PatientFlow(p: Props) {
  const t = patientText(p.locale);
  const [step, setStep] = useState<FlowStep>(p.initialStep);
  const [otpInfo, setOtpInfo] = useState<OtpInfo>({ sentTo: t.otpSentDefault });
  const signatureRef = useRef<string | null>(null);
  const ackRef = useRef(false);

  const steps: FlowStep[] = p.mockAes ? ["info", "precheck", "consent", "id", "otp"] : ["info", "precheck", "consent", "otp"];
  const idx = steps.indexOf(step);
  const labels: Record<FlowStep, string> = {
    welcome: "",
    info: t.stepInfo,
    precheck: t.stepPrecheck,
    consent: t.stepConsent,
    id: t.stepId,
    otp: t.stepOtp,
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
            {t.stepOf(idx + 1, steps.length, labels[step])}
          </p>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-brand-soft"
            role="progressbar"
            aria-label={t.progress}
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
          t={t}
          onBack={() => setStep("consent")}
          signature={() => ({ png: signatureRef.current, ack: ackRef.current })}
          onOtp={(info) => {
            setOtpInfo(info);
            setStep("otp");
          }}
        />
      )}
      {step === "otp" && <OtpStep token={p.token} t={t} info={otpInfo} demoMode={p.demoMode} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Welcome(p: Props & { onStart(): void }) {
  const t = patientText(p.locale);
  return (
    <section className="flex flex-col gap-5">
      <h1 id="step-title" tabIndex={-1} className="text-2xl font-bold leading-tight outline-none">
        {t.welcomeTitle(p.firstName)}
      </h1>
      <div className="rounded-2xl border border-line bg-white p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">{t.yourAppointment}</p>
        <p className="mt-1 text-[17px] font-semibold">{p.visitReason}</p>
        <p className="text-[14px] text-muted first-letter:uppercase">{p.appointmentLabel}</p>
      </div>
      <p className="text-[15px] leading-relaxed">{t.welcomeLead}</p>
      <ol className="flex flex-col gap-3">
        {t.welcomeSteps.map((label, i) => (
          <li key={label} className="flex items-center gap-3 text-[15px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand" aria-hidden="true">
              {i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <div className="rounded-xl bg-brand-soft px-4 py-3 text-[14px] leading-relaxed">
        {p.level === "AES" ? t.levelAes : t.levelSes}
      </div>
      <ul className="flex flex-col gap-1.5 text-[14px] leading-relaxed text-muted">
        {p.intro.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Button onClick={p.onStart} className="h-13">
        {t.start}
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

function FullText({ section }: { section: InfoSection }) {
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2">
      {section.paragraphs.map((para) => (
        <p key={para}>{para}</p>
      ))}
      {section.callouts?.map((c) => (
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
  );
}

function InfoStep(p: Props & { onDone(): void }) {
  const t = patientText(p.locale);
  const [read, setRead] = useState<Set<string>>(new Set(p.readIds));
  const [opened, setOpened] = useState<Set<string>>(new Set(p.fullTextIds));
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

  function openFull(id: string) {
    if (opened.has(id)) return;
    setOpened((s) => new Set(s).add(id));
    void markFullTextOpened(p.token, id);
  }

  const allRead = p.sections.every((s) => read.has(s.id));

  return (
    <section className="flex flex-col gap-4">
      <h1 id="step-title" tabIndex={-1} className="text-2xl font-bold outline-none">
        {t.infoTitle}
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-2">{p.useSummaries ? t.infoLeadSummaries : t.infoLeadFull}</p>
      <a
        href={`/p/${p.token}/document`}
        target="_blank"
        rel="noopener"
        className="inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-medium text-brand underline-offset-2 hover:underline"
      >
        <Icon name="doc" />
        {t.fullPdf}
        <span className="sr-only">{t.opensNewTab}</span>
      </a>
      <p className="text-[14px] font-medium text-muted" aria-live="polite">
        {t.partsRead(read.size, p.sections.length)}
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
            {p.useSummaries ? (
              <>
                <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-ink">
                  {s.summary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <details
                  className="group mt-3 rounded-xl border border-line"
                  onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && openFull(s.id)}
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-[15px] font-medium text-brand [&::-webkit-details-marker]:hidden">
                    <span>{opened.has(s.id) ? t.fullTextOpened : t.readFullText}</span>
                    <Icon name="back" className="-rotate-90 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="border-t border-line px-4 py-3">
                    <FullText section={s} />
                  </div>
                </details>
              </>
            ) : (
              <div className="mt-2">
                <FullText section={s} />
              </div>
            )}
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
              {done ? t.read : pendingId === s.id ? t.saving : t.iReadThis}
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
          {allRead ? t.continue : t.partsLeft(p.sections.length - read.size)}
        </Button>
      </StickyBar>
    </section>
  );
}

// ---------------------------------------------------------------------------

function PrecheckStep(p: Props & { onBack(): void; onDone(): void }) {
  const t = patientText(p.locale);
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
        {t.precheckTitle}
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-2">{t.precheckLead}</p>
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
                  {v === "oui" ? t.yes : t.no}
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
          <legend className="px-1 text-[15px] font-semibold">{t.emergencyContact}</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[14px]">
              {t.ecName}
              <input className="h-12 rounded-xl border border-line-strong px-3 text-[16px]" value={ec.name} autoComplete="off" onChange={(e) => setEc({ ...ec, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[14px]">
              {t.ecPhone}
              <input className="h-12 rounded-xl border border-line-strong px-3 text-[16px]" inputMode="tel" value={ec.phone} autoComplete="off" onChange={(e) => setEc({ ...ec, phone: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[14px] sm:col-span-2">
              {t.ecRelation}
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
          {t.back}
        </Button>
        <Button className="h-13 flex-1" disabled={!complete || pending} onClick={submit}>
          {pending ? t.sending : t.continue}
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
    onOtp(info: OtpInfo): void;
  },
) {
  const t = patientText(p.locale);
  const pad = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const onInk = useCallback((v: boolean) => setHasInk(v), []);
  const birth = useMemo(() => p.birthDate?.split("-").reverse().join("/") ?? null, [p.birthDate]);

  function next() {
    const png = pad.current?.toPng();
    if (!png) return setError(t.pleaseSign);
    if (!ack) return setError(t.pleaseTick);
    setError(null);
    if (!p.onReady(png, ack)) return;
    start(async () => {
      const res = await submitConsent(p.token, { signaturePng: png, acknowledged: ack });
      if (!res.ok) return setError(res.error);
      if (res.mode === "redirect") window.location.assign(res.url);
      else p.onOtp({ demoCode: res.demoCode, sentTo: res.sentTo });
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 id="step-title" tabIndex={-1} className="text-2xl font-bold outline-none">
        {t.consentTitle}
      </h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl border border-line bg-white p-4 text-[15px]">
        <dt className="text-muted">{t.patient}</dt>
        <dd className="text-right font-semibold">{p.fullName}</dd>
        {birth && (
          <>
            <dt className="text-muted">{t.bornOn}</dt>
            <dd className="text-right font-semibold">{birth}</dd>
          </>
        )}
        <dt className="text-muted">{t.plannedAct}</dt>
        <dd className="text-right font-semibold">{p.plannedAct}</dd>
        {p.plannedLocation && (
          <>
            <dt className="text-muted">{t.location}</dt>
            <dd className="text-right font-semibold">{p.plannedLocation}</dd>
          </>
        )}
        <dd className="col-span-2 text-[13px] text-muted">{t.confirmedOnDay}</dd>
      </dl>

      <label className="flex cursor-pointer gap-3 rounded-2xl border border-line bg-white p-4 text-[15px] leading-relaxed">
        <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-brand" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span className="flex flex-col gap-2">
          {p.consent.statement.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold" id="sig-label">
          {t.yourSignature}
        </p>
        <SignaturePad ref={pad} onChange={onInk} fullName={p.fullName} t={t} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {error}
        </p>
      )}
      <StickyBar>
        <Button variant="secondary" onClick={p.onBack} className="h-13">
          {t.back}
        </Button>
        <Button className="h-13 flex-1" disabled={!hasInk || !ack || pending} onClick={next}>
          {pending ? t.preparing : p.level === "AES" ? t.continue : t.getSigningCode}
        </Button>
      </StickyBar>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Demo-only identity step (mock AES). With Yousign, the ID check is hosted by Yousign. */
function IdStep(p: {
  token: string;
  t: PatientText;
  onBack(): void;
  signature(): { png: string | null; ack: boolean };
  onOtp(info: OtpInfo): void;
}) {
  const { t } = p;
  const [picked, setPicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function next() {
    const { png, ack } = p.signature();
    if (!png) return setError(t.signatureMissing);
    start(async () => {
      const res = await submitConsent(p.token, { signaturePng: png, acknowledged: ack });
      if (!res.ok) return setError(res.error);
      if (res.mode === "redirect") window.location.assign(res.url);
      else p.onOtp({ demoCode: res.demoCode, sentTo: res.sentTo });
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 id="step-title" tabIndex={-1} className="text-2xl font-bold outline-none">
        {t.idTitle}
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-2">{t.idLead}</p>
      <label
        className={cx(
          "flex h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 text-[15px] font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[#9cc0ea]",
          picked ? "border-ok/40 bg-ok-soft text-ok" : "border-dashed border-line-strong bg-white text-brand",
        )}
      >
        <Icon name={picked ? "check" : "id"} className="h-10 w-10" />
        {picked ? t.idChecked : t.idTakePhoto}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPicked(!!e.target.files?.length)} />
      </label>
      <p className="rounded-xl bg-warn-soft px-4 py-3 text-[13px] text-warn">{t.idDemo}</p>
      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          {error}
        </p>
      )}
      <StickyBar>
        <Button variant="secondary" onClick={p.onBack} className="h-13">
          {t.back}
        </Button>
        <Button className="h-13 flex-1" disabled={!picked || pending} onClick={next}>
          {pending ? t.preparing : t.getSigningCode}
        </Button>
      </StickyBar>
    </section>
  );
}

// ---------------------------------------------------------------------------

function OtpStep({ token, t, info, demoMode }: { token: string; t: PatientText; info: OtpInfo; demoMode: boolean }) {
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
        setNotice(t.newCodeSent);
      } else setError(res.error);
    });
  }

  return (
    <form onSubmit={confirm} className="flex flex-col gap-4">
      <h1 id="step-title" tabIndex={-1} className="text-2xl font-bold outline-none">
        {t.otpTitle}
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-2">{t.otpSent(info.sentTo)}</p>
      {demoMode && demo && (
        <p className="rounded-xl bg-brand-soft px-4 py-3 text-[14px]">
          {t.demoCode} <strong className="tabular-nums tracking-widest">{demo}</strong>
        </p>
      )}
      <label className="flex flex-col gap-2 text-[15px] font-semibold">
        {t.signingCode}
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
        {pending ? t.signing : t.validateAndSign}
      </Button>
      <button type="button" onClick={resend} disabled={pending} className="min-h-11 self-start text-[15px] font-medium text-brand underline-offset-2 hover:underline">
        {t.resendCode}
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
