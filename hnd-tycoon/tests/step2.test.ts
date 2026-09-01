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
    // Watch actual execution, not the declared graph: wrap the buffer and
    // record every unit as it is produced. A scheduler bug that plated thin
    // air would pass a graph test and fail this one.
    //
    // Sampling state once per tick would be wrong in both directions: garnish
    // takes 1.5s so it can be made between two samples, and a patty is
    // consumed by assembly the instant it exists so it may never be seen
    // sitting in stock at all. Only the event is reliable.
    const world = buildScenario({ seed: 7, arrivalsPerHour: 4 });
    const madeAt = new Map<string, number>();
    const stock = world.state.stock;
    const realAdd = stock.add.bind(stock);
    let now = 0;
    (stock as { add: typeof stock.add }).add = (item, units, at, fresh, cents) => {
      if (!madeAt.has(item as string)) madeAt.set(item as string, now);
      realAdd(item, units, at, fresh, cents);
    };

    for (now = 0; now < TICKS_PER_GAME_HOUR * 24; now++) {
      world.tick();
      if (madeAt.has('servedBurger')) break;
    }

    const completedAt = new Map<string, number>([
      ['patty', madeAt.get('patty') ?? NaN],
      ['bun', madeAt.get('toastedBun') ?? NaN],
      ['garnish', madeAt.get('garnish') ?? NaN],
      ['assemble', madeAt.get('assembledBurger') ?? NaN],
      ['plate', madeAt.get('servedBurger') ?? NaN],
    ]);

    const at = (id: string): number => {
      const t = completedAt.get(id);
      expect(Number.isFinite(t), `step "${id}" never produced anything`).toBe(true);
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
  /**
   * The property is gated in TWO places, because by step 11 it is only exactly
   * true in one of them.
   *
   * **The generator.** `rng.poisson(lambda)` at a fixed rate must have variance
   * equal to its mean. That is the definition, it is the mechanism arrivals
   * actually use, and it is testable to two decimal places.
   *
   * **The shop.** Hourly arrival counts are NOT expected to have variance equal
   * to their mean any more, and asserting that they do would be asserting
   * something false. The rate itself now moves: reputation feeds demand (§6.1),
   * marketing awareness decays daily (§8.3), the price lands a day late (§8.2)
   * and the Recovery Plan knocks 12% off the floor while it is open (§10).
   * Measured over twenty Thursdays at 7pm on one seed, the demand multiplier
   * ranged 0.573 to 1.095 — a coefficient of variation of 0.18.
   *
   * Counts drawn from a Poisson whose rate is itself random are a MIXED Poisson,
   * and a mixed Poisson is over-dispersed by construction: var/mean climbs to
   * roughly `1 + mean * cv^2`. Measured 3.51 against a mean of 22.
   *
   * That is the economy working, not the arrivals breaking. So the shop-level
   * gate asserts what is actually being claimed — that arrivals are bursty
   * rather than metronomic — and the exact property lives on the generator,
   * where the rate is held still.
   */
  it('draws from a real Poisson distribution at a fixed rate', () => {
    const world = buildScenario({ seed: 99 });
    const rng = world.rngFor('poisson-gate');
    const LAMBDA = 3.7;
    const DRAWS = 20000;
    const sample = Array.from({ length: DRAWS }, () => rng.poisson(LAMBDA));

    const m = mean(sample);
    const v = variance(sample);
    expect(m).toBeCloseTo(LAMBDA, 1);
    // The defining property, held to within 15% on twenty thousand draws.
    expect(v / m).toBeGreaterThan(0.85);
    expect(v / m).toBeLessThan(1.15);
    // And it is genuinely discrete and occasionally silent — a rounded
    // continuous distribution would never return zero at this rate.
    expect(sample.some((x) => x === 0)).toBe(true);
  });

  describe('and the shop that draws from it is bursty, not metronomic', () => {
    const world = buildScenario({ seed: 99 });
    const sample: number[] = [];
    let last = 0;

    for (let day = 0; day < 140; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const slot = world.clock.dayOfWeek === 4 && Math.floor(world.clock.hourOfDay) === 19;
        world.runTicks(TICKS_PER_GAME_HOUR);
        // Count everyone who turned up, including the ones who took one look at
        // the queue and left. Counting only those who stayed measures arrivals
        // MINUS balking, which is under-dispersed by construction.
        const arrived = world.state.counters.customer + world.state.balked - last;
        last = world.state.counters.customer + world.state.balked;
        if (slot) sample.push(arrived);
      }
    }

    it('is over-dispersed relative to a metronome', () => {
      const m = mean(sample);
      const v = variance(sample);
      expect(sample.length).toBeGreaterThan(15);
      expect(m).toBeGreaterThan(0);
      // A uniform "one every N ticks" arrival sits near zero here and the
      // kitchen never struggles. The upper bound is deliberately absent — see
      // the note above; over-dispersion is what a moving rate produces, and
      // clamping it would be a gate on the economy holding still.
      expect(v / m).toBeGreaterThan(0.5);
    });

    it('produces bursts — some hours land far above the mean', () => {
      expect(Math.max(...sample)).toBeGreaterThan(mean(sample) * 1.15);
    });
  });
});
