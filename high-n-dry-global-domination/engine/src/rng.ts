/**
 * Deterministic seeded RNG (mulberry32). Every roll the active layer makes — order
 * generation, banger/flop, flyer conversion, coin drops, tip windows — goes through an
 * instance of this so a recorded input log replays to an identical outcome (GAME_DESIGN §1,
 * CLAUDE.md "Determinism where possible").
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** True with probability p (0-1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Integer in [min, max], inclusive. */
  intRange(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  floatRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Picks a uniformly random element. Throws on an empty array — a content bug, not a runtime one. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: empty array");
    return items[this.intRange(0, items.length - 1)] as T;
  }

  /** Current internal state, so it can be snapshotted into a save or a replay log header. */
  getState(): number {
    return this.state;
  }

  /** Restores a previously captured state — used by save/load and replay. */
  static fromState(state: number): Rng {
    const rng = new Rng(0);
    rng.state = state;
    return rng;
  }
}
