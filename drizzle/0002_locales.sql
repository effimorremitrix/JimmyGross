CREATE TABLE "template_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_version_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"content" jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_requests" ADD COLUMN "locale" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "preferred_locale" text;--> statement-breakpoint
ALTER TABLE "template_translations" ADD CONSTRAINT "template_translations_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_translations" ADD CONSTRAINT "template_translations_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "template_translations_uq" ON "template_translations" USING btree ("template_version_id","locale");