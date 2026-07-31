/**
 * The kitchen as a factory (§4.4, §4.7).
 *
 * M0 made each order its own little pipeline, which quietly threw away the most interesting thing
 * in the brief: **batch sizes**. A grill doing four patties in 90 seconds is wildly efficient if
 * four patties of demand exist in that window and pure waste if you cook four and sell one.
 *
 * So production is make-to-stock, not make-to-order:
 *
 *   1. Orders create demand for finished items.
 *   2. A job at a station consumes input lots and produces `batchSize` output lots.
 *   3. Lots age. Past `freshnessWindow` quality decays; below the floor they get binned as waste.
 *   4. An order is filled from stock, and takes the quality of the lots it drew.
 *
 * Par-cooking ahead of a rush is the correct play and also how you lose money. That tension is
 * the point, and it only exists because production and demand are decoupled.
 */
import { kitchen } from "../../config/kitchen.js";
import { economy } from "../../config/economy.js";
import { post } from "./economy.js";
import { recipeById, type Recipe, type StationType, type Step } from "../../config/recipes.js";
import { staffConfig } from "../../config/staff.js";
import { traitById } from "../../config/traits.js";
import { dtGameSeconds, time } from "../../config/time.js";
import { floor } from "../../config/floor.js";
import { centreOf, travelSeconds } from "../floor.js";
import type { Job, Lot, StaffMember } from "../entities.js";
import type { World } from "../world.js";

/* ------------------------------------------------------------------ stock */

export const stockOf = (world: World, item: string): Lot[] => {
  const lots = world.stock.get(item);
  if (lots) return lots;
  const fresh: Lot[] = [];
  world.stock.set(item, fresh);
  return fresh;
};

export const stockQty = (world: World, item: string): number =>
  stockOf(world, item).reduce((a, l) => a + l.qty, 0);

/** Quality of a lot given its age. Fresh until the window, then a linear slide. */
export const lotQuality = (world: World, lot: Lot): number => {
  if (lot.freshnessWindow === undefined) return 1;
  const age = world.clock.elapsed - lot.madeAt;
  if (age <= lot.freshnessWindow) return 1;
  return Math.max(0, 1 - (age - lot.freshnessWindow) / kitchen.decaySeconds);
};

/** Takes `qty` of an item, oldest first, and reports the mean quality of what came out. */
export const consume = (world: World, item: string, qty: number): number => {
  const lots = stockOf(world, item);
  let need = qty;
  let qualitySum = 0;
  let taken = 0;
  while (need > 0 && lots.length > 0) {
    const lot = lots[0] as Lot;
    const take = Math.min(need, lot.qty);
    qualitySum += lotQuality(world, lot) * take;
    taken += take;
    lot.qty -= take;
    need -= take;
    if (lot.qty <= 0) lots.shift();
  }
  return taken > 0 ? qualitySum / taken : 0;
};

/** Bins anything that has decayed past the point of serving. Waste is a headline number (§4.9). */
export const binSpoiled = (world: World): void => {
  for (const [item, lots] of world.stock) {
    for (let i = lots.length - 1; i >= 0; i -= 1) {
      const lot = lots[i] as Lot;
      if (lotQuality(world, lot) >= kitchen.binBelowQuality) continue;
      world.day.waste += lot.qty * (kitchen.wasteValuePerUnit[item] ?? 0);
      world.day.wasteUnits += lot.qty;
      lots.splice(i, 1);
    }
  }
};

/* ------------------------------------------------------------- what to make */

const stepOf = (recipe: Recipe, id: string): Step | undefined =>
  recipe.steps.find((s) => s.id === id);

/** Units of each finished item the open orders still want. */
export const openDemand = (world: World): Map<string, number> => {
  const demand = new Map<string, number>();
  for (const order of world.orders) {
    if (order.completedAt !== null) continue;
    for (const item of order.items) {
      if (item.ready) continue;
      demand.set(item.recipeId, (demand.get(item.recipeId) ?? 0) + 1);
    }
  }
  return demand;
};

/**
 * The next job worth starting, walking the DAG down from what orders actually want.
 *
 * Returns the deepest unmet need: if burgers are short and patties are short, it says patties,
 * because that is what is actually blocking. This is the whole scheduler and it is deliberately
 * simple — emergent congestion should be visible rather than optimised away (§4.5).
 */
export const nextJob = (
  world: World,
  capable: (station: StationType) => boolean,
): { recipe: Recipe; step: Step } | null => {
  const wanted = openDemand(world);

  const shortfall = (recipe: Recipe, step: Step, needed: number): number => {
    const have = stockQty(world, step.output);
    const onWay = world.jobs
      .filter((j) => j.output === step.output)
      .reduce((a, j) => a + j.batchSize, 0);
    return needed - have - onWay;
  };

  // Breadth-first from finished goods downwards, so blocking inputs surface first.
  const queue: { recipe: Recipe; step: Step; needed: number }[] = [];
  for (const [recipeId, qty] of wanted) {
    const recipe = recipeById.get(recipeId);
    if (!recipe) continue;
    const last = recipe.steps[recipe.steps.length - 1];
    if (last) queue.push({ recipe, step: last, needed: qty });
  }

  let best: { recipe: Recipe; step: Step; depth: number } | null = null;
  let depth = 0;
  while (queue.length > 0 && depth < kitchen.maxDagDepth) {
    depth += 1;
    const batch = queue.splice(0, queue.length);
    for (const entry of batch) {
      if (shortfall(entry.recipe, entry.step, entry.needed) <= 0) continue;

      // Anything this step depends on that is itself short goes deeper.
      let blocked = false;
      for (const depId of entry.step.dependsOn) {
        const dep = stepOf(entry.recipe, depId);
        if (!dep) continue;
        if (stockQty(world, dep.output) < entry.needed) {
          queue.push({ recipe: entry.recipe, step: dep, needed: entry.needed });
          blocked = true;
        }
      }
      if (blocked) continue;
      if (!capable(entry.step.station)) continue;
      if (best === null || depth > best.depth) {
        best = { recipe: entry.recipe, step: entry.step, depth };
      }
    }
  }

  return best ? { recipe: best.recipe, step: best.step } : null;
};

/* ------------------------------------------------------------------- work */

export const workRate = (staff: StaffMember, station: StationType): number => {
  const skill = staff.skill[station] ?? staffConfig.startingSkill;
  let rate = skill;
  for (const id of staff.traits) {
    const trait = traitById.get(id);
    if (!trait) continue;
    if (trait.speed) rate *= trait.speed;
    const at = trait.speedAt?.[station];
    if (at) rate *= at;
    if (trait.slowStart && staff.shiftSeconds < time.secondsPerHour) rate *= trait.slowStart;
  }
  rate *= staffConfig.staminaSpeedFloor + staffConfig.staminaSpeedSpan * staff.stamina;
  return Math.max(staffConfig.minWorkRate, rate);
};

const canWork = (staff: StaffMember, station: StationType): boolean =>
  !staff.traits.some((id) => traitById.get(id)?.refuses?.includes(station));

/** Hands out new jobs and advances the ones in flight. */
export const stepKitchen = (world: World): void => {
  for (const staff of world.staff) {
    if (staff.jobId !== null) continue;

    const free = world.stations.filter(
      (s) => s.busyWith === null && !world.jobs.some((j) => j.stationId === s.id),
    );
    if (free.length === 0) break;

    const pick = nextJob(world, (station) =>
      canWork(staff, station) && free.some((s) => s.type === station),
    );
    if (!pick) continue;

    // Nearest free station of the right type — staff prefer not to walk (§4.5).
    const options = free.filter((s) => s.type === pick.step.station);
    const station = options.reduce((a, b) =>
      travelSeconds(staff, centreOf(b)) < travelSeconds(staff, centreOf(a)) ? b : a,
    );

    // Inputs are consumed when the job starts — they are on the bench, not in the cupboard.
    let inputQuality = 1;
    let ok = true;
    for (const depId of pick.step.dependsOn) {
      const dep = stepOf(pick.recipe, depId);
      if (!dep) continue;
      if (stockQty(world, dep.output) < pick.step.batchSize) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    for (const depId of pick.step.dependsOn) {
      const dep = stepOf(pick.recipe, depId);
      if (!dep) continue;
      inputQuality = Math.min(inputQuality, consume(world, dep.output, pick.step.batchSize));
    }

    // Raw ingredients are bought by the step that consumes them, per unit of the batch.
    for (const [ingredient, qty] of Object.entries(pick.step.consumes ?? {})) {
      const cost = (economy.ingredientCost[ingredient] ?? 0) * qty * pick.step.batchSize;
      post(world, "cogs", -cost);
      world.day.cogs += cost;
    }

    const job: Job = {
      id: `j${world.nextJobId++}`,
      stationId: station.id,
      staffId: staff.id,
      output: pick.step.output,
      batchSize: pick.step.batchSize,
      remaining: pick.step.duration,
      // The walk to the station is real time the food is not being cooked. This is the tax.
      travelRemaining: travelSeconds(staff, centreOf(station)) + floor.handlingSeconds,
      inputQuality,
      freshnessWindow: pick.step.freshnessWindow,
    };
    world.jobs.push(job);
    staff.jobId = job.id;
    station.busyWith = job.id;
    world.day.walkSeconds += job.travelRemaining;
  }

  // Advance.
  for (let i = world.jobs.length - 1; i >= 0; i -= 1) {
    const job = world.jobs[i] as Job;
    const staff = world.staff.find((s) => s.id === job.staffId);
    const station = world.stations.find((s) => s.id === job.stationId);
    if (!staff || !station) continue;

    // A tick is a budget of game seconds, spent on travel first and then on work.
    //
    // This used to `continue` after any travel, which quietly made walking free: at dt = 12s a
    // 6.6-second walk and a 9.4-second walk both finished in exactly one tick, so opening six
    // tiles between the grill and the pass raised recorded walk time by 49% and changed
    // throughput by precisely zero. Distance has to be spent out of the same budget as work or
    // the entire spatial layer is decoration.
    let budget = dtGameSeconds;

    if (job.travelRemaining > 0) {
      const spent = Math.min(budget, job.travelRemaining);
      job.travelRemaining -= spent;
      budget -= spent;
      staff.shiftSeconds += spent;
      if (job.travelRemaining <= 0) {
        const c = centreOf(station);
        staff.x = c.x;
        staff.y = c.y;
      }
      if (budget <= 0) continue;
    }

    job.remaining -= budget * workRate(staff, station.type);
    station.runSeconds += budget;
    staff.shiftSeconds += budget;

    const current = staff.skill[station.type] ?? staffConfig.startingSkill;
    let learn = staffConfig.skillPerHour;
    for (const id of staff.traits) {
      const trait = traitById.get(id);
      if (trait?.learnRate) learn *= trait.learnRate;
      const at = trait?.learnRateAt?.[station.type];
      if (at) learn *= at;
    }
    staff.skill[station.type] = Math.min(
      staffConfig.skillCeiling,
      current + (learn * (budget / time.secondsPerHour)) / (1 + current),
    );

    if (job.remaining > 0) continue;

    stockOf(world, job.output).push({
      qty: job.batchSize,
      madeAt: world.clock.elapsed,
      freshnessWindow: job.freshnessWindow,
      quality: job.inputQuality,
    });
    world.day.batchesMade += 1;
    staff.jobId = null;
    station.busyWith = null;
    world.jobs.splice(i, 1);
  }
};

/** Fills any order whose items are all in stock. */
export const fillOrders = (world: World): void => {
  for (const order of world.orders) {
    if (order.completedAt !== null) continue;
    for (const item of order.items) {
      if (item.ready) continue;
      if (stockQty(world, item.recipeId) < 1) continue;
      item.quality = consume(world, item.recipeId, 1);
      item.ready = true;
    }
  }
};
