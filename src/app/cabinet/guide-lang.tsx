"use client";

import { useSyncExternalStore } from "react";
import { isGuideLang, type GuideLang } from "@/guide";

// The language the guide and the assistant are read in, remembered on this device. The cabinet
// screens themselves stay French; this only changes the help around them.

const KEY = "eclaira.guide.lang";
const EVENT = "eclaira:guide-lang";

function read(): GuideLang {
  try {
    const v = localStorage.getItem(KEY);
    if (isGuideLang(v)) return v;
  } catch {
    /* private mode */
  }
  return "fr";
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useGuideLang(): GuideLang {
  return useSyncExternalStore(subscribe, read, () => "fr");
}

export function setGuideLang(lang: GuideLang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* private mode: the choice lasts until the page reloads */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** FR | EN switch, shared by the guide panel and the assistant. */
export function LangSwitch({ lang }: { lang: GuideLang }) {
  return (
    <div role="group" aria-label={lang === "fr" ? "Langue du guide" : "Guide language"} className="flex rounded-lg border border-line text-[13px] font-semibold">
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => setGuideLang(l)}
          className={lang === l ? "min-h-9 rounded-lg bg-brand-soft px-2.5 text-brand-dark" : "min-h-9 rounded-lg px-2.5 text-ink-2 hover:bg-canvas"}
        >
          {l === "fr" ? "FR" : "EN"}
          <span className="sr-only">{l === "fr" ? " (français)" : " (English)"}</span>
        </button>
      ))}
    </div>
  );
}
