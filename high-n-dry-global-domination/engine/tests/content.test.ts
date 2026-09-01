import { describe, expect, it } from "vitest";
import { loadAllContent, loadEconomyConfig } from "../src/content/load.js";

describe("content loaders", () => {
  it("loads and validates economy.config.json", () => {
    const config = loadEconomyConfig();
    expect(config.version).toBe("0.3.0");
    expect(config.activeLayer.startingCash).toBe(260);
  });

  it("loads and validates every content file", () => {
    const content = loadAllContent();
    expect(content.tiles.tiles.length).toBeGreaterThan(0);
    expect(content.managers.managers.length).toBeGreaterThan(0);
    expect(content.rivals.rivals.length).toBeGreaterThan(0);
    expect(content.specials.patties.length).toBeGreaterThan(0);
  });

  it("Leichhardt is tile #1, per content/tiles.json's own contract", () => {
    const { tiles } = loadAllContent().tiles;
    expect(tiles[0]?.id).toBe("syd-leichhardt");
    expect(tiles[0]?.owner).toBe("player");
  });
});
