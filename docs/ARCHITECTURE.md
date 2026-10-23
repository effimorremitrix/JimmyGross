# Architecture

## Stack

Next.js 16 (App Router, server actions, Turbopack) · TypeScript · Postgres 16 with Drizzle ORM · pdf-lib · Tailwind v4 · jose (sessions) · Yousign API v3. Everything renders on the server per request; nothing is cached (health data).

## Domain model

```
Practice ─┬─ User (practitioner | assistant | admin)
          ├─ Template ── TemplateVersion (immutable: sections, consent block, questions, signature level)
          ├─ VisitReason (Doctolib "motif" → Template + default act + optional AES override)
          ├─ Patient ── Appointment ── ConsentRequest
          │                               ├─ ReadingEvent   (section, time on screen, acknowledged at)
          │                               ├─ PrecheckFlag   (question, severity, detail, reviewed by/at)
          │                               ├─ Document       (unsigned, signed, provider audit trail; sha256)
          │                               └─ OtpChallenge   (mock provider only, hashed)
          └─ AuditEvent (append-only; actor, type, data, IP, user agent, time)
```

A request always points to the **exact template version** the patient read. Editing a template means publishing a new version; past proofs never change.

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
src/domain/          pure business rules (no I/O), unit-tested
src/db/              Drizzle schema + client
src/lib/             config, auth, audit, crypto, dates, pdf, sms, signature providers
src/server/          data access used by pages and actions (consent lifecycle, patient loading, dashboard queries)
src/app/p/[token]/   patient flow (server page + client steps + server actions)
src/app/cabinet/     practice dashboard
src/app/api/         document downloads, Yousign webhook
scripts/             migrate, seed
tests/               unit (vitest) and end-to-end (Playwright + axe)
```

## Doctolib integration path

- **v1 (now):** manual. The assistant creates the request (or pastes the link into the Doctolib appointment message).
- **v2:** Doctolib Partner API (calendars, visit reasons, patients, appointments) once approved. A poller or webhook creates requests automatically `send_lead_hours` before each appointment whose motif maps to a template. `appointments.source` and `external_id` are ready for it.
- Writing the signed PDF back into the Doctolib patient file is not supported by the Partner API today.
