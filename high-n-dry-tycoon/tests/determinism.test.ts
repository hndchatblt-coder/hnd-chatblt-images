/**
 * The gate for M0: same seed, byte-identical output. If this ever fails, the balance harness is
 * worthless and no bug is reproducible (§13).
 */
import { describe, expect, it } from "vitest";
import { createWorld, runDays, tick } from "../src/sim/world.js";
import { dayLine, summary } from "../src/sim/report.js";
import { Rng } from "../src/sim/rng.js";

const transcript = (seed: string, days: number, staffCount = 2): string => {
  const world = createWorld({ seed, staffCount });
  runDays(world, days);
  return [...world.history.map(dayLine), summary(world)].join("\n");
};

describe("determinism", () => {
  it("produces byte-identical output for the same seed", () => {
    expect(transcript("42", 7)).toBe(transcript("42", 7));
  });

  it("produces different output for a different seed", () => {
    // Guards against the opposite failure: a sim that is deterministic because it is not random.
    expect(transcript("42", 7)).not.toBe(transcript("43", 7));
  });

  it("is identical whether run in one call or many", () => {
    // Speed multipliers process more ticks; they must never change dt or the outcome (§4.1).
    const a = createWorld({ seed: "42", staffCount: 2 });
    runDays(a, 3);

    const b = createWorld({ seed: "42", staffCount: 2 });
    runDays(b, 1);
    runDays(b, 1);
    runDays(b, 1);

    expect(b.history.map(dayLine)).toEqual(a.history.map(dayLine));
    expect(b.cash).toBeCloseTo(a.cash, 10);
  });

  it("advances game time by exactly dt per tick regardless of anything else", () => {
    const world = createWorld({ seed: "1", staffCount: 1 });
    const before = world.clock.elapsed;
    tick(world);
    const step = world.clock.elapsed - before;
    for (let i = 0; i < 500; i += 1) {
      const at = world.clock.elapsed;
      tick(world);
      expect(world.clock.elapsed - at).toBeCloseTo(step, 12);
    }
  });
});

describe("rng", () => {
  it("is reproducible from a seed", () => {
    const a = new Rng("x");
    const b = new Rng("x");
    const draws = Array.from({ length: 50 }, () => a.next());
    expect(draws).toEqual(Array.from({ length: 50 }, () => b.next()));
  });

  it("samples poisson with the right mean", () => {
    const rng = new Rng("p");
    const n = 40000;
    let total = 0;
    for (let i = 0; i < n; i += 1) total += rng.poisson(0.7);
    expect(total / n).toBeGreaterThan(0.65);
    expect(total / n).toBeLessThan(0.75);
  });

  it("refuses a lambda it cannot sample correctly", () => {
    expect(() => new Rng("p").poisson(1e6)).toThrow();
  });
});
