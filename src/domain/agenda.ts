/**
 * Agenda import: turns a practice's appointment export (CSV from Doctolib or any
 * scheduling tool) into normalised rows. Pure functions, no I/O, unit-tested.
 * Column names vary by export, so headers are matched against French/English synonyms.
 */

export type Field =
  | "date"
  | "time"
  | "datetime"
  | "lastName"
  | "firstName"
  | "fullName"
  | "birthDate"
  | "phone"
  | "email"
  | "motif"
  | "location";

const SYNONYMS: Record<Field, string[]> = {
  datetime: ["date et heure", "date heure", "debut", "début", "start", "date de debut", "horaire"],
  date: ["date", "date du rdv", "date rdv", "date du rendez-vous", "date de rendez-vous", "jour", "date rendez vous"],
  time: ["heure", "heure du rdv", "heure de debut", "heure debut", "heure rdv"],
  lastName: ["nom", "nom de famille", "nom patient", "nom du patient", "nom de naissance", "nom d'usage", "last name"],
  firstName: ["prenom", "prenom patient", "prenom du patient", "first name"],
  fullName: ["patient", "nom complet", "nom et prenom", "patient nom", "identite"],
  birthDate: ["date de naissance", "naissance", "ddn", "ne le", "nee le", "ne(e) le", "birth date", "date naissance"],
  phone: ["telephone", "tel", "portable", "mobile", "telephone portable", "tel portable", "numero de telephone", "telephone mobile", "phone"],
  email: ["email", "e-mail", "mail", "adresse email", "adresse e-mail", "courriel", "adresse mail"],
  motif: ["motif", "motif de consultation", "motif du rdv", "motif de rdv", "type de rdv", "type de rendez-vous", "acte", "type", "prestation", "visit motive"],
  location: ["localisation", "zone", "site", "cote", "articulation"],
};

export function normHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_.:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase, no accents, single spaces: used to match motifs too. */
export const normText = normHeader;

/** Parses CSV text (`;` or `,` or tab, quoted fields, BOM, CRLF). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ";";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

export type Mapping = Partial<Record<Field, number>>;

/** Best column index per field. Exact synonym beats "contains". Each column used once. */
export function detectColumns(headers: string[]): Mapping {
  const H = headers.map(normHeader);
  const used = new Set<number>();
  const map: Mapping = {};
  const order: Field[] = ["birthDate", "datetime", "date", "time", "firstName", "lastName", "fullName", "phone", "email", "motif", "location"];
  for (const pass of ["exact", "contains"] as const) {
    for (const f of order) {
      if (map[f] !== undefined) continue;
      const syn = SYNONYMS[f].map(normHeader);
      const idx = H.findIndex((h, i) => !used.has(i) && (pass === "exact" ? syn.includes(h) : syn.some((s) => s.length > 3 && h.includes(s))));
      if (idx >= 0) {
        map[f] = idx;
        used.add(idx);
      }
    }
  }
  // A "date" column holding a time too counts as datetime.
  return map;
}

/** "24/10/2026", "24/10/26", "2026-10-24", "24.10.2026" → "2026-10-24". */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[2], +m[1]);
  }
  return null;
}

/** Birth dates with 2-digit years belong to the past century when needed. */
export function parseBirthDate(s: string, today = new Date()): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/.exec(s.trim());
  if (m) {
    const yy = +m[3];
    const y = 2000 + yy > today.getFullYear() ? 1900 + yy : 2000 + yy;
    return valid(y, +m[2], +m[1]);
  }
  return parseDate(s);
}

function valid(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "9h", "9h30", "09:30", "9:30:00" → "09:30". */
export function parseTime(s: string): string | null {
  const m = /(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(s.trim());
  if (!m) return null;
  const h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** French mobile or international number, normalised for display ("06 12 34 56 78"). */
export function parsePhone(s: string): string | null {
  const raw = s.replace(/[^\d+]/g, "");
  if (!raw) return null;
  let d = raw;
  if (d.startsWith("+33")) d = `0${d.slice(3)}`;
  else if (d.startsWith("0033")) d = `0${d.slice(4)}`;
  if (/^0\d{9}$/.test(d)) return d.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  if (/^(\+|00)\d{8,15}$/.test(raw)) return raw.startsWith("00") ? `+${raw.slice(2)}` : raw;
  if (/^[67]\d{8}$/.test(d)) return `0${d}`.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return null;
}

/** Mobile numbers can receive SMS; landlines cannot. */
export function isMobile(phone: string): boolean {
  const d = phone.replace(/\D/g, "");
  return /^0[67]/.test(d) || phone.startsWith("+") && !phone.startsWith("+33") || /^\+33[67]/.test(phone.replace(/\s/g, ""));
}

export function parseEmail(s: string): string | null {
  const t = s.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? t : null;
}

/** "Prénom NOM" or "NOM Prénom": all-caps words are the last name. */
export function splitFullName(s: string): { firstName: string; lastName: string } | null {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const caps = parts.filter((p) => p.length > 1 && p === p.toUpperCase() && /[A-ZÀ-Þ]/.test(p));
  if (caps.length && caps.length < parts.length) {
    return { lastName: titleCase(caps.join(" ")), firstName: parts.filter((p) => !caps.includes(p)).join(" ") };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

export interface AgendaRow {
  line: number;
  date: string | null;
  time: string | null;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  motif: string;
  location: string;
  errors: string[];
}

export interface ParsedAgenda {
  headers: string[];
  mapping: Mapping;
  missing: string[];
  rows: AgendaRow[];
}

/** Reads the file into rows with per-row errors; never throws on bad data. */
export function parseAgenda(text: string, today = new Date()): ParsedAgenda {
  const table = parseCsv(text);
  if (table.length < 2) return { headers: table[0] ?? [], mapping: {}, missing: ["une ligne d'en-têtes et au moins un rendez-vous"], rows: [] };
  const headers = table[0];
  const map = detectColumns(headers);
  const missing: string[] = [];
  if (map.date === undefined && map.datetime === undefined) missing.push("date du rendez-vous");
  if (map.time === undefined && map.datetime === undefined) missing.push("heure");
  if (map.lastName === undefined && map.fullName === undefined) missing.push("nom du patient");
  if (map.motif === undefined) missing.push("motif");
  if (map.phone === undefined && map.email === undefined) missing.push("téléphone ou e-mail");
  const cell = (r: string[], f: Field) => (map[f] !== undefined ? (r[map[f]!] ?? "").trim() : "");

  const rows = table.slice(1).map((r, i) => {
    const errors: string[] = [];
    const dtRaw = cell(r, "datetime");
    const date = parseDate(cell(r, "date") || dtRaw);
    const time = parseTime(cell(r, "time") || (dtRaw.includes(" ") ? dtRaw.split(/\s+/).slice(1).join(" ") : "") || (cell(r, "date").includes(" ") ? cell(r, "date").split(/\s+/).slice(1).join(" ") : ""));
    let firstName = cell(r, "firstName");
    let lastName = cell(r, "lastName");
    if ((!firstName || !lastName) && cell(r, "fullName")) {
      const sp = splitFullName(cell(r, "fullName"));
      if (sp) {
        firstName ||= sp.firstName;
        lastName ||= sp.lastName;
      }
    }
    if (lastName && lastName === lastName.toUpperCase()) lastName = titleCase(lastName);
    const bRaw = cell(r, "birthDate");
    const birthDate = bRaw ? parseBirthDate(bRaw, today) : null;
    const pRaw = cell(r, "phone");
    const phone = pRaw ? parsePhone(pRaw) : null;
    const eRaw = cell(r, "email");
    const email = eRaw ? parseEmail(eRaw) : null;
    if (!date) errors.push("date invalide");
    if (!time) errors.push("heure invalide");
    if (!firstName || !lastName) errors.push("nom ou prénom manquant");
    if (bRaw && !birthDate) errors.push("date de naissance illisible");
    if (pRaw && !phone) errors.push("téléphone illisible");
    if (eRaw && !email) errors.push("e-mail illisible");
    return {
      line: i + 2,
      date,
      time,
      firstName,
      lastName,
      birthDate,
      phone,
      email,
      motif: cell(r, "motif"),
      location: cell(r, "location"),
      errors,
    };
  });
  return { headers, mapping: map, missing, rows };
}

export interface ReasonRef {
  id: string;
  label: string;
}

/** Exact (normalised) match first, then one label containing the other. */
export function matchReason(motif: string, reasons: ReasonRef[]): ReasonRef | null {
  const m = normText(motif);
  if (!m) return null;
  const exact = reasons.find((r) => normText(r.label) === m);
  if (exact) return exact;
  const partial = reasons.filter((r) => {
    const l = normText(r.label);
    return l.length > 3 && (m.includes(l) || l.includes(m));
  });
  return partial.sort((a, b) => b.label.length - a.label.length)[0] ?? null;
}
