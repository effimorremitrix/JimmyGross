import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
const p = await b.newPage({ viewport: { width: 1300, height: 1300 } });
await p.goto("file://" + process.cwd() + "/video/og.html");
await p.evaluate(() => document.fonts.ready);
await p.locator("#og").screenshot({ path: "site/assets/img/og.png" });
await p.locator("#icon").screenshot({ path: "video/icon-512-full.png" });
await b.close();
