/** Everything the sim tracks. Plain data — serialisable, inspectable, no classes with behaviour. */
import type { StationType } from "../config/recipes.js";

export type CustomerState = "queued" | "ordering" | "waiting" | "served" | "balked";

export interface Customer {
  id: number;
  /** Game seconds when they walked in. */
  arrivedAt: number;
  state: CustomerState;
  /** What they want. Recipe ids, possibly repeated. */
  basket: string[];
  orderId: number | null;
  /** Minutes they were prepared to wait, drawn on arrival. */
  patienceMinutes: number;
}

export interface OrderItem {
  recipeId: string;
  /** Step ids still to do. */
  remaining: string[];
  /** Step ids finished. */
  done: string[];
  /** Mean quality of the components that went into it, 0-1. */
  quality: number;
  ready: boolean;
}

export interface Order {
  id: number;
  customerId: number;
  placedAt: number;
  items: OrderItem[];
  /** Set when every item is plated. */
  completedAt: number | null;
  /** True if an error forced a remake. */
  remade: boolean;
  /** Player-expedited orders sort ahead of everything else (§12). */
  expedited: boolean;
}

/** A batch of something, sitting in a buffer and getting older. */
export interface Lot {
  qty: number;
  madeAt: number;
  freshnessWindow: number | undefined;
  /** Quality inherited from whatever went into it. */
  quality: number;
}

/** A batch being made right now, including the walk to get to the station. */
export interface Job {
  id: string;
  stationId: string;
  staffId: string;
  output: string;
  batchSize: number;
  /** Seconds of work left, at skill 1.0. */
  remaining: number;
  /** Seconds of walking left before work can start. The throughput tax (§4.5). */
  travelRemaining: number;
  inputQuality: number;
  freshnessWindow: number | undefined;
}

export interface Task {
  orderId: number;
  itemIndex: number;
  stepId: string;
  station: StationType;
  /** Game seconds of work still required. */
  remaining: number;
  /** Set while a staff member is on it. */
  assignedTo: string | null;
}

export interface StationInstance {
  id: string;
  type: StationType;
  /** Grid position — unused until M1, carried now so nothing has to be invented later. */
  x: number;
  y: number;
  /** Game seconds this station has been running, for utilities. */
  runSeconds: number;
  busyWith: string | null;
}

export interface StaffMember {
  id: string;
  name: string;
  traits: string[];
  skill: Partial<Record<StationType, number>>;
  stamina: number;
  morale: number;
  type: "casual" | "partTime" | "fullTime";
  hourlyRate: number;
  /** Job currently being worked, or null if free. */
  jobId: string | null;
  /** Where they are standing, in tile coords. Walking between stations costs real time. */
  x: number;
  y: number;
  /** Game seconds worked in the current shift, for fatigue and slow starters. */
  shiftSeconds: number;
  /** Game seconds worked all up, for skill. */
  hoursWorked: number;
}

export interface Review {
  at: number;
  stars: number;
  reason: string;
}

export interface DayTotals {
  day: number;
  covers: number;
  balked: number;
  revenue: number;
  cogs: number;
  wagesAccrued: number;
  ordersCompleted: number;
  waitSecondsTotal: number;
  satisfactionTotal: number;
  reviews: number;
  /** Value of everything binned as spoiled. A headline number — it is what makes supply land. */
  waste: number;
  wasteUnits: number;
  batchesMade: number;
  /** Seconds staff spent walking rather than working. The layout tax, made visible. */
  walkSeconds: number;
  /** Reputation as it stood when this day closed — not the final value (that was a report bug). */
  reputationAtClose: number;
}

export const emptyDay = (day: number): DayTotals => ({
  day,
  covers: 0,
  balked: 0,
  revenue: 0,
  cogs: 0,
  wagesAccrued: 0,
  ordersCompleted: 0,
  waitSecondsTotal: 0,
  satisfactionTotal: 0,
  reviews: 0,
  waste: 0,
  wasteUnits: 0,
  batchesMade: 0,
  walkSeconds: 0,
  reputationAtClose: 0,
});
