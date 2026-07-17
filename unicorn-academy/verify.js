// Unicorn Academy — verification harness (a FLOOR, not the definition of done — see SPEC <verification>)
// Usage: node verify.js [path-to-game.html]   (default ./game.html)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const GAME = path.resolve(process.argv[2] || 'game.html');
const SHOTS = path.resolve('shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);

let failures = [], warnings = [], shotN = 0;
const fail = m => { failures.push(m); console.log('  ✗ ' + m); };
const pass = m => console.log('  ✓ ' + m);
const warn = m => { warnings.push(m); console.log('  ⚠ ' + m); };

async function shot(page, name) {
  shotN++;
  const p = path.join(SHOTS, `${String(shotN).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: p });
  console.log(`  📸 ${p}`);
}

async function tapTestId(page, id, { optional = false, timeout = 4000 } = {}) {
  const el = page.locator(`[data-testid="${id}"]`).first();
  try {
    await el.waitFor({ state: 'visible', timeout });
    await el.tap();
    return true;
  } catch {
    if (!optional) fail(`element [data-testid="${id}"] not found/tappable`);
    return false;
  }
}

const visible = (page, id) =>
  page.locator(`[data-testid="${id}"]`).first().isVisible().catch(() => false);

async function firstRunToMap(page) {
  // Tolerant first-run walk: any step may be absent (e.g. resuming session).
  await tapTestId(page, 'start-button');
  await page.waitForTimeout(900);
  await tapTestId(page, 'unicorn-colour-1', { optional: true, timeout: 2500 });
  await page.waitForTimeout(400);
  await tapTestId(page, 'mane-colour-1', { optional: true, timeout: 2000 });
  await page.waitForTimeout(400);
  await tapTestId(page, 'unicorn-name-option', { optional: true, timeout: 2000 });
  await page.waitForTimeout(400);
  await tapTestId(page, 'name-done', { optional: true, timeout: 2500 });
  await page.waitForTimeout(600);
  // Quest story: prefer the explicit skip button, fall back to centre taps. Be patient (~25s).
  for (let i = 0; i < 12; i++) {
    if (await visible(page, 'map')) return true;
    if (!(await tapTestId(page, 'story-skip', { optional: true, timeout: 1200 }))) {
      const vp = page.viewportSize();
      await page.mouse.click(vp.width / 2, vp.height / 2);
    }
    await page.waitForTimeout(1000);
  }
  return await visible(page, 'map');
}

(async () => {
  console.log(`\nVerifying ${GAME}\n`);
  if (!fs.existsSync(GAME)) { console.log('game.html not found'); process.exit(1); }

  // --- static checks ---
  const html = fs.readFileSync(GAME, 'utf8');
  console.log('Static checks:');
  if (html.includes('SPRITE_PACK_HERE')) fail('sprite pack marker still present — run build-game.js');
  else pass('sprite pack marker resolved');
  if (/id="p-cat"/.test(html) && /id="p-carrot"/.test(html)) pass('sprite pack symbols present (first+last found)');
  else fail('sprite pack symbols missing or partial (#p-cat / #p-carrot)');
  if (/\balert\s*\(|\bconfirm\s*\(|\bwindow\.prompt\s*\(|(?<![\w.])prompt\s*\(/.test(html))
    fail('alert()/confirm()/prompt() found — banned by SPEC <constraints>');
  else pass('no alert/confirm/prompt');
  for (const id of ['start-button', 'map', 'answer-option', 'home-button', 'dev-panel'])
    if (!html.includes(`data-testid="${id}"`)) fail(`missing data-testid="${id}" (test contract)`);
  pass('test contract spot-check done');
  const mb = fs.statSync(GAME).size / 1048576;
  if (mb > 3) warn(`game.html is ${mb.toFixed(1)} MB (>3 MB — check for duplication)`);
  else if (mb < 0.3) warn(`game.html is ${mb.toFixed(1)} MB (<0.3 MB — features missing?)`);
  else pass(`file size ${mb.toFixed(1)} MB`);

  const browser = await chromium.launch();

  for (const [label, viewport] of [['landscape', { width: 1180, height: 820 }], ['portrait', { width: 820, height: 1180 }]]) {
    console.log(`\nRuntime checks (${label}):`);
    const page = await browser.newPage({ viewport, hasTouch: true, deviceScaleFactor: 2 });
    const consoleErrors = [], netRequests = []; let voiceLog = null;
    page.on('pageerror', e => consoleErrors.push(String(e)));
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text());
      if (/voice/i.test(m.text())) voiceLog = m.text();
    });
    page.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) netRequests.push(r.url()); });

    await page.goto('file://' + GAME);
    await page.waitForTimeout(1200);
    await shot(page, `${label}-load`);

    if (await firstRunToMap(page)) pass('reached the map');
    else fail('never reached the map');
    await shot(page, `${label}-map`);
    if (voiceLog) pass(`voice log: ${voiceLog}`); else warn('no TTS voice console.info seen (SPEC test contract)');

    // enter a starter zone — MANDATORY, not optional
    let inZone = false;
    for (const z of ['zone-letter-meadow', 'zone-number-mountain', 'zone-memory-clouds']) {
      if (await tapTestId(page, z, { optional: true, timeout: 2000 })) { inZone = true; pass(`entered ${z}`); break; }
    }
    if (!inZone) fail('no starter zone tappable from the map (letter-meadow / number-mountain / memory-clouds)');
    else {
      await page.waitForTimeout(1500);
      await shot(page, `${label}-activity`);
      const opts = page.locator('[data-testid="answer-option"]');
      const n = await opts.count();
      if (n >= 2) {
        pass(`activity shows ${n} answer options`);
        await opts.first().tap();
        await page.waitForTimeout(1100);
        await shot(page, `${label}-after-answer`);
        const vp = page.viewportSize();
        for (let i = 0; i < 8; i++) await page.mouse.click(vp.width / 2, vp.height / 2, { delay: 30 });
        pass('mash test survived');
      } else fail('no answer options found in activity');
      if (await tapTestId(page, 'home-button')) pass('home button returned from activity');
      await page.waitForTimeout(800);
    }

    // persistence: save exists, carries schema version, survives reload
    const save = await page.evaluate(() => {
      try {
        for (const k of Object.keys(localStorage)) {
          const v = localStorage.getItem(k);
          if (v && v.trim().startsWith('{')) return JSON.parse(v);
        }
      } catch {} return null;
    });
    if (save) {
      pass('localStorage save exists');
      if ('v' in save) pass(`save schema version v=${save.v}`); else fail('save object has no schema version key "v"');
    } else warn('no JSON save detected in localStorage');
    await page.reload(); await page.waitForTimeout(1400);
    await shot(page, `${label}-after-reload`);

    if (consoleErrors.length) fail(`${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 3).join(' | ')}`);
    else pass('zero console errors');
    if (netRequests.length) fail(`external network requests: ${netRequests.slice(0, 3).join(', ')}`);
    else pass('zero external requests');
    await page.close();
  }

  // dev mode gating
  console.log('\nDev mode checks:');
  {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    await page.goto('file://' + GAME + '?dev=1');
    await page.waitForTimeout(1500);
    if (await visible(page, 'dev-panel')) pass('dev panel present with ?dev=1');
    else fail('dev panel missing with ?dev=1');
    await shot(page, 'dev-mode');
    await page.goto('file://' + GAME);
    await page.waitForTimeout(1200);
    if (await visible(page, 'dev-panel')) fail('dev panel visible WITHOUT ?dev=1 — must be hidden in normal play');
    else pass('dev panel hidden in normal play');
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(56)}\n${failures.length} failure(s), ${warnings.length} warning(s)`);
  if (failures.length) { console.log('\nFIX THESE:\n- ' + failures.join('\n- ')); process.exit(1); }
  console.log(`All automated checks passed. THIS IS A FLOOR. Still required manually (SPEC <verification>):
- open shots/ and LOOK at every screenshot
- drive ?dev=1: streak-3 level-up, 2-miss hint, 3-miss reveal with no credit, level-down floor
- dev simulate-session-boundary x3: plateau handling changes the presentation
- play every zone; test boutique two-step purchase, ceremonies, adult gate + reset hold
- eggs hatch at milestones with naming; treats in the stable grow babies; toy corners open,
  question-free, gem-free; hide-and-seek baby findable
- corrupt-save recovery (write garbage into the save key, reload)
- real-device pass for narration, music ducking, and touch feel (headless has no TTS voices)`);
})();
