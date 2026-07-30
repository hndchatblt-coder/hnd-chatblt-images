/** One-off visual check: seed a save with staff hired, then look at the shop. */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { config } from "../src/engine/config.js";
import { buyGenerator } from "../src/engine/engine.js";
import { serialize } from "../src/engine/save.js";
import { createInitialState } from "../src/engine/state.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const state = createInitialState(20260720, Date.now());
state.cash = 5_000_000;
buyGenerator(state, 0, 14, config); // tongs
buyGenerator(state, 1, 6, config);  // fryer
buyGenerator(state, 2, 4, config);  // grill hand
buyGenerator(state, 3, 3, config);  // front of house
buyGenerator(state, 4, 2, config);  // uber eats
buyGenerator(state, 5, 1, config);  // rosebery
state.cash = 2_400;
const saved = serialize(state);

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const url = pathToFileURL(resolve(ROOT, "dist", "index.html")).href;
await page.goto(url, { waitUntil: "load" });
await page.evaluate(
  ([key, value]) => window.localStorage.setItem(key as string, value as string),
  [config.save.storageKey, saved],
);
const fresh = await context.newPage();
await fresh.goto(url, { waitUntil: "load" });
await fresh.waitForTimeout(3500);
await fresh
  .screenshot({ path: join(ROOT, "reports", "shots", "06-staffed-shop.png"), timeout: 8000 })
  .catch(() => console.warn("screenshot skipped"));
console.log("staffed shop captured");
await browser.close();
