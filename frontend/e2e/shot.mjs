// Screenshot helper — visual QA pass at 1440x900 (system Chromium).
// Usage: node e2e/shot.mjs view1,view2  |  node e2e/shot.mjs --scroll view[:scrollFraction]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const FRONT = process.env.FRONT_URL || "http://localhost:4173";
const OUT = process.env.SHOT_OUT || "/tmp/rbps_design";
mkdirSync(OUT, { recursive: true });
const scrollMode = process.argv[2] === "--scroll";
const viewsArg = scrollMode ? process.argv[3] : process.argv[2];
const views = viewsArg ? viewsArg.split(",") : ["command","network","workspace","simulation","approval"];
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(FRONT, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(600);
const cta = p.locator("button:has-text('Sign in')").first();
if ((await cta.count()) > 0) await cta.click();
await p.waitForTimeout(400);
const fill = p.locator("button:has-text('Fill demo')").first();
if ((await fill.count()) > 0) await fill.click();
await p.locator("button[type=submit]").first().click();
await p.waitForTimeout(2500);
for (const v of views) {
  const [name, frac] = v.split(":");
  await p.goto(`${FRONT}/#/${name}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  if (scrollMode) {
    await p.evaluate((f) => {
      const el = document.querySelector("main");
      if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) * f;
      const root = document.scrollingElement ?? document.documentElement;
      root.scrollTop = (root.scrollHeight - root.clientHeight) * f;
    }, Number(frac ?? 1));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/${name}-scroll.png` });
  } else {
    await p.screenshot({ path: `${OUT}/${name}.png` });
  }
  console.log(`shot: ${v}`);
}
await b.close();
console.log("SHOTS_DONE");
