-- Database roles. Run as eclaira_owner (DATABASE_OWNER_URL); see docs/COMPLIANCE.md.
--
-- eclaira_owner  owns the schema, runs migrations and the demo seed.
-- eclaira_app    the runtime role (DATABASE_URL). It can read and write the app
--                tables, but can only append to the evidence tables and can never
--                truncate, alter a table, disable a trigger or skip triggers
--                (session_replication_role needs a privilege it does not have).
--
-- Idempotent: safe to re-run by hand. No password is set here; set it with
--   ALTER ROLE eclaira_app WITH PASSWORD '...';

-- 1. The runtime role, created only if missing. Without a password it cannot log in yet.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eclaira_app') THEN
    BEGIN
      CREATE ROLE eclaira_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Role eclaira_app is missing and % may not create it. As an administrator, run: CREATE ROLE eclaira_app LOGIN PASSWORD ''<secret>''; then re-run the migrations (docs/COMPLIANCE.md).', current_user;
    END;
  END IF;
END $$;--> statement-breakpoint

-- 2. Refuse a runtime role that could bypass the evidence triggers.
DO $$
DECLARE
  app pg_roles;
BEGIN
  SELECT * INTO app FROM pg_roles WHERE rolname = 'eclaira_app';
  IF app.rolsuper OR app.rolbypassrls OR app.rolreplication THEN
    RAISE EXCEPTION 'eclaira_app must be NOSUPERUSER NOBYPASSRLS NOREPLICATION: it could bypass the append-only triggers';
  END IF;
  -- A member of the owner role could ALTER TABLE ... DISABLE TRIGGER.
  IF pg_has_role('eclaira_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION 'Run migrations as the owner role (DATABASE_OWNER_URL), not as eclaira_app or a role it belongs to (current_user = %)', current_user;
  END IF;
END $$;--> statement-breakpoint

-- 3. Schema: the app may use it, never create in it.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO eclaira_app;--> statement-breakpoint

-- 4. Tables. Start from nothing, so re-running also removes anything granted by hand.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM eclaira_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eclaira_app;--> statement-breakpoint
-- Evidence: append and read only. The triggers of 0003 reject the rest for
-- every role; these grants make the app fail earlier, on permissions.
REVOKE UPDATE, DELETE ON "audit_events", "precheck_submissions" FROM eclaira_app;--> statement-breakpoint
-- Flags are reviewed and superseded (UPDATE) but never deleted, as in 0003.
REVOKE DELETE ON "precheck_flags" FROM eclaira_app;--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM eclaira_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO eclaira_app;--> statement-breakpoint

-- 5. Functions. Only what the app calls: verify_audit_chain, and the hash it uses.
--    Trigger functions run without an EXECUTE check, so they stay closed.
REVOKE ALL ON FUNCTION audit_event_hash(text, "audit_events"), audit_events_chain(), reject_evidence_change(), verify_audit_chain(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION audit_event_hash(text, "audit_events"), verify_audit_chain(uuid) TO eclaira_app;--> statement-breakpoint

-- 6. Pin the search path of the chain functions. They name "audit_events"
--    without a schema, and a session's own temporary tables are searched first
--    by default: an app session could otherwise create a temp "audit_events"
--    to choose the predecessor of its next row, or make verify_audit_chain
--    report a forged chain as intact. pg_temp listed last is searched last.
ALTER FUNCTION audit_event_hash(text, "audit_events") SET search_path = public, pg_temp;--> statement-breakpoint
ALTER FUNCTION audit_events_chain() SET search_path = public, pg_temp;--> statement-breakpoint
ALTER FUNCTION reject_evidence_change() SET search_path = public, pg_temp;--> statement-breakpoint
ALTER FUNCTION verify_audit_chain(uuid) SET search_path = public, pg_temp;--> statement-breakpoint

-- 7. Future tables and sequences created by this owner get the same app grants.
--    A future evidence table must REVOKE UPDATE, DELETE in its own migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO eclaira_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO eclaira_app;
