import type { EconomyConfig } from "./content/schemas.js";
import { ActiveClock, EconomyClock } from "./clock.js";
import { Rng } from "./rng.js";
import type { GameState } from "./state.js";

/**
 * One player input, timestamped on the active (real-seconds) clock. M1 ships the harness
 * generically — `TAction` is whatever the active layer ends up defining in M2 (tap customer,
 * boost lane, hire, tap research, ...). This is what makes the active layer's *rules*
 * replayable and testable per GAME_DESIGN §1 / CLAUDE.md's "Determinism where possible":
 * the UI only records input, the engine owns what it means.
 */
export interface InputLogEntry<TAction> {
  atRealSeconds: number;
  action: TAction;
}

export type ApplyAction<TAction> = (state: GameState, action: TAction, rng: Rng) => GameState;

/**
 * Replays a recorded input log against a fresh engine instance. Same config + same seed +
 * same log => byte-identical resulting state, every time. Advances both clocks by the
 * real-seconds gap between consecutive log entries (and from log start to the final entry),
 * so an action's effect always sees the clock state the player actually saw when they made it.
 */
export function replay<TAction>(
  config: EconomyConfig,
  initialState: GameState,
  log: readonly InputLogEntry<TAction>[],
  apply: ApplyAction<TAction>,
): GameState {
  const sorted = [...log].sort((a, b) => a.atRealSeconds - b.atRealSeconds);

  let state = initialState;
  const rng = Rng.fromState(initialState.rngState);
  const economyClock = EconomyClock.fromJSON(config, initialState.economyClock);
  const activeClock = ActiveClock.fromJSON(initialState.activeClock);

  let lastRealSeconds = activeClock.getElapsedRealSeconds();
  for (const entry of sorted) {
    if (entry.atRealSeconds < lastRealSeconds) {
      throw new Error(
        `replay: input log entry at ${entry.atRealSeconds}s is before the clock's current position (${lastRealSeconds}s) — log must be non-decreasing`,
      );
    }
    const dt = entry.atRealSeconds - lastRealSeconds;
    if (dt > 0) {
      economyClock.advanceByRealSeconds(dt);
      activeClock.advance(dt);
      lastRealSeconds = entry.atRealSeconds;
    }

    state = {
      ...apply(state, entry.action, rng),
      economyClock: economyClock.toJSON(),
      activeClock: activeClock.toJSON(),
      rngState: rng.getState(),
    };
  }

  return state;
}
