/**
 * Satisfaction, reviews and reputation. DESIGN.md §7.4, §6.5.
 *
 * §6.5 is the one that costs nothing now and a rewrite later: **reputation is a
 * keyed map from the start, not two fields.** Act III adds regional and
 * national tiers, Act IV per-territory. A shop can be beloved in the room and
 * mediocre in the app, because the app measures pickup wait and packaging, not
 * welcome.
 *
 * Every formula below is transcribed from §7.4. Do not re-derive them.
 */
export const REPUTATION = {
  /**
   * Channels that exist today. Delivery arrives with couriers; the point of
   * declaring them here is that adding it is a config change, which is the
   * step 9 exit criterion.
   */
  CHANNELS: ['dineIn'] as const,

  /** §7.4: satisfaction = waitScore x qualityScore x accuracyScore. */
  WAIT_GRACE_MINUTES: 6,
  WAIT_TOLERANCE_MINUTES: 14,
  /** An order that had to be remade. Nothing generates these until step 12. */
  ACCURACY_REMADE: 0.4,

  /** §7.4: pReview, and the angry skew that makes bad weeks bite. */
  REVIEW_RATE_HAPPY: 0.07,
  REVIEW_RATE_ANGRY: 0.3,
  HAPPY_THRESHOLD: 0.7,
  ANGRY_THRESHOLD: 0.35,

  /** §6.3: a walkout leaves a mark too, and it is the earliest warning there is. */
  BALK_REVIEW_CHANCE: 0.06,
  BALK_STARS: 2,

  /** §7.4: recency-weighted mean of the last N reviews, half-life 10 game days. */
  WINDOW: 250,
  HALF_LIFE_DAYS: 10,

  /** §7.4: new venues start at 3.8 stars with the weight of 15 reviews. */
  PRIOR_STARS: 3.8,
  PRIOR_WEIGHT: 15,

  MIN_STARS: 1,
  MAX_STARS: 5,
} as const;

export type ReputationChannelId = (typeof REPUTATION.CHANNELS)[number];
