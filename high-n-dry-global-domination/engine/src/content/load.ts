import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  EconomyConfigSchema,
  ManagersContentSchema,
  RivalsContentSchema,
  SpecialsContentSchema,
  TilesContentSchema,
  type EconomyConfig,
  type ManagersContent,
  type RivalsContent,
  type SpecialsContent,
  type TilesContent,
} from "./schemas.js";

// engine/src/content/load.ts -> repo root is three levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function readJson(relativePath: string): unknown {
  const path = join(REPO_ROOT, relativePath);
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** Loads and validates economy.config.json. Throws on any schema violation — config is law. */
export function loadEconomyConfig(): EconomyConfig {
  return EconomyConfigSchema.parse(readJson("economy.config.json"));
}

export function loadTiles(): TilesContent {
  return TilesContentSchema.parse(readJson("content/tiles.json"));
}

export function loadManagers(): ManagersContent {
  return ManagersContentSchema.parse(readJson("content/managers.json"));
}

export function loadRivals(): RivalsContent {
  return RivalsContentSchema.parse(readJson("content/rivals.json"));
}

export function loadSpecials(): SpecialsContent {
  return SpecialsContentSchema.parse(readJson("content/specials.json"));
}

/** Loads every content file, validated. A single call site for "did all my content load". */
export function loadAllContent() {
  return {
    tiles: loadTiles(),
    managers: loadManagers(),
    rivals: loadRivals(),
    specials: loadSpecials(),
  };
}
