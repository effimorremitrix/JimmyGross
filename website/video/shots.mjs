import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
for (const [w,h,name,scheme] of [[1440,900,"desk","light"],[390,844,"mob","light"],[1440,900,"dark","dark"]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: "reduce" });
  const errs = []; p.on("console", m => m.type()==="error" && errs.push(m.text())); p.on("pageerror", e => errs.push(String(e)));
  await p.goto("http://localhost:4173/");
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  await p.screenshot({ path: "/tmp/claude-0/-home-claude/037f5013-a56c-5f57-9d5d-52de93ad838f/scratchpad/w-"+name+".png", fullPage: true });
  console.log(name, "errors:", errs.length, errs.slice(0,3).join(" | "));
  await p.close();
}
await b.close();
