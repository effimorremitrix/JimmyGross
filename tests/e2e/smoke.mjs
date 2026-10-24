/**
 * End-to-end smoke test against a running server with seeded demo data.
 *   BASE_URL=http://localhost:3000 PATIENT_LINK=... AES_LINK=... node tests/e2e/smoke.mjs
 * Requires DEMO_MODE=true (the SMS code is read from the screen) and the mock provider.
 * Also runs an axe accessibility scan on every screen (fails on critical/serious).
 */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const results = [];
const a11y = [];

function ok(name, cond, extra = "") {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}

async function scan(page, label) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  a11y.push({ label, bad: bad.map((v) => `${v.id}: ${v.nodes.length} node(s) ${v.nodes[0]?.target?.join(" ")}`) });
  ok(`a11y ${label}`, bad.length === 0, bad.map((v) => v.id).join(", "));
}

async function drawSignature(page) {
  await page.locator("canvas").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(200);
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.move(box.x + 30, box.y + 100);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) await page.mouse.move(box.x + 40 + i * 20, box.y + 60 + (i % 2 ? 50 : -10), { steps: 4 });
  await page.mouse.up();
}

async function patientFlow(browser, link, dob, { aes = false, yesAnticoag = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  await page.goto(link);
  await scan(page, `patient identity (${aes ? "AES" : "SES"})`);
  const [y, m, d] = dob.split("-");
  await page.getByLabel("Jour").fill(d);
  await page.getByLabel("Mois").fill(m);
  await page.getByLabel("Année").fill(y);
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Commencer" }).waitFor();
  await scan(page, "patient welcome");
  await page.getByRole("button", { name: "Commencer" }).click();

  await page.getByRole("heading", { name: "Fiche d'information" }).waitFor();
  await scan(page, "patient info sheet");
  ok("summary shown with full text one tap away", (await page.getByText("Lire le texte complet de cette partie").count()) >= 9);
  await page.getByText("Lire le texte complet de cette partie").first().click();
  await page.getByText(/Une infiltration peut être proposée pour une douleur articulaire/).waitFor();
  ok("full original text expands", true);
  await scan(page, "patient info sheet (full text open)");
  const docHref = await page.getByRole("link", { name: /Lire le document complet/ }).getAttribute("href");
  const docRes = await page.request.get(new URL(docHref, BASE).toString());
  ok("full document PDF for patient", docRes.status() === 200 && (await docRes.body()).subarray(0, 4).toString() === "%PDF");
  const ackButtons = page.getByRole("button", { name: "J'ai lu cette partie" });
  const n = await ackButtons.count();
  for (let i = 0; i < n; i++) {
    await ackButtons.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await ackButtons.first().click();
    await page.waitForTimeout(200);
  }
  ok("all sections acknowledged", (await page.getByRole("button", { name: "Lu" }).count()) === n, `${n} sections`);
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.getByRole("heading", { name: "Questionnaire avant le geste" }).waitFor();
  const groups = page.locator("fieldset").filter({ has: page.locator('input[type="radio"]') });
  const g = await groups.count();
  for (let i = 0; i < g; i++) {
    const fs = groups.nth(i);
    const text = (await fs.textContent()) ?? "";
    if (yesAnticoag && text.includes("anticoagulant ou antiagrégant")) {
      await fs.getByText("Oui", { exact: true }).click();
      await fs.getByLabel("Nom du traitement").fill("Kardégic 75 mg");
    } else {
      await fs.getByText("Non", { exact: true }).click();
    }
  }
  await scan(page, "patient pre-check");
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.getByRole("heading", { name: "Votre consentement" }).waitFor();
  await page.getByRole("checkbox").check();
  await drawSignature(page);
  await scan(page, "patient consent");
  if (aes) {
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("heading", { name: "Vérification d'identité" }).waitFor();
    await scan(page, "patient id check (mock AES)");
    await page.locator('input[type="file"]').setInputFiles({ name: "cni.png", mimeType: "image/png", buffer: Buffer.from("fake") });
  }
  await page.getByRole("button", { name: "Recevoir mon code de signature" }).click();
  await page.getByRole("heading", { name: "Code de confirmation" }).waitFor();
  await scan(page, "patient OTP");
  const code = (await page.locator("strong.tabular-nums").textContent())?.trim();
  ok("demo OTP shown", /^\d{6}$/.test(code ?? ""), code);

  await page.getByLabel("Code de signature").fill("000000" === code ? "111111" : "000000");
  await page.getByRole("button", { name: "Valider et signer" }).click();
  await page.getByText("Code incorrect").waitFor();
  ok("wrong OTP rejected", true);

  await page.getByLabel("Code de signature").fill(code);
  await page.getByRole("button", { name: "Valider et signer" }).click();
  await page.getByRole("heading", { name: /C'est signé/ }).waitFor({ timeout: 15000 });
  ok(`patient signed (${aes ? "AES" : "SES"})`, true);
  await scan(page, "patient done");
  await ctx.close();
}

async function staffFlow(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await scan(page, "login");
  await page.getByLabel("E-mail").fill("dr.gross@demo.eclaira.fr");
  await page.getByLabel("Mot de passe").fill("wrong-password");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.getByText("E-mail ou mot de passe incorrect.").waitFor();
  ok("bad password rejected", true);
  ok("e-mail kept after failed login", (await page.getByLabel("E-mail").inputValue()) === "dr.gross@demo.eclaira.fr");
  await page.getByLabel("Mot de passe").fill(process.env.SEED_PASSWORD ?? "eclaira-demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/cabinet$/);

  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  await page.goto(`${BASE}/cabinet?jour=${tomorrow}`);
  await page.getByRole("heading", { name: "Patients du jour" }).waitFor();
  await scan(page, "dashboard");
  const rows = await page.locator("tbody tr").count();
  ok("dashboard lists tomorrow's patients", rows >= 7, `${rows} rows`);
  ok("anticoagulant alert surfaced", (await page.getByText(/Anticoagulant ou antiagrégant déclaré/).count()) >= 2);

  await page.getByRole("link", { name: "Marie Dupont" }).click();
  await page.getByRole("heading", { name: "Marie Dupont" }).waitFor();
  await scan(page, "request detail");
  ok("detail shows signed", (await page.getByText("Signé", { exact: true }).count()) >= 1);

  const id = page.url().split("/").pop();
  for (const kind of ["signed", "unsigned", "evidence"]) {
    const res = await page.request.get(`${BASE}/api/requests/${id}/documents/${kind}`);
    const body = await res.body();
    ok(`download ${kind} PDF`, res.status() === 200 && body.subarray(0, 4).toString() === "%PDF", `${body.length} bytes`);
  }

  await page.getByRole("button", { name: "Confirmer le geste" }).click();
  await page.getByText(/Confirmé le/).waitFor();
  ok("act confirmed by doctor", true);

  const anon = await browser.newContext();
  const r401 = await anon.request.get(`${BASE}/api/requests/${id}/documents/signed`);
  ok("documents require login", r401.status() === 401);
  await anon.close();

  await page.goto(`${BASE}/cabinet/nouveau`);
  await scan(page, "new request form");
  await page.getByRole("button", { name: "Créer la demande" }).click();
  await page.getByText("Merci de corriger les champs indiqués.").waitFor();
  ok("validation errors shown", (await page.getByText("Prénom requis").count()) === 1);
  await page.locator('input[name="firstName"]').fill("Lucie");
  await page.locator('input[name="lastName"]').fill("Garnier");
  await page.locator('input[name="birthDate"]').fill("1990-05-12");
  await page.locator('input[name="phone"]').fill("06 70 80 90 10");
  await page.getByLabel("Localisation prévue").fill("Épaule droite");
  await page.getByText("Je colle le lien moi-même dans Doctolib").click();
  await page.getByRole("button", { name: "Créer la demande" }).click();
  await page.getByRole("heading", { name: "Demande créée" }).waitFor();
  const link = await page.getByLabel("Lien patient").inputValue();
  ok("new request link issued", /\/p\/[A-Za-z0-9_-]{30,}$/.test(link), link);

  await page.goto(`${BASE}/cabinet/modeles`);
  await scan(page, "templates");
  ok("summaries pending approval shown", (await page.getByText("Résumés à valider par le médecin").count()) === 1);
  await page.getByRole("button", { name: "J'ai relu et je valide les résumés" }).click();
  await page.getByText(/Résumés validés le/).waitFor();
  ok("doctor approves summaries", true);

  // ---- Weekly agenda import ----
  await page.goto(`${BASE}/cabinet/import`);
  await scan(page, "import (empty)");
  await page.getByLabel("Fichier de l'agenda (CSV)").setInputFiles("samples/agenda-semaine-demo.csv");
  await page.getByRole("heading", { name: /Aperçu/ }).waitFor();
  await scan(page, "import preview");
  const btn = page.getByRole("button", { name: /Créer \d+ demande/ });
  ok("import preview: 3 ready", (await btn.textContent()).includes("Créer 3 demande"), await btn.textContent());
  ok("landline without e-mail flagged", (await page.getByText("numéro fixe sans e-mail").count()) === 1);
  ok("duplicate line detected", (await page.getByText("demande déjà existante").count()) === 1);
  ok("consultation motif skipped", (await page.getByText("« Première consultation »").count()) === 1);
  const mapper = page.locator("li").filter({ hasText: "« Infiltration genou »" });
  await mapper.getByLabel("Geste prérempli").selectOption("Infiltration de corticoïde");
  await mapper.getByRole("button", { name: "Demander un consentement pour ce motif" }).click();
  await page.getByRole("button", { name: "Créer 4 demande(s)" }).waitFor();
  ok("mapping a motif adds its rows", true);
  await page.getByRole("button", { name: "Créer 4 demande(s)" }).click();
  await page.getByRole("heading", { name: "4 demande(s) créée(s)" }).waitFor();
  ok("import created 4 scheduled requests", (await page.getByText("4 lien(s) programmé(s)").count()) === 1);

  const cronBad = await page.request.post(`${BASE}/api/cron/send-due`, { headers: { authorization: "Bearer nope" } });
  ok("scheduler rejects bad secret", cronBad.status() === 401);
  const cronOk = await page.request.post(`${BASE}/api/cron/send-due`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? "dev-cron-secret"}` } });
  ok("scheduler runs", cronOk.status() === 200, JSON.stringify(await cronOk.json()));

  // Patient imported without birth date: access by code.
  const csvDay = (await import("node:fs")).readFileSync("samples/agenda-semaine-demo.csv", "utf8").split(/\r?\n/)[2].split(";")[0];
  const ymd = csvDay.split("/").reverse().join("-");
  await page.goto(`${BASE}/cabinet?jour=${ymd}`);
  await scan(page, "dashboard with scheduled sends");
  ok("scheduled chip on dashboard", (await page.getByText("Programmé").count()) >= 2);
  const hugoRow = page.locator("tr").filter({ hasText: "Hugo Blanc" });
  await hugoRow.getByRole("button", { name: "Copier un lien" }).click();
  await hugoRow.getByText("Lien copié").waitFor();
  const hugoLink = await page.evaluate(() => navigator.clipboard.readText());
  await ctx.close();
  return { fresh: link, hugoLink };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
try {
  await patientFlow(browser, process.env.PATIENT_LINK, "1978-03-14", { yesAnticoag: true });
  if (process.env.AES_LINK) await patientFlow(browser, process.env.AES_LINK, "1983-08-08", { aes: true });
  const { fresh, hugoLink } = await staffFlow(browser);

  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    await p.goto(hugoLink);
    await p.getByRole("button", { name: "Recevoir mon code" }).click();
    await p.getByText(/Code envoyé à l'adresse/).waitFor();
    await scan(p, "patient access by code");
    const code = (await p.locator("strong.tabular-nums").textContent()).trim();
    await p.getByLabel("Code de vérification").fill(code);
    await p.getByRole("button", { name: "Continuer" }).click();
    await p.getByRole("button", { name: "Commencer" }).waitFor();
    ok("no birth date: access by e-mail code works", true);
    await c.close();
  }

  // Lockout after 5 wrong birth dates on the freshly created link.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(fresh);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Jour").fill("01");
    await page.getByLabel("Mois").fill("01");
    await page.getByLabel("Année").fill("2000");
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByText(i < 4 ? `Il vous reste ${4 - i} essai(s)` : "Trop d'essais").waitFor();
  }
  ok("lockout after 5 wrong birth dates", (await page.getByText("L'accès est bloqué").count()) === 1);
  await page.goto(`${BASE}/p/not-a-real-token-at-all-123456`);
  ok("unknown token handled", (await page.getByRole("heading", { name: "Lien introuvable" }).count()) === 1);
  await ctx.close();
} catch (e) {
  ok("unexpected error", false, String(e).slice(0, 300));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const s of a11y.filter((x) => x.bad.length)) console.log(`a11y ${s.label}:\n  ${s.bad.join("\n  ")}`);
process.exit(failed.length ? 1 : 0);
