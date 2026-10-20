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
import { advance, createClock, dayIndex, hourOfDay, isTrading, type Clock } from "./clock.js";
import { stepEconomy } from "./systems/economy.js";
import { emptyDay, type Customer, type DayTotals, type Job, type Lot, type Order, type Review, type StaffMember, type StationInstance } from "./entities.js";
import { canPlace, toInstance, type Placement } from "./floor.js";
import { defaultLayout } from "./layouts.js";
import { floor as floorCfg } from "../config/floor.js";
import { Rng } from "./rng.js";
import { stepArrivals } from "./systems/arrivals.js";
import { takeOrders } from "./systems/orders.js";
import { binSpoiled, fillOrders, stepKitchen } from "./systems/kitchen.js";
import { stepIncidents } from "./systems/incidents.js";
import { flushReviews, recomputeReputation } from "./systems/reputation.js";
import { stepReneging, stepService } from "./systems/service.js";

export interface World {
  rng: Rng;
  /** Kept so a save can replay the RNG to exactly where it was. */
  seed: string;
  rngCalls: number;
  clock: Clock;
  venue: VenueDef;

  cash: number;
  /** Every dollar that has ever moved, by account. The M2 gate reconciles this against cash. */
  ledger: Record<string, number>;
  /** Units of each ingredient bought in the trailing week, which is what earns volume tiers. */
  weeklyVolume: Record<string, number>;
  /** Whether the group runs a commissary — it beats every retail tier (§8). */
  hasCommissary: boolean;
  /** Wages earned but not yet paid. Lands Sunday 23:00 (§4.9). */
  wagesOwed: number;
  lastPayroll: number;
  reputation: number;
  marketingAwareness: number;
  menuPrice: Record<string, number>;

  customers: Customer[];
  orders: Order[];
  staff: StaffMember[];
  stations: StationInstance[];
  /** Batches in flight. */
  jobs: Job[];
  /** Buffers: item id -> lots, oldest first. Cooked stock lives here and ages here. */
  stock: Map<string, Lot[]>;

  /** Everything currently going wrong. Degrade only — nothing here can end a run (§4.10). */
  incidents: { id: string; endsAt: number }[];
  incidentLog: { at: number; id: string; line: string }[];

  reviews: Review[];
  pendingReviews: Review[];
  /** Smoothed service time, in seconds — what an arriving customer uses to guess the wait. */
  rollingServiceSeconds: number;

  day: DayTotals;
  history: DayTotals[];

  nextCustomerId: number;
  nextOrderId: number;
  nextJobId: number;
  nextStaffId: number;
}

export interface WorldOptions {
  seed: string | number;
  venueId?: string;
  /** How many staff to open with. */
  staffCount?: number;
  /** Where the kitchen is. Defaults to the venue's stock fit-out. */
  layout?: Placement[];
  /**
   * Where on the calendar to begin. The sim starts at midnight on a Monday by default, which is
   * right for the harness and wrong for a player twice over: the shop is shut, and Monday 11am is
   * the deadest hour of the deadest day — measured, the first half hour had literally zero
   * customers. A player should land in the middle of a Friday lunch rush.
   */
  startHour?: number;
  startDay?: number;
}

export const createWorld = (options: WorldOptions): World => {
  const venue = venueById.get(options.venueId ?? "leichhardt");
  if (!venue) throw new Error(`unknown venue: ${options.venueId}`);
  const rng = new Rng(options.seed);

  // A layout that doesn't fit is a config bug, not something to route around at runtime.
  const placed = options.layout ?? defaultLayout(venue);
  const accepted: Placement[] = [];
  for (const p of placed) {
    const check = canPlace(venue, accepted, p);
    if (!check.ok) throw new Error(`cannot place ${p.type} at ${p.x},${p.y}: ${check.reason}`);
    accepted.push(p);
  }

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
      jobId: null,
      x: floorCfg.doorTile.x,
      y: floorCfg.doorTile.y,
      shiftSeconds: 0,
      hoursWorked: 0,
    });
  }

  const world: World = {
    rng,
    seed: String(options.seed),
    rngCalls: 0,
    clock: createClock(),
    venue,
    cash: economy.startingCash,
    ledger: {},
    weeklyVolume: {},
    hasCommissary: false,
    wagesOwed: 0,
    lastPayroll: 0,
    reputation: 0,
    marketingAwareness: 0,
    menuPrice: { ...economy.menuPrice },
    customers: [],
    orders: [],
    staff,
    stations: placed.map(toInstance),
    jobs: [],
    stock: new Map(),
    incidents: [],
    incidentLog: [],
    reviews: [],
    pendingReviews: [],
    rollingServiceSeconds: 300,
    day: emptyDay(0),
    history: [],
    nextCustomerId: 1,
    nextOrderId: 1,
    nextJobId: 1,
    nextStaffId: count,
  };

  if (options.startHour !== undefined || options.startDay !== undefined) {
    world.clock.elapsed =
      (options.startDay ?? 0) * time.hoursPerDay * time.secondsPerHour +
      (options.startHour ?? 0) * time.secondsPerHour;
  }
  recomputeReputation(world);
  return world;
};

/** One fixed 10 Hz tick. Never tie any of this to frame rate (§4.1). */
export const tick = (world: World): void => {
  const dayBefore = dayIndex(world.clock);
  const hourBefore = hourOfDay(world.clock);
  advance(world.clock);

  if (isTrading(world.clock)) {
    stepArrivals(world, world.venue);
    takeOrders(world);
  }

  // The kitchen keeps going after close — it finishes what it started, and stock keeps ageing.
  stepIncidents(world);
  stepKitchen(world);
  fillOrders(world);
  binSpoiled(world);
  stepReneging(world);
  stepService(world);
  flushReviews(world);

  stepEconomy(world, hourBefore);

  world.rngCalls = world.rng.calls;
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
    s.x = floorCfg.doorTile.x;
    s.y = floorCfg.doorTile.y;
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
