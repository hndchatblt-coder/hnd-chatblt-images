import { describe, expect, it } from "vitest";
import { config } from "../src/engine/config.js";
import { buyGenerator, tap, tick } from "../src/engine/engine.js";
import {
  clearSave,
  deserialize,
  exportSave,
  importSave,
  load,
  MemoryStorageAdapter,
  save,
  serialize,
} from "../src/engine/save.js";
import { createInitialState } from "../src/engine/state.js";

function playedState() {
  const s = createInitialState(7, 1_700_000_000_000);
  s.cash = 5000;
  buyGenerator(s, 0, 12);
  tap(s);
  tick(s, 30);
  return s;
}

describe("save/load", () => {
  it("round-trips exactly", () => {
    const s = playedState();
    const restored = deserialize(serialize(s));
    expect(restored).toEqual(s);
  });

  it("round-trips through a storage adapter", () => {
    const adapter = new MemoryStorageAdapter();
    const s = playedState();
    save(adapter, s);
    expect(load(adapter)).toEqual(s);
  });

  it("returns null when there is no save", () => {
    expect(load(new MemoryStorageAdapter())).toBeNull();
  });

  it("clearing removes the save", () => {
    const adapter = new MemoryStorageAdapter();
    save(adapter, playedState());
    clearSave(adapter);
    expect(load(adapter)).toBeNull();
  });

  it("rejects unparseable text rather than throwing", () => {
    expect(deserialize("not json at all")).toBeNull();
    expect(deserialize("42")).toBeNull();
  });

  it("repairs a save missing newer fields instead of discarding progress", () => {
    const s = playedState();
    const partial = JSON.parse(serialize(s)) as Record<string, unknown>;
    delete partial.perks;
    delete partial.achievements;
    delete partial.stats;
    const restored = deserialize(JSON.stringify(partial));
    expect(restored).not.toBeNull();
    expect(restored!.cash).toBe(s.cash);
    expect(restored!.generators).toEqual(s.generators);
    expect(restored!.perks).toEqual([]);
  });

  it("resizes the generator array if the ladder grew", () => {
    const s = playedState();
    const partial = JSON.parse(serialize(s)) as Record<string, unknown>;
    partial.generators = [3, 4];
    const restored = deserialize(JSON.stringify(partial));
    expect(restored!.generators).toHaveLength(config.generators.list.length);
    expect(restored!.generators[0]).toBe(3);
    expect(restored!.generators[1]).toBe(4);
    expect(restored!.generators[2]).toBe(0);
  });

  it("stamps the current schema version", () => {
    const s = playedState();
    const partial = JSON.parse(serialize(s)) as Record<string, unknown>;
    partial.schemaVersion = 0;
    expect(deserialize(JSON.stringify(partial))!.schemaVersion).toBe(config.save.schemaVersion);
  });

  it("export/import survives a round trip", () => {
    const s = playedState();
    const imported = importSave(exportSave(s));
    expect(imported).toEqual(s);
  });

  it("import rejects rubbish", () => {
    expect(importSave("!!!! not base64 !!!!")).toBeNull();
  });
});
