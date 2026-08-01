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
    /** Minutes a customer will wait without minding. */
    patienceMinutes: 6,
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
