-- Proves the evidence boundary. Run as the runtime role, with the same URL as the app:
--   psql "$DATABASE_URL" -f ops/postgres/03-verify-boundary.sql
-- Changes nothing: an operation that unexpectedly succeeds is rolled back.
-- Every line must read PASS; any FAIL means the app could alter evidence.
\set ON_ERROR_STOP on
SET client_min_messages = notice;

DO $$
DECLARE
  attempts text[] := ARRAY[
    'UPDATE audit_events SET type = type',
    'DELETE FROM audit_events',
    'TRUNCATE audit_events',
    'UPDATE precheck_submissions SET seq = seq',
    'DELETE FROM precheck_submissions',
    'TRUNCATE precheck_submissions',
    'DELETE FROM precheck_flags',
    'SET LOCAL session_replication_role = replica',
    'ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only',
    'CREATE TEMP TABLE boundary_probe (id int)',
    'CREATE TABLE public.boundary_probe (id int)'
  ];
  a text;
  p record;
  broken bigint;
BEGIN
  IF current_setting('is_superuser') = 'on' THEN
    RAISE WARNING 'FAIL  % is a superuser', current_user;
  ELSE
    RAISE NOTICE 'PASS  % is not a superuser', current_user;
  END IF;
  FOREACH a IN ARRAY attempts LOOP
    BEGIN
      EXECUTE a;
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'allowed';
    EXCEPTION
      WHEN raise_exception THEN RAISE WARNING 'FAIL  allowed: %', a;
      WHEN OTHERS THEN RAISE NOTICE 'PASS  rejected: %  (%)', a, SQLERRM;
    END;
  END LOOP;
  FOR p IN SELECT id, name FROM practices LOOP
    broken := verify_audit_chain(p.id);
    IF broken IS NULL THEN
      RAISE NOTICE 'PASS  verify_audit_chain(%) is null: chain intact (%)', p.id, p.name;
    ELSE
      RAISE WARNING 'FAIL  verify_audit_chain(%) = %: chain broken (%)', p.id, broken, p.name;
    END IF;
  END LOOP;
END $$;
