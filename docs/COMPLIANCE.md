# Compliance checklist (France)

Not legal advice. Items to close with a lawyer, the DPO and Dr Gross's professional liability insurer (RCP) before real patients.

## Health data hosting (HDS)

- [ ] App and Postgres on an HDS-certified host (e.g. Scaleway or OVHcloud HDS offers). Backups on the same certified perimeter.
- [ ] Check whether Consentza's own operating role (application administration, run) also needs its own HDS certification, or is covered by the host's scope.
- [ ] Signature provider (Yousign) DPA covering health data; send it only the document and signer identity.
- [ ] SMS and e-mail providers receive no health data (message = practitioner, date, link). Prefer EU providers. The practitioner's name can hint at a specialty: confirm this is acceptable.
- [ ] Agenda exports contain patient data: they are processed in memory and only the file hash is kept; staff should delete the exported file from their computer after import.
- [ ] Fonts and assets self-hosted (done: no Google Fonts calls from patient browsers).

## GDPR

- [ ] Roles: the practice is controller, Consentza is processor (Art. 28 DPA with each practice).
- [ ] DPIA (AIPD): health data at scale, new technology. Template: CNIL PIA tool.
- [ ] Privacy notice shown to patients (link on the identity screen).
- [ ] Retention policy for consent records, aligned with the medical record retention rules; deletion job.
- [ ] Register of processing; DPO contact.
- [ ] Access logging: every document download is already logged (`document.downloaded`).

## Electronic signature (eIDAS)

- SES = drawn signature + SMS code. Fast, legally valid; identity is not verified, so the reading trace matters.
- AES = adds an ID document check (hosted by Yousign). Stronger in a dispute, more patient friction.
- Per motif: `visit_reasons.signature_level_override`. Current setup: SES for infiltrations, AES for spinal acts.
- [ ] Confirm the level per act with the RCP insurer.

## Information duty

- [ ] Dr Gross validates the transcribed template text (one correction made: "entre 6 et 12 semaines" in section 4).
- [ ] Dr Gross reviews and approves the patient summaries on the Modèles page. Patients see summaries only after approval; the full original text stays one tap away, is in the signed PDF, and the consent statement says the patient had access to it. The evidence file records, per section, whether the full text was opened.
- [ ] Decide whether "lu et approuvé" is needed (replaced by an explicit checkbox; usually no specific legal weight).
- [ ] Two-step model: the patient consents to the planned act; the doctor confirms the act performed on the day. If it differs, the app flags it and a new consent is advised.
- [ ] The paper form shows the doctor's signature as an image. In Consentza the doctor confirms as an authenticated user, logged in the evidence file.

## Database roles (evidence integrity)

The evidence tables (`audit_events`, `precheck_submissions`) are append-only, and `audit_events` is hash-chained per practice (migration 0002). The triggers apply to every role, but a superuser can skip them (`session_replication_role = replica`) and a table owner can disable them. So the app never connects as either:

| Role | Used by | Can |
|---|---|---|
| `eclaira_owner` | `npm run db:migrate`, `npm run db:seed` (`DATABASE_OWNER_URL`) | Own the schema. In local Docker only, also skip triggers to wipe the demo practice |
| `eclaira_app` | the running app (`DATABASE_URL`) | SELECT/INSERT/UPDATE/DELETE on app tables; only SELECT/INSERT on `audit_events` and `precheck_submissions`; no DELETE on `precheck_flags`; no TRUNCATE, DDL, temporary tables or trigger bypass; EXECUTE on `verify_audit_chain` |

Migration 0003 sets the app grants (idempotent, also for future tables via default privileges) and pins the `search_path` of the chain functions, so a session's temporary table can never stand in for `audit_events`. In production the app refuses to start when `DATABASE_URL` is a superuser or the owner of the evidence tables (`src/db/index.ts`, called from `src/instrumentation.ts`).

### Production setup on an HDS-certified managed Postgres (Scaleway, OVHcloud)

Run these by hand; nothing in the repository connects to production. The SQL files are in `ops/postgres/`.

1. **Instance.** PostgreSQL 16 managed database from an offer inside the provider's HDS certification scope (check the contract and the certificate's scope, not only the region). France region, private network only, TLS required, automated backups and point-in-time recovery in the same certified perimeter. Store the two passwords below in the provider's secret manager.
2. **Roles.** As the console admin user (on these offers it is usually not a real superuser, which is fine), connected to the app database:
   ```bash
   psql "postgres://<admin>@<host>:5432/<db>?sslmode=require" \
     -v db=<db> -v owner_password="$ECLAIRA_OWNER_PASSWORD" -v app_password="$ECLAIRA_APP_PASSWORD" \
     -f ops/postgres/01-create-roles.sql
   ```
   If the console has to create users itself, create `eclaira_owner` and `eclaira_app` there with no extra rights, then run the file anyway: it skips existing roles and applies the attributes and grants. Never grant `SET ON PARAMETER session_replication_role` in production.
3. **Existing database only.** If the schema was already migrated under another role, run `ops/postgres/02-adopt-existing-objects.sql` as that role to hand everything to `eclaira_owner`. A new database skips this.
4. **Migrations** from a checkout of the release (the app image ships no migration tooling):
   ```bash
   DATABASE_OWNER_URL="postgres://eclaira_owner:<secret>@<host>:5432/<db>?sslmode=require" npm run db:migrate
   ```
5. **Prove the boundary** with the app's own URL. Every line must read PASS:
   ```bash
   psql "postgres://eclaira_app:<secret>@<host>:5432/<db>?sslmode=require" -f ops/postgres/03-verify-boundary.sql
   ```
6. **App.** `DATABASE_URL` = the `eclaira_app` URL with `sslmode=require` (`verify-full` with the provider's CA when available). Do not give the app container `DATABASE_OWNER_URL`. Never run `npm run db:seed` in production.
7. **Rotation.** `ALTER ROLE eclaira_app WITH PASSWORD '...'` as the admin, update the secret, restart the app.

- [ ] Retention purges of evidence rows (end of the retention period) need a supervised procedure run by the owner, and will show as a gap in `verify_audit_chain`; design it with the DPO before the first purge is due.

## Security (in place)

Hashed link tokens with expiry and rotation, birth-date gate with lockout, request-scoped patient session, bcrypt staff passwords, HttpOnly cookies, no-index everywhere, strict security headers, append-only audit log, SHA-256 of every stored PDF, practice-scoped queries on every staff action.

## Still to do before production

- [ ] Staff MFA (or SSO), password reset flow, account management screen.
- [ ] Rate limiting at the edge (login, identity gate, OTP).
- [ ] Encrypt the `documents.bytes` column or move PDFs to HDS object storage with server-side encryption.
- [ ] Monitoring and alerting; backup restore test.
- [ ] Penetration test.
