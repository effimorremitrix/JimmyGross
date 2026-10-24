/**
 * Demo data for Dr Gross's practice: accounts, the infiltration template,
 * Doctolib visit reasons, and tomorrow's patients in every state.
 * Run: npm run db:seed   (wipes and recreates the demo practice)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { infiltrationTemplate as T } from "../src/domain/templates/infiltration-echoguidee";
import { computeFlags } from "../src/domain/precheck";
import type { PrecheckAnswers } from "../src/domain/types";
import { buildConsentPdf, sealPdfMock } from "../src/lib/pdf";
import { parisToUtc, parisYmd, shiftYmd } from "../src/lib/dates";

const sha = (b: string | Uint8Array) => createHash("sha256").update(b).digest("hex");
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/** Tomorrow at hh:mm, Paris time. */
function tomorrowAt(hhmm: string): Date {
  return parisToUtc(shiftYmd(parisYmd(), 1), hhmm);
}

async function main() {
  // The owner role (eclaira_owner); DATABASE_URL is the fallback for local dev.
  const pool = new Pool({ connectionString: process.env.DATABASE_OWNER_URL || process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const password = process.env.SEED_PASSWORD ?? "consentza-demo";

  // Wipe demo practice (child tables first).
  const existing = await db.query.practices.findFirst({ where: eq(schema.practices.name, "Cabinet du Dr Jimmy Gross") });
  if (existing) {
    // Evidence tables are append-only (migration 0002). Wiping demo data needs a
    // session that skips triggers: eclaira_owner, granted SET on
    // session_replication_role by docker/postgres-init (or a superuser). The
    // app's own role cannot do this.
    await pool.query(
      `BEGIN;
       SET LOCAL session_replication_role = replica;
       DELETE FROM audit_events WHERE practice_id=$1;
       DELETE FROM otp_challenges WHERE request_id IN (SELECT id FROM consent_requests WHERE practice_id=$1);
       DELETE FROM documents WHERE request_id IN (SELECT id FROM consent_requests WHERE practice_id=$1);
       DELETE FROM precheck_flags WHERE request_id IN (SELECT id FROM consent_requests WHERE practice_id=$1);
       DELETE FROM precheck_submissions WHERE request_id IN (SELECT id FROM consent_requests WHERE practice_id=$1);
       DELETE FROM reading_events WHERE request_id IN (SELECT id FROM consent_requests WHERE practice_id=$1);
       DELETE FROM consent_requests WHERE practice_id=$1;
       DELETE FROM import_batches WHERE practice_id=$1;
       DELETE FROM appointments WHERE practice_id=$1;
       DELETE FROM patients WHERE practice_id=$1;
       DELETE FROM visit_reasons WHERE practice_id=$1;
       DELETE FROM template_versions WHERE template_id IN (SELECT id FROM templates WHERE practice_id=$1);
       DELETE FROM templates WHERE practice_id=$1;
       DELETE FROM users WHERE practice_id=$1;
       DELETE FROM practices WHERE id=$1;
       COMMIT;`.replace(/\$1/g, `'${existing.id}'`),
    );
  }

  const [practice] = await db
    .insert(schema.practices)
    .values({
      name: "Cabinet du Dr Jimmy Gross",
      practitionerName: "Dr Jimmy Gross",
      specialty: "Rhumatologie interventionnelle, traumatologie du sport",
      phone: "06 07 96 03 19",
      contactEmail: "cabinet@example.fr",
    })
    .returning();

  const hash = await bcrypt.hash(password, 12);
  const [doctor] = await db
    .insert(schema.users)
    .values([
      { practiceId: practice.id, email: "dr.gross@demo.consentza.fr", name: "Dr Jimmy Gross", passwordHash: hash, role: "practitioner" },
      { practiceId: practice.id, email: "secretariat@demo.consentza.fr", name: "Secrétariat", passwordHash: hash, role: "assistant" },
    ])
    .returning();

  const [template] = await db
    .insert(schema.templates)
    .values({ practiceId: practice.id, slug: T.slug, title: "Infiltration échoguidée" })
    .returning();
  const [version] = await db
    .insert(schema.templateVersions)
    .values({
      templateId: template.id,
      version: 1,
      title: T.title,
      subtitle: T.subtitle,
      intro: T.intro,
      sections: T.sections,
      consent: T.consent,
      questions: T.questions,
      signatureLevel: "SES",
    })
    .returning();

  await db.insert(schema.visitReasons).values([
    { practiceId: practice.id, label: "Infiltration PRP", templateId: template.id, defaultAct: "Injection de PRP" },
    { practiceId: practice.id, label: "Infiltration corticoïde", templateId: template.id, defaultAct: "Infiltration de corticoïde" },
    { practiceId: practice.id, label: "Infiltration acide hyaluronique", templateId: template.id, defaultAct: "Infiltration d'acide hyaluronique" },
    { practiceId: practice.id, label: "Ponction de kyste ou d'épanchement", templateId: template.id, defaultAct: "Ponction / évacuation de kyste ou d'épanchement" },
    { practiceId: practice.id, label: "Infiltration rachidienne", templateId: template.id, defaultAct: "Infiltration rachidienne", signatureLevelOverride: "AES" },
  ]);

  type Demo = {
    first: string; last: string; dob: string; phone: string; time: string; reason: string; act: string; loc: string;
    state: "signed" | "sent" | "opened" | "info_read"; level?: "SES" | "AES"; yes?: Record<string, string>; readMs?: number;
  };
  const demos: Demo[] = [
    { first: "Paul", last: "Martin", dob: "1969-04-02", phone: "06 11 22 33 48", time: "09:00", reason: "Infiltration corticoïde", act: "Infiltration de corticoïde", loc: "Épaule gauche", state: "signed", readMs: 280_000 },
    { first: "Sophie", last: "Laurent", dob: "1975-09-21", phone: "06 21 32 43 07", time: "09:30", reason: "Infiltration acide hyaluronique", act: "Infiltration d'acide hyaluronique", loc: "Genou gauche", state: "signed", readMs: 235_000 },
    { first: "Marie", last: "Dupont", dob: "1978-03-14", phone: "06 12 34 56 12", time: "10:30", reason: "Infiltration PRP", act: "Injection de PRP", loc: "Genou droit", state: "sent" },
    { first: "Karim", last: "Haddad", dob: "1988-11-05", phone: "06 45 56 67 78", time: "11:00", reason: "Ponction de kyste ou d'épanchement", act: "Ponction / évacuation de kyste ou d'épanchement", loc: "Poignet droit", state: "info_read" },
    { first: "Jean", last: "Bernard", dob: "1956-06-30", phone: "06 98 87 76 81", time: "14:00", reason: "Infiltration PRP", act: "Injection de PRP", loc: "Tendon d'Achille droit", state: "signed", yes: { anticoagulant: "Kardégic 75 mg" }, readMs: 362_000 },
    { first: "Claire", last: "Lefèvre", dob: "1962-01-17", phone: "07 54 43 32 29", time: "14:30", reason: "Infiltration corticoïde", act: "Infiltration de corticoïde", loc: "Hanche droite", state: "signed", yes: { diabete: "HbA1c 8,1 %" }, readMs: 211_000 },
    { first: "Thomas", last: "Petit", dob: "1983-08-08", phone: "06 33 44 55 66", time: "15:30", reason: "Infiltration rachidienne", act: "Infiltration rachidienne", loc: "L4-L5", state: "sent", level: "AES" },
  ];

  const links: string[] = [];
  for (const d of demos) {
    const [patient] = await db
      .insert(schema.patients)
      .values({ practiceId: practice.id, firstName: d.first, lastName: d.last, birthDate: d.dob, phone: d.phone, email: `${d.first.toLowerCase()}@example.fr` })
      .returning();
    const scheduledAt = tomorrowAt(d.time);
    const [appt] = await db
      .insert(schema.appointments)
      .values({ practiceId: practice.id, patientId: patient.id, scheduledAt, visitReasonLabel: d.reason })
      .returning();
    const token = randomBytes(24).toString("base64url");
    const answers: PrecheckAnswers | null =
      d.state === "signed"
        ? {
            items: Object.fromEntries(
              T.questions.map((q) => [q.id, d.yes?.[q.id] ? { answer: "oui" as const, detail: d.yes[q.id] } : { answer: "non" as const }]),
            ),
            emergencyContact: { name: "Proche de démonstration", phone: "06 00 00 00 00", relation: "Conjoint(e)" },
          }
        : null;
    const sentAt = new Date(scheduledAt.getTime() - 72 * 3600 * 1000);
    const signedAt = new Date(sentAt.getTime() + 5 * 3600 * 1000);
    const [req] = await db
      .insert(schema.consentRequests)
      .values({
        practiceId: practice.id,
        appointmentId: appt.id,
        patientId: patient.id,
        templateVersionId: version.id,
        status: d.state,
        channel: "sms",
        signatureLevel: d.level ?? "SES",
        plannedAct: d.act,
        plannedLocation: d.loc,
        tokenHash: sha(token),
        tokenExpiresAt: new Date(Date.now() + 10 * 24 * 3600 * 1000),
        answers,
        patientAckAt: d.state === "signed" ? signedAt : null,
        providerName: d.state === "signed" ? "mock" : null,
        signedAt: d.state === "signed" ? signedAt : null,
        signerIp: d.state === "signed" ? "203.0.113.24" : null,
        lastSentAt: sentAt,
        sendCount: 1,
        createdById: doctor.id,
      })
      .returning();

    await db.insert(schema.auditEvents).values({ practiceId: practice.id, requestId: req.id, actor: `user:${doctor.id}`, type: "request.created", at: new Date(sentAt.getTime() - 60_000) });
    await db.insert(schema.auditEvents).values({ practiceId: practice.id, requestId: req.id, actor: "system", type: "request.sent", data: { channel: "sms" }, at: sentAt });

    if (d.state === "signed" || d.state === "info_read") {
      const per = Math.round((d.readMs ?? 190_000) / T.sections.length);
      let t = sentAt.getTime() + 4 * 3600 * 1000;
      await db.insert(schema.auditEvents).values({ practiceId: practice.id, requestId: req.id, actor: "patient", type: "patient.identity_ok", ip: "203.0.113.24", at: new Date(t) });
      for (const s of T.sections) {
        t += per;
        await db.insert(schema.readingEvents).values({ requestId: req.id, sectionId: s.id, visibleMs: per, acknowledgedAt: new Date(t) });
        await db.insert(schema.auditEvents).values({ practiceId: practice.id, requestId: req.id, actor: "patient", type: "patient.section_read", data: { sectionId: s.id, visibleMs: per }, ip: "203.0.113.24", at: new Date(t) });
      }
    }

    if (d.state === "signed" && answers) {
      const [submission] = await db
        .insert(schema.precheckSubmissions)
        .values({ requestId: req.id, seq: 1, answers, submittedAt: new Date(signedAt.getTime() - 120_000) })
        .returning();
      for (const f of computeFlags(T.questions, d.act, answers)) {
        await db.insert(schema.precheckFlags).values({ requestId: req.id, submissionId: submission.id, questionId: f.questionId, severity: f.severity, message: f.message, detail: f.detail });
      }
      const { bytes } = await buildConsentPdf({
        practiceName: practice.name,
        practitionerName: practice.practitionerName,
        practicePhone: practice.phone,
        templateTitle: T.title,
        templateSubtitle: T.subtitle,
        templateVersion: 1,
        intro: T.intro,
        sections: T.sections,
        consent: T.consent,
        questions: T.questions,
        patient: { firstName: d.first, lastName: d.last, birthDate: d.dob, phone: d.phone },
        plannedAct: d.act,
        plannedLocation: d.loc,
        appointmentAt: scheduledAt,
        answers,
        ackAt: signedAt,
        signaturePng: null,
        requestId: req.id,
      });
      const signed = await sealPdfMock(bytes, {
        unsignedSha256: sha(bytes),
        signerName: `${d.first} ${d.last.toUpperCase()}`,
        signerPhoneMasked: `${d.phone.slice(0, 2)} •• •• •• ${d.phone.slice(-2)}`,
        signedAt,
        ip: "203.0.113.24",
        level: "SES",
        method: "Signature manuscrite tracée + code SMS à usage unique",
        requestId: req.id,
      });
      await db.insert(schema.documents).values([
        { requestId: req.id, kind: "unsigned_consent", sha256: sha(bytes), bytes: Buffer.from(bytes) },
        { requestId: req.id, kind: "signed_consent", sha256: sha(signed), bytes: Buffer.from(signed) },
      ]);
      await db.insert(schema.auditEvents).values([
        { practiceId: practice.id, requestId: req.id, actor: "patient", type: "patient.precheck_submitted", ip: "203.0.113.24", at: new Date(signedAt.getTime() - 120_000) },
        { practiceId: practice.id, requestId: req.id, actor: "patient", type: "patient.consent_given", ip: "203.0.113.24", at: new Date(signedAt.getTime() - 60_000) },
        { practiceId: practice.id, requestId: req.id, actor: "provider", type: "signature.otp_sent", at: new Date(signedAt.getTime() - 50_000) },
        { practiceId: practice.id, requestId: req.id, actor: "patient", type: "signature.signed", data: { provider: "mock", level: "SES", sha256: sha(signed) }, ip: "203.0.113.24", at: signedAt },
      ]);
    } else {
      links.push(`${d.first} ${d.last} (né(e) le ${d.dob.split("-").reverse().join("/")}): ${APP_URL}/p/${token}`);
    }
  }

  // A demo agenda export for next week, in a Doctolib-like layout.
  const nextWeek = (d: number, hhmm: string) => {
    const ymd = shiftYmd(parisYmd(), 6 + d);
    return [ymd.split("-").reverse().join("/"), hhmm];
  };
  const csv = [
    ["Date du rendez-vous", "Heure", "Nom", "Prénom", "Date de naissance", "Téléphone portable", "Email", "Motif"],
    [...nextWeek(0, "09:00"), "ROUSSEAU", "Hélène", "12/02/1971", "06 22 33 44 55", "helene@example.fr", "Infiltration PRP"],
    [...nextWeek(0, "09:30"), "BLANC", "Hugo", "", "", "hugo.blanc@example.fr", "Infiltration corticoïde"],
    [...nextWeek(0, "10:00"), "GIRARD", "Inès", "03/09/1990", "06 77 88 99 00", "", "Première consultation"],
    [...nextWeek(1, "11:00"), "MOREL", "Louis", "21/06/1958", "01 45 67 89 10", "", "Infiltration acide hyaluronique"],
    [...nextWeek(1, "14:00"), "FOURNIER", "Chloé", "30/11/1985", "+33 6 12 12 12 12", "chloe@example.fr", "Infiltration genou"],
    [...nextWeek(2, "15:30"), "LAMBERT", "Marc", "07/04/1979", "0611223344", "", "Infiltration rachidienne"],
    [...nextWeek(2, "15:30"), "LAMBERT", "Marc", "07/04/1979", "0611223344", "", "Infiltration rachidienne"],
  ]
    .map((r) => r.map((c) => (/[;"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";"))
    .join("\r\n");
  mkdirSync("samples", { recursive: true });
  writeFileSync("samples/agenda-semaine-demo.csv", "\uFEFF" + csv);

  console.log("\nSeeded the demo practice.");
  console.log("Demo agenda export (next week): samples/agenda-semaine-demo.csv");
  console.log(`Login: dr.gross@demo.consentza.fr / ${password}  (or secretariat@demo.consentza.fr)`);
  console.log("Patient links to try:");
  for (const l of links) console.log(`  ${l}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
