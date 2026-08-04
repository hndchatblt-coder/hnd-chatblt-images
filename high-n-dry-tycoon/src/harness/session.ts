/**
 * The session model (§14). A player does not sit in this game for 90 continuous days; they open
 * it a few times, watch a service, and close it.
 *
 * Three sessions a day with gaps between and a long overnight. Bots get a decision window at the
 * start of each session — the only points at which a player could actually have done anything.
 */
import { dtGameSeconds, time } from "../config/time.js";
import { tick, type World } from "../sim/world.js";
import type { Bot } from "./bots.js";

export const sessionModel = {
  /** Real minutes per session. */
  sessionMinutes: 8,
  sessionsPerDay: 3,
  /** Game hour each session starts at. */
  sessionStartHours: [11.5, 17.5, 21] as readonly number[],
} as const;

/** Runs `days` game days, giving `bot` a decision window at the start of each session. */
export const runSessions = (world: World, bot: Bot, days: number): World => {
  const ticksPerDay = Math.round(
    (time.hoursPerDay * time.secondsPerHour) / dtGameSeconds,
  );
  const decisionTicks = new Set(
    sessionModel.sessionStartHours.map((h) =>
      Math.round((h * time.secondsPerHour) / dtGameSeconds),
    ),
  );

  for (let day = 0; day < days; day += 1) {
    for (let t = 0; t < ticksPerDay; t += 1) {
      if (decisionTicks.has(t)) bot.decide(world);
      tick(world);
    }
  }
  return world;
};
