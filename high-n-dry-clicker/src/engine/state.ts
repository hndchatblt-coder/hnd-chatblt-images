/**
 * Game state shape. Pure data — serialisable as-is, no class instances, no DOM references, so a
 * save is just `JSON.stringify(state)` and the playbot runs the same shape the UI does.
 */
import { config, type EconomyConfig, type GoldenEffectType } from "./config.js";
import { defaultLayout } from "./layout.js";
import { Rng } from "./rng.js";

const ZERO = 0;

export interface ActiveEffect {
  effectId: string;
  type: GoldenEffectType;
  value: number;
  endsAt: number;
}

export interface GoldenOnScreen {
  effectId: string;
  spawnedAt: number;
  expiresAt: number;
}

export interface GameState {
  schemaVersion: number;
  seed: number;
  rngState: number;

  /** Engine clock, seconds. Monotonic within a session; survives saves. */
  timeSeconds: number;
  /** Wall clock of the last settle, ms. Used only for offline settlement. */
  wallClockMs: number;

  cash: number;
  /** Revenue earned in the current run — reset by selling the business. */
  runRevenue: number;
  /** Revenue across every run — never reset; drives Goodwill. */
  lifetimeRevenue: number;
  burgersSold: number;
  taps: number;

  /** Owned count per generator, parallel to config.generators.list. */
  generators: number[];
  /** Purchased upgrade ids (tier ids are derived, e.g. `tier:fryer:0`). */
  upgrades: string[];
  /**
   * Where each station stands on the bench: bay index → generator index, -1 for an empty bay.
   * Defaults to unlock order, which scores 1.0× — so an untouched line is never worse off.
   */
  layout: number[];
  achievements: string[];
  /** Generator ids in first-purchase order, for `boughtBefore` achievement triggers. */
  purchaseOrder: string[];

  goodwill: number;
  /** Total Goodwill ever granted, so each sale awards only the delta. Never decreases. */
  goodwillClaimed: number;
  perks: string[];
  prestigeCount: number;

  golden: {
    nextSpawnAt: number;
    onScreen: GoldenOnScreen | null;
    caught: number;
    inspectorSurvived: number;
    activeEffects: ActiveEffect[];
  };

  stats: {
    bestRunRevenue: number;
    totalTaps: number;
    fastestPrestigeSeconds: number | null;
    runStartedAtSeconds: number;
  };
}

export function createInitialState(seed: number, nowMs = ZERO, c: EconomyConfig = config): GameState {
  const rng = new Rng(seed);
  const state: GameState = {
    schemaVersion: c.save.schemaVersion,
    seed,
    rngState: rng.getState(),
    timeSeconds: ZERO,
    wallClockMs: nowMs,
    cash: ZERO,
    runRevenue: ZERO,
    lifetimeRevenue: ZERO,
    burgersSold: ZERO,
    taps: ZERO,
    generators: c.generators.list.map(() => ZERO),
    upgrades: [],
    layout: defaultLayout(c),
    achievements: [],
    purchaseOrder: [],
    goodwill: ZERO,
    goodwillClaimed: ZERO,
    perks: [],
    prestigeCount: ZERO,
    golden: {
      nextSpawnAt: rng.range(c.golden.firstSpawnSecondsMin, c.golden.firstSpawnSecondsMax),
      onScreen: null,
      caught: ZERO,
      inspectorSurvived: ZERO,
      activeEffects: [],
    },
    stats: {
      bestRunRevenue: ZERO,
      totalTaps: ZERO,
      fastestPrestigeSeconds: null,
      runStartedAtSeconds: ZERO,
    },
  };
  state.rngState = rng.getState();
  return state;
}

export function totalGenerators(state: GameState): number {
  let total = ZERO;
  for (const owned of state.generators) total += owned;
  return total;
}
