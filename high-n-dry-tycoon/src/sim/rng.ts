/**
 * Determinism (§13). Same seed plus same inputs must give byte-identical output, or the balance
 * harness is worthless and no bug is ever reproducible.
 *
 * Every stochastic draw in the sim goes through here. There is no `Math.random` anywhere in
 * `src/sim` and a test asserts that.
 */
import seedrandom from "seedrandom";

export class Rng {
  private readonly gen: seedrandom.PRNG;

  constructor(seed: string | number) {
    this.gen = seedrandom(String(seed));
  }

  /** [0, 1) */
  next(): number {
    return this.gen();
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + this.gen() * (max - min);
  }

  int(minInclusive: number, maxExclusive: number): number {
    return Math.floor(this.range(minInclusive, maxExclusive));
  }

  chance(p: number): boolean {
    return this.gen() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick from empty list");
    return items[this.int(0, items.length)] as T;
  }

  /**
   * Poisson by Knuth's method. Arrivals are Poisson because a restaurant is bursty — a smooth
   * trickle of customers is not a restaurant, and the burstiness is what makes queues form
   * (§4.2). Lambda per tick is tiny, so the loop almost always exits immediately.
   */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    // Guard: Knuth degenerates for large lambda. Nothing in this sim should get near it.
    if (lambda > 30) throw new Error(`poisson lambda too large: ${lambda}`);
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= this.gen();
    } while (p > limit);
    return k - 1;
  }
}
