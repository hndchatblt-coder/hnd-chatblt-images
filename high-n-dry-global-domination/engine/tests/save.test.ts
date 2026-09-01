import { describe, expect, it } from "vitest";
import { loadEconomyConfig } from "../src/content/load.js";
import {
  InMemoryStorageAdapter,
  deserializeState,
  loadState,
  saveState,
  serializeState,
} from "../src/save.js";
import { createInitialState } from "../src/state.js";

const config = loadEconomyConfig();

describe("save/load round-trip", () => {
  it("serialize -> deserialize reproduces the exact same state", () => {
    const state = createInitialState(config, 12345);
    state.cash = 517.25;
    state.economyClock.gameMinutes = 900;

    const restored = deserializeState(serializeState(state));
    expect(restored).toEqual(state);
  });

  it("round-trips through a StorageAdapter", () => {
    const adapter = new InMemoryStorageAdapter();
    const state = createInitialState(config, 1);
    saveState(adapter, state);

    const restored = loadState(adapter);
    expect(restored).toEqual(state);
  });

  it("loadState returns null when there is no save yet (distinct from a corrupted one)", () => {
    const adapter = new InMemoryStorageAdapter();
    expect(loadState(adapter)).toBeNull();
  });

  it("a fresh save starts with the configured starting cash and no losses possible (Pillar 1)", () => {
    const state = createInitialState(config, 1);
    expect(state.cash).toBe(config.activeLayer.startingCash);
    expect(state.lifetimeProfit).toBe(0);
  });

  it("rejects a corrupted save instead of silently coercing it", () => {
    expect(() => deserializeState(JSON.stringify({ not: "a save" }))).toThrow();
  });
});
