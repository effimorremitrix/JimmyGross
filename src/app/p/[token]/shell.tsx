"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { cx, Icon, Logo } from "@/components/ui";

export function Shell({
  children,
  header,
  wide,
}: {
  children: ReactNode;
  header?: { practitioner: string; specialty: string };
  wide?: boolean;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-white">
        <div className={cx("mx-auto flex flex-col gap-1 px-5 py-4", wide ? "max-w-2xl" : "max-w-md")}>
          <Logo />
          {header && (
            <p className="text-[13px] text-muted">
              {header.practitioner} · {header.specialty}
            </p>
          )}
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
