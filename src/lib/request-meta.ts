import "server-only";
import { headers } from "next/headers";

/** Client IP and user agent, used for the evidence log. */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : h.get("x-real-ip"))?.trim() || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}
