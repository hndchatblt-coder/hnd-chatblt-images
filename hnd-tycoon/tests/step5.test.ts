/**
 * STEP 5 GATES — ShapeRegistry and the first watchable burger.
 *
 * The real exit criterion is **density stage 0**: "someone unfamiliar watches
 * for 30 seconds and correctly describes what's happening, unprompted. You
 * want to keep watching it."
 *
 * That is a human gate and it is Ben's to close — no test here claims it, and
 * `docs/STATE.md` says so plainly. What IS machine-checkable is everything the
 * human gate depends on: that the projection puts the street at the bottom and
 * the kitchen at the top, that the food ramp is a continuous interpolation
 * with reserved hues, and that the renderer never contaminates the simulation.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND } from '@/config/brand';
import { RENDER } from '@/config/render';
import { SITES } from '@/config/sites';
import { foodColour, lerpColour } from '@/render/palette';
import { depthSort, toScreen, toScreenCorner } from '@/render/projection';

describe('STEP 5 — the projection is a cross-section, street at the bottom', () => {
  it('puts back-of-house up-screen and the door down-screen', () => {
    // §12: food flows DOWN the screen, customers flow UP it. If this inverts,
    // every reading of the scene inverts with it.
    const door = toScreen(4, 0);
    const backWall = toScreen(4, 14);
    expect(backWall.y).toBeLessThan(door.y);
  });

  it('keeps grid x as screen x — no rotation, this is not isometric', () => {
    // §22.2: grid axes match thumb axes. A nine-wide room is nine taps wide.
    const left = toScreen(0, 5);
    const right = toScreen(8, 5);
    expect(right.x - left.x).toBeCloseTo(8 * RENDER.TILE_WIDTH, 6);
    // Same row, same screen y. Any skew here would be an isometric lean.
    expect(toScreen(0, 5).y).toBe(toScreen(8, 5).y);
  });

  it('foreshortens depth — that is where the oblique lean comes from', () => {
    expect(RENDER.TILE_DEPTH).toBeLessThan(RENDER.TILE_WIDTH);
  });

  it('sorts nearer-the-street over further-from-it', () => {
    // Or a cook standing in front of the grill disappears into it.
    expect(depthSort(0)).toBeGreaterThan(depthSort(14));
  });

  it('fits Leichhardt inside the portrait frame', () => {
    const site = SITES['leichhardt'] as NonNullable<(typeof SITES)[string]>;
    const right = toScreenCorner((site.width as number) - 1, 0).x + RENDER.TILE_WIDTH;
    expect(right).toBeLessThanOrEqual(RENDER.FRAME_WIDTH);
    const top = toScreenCorner(0, (site.depth as number) - 1).y;
    expect(top).toBeGreaterThan(0);
    expect(RENDER.FLOOR_BOTTOM).toBeLessThan(RENDER.FRAME_HEIGHT);
  });
});

describe('STEP 5 — the food ramp is continuous, and burnt is somebody at fault', () => {
  it('walks raw to seared to perfect as it cooks', () => {
    expect(foodColour(0, 1)).toBe(BRAND.signal.foodRaw);
    expect(foodColour(0.5, 1)).toBe(BRAND.signal.foodSeared);
    expect(foodColour(1, 1)).toBe(BRAND.signal.foodPerfect);
  });

  it('never jumps — every step along the ramp is a small step', () => {
    // §22.2: this is an interpolation, not four sprite frames. A discontinuity
    // would read as a state machine, and states are exactly what this avoids.
    let previous = foodColour(0, 1);
    for (let p = 0.02; p <= 1; p += 0.02) {
      const next = foodColour(p, 1);
      const distance =
        Math.abs(((next >> 16) & 0xff) - ((previous >> 16) & 0xff)) +
        Math.abs(((next >> 8) & 0xff) - ((previous >> 8) & 0xff)) +
        Math.abs((next & 0xff) - (previous & 0xff));
      expect(distance).toBeLessThan(24);
      previous = next;
    }
  });

  it('only reaches burnt when quality has been lost', () => {
    // Perfectly cooked food never burns by itself. It burns because nobody
    // came back for it, which is the whole point of the lapse rule.
    expect(foodColour(1, 1)).not.toBe(BRAND.signal.foodBurnt);
    expect(foodColour(1, 0.5)).toBe(BRAND.signal.foodBurnt);
  });

  it('interpolates endpoints exactly', () => {
    expect(lerpColour(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(lerpColour(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(lerpColour(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
});

describe('STEP 5 — reserved hues stay reserved (§21.3)', () => {
  it('gives the food ramp and the ticket ramp hues nothing else uses', () => {
    const reserved = Object.values(BRAND.signal);
    const decorative = [
      ...Object.values(BRAND.interior),
      ...Object.values(BRAND.street),
      ...Object.values(BRAND.equipment),
      ...Object.values(BRAND.people),
      ...Object.values(BRAND.fx),
    ];
    for (const hue of reserved) {
      expect(decorative, `${hue.toString(16)} is both a signal and decoration`).not.toContain(hue);
    }
  });
});

describe('STEP 5 — the renderer never contaminates the simulation', () => {
  it('has no import of render/ or ui/ anywhere under src/sim', () => {
    // `npm run boundaries` enforces this too. Duplicated here because it is
    // the most important constraint in the project and the one whose breakage
    // is least obvious at the point it happens.
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
      });

    for (const file of walk('src/sim')) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} imports render/`).not.toMatch(/from\s+['"][^'"]*\/render\//);
      expect(source, `${file} imports ui/`).not.toMatch(/from\s+['"][^'"]*\/ui\//);
      expect(source, `${file} imports pixi`).not.toMatch(/from\s+['"]pixi\.js['"]/);
    }
  });
});
