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
    hireAboveCash: 6000,
    minStaff: 2,
    maxStaff: 8,
    marketingShare: 0.08,
    marketingCap: 400,
  },
  tightarse: {
    maxStaff: 2,
  },
} as const;
