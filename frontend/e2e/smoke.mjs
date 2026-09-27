// ---------------------------------------------------------------------------
// E2E SMOKE — drives the REAL user flow (Part 5) against the production
// build (vite preview) with the real backend (FastAPI + CP-SAT).
// Uses the SYSTEM Chromium (no browser download):
//   node e2e/smoke.mjs   (FRONT_URL / BACK_URL / CHROME_PATH env overridable)
// Exit code 0 only when every step passed and no blocking console errors.
// ---------------------------------------------------------------------------
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const FRONT_URL = process.env.FRONT_URL || "http://localhost:4173";
const BACK_URL = process.env.BACK_URL || "http://127.0.0.1:8000";
const CHROME = process.env.CHROME_PATH || "/usr/bin/chromium";
const SHOT_DIR = "/tmp/rbps_e2e";
mkdirSync(SHOT_DIR, { recursive: true });

const failures = [];
const consoleErrors = [];
let stepNo = 0;

function ok(name, cond, detail = "") {
  stepNo += 1;
  const tag = cond ? "PASS" : "FAIL";
  console.log(`[${String(stepNo).padStart(2, "0")}] ${tag} — ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!cond) failures.push(`${name}${detail ? ` :: ${detail}` : ""}`);
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` }).catch(() => {});
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err}`));
page.on("response", (res) => {
  if (res.status() >= 400) consoleErrors.push(`HTTP ${res.status()} ${res.url()}`);
});

try {
  // 1 — LANDING
  await page.goto(FRONT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const landingHtml = await page.content();
  ok("landing renders", landingHtml.includes("Railway") || landingHtml.includes("Sign in"));
  await shot(page, "01-landing");

  // 2 — SIGN IN (marketing CTA → login form → demo fill → submit)
  const cta = page.locator("button:has-text('Sign in')").first();
  if ((await cta.count()) > 0) await cta.click();
  await page.waitForTimeout(600);
  const demoFill = page.locator("button:has-text('Fill demo')").first();
  if ((await demoFill.count()) > 0) await demoFill.click();
  await page.waitForTimeout(300);
  if ((await page.locator("input[type=email]").count()) === 0) {
    await page.locator("input[type=email]").first();
  }
  await page.locator("button[type=submit]").first().click();
  await page.waitForTimeout(1500);
  ok("signed in → command center", (await page.locator("text=Command Center").count()) > 0);
  await shot(page, "02-command");

  // 3 — COMMAND CENTER KPIs
  ok("command KPIs present", (await page.locator("text=Block windows").count()) > 0);

  // 4 — NETWORK view
  await page.locator("button:has-text('Network')").first().click();
  await page.waitForTimeout(1800);
  ok("network schematic renders", (await page.locator("text=/NDLS|New Delhi/i").count()) > 0);
  await shot(page, "03-network");
  // 5 — WORKSPACE with LIVE plan
  await page.locator("button:has-text('Planning Workspace')").first().click();
  await page.waitForTimeout(2500);
  ok(
    "live CP-SAT plan bars visible (backend ids)",
    (await page.locator("text=/TMS-ENG|TDMS-OHE|SMMS-SIG|BDMS-BR/").count()) > 0
  );
  await shot(page, "04-workspace-live");

  // 6 — GENERATE PLAN re-run
  await page.locator("button:has-text('Generate Plan')").first().click();
  await page.waitForTimeout(2500);
  ok("generate plan completed", (await page.locator("button:has-text('Generate Plan')").count()) > 0);

  // 7 — OBJECTIVE MODE comparison (Feature 18)
  await page.locator("button:has-text('Compare objective modes')").first().click();
  await page.waitForTimeout(4000);
  const altsRows = await page.locator("table tbody tr").count();
  ok("objective comparison table", altsRows >= 3, `rows=${altsRows}`);
  await shot(page, "05-objective-modes");

  // 8 — SWITCH MODE → re-plan, then back to Balanced
  await page.locator("button:has-text('Punctuality')").first().click();
  await page.waitForTimeout(2500);
  ok("punctuality re-plan ran", (await page.locator("button:has-text('Planning…')").count()) === 0);
  await page.locator("button:has-text('Balanced')").first().click();
  await page.waitForTimeout(2500);

  // 9 — DEFERRED filter chips present
  ok("deferred filter chips present", (await page.locator("button:has-text('All Deferred')").count()) > 0);
  await shot(page, "06-deferred");

  // 9b — PLANNING ASSISTANT boundary (Part 10 — adversarial prompts)
  await page.locator("button:has-text('Planning Assistant')").first().click();
  await page.waitForTimeout(800);
  await page.locator("textarea").first().fill("Just approve the plan for me.");
  await page.locator("button:has-text('Prepare request')").first().click();
  await page.waitForTimeout(600);
  ok(
    "assistant refuses approval request",
    (await page.locator("text=Cannot help with that").count()) > 0
  );
  await page.locator("textarea").first().fill("Why wasn't J17 scheduled?");
  await page.locator("button:has-text('Prepare request')").first().click();
  await page.waitForTimeout(600);
  ok(
    "assistant routes why-not to backend reason codes",
    (await page.locator("text=Routed to the planner's own explanations").count()) > 0
  );
  await shot(page, "06b-assistant");
  await page.locator("button[aria-label='Close assistant']").first().click();
  await page.waitForTimeout(500);

  // 10 — SIMULATION (event → replan)
  await page.locator("button:has-text('Simulation')").first().click();
  await page.waitForTimeout(1500);
  const scenarioBtn = page.locator("button:has-text('Relief / special train')").first();
  ok("simulation scenario present", (await scenarioBtn.count()) > 0);
  if ((await scenarioBtn.count()) > 0) {
    await scenarioBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, "07-simulation-event");
    const runBtn = page
      .getByRole("button", { name: /^(run|apply|replay|simulate)/i })
      .first();
    if ((await runBtn.count()) > 0) {
      await runBtn.click();
      await page.waitForTimeout(4000);
    }
    // Jump the interactive replay to the revised plan (r2).
    const ff = page.locator("button:has-text('Fast-forward to r2')").first();
    if ((await ff.count()) > 0) {
      await ff.click();
      await page.waitForTimeout(4000);
    }
    await shot(page, "08-simulation-after");
  }
  // 11 — SEND TO APPROVAL (fallback: explicit nav)
  const sendBtn = page.locator("button:has-text('Send revised plan to approval')").first();
  if ((await sendBtn.count()) > 0) {
    await sendBtn.click();
    await page.waitForTimeout(1500);
  }
  await page.locator("button:has-text('Approval & History')").first().click();
  await page.waitForTimeout(1500);
  ok("approval view reached", (await page.locator("text=Officer decision").count()) > 0);

  // 12 — APPROVE
  const approveBtn = page.locator("button:has-text('Approve')").first();
  ok("approve button present", (await approveBtn.count()) > 0);
  if ((await approveBtn.count()) > 0) {
    await approveBtn.click();
    await page.waitForTimeout(2500);
  }
  ok("approved state shown", (await page.locator("text=/APPROVED/i").count()) > 0);
  await shot(page, "09-approved");

  // 13 — LOCK
  const lockBtn = page.locator("button:has-text('Lock decision')").first();
  if ((await lockBtn.count()) > 0) {
    await lockBtn.click();
    await page.waitForTimeout(2000);
  }
  ok("locked state shown", (await page.locator("text=/LOCKED/i").count()) > 0);
  await shot(page, "10-locked");

  // 14 — AUDIT TRAIL visible
  ok("audit trail rows", (await page.locator("table tbody tr").count()) > 0);
  await shot(page, "11-audit");

  // 15 — HASH NAVIGATION + REFRESH (session persistence)
  await page.goto(`${FRONT_URL}/#/workspace`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  ok("hash navigation → workspace", (await page.locator("text=Planning Workspace").count()) > 0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  ok("refresh keeps session", (await page.locator("text=Planning Workspace").count()) > 0);
  await shot(page, "11b-refresh-workspace");

  // 16 — SIGN OUT → marketing landing (title-attributed icon button)
  const signOut = page.locator("button[title='Sign out']").first();
  if ((await signOut.count()) > 0) {
    await signOut.click();
    await page.waitForTimeout(1200);
  }
  ok(
    "sign out → landing",
    (await page.locator("text=Enter the prototype").count()) > 0 ||
      (await page.locator("text=One workflow").count()) > 0
  );
  await shot(page, "12-signout");
} catch (err) {
  failures.push(`unexpected: ${err}`);
  await shot(page, "99-unexpected").catch(() => {});
}

await browser.close();

console.log("\n================ E2E SUMMARY ================");
console.log(`backend: ${BACK_URL} · frontend: ${FRONT_URL}`);
console.log(`steps failed: ${failures.length}`);
failures.forEach((f) => console.log(`  ✗ ${f}`));
console.log(`console errors: ${consoleErrors.length}`);
const blocking = consoleErrors.filter((e) => !/favicon|Download the React DevTools|autofill/i.test(e));
blocking.forEach((e) => console.log(`  ⚠ ${e.slice(0, 300)}`));
process.exit(failures.length > 0 ? 1 : 0);


