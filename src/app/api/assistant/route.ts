import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getStaff } from "@/lib/auth";
import { config } from "@/lib/config";
import { answerQuestion, AssistantError, type AssistantTurn } from "@/guide/assistant";
import { GUIDE_IDS, GUIDE_LANGS } from "@/guide";

// The cabinet's help assistant. Stateless on purpose: the browser sends the conversation with
// each question and nothing of it is stored or logged here, so whatever a member of staff types
// lives only in their own tab and in this one call to Anthropic.

const Body = z.object({
  turns: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(20)
    .refine((t) => t.every((turn, i) => turn.role === (i % 2 === 0 ? "user" : "assistant")) && t.length % 2 === 1, {
      message: "turns must alternate, starting and ending with the person",
    })
    .refine((t) => t[t.length - 1]!.text.length <= 1000, { message: "question too long" }),
  page: z.enum(GUIDE_IDS as [string, ...string[]]).nullable().default(null),
  lang: z.enum(GUIDE_LANGS as [string, ...string[]]).default("fr"),
});

const fail = (status: number, error: string) => Response.json({ error }, { status });

// Questions per staff member over the last hour. In memory: one app container serves the
// practice, and a restart only gives everyone a fresh hour.
const asked = new Map<string, number[]>();

function underLimit(userId: string, limit: number): boolean {
  const now = Date.now();
  const recent = (asked.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= limit) {
    asked.set(userId, recent);
    return false;
  }
  recent.push(now);
  asked.set(userId, recent);
  return true;
}

let client: Anthropic | undefined;

export async function POST(req: Request) {
  const staff = await getStaff();
  if (!staff) return fail(401, "Session expirée : reconnectez-vous.");
  const c = config();
  if (!c.ANTHROPIC_API_KEY) return fail(503, "L'assistant n'est pas activé. Le guide en haut de chaque page reste disponible.");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Question illisible ou trop longue (1 000 caractères au plus).");
  if (!underLimit(staff.userId, c.ASSISTANT_HOURLY_LIMIT)) {
    return fail(429, "Beaucoup de questions en une heure : réessayez un peu plus tard, ou consultez le guide en haut de la page.");
  }

  client ??= new Anthropic({ apiKey: c.ANTHROPIC_API_KEY });
  const { turns, page, lang } = parsed.data;
  try {
    const reply = await answerQuestion((params) => client!.beta.messages.create(params), c.ASSISTANT_MODEL, turns as AssistantTurn[], {
      role: staff.role,
      lang: lang as "fr" | "en",
      page: page as (typeof GUIDE_IDS)[number] | null,
    });
    return Response.json({ reply });
  } catch (err) {
    // The error class and status only: a message from the API could quote the question back.
    if (err instanceof AssistantError) console.warn("assistant: no answer", err.message);
    else if (err instanceof Anthropic.APIError) console.error("assistant: Anthropic API error", err.status);
    else console.error("assistant: failed", err instanceof Error ? err.name : typeof err);
    return fail(502, "L'assistant n'a pas répondu. Réessayez dans un instant, ou consultez le guide en haut de la page.");
  }
}
