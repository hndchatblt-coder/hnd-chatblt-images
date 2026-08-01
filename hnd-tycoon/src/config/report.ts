/**
 * How the day report is shaped. DESIGN.md §15.2, §25.3.
 *
 * The console report is the only view of the game until step 5, and it stays
 * the harness's view forever. Its numbers are the ones balance decisions get
 * made from, so how they are rounded is a real choice and belongs in config
 * rather than sprinkled through the systems that emit them.
 */
export const REPORT = {
  /** Decimal places on reported minutes. One is enough to see a trend. */
  MINUTE_DECIMALS: 1,
  /** Decimal places on reported percentages. */
  PERCENT_DECIMALS: 1,
} as const;
