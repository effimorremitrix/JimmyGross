import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { DEFAULT_LOCALE, localizeAct, localizeContent, resolveLocale, translationProblems } from "@/domain/i18n";
import { applicableQuestions, computeFlags } from "@/domain/precheck";
import { infiltrationTemplate as T } from "@/domain/templates/infiltration-echoguidee";
import { infiltrationTemplateEn as EN } from "@/domain/templates/infiltration-echoguidee.en";
import type { PrecheckAnswers } from "@/domain/types";
import { patientText } from "@/i18n/patient";
import { buildConsentPdf } from "@/lib/pdf";

describe("Language resolution", () => {
  it("defaults to French", () => {
    expect(DEFAULT_LOCALE).toBe("fr");
    expect(resolveLocale(null, ["en"])).toBe("fr");
    expect(resolveLocale("de", ["en"])).toBe("fr");
  });

  it("gives English only once its translation is approved", () => {
    expect(resolveLocale("en", [])).toBe("fr");
    expect(resolveLocale("en", ["en"])).toBe("en");
    expect(resolveLocale("fr", ["en"])).toBe("fr");
  });
});

describe("Template translation", () => {
  it("covers every patient-facing string of the French source", () => {
    expect(translationProblems(T, EN)).toEqual([]);
  });

  it("reports what is missing", () => {
    const broken = structuredClone(EN);
    broken.sections.risques.callouts![2].items.pop();
    delete broken.questions.grossesse;
    broken.consentStatement = broken.consentStatement.slice(1);
    expect(translationProblems(T, broken)).toEqual(["section risques: callout 3", "consent statement", "question grossesse: text"]);
  });

  it("keeps rules and practitioner alerts from the source", () => {
    const en = localizeContent(T, EN);
    expect(en.sections.map((s) => s.id)).toEqual(T.sections.map((s) => s.id));
    expect(en.sections[7].callouts!.map((c) => c.tone)).toEqual(T.sections[7].callouts!.map((c) => c.tone));
    const q = en.questions.find((x) => x.id === "anticoagulant")!;
    expect(q.text).toMatch(/anticoagulant or antiplatelet/);
    expect(q.flag).toEqual({ ...T.questions[2].flag, patientNotice: EN.questions.anticoagulant.patientNotice });
    // The spine question still applies on the French act, whatever the display language.
    expect(applicableQuestions(en.questions, "Infiltration rachidienne").some((x) => x.id === "rachis")).toBe(true);
    expect(en.consent.actOptions).toEqual(T.consent.actOptions);
  });

  it("raises the same French alert whatever language the patient answered in", () => {
    const answers: PrecheckAnswers = { items: { anticoagulant: { answer: "oui", detail: "Eliquis" } } };
    const en = localizeContent(T, EN);
    expect(computeFlags(en.questions, "Injection de PRP", answers)).toEqual(computeFlags(T.questions, "Injection de PRP", answers));
  });

  it("translates every act a visit reason can prefill", () => {
    for (const act of T.consent.actOptions) expect(localizeAct(act, EN)).not.toBe(act);
    expect(localizeAct("Geste libre", EN)).toBe("Geste libre");
    expect(localizeAct("Injection de PRP", null)).toBe("Injection de PRP");
  });

  it("is plain WinAnsi text, so the PDF prints it unchanged", () => {
    const all = JSON.stringify(EN);
    expect([...all].filter((c) => c.charCodeAt(0) > 0xff && !"’“”–—•…€".includes(c))).toEqual([]);
  });
});

describe("Patient text", () => {
  it("has the same keys in every language", () => {
    expect(Object.keys(patientText("en")).sort()).toEqual(Object.keys(patientText("fr")).sort());
  });

  it("writes messages in the patient's language", () => {
    expect(patientText("en").linkSms("Dr Jimmy Gross", "27/10", "https://x/p/t")).toBe(
      "Dr Jimmy Gross: please complete your documents before your appointment on 27/10. https://x/p/t",
    );
    expect(patientText("fr").codeSms("sign", "123456")).toMatch(/^Éclaira : votre code de signature est 123456/);
    expect(patientText("en").errAttemptsLeft(1)).toBe("You have 1 attempt left.");
  });
});

describe("Consent PDF in English", () => {
  it("is built from the English text and tagged English", async () => {
    const en = localizeContent(T, EN);
    const { bytes } = await buildConsentPdf({
      practiceName: "Cabinet du Dr Jimmy Gross",
      practitionerName: "Dr Jimmy Gross",
      practicePhone: "06 07 96 03 19",
      templateTitle: en.title,
      templateSubtitle: en.subtitle,
      templateVersion: 1,
      intro: en.intro,
      sections: en.sections,
      consent: en.consent,
      questions: en.questions,
      patient: { firstName: "Emma", lastName: "Wilson", birthDate: "1990-05-12", phone: null },
      plannedAct: localizeAct("Injection de PRP", EN),
      actKey: "Injection de PRP",
      plannedLocation: "Right knee",
      appointmentAt: new Date("2026-10-27T09:00:00Z"),
      answers: { items: {} },
      ackAt: new Date("2026-10-25T09:00:00Z"),
      signaturePng: null,
      requestId: "00000000-0000-4000-8000-000000000000",
      locale: "en",
      translation: { approvedAt: new Date("2026-10-24T09:00:00Z"), approvedBy: "Dr Jimmy Gross" },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(2);
    expect(doc.catalog.lookup(PDFName.of("Lang"), PDFString).decodeText()).toBe("en-GB");
    expect(doc.getTitle()).toMatch(/^Information sheet and consent/);
  });
});
