/**
 * The kitchen: what is installed, and how work gets chosen. DESIGN.md §7, §7.1,
 * §7.3, §14.1.
 *
 * Every number the production scheduler uses lives here. The scheduler itself
 * contains no constants — that is hard rule 5, and the reason is that these
 * values are the ones the balance harness will move a hundred times.
 */
export interface StaffSlot {
  readonly id: string;
  readonly name: string;
  /** Skill 1.0 = recipe durations as written. The learning curve is step 18. */
  readonly skill: number;
}

export const KITCHEN = {
  /**
   * One person to run the whole line. Deliberately under-resourced — a single
   * staffer covering five stations is what makes the first hire legible.
   * WHERE the stations go is `config/layouts.ts`, because from step 3 onward
   * that is a different and much more interesting question.
   */
  OPENING_STAFF: [{ id: 'staff-1', name: 'Dev', skill: 1 }] as readonly StaffSlot[],

  /**
   * The scheduler pulls, it does not push. Work nearest the customer is
   * started first, so the line drains toward the pass instead of making
   * patties forever while nothing gets plated. Shallowest-first is the whole
   * policy; this flag exists so the alternative can be measured rather than
   * argued about. Measured at 45 arrivals/hr: pull serves 86% of them, push 4%.
   */
  PULL_SHALLOWEST_FIRST: true,

  /**
   * A batch is sized to outstanding need, capped at the equipment's capacity.
   * Cooking MORE than is needed is par-cooking (see PAR_LEVELS) and that is a
   * decision the player makes deliberately — it must not be the default.
   */
  BATCH_TO_NEED: true,

  // --- Attention (§14.1) -------------------------------------------------

  /**
   * A staffer loads a station, WALKS AWAY while it cooks, and comes back to
   * tend and unload it. That is the whole premise of the automation ladder:
   * a grill patty is 90 seconds of cooking and about 22 seconds of human
   * attention, so removing the attention lets one person run three grills.
   *
   * Turn this off and every step occupies its staffer for its full elapsed
   * duration — the step 2 and 3 behaviour. Kept switchable because the
   * difference between the two is exactly what §14.1 claims, and a claim that
   * cannot be measured is a slogan.
   */
  UNATTENDED_COOKING: true,

  /**
   * How long an item can sit finished on an unattended station before it
   * starts to suffer, when the step's `canLapse` is true. A fryer basket left
   * up is chips going soft; a patty left down is a patty going grey.
   */
  LAPSE_GRACE_SECONDS: 30,

  /**
   * Quality lost per second of lapse beyond the grace window. At 0.01 a patty
   * is unservable about 95 seconds after it should have come off — long enough
   * to recover from a bad minute, short enough that a bad ten minutes costs
   * real food.
   */
  LAPSE_QUALITY_LOSS_PER_SECOND: 0.01,

  /**
   * Finishing a lapsing item outranks starting new work. Without this the
   * scheduler cheerfully lets a grill burn while it starts another batch,
   * which is not a difficulty setting, it is a bug that looks like one.
   */
  RESCUE_LAPSING_FIRST: true,

  // --- Freshness and waste (§7.3) ----------------------------------------

  /**
   * How fast quality falls once past the freshness window. Paired with the
   * floor below: an item is binned `decay * (1 - floor)` seconds past its
   * window, so 600s here means a patty survives about 390 seconds past its
   * eight-minute window before it goes in the bin.
   */
  QUALITY_DECAY_SECONDS: 600,

  /** §7.3: below this, the item is auto-binned as waste. */
  WASTE_QUALITY_FLOOR: 0.35,

  /**
   * Par levels — how much of each intermediate item to keep ahead of demand.
   * Zero is make-to-order. Raising a par level is par-cooking: it buys wait
   * time and it buys waste, and which one dominates depends on whether the
   * rush you cooked for actually turns up.
   *
   * The player sets these from step 19. The harness moves them to prove both
   * effects are real, which is the step 4 gate.
   */
  PAR_LEVELS: {} as Readonly<Record<string, number>>,

  /**
   * A holding cabinet extends how long cooked food stays good. §14.2 tier 1:
   * "Nothing — extends freshness, enables par-cooking". It is the cheapest
   * thing in the ladder and the one that changes the most, because it makes
   * par-cooking survivable rather than merely possible.
   *
   * It buys nothing on its own. It only pays if you also decide to cook ahead,
   * which is the shape every good upgrade in this game should have.
   */
  HOLDING_CABINET_FRESHNESS_MULTIPLIER: 2.5,

  // --- Machinery ---------------------------------------------------------

  /** Floating-point slack when deciding a job has finished. Not a tunable. */
  EPSILON: 1e-9,

  /** For reporting time in minutes. */
  SECONDS_PER_MINUTE: 60,

  /**
   * Backstop on the advance/schedule interleave within one tick. Each pass
   * either burns budget or starts a job, so this can only be reached by a bug.
   * Far above any real iteration count.
   */
  MAX_SCHEDULER_PASSES: 64,
} as const;
