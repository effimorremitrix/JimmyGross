import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyYousignWebhook } from "@/lib/signature/yousign";
import { finalizeSigned } from "@/server/consent";

/**
 * Yousign webhook. Subscribe to "signature_request.done" with the secret in
 * YOUSIGN_WEBHOOK_SECRET. Finalisation is idempotent, so retries are safe.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyYousignWebhook(raw, req.headers.get("x-yousign-signature-256"))) {
    return new Response("invalid signature", { status: 401 });
  }
  let payload: { event_name?: string; data?: { signature_request?: { id?: string } } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const id = payload.data?.signature_request?.id;
  if (payload.event_name === "signature_request.done" && id) {
    const r = await db.query.consentRequests.findFirst({ where: eq(schema.consentRequests.providerRequestId, id) });
    if (r) await finalizeSigned(r.id, "provider");
  }
  return new Response(null, { status: 204 });
}
