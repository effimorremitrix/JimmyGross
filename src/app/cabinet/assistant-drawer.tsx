"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";
import { guideIdForPath, type GuideLang } from "@/guide";
import type { AssistantTurn } from "@/guide/assistant";
import { LangSwitch, useGuideLang } from "./guide-lang";
import { AnswerText } from "./guide-text";

// "Aide": a chat that answers how-to questions from the practice guide. The conversation lives
// only in this component's state: it survives moving between cabinet pages (the layout stays
// mounted), and it is gone when the tab closes. The server keeps none of it.

const TEXT = {
  fr: {
    open: "Aide",
    title: "Assistant Éclaira",
    close: "Fermer",
    lead: "Posez une question sur l'utilisation d'Éclaira. Les réponses viennent du guide d'utilisation.",
    privacy: "N'écrivez aucune donnée de patient (nom, date de naissance, santé) : l'assistant n'en a pas besoin, et ses réponses sont produites par Claude (Anthropic).",
    suggestions: ["Comment importer l'agenda de la semaine ?", "Le lien d'un patient ne s'ouvre plus, que faire ?", "Comment valider une traduction ?"],
    label: "Votre question",
    send: "Envoyer",
    thinking: "L'assistant lit le guide…",
    reset: "Nouvelle conversation",
    you: "Vous",
    sep: " : ",
    assistant: "Assistant",
    errors: {
      401: "Session expirée : reconnectez-vous.",
      429: "Beaucoup de questions en une heure : réessayez un peu plus tard, ou consultez le guide en haut de la page.",
      503: "L'assistant n'est pas activé. Le guide en haut de chaque page reste disponible.",
      other: "L'assistant n'a pas répondu. Réessayez dans un instant, ou consultez le guide en haut de la page.",
    },
    full: "Conversation trop longue : démarrez-en une nouvelle.",
  },
  en: {
    open: "Help",
    title: "Éclaira assistant",
    close: "Close",
    lead: "Ask how to do something in Éclaira. Answers come from the user guide.",
    privacy: "Don't type any patient data (name, birth date, health): the assistant doesn't need it, and its answers are produced by Claude (Anthropic).",
    suggestions: ["How do I import the week's agenda?", "A patient's link no longer opens, what do I do?", "How do I approve a translation?"],
    label: "Your question",
    send: "Send",
    thinking: "The assistant is reading the guide…",
    reset: "New conversation",
    you: "You",
    sep: ": ",
    assistant: "Assistant",
    errors: {
      401: "Your session has expired: sign in again.",
      429: "A lot of questions this hour: try again a little later, or read the guide at the top of the page.",
      503: "The assistant is not enabled. The guide at the top of each page is still there.",
      other: "The assistant didn't answer. Try again in a moment, or read the guide at the top of the page.",
    },
    full: "This conversation is too long: start a new one.",
  },
} as const;

/** The server takes 20 turns at most: 10 questions and the 9 answers before the last one. */
const MAX_TURNS = 19;

function errorText(lang: GuideLang, status: number): string {
  const e = TEXT[lang].errors;
  return status === 401 || status === 429 || status === 503 ? e[status] : e.other;
}

export function AssistantDrawer() {
  const lang = useGuideLang();
  const t = TEXT[lang];
  const page = guideIdForPath(usePathname());
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    if (turns.length + 1 > MAX_TURNS) return setError(t.full);
    const next: AssistantTurn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setDraft("");
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turns: next, page, lang }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string };
      if (!res.ok || !data.reply) {
        // The question goes back into the box so it can be sent again.
        setTurns(turns);
        setDraft(text);
        setError(errorText(lang, res.status));
      } else setTurns([...next, { role: "assistant", text: data.reply }]);
    } catch {
      setTurns(turns);
      setDraft(text);
      setError(t.errors.other);
    } finally {
      setPending(false);
      input.current?.focus();
    }
  }

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-[14px] font-medium text-ink-2 hover:bg-canvas">
        <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand-dark">
          ?
        </span>
        {t.open}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="assistant-title"
        lang={lang}
        className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-[440px] border-l border-line bg-white p-0 text-ink backdrop:bg-ink/30"
        onClick={(e) => {
          // A click on the backdrop lands on the dialog element itself.
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 border-b border-line px-5 py-3">
            <h2 id="assistant-title" className="flex-1 text-[17px] font-semibold">
              {t.title}
            </h2>
            <LangSwitch lang={lang} />
            <button type="button" onClick={() => dialog.current?.close()} className="min-h-11 rounded-lg px-2 text-[14px] font-medium text-brand hover:underline">
              {t.close}
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-[14px]" aria-live="polite">
            <p className="text-ink-2">{t.lead}</p>
            <p className="rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-[13px] text-warn">{t.privacy}</p>
            {turns.length === 0 && (
              <ul className="flex flex-col gap-2">
                {t.suggestions.map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => ask(s)} className="min-h-11 w-full rounded-xl border border-line px-3 text-left text-ink-2 hover:bg-canvas">
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {turns.map((turn, i) =>
              turn.role === "user" ? (
                <div key={i} className="self-end rounded-2xl bg-brand-soft px-3 py-2 text-ink">
                  <span className="sr-only">{t.you}{t.sep}</span>
                  {turn.text}
                </div>
              ) : (
                <div key={i} className="rounded-2xl border border-line px-3 py-2 text-ink-2">
                  <span className="sr-only">{t.assistant}{t.sep}</span>
                  <AnswerText text={turn.text} />
                </div>
              ),
            )}
            {pending && <p className="text-muted">{t.thinking}</p>}
            {error && (
              <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-warn">
                {error}
              </p>
            )}
            <div ref={end} />
          </div>

          <form
            className="flex flex-col gap-2 border-t border-line px-5 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <label htmlFor="assistant-question" className="text-[13px] font-semibold">
              {t.label}
            </label>
            <textarea
              id="assistant-question"
              ref={input}
              value={draft}
              maxLength={1000}
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
              className="rounded-xl border border-line-strong px-3 py-2 text-[15px]"
            />
            <div className="flex items-center justify-between gap-2">
              <button type="button" disabled={pending || turns.length === 0} onClick={() => (setTurns([]), setError(null))} className={buttonClass("ghost", "text-[14px]")}>
                {t.reset}
              </button>
              <button type="submit" disabled={pending || !draft.trim()} className={buttonClass("primary", "text-[14px]")}>
                {t.send}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
