import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  pgEnum,
  customType,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  ConsentBlock,
  InfoSection,
  PrecheckAnswers,
  Question,
  SignatureLevel,
} from "@/domain/types";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const signatureLevelEnum = pgEnum("signature_level", ["SES", "AES"]);
export const requestStatusEnum = pgEnum("request_status", [
  "created",
  "sent",
  "opened",
  "info_read",
  "precheck_done",
  "awaiting_otp",
  "awaiting_provider",
  "signed",
  "expired",
  "cancelled",
]);
export const channelEnum = pgEnum("channel", ["sms", "email", "manual_link"]);
export const roleEnum = pgEnum("role", ["practitioner", "assistant", "admin"]);
export const flagSeverityEnum = pgEnum("flag_severity", ["info", "warn", "block"]);
export const documentKindEnum = pgEnum("document_kind", [
  "unsigned_consent",
  "signed_consent",
  "provider_audit_trail",
]);

/** A medical practice (tenant). */
export const practices = pgTable("practices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  practitionerName: text("practitioner_name").notNull(),
  specialty: text("specialty").notNull(),
  phone: text("phone").notNull(),
  contactEmail: text("contact_email").notNull(),
  /** How many hours before the appointment the consent link goes out. */
  sendLeadHours: integer("send_lead_hours").notNull().default(72),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id").notNull().references(() => practices.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("assistant"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

/** A consent form family (e.g. "Infiltration échoguidée"). */
export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: uuid("practice_id").notNull().references(() => practices.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An immutable, numbered version of a template. A request always points at
 * the exact version the patient read, which is what makes the proof hold.
 */
export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull().references(() => templates.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    intro: jsonb("intro").$type<string[]>().notNull(),
    sections: jsonb("sections").$type<InfoSection[]>().notNull(),
    consent: jsonb("consent").$type<ConsentBlock>().notNull(),
    questions: jsonb("questions").$type<Question[]>().notNull(),
    signatureLevel: signatureLevelEnum("signature_level").notNull().default("SES"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("template_versions_uq").on(t.templateId, t.version)],
);

/** Maps a Doctolib visit reason ("motif") to a template and a prefilled act. */
export const visitReasons = pgTable("visit_reasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: uuid("practice_id").notNull().references(() => practices.id),
  label: text("label").notNull(),
  templateId: uuid("template_id").notNull().references(() => templates.id),
  defaultAct: text("default_act").notNull(),
  signatureLevelOverride: signatureLevelEnum("signature_level_override"),
});

export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: uuid("practice_id").notNull().references(() => practices.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthDate: text("birth_date").notNull(), // YYYY-MM-DD
  phone: text("phone").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id").notNull().references(() => practices.id),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    visitReasonLabel: text("visit_reason_label").notNull(),
    /** "manual" for v1; "doctolib" once the Partner API trigger is live. */
    source: text("source").notNull().default("manual"),
    externalId: text("external_id"),
  },
  (t) => [index("appointments_day_idx").on(t.practiceId, t.scheduledAt)],
);

/** One consent to collect from one patient for one appointment. */
export const consentRequests = pgTable(
  "consent_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id").notNull().references(() => practices.id),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    templateVersionId: uuid("template_version_id").notNull().references(() => templateVersions.id),
    status: requestStatusEnum("status").notNull().default("created"),
    channel: channelEnum("channel").notNull().default("sms"),
    signatureLevel: signatureLevelEnum("signature_level").$type<SignatureLevel>().notNull(),
    plannedAct: text("planned_act").notNull(),
    plannedLocation: text("planned_location").notNull().default(""),
    /** sha256 of the link token; the token itself is never stored. */
    tokenHash: text("token_hash").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    failedDobAttempts: integer("failed_dob_attempts").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    answers: jsonb("answers").$type<PrecheckAnswers>(),
    patientAckAt: timestamp("patient_ack_at", { withTimezone: true }),
    signatureImage: bytea("signature_image"),
    providerName: text("provider_name"),
    providerRequestId: text("provider_request_id"),
    providerSignerId: text("provider_signer_id"),
    providerDocumentId: text("provider_document_id"),
    providerSigningUrl: text("provider_signing_url"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signerIp: text("signer_ip"),
    confirmedAct: text("confirmed_act"),
    confirmedLocation: text("confirmed_location"),
    confirmedById: uuid("confirmed_by_id").references(() => users.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    sendCount: integer("send_count").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("consent_requests_token_uq").on(t.tokenHash),
    index("consent_requests_practice_idx").on(t.practiceId, t.status),
    uniqueIndex("consent_requests_provider_uq").on(t.providerRequestId),
  ],
);

/** Per-section reading trace: the proof that information was delivered. */
export const readingEvents = pgTable(
  "reading_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().references(() => consentRequests.id),
    sectionId: text("section_id").notNull(),
    visibleMs: integer("visible_ms").notNull().default(0),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("reading_events_uq").on(t.requestId, t.sectionId)],
);

/** A Pre-Check answer that the practitioner must look at before the act. */
export const precheckFlags = pgTable("precheck_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().references(() => consentRequests.id),
  questionId: text("question_id").notNull(),
  severity: flagSeverityEnum("severity").notNull(),
  message: text("message").notNull(),
  detail: text("detail").notNull().default(""),
  reviewedById: uuid("reviewed_by_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

/** Stored PDFs. Kept in the database (on the HDS-certified host) for v1. */
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().references(() => consentRequests.id),
  kind: documentKindEnum("kind").notNull(),
  sha256: text("sha256").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Mock-provider OTPs (dev and demo only). Hash only, short-lived. */
export const otpChallenges = pgTable("otp_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().references(() => consentRequests.id),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/** Append-only evidence log. Every patient and staff action lands here. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id").notNull().references(() => practices.id),
    requestId: uuid("request_id").references(() => consentRequests.id),
    actor: text("actor").notNull(), // "patient" | "user:<id>" | "system" | "provider"
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    userAgent: text("user_agent"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_request_idx").on(t.requestId, t.at)],
);
