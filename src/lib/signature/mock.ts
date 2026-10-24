import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "@/lib/config";
import { maskEmail } from "@/lib/email";
import { checkOtp, issueOtp } from "@/lib/otp";
import { sealPdfMock } from "@/lib/pdf";
import { maskPhone } from "@/lib/sms";
import type { ProviderRef, SignResult, SignatureProvider, SignedOutput, StartInput, StartResult } from "./types";

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
    const { code, sentTo } = await issueOtp(ref.requestId, "sign", ref);
    return { sentTo, ...(config().DEMO_MODE ? { demoCode: code } : {}) };
  }

  async signWithOtp(ref: ProviderRef, p: { otp: string }): Promise<SignResult> {
    return checkOtp(ref.requestId, "sign", p.otp);
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
    const channel = ref.phone ? "SMS" : "e-mail";
    const signedPdf = await sealPdfMock(unsigned.bytes, {
      unsignedSha256: unsigned.sha256,
      signerName: patient ? `${patient.firstName} ${patient.lastName.toUpperCase()}` : "Patient",
      signerPhoneMasked: ref.phone ? maskPhone(ref.phone) : ref.email ? maskEmail(ref.email) : "-",
      signedAt: r.signedAt ?? new Date(),
      ip: r.signerIp,
      level: r.signatureLevel,
      method:
        r.signatureLevel === "AES"
          ? `Signature manuscrite tracée + pièce d'identité (simulée) + code ${channel} à usage unique`
          : `Signature manuscrite tracée + code ${channel} à usage unique`,
      requestId: r.id,
    });
    return { signedPdf };
  }
}
