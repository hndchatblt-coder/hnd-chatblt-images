/**
 * Weekly specials. DESIGN.md §18.
 *
 * *"High N' Dry runs weekly specials. They're a real lever in the real business
 * and the best-fitting mechanic in this document. Each Monday the player picks
 * a special from an unlocking pool. It runs the week."*
 *
 * §18 calls it a **three-sided decision every Monday**: what draws people, what
 * your kitchen can produce at volume, and what you can prep without eating the
 * waste. Those three sides are the three fields that matter here, and every
 * special in the pool has to lose on at least one of them or it is a stat
 * upgrade with a name — the same pillar that governs machines in §14.3.
 *
 * The four levers §18 names, and what each is in this file:
 *
 * 1. **Demand uplift on a NAMED DAY.** *"Wing Wednesday spikes Wednesday
 *    dinner, not the whole week."* So `day` and `dinnerOnly` are per-special,
 *    and the uplift enters §6.1's `demandRate` as `specialUplift(t)` — the term
 *    that has been sitting at zero in the formula since step 2.
 * 2. **Shared stations.** *"A fryer-heavy special in a chips-heavy week is a
 *    self-inflicted bottleneck."* `station` is the one the special leans on,
 *    and the good ones lean on the station the shop is already tightest at.
 * 3. **Prep-ahead requirement.** `prepUnits` must exist before the named day's
 *    rush. Short, and it 86s mid-service; long, and the surplus is binned.
 * 4. **Ingredient exposure.** *"Some specials use an ingredient nothing else
 *    uses."* `exclusiveIngredient` means the surplus has no second life — a
 *    normal over-prep leaks back into ordinary trade, this one goes in the bin
 *    at full cost.
 *
 * **Why 86'ing has to hurt more than not running it at all.** §18 is explicit:
 * *"worse than never running it, because you drew the crowd and disappointed
 * them."* That is not a flat penalty bolted on — it falls out of the mechanism
 * if the uplift is real. The advertising drew people who came FOR the thing;
 * being told it is gone is a worse experience than never having been promised
 * it. `eightySixPenalty` is the multiplier on that disappointment relative to
 * an ordinary bad review, and it is per-special because a $26 dry-aged
 * something that sells out reads worse than running out of wings.
 *
 * §26: nothing here is hardcoded to one venue or one act. A special names a
 * station and an ingredient, both of which are already open sets, and the pool
 * unlocks through the same `Capability` the rest of §15.1's ladder uses.
 */

export interface Special {
  readonly id: string;
  readonly label: string;
  /** One line, in the voice. Shown at the Monday choice. §22's tone. */
  readonly blurb: string;
  /**
   * Day of week the uplift lands on. 0 = Sunday, matching `DAY_OF_WEEK`.
   * §18: the spike is a DAY, never the week.
   */
  readonly day: number;
  /**
   * Dinner service only, rather than the whole trading day. Wing Wednesday is
   * a dinner thing; a lunch special is not.
   */
  readonly dinnerOnly: boolean;
  /** Fractional lift on §6.1's `demandRate` during the window. */
  readonly uplift: number;
  /** The station it leans on. §18's self-inflicted bottleneck. */
  readonly station: string;
  /** Units that must be prepped before the named day, or it 86s. */
  readonly prepUnits: number;
  /**
   * An ingredient nothing else on the menu uses, if any. Surplus of one of
   * these is a total loss rather than tomorrow's stock.
   */
  readonly exclusiveIngredient: string | null;
  /** Cost per prepped unit, in dollars. What over-prepping actually costs. */
  readonly unitCost: number;
  /** What it sells for, as a multiple of an ordinary cover. */
  readonly priceMultiple: number;
  /**
   * How much worse a walkaway is when the thing they came for is gone,
   * against an ordinary disappointed customer. §18's "worse than never
   * running it".
   */
  readonly eightySixPenalty: number;
}

/**
 * The pool, in unlock order.
 *
 * Each one is deliberately bad at something. Read down the `station` column and
 * they cluster on fryer and grill, which is the point: the shop's existing
 * bottleneck decides which of them is affordable this week, and a special that
 * would be fine in an automated kitchen is a disaster in a hand-run one.
 */
export const SPECIALS: readonly Special[] = [
  {
    id: 'wingWednesday',
    label: 'Wing Wednesday',
    blurb: 'A kilo of wings and a stack of napkins. The fryer will hate you.',
    day: 3,
    dinnerOnly: true,
    uplift: 0.55,
    station: 'fryer',
    prepUnits: 60,
    exclusiveIngredient: 'wings',
    unitCost: 2.4,
    priceMultiple: 0.85,
    // Wings are a low-stakes promise. Running out is annoying, not a betrayal.
    eightySixPenalty: 1.6,
  },
  {
    id: 'schnitzelThursday',
    label: 'Schnitty Thursday',
    blurb: 'Crumbed, flattened, bigger than the plate. Needs the bench all morning.',
    day: 4,
    dinnerOnly: true,
    uplift: 0.5,
    station: 'prep',
    prepUnits: 45,
    exclusiveIngredient: 'chickenBreast',
    unitCost: 4.1,
    priceMultiple: 1.2,
    eightySixPenalty: 1.9,
  },
  {
    id: 'twoForTuesday',
    label: 'Two-for-Tuesday',
    blurb: 'Buy one, get one. Tuesday stops being a rumour and the grill stops being idle.',
    day: 2,
    dinnerOnly: false,
    uplift: 0.85,
    station: 'grill',
    // No prep-ahead at all — it is the ordinary menu, twice. Which is exactly
    // why it is the cheapest lever in the pool and the most dangerous: nothing
    // to bin, and nothing standing between the crowd and your one cook.
    prepUnits: 0,
    exclusiveIngredient: null,
    unitCost: 0,
    priceMultiple: 0.6,
    eightySixPenalty: 1,
  },
  {
    id: 'fridayBrisket',
    label: 'Friday brisket',
    blurb: 'Twelve hours in the smoker for a day that was already busy.',
    day: 5,
    dinnerOnly: true,
    uplift: 0.4,
    station: 'grill',
    prepUnits: 50,
    exclusiveIngredient: 'brisket',
    unitCost: 6.8,
    priceMultiple: 1.45,
    // The dearest promise in the pool, on the busiest night. Running out of
    // this is the one people write about.
    eightySixPenalty: 2.6,
  },
  {
    id: 'sundayRoastRoll',
    label: 'Sunday roast roll',
    blurb: 'Gravy, on a bun, at four in the afternoon. Fills the dead hours.',
    day: 0,
    dinnerOnly: false,
    // The smallest lift in the pool, and it lands where there is capacity going
    // begging rather than on top of an existing peak. §18's "what your kitchen
    // can produce at volume" is sometimes answered by moving the volume.
    uplift: 0.3,
    station: 'assembly',
    prepUnits: 40,
    exclusiveIngredient: 'roastBeef',
    unitCost: 5.2,
    priceMultiple: 1.15,
    eightySixPenalty: 2.0,
  },
];

export const SPECIAL_BY_ID: Readonly<Record<string, Special>> = Object.fromEntries(
  SPECIALS.map((s) => [s.id, s]),
);

export const SPECIAL_RULES = {
  /**
   * The day the choice is made and locked. §18: *"Each Monday the player picks
   * a special. It runs the week."* 1 = Monday.
   *
   * A pick made on any other day queues for the next Monday, which is the same
   * shape as §8.2's price change landing tomorrow — the delay IS the design,
   * because a special chosen mid-rush to catch a rush would be a way to conjure
   * demand out of nothing.
   */
  SELECTION_DAY: 1,
  /** Dinner runs from this hour, for `dinnerOnly` specials. Matches §6.1's curve. */
  DINNER_FROM_HOUR: 17,
  /**
   * How far ahead prep can be done, in days. Longer and the surplus is stale;
   * this is what makes over-prep a real cost rather than a rounding error.
   */
  PREP_WINDOW_DAYS: 1,
  /**
   * Fraction of the promised units that must be on hand at the start of the
   * window, or the special is 86'd before it starts. Below this it is not
   * "running low", it is not running.
   */
  MIN_READY_FRACTION: 0.5,
  /**
   * Surplus that survives the week and re-enters ordinary trade, for a special
   * with no exclusive ingredient. Exclusive ones get none of this — that is
   * what "ingredient exposure" costs.
   */
  SHARED_SURPLUS_RECOVERY: 0.6,
  /** Running none is always allowed and always free. §18 never forces a pick. */
  NONE: 'none',
} as const;
