/**
 * Money (§4.9).
 *
 * The ledger is double-entry in spirit: every dollar that moves is recorded against a named
 * account *and* against cash, and the M2 gate reconciles the two to the cent. A P&L that doesn't
 * tie out is a P&L nobody can trust to balance the game with.
 *
 * Wages accrue hourly and land Sunday 23:00 as a lump, with Australian penalty rates, because
 * whether Sunday trade is worth opening for should be a genuine question.
 */
import { economy } from "../../config/economy.js";
import { resaleFraction, stationByType } from "../../config/stations.js";
import { staffConfig } from "../../config/staff.js";
import { dtGameSeconds, time } from "../../config/time.js";
import { dayIndex, dayOfWeek, hourOfDay, isTrading } from "../clock.js";
import type { World } from "../world.js";

export type Account =
  | "revenue"
  | "cogs"
  | "waste"
  | "wages"
  | "rent"
  | "utilities"
  | "insurance"
  | "pos"
  | "marketing"
  | "equipment"
  | "equipmentSale"
  | "interest";

/** The only way money is allowed to move. Everything else is a bug. */
export const post = (world: World, account: Account, amount: number): void => {
  world.cash += amount;
  world.ledger[account] = (world.ledger[account] ?? 0) + amount;
  world.day.ledger[account] = (world.day.ledger[account] ?? 0) + amount;
};

/** What one staff member costs right now, per hour, with loading and penalties. */
export const hourlyCost = (world: World, hourlyRate: number): number => {
  const dow = dayOfWeek(world.clock);
  const penalty = economy.wages.penaltyRates[dow] ?? 1;
  return hourlyRate * penalty;
};

/**
 * Wages accrue while the shop is open, not around the clock. The first version billed staff 24
 * hours a day and labour came out at 56.7% of revenue against a 28-34% target — the number was
 * wrong before any balancing question could even be asked.
 */
export const accrueWages = (world: World): void => {
  if (!isTrading(world.clock)) return;
  const hours = dtGameSeconds / time.secondsPerHour;
  for (const s of world.staff) {
    world.wagesOwed += hourlyCost(world, s.hourlyRate) * hours;
  }
};

/** Sunday 23:00. The screen should dim for this (§11.4). */
export const runPayroll = (world: World): void => {
  if (world.wagesOwed <= 0) return;
  post(world, "wages", -world.wagesOwed);
  world.lastPayroll = world.wagesOwed;
  world.wagesOwed = 0;
};

export const chargeWeeklyFixed = (world: World): void => {
  post(world, "rent", -world.venue.rentPerWeek);
  post(world, "insurance", -economy.fixed.insurancePerWeek);
  post(world, "pos", -economy.fixed.posSubscriptionPerWeek);
};

/** Utilities follow how long equipment actually ran, so idle gear is cheap and busy gear is not. */
export const chargeUtilities = (world: World): void => {
  const stationHours =
    world.stations.reduce((a, s) => a + s.runSeconds, 0) / time.secondsPerHour;
  if (stationHours <= 0) return;
  post(world, "utilities", -stationHours * economy.fixed.utilitiesPerStationHour);
  for (const s of world.stations) s.runSeconds = 0;
};

/** Overdraft interest, daily, on a negative balance only. The bank is patient but not free. */
export const chargeInterest = (world: World): void => {
  if (world.cash >= 0) return;
  const daily = economy.overdraft.annualRate / (time.daysPerWeek * 52);
  post(world, "interest", world.cash * daily);
};

export const hire = (world: World, name: string, traits: string[] = []): void => {
  const rate = staffConfig.baseHourlyRate.casual * (1 + economy.wages.casualLoading);
  world.staff.push({
    id: `s${world.nextStaffId++}`,
    name,
    traits,
    skill: {},
    stamina: 1,
    morale: staffConfig.moraleStart,
    type: "casual",
    hourlyRate: rate,
    jobId: null,
    x: world.venue.grid.w / 2,
    y: 0,
    shiftSeconds: 0,
    hoursWorked: 0,
  });
};

/** Letting someone go. No cost — the cost is the skill walking out the door. */
export const fire = (world: World, staffId: string): boolean => {
  const index = world.staff.findIndex((s) => s.id === staffId);
  if (index < 0) return false;
  const staff = world.staff[index];
  if (staff?.jobId) {
    // Never strand a job mid-batch; the food would vanish.
    const job = world.jobs.find((j) => j.id === staff.jobId);
    if (job) {
      const station = world.stations.find((s) => s.id === job.stationId);
      if (station) station.busyWith = null;
      world.jobs = world.jobs.filter((j) => j.id !== job.id);
    }
  }
  world.staff.splice(index, 1);
  return true;
};

export const buyStation = (world: World, type: string): boolean => {
  const def = stationByType.get(type as never);
  if (!def) return false;
  post(world, "equipment", -def.cost);
  return true;
};

export const sellStation = (world: World, stationId: string): boolean => {
  const index = world.stations.findIndex((s) => s.id === stationId);
  if (index < 0) return false;
  const station = world.stations[index];
  if (!station) return false;
  const def = stationByType.get(station.type);
  if (def) post(world, "equipmentSale", def.cost * resaleFraction);
  world.stations.splice(index, 1);
  return true;
};

/** Marketing: money in today, customers tomorrow (§3). */
export const spendMarketing = (world: World, amount: number): void => {
  if (amount <= 0 || world.cash < amount) return;
  post(world, "marketing", -amount);
  // Efficiency falls with reputation — a bad shop pays more per customer, and those customers
  // then balk. Bad money after bad.
  const efficiency = Math.max(economy.marketing.minEfficiency, world.reputation / 5);
  world.marketingAwareness += (amount / economy.marketing.dollarsPerAwarenessPoint) * efficiency;
};

/** Called once per tick. Owns every scheduled charge. */
export const stepEconomy = (world: World, previousHour: number): void => {
  accrueWages(world);

  const hour = hourOfDay(world.clock);
  const crossed = (target: number): boolean =>
    previousHour < target && hour >= target;

  if (crossed(time.payrollHour) && dayOfWeek(world.clock) === time.payrollDayOfWeek) {
    runPayroll(world);
    chargeWeeklyFixed(world);
  }
  // Utilities and interest settle at the end of each day.
  if (hour < previousHour) {
    chargeUtilities(world);
    chargeInterest(world);
  }
  void dayIndex;
};
