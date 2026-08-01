/**
 * Everything the simulation holds. DESIGN.md §7, §7.1, §12.
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
import { DEFAULT_LAYOUT_FOR, LAYOUTS, type PlacedStation } from '@/config/layouts';
import { RECIPES } from '@/config/recipes';
import { buildAllGraphs, type RecipeGraph } from './recipeGraph';
import { Floor, type Tile } from './floor';
import { makeStation, type Job, type Station } from './entities/station';
import { makeStaff, type Staff } from './entities/staff';
import { Stock } from './entities/stock';
import type { Customer, Order } from './entities/order';
import { id, type OrderId, type RecipeId, type SiteId, type StaffId } from './types';

const NONE = 0;
const ONE = 1;

export interface DayAccumulator {
  /** Customers who walked in today. */
  arrived: number;
  /** Orders fully served today. This is `covers`. */
  served: number;
  /** Sum of wait, in ticks, over orders served today. */
  waitTicks: number;
  /** Batches completed. Throughput independent of demand — the step 3 measure. */
  batches: number;
  /** Units of finished goods produced. */
  unitsProduced: number;
  /** Staff-seconds spent walking. The floorplan's bill, itemised. */
  walkSeconds: number;
  /** Staff-seconds spent actually working. */
  workSeconds: number;
}

export function emptyDay(): DayAccumulator {
  return {
    arrived: NONE,
    served: NONE,
    waitTicks: NONE,
    batches: NONE,
    unitsProduced: NONE,
    walkSeconds: NONE,
    workSeconds: NONE,
  };
}

export interface SimState {
  readonly site: SiteDefinition;
  readonly floor: Floor;
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
  /** A named layout from `config/layouts.ts`. Defaults to the site's own. */
  layoutId?: string;
  /** An explicit layout, for the harness. Overrides `layoutId`. */
  stations?: readonly PlacedStation[];
  staff?: readonly { id: string; name: string; skill: number }[];
}

export function createState(opts: StateOptions = {}): SimState {
  const siteKey = opts.siteId ?? 'leichhardt';
  const site = SITES[siteKey];
  if (!site) throw new Error(`Unknown site: ${siteKey}`);

  const layoutKey = opts.layoutId ?? DEFAULT_LAYOUT_FOR[siteKey];
  const layout = layoutKey === undefined ? undefined : LAYOUTS[layoutKey];
  const placed = opts.stations ?? layout?.stations;
  if (!placed) throw new Error(`No layout for site: ${siteKey}`);

  const floor = new Floor(site);
  const stations: Station[] = [];
  for (const p of placed) {
    // Throws with a readable reason. A layout that does not fit is a content
    // bug and must fail at load, not produce a kitchen with a phantom grill.
    floor.place(p.id, p.type, { x: p.x, y: p.y, rotated: p.rotated ?? false });
    stations.push(makeStation(p.id, p.type, p.speedMultiplier ?? ONE));
  }

  const staffDefs = opts.staff ?? KITCHEN.OPENING_STAFF;
  const start = startingTile(floor, stations);

  return {
    site,
    floor,
    graphs: buildAllGraphs(RECIPES),
    stations,
    staff: staffDefs.map((s) =>
      makeStaff(id<StaffId>(s.id), s.name, site.id as SiteId, s.skill, start),
    ),
    jobs: new Map(),
    stock: new Stock(),
    customers: new Map(),
    orders: new Map(),
    openOrders: [],
    day: emptyDay(),
    counters: { customer: NONE, order: NONE, job: NONE },
  };
}

/**
 * Where people start the day: at the pass, because that is where you stand
 * when there is nothing to do. Falls back to the first walkable tile so a
 * kitchen without a pass still runs rather than throwing.
 */
function startingTile(floor: Floor, stations: readonly Station[]): Tile {
  const pass = stations.find((s) => s.type === 'pass');
  const at = pass ? floor.accessTiles(pass.id)[NONE] : undefined;
  if (at) return at;
  for (let y = NONE; y < floor.depth; y += ONE) {
    for (let x = NONE; x < floor.width; x += ONE) {
      if (floor.isWalkable(x, y)) return { x, y };
    }
  }
  throw new Error(`${floor.site.name} has nowhere to stand`);
}
