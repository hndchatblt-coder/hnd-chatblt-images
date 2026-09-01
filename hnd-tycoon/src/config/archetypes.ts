/**
 * Who walks in. DESIGN.md §6.2.
 *
 * "Archetype must be visible in silhouette and on the ticket. A table of six at
 * 7:15pm Saturday should produce dread before the player reads a number."
 *
 * These are mechanical, not decorative: patience drives balking, spend drives
 * revenue, review rate drives how loudly they complain. A Deliveroo-brain
 * expects app speed in a dining room and rates you harshly for not providing
 * it; a Regular forgives one bad experience and not two.
 */
export interface Archetype {
  readonly id: string;
  readonly label: string;
  /** Relative frequency. Normalised at use. */
  readonly weight: number;
  /** Multiplies the balk patience window. §6.3 */
  readonly patience: number;
  /** Multiplies spend per head. */
  readonly spend: number;
  /** Multiplies the chance they leave a review at all. §7.4 */
  readonly reviewRate: number;
  /** Covers they occupy, and items they order. */
  readonly quantity: number;
}

/**
 * The table as authored. `patience` here is RELATIVE — see `ARCHETYPES` below,
 * which is what the simulation actually reads.
 */
const AUTHORED: readonly Archetype[] = [
  {
    id: 'regular',
    label: 'Regular',
    weight: 0.42,
    patience: 1.6,
    spend: 0.92,
    reviewRate: 1.4,
    quantity: 1,
  },
  {
    id: 'passerby',
    label: 'Passer-by',
    weight: 0.34,
    patience: 0.6,
    spend: 1.15,
    reviewRate: 0.5,
    quantity: 1,
  },
  {
    // One order, six items, enormous burst. Dread before you read a number.
    id: 'tableOfSix',
    label: 'Table of six',
    weight: 0.08,
    patience: 1.0,
    spend: 1.0,
    reviewRate: 1.0,
    quantity: 6,
  },
  {
    id: 'deliverooBrain',
    label: 'App-speed',
    weight: 0.16,
    patience: 0.35,
    spend: 1.0,
    reviewRate: 2.2,
    quantity: 1,
  },
];

const TOTAL_WEIGHT = AUTHORED.reduce((sum, a) => sum + a.weight, 0);

/**
 * The **harmonic** mean of patience, weighted. 0.73 as authored.
 *
 * Harmonic, not arithmetic, because balking is convex in patience: the odds run
 * as `over / (window * patience)`, so halving one customer's patience costs
 * more than doubling another's saves. The arithmetic mean of this table is
 * 1.012 — it looks perfectly balanced and it is not. Measured, the raw table
 * made the shop shed 9% of a QUIET Monday, which is a different business.
 *
 * The consequence was not subtle. It made a second staffer pay for themselves
 * on every day of the week (+$19k over eight weeks on a seven-day roster), so
 * "which days do I need someone" stopped being a question and became "hire
 * more" — the exact collapse the roster exists to prevent.
 *
 * Dividing by it preserves the SPREAD, which is the whole of §6.2, while
 * leaving the average customer as patient as §6.3 calibrated them. Exactly what
 * `DAYPART_MEAN` does for the daypart curve, and for the same reason: shape
 * must never silently move level.
 */
export const ARCHETYPE_PATIENCE_MEAN =
  TOTAL_WEIGHT / AUTHORED.reduce((sum, a) => sum + a.weight / a.patience, 0);

/**
 * What the simulation reads. Patience is normalised; everything else is as
 * authored. Nothing downstream ever sees the raw number, so there is no way to
 * use the un-normalised value by forgetting to.
 */
export const ARCHETYPES: readonly Archetype[] = AUTHORED.map((a) => ({
  ...a,
  patience: a.patience / ARCHETYPE_PATIENCE_MEAN,
}));

export const ARCHETYPE_BY_ID: Readonly<Record<string, Archetype>> = Object.fromEntries(
  ARCHETYPES.map((a) => [a.id, a]),
);

/**
 * Covers per arrival, averaged over the table. 1.4 as written.
 *
 * Arrivals divide the hourly rate by this, exactly as `daypartMultiplier`
 * divides by its own mean, and for the same reason: **the shape of demand must
 * never silently change its volume.**
 *
 * Without it, adding the table of six raised covers per arrival by 40% while
 * leaving wages alone, which made labour 40% cheaper in real terms — measured,
 * and it inverted the step 7b result outright: a seven-day roster went from the
 * worst option to the best by $15k over eight weeks. That is not a design
 * change anybody chose, it is a units bug wearing a design change's clothes.
 *
 * The dread is meant to come from the LUMPINESS, not from free money. Same
 * covers, arriving six at a time.
 */
export const ARCHETYPE_MEAN_QUANTITY =
  ARCHETYPES.reduce((sum, a) => sum + a.weight * a.quantity, 0) / TOTAL_WEIGHT;

/**
 * What an order with no archetype behaves like: exactly the customer the game
 * had before §6.2 existed. Used by the harness and by any order built outside
 * arrivals, so that a missing archetype degrades to "average" rather than to a
 * crash or to a silent zero.
 */
export const NEUTRAL_ARCHETYPE: Archetype = {
  id: 'neutral',
  label: 'Customer',
  weight: 0,
  patience: 1,
  spend: 1,
  reviewRate: 1,
  quantity: 1,
};

export function archetypeOf(id: string | null | undefined): Archetype {
  if (id === null || id === undefined) return NEUTRAL_ARCHETYPE;
  return ARCHETYPE_BY_ID[id] ?? NEUTRAL_ARCHETYPE;
}
