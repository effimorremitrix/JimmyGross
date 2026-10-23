import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "@/lib/config";
import { newOtp, safeEqualHex, sha256 } from "@/lib/crypto";
import { sealPdfMock } from "@/lib/pdf";
import { maskPhone, smsSender } from "@/lib/sms";
import type { ProviderRef, SignResult, SignatureProvider, SignedOutput, StartInput, StartResult } from "./types";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

/**
 * Development and demo provider. Mirrors Yousign's flow (OTP limits included)
 * but produces a clearly-marked simulated signature. Never use with real patients.
 */
export class MockProvider implements SignatureProvider {
  readonly name = "mock" as const;

  async start(input: StartInput): Promise<StartResult> {
    return {
      mode: "otp",
      providerRequestId: `mock-${input.requestId}`,
      signerId: `mock-signer-${input.requestId}`,
      documentId: `mock-doc-${input.requestId}`,
    };
  }

  async sendOtp(ref: ProviderRef) {
    const code = newOtp();
    await db
      .update(schema.otpChallenges)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.otpChallenges.requestId, ref.requestId), isNull(schema.otpChallenges.usedAt)));
    await db.insert(schema.otpChallenges).values({
      requestId: ref.requestId,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    await smsSender().send(ref.phone, `Consentza : votre code de signature est ${code}. Il expire dans 10 minutes.`);
    return config().DEMO_MODE ? { demoCode: code } : {};
  }

  async signWithOtp(ref: ProviderRef, p: { otp: string }): Promise<SignResult> {
    const ch = await db.query.otpChallenges.findFirst({
      where: and(eq(schema.otpChallenges.requestId, ref.requestId), isNull(schema.otpChallenges.usedAt)),
      orderBy: desc(schema.otpChallenges.expiresAt),
    });
    if (!ch || ch.expiresAt < new Date()) return { ok: false, reason: "expired" };
    if (ch.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
    if (!/^\d{6}$/.test(p.otp) || !safeEqualHex(sha256(p.otp), ch.codeHash)) {
      await db
        .update(schema.otpChallenges)
        .set({ attempts: ch.attempts + 1 })
        .where(eq(schema.otpChallenges.id, ch.id));
      return { ok: false, reason: ch.attempts + 1 >= OTP_MAX_ATTEMPTS ? "too_many_attempts" : "bad_otp" };
    }
    await db.update(schema.otpChallenges).set({ usedAt: new Date() }).where(eq(schema.otpChallenges.id, ch.id));
    return { ok: true };
  }

  async isDone(ref: ProviderRef) {
    const r = await db.query.consentRequests.findFirst({ where: eq(schema.consentRequests.id, ref.requestId) });
    return !!r?.signedAt;
  }

  async fetchSigned(ref: ProviderRef): Promise<SignedOutput> {
    const r = await db.query.consentRequests.findFirst({ where: eq(schema.consentRequests.id, ref.requestId) });
    const unsigned = await db.query.documents.findFirst({
      where: and(eq(schema.documents.requestId, ref.requestId), eq(schema.documents.kind, "unsigned_consent")),
      orderBy: desc(schema.documents.createdAt),
    });
    if (!r || !unsigned) throw new Error("Unsigned document not found");
    const patient = await db.query.patients.findFirst({ where: eq(schema.patients.id, r.patientId) });
    const signedPdf = await sealPdfMock(unsigned.bytes, {
      unsignedSha256: unsigned.sha256,
      signerName: patient ? `${patient.firstName} ${patient.lastName.toUpperCase()}` : "Patient",
      signerPhoneMasked: maskPhone(ref.phone),
      signedAt: r.signedAt ?? new Date(),
      ip: r.signerIp,
      level: r.signatureLevel,
      method:
        r.signatureLevel === "AES"
          ? "Signature manuscrite tracée + pièce d'identité (simulée) + code SMS à usage unique"
          : "Signature manuscrite tracée + code SMS à usage unique",
      requestId: r.id,
    });
    return { signedPdf };
  }
}
