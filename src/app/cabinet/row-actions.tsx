"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { newLink, remind } from "./actions";

export function RowActions({ requestId, signed, closed, neverSent = false }: { requestId: string; signed: boolean; closed: boolean; neverSent?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (signed) {
    return (
      <a className="inline-flex min-h-11 items-center text-[14px] font-medium text-brand hover:underline" href={`/api/requests/${requestId}/documents/signed`}>
        PDF signé
      </a>
    );
  }
  if (closed) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-[13px] text-ok" aria-live="polite">
        {msg}
      </span>
      <button
        type="button"
        disabled={pending}
        className={buttonClass("secondary", "whitespace-nowrap text-[14px]")}
        onClick={() =>
          start(async () => {
            const res = await newLink(requestId);
            if (res.ok && res.link) {
              await navigator.clipboard.writeText(res.link).catch(() => {});
              setMsg("Lien copié");
            } else setMsg(res.error ?? "Erreur");
          })
        }
      >
        Copier un lien
      </button>
      <button
        type="button"
        disabled={pending}
        className={buttonClass("secondary", "whitespace-nowrap text-[14px]")}
        onClick={() =>
          start(async () => {
            const res = await remind(requestId);
            setMsg(res.ok ? (neverSent ? "Envoyé" : "Relancé") : (res.error ?? "Erreur"));
          })
        }
      >
        {neverSent ? "Envoyer maintenant" : "Relancer"}
      </button>
    </div>
  );
}
