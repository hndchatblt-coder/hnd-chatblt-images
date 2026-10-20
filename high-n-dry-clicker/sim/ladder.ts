/**
 * E1 verification: the tier ladder is only worth anything if you can SEE the difference.
 *
 * Captures the counter view at each tier of the ladder, from a shop with nothing upgraded to one
 * with every station at x50. If two of these look the same, E1 has failed.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { config, tierUpgradeId } from "../src/engine/config.js";
import { buyGenerator } from "../src/engine/engine.js";
import { serialize } from "../src/engine/save.js";
import { createInitialState } from "../src/engine/state.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A shop with the first five stations staffed and `tier` upgrades bought on each. */
function saveAt(tier: number): string {
  const state = createInitialState(20260720, Date.now());
  state.cash = 1e12;
  const counts = [60, 60, 60, 60, 60, 1];
  counts.forEach((n, i) => buyGenerator(state, i, n, config));
  for (let g = 0; g < config.generators.list.length; g += 1) {
    const id = config.generators.list[g]?.id;
    if (!id) continue;
    for (let i = 0; i < tier; i += 1) state.upgrades.push(tierUpgradeId(id, i));
  }
  state.cash = 5_000;
  return serialize(state);
}

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const url = pathToFileURL(resolve(ROOT, "dist", "index.html")).href;

const seed = await context.newPage();
await seed.goto(url, { waitUntil: "load" });

for (let tier = 0; tier <= 3; tier += 1) {
  await seed.evaluate(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [config.save.storageKey, saveAt(tier)],
  );
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load" });
  // Owning a second venue auto-pulls the camera back to the strip. Let that happen, then walk
  // the camera back in — this is a counter-view test.
  await page.waitForTimeout(1400);
  const counter = page.locator(".zoom__btn").first();
  if ((await counter.count()) > 0) await counter.tap();
  await page.waitForTimeout(2600);
  const on = await page.locator(".zoom__btn--on").first().textContent();
  if (on?.trim() !== "The counter") console.warn(`tier ${tier}: camera is on "${on}"`);
  await page
    .locator(".scene")
    .screenshot({ path: join(ROOT, "reports", "shots", `tier-${tier}.png`), timeout: 8000 })
    .catch(() => console.warn(`skipped tier-${tier}`));
  await page.close();
  console.log(`tier ${tier} captured`);
}
await browser.close();
