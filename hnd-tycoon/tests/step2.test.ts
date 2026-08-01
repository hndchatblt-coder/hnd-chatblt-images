/**
 * STEP 2 GATES — one customer, one burger.
 *
 * These were `it.todo` in gates.pending.test.ts. They are the exit criteria
 * from docs/BUILD_PLAN.md, restated as red/green so that "plausible" and
 * "roughly halves" have to mean specific numbers.
 */
import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '@/config/layouts';
import { RECIPES } from '@/config/recipes';
import { buildRecipeGraph, RecipeGraphError } from '@/sim/recipeGraph';
import { buildScenario } from '@/sim/scenario';
import { mean, runSeeds, scaledLine, SEEDS, variance } from '@/harness/probe';
import { TICKS_PER_GAME_HOUR } from '@/sim/clock';
import type { Step } from '@/config/recipes';

const DAYS = 7;

describe('STEP 2 — a 7-day run produces plausible covers and mean wait', () => {
  const runs = runSeeds({ days: DAYS, siteId: 'leichhardt' }, SEEDS);

  it('serves a plausible number of covers a day for a burger bar', () => {
    const perDay = mean(runs.map((r) => r.covers)) / DAYS;
    // Leichhardt's invented foot traffic is 14/hr over an 11-hour day = ~154.
    // Wide band because every number feeding this is provisional (REAL_NUMBERS).
    expect(perDay).toBeGreaterThan(80);
    expect(perDay).toBeLessThan(220);
  });

  it('keeps mean wait in minutes a human would recognise', () => {
    const wait = mean(runs.map((r) => r.meanWaitMinutes));
    expect(wait).toBeGreaterThan(1);
    expect(wait).toBeLessThan(15);
  });

  it('clears the board — a baseline day is not a backlog', () => {
    const served = mean(runs.map((r) => r.covers));
    const arrived = mean(runs.map((r) => r.arrived));
    expect(served / arrived).toBeGreaterThan(0.95);
    expect(mean(runs.map((r) => r.openAtEnd))).toBeLessThan(5);
  });
});

describe('STEP 2 — doubling station speed roughly halves mean wait', () => {
  it('cuts mean wait to between a quarter and 55% of baseline', () => {
    const base = mean(
      runSeeds({ days: DAYS }, SEEDS).map((r) => r.meanWaitMinutes),
    );
    const fast = mean(
      runSeeds(
        { days: DAYS, stations: scaledLine(LAYOUTS['leichhardtTight']!.stations, 2) },
        SEEDS,
      ).map((r) => r.meanWaitMinutes),
    );

    const ratio = fast / base;
    // Not exactly half, and it should not be. Doubling the speed removes both
    // the service time AND the queueing that service time was causing, so the
    // honest result lands under a half. The lower bound is what stops a bug
    // that skips work entirely from reading as a triumph.
    expect(ratio).toBeLessThan(0.55);
    expect(ratio).toBeGreaterThan(0.25);
  });
});

describe('STEP 2 — the scheduler pulls, it does not push', () => {
  it('still plates food when the kitchen is under real load', () => {
    // The gate that matters. A push scheduler — deepest unmet need first —
    // looks fine on a quiet day and collapses under load: it makes patties
    // forever and nothing ever reaches the pass. Measured, at 45 arrivals an
    // hour: pull serves ~86% of arrivals, push serves ~4%.
    const runs = runSeeds({ days: DAYS, arrivalsPerHour: 45 }, SEEDS);
    const served = mean(runs.map((r) => r.covers));
    const arrived = mean(runs.map((r) => r.arrived));
    expect(served / arrived).toBeGreaterThan(0.7);
  });
});

describe('STEP 2 — the DAG resolves dependencies correctly', () => {
  it('orders every step after the steps it depends on', () => {
    for (const recipe of Object.values(RECIPES)) {
      const graph = buildRecipeGraph(recipe);
      const seen = new Set<string>();
      for (const step of graph.topological) {
        for (const dep of step.dependsOn) {
          expect(seen.has(dep), `${recipe.id}: ${step.id} before its dep ${dep}`).toBe(true);
        }
        seen.add(step.id);
      }
    }
  });

  it('schedules shallowest-first, so the line drains toward the pass', () => {
    const graph = buildRecipeGraph(RECIPES['cheeseburger'] as never);
    expect(graph.pull.map((s) => s.id)).toEqual([
      'plate',
      'assemble',
      'bun',
      'garnish',
      'patty',
    ]);
    expect(graph.finishedItem).toBe('servedBurger');
    expect(graph.depth.get('plate')).toBe(0);
    expect(graph.depth.get('patty')).toBe(2);
  });

  it('refuses a cycle rather than producing a kitchen that never plates', () => {
    const cyclic = {
      ...(RECIPES['chips'] as never as { id: string; name: string; sellPrice: unknown }),
      steps: [
        { ...(RECIPES['chips']?.steps[0] as Step), dependsOn: ['plateChips'] },
        RECIPES['chips']?.steps[1] as Step,
      ],
    };
    expect(() => buildRecipeGraph(cyclic as never)).toThrow(RecipeGraphError);
  });

  it('refuses a recipe with two things to hand the customer', () => {
    const forked = {
      ...(RECIPES['chips'] as never as object),
      steps: [
        RECIPES['chips']?.steps[0] as Step,
        { ...(RECIPES['chips']?.steps[1] as Step), dependsOn: [] },
      ],
    };
    expect(() => buildRecipeGraph(forked as never)).toThrow(RecipeGraphError);
  });
});

describe('STEP 2 — an order is served only once every step has completed', () => {
  it('completes patty, bun and garnish before assemble, and assemble before plate', () => {
    // Watch actual execution, not the declared graph: poll the job table each
    // tick and record which step finished when. A scheduler bug that plated
    // thin air would pass a graph test and fail this one.
    const world = buildScenario({ seed: 7, arrivalsPerHour: 4 });
    const completedAt = new Map<string, number>();
    let live = new Map<string, string>();

    for (let tick = 0; tick < TICKS_PER_GAME_HOUR * 24; tick++) {
      const before = live;
      world.tick();
      live = new Map([...world.state.jobs.values()].map((j) => [j.id, j.stepId]));
      for (const [jobId, stepId] of before) {
        if (!live.has(jobId) && !completedAt.has(stepId)) completedAt.set(stepId, tick);
      }
      if (world.state.day.served > 0 && completedAt.has('plate')) break;
    }

    const at = (id: string): number => {
      const t = completedAt.get(id);
      expect(t, `step "${id}" never completed`).toBeDefined();
      return t as number;
    };

    expect(at('patty')).toBeLessThanOrEqual(at('assemble'));
    expect(at('bun')).toBeLessThanOrEqual(at('assemble'));
    expect(at('garnish')).toBeLessThanOrEqual(at('assemble'));
    expect(at('assemble')).toBeLessThanOrEqual(at('plate'));
  });

  it('never marks an order served with an unfulfilled line', () => {
    const world = buildScenario({ seed: 11 });
    world.runDays(3);
    for (const order of world.state.orders.values()) {
      if (order.state !== 'served') continue;
      for (const line of order.lines) {
        expect(line.fulfilled).toBeGreaterThanOrEqual(line.quantity);
      }
      expect(order.servedAt).not.toBeNull();
    }
    expect([...world.state.orders.values()].some((o) => o.state === 'served')).toBe(true);
  });
});

describe('STEP 2 — arrivals are Poisson', () => {
  const world = buildScenario({ seed: 99 });
  const perHour: number[] = [];
  let last = 0;

  // Sample only trading hours; the closed hours are structural zeroes and
  // would drag the variance ratio to nonsense.
  for (let day = 0; day < 30; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const open = world.clock.isOpen;
      world.runTicks(TICKS_PER_GAME_HOUR);
      const arrived = world.state.counters.customer - last;
      last = world.state.counters.customer;
      if (open) perHour.push(arrived);
    }
  }

  it('has variance close to its mean', () => {
    const m = mean(perHour);
    const v = variance(perHour);
    expect(m).toBeGreaterThan(0);
    // The defining property of a Poisson process. A uniform "one every N
    // ticks" arrival would sit near zero here and the kitchen would never
    // struggle, which would quietly delete the game.
    expect(v / m).toBeGreaterThan(0.7);
    expect(v / m).toBeLessThan(1.4);
  });

  it('produces bursts — some hours land far above the mean', () => {
    const m = mean(perHour);
    const sd = Math.sqrt(variance(perHour));
    expect(Math.max(...perHour)).toBeGreaterThan(m + 2 * sd);
  });
});
