import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function buttonClass(variant: Variant = "primary", extra?: string) {
  return cx(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    variant === "primary" && "bg-brand text-white hover:bg-brand-dark",
    variant === "secondary" && "border border-[#c9d4e2] bg-white text-ink hover:bg-canvas",
    variant === "ghost" && "px-0 text-brand hover:underline",
    variant === "danger" && "border border-danger/30 bg-white text-danger hover:bg-danger-soft",
    extra,
  );
}

export function Button({
  variant = "primary",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...rest} className={buttonClass(variant, className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-line bg-white", className)}>{children}</div>;
}

export type Tone = "ok" | "warn" | "danger" | "progress" | "idle" | "muted" | "info";

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "progress" && "bg-brand-soft text-brand-dark",
        tone === "info" && "bg-brand-soft text-brand-dark",
        tone === "idle" && "bg-[#eef1f5] text-[#3a4a5e]",
        tone === "muted" && "bg-[#eef1f5] text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-brand">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      <span className="font-bold tracking-tight">Éclaira</span>
    </span>
  );
}

export function Icon({ name, className }: { name: "check" | "alert" | "copy" | "phone" | "doc" | "back" | "id" | "lock"; className?: string }) {
  const p: Record<string, ReactNode> = {
    check: <path d="M5 12l5 5 9-10" />,
    alert: (
      <>
        <path d="M12 3l9.5 17h-19L12 3z" />
        <path d="M12 10v4M12 17.5v.01" />
      </>
    ),
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V6a2 2 0 0 1 2-2h9" />
      </>
    ),
    phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
    doc: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </>
    ),
    back: <path d="M15 18l-6-6 6-6" />,
    id: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="11" r="2.2" />
        <path d="M5.8 16c.8-1.6 2-2.4 3.2-2.4s2.4.8 3.2 2.4M14 10h4M14 13h3" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cx("h-5 w-5", className)}>
      {p[name]}
    </svg>
  );
}
