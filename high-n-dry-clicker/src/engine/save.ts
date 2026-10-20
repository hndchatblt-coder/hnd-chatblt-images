/**
 * Save/load. Storage sits behind an adapter (BUILD_BRIEF §5) so the engine never touches
 * localStorage directly — the browser supplies a real adapter, tests and the playbot use memory.
 * The format is versioned with a migration path from day one.
 */
import { config, type EconomyConfig } from "./config.js";
import { createInitialState, type GameState } from "./state.js";
import { normalizeLayout } from "./layout.js";

const ZERO = 0;
const ONE = 1;

export interface StorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();
  read(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  write(key: string, value: string): void {
    this.store.set(key, value);
  }
  remove(key: string): void {
    this.store.delete(key);
  }
}

/** Browser adapter. Fails soft — a full or blocked storage must never break the game. */
export class LocalStorageAdapter implements StorageAdapter {
  read(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  write(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* out of quota or blocked — the run continues, it just won't persist */
    }
  }
  remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* nothing to do */
    }
  }
}

/**
 * Migrations, keyed by the version they upgrade *from*. Empty today (v1 is the first format), but
 * the mechanism ships now so a v1 save can never be orphaned later.
 */
type Migration = (save: Record<string, unknown>) => Record<string, unknown>;
const migrations: Record<number, Migration> = {};

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parses, migrates and repairs a save. Returns null if it isn't usable at all. */
export function deserialize(text: string, c: EconomyConfig = config): GameState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  let save = parsed as Record<string, unknown>;
  let version = typeof save.schemaVersion === "number" ? save.schemaVersion : ZERO;
  while (version < c.save.schemaVersion) {
    const migrate = migrations[version];
    if (!migrate) break;
    save = migrate(save);
    version += ONE;
  }
  save.schemaVersion = c.save.schemaVersion;

  return repair(save, c);
}

/**
 * Fills anything missing from a fresh state. A save from an older build that lacks a newer field
 * loads and keeps its progress rather than being thrown away.
 */
function repair(save: Record<string, unknown>, c: EconomyConfig): GameState {
  const seed = typeof save.seed === "number" ? save.seed : ZERO;
  const base = createInitialState(seed, ZERO, c);
  const merged = { ...base, ...save } as GameState;

  merged.golden = { ...base.golden, ...(save.golden as object | undefined) } as GameState["golden"];
  merged.stats = { ...base.stats, ...(save.stats as object | undefined) } as GameState["stats"];

  // Generator array must always match the configured ladder length.
  const generators = Array.isArray(save.generators) ? (save.generators as number[]) : [];
  merged.generators = c.generators.list.map((_, i) => {
    const value = generators[i];
    return typeof value === "number" && Number.isFinite(value) ? value : ZERO;
  });

  // A layout from any older save (or none at all) normalises to a legal, ≥1.0x line.
  merged.layout = normalizeLayout(save.layout, c);

  merged.upgrades = toStringArray(save.upgrades);
  merged.achievements = toStringArray(save.achievements);
  merged.perks = toStringArray(save.perks);
  merged.purchaseOrder = toStringArray(save.purchaseOrder);
  merged.golden.activeEffects = Array.isArray(merged.golden.activeEffects)
    ? merged.golden.activeEffects
    : [];

  return merged;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function save(adapter: StorageAdapter, state: GameState, c: EconomyConfig = config): void {
  adapter.write(c.save.storageKey, serialize(state));
}

export function load(adapter: StorageAdapter, c: EconomyConfig = config): GameState | null {
  const text = adapter.read(c.save.storageKey);
  if (text === null) return null;
  return deserialize(text, c);
}

export function clearSave(adapter: StorageAdapter, c: EconomyConfig = config): void {
  adapter.remove(c.save.storageKey);
}

/** Export/import string for moving a save between devices. Base64 so it survives a paste. */
export function exportSave(state: GameState): string {
  const json = serialize(state);
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(encodeURIComponent(json));
  }
  return Buffer.from(json, "utf-8").toString("base64");
}

export function importSave(text: string, c: EconomyConfig = config): GameState | null {
  let json: string;
  try {
    json =
      typeof globalThis.atob === "function"
        ? decodeURIComponent(globalThis.atob(text.trim()))
        : Buffer.from(text.trim(), "base64").toString("utf-8");
  } catch {
    return null;
  }
  return deserialize(json, c);
}
