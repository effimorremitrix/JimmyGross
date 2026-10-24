import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const [mode = "preview", fpsArg = "30"] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: mode === "preview" ? 0.6 : 1 });
await p.goto("file://" + process.cwd() + "/video/explainer.html");
await p.evaluate(() => document.fonts.ready);
const stage = p.locator("#stage");
if (mode === "preview") {
  mkdirSync("video/preview", { recursive: true });
  for (const t of [3.5, 9, 14.2, 21.8, 27.8, 33.8, 37]) {
    await p.evaluate((t) => window.render(t), t);
    await stage.screenshot({ path: `video/preview/t${t}.png` });
  }
} else {
  mkdirSync("video/frames", { recursive: true });
  const fps = +fpsArg, n = Math.round(38 * fps);
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.render(t), i / fps);
    await stage.screenshot({ path: `video/frames/f${String(i).padStart(5, "0")}.png` });
  }
}
await b.close();
