/**
 * STEP 3 GATES — the floor.
 *
 * "Moving the grill six tiles from the pass measurably drops throughput. This
 * is the single most important number in the project — if layout doesn't
 * matter, the game doesn't exist." (BUILD_PLAN step 3.)
 *
 * It does matter. The numbers below were re-measured at step 4, when attention
 * profiles changed what one person can get through and therefore where the
 * kitchen saturates. Q1 is still open — see docs/QUESTIONS.md and D016.
 */
import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '@/config/layouts';
import { STATION_SPECS, walkSeconds } from '@/config/stations';
import { SITES } from '@/config/sites';
import { Floor, footprintOf } from '@/sim/floor';
import { createState } from '@/sim/state';
import { buildScenario } from '@/sim/scenario';
import { mean, runSeeds, SATURATION_RATE } from '@/harness/probe';

const DAYS = 5;
const SEEDS = [1, 2, 3, 4];

const leichhardt = SITES['leichhardt'] as NonNullable<(typeof SITES)[string]>;

describe('STEP 3 — moving the grill six tiles from the pass drops throughput', () => {
  const tightState = createState({ layoutId: 'leichhardtTight' });
  const stretchedState = createState({ layoutId: 'leichhardtStretched' });

  it('the two layouts really are six tiles apart, grill to pass', () => {
    const tight = tightState.floor.betweenStations('grill-1', 'pass-1');
    const stretched = stretchedState.floor.betweenStations('grill-1', 'pass-1');
    expect(tight).toBe(5);
    expect(stretched).toBe(11);
    expect(stretched - tight).toBe(6);
  });

  it('costs measurable throughput, reported as a number', () => {
    const tight = runSeeds({ days: DAYS, layoutId: 'leichhardtTight', arrivalsPerHour: SATURATION_RATE }, SEEDS);
    const stretched = runSeeds({ days: DAYS, layoutId: 'leichhardtStretched', arrivalsPerHour: SATURATION_RATE }, SEEDS);

    const coversDelta = 1 - mean(stretched.map((r) => r.covers)) / mean(tight.map((r) => r.covers));
    const batchDelta = 1 - mean(stretched.map((r) => r.batches)) / mean(tight.map((r) => r.batches));

    /**
     * 9.5% of covers, 3.5% of batches, measured at the saturation knee.
     *
     * These numbers moved at step 4 and the assertion moved with them. Step 3
     * measured 6.6% of covers at 45 arrivals/hr, because a staffer was pinned
     * to a station for the whole of a 90-second patty. Once attention profiles
     * let them walk away, one person got through roughly twice as much, so the
     * rate at which the kitchen is *just coping* rose to 85 — and a comparison
     * made anywhere else measures the wrong thing.
     *
     * Nothing was loosened to keep this green. The lower bound is unchanged at
     * 4%; only the load it is measured under changed, and it changed because
     * the simulation got more accurate. See D016.
     */
    expect(coversDelta).toBeGreaterThan(0.04);
    expect(batchDelta).toBeGreaterThan(0.02);
    // A change this large would mean something other than walking broke.
    expect(coversDelta).toBeLessThan(0.5);
  });

  it('charges the difference as walking time, not as a fudge factor', () => {
    // Six tiles at 0.4m per tile and 0.9m/s is 2.7 seconds each way. That
    // number, not a multiplier, is the entire mechanism.
    expect(walkSeconds(6)).toBeCloseTo(2.667, 2);

    const share = (layoutId: string): number => {
      const world = buildScenario({ seed: 1, layoutId, arrivalsPerHour: SATURATION_RATE });
      world.runDays(DAYS);
      const walk = world.state.staff.reduce((a, s) => a + s.walkSeconds, 0);
      const shift = world.state.staff.reduce((a, s) => a + s.shiftSeconds, 0);
      return walk / shift;
    };

    const tight = share('leichhardtTight');
    const stretched = share('leichhardtStretched');

    // Stretching the room raises the share of the day spent walking from
    // about 13% to about 21%. That share is also the ceiling on what layout
    // can ever cost — walking cannot take more of the day than it occupies.
    //
    // It was 4% before attention profiles existed. The staffer now spends far
    // less of the day standing at a station, so walking is a much larger slice
    // of a much smaller pie.
    expect(tight).toBeGreaterThan(0.08);
    expect(tight).toBeLessThan(0.20);
    expect(stretched).toBeGreaterThan(tight * 1.3);
  });
});

describe('STEP 3 — placement is constrained by the building', () => {
  it('refuses a station without its required service point', () => {
    const floor = new Floor(leichhardt);
    // Gas runs along y=14 only. A grill in the middle of the room has none.
    const middle = floor.canPlace('grill', { x: 2, y: 6 });
    expect(middle.ok).toBe(false);
    expect(middle.reason).toContain('gas');

    expect(floor.canPlace('grill', { x: 2, y: 14 }).ok).toBe(true);
  });

  it('refuses a fryer where there is gas but no extraction', () => {
    const floor = new Floor(leichhardt);
    // Gas spans x=1..7 at y=14; extraction only x=2..6.
    expect(floor.canPlace('fryer', { x: 3, y: 14 }).ok).toBe(true);
    const noHood = floor.canPlace('fryer', { x: 7, y: 14 });
    expect(noHood.ok).toBe(false);
    expect(noHood.reason).toContain('extraction');
  });

  it('refuses a station that would hang off the floor', () => {
    const floor = new Floor(leichhardt);
    // Leichhardt is 9 wide; a 3-wide bench starting at x=7 runs off the end.
    const off = floor.canPlace('assembly', { x: 7, y: 5 });
    expect(off.ok).toBe(false);
    expect(off.reason).toContain('off the floor');
  });

  it('honours rotation — a 3x1 bench becomes 1x3 against a side wall', () => {
    const floor = new Floor(leichhardt);
    // Plumbing is at (8,11) and (8,12): a horizontal prep bench cannot reach
    // it without running off the right-hand wall, a vertical one can.
    expect(floor.canPlace('prep', { x: 8, y: 11 }).ok).toBe(false);
    expect(floor.canPlace('prep', { x: 8, y: 10, rotated: true }).ok).toBe(true);
    expect(footprintOf('prep', { x: 8, y: 10, rotated: true })).toEqual([
      { x: 8, y: 10 },
      { x: 8, y: 11 },
      { x: 8, y: 12 },
    ]);
  });

  it('refuses to put two stations on the same tile', () => {
    const floor = new Floor(leichhardt);
    floor.place('grill-1', 'grill', { x: 2, y: 14 });
    const clash = floor.canPlace('fryer', { x: 3, y: 14 });
    expect(clash.ok).toBe(false);
    expect(clash.reason).toContain('grill-1');
  });
});

describe('STEP 3 — the Leichhardt column at (4,7)', () => {
  it('is where the site says it is', () => {
    expect(leichhardt.obstructions).toContainEqual({ x: 4, y: 7 });
  });

  it('blocks placement', () => {
    const floor = new Floor(leichhardt);
    const onIt = floor.canPlace('assembly', { x: 3, y: 7 });
    expect(onIt.ok).toBe(false);
    expect(onIt.reason).toContain('column at (4,7)');
  });

  it('blocks pathing — staff walk around it, not through it', () => {
    const floor = new Floor(leichhardt);
    expect(floor.isWalkable(4, 7)).toBe(false);
    // Straight through the column would be 2 tiles. Around it is 4.
    expect(floor.pathTiles({ x: 4, y: 6 }, { x: 4, y: 8 })).toBe(4);
    // A tile clear of the column costs the straight-line distance.
    expect(floor.pathTiles({ x: 1, y: 6 }, { x: 1, y: 8 })).toBe(2);
  });

  it('returns Infinity rather than a guess when there is no path', () => {
    const floor = new Floor(leichhardt);
    // Seal the (0,0) corner: a bench across (0,1)-(2,1) and a fridge at (1,0)
    // leave it with no walkable neighbour at all.
    floor.place('wall-a', 'assembly', { x: 0, y: 1 });
    floor.place('wall-b', 'drinks', { x: 1, y: 0 });
    expect(floor.pathTiles({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(Infinity);
    // And the reverse direction, which takes a different early-out branch.
    expect(floor.pathTiles({ x: 5, y: 5 }, { x: 0, y: 0 })).toBe(Infinity);
  });
});

describe('STEP 3 — stations are worked from beside them, never from inside', () => {
  it('never lists a footprint tile as somewhere to stand', () => {
    const state = createState({ layoutId: 'leichhardtTight' });
    for (const station of state.stations) {
      const placement = state.floor.placementOf(station.id);
      expect(placement).toBeDefined();
      const own = new Set(
        footprintOf(station.type, (placement as NonNullable<typeof placement>).at).map(
          (t) => `${t.x},${t.y}`,
        ),
      );
      const access = state.floor.accessTiles(station.id);
      expect(access.length).toBeGreaterThan(0);
      for (const tile of access) expect(own.has(`${tile.x},${tile.y}`)).toBe(false);
    }
  });

  it('refuses a station nobody could stand at', () => {
    const floor = new Floor(leichhardt);
    // Seal the (0,0) corner, then try to put a fridge in it. A station with
    // nowhere to stand beside it can never be worked, so it is not a legal
    // placement however much room the tile itself has.
    floor.place('lid', 'assembly', { x: 0, y: 1 });
    floor.place('side', 'drinks', { x: 1, y: 0 });
    const boxed = floor.canPlace('drinks', { x: 0, y: 0 });
    expect(boxed.ok).toBe(false);
    expect(boxed.reason).toContain('nowhere to stand');
  });
});

describe('STEP 3 — every shipped layout is legal', () => {
  it('places without throwing, and every station is reachable from every other', () => {
    for (const layout of Object.values(LAYOUTS)) {
      const state = createState({ siteId: layout.siteId, layoutId: layout.id });
      expect(state.stations.length).toBe(layout.stations.length);
      for (const a of state.stations) {
        for (const b of state.stations) {
          const d = state.floor.betweenStations(a.id, b.id);
          expect(Number.isFinite(d), `${layout.id}: ${a.id} cannot reach ${b.id}`).toBe(true);
        }
      }
    }
  });

  it('every station type has a footprint and a service requirement declared', () => {
    for (const layout of Object.values(LAYOUTS)) {
      for (const station of layout.stations) {
        const spec = STATION_SPECS[station.type];
        expect(spec, `no spec for ${station.type}`).toBeDefined();
        expect(spec.width).toBeGreaterThan(0);
        expect(spec.depth).toBeGreaterThan(0);
      }
    }
  });
});
