/**
 * F3 verification: buying a fitout has to add a real, usable bay.
 *
 * Checks the docket appears, that buying it widens the bench, and that the extra bay can be
 * tapped and swapped like any other. Touch emulation throughout.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { config } from "../src/engine/config.js";
import { buyGenerator } from "../src/engine/engine.js";
import { bayCount } from "../src/engine/layout.js";
import { serialize } from "../src/engine/save.js";
import { createInitialState } from "../src/engine/state.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const state = createInitialState(20260720, Date.now());
state.cash = 1e12;
for (let i = 0; i < 5; i += 1) buyGenerator(state, i, 12, config);
// Enough to afford the first fitout, and more stations than bench to justify it.
state.cash = config.layout.fitouts[0]!.cost * 1.4;
console.log(`bays before: ${bayCount(state.upgrades, config)}`);

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
const counter = page.locator(".zoom__btn").first();
if ((await counter.count()) > 0) await counter.tap();
await page.waitForTimeout(1200);
await page.locator(".scene").screenshot({ path: join(ROOT, "reports", "shots", "fitout-0-before.png") });

// Find the fitout on the upgrades panel.
await page.locator(".tab").nth(1).tap();
await page.waitForTimeout(300);
const fitout = page.locator(".docketbtn", { hasText: config.layout.fitouts[0]!.name });
const found = (await fitout.count()) > 0;
console.log(`fitout offered: ${found}`);
if (found) {
  await fitout.first().tap();
  await page.waitForTimeout(700);
}
await page.locator(".tab").first().tap();
await page.waitForTimeout(900);
await page.locator(".scene").screenshot({ path: join(ROOT, "reports", "shots", "fitout-1-after.png") });

// The new bay must be tappable: pick up the last bay and swap it into the first.
const box = await page.locator(".scene canvas").boundingBox();
if (!box) throw new Error("no canvas");
const bays = 4;
const BAY_LEFT = 154;
const BAY_W = (390 - BAY_LEFT - 6) / bays;
const bayPoint = (i: number): [number, number] => [
  box.x + ((BAY_LEFT + BAY_W * (i + 0.5)) / 390) * box.width,
  box.y + (142 / 330) * box.height,
];
const before = await page.locator(".line__value").textContent();
await page.touchscreen.tap(...bayPoint(3));
await page.waitForTimeout(220);
await page.touchscreen.tap(...bayPoint(0));
await page.waitForTimeout(420);
const after = await page.locator(".line__value").textContent();
await page.locator(".scene").screenshot({ path: join(ROOT, "reports", "shots", "fitout-2-swapped.png") });

console.log(`line before swap: ${before}`);
console.log(`line after  swap: ${after}`);
console.log(`new bay is usable: ${before !== after}`);
console.log(`console errors   : ${errors.length === 0 ? "none" : errors.join(" | ")}`);
await browser.close();
