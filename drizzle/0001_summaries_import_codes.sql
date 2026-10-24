CREATE TYPE "public"."otp_purpose" AS ENUM('sign', 'access');--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE 'sms_email' BEFORE 'manual_link';--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"sha256" text NOT NULL,
	"rows" integer NOT NULL,
	"created" integer NOT NULL,
	"skipped" integer NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "birth_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_events" ALTER COLUMN "acknowledged_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_requests" ADD COLUMN "scheduled_send_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consent_requests" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "purpose" "otp_purpose" DEFAULT 'sign' NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_events" ADD COLUMN "full_text_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "template_versions" ADD COLUMN "summaries_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "template_versions" ADD COLUMN "summaries_approved_by_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_summaries_approved_by_id_users_id_fk" FOREIGN KEY ("summaries_approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;