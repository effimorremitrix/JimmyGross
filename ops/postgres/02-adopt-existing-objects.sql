-- Only for a database migrated BEFORE migration 0004 under another role (for
-- example a local volume created with the "consentza" superuser). Run as that
-- role or a superuser, after 01-create-roles.sql, then run npm run db:migrate
-- with DATABASE_OWNER_URL. A fresh database does not need this.
\set ON_ERROR_STOP on

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO eclaira_owner', r.tablename);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO eclaira_owner', r.f);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO eclaira_owner', r.typname);
  END LOOP;
  IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'drizzle') THEN
    ALTER SCHEMA drizzle OWNER TO eclaira_owner;
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'drizzle' LOOP
      EXECUTE format('ALTER TABLE drizzle.%I OWNER TO eclaira_owner', r.tablename);
    END LOOP;
  END IF;
END $$;
