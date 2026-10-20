/**
 * F2 verification: arranging the line has to work with a thumb.
 *
 * Taps a bay, checks it lifts, taps another, checks they swapped and the readout moved. Touch
 * emulation throughout — a desktop click passing is not evidence a tap works (CLAUDE.md).
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
state.cash = 1e9;
for (let i = 0; i < 5; i += 1) buyGenerator(state, i, 12, config);
state.cash = 3_000;

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
// Owning front of house auto-pulls the camera back to the shop; arranging is a counter-view act.
const counterBtn = page.locator(".zoom__btn").first();
if ((await counterBtn.count()) > 0) await counterBtn.tap();
await page.waitForTimeout(1400);

const box = await page.locator(".scene canvas").boundingBox();
if (!box) throw new Error("no canvas");
// Bay centres, in canvas coordinates (W=390, H=330). Bench spans y 112..172.
const BAY_LEFT = 154;
const BAY_W = (390 - BAY_LEFT - 6) / 3;
const bayPoint = (i: number): [number, number] => [
  box.x + ((BAY_LEFT + BAY_W * (i + 0.5)) / 390) * box.width,
  box.y + (142 / 330) * box.height,
];

const readout = () => page.locator(".line__value").textContent();

const before = await readout();
await page.locator(".scene").screenshot({ path: join(ROOT, "reports", "shots", "line-0-rest.png") });

// Pick up bay 0.
await page.touchscreen.tap(...bayPoint(0));
await page.waitForTimeout(260);
await page.locator(".scene").screenshot({ path: join(ROOT, "reports", "shots", "line-1-held.png") });

// Drop it on bay 2.
await page.touchscreen.tap(...bayPoint(2));
await page.waitForTimeout(420);
const after = await readout();
await page.locator(".scene").screenshot({ path: join(ROOT, "reports", "shots", "line-2-swapped.png") });

// AUTO should put it back to something at least as good.
await page.locator(".line__auto").tap();
await page.waitForTimeout(420);
const auto = await readout();
await page.locator(".scene").screenshot({ path: join(ROOT, "reports", "shots", "line-3-auto.png") });

console.log(`at rest   : ${before}`);
console.log(`after swap: ${after}`);
console.log(`after auto: ${auto}`);
console.log(`swap changed the line : ${before !== after}`);
console.log(`console errors        : ${errors.length === 0 ? "none" : errors.join(" | ")}`);
await browser.close();
