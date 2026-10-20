import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng.js";

describe("Rng", () => {
  it("is deterministic: same seed, same sequence", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("produces values in [0, 1)", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("intRange is inclusive on both ends and stays in bounds", () => {
    const rng = new Rng(123);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.intRange(1, 3));
    expect(seen).toEqual(new Set([1, 2, 3]));
  });

  it("fromState resumes a sequence exactly where it left off", () => {
    const original = new Rng(99);
    original.next();
    original.next();
    const snapshot = original.getState();
    const expected = original.next();

    const resumed = Rng.fromState(snapshot);
    expect(resumed.next()).toBe(expected);
  });

  it("pick throws on an empty array", () => {
    const rng = new Rng(1);
    expect(() => rng.pick([])).toThrow();
  });
});
