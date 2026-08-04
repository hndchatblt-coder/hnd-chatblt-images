/**
 * The fast sim (§7.1).
 *
 * Off-screen venues, Tier 3, and offline time don't get a per-agent simulation — they get a
 * closed-form queueing model that produces the same aggregates without stepping anyone.
 *
 * **The gate is non-negotiable and lives in CI: over 7 simulated days × seeds × layouts, revenue,
 * waste and reputation must land within 5% of the full sim.** A fast sim that drifts is worse than
 * no fast sim, because the player's other venues quietly stop matching the one they're watching.
 */
import { demand } from "../../config/demand.js";
import { economy } from "../../config/economy.js";
import { fastsim } from "../../config/fastsim.js";
import { floor } from "../../config/floor.js";
import { recipes } from "../../config/recipes.js";
import { reviews as reviewCfg } from "../../config/reviews.js";
import { time } from "../../config/time.js";
import { hourlyCost } from "../systems/economy.js";
import { demandRate } from "../systems/arrivals.js";
import { centreOf, travelSeconds } from "../floor.js";
import type { World } from "../world.js";

export interface FastResult {
  revenue: number;
  cogs: number;
  wages: number;
  waste: number;
  served: number;
  balked: number;
  reputation: number;
}

/**
 * Effective service rate: orders per game hour the kitchen can actually complete, derived from
 * station capacity, staff skill and the layout's walk cost — the same three things that limit the
 * full sim, just solved rather than stepped.
 */
export const serviceRatePerHour = (world: World): number => {
  const secondsPerOrder = recipes.reduce((total, recipe) => {
    const perUnit = recipe.steps.reduce((a, step) => a + step.duration / step.batchSize, 0);
    return total + perUnit;
  }, 0);

  // Mean skill across the crew, and the mean trip they make between stations.
  const skill =
    world.staff.length > 0
      ? world.staff.reduce((a, s) => {
          const values = Object.values(s.skill);
          return a + (values.length > 0 ? values.reduce((x, y) => x + y, 0) / values.length : fastsim.assumedStartingSkill);
        }, 0) / world.staff.length
      : fastsim.assumedStartingSkill;

  let tripSeconds = 0;
  let pairs = 0;
  for (const a of world.stations) {
    for (const b of world.stations) {
      if (a.id === b.id) continue;
      tripSeconds += travelSeconds(centreOf(a), centreOf(b));
      pairs += 1;
    }
  }
  const meanTrip = pairs > 0 ? tripSeconds / pairs : 0;

  // Every step costs its work, a trip to get to it, AND a trip to carry the output to whoever
  // consumes it next. Missing the carry leg put the fast sim 7.6% over the full sim the moment
  // carrying landed — which is the 5% gate doing its job.
  const stepsPerOrder = recipes.reduce((a, r) => a + r.steps.length, 0);
  const tripsPerStep = fastsim.tripsPerStep;
  const effectiveSeconds =
    secondsPerOrder / Math.max(fastsim.minSkill, skill) +
    (meanTrip + floor.handlingSeconds) * stepsPerOrder * tripsPerStep;

  const parallel = Math.min(world.staff.length, world.stations.length);
  return (parallel * time.secondsPerHour) / Math.max(1, effectiveSeconds);
};

/** Runs `hours` of game time without stepping a single agent. */
export const runFast = (world: World, hours: number): FastResult => {
  const result: FastResult = {
    revenue: 0,
    cogs: 0,
    wages: 0,
    waste: 0,
    served: 0,
    balked: 0,
    reputation: world.reputation,
  };

  const capacity = serviceRatePerHour(world);
  const meanPrice =
    Object.values(world.menuPrice).reduce((a, b) => a + b, 0) /
    Math.max(1, Object.keys(world.menuPrice).length);
  const attach = 1 + demand.baseFootTraffic * 0;

  for (let h = 0; h < hours; h += 1) {
    const hourOfDay = (world.clock.elapsed / time.secondsPerHour + h) % time.hoursPerDay;
    const trading = hourOfDay >= time.openHour && hourOfDay < time.closeHour;
    if (!trading) continue;

    // Arrivals for this hour, from the same curve the full sim uses.
    const arrivals = demandRate({ ...world, clock: { elapsed: world.clock.elapsed + h * time.secondsPerHour } }, world.venue);

    // Utilisation decides how many walk out: an overloaded shop sheds the excess.
    const served = Math.min(arrivals, capacity);
    const balked = Math.max(0, arrivals - capacity) * fastsim.balkShareOfExcess;

    result.served += served;
    result.balked += balked;
    result.revenue += served * meanPrice * fastsim.itemsPerOrder * attach;
    result.cogs += served * fastsim.cogsPerOrder * fastsim.itemsPerOrder;
    result.wages += world.staff.reduce((a, s) => a + hourlyCost(world, s.hourlyRate), 0);
    // Waste tracks how much the kitchen ran ahead of demand.
    result.waste += Math.max(0, capacity - arrivals) * fastsim.wastePerIdleCapacityHour;

    // Reputation has to drift, or an off-screen venue quietly freezes at whatever it was when the
    // player last looked — which is exactly the divergence the 5% gate exists to catch.
    //
    // Utilisation stands in for wait: a shop running near capacity keeps people waiting, and the
    // implied star rating follows. Then reputation eases toward it on the same half-life the full
    // sim uses, so the two agree over a week rather than only at the start.
    const utilisation = capacity > 0 ? arrivals / capacity : 0;
    const impliedSatisfaction = Math.max(
      0,
      Math.min(1, 1 - Math.max(0, utilisation - fastsim.comfortableUtilisation) / fastsim.utilisationTolerance),
    );
    const impliedStars = 1 + impliedSatisfaction * 4;
    const halfLifeHours = reviewCfg.halfLifeDays * time.hoursPerDay;
    const pull = 1 - Math.exp(-Math.LN2 / halfLifeHours);
    result.reputation += (impliedStars - result.reputation) * pull * fastsim.reputationResponsiveness;
  }

  void economy;
  return result;
};
