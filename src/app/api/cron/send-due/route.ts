import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { sendDue } from "@/server/consent";

/**
 * Scheduled sender: call every 5-15 minutes from the host's scheduler
 * (cron, Scaleway/OVH job, GitHub Actions...) with "Authorization: Bearer <CRON_SECRET>".
 */
export async function POST(req: Request) {
  const secret = config().CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new Response("Unauthorized", { status: 401 });
  const res = await sendDue();
  return Response.json(res);
}
