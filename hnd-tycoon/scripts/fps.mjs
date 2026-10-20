/**
 * Frame times, measured. BUILD_PLAN step 17.
 *
 * *"60fps with 40 customers and 12 staff on a throttled mid-range Android."*
 *
 * **Two honest substitutions, stated rather than buried.**
 *
 * There is no Android in this container. The proxy is Chromium under CDP CPU
 * throttling, which is what Chrome's own devtools uses to stand in for slower
 * hardware. A 4x slowdown is the conventional mid-range figure. It is a proxy
 * and it is not the same as a real Pixel 6a — what it CAN do is fail, loudly,
 * when a change makes the renderer four times too slow, and that is the whole
 * job of a performance gate.
 *
 * And it reports the **95th percentile frame time**, not the mean. A mean of
 * 16ms with one 400ms hitch a second is a stutter the player feels and a number
 * that looks perfect. The 95th is the one that matches the experience.
 *
 * Deliberately outside `npm run gate`: frame timing on shared CI hardware is
 * noisy enough that gating on it would train everyone to re-run until green.
 * Run it with `npm run fps`, read the number, and put it in STATE.md.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const PORT = 5198;
/** §21.1's density stages. Stage 4 is "manic" and is what step 17 gates on. */
const STAGES = [
  { name: 'stage 1  quiet', customers: 6, staff: 1 },
  { name: 'stage 2  busy', customers: 16, staff: 2 },
  { name: 'stage 3  slammed', customers: 28, staff: 6 },
  { name: 'stage 4  manic', customers: 40, staff: 12 },
];
const CPU_THROTTLE = Number(process.env.THROTTLE ?? 4);
const SAMPLE_MS = 6_000;
const TARGET_MS = 1000 / 60;

const server = await createServer({ server: { port: PORT, strictPort: true } });
await server.listen();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const cdp = await page.context().newCDPSession(page);

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => globalThis.__hnd !== undefined, null, { timeout: 20_000 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

console.log(`\nFRAME TIMES — Chromium at ${CPU_THROTTLE}x CPU throttle, 390x844 @2x`);
console.log('(a stand-in for a mid-range Android, not the same thing)\n');
console.log('  stage                 p50      p95   worst sim  worst render   entities');

const rows = [];
for (const stage of STAGES) {
  // Pose the density rather than waiting for it. Stage 4 happens on a Friday
  // night in a shop three weeks in; the renderer is what is being measured.
  await page.evaluate((s) => {
    const game = globalThis.__hnd;
    if (!game) return;
    game.setSpeed(4);
    const state = game.world.state;
    while (state.staff.length < s.staff) {
      const proto = state.staff[0];
      if (!proto) break;
      state.staff.push({ ...proto, id: `perf-${state.staff.length}`, roster: [true, true, true, true, true, true, true] });
    }
    state.workingToday.clear();
    for (const st of state.staff.slice(0, s.staff)) state.workingToday.add(st.id);
    state.onToday = state.workingToday.size;
  }, stage);

  // Let the shop fill to the target before timing anything, THEN start the
  // window — the fill itself is not what is being measured.
  await page.waitForTimeout(4_000);
  await page.evaluate(() => globalThis.__hnd?.resetCost());

  const times = await page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const samples = [];
        let last = 0;
        let started = 0;
        const tick = (now) => {
          if (started === 0) {
            started = now;
            last = now;
            requestAnimationFrame(tick);
            return;
          }
          samples.push(now - last);
          last = now;
          if (now - started >= ms) resolve(samples);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    SAMPLE_MS,
  );

  const live = await page.evaluate(() => {
    const game = globalThis.__hnd;
    const state = game?.world.state;
    return {
      customers: state?.customers.size ?? 0,
      staff: state?.onToday ?? 0,
      sim: game?.cost.sim ?? 0,
      render: game?.cost.render ?? 0,
    };
  });

  times.sort((a, b) => a - b);
  const at = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))] ?? 0;
  const over = times.filter((t) => t > TARGET_MS).length;
  const row = {
    stage: stage.name,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    worst: times[times.length - 1] ?? 0,
    overPct: (over / times.length) * 100,
    live,
  };
  rows.push(row);
  console.log(
    `  ${row.stage.padEnd(20)}${row.p50.toFixed(1).padStart(5)}ms${row.p95.toFixed(1).padStart(7)}ms` +
      `${row.live.sim.toFixed(2).padStart(8)}ms${row.live.render.toFixed(2).padStart(9)}ms` +
      `   ${row.live.customers} + ${row.live.staff}`,
  );
}

await browser.close();
await server.close();

const manic = rows[rows.length - 1];
console.log('');
if (!manic) process.exit(0);

// The wall-clock columns are this container's compositor, not the game. They sit
// at a flat multiple of 16.67ms whatever the room holds, which is the tell.
const flat = rows.every((r) => Math.abs(r.p50 - (rows[0]?.p50 ?? 0)) < 1);
if (flat) {
  console.log('  p50/p95 are FLAT across a 5x change in density — this container has no GPU');
  console.log('  and is pacing rAF in whole vsync intervals. Those two columns say nothing');
  console.log('  about the renderer. Read sim/f and render/f, which do move.\n');
}
const budget = TARGET_MS - manic.live.sim;
console.log(
  `  stage 4 WORST frame: ${manic.live.sim.toFixed(2)}ms sim + ${manic.live.render.toFixed(2)}ms render` +
    ` = ${(manic.live.sim + manic.live.render).toFixed(2)}ms of a ${TARGET_MS.toFixed(1)}ms frame.`,
);
console.log(
  manic.live.sim + manic.live.render <= TARGET_MS
    ? `  Fits, with ${(budget - manic.live.render).toFixed(2)}ms spare. Real-device fps still unverified.\n`
    : `  Does not fit. ${(manic.live.sim + manic.live.render - TARGET_MS).toFixed(2)}ms over budget.\n`,
);
