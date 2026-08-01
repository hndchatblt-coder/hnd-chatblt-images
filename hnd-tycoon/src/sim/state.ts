/**
 * Everything the simulation holds. DESIGN.md §7, §7.1.
 *
 * One mutable state object, owned by the World and passed to systems. Systems
 * own behaviour; this owns data. Keeping them apart is what lets the fast sim
 * (§11.1) read the same state without instantiating a single agent, and the
 * fast sim is not an optimisation — by Act III it IS the game (§26.2).
 *
 * Every id counter lives here rather than in a module-level variable, because
 * a module-level counter survives across runs in the same process and would
 * silently break determinism between the first and second run of a test file.
 */
import { SITES, type SiteDefinition } from '@/config/sites';
import { KITCHEN } from '@/config/kitchen';
import { RECIPES } from '@/config/recipes';
import { buildAllGraphs, type RecipeGraph } from './recipeGraph';
import { makeStation, type Job, type Station } from './entities/station';
import { makeStaff, type Staff } from './entities/staff';
import { Stock } from './entities/stock';
import type { Customer, Order } from './entities/order';
import { id, type OrderId, type RecipeId, type SiteId, type StaffId } from './types';

export interface DayAccumulator {
  /** Customers who walked in today. */
  arrived: number;
  /** Orders fully served today. This is `covers`. */
  served: number;
  /** Sum of wait, in ticks, over orders served today. */
  waitTicks: number;
  /** Batches completed. Throughput independent of demand — see step 3. */
  batches: number;
  /** Units of finished goods produced. */
  unitsProduced: number;
}

export function emptyDay(): DayAccumulator {
  return { arrived: 0, served: 0, waitTicks: 0, batches: 0, unitsProduced: 0 };
}

export interface SimState {
  readonly site: SiteDefinition;
  readonly graphs: ReadonlyMap<RecipeId, RecipeGraph>;
  readonly stations: Station[];
  readonly staff: Staff[];
  readonly jobs: Map<string, Job>;
  readonly stock: Stock;
  /** Keyed by id, insertion-ordered — so iteration is arrival order. */
  readonly customers: Map<string, Customer>;
  readonly orders: Map<OrderId, Order>;
  /** Open orders in arrival order. Served orders are spliced out. */
  readonly openOrders: OrderId[];
  day: DayAccumulator;
  counters: { customer: number; order: number; job: number };
}

export interface StateOptions {
  siteId?: string;
  /** Overrides the opening line. The harness uses this to vary the kitchen. */
  stations?: readonly { id: string; type: Station['type']; speedMultiplier: number }[];
  staff?: readonly { id: string; name: string; skill: number }[];
}

export function createState(opts: StateOptions = {}): SimState {
  const siteKey = opts.siteId ?? 'leichhardt';
  const site = SITES[siteKey];
  if (!site) throw new Error(`Unknown site: ${siteKey}`);

  const stationDefs = opts.stations ?? KITCHEN.OPENING_LINE;
  const staffDefs = opts.staff ?? KITCHEN.OPENING_STAFF;

  return {
    site,
    graphs: buildAllGraphs(RECIPES),
    stations: stationDefs.map((s) => makeStation(s.id, s.type, s.speedMultiplier)),
    staff: staffDefs.map((s) => makeStaff(id<StaffId>(s.id), s.name, site.id as SiteId, s.skill)),
    jobs: new Map(),
    stock: new Stock(),
    customers: new Map(),
    orders: new Map(),
    openOrders: [],
    day: emptyDay(),
    counters: { customer: 0, order: 0, job: 0 },
  };
}
