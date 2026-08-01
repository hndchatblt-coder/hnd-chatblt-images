/**
 * What people thought. DESIGN.md §7.4, §6.5.
 *
 * Satisfaction is the product of three scores, so a shop that is fast and
 * accurate but serving stale food is not "mostly fine" — it is bad. Multiplying
 * rather than averaging is what stops one good dimension covering for a bad one.
 *
 * Reviews are **angry-skewed**: 7% of happy customers leave one and 30% of
 * unhappy ones do. That asymmetry is the entire reason a bad week hurts for
 * longer than it lasted, and it is why the recovery in §10 has to be designed
 * rather than assumed.
 *
 * §6.5: reputation is a keyed map. `dineIn` is the only channel today and
 * `delivery` is a config line, not a refactor.
 */
import { REPUTATION } from '@/config/reputation';
import { TIME } from '@/config/time';
import { GAME_SECONDS_PER_TICK } from '../clock';
import { orderQuality, type Order } from '../entities/order';
import type { SimState } from '../state';
import type { System, World } from '../world';

const NONE = 0;
const ONE = 1;

export interface Review {
  readonly channel: string;
  readonly stars: number;
  /** Game day it was left. Recency weighting is measured against this. */
  readonly day: number;
}

/** §7.4, exactly as written. */
export function waitScore(waitMinutes: number): number {
  const over = waitMinutes - REPUTATION.WAIT_GRACE_MINUTES;
  if (over <= NONE) return ONE;
  return Math.max(NONE, ONE - over / REPUTATION.WAIT_TOLERANCE_MINUTES);
}

export function satisfactionOf(waitMinutes: number, quality: number, accuracy = ONE): number {
  return waitScore(waitMinutes) * quality * accuracy;
}

/** §7.4: stars = clamp(round(1 + satisfaction * 4), 1, 5). */
export function starsFor(satisfaction: number): number {
  const raw = Math.round(REPUTATION.MIN_STARS + satisfaction * (REPUTATION.MAX_STARS - ONE));
  return Math.max(REPUTATION.MIN_STARS, Math.min(REPUTATION.MAX_STARS, raw));
}

/** §7.4: the angry skew. Unhappy customers are four times as likely to speak. */
export function reviewChance(satisfaction: number): number {
  if (satisfaction >= REPUTATION.HAPPY_THRESHOLD) return REPUTATION.REVIEW_RATE_HAPPY;
  if (satisfaction < REPUTATION.ANGRY_THRESHOLD) return REPUTATION.REVIEW_RATE_ANGRY;
  return (REPUTATION.REVIEW_RATE_HAPPY + REPUTATION.REVIEW_RATE_ANGRY) / 2;
}

/**
 * Recency-weighted mean of the last 250 reviews, half-life ten game days,
 * against a 3.8-star prior at the weight of fifteen reviews.
 *
 * The prior is what stops the first angry customer of a new shop reading as a
 * one-star business, and the half-life is what lets a bad week be survivable.
 */
export function starsOf(reviews: readonly Review[], today: number, channel?: string): number {
  let weighted = REPUTATION.PRIOR_STARS * REPUTATION.PRIOR_WEIGHT;
  let weight = REPUTATION.PRIOR_WEIGHT;
  // Per channel, or all of them. Ignoring the channel is right by accident
  // while there is only one, and silently wrong the day delivery lands.
  const scoped = channel === undefined ? reviews : reviews.filter((r) => r.channel === channel);
  const recent = scoped.slice(-REPUTATION.WINDOW);
  for (const review of recent) {
    const age = Math.max(NONE, today - review.day);
    const w = Math.exp(-Math.LN2 * (age / REPUTATION.HALF_LIFE_DAYS));
    weighted += review.stars * w;
    weight += w;
  }
  return weight > NONE ? weighted / weight : REPUTATION.PRIOR_STARS;
}

export class ReputationSystem implements System {
  readonly name = 'reputation';

  onClose(world: World): void {
    const state = world.state;
    for (const channel of REPUTATION.CHANNELS) {
      world.record(
        `stars:${channel}`,
        starsOf(state.reviews, world.clock.dayIndex, channel).toFixed(2),
      );
    }
    // Only the window is ever read. Keeping every review a shop has had makes
    // the save file grow forever — 3,613 in forty days, of which 250 matter.
    if (state.reviews.length > REPUTATION.WINDOW * 2) {
      state.reviews.splice(0, state.reviews.length - REPUTATION.WINDOW);
    }
    world.record('reviews', state.day.reviews);
  }
}

/**
 * Called by the service system the moment food is handed over — reputation is
 * about the experience, and the experience ends at the counter.
 */
export function reviewServedOrder(state: SimState, order: Order, now: number): void {
  const waitMinutes =
    ((now - order.placedAt) * GAME_SECONDS_PER_TICK) / TIME.SECONDS_PER_MINUTE;
  const satisfaction = satisfactionOf(waitMinutes, orderQuality(order));
  state.day.satisfactionSum += satisfaction;
  state.day.satisfactionCount += ONE;

  if (!state.rng.bool(reviewChance(satisfaction))) return;
  state.reviews.push({
    channel: 'dineIn',
    stars: starsFor(satisfaction),
    day: state.dayIndex,
  });
  state.day.reviews += ONE;
}

/** §6.3: "6% chance of a two-star 'walked out, too busy' review." */
export function reviewBalk(state: SimState): void {
  if (!state.rng.bool(REPUTATION.BALK_REVIEW_CHANCE)) return;
  state.reviews.push({
    channel: 'dineIn',
    stars: REPUTATION.BALK_STARS,
    day: state.dayIndex,
  });
  state.day.reviews += ONE;
}
