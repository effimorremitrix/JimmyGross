"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { confirmAct } from "../../actions";

export function ConfirmActForm({
  requestId,
  options,
  planned,
  location,
}: {
  requestId: string;
  options: string[];
  planned: string;
  location: string;
}) {
  const [state, action, pending] = useActionState(confirmAct.bind(null, requestId), undefined);
  const input = "h-12 rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal";
  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[14px] font-semibold">
        Geste réalisé
        <select name="act" defaultValue={planned} className={input}>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[14px] font-semibold">
        Localisation
        <input name="location" defaultValue={location} className={input} />
      </label>
      {state?.error && (
        <p role="alert" className="text-[14px] text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Confirmer le geste"}
      </Button>
    </form>
  );
}
