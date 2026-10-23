# Consentza

Remote informed consent for French clinics on Doctolib. The patient reads the information sheet, answers the pre-procedure safety questionnaire and signs on their phone before the appointment; the practice sees who signed, who is pending, and which answers need a look before the act.

First practice: **Dr Jimmy Gross** (rhumatologie interventionnelle), template *Infiltration échoguidée* (corticoïde, acide hyaluronique, PRP).

## What it does

| Module | What it is | Where |
|---|---|---|
| **Template Library** | Versioned consent forms: info sections, consent statement, Pre-Check questions with flag rules | `src/domain/templates`, `/cabinet/modeles` |
| **Trigger** | Doctolib visit reason ("motif") → template + prefilled act + signature level. v1: manual link or SMS; v2: Doctolib Partner API | `visit_reasons`, `/cabinet/nouveau` |
| **Patient flow** | Birth-date gate, info sheet with per-section reading trace, Pre-Check, consent, drawn or typed signature, SMS code | `/p/[token]` |
| **Pre-Check flags** | "Oui" answers on risky questions (anticoagulant, infection, pregnancy...) become alerts on the dashboard before the act | `src/domain/precheck.ts` |
| **Signature** | eIDAS provider behind one interface: `mock` (demo) or Yousign v3 (SES with our own OTP screens, AES hosted by Yousign) | `src/lib/signature` |
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

Demo login: `dr.gross@demo.consentza.fr` / `consentza-demo` (practitioner) or `secretariat@demo.consentza.fr` (assistant). The seed prints patient links with their birth dates. With `DEMO_MODE=true`, the SMS code is shown on screen.

## Tests

```bash
npm test                        # domain unit tests (Pre-Check rules, status machine, dates, crypto, PDF text)
npm run build && npm start      # then, with seeded data:
CHROME_PATH=... PATIENT_LINK=... AES_LINK=... npm run test:e2e
```

The end-to-end test drives both patient flows (SES and AES), the dashboard, PDF downloads, act confirmation, request creation, link lockout, and runs an axe WCAG 2.2 AA scan on every screen (fails on critical or serious issues). Last run: 42/42 checks passed.

## Going live (not done yet)

1. HDS-certified hosting for app + Postgres; set `APP_URL` to https.
2. Yousign production contract and DPA; set `SIGNATURE_PROVIDER=yousign`, `YOUSIGN_API_KEY`, `YOUSIGN_WEBHOOK_SECRET`, subscribe the webhook to `signature_request.done` at `/api/webhooks/yousign`.
3. SMS: `SMS_PROVIDER=twilio` (or swap in a French provider); messages never contain health data.
4. `DEMO_MODE=false`. Re-seed nothing: create the practice and accounts by hand.
5. DPIA, DPA with the practice, privacy notice. See [docs/COMPLIANCE.md](docs/COMPLIANCE.md).

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/COMPLIANCE.md](docs/COMPLIANCE.md) · [docs/PILOT.md](docs/PILOT.md)
