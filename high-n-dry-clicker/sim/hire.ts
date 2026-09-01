/**
 * E2 verification: buying the first of a station should put a person on the floor walking in.
 * Captures frames through the walk so the animation can be checked rather than assumed.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { config } from "../src/engine/config.js";
import { buyGenerator } from "../src/engine/engine.js";
import { serialize } from "../src/engine/save.js";
import { createInitialState } from "../src/engine/state.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const state = createInitialState(20260720, Date.now());
// Enough of a shop that the grill-hand docket is unlocked, and enough cash to hire.
state.cash = 1e7;
buyGenerator(state, 0, 12, config);
buyGenerator(state, 1, 4, config);
state.cash = 50_000;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const url = pathToFileURL(resolve(ROOT, "dist", "index.html")).href;
const seed = await context.newPage();
await seed.goto(url, { waitUntil: "load" });
await seed.evaluate(
  ([key, value]) => window.localStorage.setItem(key as string, value as string),
  [config.save.storageKey, serialize(state)],
);

const page = await context.newPage();
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1500);

// Buy the third station (grill hand) — a bay in the middle, so the walk is long enough to see.
const dockets = page.locator(".docketbtn");
await dockets.nth(2).tap();
for (const [i, wait] of [120, 260, 260, 260, 300].entries()) {
  await page.waitForTimeout(wait);
  await page
    .locator(".scene")
    .screenshot({ path: join(ROOT, "reports", "shots", `hire-${i}.png`), timeout: 8000 })
    .catch(() => console.warn(`skipped hire-${i}`));
}
console.log("hire frames captured");
await browser.close();
