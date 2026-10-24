import type { Locale } from "@/domain/i18n";
import type { SignatureLevel } from "@/domain/types";
import type { SignatureBox } from "@/lib/pdf";

export interface StartInput {
  requestId: string;
  level: SignatureLevel;
  title: string;
  signer: { firstName: string; lastName: string; email: string | null; phone: string | null };
  pdf: Uint8Array;
  box: SignatureBox;
  /** Where the provider sends the patient back after hosted (AES) signing. */
  returnUrl: string;
  /** Language of the provider's own screens and messages. */
  locale: Locale;
}

export type StartResult =
  /** We collect the OTP in our own screens (SES). */
  | { mode: "otp"; providerRequestId: string; signerId: string; documentId: string }
  /** The provider hosts identity check + signature (AES). */
  | { mode: "redirect"; providerRequestId: string; signerId: string; documentId: string; signingUrl: string };

export interface ProviderRef {
  requestId: string;
  providerRequestId: string;
  signerId: string;
  documentId: string;
  phone: string | null;
  email: string | null;
  /** Language for the codes the provider sends and for `sentTo`. */
  locale: Locale;
}

export type SignResult = { ok: true } | { ok: false; reason: "bad_otp" | "expired" | "too_many_attempts" };

export interface SignedOutput {
  signedPdf: Uint8Array;
  auditTrailPdf?: Uint8Array;
}

/**
 * The legal signature is always produced by an eIDAS provider. Éclaira owns
 * the workflow and the reading evidence; the provider owns signature validity.
 */
export interface SignatureProvider {
  readonly name: "mock" | "yousign";
  start(input: StartInput): Promise<StartResult>;
  /** `demoCode` only in DEMO_MODE with the mock provider; `sentTo` is a masked destination. */
  sendOtp(ref: ProviderRef): Promise<{ demoCode?: string; sentTo: string }>;
  signWithOtp(
    ref: ProviderRef,
    p: { otp: string; ip: string | null; consentGivenAt: Date; signaturePng: Uint8Array | null; signerName: string; level: SignatureLevel },
  ): Promise<SignResult>;
  /** True once the provider considers the document signed. */
  isDone(ref: ProviderRef): Promise<boolean>;
  fetchSigned(ref: ProviderRef): Promise<SignedOutput>;
}
