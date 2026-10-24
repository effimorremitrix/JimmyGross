# Architecture

## Stack

Next.js 16 (App Router, server actions, Turbopack) · TypeScript · Postgres 16 with Drizzle ORM · pdf-lib · Tailwind v4 · jose (sessions) · Yousign API v3. Everything renders on the server per request; nothing is cached (health data).

## Domain model

```
Practice ─┬─ User (practitioner | assistant | admin)
          ├─ Template ── TemplateVersion (immutable: sections, consent block, questions, signature level)
          │                 └─ TemplateTranslation (one per language; approved by the practitioner, then frozen)
          ├─ VisitReason (Doctolib "motif" → Template + default act + optional AES override)
          ├─ Patient ── Appointment ── ConsentRequest
          │                               ├─ ReadingEvent   (section, time on screen, full text opened at, acknowledged at)
          │                               ├─ PrecheckFlag   (question, severity, detail, reviewed by/at)
          │                               ├─ Document       (unsigned, signed, provider audit trail; sha256)
          │                               └─ OtpChallenge   (purpose: sign | access; hashed, 10 min, 5 attempts)
          ├─ ImportBatch (file hash, rows, created, skipped)
          └─ AuditEvent (append-only; actor, type, data, IP, user agent, time)
```

A request always points to the **exact template version** the patient read. Editing a template means publishing a new version; past proofs never change.

## Languages

French is the default and the reference text. Other languages (English today) are added per template version as a `TemplateTranslation`: the patient-facing strings only, keyed by the source ids, item for item (`translationProblems` refuses an incomplete one).

- **Approval.** The practitioner reads the translation side by side with the French on `/cabinet/modeles` and approves it. Until then, a patient whose request asks for that language gets French. Once approved, a translation never changes; a correction is a new template version.
- **Who chooses.** The practice sets the language on the new request form or on the request detail (until consent); it is remembered on the patient (`preferred_locale`), so the agenda import reuses it. The patient can switch on their link until they consent; every switch is logged.
- **What follows the language.** Link SMS and e-mail, access and signing codes, every patient screen (`src/i18n/patient.ts`), Yousign's signer locale, and the consent PDF. The request keeps the language actually signed in, and the PDF carries a bilingual line naming who approved the translation, when, and that the French original is the reference. The proof file states the language too.
- **What never changes with it.** Structure and rules come from the French source (`localizeContent`): section ids, flag severities, act keywords for applicable questions (matched on the French act). Practitioner alerts, the dashboard and the proof file stay French.

## Request lifecycle

```
created → sent → opened → info_read → precheck_done → awaiting_otp ──┐
                                                    └→ awaiting_provider (AES, hosted) ─┴→ signed
any open state → cancelled | expired
```

Status only moves forward (`src/domain/status.ts`), so re-sending a link keeps the patient's progress.

## Patient link security

- 192-bit random token in the URL; only its SHA-256 is stored. A new link (reminder, copy) invalidates the previous one.
- Links expire after `LINK_TTL_DAYS` (default 10).
- Birth-date gate before any health content; 5 wrong attempts lock the link until the practice issues a new one.
- After the gate, an HttpOnly JWT cookie scoped to that single request (2 h).
- SMS text contains only the practitioner name, the date and the link.

## Signature providers

`SignatureProvider` (`src/lib/signature/types.ts`):

| | SES (default) | AES |
|---|---|---|
| Who collects the OTP | Our screens (Yousign "build your own signing flow": `delivery_mode: none`, `send_otp`, `sign` with the drawn signature image) | Yousign hosted page (ID document check + SMS OTP), patient redirected back to `/p/[token]/retour` |
| Finalisation | Right after `sign`, or by webhook | Webhook `signature_request.done`, or on return |
| Mock | Same flow, 6-digit code (shown on screen in `DEMO_MODE`), sealed with a "simulated" certificate page | Simulated ID step in our UI, then same as SES |

Finalisation (`finalizeSigned`) is idempotent: it downloads the signed PDF and audit trail, stores both with their hashes, marks the request signed, logs the event.

## Evidence ("dossier de preuve")

Built on demand from the database: template + version, per-section reading time and acknowledgement time, flags and who reviewed them, the full timestamped event log with IPs, and the SHA-256 of the signed PDF. Under French law the practitioner must prove the patient was informed; this file is that proof, alongside the provider's own audit trail.

## Code map

```
src/domain/          pure business rules (no I/O), unit-tested; i18n.ts = languages, translation overlay and checks
src/i18n/            patient-facing strings per language (screens, errors, SMS, e-mail, consent PDF)
src/db/              Drizzle schema + client
src/lib/             config, auth, audit, crypto, dates, pdf, sms, signature providers
src/server/          data access used by pages and actions (consent lifecycle, patient loading, dashboard queries)
src/app/p/[token]/   patient flow (server page + client steps + server actions)
src/app/cabinet/     practice dashboard
src/app/api/         document downloads, Yousign webhook
scripts/             migrate, seed
tests/               unit (vitest) and end-to-end (Playwright + axe)
```

## Agenda import (v1 Doctolib bridge)

1. The assistant exports the week's agenda (CSV) and drops it on `/cabinet/import`.
2. `src/domain/agenda.ts` detects columns by French/English synonyms (date, heure, nom, prénom or patient, date de naissance, téléphone, e-mail, motif), parses French dates, times and phones, and reports bad rows instead of failing. UTF-8 or Windows-1252.
3. `src/server/agenda-import.ts` classifies each row: ready, motif without consent (ignored), past, duplicate (same patient and time already open), or to fix (no reachable contact, landline only, unreadable data). Unknown motifs can be mapped to a template in one click.
4. Commit re-reads the same file on the server (the preview is never trusted), creates patients/appointments/requests, and sets `scheduled_send_at` = appointment minus `practices.send_lead_hours` (72 h), never in the past.
5. `POST /api/cron/send-due` (bearer secret) sends what is due: new token, SMS and/or e-mail, status `sent`. Requests already opened from a copied link are skipped.

Patients imported without a birth date pass the identity gate with a one-time code sent to their phone, or e-mail if they have no mobile.

## Doctolib integration path

- **v1 (now):** weekly agenda import above, plus manual requests and links pasted into the Doctolib message.
- **v2:** Doctolib Partner API (calendars, visit reasons, patients, appointments) once approved. A poller or webhook creates requests automatically `send_lead_hours` before each appointment whose motif maps to a template. `appointments.source` and `external_id` are ready for it.
- Writing the signed PDF back into the Doctolib patient file is not supported by the Partner API today.
