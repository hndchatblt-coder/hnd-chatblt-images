/**
 * Offline (§4.1). **The primary earning channel, not a courtesy.**
 *
 * On load, elapsed real time is run through the fast sim and presented as a "While you were out"
 * card. Two rules make it a reason to open the app rather than a reason not to:
 *
 *   - it runs at reduced efficiency, so being there is better;
 *   - **incidents do not auto-resolve.** A fryer that died at 3pm stayed dead.
 */
import { offline } from "../../config/offline.js";
import { time } from "../../config/time.js";
import { runFast } from "../fastsim/fastsim.js";
import { post } from "./economy.js";
import { incidents } from "../../config/incidents.js";
import type { World } from "../world.js";

export interface OfflineReport {
  realSecondsAway: number;
  gameHours: number;
  revenue: number;
  cogs: number;
  wages: number;
  waste: number;
  served: number;
  reputationBefore: number;
  reputationAfter: number;
  /** Anything that broke while you were out and is still broken. */
  unresolved: { id: string; line: string }[];
  capped: boolean;
}

export const settleOffline = (world: World, realSecondsAway: number): OfflineReport => {
  const capped = realSecondsAway > offline.maxRealSeconds;
  const seconds = Math.min(realSecondsAway, offline.maxRealSeconds);
  const gameHours = (seconds * time.gameSecondsPerRealSecond) / time.secondsPerHour;
  const before = world.reputation;

  const result = runFast(world, gameHours);
  const efficiency = offline.efficiency;

  post(world, "revenue", result.revenue * efficiency);
  post(world, "cogs", -result.cogs * efficiency);
  world.wagesOwed += result.wages * efficiency;
  world.reputation = result.reputation;
  world.clock.elapsed += gameHours * time.secondsPerHour;

  // Incidents keep running. This is the reason to come back.
  const unresolved = world.incidents.map((a) => ({
    id: a.id,
    line: incidents.find((i) => i.id === a.id)?.line ?? "Something is still not right.",
  }));
  for (const active of world.incidents) {
    active.endsAt = Math.max(active.endsAt, world.clock.elapsed + time.secondsPerHour);
  }

  return {
    realSecondsAway,
    gameHours,
    revenue: result.revenue * efficiency,
    cogs: result.cogs * efficiency,
    wages: result.wages * efficiency,
    waste: result.waste * efficiency,
    served: result.served * efficiency,
    reputationBefore: before,
    reputationAfter: world.reputation,
    unresolved,
    capped,
  };
};
