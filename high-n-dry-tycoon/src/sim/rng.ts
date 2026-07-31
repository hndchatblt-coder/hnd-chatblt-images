/**
 * Determinism (§13). Same seed plus same inputs must give byte-identical output, or the balance
 * harness is worthless and no bug is ever reproducible.
 *
 * Every stochastic draw in the sim goes through here — there is no direct use of the platform
 * random anywhere in `src/sim`, and a test asserts it. `calls` is tracked so a save can replay
 * the generator to exactly where it was rather than forking the sequence on reload.
 */
import seedrandom from "seedrandom";

/** Knuth's Poisson degenerates for large lambda. Nothing in this sim should get near it. */
const POISSON_LAMBDA_LIMIT = 30;

export class Rng {
  private readonly gen: seedrandom.PRNG;
  calls = 0;

  constructor(seed: string | number) {
    this.gen = seedrandom(String(seed));
  }

  /** [0, 1) — the only place a raw number is drawn. */
  next(): number {
    this.calls += 1;
    return this.gen();
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(minInclusive: number, maxExclusive: number): number {
    return Math.floor(this.range(minInclusive, maxExclusive));
  }

  chance(p: number): boolean {
    return this.next() < p;
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
    if (lambda > POISSON_LAMBDA_LIMIT) throw new Error(`poisson lambda too large: ${lambda}`);
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= this.next();
    } while (p > limit);
    return k - 1;
  }
}
