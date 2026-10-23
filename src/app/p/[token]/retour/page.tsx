import { redirect } from "next/navigation";
import { finalizeSigned } from "@/server/consent";
import { loadByToken } from "@/server/patient";

/** Where Yousign sends the patient back after hosted (AES) signing. */
export default async function ReturnPage({ params }: PageProps<"/p/[token]/retour">) {
  const { token } = await params;
  const ctx = await loadByToken(token);
  if (ctx && ctx.request.status === "awaiting_provider") {
    try {
      await finalizeSigned(ctx.request.id, "patient");
    } catch (e) {
      console.error("[retour] finalize failed", e);
    }
  }
  redirect(`/p/${token}`);
}
