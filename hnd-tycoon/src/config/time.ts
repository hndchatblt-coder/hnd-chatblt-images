/**
 * ALL time tunables. DESIGN.md §5.
 * Zero magic numbers in simulation code — everything lives here.
 */
export const TIME = {
  /** Simulation ticks per game second. Fixed. Never tie to frame rate. */
  TICK_HZ: 10,
  /** Real seconds per game hour at 1x speed. */
  REAL_SECONDS_PER_GAME_HOUR: 30,
  /** Seconds in an hour. Here rather than inline so §26 stays clean when a
   *  later act's calendar has an hour that isn't 3600 seconds long. */
  SECONDS_PER_HOUR: 3600,
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
  /** Available speed multipliers. 4x unlocks at venue 2. */
  SPEEDS: [1, 2, 4] as const,
  /** Offline accrual caps. DESIGN.md §5.2. Never purchasable. */
  OFFLINE_MAX_TRADING_DAYS_PER_GAP: 1,
  OFFLINE_MAX_TRADING_DAYS_PER_REAL_DAY: 2,
  OFFLINE_EFFICIENCY: 0.75,
  /** Payroll lands here, every week. DESIGN.md §8. */
  PAYROLL_DAY: 0 as DayOfWeek, // Sunday
  PAYROLL_HOUR: 23,
} as const;

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Trading calendars are PER SITE and must never be hardcoded.
 * DESIGN.md §26.1 — "Colonies don't have Tuesdays."
 */
export interface TradingCalendar {
  readonly id: string;
  /** Hours in a full cycle. Earth = 24. Kept explicit for later acts. */
  readonly hoursPerCycle: number;
  /** Days in a week for payroll purposes. */
  readonly daysPerWeek: number;
  /** Per-day open/close in cycle-hours. null = closed that day. */
  readonly hours: ReadonlyArray<{ open: number; close: number } | null>;
}

const STANDARD_11_TO_10: TradingCalendar['hours'] = [
  { open: 11, close: 22 }, // Sun
  { open: 11, close: 22 }, // Mon
  { open: 11, close: 22 }, // Tue
  { open: 11, close: 22 }, // Wed
  { open: 11, close: 22 }, // Thu
  { open: 11, close: 22 }, // Fri
  { open: 11, close: 22 }, // Sat
];

export const CALENDARS: Record<string, TradingCalendar> = {
  sydneyStandard: {
    id: 'sydneyStandard',
    hoursPerCycle: 24,
    daysPerWeek: 7,
    hours: STANDARD_11_TO_10,
  },
  /**
   * Shut Sundays. Exists so the §8 question — is Sunday worth opening once you
   * are paying 1.5x plus casual loading plus super — can be measured against
   * the same week rather than argued about.
   */
  sydneyClosedSunday: {
    id: 'sydneyClosedSunday',
    hoursPerCycle: 24,
    daysPerWeek: 7,
    hours: [null, ...STANDARD_11_TO_10.slice(1)],
  },
};
