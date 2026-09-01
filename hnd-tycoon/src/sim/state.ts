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
import type { Capability } from '@/config/ladder';
import { buildAllGraphs, type RecipeGraph } from './recipeGraph';
import { Floor, type Tile } from './floor';
import { makeStation, type Job, type Station } from './entities/station';
import { makeStaff, type Staff } from './entities/staff';
import { Stock } from './entities/stock';
import { Ledger } from './ledger';
import { Rng } from './rng';
import type { Review } from './systems/reputation';
import type { Incident } from './systems/incidents';
import type { RecoveryPlan } from './systems/recovery';
import { ECONOMY } from '@/config/economy';
import { REPUTATION } from '@/config/reputation';
import { PRICING } from '@/config/marketing';
import type { Constraint } from './systems/bottleneck';
import type { Customer, Order } from './entities/order';
import { id, ZERO, type Money, type OrderId, type RecipeId, type SiteId, type StaffId } from './types';

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
  /** Units binned for going past saving. §7.3. */
  wasteUnits: number;
  /** Customers who looked at the queue and walked. §6.3 — a headline stat. */
  balked: number;
  /**
   * Walkouts by archetype. §6.2 — losing eight passers-by is a different shop
   * from losing eight Regulars, and the readout has to be able to say which.
   */
  balkedBy: Record<string, number>;
  /** Reviews left today. */
  reviews: number;
  satisfactionSum: number;
  satisfactionCount: number;
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
    wasteUnits: NONE,
    balked: NONE,
    balkedBy: {},
    reviews: NONE,
    satisfactionSum: NONE,
    satisfactionCount: NONE,
  };
}

/**
 * Somebody who reached the door and kept walking. Drained by the renderer.
 *
 * It carries the archetype because §6.2 wants the silhouette to be readable —
 * losing a table of six looks different from losing one bloke on his lunch
 * break, and it should look different on screen too.
 */
export interface Walkout {
  readonly id: number;
  readonly archetypeId: string;
  /** How long the queue was when they gave up. Drives how far along it they got. */
  readonly queueLength: number;
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
  /**
   * How much of each intermediate item to hold ahead of demand. Zero is
   * make-to-order. On state rather than read straight from config because the
   * player sets these from step 19 and the harness moves them now.
   */
  readonly parLevels: Record<string, number>;
  /** Holding cabinets owned. Each multiplies freshness windows. §14.2 tier 1. */
  holdingCabinets: number;
  readonly ledger: Ledger;
  /** Wages earned but not yet paid. Lands Sunday 23:00 as a lump. §8 */
  accruedWages: Money;
  lastPayroll: Money;
  /** §8.1 — the early COGS lever. */
  ingredientTier: keyof typeof ECONOMY.INGREDIENT_TIERS;
  /** The current answer to "what is holding me back". §13 */
  bottleneck: Constraint | null;
  /** Whether the shutters are up. The kitchen starts no new work when false. */
  tradingOpen: boolean;
  /** How many staff are rostered on today. Read by balking and the readout. */
  onToday: number;
  /**
   * Who is actually working today, snapshotted when the day opened.
   *
   * The roster a player edits is next week's; today's is already fixed. Reading
   * the editable roster live let you put someone on at 7pm to break a rush and
   * take them off at 2pm to dodge the wage — two hours of cover for a quarter
   * of the cost, which would have deleted the labour decision entirely.
   */
  readonly workingToday: Set<string>;
  /** Days elapsed. Notice periods are counted against it. */
  dayIndex: number;
  /** Customers who took one look at the queue and kept walking. §6.3 */
  balked: number;
  /**
   * Every review ever left. §6.5 — each carries its channel, so `delivery` is
   * a config line rather than a second array.
   */
  readonly reviews: Review[];
  /** A named RNG stream, so reviews cannot shift any other system's sequence. */
  readonly rng: Rng;

  // --- §9, §10 ------------------------------------------------------------
  /** Everything currently wrong. Degrades, never expires. §9 */
  readonly incidents: Incident[];
  /** The Recovery Plan, or null when the shop is not in trouble. §10 */
  recovery: RecoveryPlan | null;
  /** Which overdraft tier the bank is at, or null in the black. §10 */
  bankTier: string | null;

  // --- §15 the progression spine -----------------------------------------
  /** Rung ids banked. §15.1 — the ladder IS the unlock system. */
  readonly rungs: string[];
  /** The rung that landed most recently, for the HUD to celebrate once. */
  justUnlocked: string | null;
  /** Rungs banked today, so the per-day cap holds across both award paths. */
  rungsToday: number;
  /** Today's one-line verdict. §15.2 */
  headline: string;
  /** Which template wrote it, and for how many days running. See `again`. */
  headlineId: string | null;
  headlineStreak: number;
  /** Yesterday's rating, so the headline can say the rating MOVED. */
  starsYesterday: number;
  /** Best covers per weekday so far, so "best Tuesday yet" is true. */
  readonly bestCoversByWeekday: Record<number, number>;
  bestRevenueCents: number;
  /** Rolling week, for the rungs §15.1 measures over a week. */
  readonly weekWaste: {
    wasted: number;
    produced: number;
    revenueCents: number;
    wagesCents: number;
    costsCents: number;
    wagesAtWeekStart: number;
    costsAtWeekStart: number;
  };
  /** §15.3's dead-zone detector. The last day anything was worth doing. */
  lastDecisionDay: number;

  // --- §16 contracts ------------------------------------------------------
  /** The one active job. §16: "one active contract maximum." */
  contract: { id: string; dueOnDay: number; progress: number } | null;
  /** On the table but not answered. Lapses free — never becomes a failure. */
  contractOffer: { id: string; lapsesOnDay: number } | null;
  nextOfferDay: number;
  /**
   * Capabilities won from contracts. Kept apart from `rungs` so §15.1's ladder
   * stays a statement about the shop's own trading — a contract may only ever
   * open a door EARLY, never be required to reach one.
   */
  readonly contractRewards: Capability[];
  /** Stars-worth of goodwill won and lost on jobs. Signed, and it can go down. */
  contractGoodwill: number;
  contractsDone: number;
  contractsFailed: number;
  /** People the festival has off the floor today. §8's labour, from outside. */
  staffAway: number;

  /**
   * This week's special. §18.
   *
   * `running` is locked on Monday and `pending` is what next Monday will pick
   * up — the same delayed-landing shape as §8.2's price change, and for the
   * same reason: a special chosen mid-rush to catch a rush would be demand out
   * of nothing.
   */
  readonly special: {
    running: string | null;
    pending: string | null;
    /** How many units the PLAYER asked for. The whole decision lives here. */
    prepTarget: number;
    prepped: number;
    preppedCost: number;
    sold: number;
    /** Seekers sent away because it ran out. §18's 86'ing. */
    turnedAway: number;
    /**
     * 0..1 on how much a special the shop announces is still believed. §18.
     *
     * Falls when you 86, recovers over clean weeks. It is what makes running
     * out compound rather than being a one-off cost, and it is the only reason
     * deliberate under-prepping is not the best play in the game.
     */
    credibility: number;
    /** §8's special-promotion channel. Paid weekly, lifts only this special. */
    promoted: boolean;
    pendingPromo: boolean;
  };
  /**
   * Whether preventive maintenance is being paid. §14.4.
   *
   * One shop-wide toggle rather than a schedule per machine, because the spec
   * calls it "a small recurring cost the player can skip" and describes exactly
   * one decision: *"skipping is correct in a cash crunch and expensive later.
   * Good decision."* A per-machine schedule is admin, not a decision.
   */
  maintaining: boolean;
  /**
   * Walkouts that have not been drawn yet. §6.3, and the step 10 exit criterion:
   * **a walkout must be legible on screen BEFORE the stat moves.**
   *
   * A counter is not legible. Somebody has to visibly reach the door, look at
   * the queue, turn around and go — and the renderer cannot show that unless
   * the sim tells it one happened. This is a queue the renderer drains, not
   * state the sim reads back, which is why it is capped: if nothing is
   * rendering (the harness, a headless run, a backgrounded tab) it must not
   * grow without bound.
   */
  readonly walkouts: Walkout[];

  // --- §6.1 demand terms -------------------------------------------------
  /** Live star rating, refreshed each day so arrivals can read it cheaply. */
  stars: number;
  /** Menu price as a multiple of the recipe's listed price. §8.2 */
  priceMultiplier: number;
  /** Set by the player; lands next trading day. That delay IS the design. */
  pendingPriceMultiplier: number | null;
  /** Dollars per week, per channel. §8.3 */
  readonly marketingSpend: Record<string, number>;
  readonly channelAwareness: Record<string, number>;
  marketingAwareness: number;
  /** §6.1, pinned at zero until specials arrive at step 15. */
  specialUplift: number;
  /** §6.1, pinned at zero until Act III. Present so it never needs adding. */
  readonly competitorPressure: number;
  day: DayAccumulator;
  counters: { customer: number; order: number; job: number; incident: number };
}

export interface StateOptions {
  /** The run's seed. Named streams derive from it — see `rng` below. */
  seed?: number | string;
  siteId?: string;
  /** A named layout from `config/layouts.ts`. Defaults to the site's own. */
  layoutId?: string;
  /** An explicit layout, for the harness. Overrides `layoutId`. */
  stations?: readonly PlacedStation[];
  staff?: readonly { id: string; name: string; skill: number }[];
  /** Overrides `KITCHEN.PAR_LEVELS`. Par-cooking, made testable. */
  parLevels?: Readonly<Record<string, number>>;
  holdingCabinets?: number;
  openingCash?: Money;
  ingredientTier?: keyof typeof ECONOMY.INGREDIENT_TIERS;
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
      makeStaff(
        id<StaffId>(s.id),
        s.name,
        site.id as SiteId,
        s.skill,
        start,
        KITCHEN.OPENING_ROSTER,
      ),
    ),
    jobs: new Map(),
    stock: new Stock(),
    customers: new Map(),
    orders: new Map(),
    openOrders: [],
    parLevels: { ...KITCHEN.PAR_LEVELS, ...(opts.parLevels ?? {}) },
    holdingCabinets: opts.holdingCabinets ?? NONE,
    ledger: new Ledger(opts.openingCash ?? ECONOMY.OPENING_CASH),
    accruedWages: ZERO(),
    lastPayroll: ZERO(),
    ingredientTier: opts.ingredientTier ?? 'standard',
    bottleneck: null,
    tradingOpen: false,
    onToday: NONE,
    workingToday: new Set(),
    dayIndex: NONE,
    balked: NONE,
    walkouts: [],
    incidents: [],
    recovery: null,
    bankTier: null,
    maintaining: true,
    rungs: [],
    justUnlocked: null,
    rungsToday: NONE,
    headline: '',
    headlineId: null,
    headlineStreak: 0,
    starsYesterday: REPUTATION.PRIOR_STARS,
    bestCoversByWeekday: {},
    bestRevenueCents: NONE,
    weekWaste: {
      wasted: NONE,
      produced: NONE,
      revenueCents: NONE,
      wagesCents: NONE,
      costsCents: NONE,
      wagesAtWeekStart: NONE,
      costsAtWeekStart: NONE,
    },
    lastDecisionDay: NONE,
    contract: null,
    contractOffer: null,
    nextOfferDay: NONE,
    contractRewards: [],
    contractGoodwill: NONE,
    contractsDone: NONE,
    contractsFailed: NONE,
    staffAway: NONE,
    reviews: [],
    // The prior, not a guess: a shop with no reviews IS its prior, and starting
    // arrivals from a different number than reputation reports would make day
    // one's demand disagree with day one's star rating.
    stars: REPUTATION.PRIOR_STARS,
    priceMultiplier: PRICING.FAIR_PRICE_AT_PRIOR,
    pendingPriceMultiplier: null,
    marketingSpend: {},
    channelAwareness: {},
    marketingAwareness: NONE,
    specialUplift: NONE,
    special: {
      running: null,
      pending: null,
      prepTarget: NONE,
      prepped: NONE,
      preppedCost: NONE,
      sold: NONE,
      turnedAway: NONE,
      credibility: ONE,
      promoted: false,
      pendingPromo: false,
    },
    // §6.1: pinned at zero until Act III, present so it never needs adding.
    competitorPressure: NONE,
    // Seeded from the RUN, not the site: seeding from the site alone gave
    // every seed an identical review stream, so seed variation looked like it
    // worked and did nothing.
    rng: new Rng(`reviews:${opts.siteId ?? 'leichhardt'}:${String(opts.seed ?? 0)}`),
    day: emptyDay(),
    counters: { customer: NONE, order: NONE, job: NONE, incident: NONE },
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
