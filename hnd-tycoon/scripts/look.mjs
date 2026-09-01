/**
 * Look at the game. Not a test — a pair of eyes.
 *
 * Two steps in a row now have shipped a visual claim that was only ever
 * asserted from code: step 13's motion contrast (D054) and step 14's HUD. Both
 * were gated structurally and neither was ever watched. A structural gate says
 * the numbers differ; it cannot say the room reads right.
 *
 * So this builds, serves, drives the game forward at speed, and takes real
 * screenshots at named moments. Run it with `npm run look`; the shots land in
 * `shots/` and are gitignored. It is deliberately outside `npm run gate` —
 * nothing here can pass or fail, and pretending otherwise would be the same
 * mistake in a different costume.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';

const SHOTS = 'shots';
const PORT = 5199;
/** Long enough for a rung to land: a game day is 30s at 1x, ~7.5s at 4x. */
const MOMENTS = [
  { name: '1-opening', waitMs: 3_000 },
  { name: '2-mid-service', waitMs: 12_000 },
  { name: '3-after-a-day', waitMs: 20_000 },
  { name: '4-after-three-days', waitMs: 40_000 },
];

await mkdir(SHOTS, { recursive: true });

const server = await createServer({ server: { port: PORT, strictPort: true } });
await server.listen();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
// A phone, because §22.5 is a portrait-mobile HUD and a desktop window would
// flatter it. iPhone 13 viewport.
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text());
});
page.on('pageerror', (e) => problems.push(String(e)));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
// Fastest available speed, so a few real seconds is a few game days.
await page.waitForSelector('.speed', { timeout: 15_000 });
await page.getByRole('button', { name: '4×' }).click();

for (const moment of MOMENTS) {
  await page.waitForTimeout(moment.waitMs);
  await page.screenshot({ path: `${SHOTS}/${moment.name}.png` });
  // §18's Monday choice, if the rung that opens it has landed.
  if (moment.name === '4-after-three-days') {
    const button = page.locator('.specials-open');
    if (await button.count()) {
      await button.click();
      await page.waitForTimeout(400);
      await page.locator('.special').nth(2).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/5-the-monday-choice.png` });
      await page.locator('.sheet-close').click();
    }
  }
  // §16's offer card needs a shop good enough to be asked, which is an hour of
  // play away. Posed rather than waited for — the card is what is being looked
  // at, not the route to it.
  if (moment.name === '3-after-a-day') {
    await page.evaluate(() => {
      const game = globalThis.__hnd;
      if (!game) return;
      game.world.state.stars = 4.3;
      game.world.state.contractOffer = { id: 'functionCatering', lapsesOnDay: 9999 };
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/6-a-job-on-offer.png` });
    await page.locator('.offer-yes').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/7-the-job-is-on.png` });
  }
  const headline = await page.locator('.headline').textContent().catch(() => null);
  const rungs = await page.locator('.rungs li .rung-label').allTextContents();
  const buttons = await page.locator('.actions button').allTextContents();
  console.log(`\n  ${moment.name}`);
  console.log(`    headline  ${headline ?? '(none yet)'}`);
  console.log(`    rungs     ${rungs.join(' | ') || '(none)'}`);
  console.log(`    buttons   ${buttons.join(' | ')}`);
}

await browser.close();
await server.close();

if (problems.length > 0) {
  console.log('\n  console errors:');
  for (const p of [...new Set(problems)]) console.log(`    ${p}`);
}
console.log(`\n  ${MOMENTS.length} shots in ${SHOTS}/\n`);
