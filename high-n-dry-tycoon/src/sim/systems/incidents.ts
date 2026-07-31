/**
 * Incidents, and the Recovery Plan (§4.10, §9).
 *
 * Nothing here can end a run. The worst outcome available is a slow, boring, unprofitable week.
 */
import { incidentConfig, incidents, type IncidentDef } from "../../config/incidents.js";
import { reviews as reviewCfg } from "../../config/reviews.js";
import { dtGameSeconds, time } from "../../config/time.js";
import { dayIndex } from "../clock.js";
import { post } from "./economy.js";
import type { World } from "../world.js";

const pickIncident = (world: World): IncidentDef | null => {
  const total = incidents.reduce((a, i) => a + i.weight, 0);
  let roll = world.rng.range(0, total);
  for (const incident of incidents) {
    roll -= incident.weight;
    if (roll <= 0) return incident;
  }
  return incidents[0] ?? null;
};

export const stepIncidents = (world: World): void => {
  if (dayIndex(world.clock) < incidentConfig.graceDays) return;

  // Expire anything that has run its course.
  for (let i = world.incidents.length - 1; i >= 0; i -= 1) {
    const active = world.incidents[i];
    if (!active) continue;
    if (world.clock.elapsed < active.endsAt) continue;
    world.incidents.splice(i, 1);
  }

  // Anything still running costs more the longer it is left. Never a hard deadline — just a
  // meter that ticks. This is the reason to open the app, not a punishment for not.
  if (world.incidents.length > 0) {
    const perTick =
      (incidentConfig.neglectCostPerDay * dtGameSeconds) /
      (time.hoursPerDay * time.secondsPerHour);
    post(world, "utilities", -perTick * world.incidents.length);
  }

  // New incident?
  const meanSeconds = incidentConfig.meanDaysBetween * time.hoursPerDay * time.secondsPerHour;
  const chance = dtGameSeconds / meanSeconds;
  if (!world.rng.chance(chance)) return;

  const def = pickIncident(world);
  if (!def) return;
  if (world.incidents.some((a) => a.id === def.id)) return;

  world.incidents.push({
    id: def.id,
    endsAt: world.clock.elapsed + def.hours * time.secondsPerHour,
  });
  world.incidentLog.push({ at: world.clock.elapsed, id: def.id, line: def.line });

  // A cool room that drifted overnight has already done its damage by the time you read about it.
  if (def.spoilShare) {
    for (const [, lots] of world.stock) {
      for (const lot of lots) lot.qty *= 1 - def.spoilShare;
    }
  }
};

/** Production multiplier from everything currently going wrong. Never zero. */
export const incidentProductionMult = (world: World): number => {
  let mult = 1;
  for (const active of world.incidents) {
    const def = incidents.find((i) => i.id === active.id);
    if (def?.productionMult) mult *= def.productionMult;
  }
  return mult;
};

export const stationDisabled = (world: World, station: string): boolean =>
  world.incidents.some(
    (a) => incidents.find((i) => i.id === a.id)?.disablesStation === station,
  );

/** Reputation ceiling imposed by anything unremedied. */
export const reputationCap = (world: World): number => {
  let cap = reviewCfg.priorStars * 2;
  for (const active of world.incidents) {
    const def = incidents.find((i) => i.id === active.id);
    if (def?.reputationCap) cap = Math.min(cap, def.reputationCap);
  }
  return cap;
};

/**
 * The Recovery Plan (§9). Appears below the crisis threshold, and its objectives are concrete and
 * achievable rather than "get better". Meeting them visibly accelerates repair — the player must
 * always be able to see what to do next.
 */
export interface RecoveryObjective {
  id: string;
  label: string;
  progress: number;
  met: boolean;
}

export const recoveryPlan = (world: World): RecoveryObjective[] | null => {
  if (world.reputation >= reviewCfg.crisisStars) return null;
  const recent = world.history.slice(-reviewCfg.recoveryWindowDays);
  if (recent.length === 0) return null;

  const served = recent.reduce((a, d) => a + d.ordersCompleted, 0);
  const meanWait = served > 0 ? recent.reduce((a, d) => a + d.waitSecondsTotal, 0) / served / 60 : 0;
  const revenue = recent.reduce((a, d) => a + d.revenue, 0);
  const waste = recent.reduce((a, d) => a + d.waste, 0);
  const wastePct = revenue > 0 ? waste / revenue : 0;

  const days = recent.length / reviewCfg.recoveryWindowDays;

  return [
    {
      id: "wait",
      label: `Keep mean wait under ${reviewCfg.recoveryTargetWaitMinutes} min`,
      progress: Math.min(1, reviewCfg.recoveryTargetWaitMinutes / Math.max(0.1, meanWait)),
      met: meanWait > 0 && meanWait < reviewCfg.recoveryTargetWaitMinutes,
    },
    {
      id: "waste",
      label: `Keep waste under ${(reviewCfg.recoveryTargetWaste * 100).toFixed(0)}%`,
      progress: Math.min(1, reviewCfg.recoveryTargetWaste / Math.max(0.001, wastePct)),
      met: wastePct < reviewCfg.recoveryTargetWaste,
    },
    {
      id: "days",
      label: `${reviewCfg.recoveryWindowDays} days of it`,
      progress: days,
      met: days >= 1,
    },
  ];
};
