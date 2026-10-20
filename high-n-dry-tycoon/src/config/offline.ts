/**
 * Offline progress (§4.1). Generous enough to be the primary earning channel, worse than being
 * there so that turning up is rewarded, and it never resolves an incident for you.
 */
export const offline = {
  /** Sixteen hours, so an overnight plus a workday is fully covered. */
  maxRealSeconds: 16 * 60 * 60,
  /** The shop runs at three quarters pace without you. */
  efficiency: 0.75,
  /** Below this, don't bother showing a card. */
  minRealSecondsToReport: 120,
} as const;
