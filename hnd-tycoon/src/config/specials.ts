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
  /**
   * Rungs that must be banked before this appears in the pool. §18's
   * *"unlocking pool"*, gated on ladder progress per §14.5.
   *
   * Deliberately a COUNT rather than a named rung. Giving each special its own
   * rung would either lengthen §15.1's authored list or displace a capability
   * already paired with one, and step 14 measured what happens when a rung's
   * reward moves (D055, D056). A count uses the ladder as a clock without
   * touching it.
   */
  readonly unlockedAfterRungs: number;
}

/**
 * The pool, in unlock order.
 *
 * Each one is deliberately bad at something. Read down the `station` column and
 * they cluster on fryer and grill, which is the point: the shop's existing
 * bottleneck decides which of them is affordable this week, and a special that
 * would be fine in an automated kitchen is a disaster in a hand-run one.
 *
 * **`prepUnits` is the MEASURED MEAN, and that is a design choice.** Every one
 * of these was authored from intuition and every one was wrong — wings were set
 * at 60 against a real seeker count of about 24. They are now the harness's
 * numbers, rounded, and they sit exactly ON the mean rather than safely above
 * it. A unit is one PARTY's order: a table of six that came for the wings
 * orders the wings once and burgers for the rest.
 *
 * Which means prepping to spec loses half the time. That is the point: demand
 * is Poisson and bursty by construction (§6.1), so "how much do I make" has no
 * safe answer, only a trade — prep to the mean and you 86 one week in two, prep
 * twenty percent over and you buy that safety with bin liner. §18 asks for a
 * decision every Monday, and a number that is right every week is not one.
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
    prepUnits: 24,
    exclusiveIngredient: 'wings',
    unitCost: 2.4,
    priceMultiple: 0.85,
    // Wings are a low-stakes promise. Running out is annoying, not a betrayal.
    eightySixPenalty: 1.6,
    unlockedAfterRungs: 0,
  },
  {
    id: 'schnitzelThursday',
    label: 'Schnitty Thursday',
    blurb: 'Crumbed, flattened, bigger than the plate. Needs the bench all morning.',
    day: 4,
    dinnerOnly: true,
    uplift: 0.5,
    station: 'prep',
    prepUnits: 25,
    exclusiveIngredient: 'chickenBreast',
    unitCost: 4.1,
    priceMultiple: 1.2,
    eightySixPenalty: 1.9,
    unlockedAfterRungs: 3,
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
    unlockedAfterRungs: 0,
  },
  {
    id: 'fridayBrisket',
    label: 'Friday brisket',
    blurb: 'Twelve hours in the smoker for a day that was already busy.',
    day: 5,
    dinnerOnly: true,
    uplift: 0.4,
    station: 'grill',
    prepUnits: 26,
    exclusiveIngredient: 'brisket',
    unitCost: 6.8,
    priceMultiple: 1.45,
    // The dearest promise in the pool, on the busiest night. Running out of
    // this is the one people write about.
    eightySixPenalty: 2.6,
    unlockedAfterRungs: 6,
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
    prepUnits: 22,
    exclusiveIngredient: 'roastBeef',
    unitCost: 5.2,
    priceMultiple: 1.15,
    eightySixPenalty: 2.0,
    unlockedAfterRungs: 4,
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
  /**
   * Seconds of the host station's time each prepped unit costs.
   *
   * // PROVISIONAL — no real figure for this. Sixty wings or fifty briskets is
   * a morning's work for one person, and a morning is about four hours, so
   * ~240 seconds a unit at fifty units. Set below that because the prep day is
   * a trading day and the station cannot be given over entirely.
   */
  PREP_SECONDS_PER_UNIT: 165,
  /**
   * Fraction of the uplift's extra arrivals who came specifically for the
   * special and will not accept a burger instead.
   *
   * This is the number that makes §18's *"worse than never running it"* fall
   * out of the mechanism rather than being bolted on. At 1.0 every extra
   * customer is a special-seeker and an 86 costs you the entire uplift plus
   * their opinion of you; at 0 the special is free advertising and running out
   * costs nothing, which is the design §18 explicitly forbids.
   *
   * // PROVISIONAL — 0.7 says most of the crowd a special draws came for the
   * special, and the rest were coming anyway and noticed the sign.
   */
  SEEKER_FRACTION: 0.7,
  /** Reviews an 86'd seeker leaves, against §6.3's ordinary walkout rate. */
  EIGHTY_SIX_LOUDNESS: 2.2,
  /**
   * How much of the shop's credibility a full 86 costs.
   *
   * **This is the mechanism that makes §18's hardest clause true**, and it is
   * here because the obvious approach failed a measurement. Reviews alone were
   * not enough: turning fifteen people away bought about three two-star
   * reviews, which against a shop with hundreds of them is noise, so
   * deliberately under-prepping was the single most profitable play in the game
   * — $39,135 against $37,935 for never running a special at all. Exactly what
   * §18 forbids.
   *
   * The honest fix is not a bigger number on the review. It is that **a promise
   * you broke stops working.** A shop that ran out of wings last Wednesday
   * draws a smaller crowd next Wednesday, because the people who drove over for
   * nothing tell their mates and do not come back. That is what actually
   * happens, it makes repeat offending compound instead of paying, and it needs
   * no constant tuned against a gate to do it.
   *
   * Scaled by the fraction of seekers turned away, so running twenty short of a
   * hundred is a scratch and opening with nothing is a scar.
   */
  CREDIBILITY_HIT: 0.55,
  /** Fraction of the lost credibility that comes back each clean week. */
  CREDIBILITY_RECOVERY: 0.28,
  /** It never falls below this. §10 — nothing is unrecoverable. */
  CREDIBILITY_FLOOR: 0.15,
  /**
   * Promoting the week's special. DESIGN.md §8's channel table, verbatim:
   * *"Special promotion | Cheap | Only lifts the current week's special, high
   * efficiency | Best value if you can serve it (§18)."*
   *
   * It is a separate lever from §8.3's letterbox and paid social because it
   * multiplies `specialUplift` rather than adding to general awareness — it
   * cannot bring anyone in on a Tuesday if the special runs on Wednesday, and
   * it does nothing at all if no special is running.
   *
   * **This is what makes §18's hardest clause measurable.** *"86'ing a PROMOTED
   * special is worse than never running it"* — promoted is the operative word.
   * An unpromoted special that runs short costs some goodwill and a bit of
   * stock. A promoted one that runs short means you paid cash to draw a bigger
   * crowd and then turned it away, and both halves are on your side of the
   * ledger.
   */
  PROMO_WEEKLY_COST: 140,
  /** Multiplier on the special's uplift when promoted. */
  PROMO_UPLIFT: 2.4,
} as const;
