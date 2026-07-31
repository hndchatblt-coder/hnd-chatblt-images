/**
 * Staff doing work (§4.5, §4.6).
 *
 * M0 has no floor and no walking — a staff member picks up the highest-priority ready step they
 * can run and works it. M1 adds the grid, the pathing and the walk-time tax, which is where this
 * stops being a queue and becomes a spatial puzzle.
 */
import { recipeById } from "../../config/recipes.js";
import { staffConfig } from "../../config/staff.js";
import { traitById } from "../../config/traits.js";
import { dtGameSeconds, time } from "../../config/time.js";
import type { StaffMember, Task } from "../entities.js";
import { readyTasks } from "./orders.js";
import type { World } from "../world.js";

/** How fast this person runs this step, all modifiers applied. */
export const workRate = (world: World, staff: StaffMember, task: Task): number => {
  const skill = staff.skill[task.station] ?? staffConfig.startingSkill;
  let rate = skill;

  for (const id of staff.traits) {
    const trait = traitById.get(id);
    if (!trait) continue;
    if (trait.speed) rate *= trait.speed;
    const at = trait.speedAt?.[task.station];
    if (at) rate *= at;
    // Slow starters are genuinely slower for the first hour, every shift.
    if (trait.slowStart && staff.shiftSeconds < time.secondsPerHour) rate *= trait.slowStart;
  }

  // Tired people are slower. Stamina runs 1 down to 0 across a long shift.
  rate *= staffConfig.staminaSpeedFloor + staffConfig.staminaSpeedSpan * staff.stamina;
  return Math.max(staffConfig.minWorkRate, rate);
};

const canWork = (staff: StaffMember, task: Task): boolean => {
  for (const id of staff.traits) {
    const trait = traitById.get(id);
    if (trait?.refuses?.includes(task.station)) return false;
  }
  return true;
};

/**
 * Priority: expedited orders first, then oldest. Expediting reorders work and never creates
 * throughput, which is why it needs no cooldown and can never be exploited (§12).
 */
const priority = (world: World, task: Task): number => {
  const order = world.orders.find((o) => o.id === task.orderId);
  if (!order) return Number.POSITIVE_INFINITY;
  return (order.expedited ? -1e9 : 0) + order.placedAt;
};

export const stepProduction = (world: World): void => {
  const available = readyTasks(world).sort((a, b) => priority(world, a) - priority(world, b));

  // Hand out new work to anyone free.
  for (const staff of world.staff) {
    if (staff.busyWith !== null) continue;
    const index = available.findIndex((t) => canWork(staff, t));
    if (index < 0) continue;
    const task = available.splice(index, 1)[0] as Task;
    const key = `${task.orderId}:${task.itemIndex}:${task.stepId}`;
    task.assignedTo = staff.id;
    staff.busyWith = key;
    world.inFlight.set(key, task);
  }

  // Advance whatever is in flight.
  for (const staff of world.staff) {
    if (staff.busyWith === null) continue;
    const task = world.inFlight.get(staff.busyWith);
    if (!task) {
      staff.busyWith = null;
      continue;
    }

    task.remaining -= dtGameSeconds * workRate(world, staff, task);
    staff.shiftSeconds += dtGameSeconds;
    staff.hoursWorked += dtGameSeconds / time.secondsPerHour;

    // Skill climbs on hours at a station, flattening as it goes.
    const current = staff.skill[task.station] ?? staffConfig.startingSkill;
    let learn = staffConfig.skillPerHour;
    for (const id of staff.traits) {
      const trait = traitById.get(id);
      if (!trait) continue;
      if (trait.learnRate) learn *= trait.learnRate;
      const at = trait.learnRateAt?.[task.station];
      if (at) learn *= at;
    }
    const gain = (learn * (dtGameSeconds / time.secondsPerHour)) / (1 + current);
    staff.skill[task.station] = Math.min(staffConfig.skillCeiling, current + gain);

    if (task.remaining > 0) continue;

    // Step finished.
    const order = world.orders.find((o) => o.id === task.orderId);
    const item = order?.items[task.itemIndex];
    if (order && item) {
      item.done.push(task.stepId);
      item.remaining = item.remaining.filter((s) => s !== task.stepId);
      const recipe = recipeById.get(item.recipeId);
      if (recipe && item.remaining.length === 0) item.ready = true;
    }
    world.inFlight.delete(staff.busyWith);
    staff.busyWith = null;
  }

  // Fatigue accrues for anyone on shift, working or not.
  const drain = (staffConfig.staminaDrainPerHour * dtGameSeconds) / time.secondsPerHour;
  for (const staff of world.staff) {
    let rate = drain;
    for (const id of staff.traits) {
      const trait = traitById.get(id);
      if (trait?.fatigueRate) rate *= trait.fatigueRate;
    }
    staff.stamina = Math.max(0, staff.stamina - rate);
  }
};
