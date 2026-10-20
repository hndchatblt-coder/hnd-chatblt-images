import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../src/save/save.js";
import { dayLine } from "../src/sim/report.js";
import { createWorld, runDays } from "../src/sim/world.js";

describe("save and load", () => {
  it("round-trips and keeps playing the same game", () => {
    const original = createWorld({ seed: "77", staffCount: 3 });
    runDays(original, 5);

    const restored = deserialize(serialize(original));
    expect(restored).not.toBeNull();
    if (!restored) return;

    expect(restored.cash).toBeCloseTo(original.cash, 6);
    expect(restored.reputation).toBeCloseTo(original.reputation, 6);
    expect(restored.history.map(dayLine)).toEqual(original.history.map(dayLine));

    // The real test: continuing from a save must match never having saved at all.
    runDays(original, 3);
    runDays(restored, 3);
    expect(restored.history.map(dayLine)).toEqual(original.history.map(dayLine));
    expect(restored.cash).toBeCloseTo(original.cash, 6);
  });

  it("refuses rubbish rather than loading half a world", () => {
    expect(deserialize("not json")).toBeNull();
    expect(deserialize("[]")).toBeNull();
  });
});
