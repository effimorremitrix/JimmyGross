/**
 * Real Yousign sandbox run (SES, otp_email). Requires SIGNATURE_PROVIDER=yousign.
 *   PATIENT_EMAIL=you@example.com OTP_FILE=/path/otp.txt node tests/e2e/yousign-sandbox.mjs
 * The script waits until OTP_FILE contains the 6-digit code Yousign e-mailed.
 */
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.PATIENT_EMAIL;
const OTP_FILE = process.env.OTP_FILE;
const OUT = process.env.OUT_DIR ?? ".";
const IP = process.env.TEST_IP ?? "1.1.1.1"; // Yousign requires a public IP; behind a real host it is the patient's.
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const staff = await (await browser.newContext({ locale: "fr-FR" })).newPage();
await staff.goto(`${BASE}/login`);
await staff.getByLabel("E-mail").fill("dr.gross@demo.consentza.fr");
await staff.getByLabel("Mot de passe").fill(process.env.SEED_PASSWORD ?? "consentza-demo");
await staff.getByRole("button", { name: "Se connecter" }).click();
await staff.waitForURL(/\/cabinet$/);

await staff.goto(`${BASE}/cabinet/nouveau`);
await staff.locator('input[name="firstName"]').fill("Effi");
await staff.locator('input[name="lastName"]').fill("Test Yousign");
await staff.locator('input[name="birthDate"]').fill("1970-01-01");
await staff.locator('input[name="email"]').fill(EMAIL);
await staff.getByLabel("Localisation prévue").fill("Genou droit");
await staff.getByText("Je colle le lien moi-même dans Doctolib").click();
await staff.getByRole("button", { name: "Créer la demande" }).click();
await staff.getByRole("heading", { name: "Demande créée" }).waitFor();
const link = await staff.getByLabel("Lien patient").inputValue();
log(`request created ${link}`);

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", extraHTTPHeaders: { "x-forwarded-for": IP } });
const page = await ctx.newPage();
await page.goto(link);
await page.getByLabel("Jour").fill("01");
await page.getByLabel("Mois").fill("01");
await page.getByLabel("Année").fill("1970");
await page.getByRole("button", { name: "Continuer" }).click();
await page.getByRole("button", { name: "Commencer" }).click();
await page.getByRole("heading", { name: "Fiche d'information" }).waitFor();
const ack = page.getByRole("button", { name: "J'ai lu cette partie" });
const n = await ack.count();
for (let i = 0; i < n; i++) {
  await ack.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await ack.first().click();
  await page.waitForTimeout(200);
}
await page.getByRole("button", { name: "Continuer" }).click();
await page.getByRole("heading", { name: "Questionnaire avant le geste" }).waitFor();
const groups = page.locator("fieldset").filter({ has: page.locator('input[type="radio"]') });
for (let i = 0, g = await groups.count(); i < g; i++) {
  const fs = groups.nth(i);
  if (((await fs.textContent()) ?? "").includes("anticoagulant ou antiagrégant")) {
    await fs.getByText("Oui", { exact: true }).click();
    await fs.getByLabel("Nom du traitement").fill("Kardégic 75 mg");
  } else await fs.getByText("Non", { exact: true }).click();
}
await page.getByRole("button", { name: "Continuer" }).click();
await page.getByRole("heading", { name: "Votre consentement" }).waitFor();
await page.getByRole("checkbox").check();
await page.locator("canvas").evaluate((el) => el.scrollIntoView({ block: "center" }));
await page.waitForTimeout(200);
const box = await page.locator("canvas").boundingBox();
await page.mouse.move(box.x + 30, box.y + 100);
await page.mouse.down();
for (let i = 0; i < 12; i++) await page.mouse.move(box.x + 40 + i * 20, box.y + 60 + (i % 2 ? 50 : -10), { steps: 4 });
await page.mouse.up();
await page.getByRole("button", { name: "Recevoir mon code de signature" }).click();
await page.getByRole("heading", { name: "Code de confirmation" }).waitFor({ timeout: 60000 });
log("OTP requested from Yousign; waiting for code in OTP_FILE");

let code = "";
for (let i = 0; i < 300 && !/^\d{6}$/.test(code); i++) {
  await new Promise((r) => setTimeout(r, 2000));
  if (existsSync(OTP_FILE)) code = readFileSync(OTP_FILE, "utf8").trim();
}
if (!code) throw new Error("no OTP received");
await page.getByLabel("Code de signature").fill(code);
await page.getByRole("button", { name: "Valider et signer" }).click();
await page.getByRole("heading", { name: /C'est signé/ }).waitFor({ timeout: 60000 });
log("SIGNED via Yousign");

const id = (await staff.goto(`${BASE}/cabinet`), null);
await staff.goto(`${BASE}/cabinet?jour=${new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)}`);
const reqLink = staff.getByRole("link", { name: "Effi Test Yousign" }).first();
if (await reqLink.count()) {
  await reqLink.click();
  const rid = staff.url().split("/").pop();
  for (const kind of ["signed", "evidence", "provider-trail"]) {
    const res = await staff.request.get(`${BASE}/api/requests/${rid}/documents/${kind}`);
    const body = await res.body();
    log(`${kind}: ${res.status()} ${body.length} bytes`);
    if (res.status() === 200) writeFileSync(`${OUT}/yousign-${kind}.pdf`, body);
  }
}
await browser.close();
void id;
