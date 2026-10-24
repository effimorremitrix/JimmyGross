CREATE TABLE "precheck_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "chain_seq" bigint;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "precheck_flags" ADD COLUMN "submission_id" uuid;--> statement-breakpoint
ALTER TABLE "precheck_flags" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "precheck_flags" ADD COLUMN "superseded_by_submission_id" uuid;--> statement-breakpoint
ALTER TABLE "precheck_submissions" ADD CONSTRAINT "precheck_submissions_request_id_consent_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."consent_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "precheck_submissions_uq" ON "precheck_submissions" USING btree ("request_id","seq");--> statement-breakpoint
ALTER TABLE "precheck_flags" ADD CONSTRAINT "precheck_flags_submission_id_precheck_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."precheck_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precheck_flags" ADD CONSTRAINT "precheck_flags_superseded_by_submission_id_precheck_submissions_id_fk" FOREIGN KEY ("superseded_by_submission_id") REFERENCES "public"."precheck_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_chain_uq" ON "audit_events" USING btree ("practice_id","chain_seq");--> statement-breakpoint
CREATE INDEX "precheck_flags_request_idx" ON "precheck_flags" USING btree ("request_id","superseded_at");--> statement-breakpoint
-- ===== Hand-written below: backfill, hash chain, immutability =====

-- 1. Backfill: every request that already has answers gets submission #1,
--    and its existing flags are attached to it.
INSERT INTO "precheck_submissions" ("request_id", "seq", "answers", "submitted_at")
SELECT "id", 1, "answers", COALESCE("patient_ack_at", "updated_at")
FROM "consent_requests"
WHERE "answers" IS NOT NULL;--> statement-breakpoint
UPDATE "precheck_flags" f
SET "submission_id" = s."id"
FROM "precheck_submissions" s
WHERE s."request_id" = f."request_id" AND s."seq" = 1 AND f."submission_id" IS NULL;--> statement-breakpoint

-- 2. Canonical hash of one audit row, chained to the previous row's hash.
--    jsonb text output is deterministic, so the same row always hashes the same.
CREATE OR REPLACE FUNCTION audit_event_hash(prev text, ev "audit_events") RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(
    COALESCE(prev, ''),
    ev."chain_seq",
    ev."id",
    ev."practice_id",
    ev."request_id",
    ev."actor",
    ev."type",
    ev."data",
    ev."ip",
    ev."user_agent",
    to_char(ev."at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text, 'UTF8')), 'hex')
$$;--> statement-breakpoint

-- 3. Backfill the chain for existing rows, per practice, in insertion order.
DO $$
DECLARE
  p uuid;
  r "audit_events";
  n bigint;
  prev text;
BEGIN
  FOR p IN SELECT DISTINCT "practice_id" FROM "audit_events" LOOP
    n := 0;
    prev := NULL;
    FOR r IN SELECT * FROM "audit_events" WHERE "practice_id" = p ORDER BY "at", "id" LOOP
      n := n + 1;
      r."chain_seq" := n;
      r."prev_hash" := prev;
      r."hash" := audit_event_hash(prev, r);
      UPDATE "audit_events" SET "chain_seq" = r."chain_seq", "prev_hash" = r."prev_hash", "hash" = r."hash" WHERE "id" = r."id";
      prev := r."hash";
    END LOOP;
  END LOOP;
END $$;--> statement-breakpoint

-- 4. Every new row is chained by the database itself. App-supplied values for
--    chain_seq / prev_hash / hash are ignored. The advisory lock serializes
--    inserts per practice so two concurrent events never share a predecessor.
CREATE OR REPLACE FUNCTION audit_events_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  last_seq bigint;
  last_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('audit_chain:' || NEW."practice_id"::text, 0));
  SELECT "chain_seq", "hash" INTO last_seq, last_hash
  FROM "audit_events"
  WHERE "practice_id" = NEW."practice_id"
  ORDER BY "chain_seq" DESC
  LIMIT 1;
  NEW."chain_seq" := COALESCE(last_seq, 0) + 1;
  NEW."prev_hash" := last_hash;
  NEW."hash" := audit_event_hash(last_hash, NEW);
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER audit_events_chain_trg
BEFORE INSERT ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION audit_events_chain();--> statement-breakpoint

-- 5. Evidence tables are append-only. Only a superuser session that sets
--    session_replication_role = replica (the demo seed, a supervised purge)
--    can bypass this; the application's own role cannot.
CREATE OR REPLACE FUNCTION reject_evidence_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION reject_evidence_change();--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate
BEFORE TRUNCATE ON "audit_events"
FOR EACH STATEMENT EXECUTE FUNCTION reject_evidence_change();--> statement-breakpoint
CREATE TRIGGER precheck_submissions_append_only
BEFORE UPDATE OR DELETE ON "precheck_submissions"
FOR EACH ROW EXECUTE FUNCTION reject_evidence_change();--> statement-breakpoint
CREATE TRIGGER precheck_submissions_no_truncate
BEFORE TRUNCATE ON "precheck_submissions"
FOR EACH STATEMENT EXECUTE FUNCTION reject_evidence_change();--> statement-breakpoint

-- 6. Flags may be reviewed and superseded, never deleted.
CREATE TRIGGER precheck_flags_no_delete
BEFORE DELETE ON "precheck_flags"
FOR EACH ROW EXECUTE FUNCTION reject_evidence_change();--> statement-breakpoint

-- 7. Recompute a practice's chain. Returns the first chain_seq whose hash or
--    link does not match (tampering or a gap), or NULL when the chain is intact.
CREATE OR REPLACE FUNCTION verify_audit_chain(p uuid) RETURNS bigint
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r "audit_events";
  prev text := NULL;
  expected bigint := 0;
BEGIN
  FOR r IN SELECT * FROM "audit_events" WHERE "practice_id" = p ORDER BY "chain_seq" LOOP
    expected := expected + 1;
    IF r."chain_seq" IS DISTINCT FROM expected
       OR r."prev_hash" IS DISTINCT FROM prev
       OR r."hash" IS DISTINCT FROM audit_event_hash(prev, r) THEN
      RETURN expected;
    END IF;
    prev := r."hash";
  END LOOP;
  RETURN NULL;
END $$;
