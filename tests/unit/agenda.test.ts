import { describe, expect, it } from "vitest";
import {
  detectColumns,
  isMobile,
  matchReason,
  parseAgenda,
  parseBirthDate,
  parseCsv,
  parseDate,
  parsePhone,
  parseTime,
  splitFullName,
} from "@/domain/agenda";

const TODAY = new Date("2026-10-24T08:00:00Z");

describe("CSV", () => {
  it("handles ; with BOM, quotes and CRLF", () => {
    const rows = parseCsv('﻿Nom;Motif\r\n"DUPONT; Jr";"Infiltration ""PRP"""\r\n');
    expect(rows).toEqual([
      ["Nom", "Motif"],
      ["DUPONT; Jr", 'Infiltration "PRP"'],
    ]);
  });
  it("detects comma and tab delimiters", () => {
    expect(parseCsv("a,b\n1,2")[1]).toEqual(["1", "2"]);
    expect(parseCsv("a\tb\n1\t2")[1]).toEqual(["1", "2"]);
  });
  it("skips blank lines", () => {
    expect(parseCsv("a;b\n\n1;2\n;\n")).toHaveLength(2);
  });
});

describe("Column detection", () => {
  it("maps French Doctolib-like headers in any order", () => {
    const m = detectColumns(["Motif", "Téléphone portable", "Prénom", "Nom", "Date de naissance", "Date du rendez-vous", "Heure", "E-mail"]);
    expect(m).toMatchObject({ motif: 0, phone: 1, firstName: 2, lastName: 3, birthDate: 4, date: 5, time: 6, email: 7 });
  });
  it("does not take the birth date column as the appointment date", () => {
    const m = detectColumns(["Date de naissance", "Date"]);
    expect(m.birthDate).toBe(0);
    expect(m.date).toBe(1);
  });
  it("accepts a combined date-time column and a single patient column", () => {
    const m = detectColumns(["Début", "Patient", "Mobile", "Type de RDV"]);
    expect(m).toMatchObject({ datetime: 0, fullName: 1, phone: 2, motif: 3 });
  });
});

describe("Value parsing", () => {
  it("parses dates", () => {
    expect(parseDate("30/10/2026")).toBe("2026-10-30");
    expect(parseDate("2026-10-30")).toBe("2026-10-30");
    expect(parseDate("30.10.26")).toBe("2026-10-30");
    expect(parseDate("31/02/2026")).toBeNull();
  });
  it("puts 2-digit birth years in the right century", () => {
    expect(parseBirthDate("12/02/71", TODAY)).toBe("1971-02-12");
    expect(parseBirthDate("12/02/15", TODAY)).toBe("2015-02-12");
  });
  it("parses times", () => {
    expect(parseTime("9h")).toBe("09:00");
    expect(parseTime("9h30")).toBe("09:30");
    expect(parseTime("14:05:00")).toBe("14:05");
    expect(parseTime("25:00")).toBeNull();
  });
  it("normalises phones and spots mobiles", () => {
    expect(parsePhone("+33 6 12 12 12 12")).toBe("06 12 12 12 12");
    expect(parsePhone("0611223344")).toBe("06 11 22 33 44");
    expect(parsePhone("612345678")).toBe("06 12 34 56 78");
    expect(parsePhone("abc")).toBeNull();
    expect(isMobile("06 12 12 12 12")).toBe(true);
    expect(isMobile("01 45 67 89 10")).toBe(false);
  });
  it("splits full names with an all-caps last name", () => {
    expect(splitFullName("Marie DUPONT")).toEqual({ firstName: "Marie", lastName: "Dupont" });
    expect(splitFullName("DE LA TOUR Anne-Sophie")).toEqual({ firstName: "Anne-Sophie", lastName: "De La Tour" });
  });
});

describe("Agenda", () => {
  const csv = [
    "Date du rendez-vous;Heure;Nom;Prénom;Date de naissance;Téléphone portable;Email;Motif",
    "30/10/2026;09:00;ROUSSEAU;Hélène;12/02/1971;06 22 33 44 55;helene@example.fr;Infiltration PRP",
    "30/10/2026;9h30;BLANC;Hugo;;;hugo.blanc@example.fr;Infiltration corticoïde",
    "xx;09:00;;Inès;;06 77 88 99 00;;Consultation",
  ].join("\n");

  it("reads rows and title-cases capital last names", () => {
    const a = parseAgenda(csv, TODAY);
    expect(a.missing).toEqual([]);
    expect(a.rows[0]).toMatchObject({ line: 2, date: "2026-10-30", time: "09:00", lastName: "Rousseau", firstName: "Hélène", birthDate: "1971-02-12", phone: "06 22 33 44 55" });
    expect(a.rows[1]).toMatchObject({ time: "09:30", birthDate: null, phone: null, email: "hugo.blanc@example.fr", errors: [] });
  });
  it("flags bad rows instead of failing", () => {
    const a = parseAgenda(csv, TODAY);
    expect(a.rows[2].errors).toContain("date invalide");
    expect(a.rows[2].errors).toContain("nom ou prénom manquant");
  });
  it("reports missing columns", () => {
    expect(parseAgenda("Nom;Prénom\nA;B", TODAY).missing).toEqual(["date du rendez-vous", "heure", "motif", "téléphone ou e-mail"]);
  });
});

describe("Motif matching", () => {
  const reasons = [
    { id: "1", label: "Infiltration PRP" },
    { id: "2", label: "Infiltration corticoïde" },
    { id: "3", label: "Infiltration rachidienne" },
  ];
  it("matches exactly, ignoring case and accents", () => {
    expect(matchReason("infiltration CORTICOIDE", reasons)?.id).toBe("2");
  });
  it("matches when the export adds detail", () => {
    expect(matchReason("Infiltration PRP - genou droit", reasons)?.id).toBe("1");
  });
  it("ignores unrelated motifs", () => {
    expect(matchReason("Première consultation", reasons)).toBeNull();
    expect(matchReason("Infiltration genou", reasons)).toBeNull();
  });
});

import { pickChannel, sendTimeFor } from "@/domain/delivery";

describe("Delivery", () => {
  it("picks the channel from preference and contacts", () => {
    expect(pickChannel("sms_first", "06", "a@b.fr")).toBe("sms");
    expect(pickChannel("sms_first", null, "a@b.fr")).toBe("email");
    expect(pickChannel("email_first", "06", null)).toBe("sms");
    expect(pickChannel("both", "06", "a@b.fr")).toBe("sms_email");
    expect(pickChannel("both", null, null)).toBeNull();
  });
  it("sends lead hours before, never in the past", () => {
    const now = new Date("2026-10-24T08:00:00Z");
    expect(sendTimeFor(new Date("2026-10-30T08:00:00Z"), 72, now).toISOString()).toBe("2026-10-27T08:00:00.000Z");
    expect(sendTimeFor(new Date("2026-10-25T08:00:00Z"), 72, now)).toEqual(now);
  });
});
