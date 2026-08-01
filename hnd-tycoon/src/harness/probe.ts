/**
 * Measurement helpers shared by the tests, the CLI probes and the balance
 * harness. DESIGN.md §25.2.
 *
 * Everything here averages over several seeds. A single-seed comparison of two
 * kitchens is worthless and worse than worthless — Poisson arrivals are bursty
 * enough that one seed will happily report the wrong sign, twice in a row,
 * convincingly.
 */
import { buildScenario, type ScenarioOptions } from '@/sim/scenario';
import { meanWaitMinutes } from '@/sim/systems/service';
import type { PlacedStation } from '@/config/layouts';

const NONE = 0;
const ONE = 1;

export interface RunSummary {
  readonly arrived: number;
  readonly covers: number;
  readonly meanWaitMinutes: number;
  readonly batches: number;
  readonly openAtEnd: number;
  readonly coversPerDay: readonly number[];
}

export function runOnce(opts: ScenarioOptions & { days: number }): RunSummary {
  const world = buildScenario(opts);
  world.runDays(opts.days);

  let arrived = NONE;
  let covers = NONE;
  let batches = NONE;
  const coversPerDay: number[] = [];
  for (const report of world.dayReports) {
    arrived += Number(report.lines['arrived'] ?? NONE);
    const dayCovers = Number(report.lines['covers'] ?? NONE);
    covers += dayCovers;
    batches += Number(report.lines['batches'] ?? NONE);
    coversPerDay.push(dayCovers);
  }

  // Recomputed across the whole run rather than averaging the daily means,
  // which would weight a quiet Monday the same as a slammed Saturday.
  let waitTicks = NONE;
  let served = NONE;
  for (const order of world.state.orders.values()) {
    if (order.state === 'served' && order.servedAt !== null) {
      waitTicks += order.servedAt - order.placedAt;
      served += ONE;
    }
  }

  return {
    arrived,
    covers,
    meanWaitMinutes: meanWaitMinutes(waitTicks, served),
    batches,
    openAtEnd: world.state.openOrders.length,
    coversPerDay,
  };
}

/** Mean of a metric across seeds. The only honest way to compare two kitchens. */
export function runSeeds(
  opts: Omit<ScenarioOptions, 'seed'> & { days: number },
  seeds: readonly number[],
): RunSummary[] {
  return seeds.map((seed) => runOnce({ ...opts, seed }));
}

export const mean = (xs: readonly number[]): number =>
  xs.length === NONE ? NONE : xs.reduce((a, b) => a + b, NONE) / xs.length;

export const variance = (xs: readonly number[]): number => {
  if (xs.length < ONE) return NONE;
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
};

/** A layout with every station's speed multiplied, positions untouched. */
export function scaledLine(
  line: readonly PlacedStation[],
  factor: number,
): readonly PlacedStation[] {
  return line.map((s) => ({ ...s, speedMultiplier: (s.speedMultiplier ?? 1) * factor }));
}

export const SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];
