"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getGuide, guideIdForPath, type GuideId, type GuideSection } from "@/guide";
import { LangSwitch, useGuideLang } from "./guide-lang";
import { guideText } from "./guide-text";

// The user guide under each cabinet page: what the page is for, the steps to use it, and what to
// prepare first. Open on a page's first visit on this device, closed after that unless the person
// opens it again: their last open or close is remembered per page.

const KEY = (id: GuideId) => `eclaira.guide.open.${id}`;

function openOnLoad(id: GuideId): boolean {
  try {
    const v = localStorage.getItem(KEY(id));
    if (v !== null) return v === "1";
    localStorage.setItem(KEY(id), "0");
  } catch {
    /* private mode: every visit is a first visit */
  }
  return true;
}

function remember(id: GuideId, open: boolean) {
  try {
    localStorage.setItem(KEY(id), open ? "1" : "0");
  } catch {
    /* private mode */
  }
}

function Section({ section }: { section: GuideSection }) {
  const lines = section.steps ?? section.items ?? [];
  const List = section.steps ? "ol" : "ul";
  return (
    <section className={section.kind === "install" ? "rounded-xl border border-warn-line bg-[#fff8ee] p-4" : ""}>
      <h3 className="text-[15px] font-semibold">{section.heading}</h3>
      <List className={`mt-1.5 flex flex-col gap-1 pl-5 text-[14px] text-ink-2 ${section.steps ? "list-decimal" : "list-disc"}`}>
        {lines.map((line) => (
          <li key={line}>{guideText(line)}</li>
        ))}
      </List>
    </section>
  );
}

export function PageGuide() {
  const id = guideIdForPath(usePathname());
  const lang = useGuideLang();
  // Unknown until mounted: the server can't read this device's choice, so it renders it closed.
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    // Reading localStorage can only happen after mount; one render later is the intended cost.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(id ? openOnLoad(id) : null);
  }, [id]);
  if (!id) return null;
  const guide = getGuide(id, lang);
  const t = lang === "fr" ? { label: "Guide d'utilisation", show: "Afficher", hide: "Masquer" } : { label: "User guide", show: "Show me how", hide: "Hide" };

  return (
    <details
      className="rounded-2xl border border-line bg-white"
      open={open ?? false}
      onToggle={(e) => {
        // Rendering with `open` fires a toggle too; only a change the person made is remembered.
        const now = e.currentTarget.open;
        if (open === null || now === open) return;
        setOpen(now);
        remember(id, now);
      }}
      lang={lang}
    >
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-3 px-5 py-2">
        <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand-dark">
          ?
        </span>
        <span className="flex-1 text-[15px] font-semibold">
          {t.label}
          {lang === "fr" ? " : " : ": "}
          {guide.title}
        </span>
        <span className="text-[13px] text-muted">{open ? t.hide : t.show}</span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-line px-5 pb-5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {guide.intro && <p className="max-w-3xl flex-1 text-[14px] text-ink-2">{guideText(guide.intro)}</p>}
          <LangSwitch lang={lang} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {guide.sections.map((s) => (
            <Section key={s.heading} section={s} />
          ))}
        </div>
      </div>
    </details>
  );
}
