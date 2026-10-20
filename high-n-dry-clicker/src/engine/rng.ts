/**
 * Deterministic seeded RNG (mulberry32). Same seed + same input tape = same result, or the playbot
 * is worthless (BUILD_BRIEF §5). Every roll in the game goes through an instance of this — golden
 * patty timers, effect selection, ticker line choice.
 *
 * State is a single integer so it round-trips through a save with no special handling.
 */
const ADVANCE = 0x6d2b79f5;
const SHIFT_A = 15;
const SHIFT_B = 7;
const SHIFT_C = 14;
const MIX_A = 61;
const UINT32 = 4294967296;

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + ADVANCE) | 0;
    let t = Math.imul(this.state ^ (this.state >>> SHIFT_A), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> SHIFT_B), MIX_A | t)) ^ t;
    return ((t ^ (t >>> SHIFT_C)) >>> 0) / UINT32;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniform pick. Throws on an empty list — that's a content bug, not a runtime one. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: empty array");
    const index = Math.floor(this.next() * items.length);
    return items[index] as T;
  }

  /** Weighted pick. Weights must be positive. */
  pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    if (items.length === 0) throw new Error("Rng.pickWeighted: empty array");
    let total = 0;
    for (const item of items) total += weightOf(item);
    let roll = this.next() * total;
    for (const item of items) {
      roll -= weightOf(item);
      if (roll <= 0) return item;
    }
    return items[items.length - 1] as T;
  }

  getState(): number {
    return this.state;
  }

  static fromState(state: number): Rng {
    const rng = new Rng(0);
    rng.state = state >>> 0;
    return rng;
  }
}
