import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 192-bit random token for patient links (base64url). */
export function newLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

export function sha256(input: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function newOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}
