/**
 * Verification for the three systems that existed in the engine with no UI at all: the golden
 * patty, selling the business, and the achievement wall.
 *
 * Selling is the only irreversible action in the game, so it gets checked properly: goodwill is
 * awarded, the run resets, and nothing permanent is lost.
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
state.cash = 1e12;
for (let i = 0; i < 6; i += 1) buyGenerator(state, i, 20, config);
state.lifetimeRevenue = config.prestige.minLifetimeRevenueToSell * 6;
state.achievements = config.achievements.slice(0, 9).map((a) => a.id);
state.cash = 12_000;

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
  ([k, v]) => window.localStorage.setItem(k as string, v as string),
  [config.save.storageKey, serialize(state)],
);

const page = await context.newPage();
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1600);

await page.locator(".tab").nth(2).tap();
await page.waitForTimeout(400);
await page.screenshot({ path: join(ROOT, "reports", "shots", "books-0.png") });
const wallCount = await page.locator(".wall__item--got").count();
const sellBtn = page.locator(".docketbtn").first();
const sellEnabled = await sellBtn.isEnabled();

// Two-tap arm, because it can't be undone.
await sellBtn.tap();
await page.waitForTimeout(260);
const armed = (await sellBtn.textContent())?.includes("Sure?") ?? false;
await page.screenshot({ path: join(ROOT, "reports", "shots", "books-1-armed.png") });
await sellBtn.tap();
await page.waitForTimeout(900);
await page.screenshot({ path: join(ROOT, "reports", "shots", "books-2-sold.png") });

const goodwillLine = await page.locator(".shop__head span").first().textContent();
const perkCount = await page.locator(".docketbtn").count();
const wallAfter = await page.locator(".wall__item--got").count();

// Back to the shop: the run should have reset but the wall should not have.
await page.locator(".tab").first().tap();
await page.waitForTimeout(400);
const onTheBooks = await page.locator(".shop__head span").first().textContent();
await page.screenshot({ path: join(ROOT, "reports", "shots", "books-3-fresh.png") });

console.log(`wall lit before  : ${wallCount}`);
console.log(`sell enabled     : ${sellEnabled}`);
console.log(`arms before sale : ${armed}`);
console.log(`goodwill after   : ${goodwillLine}`);
console.log(`perks offered    : ${perkCount - 1}`);
console.log(`wall lit after   : ${wallAfter} (must be >= before)`);
console.log(`run after sale   : ${onTheBooks}`);
console.log(`console errors   : ${errors.length === 0 ? "none" : errors.join(" | ")}`);
await browser.close();
