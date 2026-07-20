import { z } from "zod";
import type { EconomyConfig } from "./content/schemas.js";

/**
 * The M1 skeleton state: the two clocks, the RNG, and the three currencies (GAME_DESIGN §5).
 * Per-venue state (stations, stock, hires — the Expeditor) is added in M2 once the active-layer
 * rules land; this shape is deliberately the smallest thing a save/load round-trip and a
 * replay harness can be built and tested against without guessing at unbuilt mechanics.
 */
export const GameStateSchema = z.object({
  schemaVersion: z.literal(1),
  rngSeed: z.number().int(),
  rngState: z.number().int(),
  economyClock: z.object({ gameMinutes: z.number().nonnegative() }),
  activeClock: z.object({ elapsedRealSeconds: z.number().nonnegative() }),
  cash: z.number(),
  lifetimeProfit: z.number().nonnegative(),
  reputation: z.number().nonnegative(),
  influence: z.number().nonnegative(),
});

export type GameState = z.infer<typeof GameStateSchema>;

/** A fresh save, per economy.config.json's starting values (GAME_DESIGN Pillar 1: never worse than this). */
export function createInitialState(config: EconomyConfig, rngSeed: number): GameState {
  return {
    schemaVersion: 1,
    rngSeed,
    rngState: rngSeed >>> 0,
    economyClock: { gameMinutes: 0 },
    activeClock: { elapsedRealSeconds: 0 },
    cash: config.activeLayer.startingCash,
    lifetimeProfit: 0,
    reputation: 0,
    influence: 0,
  };
}
