# Pilot plan with Dr Gross

Goal: one month of real infiltrations signed before arrival, measured.

## Phase 1: workflow pilot, demo data (now)

- Demo on the seeded practice: Dr Gross and his assistant click through the patient flow on their own phones and the dashboard.
- Collect: template corrections, Pre-Check flag levels (which answers should block, which only inform), SMS wording, send timing (72 h?).
- Decide: SES or AES per act, with the RCP insurer.

## Phase 2: compliance gate

HDS hosting, Yousign production, DPA, DPIA, privacy notice. See [COMPLIANCE.md](COMPLIANCE.md).

## Phase 3: live pilot, manual trigger

- The assistant creates a request when booking an infiltration, or pastes the link into the Doctolib message.
- Measure weekly: % signed before arrival, alerts caught before the act, acts postponed in advance vs on the day, assistant time saved.

## Phase 4: Doctolib Partner API

Apply with the pilot numbers. Automatic trigger from Doctolib motifs, no manual step.

## Questions for Dr Gross

1. Which other acts need a written consent (other templates to add)?
2. Should a "block" flag (fever, pregnancy) trigger an automatic call-back task for the assistant?
3. Who confirms the act on the day: always him, or the assistant on his instruction?
4. Does he want the signed PDF e-mailed to the patient automatically?
5. Price test: what would he pay per month to never chase a signature again?
