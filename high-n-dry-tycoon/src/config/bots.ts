/**
 * How each policy bot behaves (§14). These are not game balance — they are the *players* the game
 * is balanced against, so they live in config too and are tuned to be honest caricatures rather
 * than optimal.
 */
export const botCfg = {
  naive: {
    /** Spends this share of cash on marketing at every decision window. */
    marketingShare: 0.25,
    marketingCap: 900,
    hireAboveCash: 15000,
    maxStaff: 4,
  },
  balanced: {
    /** Hires when the recent mean wait creeps above this. */
    targetWaitMinutes: 7,
    /** Or when this share of arrivals is walking out. */
    targetBalk: 0.2,
    /** Lets someone go when service is this comfortable. */
    trimBelowWaitMinutes: 3,
    /**
     * Willing to spend down to here to fix service.
     *
     * Was 6000, and when ingredient costs were scaled to the target COGS band the tighter margins
     * meant it simply stopped hiring and could no longer dig out of a reputation crisis. A
     * competent operator spends the buffer to fix service, because service is what brings the
     * demand back — so the player model does too.
     */
    hireAboveCash: 2500,
    minStaff: 2,
    maxStaff: 8,
    marketingShare: 0.08,
    marketingCap: 400,
  },
  tightarse: {
    maxStaff: 2,
  },
} as const;
