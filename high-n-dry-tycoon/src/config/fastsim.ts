/**
 * Constants the closed-form model needs that the agent sim derives from behaviour (§7.1).
 *
 * Every one of these is a place the fast sim could drift from the full sim, so they are together,
 * named, and covered by the 5% gate.
 */
export const fastsim = {
  assumedStartingSkill: 0.7,
  minSkill: 0.2,
  /**
   * Trips charged per step: one to reach the station, one to carry the output on. Fractional
   * because a staffer running consecutive batches at the same station only pays the approach
   * once — charging a clean 2.0 understated capacity by 7.5%.
   */
  tripsPerStep: 1.55,
  /** Of the arrivals a saturated shop cannot take, this share walk out rather than wait. */
  balkShareOfExcess: 0.85,
  /** Mean items per order — a burger, and chips slightly over half the time. */
  itemsPerOrder: 1.55,
  /** Mean ingredient cost per item, matching the recipe set. */
  cogsPerOrder: 4.35,
  /** Dollars of stock binned per hour of capacity that ran ahead of demand. */
  wastePerIdleCapacityHour: 2.33,
  /** Utilisation a shop can run at before waits start hurting satisfaction. */
  comfortableUtilisation: 0.75,
  /** How far past comfortable before satisfaction hits zero. */
  utilisationTolerance: 1.4,
  /**
   * Reputation moves this much faster than the raw half-life implies, because a full sim's
   * reviews arrive in bursts rather than continuously.
   */
  reputationResponsiveness: 2.1,
} as const;
