#!/bin/sh
# Local development only. Runs once, when the Postgres volume is first created.
# Creates the two roles of docs/COMPLIANCE.md:
#   eclaira_owner  owns the database and schema, runs migrations and the demo seed
#   eclaira_app    the runtime role; migration 0003 gives it its table grants
# Passwords come from ECLAIRA_OWNER_PASSWORD / ECLAIRA_APP_PASSWORD (docker-compose.yml).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" \
  -v owner_pw="$ECLAIRA_OWNER_PASSWORD" \
  -v app_pw="$ECLAIRA_APP_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE eclaira_owner' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eclaira_owner')\gexec
SELECT 'CREATE ROLE eclaira_app' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eclaira_app')\gexec
ALTER ROLE eclaira_owner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'owner_pw';
ALTER ROLE eclaira_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'app_pw';

-- The owner owns the database, so it can create the schema objects and the drizzle schema.
ALTER DATABASE :"db" OWNER TO eclaira_owner;
-- No temporary tables and no implicit access for other roles.
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO eclaira_app;

-- Demo seed only: lets the owner skip the append-only triggers to wipe demo data.
-- Never grant this to eclaira_app.
GRANT SET ON PARAMETER session_replication_role TO eclaira_owner;
SQL
