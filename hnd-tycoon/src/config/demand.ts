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
} as const;
