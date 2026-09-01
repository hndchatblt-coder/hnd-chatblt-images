import { describe, expect, it } from "vitest";
import { loadEconomyConfig } from "../src/content/load.js";
import { ActiveClock, EconomyClock } from "../src/clock.js";

const config = loadEconomyConfig();

describe("EconomyClock", () => {
  it("1 real second = 2 game minutes, per GAME_DESIGN §2", () => {
    const clock = new EconomyClock(config);
    clock.advanceByRealSeconds(1);
    expect(clock.getGameMinutes()).toBe(2);
  });

  it("derives day/hour/minute from elapsed game-minutes", () => {
    // Wed (index 2), 14:30 — chosen to land inside a single hour bucket with no rounding surprises.
    const startGameMinutes = 2 * config.time.gameMinutesPerDay + 14 * 60 + 30;
    const clock = new EconomyClock(config, startGameMinutes);
    expect(clock.getDayKey()).toBe("wed");
    expect(clock.getHour()).toBe(14);
    expect(clock.getMinuteOfHour()).toBe(30);
  });

  it("wraps the week after 7 days", () => {
    const clock = new EconomyClock(config, 8 * config.time.gameMinutesPerDay);
    expect(clock.getDayKey()).toBe("tue");
  });

  it("combines hour and day multipliers for the idle demand curve (matches sim/sanity_sim.py)", () => {
    // Friday dinner peak: hourMultipliers 18-21 = 4.0, dayMultipliers.fri = 1.8.
    const fridayDinner = 4 * config.time.gameMinutesPerDay + 19 * 60;
    const clock = new EconomyClock(config, fridayDinner);
    expect(clock.getDemandMultiplier()).toBeCloseTo(4.0 * 1.8, 10);
  });

  it("save/restore round-trips exactly", () => {
    const clock = new EconomyClock(config, 12345.5);
    const restored = EconomyClock.fromJSON(config, clock.toJSON());
    expect(restored.getGameMinutes()).toBe(clock.getGameMinutes());
  });

  it("rejects advancing by a negative duration", () => {
    const clock = new EconomyClock(config);
    expect(() => clock.advanceByRealSeconds(-1)).toThrow();
  });
});

describe("ActiveClock", () => {
  it("accumulates real seconds independently of the economy clock", () => {
    const clock = new ActiveClock();
    clock.advance(5);
    clock.advance(2.5);
    expect(clock.getElapsedRealSeconds()).toBe(7.5);
  });

  it("save/restore round-trips exactly", () => {
    const clock = new ActiveClock(42);
    const restored = ActiveClock.fromJSON(clock.toJSON());
    expect(restored.getElapsedRealSeconds()).toBe(42);
  });
});
