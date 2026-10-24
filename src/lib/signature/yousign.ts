import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { maskPhone } from "@/lib/sms";
import { patientText } from "@/i18n/patient";
import type { ProviderRef, SignResult, SignatureProvider, SignedOutput, StartInput, StartResult } from "./types";

/**
 * Yousign API v3.
 * - SES: our own screens collect the drawn signature and the SMS code
 *   ("build your own signing flow": delivery_mode none, send_otp, sign).
 * - AES: Yousign hosts the ID check + OTP; we redirect the patient and
 *   finalise on the webhook (or on return) once the request is "done".
 * Sandbox: https://api-sandbox.yousign.app/v3  Production: https://api.yousign.app/v3
 */
export class YousignProvider implements SignatureProvider {
  readonly name = "yousign" as const;

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const c = config();
    const res = await fetch(`${c.YOUSIGN_BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${c.YOUSIGN_API_KEY}`, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new YousignError(res.status, `${init.method ?? "GET"} ${path} -> ${res.status} ${body.slice(0, 500)}`);
    }
    if (res.status === 204) return undefined as T;
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("application/json")) return (await res.json()) as T;
    return new Uint8Array(await res.arrayBuffer()) as T;
  }

  private json(body: unknown): RequestInit {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }

  async start(input: StartInput): Promise<StartResult> {
    const aes = input.level === "AES";
    if (aes && !input.signer.phone) throw new Error("La signature avancée nécessite un numéro de mobile.");
    const fallback = config().YOUSIGN_FALLBACK_EMAIL_DOMAIN;
    const email = input.signer.email ?? (fallback ? `patient-${input.requestId}@${fallback}` : null);
    if (!email) throw new Error("Yousign requires an e-mail per signer: set YOUSIGN_FALLBACK_EMAIL_DOMAIN for SMS-only patients");
    const sr = await this.call<{ id: string }>(
      "/signature_requests",
      this.json({
        name: input.title.slice(0, 128),
        delivery_mode: "none",
        timezone: "Europe/Paris",
        external_id: input.requestId,
      }),
    );

    const form = new FormData();
    form.append("file", new Blob([Buffer.from(input.pdf)], { type: "application/pdf" }), "consentement.pdf");
    form.append("nature", "signable_document");
    const doc = await this.call<{ id: string }>(`/signature_requests/${sr.id}/documents`, {
      method: "POST",
      body: form,
    });

    const signer = await this.call<{ id: string }>(
      `/signature_requests/${sr.id}/signers`,
      this.json({
        info: {
          first_name: input.signer.firstName,
          last_name: input.signer.lastName,
          email,
          ...(input.signer.phone ? { phone_number: toE164(input.signer.phone) } : {}),
          locale: input.locale,
        },
        signature_level: aes ? "advanced_electronic_signature" : "electronic_signature",
        signature_authentication_mode: input.signer.phone ? "otp_sms" : "otp_email",
        ...(aes ? { redirect_urls: { success: input.returnUrl, error: input.returnUrl } } : {}),
        fields: [
          {
            type: "signature",
            document_id: doc.id,
            page: input.box.page,
            x: input.box.x,
            y: input.box.y,
            width: input.box.width,
            height: input.box.height,
          },
        ],
      }),
    );

    await this.call(`/signature_requests/${sr.id}/activate`, { method: "POST" });

    if (!aes) return { mode: "otp", providerRequestId: sr.id, signerId: signer.id, documentId: doc.id };

    const s = await this.call<{ signature_link: string | null }>(`/signature_requests/${sr.id}/signers/${signer.id}`);
    if (!s.signature_link) throw new Error("Yousign returned no signature link for the AES signer");
    return {
      mode: "redirect",
      providerRequestId: sr.id,
      signerId: signer.id,
      documentId: doc.id,
      signingUrl: s.signature_link,
    };
  }

  async sendOtp(ref: ProviderRef) {
    await this.call(`/signature_requests/${ref.providerRequestId}/signers/${ref.signerId}/send_otp`, {
      method: "POST",
    });
    const t = patientText(ref.locale);
    return { sentTo: ref.phone ? t.toPhone(maskPhone(ref.phone)) : t.toYourEmail };
  }

  async signWithOtp(
    ref: ProviderRef,
    p: { otp: string; ip: string | null; consentGivenAt: Date; signaturePng: Uint8Array | null },
  ): Promise<SignResult> {
    if (!p.ip) throw new Error("A public IP address is required by Yousign to sign");
    // The drawn signature is already embedded in the PDF we uploaded, so the
    // JSON form is enough; Yousign stamps its own signature in the field.
    try {
      await this.call(`/signature_requests/${ref.providerRequestId}/signers/${ref.signerId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent_given_at: p.consentGivenAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
          ip_address: p.ip,
          otp: p.otp,
        }),
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof YousignError && e.status === 400) {
        console.warn("[yousign] sign rejected:", e.message);
        const msg = e.message.toLowerCase();
        if (msg.includes("expired")) return { ok: false, reason: "expired" };
        if (!msg.includes("otp")) throw e;
        if (msg.includes("attempt")) return { ok: false, reason: "too_many_attempts" };
        return { ok: false, reason: "bad_otp" };
      }
      throw e;
    }
  }

  async isDone(ref: ProviderRef) {
    const sr = await this.call<{ status: string }>(`/signature_requests/${ref.providerRequestId}`);
    return sr.status === "done";
  }

  async fetchSigned(ref: ProviderRef): Promise<SignedOutput> {
    const signedPdf = await this.call<Uint8Array>(
      `/signature_requests/${ref.providerRequestId}/documents/${ref.documentId}/download`,
    );
    let auditTrailPdf: Uint8Array | undefined;
    try {
      auditTrailPdf = await this.call<Uint8Array>(
        `/signature_requests/${ref.providerRequestId}/signers/${ref.signerId}/audit_trails/download`,
      );
    } catch (e) {
      console.warn("[yousign] audit trail not available yet", e);
    }
    return { signedPdf, auditTrailPdf };
  }
}

export class YousignError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function toE164(phone: string): string {
  const d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.startsWith("0") && d.length === 10) return `+33${d.slice(1)}`;
  return d;
}

/** Verifies the X-Yousign-Signature-256 header (HMAC-SHA256 of the raw body). */
export function verifyYousignWebhook(rawBody: string, header: string | null): boolean {
  const secret = config().YOUSIGN_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(header.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}
