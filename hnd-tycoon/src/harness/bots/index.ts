/**
 * The bot registry and the runner. DESIGN.md §25.2.
 *
 * SCOPE: `naive` and `idle` exist because step 10 gates on them. The other
 * three — balanced, tightarse, roboboss — need verbs the game does not have
 * yet (automation is step 12), and a bot that pretends to automate would make
 * step 12's "neither strategy may dominate" gate unfalsifiable.
 *
 * The §25.2 session model (three 8-minute sessions a day, offline accrual at
 * 75% behind the §5.2 caps) is NOT applied here yet either. It lands with
 * offline accrual at step 20. Until then a bot decides once per game day, which
 * is a more attentive player than the real pattern, so any spiral measured here
 * is a LOWER bound on how bad it gets. Said plainly so nobody reads these
 * numbers as the tuned ones.
 */
import { buildScenario } from '@/sim/scenario';
import type { Bot } from '../bot';
import { idle } from './idle';
import { naive } from './naive';

export const BOTS: readonly Bot[] = [naive, idle];

export interface BotDay {
  readonly day: number;
  readonly cashCents: number;
  readonly stars: number;
  readonly covers: number;
  readonly balked: number;
  readonly marketingCents: number;
}

export interface BotRun {
  readonly bot: string;
  readonly days: readonly BotDay[];
}

/** Run one bot for `days` game days, sampling the shop at each day's close. */
export function runBot(bot: Bot, seed: number, days: number): BotRun {
  const world = buildScenario({ seed });
  const samples: BotDay[] = [];
  // Day one is the shop as handed over. Every bot gets the same start.
  world.runDays(1);
  for (let day = 1; day < days; day++) {
    bot.onSession(world);
    world.runDays(1);
    samples.push({
      day,
      cashCents: world.state.ledger.cash.cents,
      stars: world.state.stars,
      covers: world.state.day.served,
      balked: world.state.day.balked,
      marketingCents: world.state.ledger.total('marketing').cents,
    });
  }
  return { bot: bot.name, days: samples };
}

/** Mean of a metric over the last `n` days of a run. */
export function tail(run: BotRun, n: number, pick: (d: BotDay) => number): number {
  const slice = run.days.slice(-n);
  if (slice.length === 0) return 0;
  return slice.reduce((a, d) => a + pick(d), 0) / slice.length;
}

/** Mean of a metric over the first `n` days of a run. */
export function head(run: BotRun, n: number, pick: (d: BotDay) => number): number {
  const slice = run.days.slice(0, n);
  if (slice.length === 0) return 0;
  return slice.reduce((a, d) => a + pick(d), 0) / slice.length;
}
