"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { cx, Icon, Logo } from "@/components/ui";
import { LOCALE_NAME, type Locale } from "@/domain/i18n";
import { patientText } from "@/i18n/patient";
import { setLanguage } from "./actions";

export function Shell({
  children,
  header,
  wide,
  locale,
  switcher,
}: {
  children: ReactNode;
  header?: { practitioner: string; specialty: string };
  wide?: boolean;
  locale: Locale;
  /** Shown when the document exists in more than one language and consent is not given yet. */
  switcher?: { token: string; locales: Locale[] };
}) {
  return (
    <div className="min-h-dvh bg-canvas" lang={locale}>
      <header className="border-b border-line bg-white">
        <div className={cx("mx-auto flex items-start justify-between gap-3 px-5 py-4", wide ? "max-w-2xl" : "max-w-md")}>
          <div className="flex flex-col gap-1">
            <Logo />
            {header && (
              <p className="text-[13px] text-muted">
                {header.practitioner} · {header.specialty}
              </p>
            )}
          </div>
          {switcher && switcher.locales.length > 1 && <LanguageSwitcher {...switcher} current={locale} />}
        </div>
      </header>
      <main id="contenu" className={cx("mx-auto px-5 py-6", wide ? "max-w-2xl" : "max-w-md")}>
        {children}
      </main>
    </div>
  );
}

export function StatusMessage({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "ok" | "warn" | "info";
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-4 pt-8 text-center" aria-live="polite">
      <div
        className={cx(
          "flex h-16 w-16 items-center justify-center rounded-full",
          tone === "ok" && "bg-ok-soft text-ok",
          tone === "warn" && "bg-warn-soft text-warn",
          tone === "info" && "bg-brand-soft text-brand",
        )}
      >
        <Icon name={tone === "ok" ? "check" : tone === "warn" ? "alert" : "lock"} className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-[15px] leading-relaxed text-ink-2">{children}</p>
    </section>
  );
}

export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

/** Language toggle: each language is named in itself, so a patient can always find theirs. */
function LanguageSwitcher({ token, locales, current }: { token: string; locales: Locale[]; current: Locale }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(l: Locale) {
    if (l === current) return;
    setError(null);
    start(async () => {
      const res = await setLanguage(token, l);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div role="group" aria-label={patientText(current).language} className="flex rounded-xl border border-line-strong p-0.5">
        {locales.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            onClick={() => pick(l)}
            disabled={pending}
            aria-pressed={l === current}
            className={cx(
              "min-h-11 min-w-11 rounded-[10px] px-3 text-[14px] font-semibold",
              l === current ? "bg-brand text-white" : "text-brand hover:bg-brand-soft",
            )}
          >
            {LOCALE_NAME[l]}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
