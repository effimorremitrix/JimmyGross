"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/cabinet" ? path === "/cabinet" : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex min-h-11 items-center rounded-lg px-3 text-[14px] font-medium",
        active ? "bg-brand-soft text-brand-dark" : "text-ink-2 hover:bg-canvas",
      )}
    >
      {children}
    </Link>
  );
}
