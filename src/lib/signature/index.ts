import "server-only";
import { config } from "@/lib/config";
import { MockProvider } from "./mock";
import type { SignatureProvider } from "./types";
import { YousignProvider } from "./yousign";

export function signatureProvider(): SignatureProvider {
  return config().SIGNATURE_PROVIDER === "yousign" ? new YousignProvider() : new MockProvider();
}

export function providerByName(name: string | null): SignatureProvider {
  return name === "yousign" ? new YousignProvider() : new MockProvider();
}

export type * from "./types";
