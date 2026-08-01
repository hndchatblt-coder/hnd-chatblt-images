/**
 * Demand and arrivals. DESIGN.md §6.1.
 *
 * The full demand formula multiplies foot traffic by daypart, day-of-week,
 * reputation, marketing, specials, price resistance and competitor pressure.
 * Step 2 runs the first term only — a flat Poisson rate — so that covers and
 * wait can be read without six curves confounding them. Every later term gets
 * added here as its own multiplier, and `competitorPressure` is present from
 * step 10 pinned at zero because adding it to a shipped economy would require
 * rebalancing everything.
 *
 * Arrivals are Poisson, not evenly spaced. Bursty by design: the difference
 * between fourteen customers an hour and fourteen customers in four minutes is
 * the entire game.
 */

export interface MenuMixEntry {
  readonly recipeId: string;
  /** Relative weight. Normalised at use, so these need not sum to 1. */
  readonly weight: number;
  /** Items of this recipe a single customer orders. */
  readonly quantity: number;
}

/**
 * A demand spike. Step 10 replaces this with the real daypart and day-of-week
 * curves from §6.1; until then it exists so that "par-cooking ahead of a rush"
 * is something the harness can actually stage.
 */
export interface RushWindow {
  /** Inclusive start hour of the trading day. */
  readonly fromHour: number;
  /** Exclusive end hour. */
  readonly toHour: number;
  readonly multiplier: number;
}

/**
 * §6.1's daypart and day-of-week curves.
 *
 * These are not decoration and they should not have waited for step 10. A flat
 * arrival rate is the reason hiring could not pay for itself: at a constant 14
 * customers an hour one cook is never stretched, so a second one is pure cost.
 *
 * **Hospitality staffs for the peak, not the average.** That is the whole
 * decision. Twelve to two and six to eight you are underwater; three in the
 * afternoon you are paying someone to wipe down a bench they already wiped.
 * Averaging those two states into one flat number deleted both.
 *
 * Multipliers are relative and normalised to mean 1.0 across trading hours, so
 * changing the shape never silently changes total demand.
 */
export const DAYPART: Readonly<Record<number, number>> = {
  11: 0.25,
  12: 2.3,
  13: 2.6,
  14: 0.8,
  15: 0.25,
  16: 0.2,
  17: 0.5,
  18: 2.4,
  19: 2.9,
  20: 1.6,
  21: 0.5,
};

/** Friday and Saturday carry a burger shop. Monday is a rumour. */
export const DAY_OF_WEEK: readonly number[] = [
  0.95, // Sun
  0.7, // Mon
  0.8, // Tue
  0.85, // Wed
  1.0, // Thu
  1.35, // Fri
  1.5, // Sat
];

const DAYPART_MEAN =
  Object.values(DAYPART).reduce((a, b) => a + b, 0) / Object.values(DAYPART).length;

/** The curve at a given hour, normalised so the shape never moves the total. */
export function daypartMultiplier(hourOfDay: number): number {
  return (DAYPART[Math.floor(hourOfDay)] ?? 0) / DAYPART_MEAN;
}

export function dayOfWeekMultiplier(dayOfWeek: number): number {
  return DAY_OF_WEEK[dayOfWeek] ?? 1;
}

export const DEMAND = {
  /**
   * Step 2 only: overrides the site's own foot traffic so the baseline run is
   * reproducible independent of which site is loaded. Removed at step 10 when
   * the real formula lands.
   */
  FLAT_RATE_OVERRIDE: null as number | null,

  /**
   * What a customer walks in wanting. One item each until archetypes arrive
   * (§6.2) and the table of six starts producing dread.
   */
  MENU_MIX: [
    { recipeId: 'cheeseburger', weight: 0.7, quantity: 1 },
    { recipeId: 'chips', weight: 0.3, quantity: 1 },
  ] as readonly MenuMixEntry[],

  /** The rush the step 4 gate cooks ahead of. Two hours at triple rate. */
  TEST_RUSH: { fromHour: 18, toHour: 20, multiplier: 3 } as RushWindow,

  /**
   * §6.3. Balking is what makes speed worth money.
   *
   *   estWait = queueLength * currentAvgServiceTime
   *   pBalk   = clamp((estWait - patience) / patienceWindow, 0, 0.95)
   *
   * Without it 100% of arrivals convert at any load below ~150/hr — measured —
   * so revenue was byte-identical with one staffer or three, and every item in
   * the shop was negative expected value. This is the single term that makes
   * the rest of the game mean anything.
   *
   * "Balk rate is a headline HUD stat — it must move before reputation does."
   */
  BALK: {
    /**
     * Minutes of visible queue a customer will join without thinking about it.
     *
     * NOT §7.4's six-minute satisfaction grace — that is how long someone who
     * has already ordered will wait before minding. This is the shorter,
     * harsher decision made on the footpath before they commit to anything, and
     * four minutes of people ahead of you is about where a burger stops being
     * worth it on a Saturday. PROVISIONAL.
     */
    patienceMinutes: 4,
    /** Minutes beyond patience over which the odds run from 0 to the cap. */
    patienceWindowMinutes: 14,
    /** Never certain. Somebody always chances it. */
    maxProbability: 0.95,
    /**
     * Seconds of service per person already queueing, PER STAFF MEMBER on the
     * floor — a customer judges the queue by how fast it is moving, and it
     * moves faster with more hands.
     *
     * This division is the causal chain the whole economy hangs off: more
     * staff -> the queue moves faster -> fewer people balk -> more revenue.
     * Without it, hiring cannot pay for itself at any demand rate, which is
     * precisely what the audit measured.
     *
     * 60s is the shop's own measured labour cost per cover.
     */
    secondsPerQueuedPersonPerStaff: 60,
  },
} as const;
