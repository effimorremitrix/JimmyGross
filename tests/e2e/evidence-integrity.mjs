/**
 * Evidence integrity: a patient changes an answer the practitioner already reviewed.
 * Expects a running server with freshly seeded demo data (npm run db:seed).
 *   BASE_URL=http://localhost:3000 PATIENT_LINK=<Marie Dupont link> node tests/e2e/evidence-integrity.mjs
 * Checks that the first declaration and its review survive, that a new alert is
 * raised, and that the hash-chained journal is intact and immutable.
 */
import "dotenv/config";
import { chromium } from "playwright";
import pg from "pg";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LINK = process.env.PATIENT_LINK;
const DOB = process.env.PATIENT_DOB ?? "1978-03-14";
const LAST = process.env.PATIENT_LAST ?? "dupont";
const results = [];
const ok = (name, cond, extra = "") => {
  results.push(!!cond);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};
if (!LINK) throw new Error("PATIENT_LINK is required (the Marie Dupont link printed by the seed).");

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (text, params = []) => (await db.query(text, params)).rows;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
try {
  // 1. Patient declares an antiplatelet drug, then stops on the consent screen.
  const patient = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" })).newPage();
  await patient.goto(LINK);
  const [y, m, d] = DOB.split("-");
  await patient.getByLabel("Jour").fill(d);
  await patient.getByLabel("Mois").fill(m);
  await patient.getByLabel("Année").fill(y);
  await patient.getByRole("button", { name: "Continuer" }).click();
  await patient.getByRole("button", { name: "Commencer" }).click();
  await patient.getByRole("heading", { name: "Fiche d'information" }).waitFor();
  const acks = patient.getByRole("button", { name: "J'ai lu cette partie" });
  for (let i = (await acks.count()); i > 0; i--) {
    await acks.first().scrollIntoViewIfNeeded();
    await acks.first().click();
    await patient.waitForTimeout(150);
  }
  await patient.getByRole("button", { name: "Continuer" }).click();

  const answer = async (anticoag) => {
    await patient.getByRole("heading", { name: "Questionnaire avant le geste" }).waitFor();
    const groups = patient.locator("fieldset").filter({ has: patient.locator('input[type="radio"]') });
    for (let i = 0; i < (await groups.count()); i++) {
      const fs = groups.nth(i);
      if (anticoag && ((await fs.textContent()) ?? "").includes("anticoagulant ou antiagrégant")) {
        await fs.getByText("Oui", { exact: true }).click();
        await fs.getByLabel("Nom du traitement").fill(anticoag);
      } else {
        await fs.getByText("Non", { exact: true }).click();
      }
    }
    await patient.getByRole("button", { name: "Continuer" }).click();
    await patient.getByRole("heading", { name: "Votre consentement" }).waitFor();
  };
  await answer("Kardégic 75 mg");

  const [req] = await q(
    `SELECT r.id, r.practice_id FROM consent_requests r JOIN patients p ON p.id = r.patient_id
     WHERE p.last_name ILIKE $1 ORDER BY r.created_at DESC LIMIT 1`,
    [LAST],
  );
  ok("first submission recorded", (await q(`SELECT 1 FROM precheck_submissions WHERE request_id=$1`, [req.id])).length === 1);

  // 2. The doctor reviews the alert.
  const staff = await (await browser.newContext({ locale: "fr-FR" })).newPage();
  await staff.goto(`${BASE}/login`);
  await staff.getByLabel("E-mail").fill("dr.gross@demo.eclaira.health");
  await staff.getByLabel("Mot de passe").fill(process.env.SEED_PASSWORD ?? "eclaira-demo");
  await staff.getByRole("button", { name: "Se connecter" }).click();
  await staff.waitForURL(/\/cabinet$/);
  await staff.goto(`${BASE}/cabinet/demandes/${req.id}`);
  await staff.getByRole("button", { name: "Marquer vérifié" }).click();
  await staff.getByRole("button", { name: "Vérifié" }).waitFor();
  ok("doctor reviewed the alert", true);

  // 3. The patient goes back and withdraws the answer.
  await patient.getByRole("button", { name: "Retour" }).click();
  await answer(null);

  // 4. Evidence checks.
  const subs = await q(`SELECT seq FROM precheck_submissions WHERE request_id=$1 ORDER BY seq`, [req.id]);
  ok("both submissions kept", subs.map((s) => s.seq).join(",") === "1,2");
  const flags = await q(`SELECT message, detail, reviewed_at, superseded_at FROM precheck_flags WHERE request_id=$1`, [req.id]);
  const old = flags.find((f) => f.superseded_at && f.detail === "Kardégic 75 mg");
  ok("original declaration kept, with its review", old && old.reviewed_at);
  const fresh = flags.find((f) => !f.superseded_at && f.message.startsWith("Réponse retirée après vérification"));
  ok("new alert raised for the withdrawn answer", fresh && !fresh.reviewed_at, fresh?.detail);
  const types = (await q(`SELECT type FROM audit_events WHERE request_id=$1`, [req.id])).map((e) => e.type);
  ok("withdrawal logged in the journal", types.includes("flag.withdrawn_after_review"));
  const [{ broken }] = await q(`SELECT verify_audit_chain($1) AS broken`, [req.practice_id]);
  ok("hash chain intact", broken === null);
  const blocked = await db.query(`UPDATE audit_events SET type='x' WHERE request_id=$1`, [req.id]).then(() => false, () => true);
  ok("journal rejects updates", blocked);

  await staff.reload();
  ok("detail page shows replaced alerts", (await staff.getByRole("heading", { name: "Alertes remplacées" }).count()) === 1);
  ok("detail page shows journal integrity", (await staff.getByText("Journal intègre").count()) === 1);
  const pdf = await staff.request.get(`${BASE}/api/requests/${req.id}/documents/evidence`);
  ok("evidence PDF builds", pdf.status() === 200 && (await pdf.body()).subarray(0, 4).toString() === "%PDF");
} finally {
  await browser.close();
  await db.end();
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
