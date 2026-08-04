/**
 * Thresholds for the constraint readout. DESIGN.md §13.
 *
 * These decide when the game is willing to say "this is your problem", so
 * getting them wrong makes the most important line in the HUD either a nag or
 * a liar. They live here so the harness can move them.
 */
export const BOTTLENECK = {
  /**
   * How often the live line recomputes, in ticks. Every tick would be waste;
   * once a day would make it stale by the time it mattered. 150 ticks is half
   * a game hour.
   */
  RECOMPUTE_EVERY_TICKS: 150,

  /** Below this utilisation, nothing is under enough pressure to blame. */
  PRESSURE_FLOOR: 0.55,

  /**
   * Walking has to be a real share of a real shift before it is the answer.
   * Below this it is noise and naming it would send the player to renovate a
   * kitchen that is fine.
   */
  WALK_SHARE_FLOOR: 0.18,

  /** Customers unserved before the readout stops saying "demand". */
  UNSERVED_FLOOR: 3,

  /**
   * Hours of trade before a part-day is extrapolated to a per-day figure.
   * Twenty minutes in, three people still in the queue scales to "costing 89
   * covers a day", which is nonsense stated with total confidence — the worst
   * thing the most important line in the HUD can do.
   */
  MIN_HOURS_TO_EXTRAPOLATE: 2,

  /**
   * Open orders above which the readout may never say "demand is your
   * constraint", whatever the utilisation numbers say. A queue out the door is
   * not a demand problem, and telling a player watching sixty people wait that
   * they have capacity spare is worse than saying nothing.
   */
  QUEUE_IS_REAL: 12,
} as const;
