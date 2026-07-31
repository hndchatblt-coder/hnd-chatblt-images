/**
 * How the kitchen behaves as a factory (§4.7).
 *
 * Buffers and freshness are the Factorio buffer-chest tension: holding stock ahead of a rush is
 * the correct play right up until it isn't.
 */
export const kitchen = {
  /** Seconds from the end of the freshness window to worthless. */
  decaySeconds: 900,
  /** Below this quality an item is binned rather than served. */
  binBelowQuality: 0.35,
  /** Open orders at which the kitchen feels fully slammed, for the error rush factor. */
  rushOrdersForFullPressure: 24,
  /** However bad it gets, most food still comes out right. */
  maxErrorRate: 0.22,

  /** Safety rail on the DAG walk — recipes are shallow and always will be. */
  maxDagDepth: 8,
  /**
   * What a binned unit cost to make, for the waste line on the P&L. Keyed by the item the step
   * produced. Rough by design — this is a reporting figure, not an accounting one.
   */
  wasteValuePerUnit: {
    patty: 2.35,
    bun: 0.85,
    garnish: 0.36,
    burger: 3.98,
    cheeseburger: 3.98,
    chipsCooked: 1.05,
    chips: 1.05,
  } as Record<string, number>,
} as const;
