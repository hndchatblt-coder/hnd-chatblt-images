import { describe, expect, it } from "vitest";
import { loadEconomyConfig } from "../src/content/load.js";
import { replay, type ApplyAction, type InputLogEntry } from "../src/replay.js";
import { createInitialState, type GameState } from "../src/state.js";

const config = loadEconomyConfig();

// A stand-in action set for M1 — real actions (tap customer, hire, boost lane, ...) arrive
// with the active layer in M2. This exists only to prove the harness is deterministic and
// wired correctly to the clocks + rng.
type DemoAction = { type: "earn"; amount: number } | { type: "gamble"; stake: number };

const applyDemoAction: ApplyAction<DemoAction> = (state, action, rng) => {
  if (action.type === "earn") {
    return { ...state, cash: state.cash + action.amount, lifetimeProfit: state.lifetimeProfit + action.amount };
  }
  // gamble: 50/50 double-or-nothing, using the shared rng so it's replay-deterministic.
  const won = rng.chance(0.5);
  const delta = won ? action.stake : -action.stake;
  return { ...state, cash: state.cash + delta, lifetimeProfit: state.lifetimeProfit + Math.max(0, delta) };
};

function demoLog(): InputLogEntry<DemoAction>[] {
  return [
    { atRealSeconds: 1, action: { type: "earn", amount: 10 } },
    { atRealSeconds: 3.5, action: { type: "gamble", stake: 5 } },
    { atRealSeconds: 3.5, action: { type: "gamble", stake: 5 } },
    { atRealSeconds: 10, action: { type: "earn", amount: 2 } },
  ];
}

describe("replay", () => {
  it("is deterministic: same seed + same log -> byte-identical final state", () => {
    const seed = 777;
    const runOnce = () => replay(config, createInitialState(config, seed), demoLog(), applyDemoAction);

    const a = runOnce();
    const b = runOnce();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("different seeds can diverge on rng-driven actions", () => {
    const a = replay(config, createInitialState(config, 1), demoLog(), applyDemoAction);
    const b = replay(config, createInitialState(config, 2), demoLog(), applyDemoAction);
    // Not a strict guarantee for any two seeds, but true for this fixed log — documents intent.
    expect(a.cash === b.cash && a.rngState === b.rngState).toBe(false);
  });

  it("advances both clocks to the final log entry's timestamp", () => {
    const state = replay(config, createInitialState(config, 1), demoLog(), applyDemoAction);
    expect(state.activeClock.elapsedRealSeconds).toBe(10);
    expect(state.economyClock.gameMinutes).toBe(10 / config.time.realSecondsPerGameMinute);
  });

  it("applies actions out of recorded order but in timestamp order", () => {
    const inOrder = demoLog();
    const shuffled = [inOrder[3], inOrder[0], inOrder[2], inOrder[1]] as InputLogEntry<DemoAction>[];
    const a = replay(config, createInitialState(config, 5), inOrder, applyDemoAction);
    const b = replay(config, createInitialState(config, 5), shuffled, applyDemoAction);
    expect(a).toEqual(b);
  });

  it("an empty log returns a state equivalent to the initial state (clocks unchanged)", () => {
    const initial = createInitialState(config, 3);
    const state = replay(config, initial, [], applyDemoAction);
    expect(state).toEqual(initial);
  });

  it("plain earn actions never move cash below the starting amount minus what was spent (Pillar 1: no surprise losses)", () => {
    const initial = createInitialState(config, 9);
    const log: InputLogEntry<DemoAction>[] = [{ atRealSeconds: 1, action: { type: "earn", amount: 50 } }];
    const state: GameState = replay(config, initial, log, applyDemoAction);
    expect(state.cash).toBe(initial.cash + 50);
  });
});
