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

## Security (in place)

Hashed link tokens with expiry and rotation, birth-date gate with lockout, request-scoped patient session, bcrypt staff passwords, HttpOnly cookies, no-index everywhere, strict security headers, append-only audit log, SHA-256 of every stored PDF, practice-scoped queries on every staff action.

## Still to do before production

- [ ] Staff MFA (or SSO), password reset flow, account management screen.
- [ ] Rate limiting at the edge (login, identity gate, OTP).
- [ ] Encrypt the `documents.bytes` column or move PDFs to HDS object storage with server-side encryption.
- [ ] Monitoring and alerting; backup restore test.
- [ ] Penetration test.
