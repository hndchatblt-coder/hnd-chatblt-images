/**
 * The whole of §6.1, in one place.
 *
 *   demandRate(t) =
 *       baseFootTraffic[venue]
 *     * daypartCurve(t)
 *     * dayOfWeekCurve(day)
 *     * reputationMultiplier(dineInRep)
 *     * (1 + marketingAwareness)
 *     * (1 + specialUplift(t))
 *     * (1 - priceResistance)
 *     * (1 - competitorPressure)   // 0 until Act III
 *
 * Every term is present, including the two that do nothing yet. §6.1 is
 * explicit about why: *"competitorPressure is present in the formula from M3
 * and pinned at zero. Adding it later to a shipped economy would require
 * rebalancing everything."* The same argument applies to specials.
 */
import { MARKETING, MARKETING_CHANNELS, PRICING } from '@/config/marketing';
import { REPUTATION } from '@/config/reputation';
import { REPORT } from '@/config/report';
import { daypartMultiplier, dayOfWeekMultiplier, REPUTATION_DEMAND } from '@/config/demand';
import { Cash, money, ZERO, type Money } from '../types';
import type { SimState } from '../state';
import type { System, World } from '../world';

const NONE = 0;
const ONE = 1;

/**
 * §6.1: `0.35 + 1.15 * (rep / 5) ^ 1.6`.
 *
 * The gap between 4.2 and 4.6 stars is worth real money — that is the whole
 * point of the exponent, and it is what makes reputation an economic asset
 * rather than a score.
 */
export function reputationMultiplier(stars: number): number {
  return (
    REPUTATION_DEMAND.FLOOR +
    REPUTATION_DEMAND.RANGE *
      Math.pow(stars / REPUTATION.MAX_STARS, REPUTATION_DEMAND.EXPONENT)
  );
}

/** §8.2: what a shop at this rating can credibly charge. */
export function fairPriceMultiplier(stars: number): number {
  return (
    PRICING.FAIR_PRICE_AT_PRIOR +
    (stars - REPUTATION.PRIOR_STARS) * PRICING.FAIR_PRICE_PER_STAR
  );
}

/** §8.2: the band to show beside the price input, as a range. */
export function fairPriceBand(stars: number): { low: number; high: number } {
  const fair = fairPriceMultiplier(stars);
  return { low: fair - PRICING.FAIR_BAND, high: fair + PRICING.FAIR_BAND };
}

/** §6.1: `clamp((menuPrice / fairPrice - 1) * elasticity, 0, 0.8)`. */
export function priceResistance(priceMultiplier: number, stars: number): number {
  const fair = fairPriceMultiplier(stars);
  const over = priceMultiplier / fair - ONE;
  return Math.max(NONE, Math.min(PRICING.MAX_RESISTANCE, over * PRICING.ELASTICITY));
}

/**
 * §8.3: a bad shop pays more per customer. Efficiency scales with reputation,
 * so marketing a two-star shop is bad money after bad — and the panel shows
 * cost-per-cover so the player can watch it happen.
 */
export function marketingEfficiency(stars: number): number {
  const t = (stars - REPUTATION.MIN_STARS) / (REPUTATION.MAX_STARS - REPUTATION.MIN_STARS);
  return (
    MARKETING.EFFICIENCY_AT_ONE_STAR +
    (MARKETING.EFFICIENCY_AT_FIVE_STARS - MARKETING.EFFICIENCY_AT_ONE_STAR) * t
  );
}

/** Everything except the clock. Multiplied onto the base rate by arrivals. */
export function demandMultiplier(state: SimState, stars: number): number {
  return (
    reputationMultiplier(stars) *
    (ONE + state.marketingAwareness) *
    (ONE + state.specialUplift) *
    (ONE - priceResistance(state.priceMultiplier, stars)) *
    (ONE - state.competitorPressure)
  );
}

/** The full §6.1 rate at a moment in time. */
export function demandRate(state: SimState, stars: number, hour: number, day: number): number {
  return (
    state.site.baseFootTraffic *
    daypartMultiplier(hour) *
    dayOfWeekMultiplier(day) *
    demandMultiplier(state, stars)
  );
}

export class DemandSystem implements System {
  readonly name = 'demand';

  /**
   * Marketing spend lands weekly with payroll (§8.3 — "the Sunday bill is
   * labour plus marketing, two decisions arriving as one number"), and
   * awareness decays daily.
   */
  onDayEnd(world: World): void {
    const state = world.state;
    for (const channel of MARKETING_CHANNELS) {
      const spend = state.marketingSpend[channel.id] ?? NONE;
      if (spend > NONE) {
        state.channelAwareness[channel.id] =
          (state.channelAwareness[channel.id] ?? NONE) +
          spend * channel.potency * marketingEfficiency(state.stars);
      }
      state.channelAwareness[channel.id] =
        (state.channelAwareness[channel.id] ?? NONE) * (ONE - channel.decayPerDay);
    }

    let total = NONE;
    for (const channel of MARKETING_CHANNELS) {
      total += state.channelAwareness[channel.id] ?? NONE;
    }
    state.marketingAwareness = Math.min(
      MARKETING.MAX_AWARENESS,
      total * (ONE - MARKETING.GLOBAL_DECAY_PER_DAY),
    );

    // §8.2: a price change takes effect the next trading day.
    if (state.pendingPriceMultiplier !== null) {
      state.priceMultiplier = state.pendingPriceMultiplier;
      state.pendingPriceMultiplier = null;
    }
  }

  onPayroll(world: World): void {
    const state = world.state;
    const weekly = weeklyMarketing(state);
    if (weekly > NONE) {
      state.ledger.post('marketing', money(weekly, state.ledger.cash.currency));
    }
  }

  onClose(world: World): void {
    const state = world.state;
    world.record('awareness', state.marketingAwareness.toFixed(REPORT.RATIO_DECIMALS));
    world.record('price', `${Math.round(state.priceMultiplier * 100)}%`);
    world.record('costPerCover', Cash.format(costPerCover(state, world.clock.daysPerWeek)));
  }
}

/** Total weekly marketing commitment, in dollars. */
export function weeklyMarketing(state: SimState): number {
  let weekly = NONE;
  for (const channel of MARKETING_CHANNELS) weekly += state.marketingSpend[channel.id] ?? NONE;
  return weekly;
}

/**
 * §8.3: *"the panel must show cost-per-cover so the player can see it
 * happening."* Today's share of the weekly bill, over today's covers.
 *
 * This is the number that makes over-marketing legible. A four-star shop turns
 * $60 a day into forty extra covers; a two-star shop turns the same $60 into
 * twelve, and eight of those walk out before they order. The spend line looks
 * identical in both cases. This one does not.
 */
export function costPerCover(state: SimState, daysPerWeek: number): Money {
  const covers = state.day.served;
  const currency = state.ledger.cash.currency;
  if (covers <= NONE || daysPerWeek <= NONE) return ZERO(currency);
  return money(weeklyMarketing(state) / daysPerWeek / covers, currency);
}
