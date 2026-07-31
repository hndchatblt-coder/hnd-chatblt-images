/**
 * The line — where each station stands on the bench, and what that's worth.
 *
 * PLAN_THE_LINE.md PART TWO. The bench is bays running left to right in the order food travels:
 * prep → cook → assemble → serve. Two bonuses come out of a good arrangement:
 *
 *   flow    — each adjacent pair whose roles are in order pays `flowBonus`, globally
 *   pairing — a person standing next to equipment of their own role pays `pairBonus` to that
 *             equipment's generator
 *
 * There are deliberately **more placeable stations than bays**. Everything you own produces
 * normally wherever it is; the bench is only where the *bonuses* live. So the decision is which
 * three stations get the good spots, and that changes over a run as different generators come to
 * dominate your income. (With as many bays as stations the default line was already optimal and
 * the whole system was inert — measured, not guessed.)
 *
 * **Both bonuses floor at zero.** Hard rule 4 says the game never punishes, so every arrangement scores at
 * least 1.0× and a bad line costs you an unearned bonus, never output. The combined result is
 * capped at `maxMultiplier`, deliberately worth less than a single tier upgrade, so a player who
 * never touches this is playing the game correctly. Assertions A7–A9 hold all three of those
 * claims to account.
 *
 * Pure and deterministic: no DOM, no RNG, no clock.
 */
import { config, type EconomyConfig } from "./config.js";

const ZERO = 0;
const ONE = 1;
/** A bay with nothing in it. */
export const EMPTY = -1;

export interface LayoutScore {
  /** Global multiplier from flow. Always ≥ 1. */
  flowMult: number;
  /** Per-generator multiplier from pairing, parallel to the generator ladder. Always ≥ 1. */
  generatorMults: number[];
  /** flowMult × the largest pairing bonus in play — what the UI shows and A8 bounds. */
  total: number;
  /** How many adjacent pairs are in food order. */
  orderedPairs: number;
  /** Generator indices currently getting a pairing bonus. */
  paired: number[];
}

/** Which bays a player can actually arrange. The grill is plumbed in and never moves. */
export function placeableGenerators(c: EconomyConfig = config): number[] {
  return c.layout.placeable;
}

/**
 * The default line: the first few stations in unlock order. There are more placeable stations
 * than bays, so the rest simply aren't on the bench — they still produce, they just earn no
 * bonus until you put them somewhere.
 */
export function defaultLayout(c: EconomyConfig = config): number[] {
  const bays = new Array<number>(c.layout.bays).fill(EMPTY);
  c.layout.placeable.forEach((generatorIndex, bay) => {
    if (bay < bays.length) bays[bay] = generatorIndex;
  });
  return bays;
}

/**
 * Repairs a layout so it always describes a legal line: right length, no duplicates, only
 * placeable stations, anything missing appended. A corrupt or hand-edited save can never produce
 * a layout that scores worse than the default.
 */
export function normalizeLayout(input: unknown, c: EconomyConfig = config): number[] {
  const bays = new Array<number>(c.layout.bays).fill(EMPTY);
  const allowed = new Set(c.layout.placeable);
  const seen = new Set<number>();

  if (Array.isArray(input)) {
    for (let bay = ZERO; bay < bays.length; bay += ONE) {
      const value = input[bay];
      if (typeof value !== "number" || !allowed.has(value) || seen.has(value)) continue;
      bays[bay] = value;
      seen.add(value);
    }
  }

  return bays;
}

function roleRank(generatorIndex: number, c: EconomyConfig): number {
  const role = c.layout.generatorRoles[generatorIndex];
  if (!role) return EMPTY;
  return c.layout.roleOrder.indexOf(role);
}

/**
 * What a line is worth. Only stations you actually own count — an empty bay is neither a bonus
 * nor a penalty, it's just a gap in the bench.
 */
export function scoreLayout(
  layout: number[],
  owned: number[],
  c: EconomyConfig = config,
): LayoutScore {
  const generatorMults = c.generators.list.map(() => ONE);
  const paired: number[] = [];
  let orderedPairs = ZERO;

  /** The stations actually standing on the bench, left to right, skipping gaps. */
  const line = layout.filter(
    (generatorIndex) => generatorIndex !== EMPTY && (owned[generatorIndex] ?? ZERO) > ZERO,
  );

  for (let i = ZERO; i + ONE < line.length; i += ONE) {
    const left = line[i] as number;
    const right = line[i + ONE] as number;
    const leftRank = roleRank(left, c);
    const rightRank = roleRank(right, c);
    if (leftRank === EMPTY || rightRank === EMPTY) continue;

    // Flow: food moves left to right, so the left station's role must not come after the right's.
    if (leftRank <= rightRank) orderedPairs += ONE;

    // Pairing: a person next to equipment of their own role works that equipment harder.
    for (const [person, kit] of [
      [left, right],
      [right, left],
    ] as const) {
      if (
        c.layout.generatorIsPerson[person] === true &&
        c.layout.generatorIsPerson[kit] === false &&
        c.layout.generatorRoles[person] === c.layout.generatorRoles[kit]
      ) {
        generatorMults[kit] = (generatorMults[kit] ?? ONE) * (ONE + c.layout.pairBonus);
        if (!paired.includes(kit)) paired.push(kit);
      }
    }
  }

  const flowMult = ONE + orderedPairs * c.layout.flowBonus;
  const bestPair = generatorMults.reduce((a, b) => Math.max(a, b), ONE);
  const total = Math.min(c.layout.maxMultiplier, flowMult * bestPair);

  return { flowMult, generatorMults, total, orderedPairs, paired };
}

/**
 * What a line is worth in actual output, given each generator's share of production.
 *
 * This is the objective AUTO maximises. Scoring the abstract multiplier instead would be wrong:
 * a 15% pairing bonus on a station earning 2% of your income is worth far less than the same
 * bonus on the one carrying you, and which station that is changes across a run.
 */
export function layoutValue(
  layout: number[],
  owned: number[],
  weights: number[],
  c: EconomyConfig = config,
): number {
  const score = scoreLayout(layout, owned, c);
  let total = ZERO;
  for (let i = ZERO; i < weights.length; i += ONE) {
    total += (weights[i] ?? ZERO) * (score.generatorMults[i] ?? ONE);
  }
  return total * score.flowMult;
}

/**
 * The best arrangement of what you own — what AUTO does.
 *
 * Exhaustive over permutations of the placeable stations. With the configured bay count that's a
 * handful of arrangements, so this is genuinely optimal rather than a heuristic, which is what
 * lets AUTO be a one-tap answer instead of a chore (PLAN_THE_LINE.md 3.4). A9 asserts it.
 */
export function bestLayout(
  owned: number[],
  weights: number[],
  c: EconomyConfig = config,
): number[] {
  const stations = c.layout.placeable.filter((index) => (owned[index] ?? ZERO) > ZERO);
  let best = defaultLayout(c);
  let bestValue = layoutValue(best, owned, weights, c);

  // Every ordered selection of `bays` stations out of the ones you own. With the configured bay
  // count this is a few hundred arrangements at most, so it's exact rather than a heuristic —
  // which is what lets AUTO honestly be a one-tap answer (A9).
  const walk = (chosen: number[], remaining: number[]): void => {
    if (chosen.length === Math.min(c.layout.bays, stations.length)) {
      const candidate = [...chosen];
      while (candidate.length < c.layout.bays) candidate.push(EMPTY);
      const value = layoutValue(candidate, owned, weights, c);
      if (value > bestValue) {
        bestValue = value;
        best = candidate;
      }
      return;
    }
    for (let i = ZERO; i < remaining.length; i += ONE) {
      const next = remaining[i] as number;
      walk([...chosen, next], [...remaining.slice(ZERO, i), ...remaining.slice(i + ONE)]);
    }
  };
  walk([], stations);

  // Keep the chosen bays exactly as found; only pad the tail.
  const result = new Array<number>(c.layout.bays).fill(EMPTY);
  best.forEach((v, i) => {
    if (i < result.length) result[i] = v;
  });
  return result;
}

/** Production share per generator — the weights `bestLayout` and `layoutValue` want. */
export function productionWeights(
  owned: number[],
  generatorMults: number[],
  c: EconomyConfig = config,
): number[] {
  return c.generators.list.map(
    (def, i) => (owned[i] ?? ZERO) * def.baseRate * (generatorMults[i] ?? ONE),
  );
}

/** Swaps two bays. Returns a new array — state is never mutated in place here. */
export function swapBays(layout: number[], a: number, b: number, c: EconomyConfig = config): number[] {
  const next = normalizeLayout(layout, c);
  if (a < ZERO || b < ZERO || a >= next.length || b >= next.length) return next;
  const held = next[a] as number;
  next[a] = next[b] as number;
  next[b] = held;
  return next;
}
