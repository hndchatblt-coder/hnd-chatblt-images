/**
 * Playwright screenshots of named states → reports/shots/. Runs against the built single file with
 * iPhone-shaped TOUCH emulation, because a desktop click passing is not evidence a tap works
 * (CLAUDE.md, learned the hard way).
 *
 *   npx vite build && npx tsx sim/shots.ts
 */
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SHOTS = join(ROOT, "reports", "shots");

async function run(): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const url = pathToFileURL(resolve(ROOT, "dist", "index.html")).href;

  // The sandbox ships a prebuilt Chromium; the locally-installed playwright skips its download.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const browser = await chromium.launch({ executablePath });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => {
    const target = r.url();
    if (!target.startsWith("file:") && !target.startsWith("data:")) {
      errors.push(`external request: ${target}`);
    }
  });

  // The scene runs a permanent rAF loop; Playwright's default font/stability wait can hang on it.
  const shot = async (name: string): Promise<void> => {
    // Race the font wait — after a reload document.fonts.ready can never settle in headless,
    // which hung this script until it was bounded.
    await Promise.race([
      page.evaluate(() => document.fonts.ready).catch(() => undefined),
      page.waitForTimeout(1500),
    ]);
    await page.screenshot({ path: join(SHOTS, name), animations: "allow", timeout: 15_000 });
  };

  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(600);
  await shot("01-cold-open.png");

  // Tap the patty with real touch events.
  const box = await page.locator(".scene canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  const px = box.x + box.width / 2;
  const py = box.y + box.height * 0.6;

  await page.touchscreen.tap(px, py);
  await page.waitForTimeout(90);
  await shot("02-the-sear.png");

  for (let i = 0; i < 18; i += 1) {
    await page.touchscreen.tap(px, py);
    await page.waitForTimeout(70);
  }
  await shot("03-rail-filling.png");

  const cashAfterTaps = await page.locator(".till__cash").textContent();

  // Buy the first generator, then let it produce.
  const buy = page.locator(".docketbtn");
  const enabled = await buy.isEnabled();
  if (enabled) await buy.tap();
  await page.waitForTimeout(1400);
  await shot("04-first-hire.png");

  const owned = await page.locator(".docketbtn__owned").textContent();
  const rate = await page.locator(".till__rate").textContent();

  // Reload to prove the save round-trips through a real page load.
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(700);
  await shot("05-after-reload.png");
  const ownedAfterReload = await page.locator(".docketbtn__owned").textContent();

  console.log(`cash after 19 taps : ${cashAfterTaps}`);
  console.log(`generator owned    : ${owned}`);
  console.log(`rate line          : ${rate?.trim()}`);
  console.log(`owned after reload : ${ownedAfterReload}`);
  console.log(errors.length > 0 ? `ERRORS:\n  ${errors.join("\n  ")}` : "no console errors, no external requests");

  await browser.close();
  if (errors.length > 0) process.exit(1);
}

void run();
