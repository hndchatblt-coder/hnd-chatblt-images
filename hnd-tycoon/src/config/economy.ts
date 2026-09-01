/**
 * Money. DESIGN.md §8, §26.
 *
 * §26: **wage rules are a jurisdiction ruleset, not constants.** Act III
 * crosses borders, and a payroll system with `if (isSunday) pay * 1.5` in it is
 * a rewrite the day the game leaves New South Wales. It costs nothing to do
 * properly now.
 *
 * Every figure here is invented and provisional until `docs/REAL_NUMBERS.md`
 * lands. Do not tune balance against them.
 */
import { money, type Money } from '@/sim/types';
import type { DayOfWeek } from './time';

// --- Wages ---------------------------------------------------------------

export interface PenaltyRule {
  /** Days this multiplier applies to. */
  readonly days: readonly DayOfWeek[];
  readonly multiplier: number;
  readonly label: string;
}

export interface Jurisdiction {
  readonly id: string;
  readonly currency: 'AUD';
  readonly baseHourly: Money;
  /** Casual loading, in place of leave entitlements. */
  readonly casualLoading: number;
  readonly penalties: readonly PenaltyRule[];
  /** Superannuation, on top of everything. */
  readonly superRate: number;
}

export const JURISDICTIONS: Readonly<Record<string, Jurisdiction>> = {
  nsw: {
    id: 'nsw',
    currency: 'AUD',
    baseHourly: money(26.5),
    casualLoading: 0.25,
    penalties: [
      { days: [6], multiplier: 1.25, label: 'Saturday' },
      { days: [0], multiplier: 1.5, label: 'Sunday' },
    ],
    superRate: 0.12,
  },
};

/** What an hour actually costs on a given day, loading and penalties included. */
export function hourlyCost(jurisdiction: Jurisdiction, day: DayOfWeek): Money {
  const penalty = jurisdiction.penalties.find((p) => p.days.includes(day));
  const multiplier =
    (1 + jurisdiction.casualLoading) * (penalty?.multiplier ?? 1) * (1 + jurisdiction.superRate);
  return money((jurisdiction.baseHourly.cents / 100) * multiplier);
}

// --- Ingredients ---------------------------------------------------------

/**
 * Cost per unit of each ingredient, in whatever unit the recipe counts in —
 * kilograms for mince and salad, each for buns and cheese slices.
 */
export const INGREDIENTS: Readonly<Record<string, Money>> = {
  mince: money(18.0),
  bun: money(1.1),
  cheese: money(0.55),
  salad: money(14.0),
  sauce: money(10.0),
  potato: money(4.5),
  oil: money(6.0),
  salt: money(2.0),
};

export const ECONOMY = {
  /** Starting cash. Enough to make a decision with, not enough to make them all. */
  OPENING_CASH: money(9000),

  /**
   * Clamshells, boxes, napkins, the bag. Charged per order rather than per
   * item because that is how it actually works, and it is the line every
   * operator forgets until they add it up.
   */
  PACKAGING_PER_ORDER: money(0.45),

  /**
   * §8.1 ingredient tiers — the early COGS lever. A cheap high-volume shop and
   * a premium low-volume shop are both meant to be viable.
   */
  INGREDIENT_TIERS: {
    commodity: { costMultiplier: 0.82, qualityBonus: 0.88, label: 'Commodity' },
    standard: { costMultiplier: 1.0, qualityBonus: 1.0, label: 'Standard' },
    premium: { costMultiplier: 1.22, qualityBonus: 1.08, label: 'Premium' },
  } as const,

  /** Utilities scale with equipment run-hours, not with a flat monthly guess. */
  UTILITIES_PER_RUN_HOUR: {
    gas: money(1.1),
    electric: money(0.42),
  },

  /** Standing costs that arrive whether you trade or not. */
  INSURANCE_PER_WEEK: money(96),
  POS_PER_WEEK: money(58),

  /** §8: cash can go negative, at 14% p.a. accruing daily. */
  OVERDRAFT_ANNUAL_RATE: 0.14,
  DAYS_PER_YEAR: 365,

  /**
   * Letting someone go costs two weeks. §10: mistakes are recoverable and slow
   * to fix, never instant and never free — if firing were costless, over-hiring
   * would carry no risk and the roster would stop being a decision.
   */
  NOTICE_WEEKS: 2,

  /** Equipment sells back at 60%. §12 — renovation must cost something. */
  RESALE_FRACTION: 0.6,

  /**
   * Each additional copy of a station costs this much more than the last. The
   * easy spot is already taken: the second fryer needs a longer gas run, the
   * third needs the hood extended. It also stops "buy six grills" being the
   * answer to everything.
   */
  DUPLICATE_PRICE_STEP: 0.12,
} as const;

/** Which utility a station draws on. Gas is dearer and runs hotter. */
export const STATION_UTILITY: Readonly<Record<string, 'gas' | 'electric'>> = {
  grill: 'gas',
  fryer: 'gas',
  toast: 'electric',
  prep: 'electric',
  assembly: 'electric',
  pass: 'electric',
  drinks: 'electric',
};
