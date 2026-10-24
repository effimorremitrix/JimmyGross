-- Production, step 1. Run ONCE as the instance administrator (the admin user of
-- the managed Postgres console), connected to the application database.
-- Passwords are psql variables, never stored in this file:
--
--   psql "postgres://<admin>@<host>:5432/<db>?sslmode=require" \
--     -v db=<db> -v owner_password="$ECLAIRA_OWNER_PASSWORD" -v app_password="$ECLAIRA_APP_PASSWORD" \
--     -f ops/postgres/01-create-roles.sql
--
-- Idempotent: an existing role only gets its attributes and password reset.
\set ON_ERROR_STOP on

SELECT 'CREATE ROLE eclaira_owner' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eclaira_owner')\gexec
SELECT 'CREATE ROLE eclaira_app' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eclaira_app')\gexec
ALTER ROLE eclaira_owner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'owner_password';
ALTER ROLE eclaira_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';

-- The owner owns the database, so migrations can create the schema and the
-- drizzle bookkeeping schema. If this fails with "must be able to SET ROLE",
-- run GRANT eclaira_owner TO CURRENT_USER; first (PostgreSQL 16 managed admins).
ALTER DATABASE :"db" OWNER TO eclaira_owner;

-- Nobody else gets implicit access, and the app gets no temporary tables.
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO eclaira_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Deliberately NOT granted in production: SET ON PARAMETER session_replication_role.
-- No role may skip the evidence triggers there, and the demo seed never runs there.
