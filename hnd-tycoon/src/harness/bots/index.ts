/**
 * The bot registry and the runner. DESIGN.md §25.2.
 *
 * All five of §25.2's bots exist as of step 12. The important property is that
 * NONE of them dominates — `tightarse` and `roboboss` must both land within 25%
 * of `balanced`, or the equipment ladder is either mandatory or decorative.
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
import { balanced } from './balanced';
import { roboboss } from './roboboss';
import { tightarse } from './tightarse';
import { idle } from './idle';
import { naive } from './naive';

export const BOTS: readonly Bot[] = [naive, balanced, tightarse, roboboss, idle];

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

/**
 * Play as one bot, then hand the same shop to another. §10, and step 11's exit
 * criterion: *"`bot:naive` recovers when switched to balanced by ~day 55."*
 *
 * One World throughout — the whole point is that the second bot inherits the
 * first one's wreckage, its reviews, its overdraft and its broken fryer. A
 * fresh start would prove nothing at all.
 */
export function runHandover(
  first: Bot,
  second: Bot,
  seed: number,
  switchOnDay: number,
  days: number,
): BotRun {
  const world = buildScenario({ seed });
  const samples: BotDay[] = [];
  world.runDays(1);
  for (let day = 1; day < days; day++) {
    (day < switchOnDay ? first : second).onSession(world);
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
  return { bot: `${first.name}->${second.name}`, days: samples };
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
