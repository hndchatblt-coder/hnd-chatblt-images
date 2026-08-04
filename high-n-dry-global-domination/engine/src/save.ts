import { GameStateSchema, type GameState } from "./state.js";

/**
 * Storage adapter interface (GAME_DESIGN §1: "in-memory in previews, real storage in builds").
 * The engine never touches localStorage/IndexedDB/etc. directly — a UI build supplies a real
 * adapter; tests and headless sims use InMemoryStorageAdapter.
 */
export interface StorageAdapter {
  save(key: string, serialized: string): void;
  load(key: string): string | null;
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();

  save(key: string, serialized: string): void {
    this.store.set(key, serialized);
  }

  load(key: string): string | null {
    return this.store.get(key) ?? null;
  }
}

const SAVE_KEY = "high-n-dry:save";

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

/** Throws if the saved JSON doesn't match GameStateSchema — a corrupted or stale save is a loud failure, not silent data loss. */
export function deserializeState(serialized: string): GameState {
  return GameStateSchema.parse(JSON.parse(serialized));
}

export function saveState(adapter: StorageAdapter, state: GameState, key = SAVE_KEY): void {
  adapter.save(key, serializeState(state));
}

/** Returns null if there's no save yet — distinct from a corrupted save, which throws. */
export function loadState(adapter: StorageAdapter, key = SAVE_KEY): GameState | null {
  const raw = adapter.load(key);
  if (raw === null) return null;
  return deserializeState(raw);
}
