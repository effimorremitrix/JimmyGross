import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SIGNATURE_PROVIDER: z.enum(["mock", "yousign"]).default("mock"),
  YOUSIGN_API_KEY: z.string().optional(),
  YOUSIGN_BASE_URL: z.string().url().default("https://api-sandbox.yousign.app/v3"),
  YOUSIGN_WEBHOOK_SECRET: z.string().optional(),
  SMS_PROVIDER: z.enum(["console", "twilio"]).default("console"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["console", "smtp"]).default("console"),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("Éclaira <no-reply@eclaira.health>"),
  /** Bearer secret for the scheduled sender (/api/cron/send-due). */
  CRON_SECRET: z.string().optional(),
  /** Yousign needs an e-mail per signer; used only when the patient has none (delivery stays SMS). */
  YOUSIGN_FALLBACK_EMAIL_DOMAIN: z.string().optional(),
  /** Shows the mock OTP on screen. Never enable with real patients. */
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LINK_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(10),
  /** Turns on the cabinet's help assistant (Claude). Without it, the guide panel still works. */
  ANTHROPIC_API_KEY: z.string().optional(),
  ASSISTANT_MODEL: z.string().min(1).default("claude-opus-5-5"),
  /** Questions one staff member can ask the assistant per hour. */
  ASSISTANT_HOURLY_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function config(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const c = parsed.data;
  if (c.SIGNATURE_PROVIDER === "yousign" && !c.YOUSIGN_API_KEY) {
    throw new Error("SIGNATURE_PROVIDER=yousign requires YOUSIGN_API_KEY");
  }
  if (c.SMS_PROVIDER === "twilio" && !(c.TWILIO_ACCOUNT_SID && c.TWILIO_AUTH_TOKEN && c.TWILIO_FROM)) {
    throw new Error("SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM");
  }
  if (c.EMAIL_PROVIDER === "smtp" && !c.SMTP_URL) {
    throw new Error("EMAIL_PROVIDER=smtp requires SMTP_URL");
  }
  cached = c;
  return c;
}
