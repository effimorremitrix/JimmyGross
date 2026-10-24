import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { newOtp, safeEqualHex, sha256 } from "./crypto";
import { emailSender, maskEmail } from "./email";
import { maskPhone, smsSender } from "./sms";

const TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpPurpose = "sign" | "access";
export type OtpCheck = { ok: true } | { ok: false; reason: "bad_otp" | "expired" | "too_many_attempts" };

/**
 * Creates a 6-digit code (hash stored), sends it by SMS, or by e-mail when there
 * is no phone, and returns where it went. Previous unused codes are voided.
 */
export async function issueOtp(
  requestId: string,
  purpose: OtpPurpose,
  to: { phone: string | null; email: string | null },
): Promise<{ code: string; sentTo: string }> {
  const code = newOtp();
  await db
    .update(schema.otpChallenges)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.otpChallenges.requestId, requestId), eq(schema.otpChallenges.purpose, purpose), isNull(schema.otpChallenges.usedAt)));
  await db.insert(schema.otpChallenges).values({ requestId, purpose, codeHash: sha256(code), expiresAt: new Date(Date.now() + TTL_MS) });
  const what = purpose === "sign" ? "de signature" : "d'accès";
  if (to.phone) {
    await smsSender().send(to.phone, `Consentza : votre code ${what} est ${code}. Il expire dans 10 minutes.`);
    return { code, sentTo: `au ${maskPhone(to.phone)}` };
  }
  if (to.email) {
    const text = `Votre code ${what} est ${code}. Il expire dans 10 minutes.`;
    await emailSender().send(to.email, `Votre code ${what}`, text, `<p style="font-family:Arial,sans-serif">${text}</p>`);
    return { code, sentTo: `à l'adresse ${maskEmail(to.email)}` };
  }
  throw new Error("Aucun moyen de contact pour envoyer le code.");
}

export async function checkOtp(requestId: string, purpose: OtpPurpose, otp: string): Promise<OtpCheck> {
  const ch = await db.query.otpChallenges.findFirst({
    where: and(eq(schema.otpChallenges.requestId, requestId), eq(schema.otpChallenges.purpose, purpose), isNull(schema.otpChallenges.usedAt)),
    orderBy: desc(schema.otpChallenges.expiresAt),
  });
  if (!ch || ch.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (ch.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
  if (!/^\d{6}$/.test(otp) || !safeEqualHex(sha256(otp), ch.codeHash)) {
    await db.update(schema.otpChallenges).set({ attempts: ch.attempts + 1 }).where(eq(schema.otpChallenges.id, ch.id));
    return { ok: false, reason: ch.attempts + 1 >= OTP_MAX_ATTEMPTS ? "too_many_attempts" : "bad_otp" };
  }
  await db.update(schema.otpChallenges).set({ usedAt: new Date() }).where(eq(schema.otpChallenges.id, ch.id));
  return { ok: true };
}
