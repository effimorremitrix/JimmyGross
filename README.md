# Éclaira

Remote informed consent for French clinics on Doctolib. The patient reads the information sheet, answers the pre-procedure safety questionnaire and signs on their phone before the appointment; the practice sees who signed, who is pending, and which answers need a look before the act.

First practice: **Dr Jimmy Gross** (rhumatologie interventionnelle), template *Infiltration échoguidée* (corticoïde, acide hyaluronique, PRP).

## What it does

| Module | What it is | Where |
|---|---|---|
| **Template Library** | Versioned consent forms: info sections, consent statement, Pre-Check questions with flag rules | `src/domain/templates`, `/cabinet/modeles` |
| **Agenda import** | Weekly agenda export (CSV) → columns auto-detected → every appointment whose motif needs consent gets a request; links go out automatically N hours before (SMS if mobile, else e-mail), via the scheduler | `/cabinet/import`, `src/domain/agenda.ts`, `/api/cron/send-due` |
| **Trigger** | Doctolib visit reason ("motif") → template + prefilled act + signature level. Unknown motifs can be mapped from the import screen | `visit_reasons`, `/cabinet/nouveau` |
| **Patient flow** | Identity check (birth date, or a code by SMS/e-mail when unknown), short summary per section with the doctor's full text one tap away (and a full PDF), Pre-Check with "which one?" details, consent, drawn or typed signature, one-time code | `/p/[token]` |
| **Pre-Check flags** | "Oui" answers on risky questions (anticoagulant, infection, pregnancy...) become alerts on the dashboard before the act | `src/domain/precheck.ts` |
| **Signature** | eIDAS provider behind one interface: `mock` (demo) or Yousign v3 (SES with our own OTP screens, AES hosted by Yousign) | `src/lib/signature` |
| **Summary approval** | Patients see summaries only after the practitioner approves them on the Modèles page; until then the full text is shown | `/cabinet/modeles` |
| **Languages** | French by default. A template version can carry translations (English today); the practitioner reads each one side by side with the French and approves it before any patient sees it. The practice picks the patient's language per request (remembered for the next one), and the patient can switch until they consent. SMS, e-mail, screens, codes and the signed PDF follow; the PDF states who approved the translation and that the French original is the reference. Alerts and the practice screens stay French | `src/domain/i18n.ts`, `src/i18n/patient.ts`, `template_translations` |
| **Consent Vault** | Unsigned + signed PDFs with SHA-256, provider audit trail, append-only event log, "dossier de preuve" PDF | `documents`, `audit_events` |
| **Dashboard** | Day view, KPIs, alerts, reminders, new links, detail with evidence, doctor's act confirmation | `/cabinet` |
| **User guide** | A collapsible guide under the header of every cabinet page: what the page is for, numbered steps, what to prepare first (the CSV export), plus a guide to the patient's journey for answering calls. French and English, switched with FR / EN and remembered on the device; buttons keep their on-screen French names. Open on a page's first visit, then as the person last left it. `tests/unit/guide.test.ts` fails if a line loses its translation, a link points elsewhere, or the guide names a button the app no longer has | `src/guide`, `src/app/cabinet/page-guide.tsx` |
| **Help assistant** | **Aide** in the menu opens a chat that answers "how do I…" from the same guide, for every staff role. Claude reads a one-line index of the guides and opens the one it needs with `read_guide`; each question carries the page the person is on. It answers only from the guide (otherwise it gives contact@eclaira.health), tells non-doctors which steps are the doctor's, gives no medical advice and never asks for patient details. It can't see patients or requests and can't act. Nothing is stored: the browser sends the conversation with each question, and the server logs no content. On when `ANTHROPIC_API_KEY` is set (model `ASSISTANT_MODEL`, default `claude-opus-5-5` at low effort; `ASSISTANT_HOURLY_LIMIT` questions per person per hour, default 30); without it the menu item is hidden and the guide still shows | `src/guide/assistant.ts`, `/api/assistant`, `src/app/cabinet/assistant-drawer.tsx` |

## Run it locally

```bash
cp .env.example .env            # set SESSION_SECRET: openssl rand -base64 48
docker compose up -d db         # or any local Postgres 16, see below
npm ci
npm run db:migrate              # as eclaira_owner (DATABASE_OWNER_URL)
npm run db:seed                 # as eclaira_owner; prints demo logins and patient links
npm run dev                     # as eclaira_app (DATABASE_URL), http://localhost:3000
```

The app connects as `eclaira_app`, which can only append to the evidence log; migrations and the seed use `eclaira_owner` (see [docs/COMPLIANCE.md](docs/COMPLIANCE.md#database-roles-evidence-integrity)). A new Docker volume gets both roles from `docker/postgres-init/`, with development passwords you can override with `ECLAIRA_OWNER_PASSWORD` / `ECLAIRA_APP_PASSWORD`.

- **Existing Docker volume** (created before the roles): the init script does not run again. Either recreate it (`docker compose down -v`, which deletes local data), or keep it: run `ops/postgres/01-create-roles.sql`, `ops/postgres/02-adopt-existing-objects.sql` and `GRANT SET ON PARAMETER session_replication_role TO eclaira_owner;` as the `consentza` superuser, then `npm run db:migrate`. Until then, an old `.env` with the `consentza` superuser in `DATABASE_URL` keeps working in development; production refuses it.
- **Own Postgres 16:** create the roles with `ops/postgres/01-create-roles.sql`, and for the demo seed also run `GRANT SET ON PARAMETER session_replication_role TO eclaira_owner;` as a superuser (local only).
- Check the boundary any time: `psql "$DATABASE_URL" -f ops/postgres/03-verify-boundary.sql`.

Demo login: `dr.gross@demo.eclaira.health` / `eclaira-demo` (practitioner) or `secretariat@demo.eclaira.health` (assistant). The seed prints patient links with their birth dates and writes `samples/agenda-semaine-demo.csv` (next week) to try the import. With `DEMO_MODE=true`, the SMS code is shown on screen.

## Tests

```bash
npm test                        # domain unit tests (Pre-Check rules, status machine, dates, crypto, PDF text)
npm run build && npm start      # then, with seeded data:
CHROME_PATH=... PATIENT_LINK=... AES_LINK=... EN_LINK=... npm run test:e2e
```

The end-to-end test drives both patient flows (SES and AES), the dashboard, PDF downloads, act confirmation, request creation, link lockout, and runs an axe WCAG 2.2 AA scan on every screen (fails on critical or serious issues). It also covers summaries and full text, summary approval, the agenda import (preview, motif mapping, duplicates, landlines, scheduling), the scheduler endpoint, access by code, approval of the English translation, and the full flow in English (`EN_LINK`, the seeded patient Emma Wilson) with language switching. Last run: 89/89 checks passed; 68 unit tests.

## Going live (not done yet)

1. HDS-certified hosting for app + Postgres; set `APP_URL` to https.
2. Yousign production contract and DPA; set `SIGNATURE_PROVIDER=yousign`, `YOUSIGN_API_KEY`, `YOUSIGN_WEBHOOK_SECRET`, subscribe the webhook to `signature_request.done` at `/api/webhooks/yousign`.
3. SMS: `SMS_PROVIDER=twilio` (or swap in a French provider); e-mail: `EMAIL_PROVIDER=smtp` with `SMTP_URL`. Messages never contain health data.
4. Scheduler: call `POST /api/cron/send-due` every 5 to 15 minutes with `Authorization: Bearer $CRON_SECRET`.
5. `DEMO_MODE=false`. Re-seed nothing: create the practice and accounts by hand.
6. DPIA, DPA with the practice, privacy notice. See [docs/COMPLIANCE.md](docs/COMPLIANCE.md).

## Renamed from Consentza

The product was called Consentza. User-facing text now says Éclaira; a few internal identifiers keep the old name on purpose so existing environments keep working:

- Session cookies stay `cz_staff` and `cz_patient` (renaming them would sign everyone out and invalidate open patient sessions).
- The local Docker bootstrap user and database stay `consentza`, so existing volumes and `.env` files still connect.
- Demo accounts moved to `@demo.eclaira.health` with the default password `eclaira-demo`. A database seeded before the rename keeps its old demo logins (`@demo.consentza.fr`, or `@demo.eclaira.fr` from the first rename) until you run `npm run db:seed` again, which replaces them. A `SEED_PASSWORD` already set in `.env` still applies to both the seed and the e2e tests.
- `EMAIL_FROM` defaults to `Éclaira <no-reply@eclaira.health>`; an `EMAIL_FROM` already set in `.env` wins. Sending from `eclaira.health` needs the domain authenticated in Brevo (SPF, DKIM, DMARC records in Cloudflare DNS) first. Note: `eclaira.fr` belongs to an unrelated business; never send from it.

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/COMPLIANCE.md](docs/COMPLIANCE.md) · [docs/PILOT.md](docs/PILOT.md)
