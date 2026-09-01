/**
 * Seeded, deterministic PRNG. DESIGN.md §25.1.
 *
 * Determinism is a GATE, not a nicety: `npm run sim -- --days 7 --seed 42`
 * must produce byte-identical output on every run and every machine.
 * Math.random is banned in sim/ and the boundary check enforces it.
 *
 * mulberry32: fast, tiny, well-distributed, and — critically — its state is
 * a single uint32, so it serialises trivially into the save file.
 */
export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'string' ? Rng.hashString(seed) : seed >>> 0;
  }

  static hashString(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  bool(pTrue: number): boolean {
    return this.next() < pTrue;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /**
   * Number of Poisson events in one interval with the given mean.
   * Arrivals are a Poisson process — bursty by design. DESIGN.md §6.1.
   * Knuth's method; fine for the small lambdas a single tick produces.
   */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }

  /** Exact state for save files. */
  serialise(): number {
    return this.state;
  }

  static deserialise(state: number): Rng {
    const r = new Rng(0);
    r.state = state >>> 0;
    return r;
  }

  /**
   * Independent named stream. Use one per system so that adding a new
   * consumer of randomness does not change every other system's sequence.
   * This matters enormously for balance work.
   */
  fork(name: string): Rng {
    return new Rng((this.state ^ Rng.hashString(name)) >>> 0);
  }
}
