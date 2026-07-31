/**
 * Demand: who walks in, and when (§4.2, §4.3).
 *
 * Arrivals are Poisson on a rate that is the product of several curves. The curves are separate
 * on purpose — daypart, day-of-week and reputation each need to be legible and tunable alone.
 */
export const demand = {
  /**
   * Customers per game hour at the flat baseline, before any curve. Per-venue multipliers in
   * venues.ts scale this.
   */
  baseFootTraffic: 34,

  /**
   * Trade by hour of day, indexed 0-23. Lunch 12:00-14:00, dinner 18:00-20:30. Zero outside
   * trading hours — the shape of a burger bar's day, not a smooth curve.
   */
  daypart: [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0.35, 1.0, 1.15, 0.7, 0.4, 0.35, 0.55, 1.1, 1.25, 0.95, 0.5, 0.2, 0,
  ] as readonly number[],

  /** Sunday-first. Friday and Saturday carry the week; Monday is a rumour. */
  dayOfWeek: [0.95, 0.6, 0.7, 0.8, 0.9, 1.5, 1.55] as readonly number[],

  /**
   * reputationMultiplier(rep) = floor + span * (rep/5)^exponent.
   *
   * The exponent is the whole point: it makes the gap between 4.2 and 4.6 stars worth real
   * money, so reputation is a lever rather than a status bar.
   */
  reputation: { floor: 0.35, span: 1.15, exponent: 1.6, min: 1, max: 5 },

  /** How hard a customer looks at the queue before deciding it isn't worth it. */
  balk: {
    /** Minutes of estimated wait a customer will accept without flinching. */
    patienceMinutes: 7,
    /** Minutes beyond patience over which balk probability climbs to its ceiling. */
    patienceWindowMinutes: 9,
    maxProbability: 0.95,
    /** A walkout leaves a review this often. Rare, but it is the first sign of over-marketing. */
    reviewChance: 0.06,
    reviewStars: 2,
    /** Patience varies person to person. Drawn uniformly across this band on arrival. */
    patienceVariance: { min: 0.75, max: 1.25 },
  },

  /**
   * Marketing awareness decays this much each day (§4.9). Money in today, customers tomorrow —
   * and gone by the weekend if you stop.
   */
  marketingDecayPerDay: 0.12,

  /** Price elasticity — premium prices on a mediocre reputation lose customers (§4.2). */
  price: { elasticity: 1.4, maxResistance: 0.8, fairPriceAtFiveStars: 19, fairPriceAtOneStar: 9 },
} as const;
