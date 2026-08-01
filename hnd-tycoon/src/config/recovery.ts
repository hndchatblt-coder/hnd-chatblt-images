/**
 * The Recovery Plan, and the bank. DESIGN.md §10.
 *
 * *"Never a game-over, in any act."* Everything here exists to make that true
 * under pressure rather than true because nothing bad can happen.
 *
 * §10's escalation, in order:
 *   1. cash negative        -> overdraft, interest, bank emails with declining warmth
 *   2. deep overdraft       -> forced measures: sell equipment. Painful, reversible.
 *   3. reputation under 2.5 -> review-bomb, demand floor drops, and a RECOVERY PLAN
 *      with concrete objectives that visibly accelerate repair.
 *
 * *"Dig-out ≈ 8 game days. The worst outcome available is a slow, boring,
 * unprofitable week."*
 *
 * The Recovery Plan is the part that had to be measured rather than assumed,
 * and the measurement went against the assumption. See the long note where
 * `REPAIR_WEIGHT` used to be.
 */
export const RECOVERY = {
  /** §10: the plan opens below this. */
  TRIGGER_STARS: 2.5,
  /** And closes above this. Hysteresis, or it flickers on and off at 2.5. */
  CLEAR_STARS: 3.1,

  /**
   * §10's objectives, verbatim where the spec gives numbers.
   *
   * They are deliberately about the SHOP and not about the rating: "get your
   * rating up" is not an objective, it is the thing you are stuck on. "Seven
   * days with a mean wait under eight minutes" is something you can go and do
   * something about this afternoon.
   */
  OBJECTIVES: {
    WAIT_MINUTES: 8,
    WASTE_FRACTION: 0.04,
    /** Consecutive qualifying days needed. §10 says seven. */
    DAYS: 7,
  },

  /**
   * **Deliberately absent, and this is the note explaining why.**
   *
   * The first cut of this file had a `REPAIR_WEIGHT: 2.6` that multiplied the
   * weight of good reviews while the plan was being met, justified in a comment
   * that said a review-bombed shop "cannot arithmetically climb out inside the
   * eight days §10 budgets — the bad reviews are simply still in the window."
   *
   * That was asserted, not measured, and it was wrong. Measured, six seeds,
   * naive wrecking the shop to 2.26 stars by day 35 and then handing it to
   * `bot:balanced`:
   *
   *   multiplier   dig-out days
   *   1.0 (none)   6,5,5,5,5,7   mean 5.5
   *   1.6          3,3,3,4,3,6   mean 3.7
   *   2.0          2,2,3,4,2,4   mean 2.8
   *   2.6          1,2,3,2,2,2   mean 2.0
   *
   * The shop already digs out in 5.5 days with no help at all — faster than the
   * eight §10 budgets, not slower. The multiplier was solving a problem that
   * did not exist, and at 2.6 it turned a designed week of graft into a
   * formality.
   *
   * §10 still asks that the objectives "visibly accelerate repair", and they
   * do — honestly. Getting the wait under eight minutes is what produces the
   * good reviews that repair the rating. The plan tells you what to fix, and
   * fixing it works. It does not need a hidden multiplier on top, and a hidden
   * multiplier is the kind of thing that makes a recovery feel unearned.
   */

  /**
   * §10: "review-bomb event, demand floor drops". The drop is real and it is
   * survivable — it multiplies the reputation term, which already has a floor
   * of 0.35, so the worst case is a quiet shop rather than an empty one.
   */
  DEMAND_PENALTY: 0.12,
} as const;

/**
 * The bank. §10 step 1: *"overdraft, interest, bank emails with declining
 * warmth."*
 *
 * The warmth is the mechanic. A number going more negative is information the
 * player has already got from the cash readout; a bank that starts out
 * understanding and ends up terse is the game telling them how much trouble
 * they are in without a fail screen and without a modal.
 */
export const BANK = {
  /**
   * Overdraft tiers, by how far under you are. Each has a message.
   *
   * Nothing here stops the player doing anything. §10's step 2 forced measures
   * — selling equipment — arrive as an OFFER at the deepest tier, never as a
   * seizure. Painful and reversible is the requirement; painful and involuntary
   * is a fail state wearing a hat.
   */
  TIERS: [
    {
      id: 'watching',
      atLeastCents: 1,
      tone: 'Your account is overdrawn. These things happen — interest applies from today.',
    },
    {
      id: 'concerned',
      atLeastCents: 300_000,
      tone: 'We notice the account has been overdrawn for a while. Do get in touch.',
    },
    {
      id: 'terse',
      atLeastCents: 800_000,
      tone: 'Your facility is significantly extended. We would like to discuss the arrangement.',
    },
    {
      id: 'final',
      atLeastCents: 1_500_000,
      tone: 'We are obliged to ask you to reduce the balance. Selling equipment is an option.',
    },
  ] as const,

  /**
   * Interest compounds daily off the annual rate in `economy.ts`. Charged on
   * the balance, never on a fee, and never capitalised into a number that grows
   * on its own faster than a shop can earn — a debt that outruns the business
   * is a fail state with extra steps.
   */
  DAYS_PER_YEAR: 365,
} as const;
