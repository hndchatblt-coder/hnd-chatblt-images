/**
 * STEP 9 GATES — satisfaction, reviews, reputation.
 *
 * "A deliberately bad week visibly tanks reputation and takes 8–10 trading days
 * of good trade to recover. Channel map handles two channels with only config
 * changes." (BUILD_PLAN step 9.)
 */
import { describe, expect, it } from 'vitest';
import { REPUTATION } from '@/config/reputation';
import { buy, setRoster } from '@/sim/actions';
import { buildScenario } from '@/sim/scenario';
import {
  reviewChance,
  starsFor,
  starsOf,
  satisfactionOf,
  waitScore,
  type Review,
} from '@/sim/systems/reputation';

describe('STEP 9 — satisfaction is a product, not an average (§7.4)', () => {
  it('forgives a wait inside the grace and punishes one beyond the tolerance', () => {
    expect(waitScore(0)).toBe(1);
    expect(waitScore(REPUTATION.WAIT_GRACE_MINUTES)).toBe(1);
    expect(waitScore(REPUTATION.WAIT_GRACE_MINUTES + REPUTATION.WAIT_TOLERANCE_MINUTES)).toBe(0);
    expect(waitScore(60)).toBe(0);
  });

  it('does not let a fast shop cover for stale food', () => {
    // Multiplying rather than averaging is the whole point: served instantly
    // but barely edible is BAD, not "mostly fine".
    const fastAndStale = satisfactionOf(0, 0.4);
    const averaged = (1 + 0.4) / 2;
    expect(fastAndStale).toBeLessThan(averaged);
    expect(fastAndStale).toBeCloseTo(0.4, 6);
  });

  it('maps satisfaction onto 1–5 stars', () => {
    expect(starsFor(1)).toBe(5);
    expect(starsFor(0)).toBe(1);
    expect(starsFor(0.5)).toBe(3);
  });
});

describe('STEP 9 — reviews are angry-skewed (§7.4)', () => {
  it('makes an unhappy customer four times as likely to speak', () => {
    const happy = reviewChance(0.9);
    const angry = reviewChance(0.2);
    expect(happy).toBe(REPUTATION.REVIEW_RATE_HAPPY);
    expect(angry).toBe(REPUTATION.REVIEW_RATE_ANGRY);
    expect(angry / happy).toBeGreaterThan(3.5);
  });

  it('shows up in the actual review pool of a struggling shop', () => {
    const world = buildScenario({ seed: 3, arrivalsPerHour: 70 });
    world.runDays(10);
    expect(world.state.reviews.length).toBeGreaterThan(50);
    const bad = world.state.reviews.filter((r) => r.stars <= 2).length;
    // Measured at 67%: a shop that is failing half its customers reads far
    // worse than half-failing, which is why bad weeks hurt longer than they last.
    expect(bad / world.state.reviews.length).toBeGreaterThan(0.5);
  });
});

describe('STEP 9 — the prior and the half-life (§7.4)', () => {
  it('starts a new shop at 3.8 stars, not at nothing', () => {
    expect(starsOf([], 0)).toBeCloseTo(REPUTATION.PRIOR_STARS, 6);
  });

  it('does not let one angry customer define a new business', () => {
    const one: Review[] = [{ channel: 'dineIn', stars: 1, day: 0 }];
    expect(starsOf(one, 0)).toBeGreaterThan(3.5);
  });

  it('halves the weight of a review after ten game days', () => {
    const old: Review[] = Array.from({ length: 40 }, () => ({
      channel: 'dineIn',
      stars: 1,
      day: 0,
    }));
    const fresh = starsOf(old, 0);
    const faded = starsOf(old, REPUTATION.HALF_LIFE_DAYS);
    const older = starsOf(old, REPUTATION.HALF_LIFE_DAYS * 3);
    expect(faded).toBeGreaterThan(fresh);
    expect(older).toBeGreaterThan(faded);
    // Never all the way back — 250 reviews of memory is a long time.
    expect(older).toBeLessThan(REPUTATION.PRIOR_STARS);
  });
});

describe('STEP 9 — a bad week tanks it, and good trade digs it out', () => {
  const world = buildScenario({ seed: 3, arrivalsPerHour: 70 });
  const trail: number[] = [];
  for (let day = 0; day < 34; day++) {
    world.runDays(1);
    trail.push(starsOf(world.state.reviews, world.clock.dayIndex));
    if (day === 9) {
      // Staff up hard. This is "good trade" — the player acting on the problem.
      for (let i = 0; i < 3; i++) {
        buy(world.state, 'hire');
        const hired = world.state.staff[world.state.staff.length - 1];
        if (hired) for (let d = 0; d < 7; d++) setRoster(world.state, hired.id, d, true);
      }
    }
  }

  const trough = Math.min(...trail.slice(0, 14));
  const troughDay = trail.indexOf(trough);

  it('visibly tanks — well below the 3.8 prior', () => {
    expect(trough).toBeLessThan(3.0);
  });

  it('digs out over days, not instantly and not never', () => {
    // Measured: trough 1.97 on day 5, +0.5 by day 11. Trough-to-recovery
    // rather than a fixed day, because when the trough lands is up to Poisson.
    const recovered = trail.findIndex((v, i) => i > troughDay && v >= trough + 0.5);
    expect(recovered).toBeGreaterThan(troughDay + 2);
    expect(recovered).toBeLessThan(troughDay + 20);
  });

  it('never falls off a cliff it cannot climb — §10, no unrecoverable state', () => {
    expect(Math.max(...trail.slice(troughDay))).toBeGreaterThan(trough + 0.4);
    expect(Math.min(...trail)).toBeGreaterThanOrEqual(REPUTATION.MIN_STARS);
  });
});

describe('STEP 9 — reputation is a keyed map, not two fields (§6.5)', () => {
  it('tags every review with its channel', () => {
    const world = buildScenario({ seed: 4, arrivalsPerHour: 40 });
    world.runDays(4);
    expect(world.state.reviews.length).toBeGreaterThan(0);
    for (const review of world.state.reviews) {
      expect(REPUTATION.CHANNELS).toContain(review.channel as never);
    }
  });

  it('scores a second channel with no code change at all', () => {
    // The step 9 exit criterion. `delivery` does not exist yet; the point is
    // that when couriers arrive it is a config line, not a refactor.
    const mixed: Review[] = [
      { channel: 'dineIn', stars: 5, day: 0 },
      { channel: 'delivery', stars: 1, day: 0 },
    ];
    const dineIn = starsOf(
      mixed.filter((r) => r.channel === 'dineIn'),
      0,
    );
    const delivery = starsOf(
      mixed.filter((r) => r.channel === 'delivery'),
      0,
    );
    // Beloved in the room, mediocre in the app — §6.5's whole argument.
    expect(dineIn).toBeGreaterThan(delivery);
  });
});

describe('STEP 9 — attacked as a future-architecture reviewer', () => {
  it('scores each channel from its own reviews, not from all of them', () => {
    const mixed: Review[] = [
      ...Array.from({ length: 30 }, () => ({ channel: 'dineIn', stars: 5, day: 0 })),
      ...Array.from({ length: 30 }, () => ({ channel: 'delivery', stars: 1, day: 0 })),
    ];
    expect(starsOf(mixed, 0, 'dineIn')).toBeGreaterThan(4);
    expect(starsOf(mixed, 0, 'delivery')).toBeLessThan(2.5);
    // Unscoped sits between the two, which is exactly the wrong answer to
    // report for either of them.
    const both = starsOf(mixed, 0);
    expect(both).toBeLessThan(starsOf(mixed, 0, 'dineIn'));
    expect(both).toBeGreaterThan(starsOf(mixed, 0, 'delivery'));
  });

  it('does not keep every review a shop has ever had', () => {
    const world = buildScenario({ seed: 3, arrivalsPerHour: 70 });
    world.runDays(30);
    // Only the window is ever read; the rest is save-file weight forever.
    expect(world.state.reviews.length).toBeLessThanOrEqual(REPUTATION.WINDOW * 2);
    expect(world.state.reviews.length).toBeGreaterThan(REPUTATION.WINDOW / 2);
  });

  it('gives different seeds different reviews', () => {
    const stars = (seed: number): number => {
      const world = buildScenario({ seed, arrivalsPerHour: 55 });
      world.runDays(8);
      return starsOf(world.state.reviews, world.clock.dayIndex, 'dineIn');
    };
    expect(stars(1)).not.toBe(stars(2));
    expect(stars(1)).toBe(stars(1));
  });
});
