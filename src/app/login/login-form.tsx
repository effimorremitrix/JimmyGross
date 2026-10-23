"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const input = "h-12 rounded-xl border border-line-strong bg-white px-3 text-[16px]";
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[14px] font-semibold">
        E-mail
        <input name="email" type="email" defaultValue={state?.email} autoComplete="username" required className={input} />
      </label>
      <label className="flex flex-col gap-1 text-[14px] font-semibold">
        Mot de passe
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-[14px] text-warn">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
