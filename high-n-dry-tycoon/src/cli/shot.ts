/**
 * Look at the renderer. A screenshot is the only honest evidence a render pass works — "it
 * compiles" is not.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const url = process.argv.includes("--url")
  ? (process.argv[process.argv.indexOf("--url") + 1] as string)
  : "http://localhost:4173/";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(url, { waitUntil: "load" });
for (const [i, wait] of [2500, 5000, 6000].entries()) {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(ROOT, "reports", "shots", `game-${i}.png`) });
}
console.log(errors.length === 0 ? "no console errors" : `errors: ${errors.slice(0, 4).join(" | ")}`);
await browser.close();
