/**
 * Satisfaction, reviews and reputation (§4.8).
 *
 * The asymmetry is the game: angry people review at roughly four times the rate of happy ones,
 * and reputation takes weeks to build and days to destroy.
 */
export const reviews = {
  /** Minutes of wait forgiven entirely. */
  graceMinutes: 6,
  /** Minutes beyond grace over which the wait score falls to zero. */
  toleranceMinutes: 14,

  /** A remade order is not a disaster, but it is not a good time either. */
  accuracyPenaltyOnRemake: 0.4,

  /** How often each kind of experience gets written up. */
  reviewChanceHappy: 0.07,
  reviewChanceAngry: 0.3,
  happyThreshold: 0.7,
  angryThreshold: 0.35,

  /** Rolling window and how fast old reviews stop mattering. */
  windowSize: 250,
  halfLifeDays: 10,

  /** A new venue is not a blank slate — it is an unknown one. */
  priorStars: 3.8,
  priorWeight: 15,

  /**
   * How quickly the shop's own estimate of its service time reacts. Low so a single slow order
   * doesn't scare off the whole street; it is what arriving customers read (§4.3).
   */
  serviceEstimateSmoothing: 0.1,

  /** The Recovery Plan's objectives (§9): concrete, achievable, and visibly accelerating. */
  recoveryWindowDays: 7,
  recoveryTargetWaitMinutes: 8,
  recoveryTargetWaste: 0.04,
  /** Meeting the plan ages bad reviews out this much faster. */
  recoveryHalfLifeMultiplier: 0.5,

  /** Below this, the review-bomb event fires and the Recovery Plan appears (§9). */
  crisisStars: 2.5,
} as const;
