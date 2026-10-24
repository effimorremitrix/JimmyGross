# Consentza

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
| **Consent Vault** | Unsigned + signed PDFs with SHA-256, provider audit trail, append-only event log, "dossier de preuve" PDF | `documents`, `audit_events` |
| **Dashboard** | Day view, KPIs, alerts, reminders, new links, detail with evidence, doctor's act confirmation | `/cabinet` |

## Run it locally

```bash
cp .env.example .env            # set SESSION_SECRET: openssl rand -base64 48
docker compose up -d db         # or any local Postgres 16
npm install --legacy-peer-deps
npm run db:migrate
npm run db:seed                 # prints demo logins and patient links
npm run dev                     # http://localhost:3000
```

Demo login: `dr.gross@demo.consentza.fr` / `consentza-demo` (practitioner) or `secretariat@demo.consentza.fr` (assistant). The seed prints patient links with their birth dates and writes `samples/agenda-semaine-demo.csv` (next week) to try the import. With `DEMO_MODE=true`, the SMS code is shown on screen.

## Tests

```bash
npm test                        # domain unit tests (Pre-Check rules, status machine, dates, crypto, PDF text)
npm run build && npm start      # then, with seeded data:
CHROME_PATH=... PATIENT_LINK=... AES_LINK=... npm run test:e2e
```

The end-to-end test drives both patient flows (SES and AES), the dashboard, PDF downloads, act confirmation, request creation, link lockout, and runs an axe WCAG 2.2 AA scan on every screen (fails on critical or serious issues). It also covers summaries and full text, summary approval, the agenda import (preview, motif mapping, duplicates, landlines, scheduling), the scheduler endpoint, and access by code. Last run: 66/66 checks passed; 37 unit tests.

## Going live (not done yet)

1. HDS-certified hosting for app + Postgres; set `APP_URL` to https.
2. Yousign production contract and DPA; set `SIGNATURE_PROVIDER=yousign`, `YOUSIGN_API_KEY`, `YOUSIGN_WEBHOOK_SECRET`, subscribe the webhook to `signature_request.done` at `/api/webhooks/yousign`.
3. SMS: `SMS_PROVIDER=twilio` (or swap in a French provider); e-mail: `EMAIL_PROVIDER=smtp` with `SMTP_URL`. Messages never contain health data.
4. Scheduler: call `POST /api/cron/send-due` every 5 to 15 minutes with `Authorization: Bearer $CRON_SECRET`.
5. `DEMO_MODE=false`. Re-seed nothing: create the practice and accounts by hand.
6. DPIA, DPA with the practice, privacy notice. See [docs/COMPLIANCE.md](docs/COMPLIANCE.md).

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/COMPLIANCE.md](docs/COMPLIANCE.md) · [docs/PILOT.md](docs/PILOT.md)
