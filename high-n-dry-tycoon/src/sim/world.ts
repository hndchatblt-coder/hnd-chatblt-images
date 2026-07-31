/**
 * The world, and the tick.
 *
 * `src/sim` never imports from `src/render` or `src/ui` — the single most important architectural
 * constraint in the brief (§13). The whole simulation runs headless in Node, which is what makes
 * the balance harness possible and what keeps M0 honest: if it isn't interesting as a text log of
 * numbers, no amount of animation saves it.
 */
import { demand } from "../config/demand.js";
import { economy } from "../config/economy.js";
import { staffConfig, staffNames } from "../config/staff.js";
import { dtGameSeconds, time } from "../config/time.js";
import { venueById, type VenueDef } from "../config/venues.js";
import { advance, createClock, dayIndex, isTrading, type Clock } from "./clock.js";
import { emptyDay, type Customer, type DayTotals, type Order, type Review, type StaffMember, type StationInstance, type Task } from "./entities.js";
import { Rng } from "./rng.js";
import { stepArrivals } from "./systems/arrivals.js";
import { takeOrders } from "./systems/orders.js";
import { stepProduction } from "./systems/production.js";
import { flushReviews, recomputeReputation } from "./systems/reputation.js";
import { stepService } from "./systems/service.js";

export interface World {
  rng: Rng;
  clock: Clock;
  venue: VenueDef;

  cash: number;
  reputation: number;
  marketingAwareness: number;
  menuPrice: Record<string, number>;

  customers: Customer[];
  orders: Order[];
  staff: StaffMember[];
  stations: StationInstance[];
  /** Tasks currently being worked, keyed `${orderId}:${itemIndex}:${stepId}`. */
  inFlight: Map<string, Task>;

  reviews: Review[];
  pendingReviews: Review[];
  /** Smoothed service time, in seconds — what an arriving customer uses to guess the wait. */
  rollingServiceSeconds: number;

  day: DayTotals;
  history: DayTotals[];

  nextCustomerId: number;
  nextOrderId: number;
}

export interface WorldOptions {
  seed: string | number;
  venueId?: string;
  /** How many staff to open with. */
  staffCount?: number;
}

export const createWorld = (options: WorldOptions): World => {
  const venue = venueById.get(options.venueId ?? "leichhardt");
  if (!venue) throw new Error(`unknown venue: ${options.venueId}`);
  const rng = new Rng(options.seed);

  const staff: StaffMember[] = [];
  const count = options.staffCount ?? 1;
  for (let i = 0; i < count; i += 1) {
    const name = staffNames[i % staffNames.length] ?? `Staff ${i}`;
    staff.push({
      id: `s${i}`,
      name,
      traits: [],
      skill: {},
      stamina: 1,
      morale: staffConfig.moraleStart,
      type: "casual",
      hourlyRate: staffConfig.baseHourlyRate.casual * (1 + economy.wages.casualLoading),
      busyWith: null,
      shiftSeconds: 0,
      hoursWorked: 0,
    });
  }

  const world: World = {
    rng,
    clock: createClock(),
    venue,
    cash: economy.startingCash,
    reputation: 0,
    marketingAwareness: 0,
    menuPrice: { ...economy.menuPrice },
    customers: [],
    orders: [],
    staff,
    stations: [],
    inFlight: new Map(),
    reviews: [],
    pendingReviews: [],
    rollingServiceSeconds: 300,
    day: emptyDay(0),
    history: [],
    nextCustomerId: 1,
    nextOrderId: 1,
  };

  recomputeReputation(world);
  return world;
};

/** One fixed 10 Hz tick. Never tie any of this to frame rate (§4.1). */
export const tick = (world: World): void => {
  const dayBefore = dayIndex(world.clock);
  advance(world.clock);

  if (isTrading(world.clock)) {
    stepArrivals(world, world.venue);
    takeOrders(world);
  }

  // Production and service run outside trading hours too — the kitchen finishes what it started.
  stepProduction(world);
  stepService(world);
  flushReviews(world);

  // Wages accrue by the hour worked and land as a lump on Sunday night (§4.9). M0 accrues them;
  // M2 pays them.
  if (isTrading(world.clock)) {
    const hours = dtGameSeconds / time.secondsPerHour;
    const penalty = economy.wages.penaltyRates[(dayIndex(world.clock) + 1) % time.daysPerWeek] ?? 1;
    for (const s of world.staff) world.day.wagesAccrued += s.hourlyRate * penalty * hours;
  }

  const dayAfter = dayIndex(world.clock);
  if (dayAfter !== dayBefore) rollDay(world, dayAfter);
};

const rollDay = (world: World, newDay: number): void => {
  world.day.reputationAtClose = world.reputation;
  world.history.push(world.day);
  world.day = emptyDay(newDay);
  // Overnight: everyone goes home, comes back rested, and marketing awareness decays.
  for (const s of world.staff) {
    s.stamina = 1;
    s.shiftSeconds = 0;
  }
  world.marketingAwareness *= 1 - demand.marketingDecayPerDay;
};

/** Runs whole game days. Returns the world so callers can inspect it. */
export const runDays = (world: World, days: number): World => {
  const ticks = Math.round(
    (days * time.hoursPerDay * time.secondsPerHour) / dtGameSeconds,
  );
  for (let i = 0; i < ticks; i += 1) tick(world);
  return world;
};
