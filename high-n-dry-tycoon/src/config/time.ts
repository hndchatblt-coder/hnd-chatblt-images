/**
 * The two clocks.
 *
 * The sim runs at a fixed rate in REAL time and advances GAME time by a fixed amount each tick.
 * Speed multipliers change how many ticks get processed per real second — never `dt` (§4.1).
 * Keeping dt constant is what makes the sim deterministic and replayable at any speed.
 */
export const time = {
  /** Sim ticks per real second. */
  tickHz: 10,
  /** 1 game hour = 30 real seconds at 1x, so game time runs 120x real time. */
  gameSecondsPerRealSecond: 120,

  /** Trading day, in game hours on a 24h clock. */
  openHour: 11,
  closeHour: 22,
  /** Payroll lands Sunday night whether you traded well or not. */
  payrollHour: 23,
  payrollDayOfWeek: 0,

  secondsPerHour: 3600,
  hoursPerDay: 24,
  daysPerWeek: 7,
} as const;

/**
 * Game seconds advanced per tick. Derived, not tuned — the two rates above are the tunables.
 *
 * At the shipped values this is 12 game seconds per tick, which is coarser than the shortest
 * recipe step (plate, 6s). That is fine and deliberate: progress accumulates in game seconds, so
 * a sub-tick step simply finishes in the tick it starts. It does mean step durations below ~12s
 * are effectively rounded up, which is worth remembering when tuning recipes.
 */
export const dtGameSeconds = time.gameSecondsPerRealSecond / time.tickHz;

/** Real seconds a full trading day takes at 1x — the session length the game is paced around. */
export const realSecondsPerTradingDay =
  ((time.closeHour - time.openHour) * time.secondsPerHour) / time.gameSecondsPerRealSecond;
