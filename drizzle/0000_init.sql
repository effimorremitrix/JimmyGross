CREATE TYPE "public"."channel" AS ENUM('sms', 'email', 'manual_link');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('unsigned_consent', 'signed_consent', 'provider_audit_trail');--> statement-breakpoint
CREATE TYPE "public"."flag_severity" AS ENUM('info', 'warn', 'block');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('created', 'sent', 'opened', 'info_read', 'precheck_done', 'awaiting_otp', 'awaiting_provider', 'signed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('practitioner', 'assistant', 'admin');--> statement-breakpoint
CREATE TYPE "public"."signature_level" AS ENUM('SES', 'AES');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"visit_reason_label" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"request_id" uuid,
	"actor" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"status" "request_status" DEFAULT 'created' NOT NULL,
	"channel" "channel" DEFAULT 'sms' NOT NULL,
	"signature_level" "signature_level" NOT NULL,
	"planned_act" text NOT NULL,
	"planned_location" text DEFAULT '' NOT NULL,
	"token_hash" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"failed_dob_attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"answers" jsonb,
	"patient_ack_at" timestamp with time zone,
	"signature_image" "bytea",
	"provider_name" text,
	"provider_request_id" text,
	"provider_signer_id" text,
	"provider_document_id" text,
	"provider_signing_url" text,
	"signed_at" timestamp with time zone,
	"signer_ip" text,
	"confirmed_act" text,
	"confirmed_location" text,
	"confirmed_by_id" uuid,
	"confirmed_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"send_count" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"sha256" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"birth_date" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"practitioner_name" text NOT NULL,
	"specialty" text NOT NULL,
	"phone" text NOT NULL,
	"contact_email" text NOT NULL,
	"send_lead_hours" integer DEFAULT 72 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precheck_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"severity" "flag_severity" NOT NULL,
	"message" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reading_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"section_id" text NOT NULL,
	"visible_ms" integer DEFAULT 0 NOT NULL,
	"acknowledged_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"intro" jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"consent" jsonb NOT NULL,
	"questions" jsonb NOT NULL,
	"signature_level" "signature_level" DEFAULT 'SES' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'assistant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"label" text NOT NULL,
	"template_id" uuid NOT NULL,
	"default_act" text NOT NULL,
	"signature_level_override" "signature_level"
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_request_id_consent_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."consent_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_requests" ADD CONSTRAINT "consent_requests_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_requests" ADD CONSTRAINT "consent_requests_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_requests" ADD CONSTRAINT "consent_requests_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_requests" ADD CONSTRAINT "consent_requests_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_requests" ADD CONSTRAINT "consent_requests_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_requests" ADD CONSTRAINT "consent_requests_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_request_id_consent_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."consent_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_request_id_consent_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."consent_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precheck_flags" ADD CONSTRAINT "precheck_flags_request_id_consent_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."consent_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precheck_flags" ADD CONSTRAINT "precheck_flags_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_events" ADD CONSTRAINT "reading_events_request_id_consent_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."consent_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_reasons" ADD CONSTRAINT "visit_reasons_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_reasons" ADD CONSTRAINT "visit_reasons_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_day_idx" ON "appointments" USING btree ("practice_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "audit_events_request_idx" ON "audit_events" USING btree ("request_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_requests_token_uq" ON "consent_requests" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "consent_requests_practice_idx" ON "consent_requests" USING btree ("practice_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_requests_provider_uq" ON "consent_requests" USING btree ("provider_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reading_events_uq" ON "reading_events" USING btree ("request_id","section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_uq" ON "template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");