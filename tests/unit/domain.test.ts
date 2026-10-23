import { describe, expect, it } from "vitest";
import { applicableQuestions, computeFlags, validateAnswers } from "@/domain/precheck";
import { advance, atLeast, isTerminal } from "@/domain/status";
import { infiltrationTemplate as T } from "@/domain/templates/infiltration-echoguidee";
import type { PrecheckAnswers } from "@/domain/types";
import { parisDayRange, parisToUtc, shiftYmd } from "@/lib/dates";
import { newLinkToken, newOtp, safeEqualHex, sha256 } from "@/lib/crypto";
import { pdfSafe } from "@/lib/pdf";

const allNo = (act: string): PrecheckAnswers => ({
  items: Object.fromEntries(applicableQuestions(T.questions, act).map((q) => [q.id, { answer: "non" as const }])),
});

describe("Pre-Check", () => {
  it("hides spine-only questions unless the act is spinal", () => {
    expect(applicableQuestions(T.questions, "Injection de PRP").some((q) => q.id === "rachis")).toBe(false);
    expect(applicableQuestions(T.questions, "Infiltration rachidienne").some((q) => q.id === "rachis")).toBe(true);
  });

  it("requires every applicable question", () => {
    const a = allNo("Injection de PRP");
    delete a.items.grossesse;
    expect(validateAnswers(T.questions, "Injection de PRP", a)).toEqual({ ok: false, missing: ["grossesse"] });
  });

  it("requires a detail when 'oui' asks for one", () => {
    const a = allNo("Injection de PRP");
    a.items.anticoagulant = { answer: "oui" };
    expect(validateAnswers(T.questions, "Injection de PRP", a).ok).toBe(false);
    a.items.anticoagulant.detail = "Kardégic 75 mg";
    expect(validateAnswers(T.questions, "Injection de PRP", a).ok).toBe(true);
  });

  it("raises flags for 'oui' answers, blocking ones first", () => {
    const a = allNo("Injection de PRP");
    a.items.anticoagulant = { answer: "oui", detail: "Eliquis" };
    a.items.infection = { answer: "oui", detail: "fièvre" };
    a.items.diabete = { answer: "oui", detail: "" };
    const flags = computeFlags(T.questions, "Injection de PRP", a);
    expect(flags.map((f) => f.severity)).toEqual(["block", "warn", "info"]);
    expect(flags[1]).toMatchObject({ questionId: "anticoagulant", detail: "Eliquis" });
  });

  it("raises nothing when all answers are 'non'", () => {
    expect(computeFlags(T.questions, "Injection de PRP", allNo("Injection de PRP"))).toEqual([]);
  });
});

describe("Request status", () => {
  it("never moves backwards", () => {
    expect(advance("precheck_done", "opened")).toBe("precheck_done");
    expect(advance("opened", "info_read")).toBe("info_read");
  });
  it("keeps terminal states", () => {
    expect(advance("signed", "cancelled")).toBe("signed");
    expect(isTerminal("expired")).toBe(true);
  });
  it("allows cancelling an open request", () => {
    expect(advance("awaiting_otp", "cancelled")).toBe("cancelled");
  });
  it("orders steps", () => {
    expect(atLeast("awaiting_otp", "precheck_done")).toBe(true);
    expect(atLeast("opened", "info_read")).toBe(false);
  });
});

describe("Paris dates", () => {
  it("converts wall-clock time across DST", () => {
    expect(parisToUtc("2026-07-15", "10:30").toISOString()).toBe("2026-07-15T08:30:00.000Z");
    expect(parisToUtc("2026-12-15", "10:30").toISOString()).toBe("2026-12-15T09:30:00.000Z");
  });
  it("handles the DST change day (25 hours)", () => {
    const [s, e] = parisDayRange("2026-10-25");
    expect((+e - +s) / 3600000).toBe(25);
  });
  it("shifts days", () => {
    expect(shiftYmd("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("Crypto helpers", () => {
  it("makes unguessable link tokens", () => {
    const t = newLinkToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newLinkToken()).not.toBe(t);
  });
  it("makes 6-digit OTPs", () => {
    for (let i = 0; i < 50; i++) expect(newOtp()).toMatch(/^\d{6}$/);
  });
  it("compares hashes in constant time", () => {
    expect(safeEqualHex(sha256("a"), sha256("a"))).toBe(true);
    expect(safeEqualHex(sha256("a"), sha256("b"))).toBe(false);
  });
});

describe("PDF text", () => {
  it("keeps French accents and replaces unencodable characters", () => {
    expect(pdfSafe("Être à l'œil, « oui »")).toBe("Être à l'œil, « oui »");
    expect(pdfSafe("≥ 6 semaines → ☐")).toBe(">= 6 semaines -> [ ]");
    expect(pdfSafe("emoji 😀")).not.toMatch(/😀/);
  });
});
