/**
 * Ambience — the second spatial lever. DESIGN.md §6.4.
 *
 * *"Seating, décor and fit-out raise `ambienceBonus`, multiplying patience and
 * lifting dine-in spend per head. Décor occupies floor tiles — a THIRD claimant
 * alongside kitchen and storage."*
 *
 * That last clause is the whole design. Ambience is not a purchasable stat; it
 * is a bid for the same finite floor the grill wants, so every seat is a tile
 * the kitchen does not get. §6.4 states the two failure modes explicitly and
 * neither is wrong:
 *
 *   a cramped efficient kitchen with a bleak room turns tables fast and has
 *   customers who will not wait;
 *   a beautiful room with a strangled kitchen has patient customers waiting a
 *   very long time.
 *
 * It also differs per site, which is why none of this is a global constant:
 * Neutral Bay's spend per head rewards ambience and Rosebery's lunch rush does
 * not, and both of those sites are in `sites.ts` already.
 */

/**
 * Diminishing returns, deliberately steep.
 *
 * `bonus = 1 + MAX * (1 - e^(-k * points))`. Without the curve the optimum is
 * to pave the entire room in seating, which is not a decision — it is a
 * spreadsheet with one cell. With it, the first few seats are worth far more
 * than the tenth, so the question becomes "how much room can I spare" rather
 * than "how much can I afford", and that is a question about the floor.
 */
export const AMBIENCE = {
  /** Patience multiplier at infinite décor. 1.55 means "waits 55% longer". */
  MAX_PATIENCE_BONUS: 0.55,
  /** Spend-per-head multiplier at infinite décor. Smaller — this is a burger bar. */
  MAX_SPEND_BONUS: 0.22,
  /**
   * Curve constant. At 4 points the patience bonus is ~63% of its maximum, at
   * 8 points ~86%. Four seats is a shop with somewhere to sit; twelve is a shop
   * that has given up half its kitchen for it.
   */
  DECAY_PER_POINT: 0.25,
  /**
   * Ambience decays if the room is filthy or falling apart. §9's `roomTired`
   * incident is what moves it.
   */
  CONDITION_FLOOR: 0.5,

  /**
   * **Dollars per ambience point per trading day, and the reason this is not a
   * stat upgrade in a costume.**
   *
   * §6.4 justifies ambience as costing floor tiles — the third claimant. Found
   * by attacking the step: at Leichhardt that cost is imaginary. The room is
   * 9x15, about 135 tiles, and the whole opening kitchen occupies eleven of
   * them. Eight tables saturates the patience curve with a hundred tiles to
   * spare, so "it competes for floor" is true at Rosebery's 7x22 and simply
   * false here — and CLAUDE.md bans an upgrade that only increases a number.
   *
   * A room costs money to keep. Tables get wiped, linen gets done, lights get
   * replaced, the floor gets mopped twice a day rather than once. That is a
   * standing cost against a benefit that only pays when people are actually
   * queueing, which makes ambience a bet on being busy rather than a purchase.
   *
   * PROVISIONAL — REAL_NUMBERS.md has nothing on front-of-house cleaning yet.
   */
  UPKEEP_PER_POINT_PER_DAY: 4.2,
} as const;

/** Ambience points contributed by each placeable thing. */
export const AMBIENCE_POINTS: Readonly<Record<string, number>> = {
  seating: 1.6,
  decor: 1.1,
};

/**
 * `1 + MAX * (1 - e^(-k * points))`, scaled by how well kept the room is.
 *
 * Returns exactly 1 for a shop with nothing, so an empty room is neutral rather
 * than penalised — §10 forbids a starting state that is already losing.
 */
export function ambienceBonus(points: number, condition = 1): number {
  const ONE = 1;
  if (points <= 0) return ONE;
  const kept = Math.max(AMBIENCE.CONDITION_FLOOR, Math.min(ONE, condition));
  const curve = ONE - Math.exp(-AMBIENCE.DECAY_PER_POINT * points);
  return ONE + AMBIENCE.MAX_PATIENCE_BONUS * curve * kept;
}

/** The same curve against a smaller ceiling. §6.4 — décor lifts spend too. */
export function ambienceSpendBonus(points: number, condition = 1): number {
  const ONE = 1;
  if (points <= 0) return ONE;
  const kept = Math.max(AMBIENCE.CONDITION_FLOOR, Math.min(ONE, condition));
  const curve = ONE - Math.exp(-AMBIENCE.DECAY_PER_POINT * points);
  return ONE + AMBIENCE.MAX_SPEND_BONUS * curve * kept;
}
