import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ConsentBlock, InfoSection, PrecheckAnswers, Question } from "@/domain/types";
import { applicableQuestions } from "@/domain/precheck";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const INK = rgb(0.07, 0.14, 0.23);
const MUTED = rgb(0.29, 0.36, 0.44);
const ACCENT = rgb(0.12, 0.37, 0.66);
const LINE = rgb(0.8, 0.84, 0.89);

// Characters outside Latin-1 that WinAnsi (the standard fonts' encoding) still covers.
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/** Standard PDF fonts only encode WinAnsi; replace anything else safely. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[   ]/g, " ")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[→]/g, "->")
    .replace(/[☐]/g, "[ ]")
    .split("")
    .map((ch) => (ch.charCodeAt(0) <= 0xff || WINANSI_EXTRA.includes(ch) ? ch : "?"))
    .join("");
}

/** Simple flowing-text writer over A4 pages. */
class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    public doc: PDFDocument,
    public font: PDFFont,
    public bold: PDFFont,
    private footer: string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
    const f = pdfSafe(this.footer);
    const w = this.font.widthOfTextAtSize(f, 8);
    this.page.drawText(f, { x: (A4[0] - w) / 2, y: 24, size: 8, font: this.font, color: MUTED });
  }

  ensure(h: number) {
    if (this.y - h < MARGIN + 20) this.newPage();
  }

  wrap(text: string, size: number, font: PDFFont, width: number): string[] {
    const out: string[] = [];
    for (const para of pdfSafe(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const t = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(t, size) > width && line) {
          out.push(line);
          line = word;
        } else line = t;
      }
      out.push(line);
    }
    return out;
  }

  text(
    text: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const indent = opts.indent ?? 0;
    const lh = size * 1.35;
    for (const line of this.wrap(text, size, font, A4[0] - 2 * MARGIN - indent)) {
      this.ensure(lh);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= lh;
    }
    this.y -= opts.gap ?? 4;
  }

  rule() {
    this.ensure(10);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 4 },
      end: { x: A4[0] - MARGIN, y: this.y - 4 },
      thickness: 0.6,
      color: LINE,
    });
    this.y -= 12;
  }

  space(h: number) {
    this.y -= h;
  }
}

export interface ConsentPdfInput {
  practiceName: string;
  practitionerName: string;
  practicePhone: string;
  templateTitle: string;
  templateSubtitle: string;
  templateVersion: number;
  intro: string[];
  sections: InfoSection[];
  consent: ConsentBlock;
  questions: Question[];
  patient: { firstName: string; lastName: string; birthDate: string | null; phone: string | null };
  plannedAct: string;
  plannedLocation: string;
  appointmentAt: Date;
  answers: PrecheckAnswers;
  ackAt: Date;
  signaturePng: Uint8Array | null;
  requestId: string;
}

/** Signature box in Yousign coordinates: points from the top-left of the page. */
export interface SignatureBox {
  page: number; // 1-based
  x: number;
  y: number;
  width: number;
  height: number;
}

export function frDate(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
}

export function frBirthDate(iso: string | null): string {
  if (!iso) return "non renseignée";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Builds the full consent document: information sheet, consent statement,
 * Pre-Check answers, and the patient's drawn signature.
 */
export async function buildConsentPdf(
  input: ConsentPdfInput,
  opts: { infoOnly?: boolean } = {},
): Promise<{ bytes: Uint8Array; box: SignatureBox }> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${input.templateTitle} - ${input.patient.lastName.toUpperCase()} ${input.patient.firstName}`));
  doc.setAuthor(pdfSafe(input.practitionerName));
  doc.setSubject(`Éclaira request ${input.requestId}`);
  doc.setLanguage("fr-FR");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(
    doc,
    font,
    bold,
    `${input.practitionerName} - ${input.templateTitle} - modèle v${input.templateVersion} - réf. ${input.requestId.slice(0, 8)}`,
  );

  w.text(input.practiceName, { size: 9, color: MUTED, gap: 10 });
  w.text(input.templateTitle.toUpperCase(), { size: 15, bold: true, color: ACCENT, gap: 2 });
  if (input.templateSubtitle) w.text(input.templateSubtitle, { size: 10, bold: true, gap: 10 });
  for (const p of input.intro) w.text(`• ${p}`, { size: 9.5, indent: 4, gap: 2 });
  w.space(8);

  for (const s of input.sections) {
    w.ensure(40);
    w.text(s.title, { size: 12, bold: true, color: ACCENT, gap: 4 });
    for (const p of s.paragraphs) w.text(p, { size: 9.5, gap: 5 });
    for (const c of s.callouts ?? []) {
      w.text(c.heading, { size: 9.5, bold: true, gap: 2 });
      for (const it of c.items) w.text(`• ${it}`, { size: 9.5, indent: 8, gap: 1 });
      w.space(4);
    }
    w.space(6);
  }

  if (opts.infoOnly) return { bytes: await doc.save(), box: { page: 1, x: 0, y: 0, width: 85, height: 37 } };

  // ---- Consent page ----
  w.newPage();
  w.text("CONSENTEMENT DU PATIENT", { size: 13, bold: true, color: ACCENT, gap: 10 });
  const p = input.patient;
  w.text(`Je soussigné(e) : ${p.firstName} ${p.lastName.toUpperCase()}`, { size: 10.5, gap: 2 });
  w.text(`Né(e) le : ${frBirthDate(p.birthDate)}${p.phone ? `    Téléphone : ${p.phone}` : ""}`, { size: 10.5, gap: 10 });
  for (const s of input.consent.statement) w.text(s, { size: 10, gap: 6 });
  w.space(4);
  w.text(`Geste consenti : ${input.plannedAct}`, { size: 10.5, bold: true, gap: 2 });
  if (input.plannedLocation) w.text(`Localisation prévue : ${input.plannedLocation}`, { size: 10.5, gap: 2 });
  w.text(`Rendez-vous : ${frDate(input.appointmentAt)}`, { size: 10.5, gap: 2 });
  w.text(`Consentement exprimé le : ${frDate(input.ackAt)}`, { size: 10.5, gap: 12 });

  w.text("Questionnaire avant le geste", { size: 11, bold: true, color: ACCENT, gap: 4 });
  for (const q of applicableQuestions(input.questions, input.plannedAct)) {
    const a = input.answers.items[q.id];
    const ans = a ? (a.answer === "oui" ? "OUI" : "Non") : "-";
    w.text(`${q.text}  ->  ${ans}${a?.detail ? ` (${a.detail})` : ""}`, {
      size: 9,
      bold: a?.answer === "oui",
      gap: 2,
    });
  }
  const ec = input.answers.emergencyContact;
  if (ec?.name) {
    w.space(6);
    w.text(`Personne à contacter : ${ec.name}${ec.relation ? ` (${ec.relation})` : ""} - ${ec.phone}`, { size: 9.5 });
  }

  // ---- Signature box ----
  const boxH = 110;
  w.ensure(boxH + 40);
  w.space(10);
  w.text("Signature du patient", { size: 10, bold: true, gap: 4 });
  const boxW = 260;
  const boxX = MARGIN;
  const boxBottom = w.y - boxH;
  w.page.drawRectangle({ x: boxX, y: boxBottom, width: boxW, height: boxH, borderColor: LINE, borderWidth: 1 });
  if (input.signaturePng) {
    const img = await doc.embedPng(input.signaturePng);
    const scale = Math.min((boxW - 20) / img.width, (boxH - 20) / img.height, 1);
    const iw = img.width * scale;
    const ih = img.height * scale;
    w.page.drawImage(img, { x: boxX + (boxW - iw) / 2, y: boxBottom + (boxH - ih) / 2, width: iw, height: ih });
  }
  // The provider stamps its certified signature in the box on the right.
  w.page.drawText(pdfSafe("Signature électronique certifiée"), {
    x: boxX + boxW + 20,
    y: boxBottom + boxH - 12,
    size: 9,
    font,
    color: MUTED,
  });
  w.page.drawText(pdfSafe("Le geste réalisé est confirmé par le médecin le jour de l'acte."), {
    x: boxX,
    y: boxBottom - 14,
    size: 8.5,
    font,
    color: MUTED,
  });
  const pageIndex = doc.getPageCount();
  const box: SignatureBox = {
    page: pageIndex,
    x: Math.round(boxX + boxW + 20),
    y: Math.round(A4[1] - (boxBottom + boxH) + 24),
    width: 180,
    height: 70,
  };
  w.y = boxBottom - 24;

  return { bytes: await doc.save(), box };
}

export interface SealInput {
  unsignedSha256: string;
  signerName: string;
  signerPhoneMasked: string;
  signedAt: Date;
  ip: string | null;
  level: "SES" | "AES";
  method: string;
  requestId: string;
}

/**
 * Mock provider only: appends a signature certificate page. The real
 * provider (Yousign) returns its own sealed PDF and audit trail instead.
 */
export async function sealPdfMock(unsigned: Uint8Array, s: SealInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(unsigned);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold, `Certificat de signature - réf. ${s.requestId.slice(0, 8)}`);
  w.text("CERTIFICAT DE SIGNATURE ÉLECTRONIQUE", { size: 13, bold: true, color: ACCENT, gap: 4 });
  w.text("Environnement de démonstration : signature simulée, sans valeur probante.", {
    size: 9.5,
    color: rgb(0.6, 0.2, 0),
    gap: 12,
  });
  const rows: [string, string][] = [
    ["Signataire", s.signerName],
    ["Niveau", s.level === "AES" ? "Signature électronique avancée (eIDAS)" : "Signature électronique simple (eIDAS)"],
    ["Méthode", s.method],
    ["Téléphone", s.signerPhoneMasked],
    ["Date et heure", frDate(s.signedAt)],
    ["Adresse IP", s.ip ?? "inconnue"],
    ["Empreinte SHA-256 du document", s.unsignedSha256],
  ];
  for (const [k, v] of rows) {
    w.text(k, { size: 9, color: MUTED, gap: 0 });
    w.text(v, { size: 10.5, gap: 8 });
  }
  doc.setModificationDate(s.signedAt);
  return doc.save();
}

export interface EvidenceInput {
  practiceName: string;
  patientName: string;
  templateTitle: string;
  templateVersion: number;
  requestId: string;
  signedSha256: string | null;
  sections: { title: string; visibleMs: number; acknowledgedAt: Date | null; fullTextOpenedAt: Date | null }[];
  fullDocumentOpenedAt?: Date | null;
  events: { at: Date; label: string; actor: string; ip: string | null; details: string }[];
  flags: { message: string; detail: string; reviewedAt: Date | null }[];
  /** Answers the patient later replaced; kept so the review history stays provable. */
  supersededFlags?: { message: string; detail: string; reviewedAt: Date | null; supersededAt: Date }[];
  /** State of the practice's hash-chained journal at export time. */
  chain?: { intact: boolean; brokenAt: number | null; headSeq: number | null; headHash: string | null };
}

/** The "dossier de preuve": what was shown, read, answered and signed, and when. */
export async function buildEvidencePdf(e: EvidenceInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Dossier de preuve - ${e.patientName}`));
  doc.setLanguage("fr-FR");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold, `Dossier de preuve - réf. ${e.requestId}`);
  w.text(e.practiceName, { size: 9, color: MUTED, gap: 8 });
  w.text("DOSSIER DE PREUVE D'INFORMATION ET DE CONSENTEMENT", { size: 13, bold: true, color: ACCENT, gap: 6 });
  w.text(`Patient : ${e.patientName}`, { size: 10.5, gap: 2 });
  w.text(`Document : ${e.templateTitle} (modèle v${e.templateVersion})`, { size: 10.5, gap: 2 });
  if (e.signedSha256) w.text(`Empreinte SHA-256 du document signé : ${e.signedSha256}`, { size: 9, gap: 2 });
  w.space(8);

  w.text("Lecture de la fiche d'information", { size: 11.5, bold: true, color: ACCENT, gap: 4 });
  const total = e.sections.reduce((a, s) => a + s.visibleMs, 0);
  w.text(`Temps de lecture total à l'écran : ${fmtDuration(total)}`, { size: 10, gap: 2 });
  w.text(
    "Le patient a reçu un résumé de chaque partie, avec accès en un geste au texte intégral du médecin. Le texte intégral figure dans le document signé.",
    { size: 9, color: MUTED, gap: 2 },
  );
  w.text(
    `Document intégral (PDF) : ${e.fullDocumentOpenedAt ? `ouvert le ${frDate(e.fullDocumentOpenedAt)}` : "non téléchargé"}`,
    { size: 9.5, gap: 4 },
  );
  for (const s of e.sections) {
    w.text(
      `${s.title} : ${s.acknowledgedAt ? `confirmée le ${frDate(s.acknowledgedAt)}` : "non confirmée"} - ${fmtDuration(s.visibleMs)} à l'écran - ${s.fullTextOpenedAt ? `texte intégral ouvert le ${frDate(s.fullTextOpenedAt)}` : "résumé lu, texte intégral non ouvert"}`,
      { size: 9.5, indent: 6, gap: 2 },
    );
  }
  w.space(8);

  if (e.flags.length) {
    w.text("Alertes du questionnaire", { size: 11.5, bold: true, color: ACCENT, gap: 4 });
    for (const f of e.flags) {
      w.text(
        `${f.message}${f.detail ? ` : ${f.detail}` : ""} - ${f.reviewedAt ? `vérifiée le ${frDate(f.reviewedAt)}` : "non vérifiée"}`,
        { size: 9.5, indent: 6, gap: 2 },
      );
    }
    w.space(8);
  }

  if (e.supersededFlags?.length) {
    w.text("Réponses remplacées par le patient", { size: 11.5, bold: true, color: ACCENT, gap: 4 });
    for (const f of e.supersededFlags) {
      w.text(
        `${f.message}${f.detail ? ` : ${f.detail}` : ""} - ${f.reviewedAt ? `vérifiée le ${frDate(f.reviewedAt)}` : "non vérifiée"} - remplacée le ${frDate(f.supersededAt)}`,
        { size: 9.5, indent: 6, gap: 2 },
      );
    }
    w.space(8);
  }

  w.text("Journal horodaté", { size: 11.5, bold: true, color: ACCENT, gap: 4 });
  if (e.chain) {
    w.text(
      e.chain.intact
        ? "Journal chaîné (SHA-256) : chaque événement contient l'empreinte du précédent ; la chaîne a été recalculée à l'export et est intègre."
        : `Attention : la vérification de la chaîne échoue à l'événement n° ${e.chain.brokenAt}.`,
      { size: 9, color: e.chain.intact ? MUTED : ACCENT, gap: 2 },
    );
    if (e.chain.headHash) w.text(`Dernier maillon (n° ${e.chain.headSeq}) : ${e.chain.headHash}`, { size: 8.5, color: MUTED, gap: 4 });
  }
  for (const ev of e.events) {
    w.text(`${frDate(ev.at)} - ${ev.label} (${ev.actor}${ev.ip ? `, IP ${ev.ip}` : ""})${ev.details ? ` - ${ev.details}` : ""}`, {
      size: 9,
      indent: 6,
      gap: 2,
    });
  }
  return doc.save();
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
}
