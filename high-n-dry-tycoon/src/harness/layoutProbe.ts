/**
 * The M1 gate (§15): "Moving the grill 6 tiles further from the pass measurably drops throughput
 * in the harness. Show the numbers."
 *
 * This is the load-bearing experiment for the entire spatial layer. If distance doesn't cost
 * throughput, the first design pillar has already failed and layout is cosmetic.
 */
import { stationByType } from "../config/stations.js";
import { venueById } from "../config/venues.js";
import { canPlace, centreOf, tileDistance, travelSeconds, type Placement } from "../sim/floor.js";
import { defaultLayout } from "../sim/layouts.js";
import { dtGameSeconds } from "../config/time.js";
import { createWorld, runDays, tick } from "../sim/world.js";

export interface LayoutResult {
  label: string;
  grillToPassTiles: number;
  grillToPassSeconds: number;
  served: number;
  /**
   * Batches the kitchen actually produced. This is throughput; `served` is not.
   *
   * Once reneging landed, a slower layout could come out with MORE orders served, because
   * customers giving up frees the kitchen to finish the ones still waiting. Demand-side outcomes
   * are the wrong instrument for a question about how far someone has to walk.
   */
  batches: number;
  meanWaitMinutes: number;
  walkMinutes: number;
  revenue: number;
  waste: number;
}

/**
 * Same fit-out, with the grill and the pass `offset` tiles further apart.
 *
 * **The grill cannot be the thing that moves**, and that is worth knowing rather than working
 * around: the grill needs gas, the gas runs along the back wall only, so its freedom is lateral
 * and bounded by the venue's width. In a 9-wide Leichhardt the furthest it can get from the pass
 * is about two extra tiles. Service points are genuinely load-bearing constraints, which is the
 * point of §4.5.
 *
 * So the distance is opened up by moving the pass, which only needs power. Identical physics —
 * the walk between two dependent stations gets six tiles longer — and it is the move a player
 * would actually make, because the pass is the station they *can* move.
 */
export const layoutWithGrillOffset = (venueId: string, offset: number): Placement[] => {
  const venue = venueById.get(venueId);
  if (!venue) throw new Error(`unknown venue: ${venueId}`);
  const base = defaultLayout(venue);
  const pass = base.find((p) => p.type === "pass");
  const grill = base.find((p) => p.type === "grill");
  if (!pass || !grill) throw new Error("layout is missing the pass or the grill");

  const others = base.filter((p) => p.type !== "pass");
  const def = stationByType.get("pass");
  const w = def?.footprint.w ?? 1;
  const d = def?.footprint.d ?? 1;
  const original = tileDistance(centreOf(grill), centreOf(pass));

  // Nearest legal spot that is at least `offset` tiles further from the grill than we started.
  let best: { placement: Placement; extra: number } | null = null;
  for (let y = 0; y + d <= venue.grid.d; y += 1) {
    for (let x = 0; x + w <= venue.grid.w; x += 1) {
      const candidate: Placement = { type: "pass", x, y };
      if (!canPlace(venue, others, candidate).ok) continue;
      const extra = tileDistance(centreOf(grill), centreOf(candidate)) - original;
      if (extra < offset) continue;
      if (best === null || extra < best.extra) best = { placement: candidate, extra };
    }
  }
  if (!best) {
    throw new Error(`cannot open ${offset} tiles between grill and pass in ${venueId}`);
  }
  return [best.placement, ...others];
};

/**
 * Mean of `runLayout` over several seeds.
 *
 * A single seed was never going to answer this: at 3 staff on seed 42 the longer layout came out
 * 4% *faster*, which is arrival noise, not physics. Anything comparing two layouts has to average
 * or it is reading tea leaves.
 */
export const runLayoutSeeded = (
  label: string,
  venueId: string,
  layout: Placement[],
  days: number,
  seeds: string[],
  staffCount: number,
): LayoutResult => {
  const runs = seeds.map((seed) => runLayout(label, venueId, layout, days, seed, staffCount));
  const mean = (pick: (r: LayoutResult) => number): number =>
    runs.reduce((a, r) => a + pick(r), 0) / runs.length;
  const first = runs[0] as LayoutResult;
  return {
    label,
    grillToPassTiles: first.grillToPassTiles,
    grillToPassSeconds: first.grillToPassSeconds,
    served: mean((r) => r.served),
    batches: mean((r) => r.batches),
    meanWaitMinutes: mean((r) => r.meanWaitMinutes),
    walkMinutes: mean((r) => r.walkMinutes),
    revenue: mean((r) => r.revenue),
    waste: mean((r) => r.waste),
  };
};

/**
 * Throughput with the demand side held still.
 *
 * Comparing two layouts on a live shop is confounded: a slower kitchen makes people renege, which
 * *reduces* the work the kitchen is asked to do, which can make the slower layout look faster.
 * Twice now that feedback loop has inverted the result.
 *
 * So the honest measurement holds an unlimited order book open and counts what the kitchen
 * produces. Pure capacity, no demand feedback, which is exactly the question "does distance cost
 * throughput" is asking.
 */
export const throughputUnderSaturation = (
  venueId: string,
  layout: Placement[],
  hours: number,
  seed: string,
  staffCount: number,
): { batches: number; walkMinutes: number } => {
  const world = createWorld({ seed, venueId, staffCount, layout });

  // A permanently full order book. Refilled every tick so the kitchen is never demand-starved.
  const topUp = (): void => {
    while (world.orders.length < 40) {
      world.orders.push({
        id: world.nextOrderId++,
        customerId: -1,
        placedAt: world.clock.elapsed,
        items: [
          { recipeId: "cheeseburger", remaining: [], done: [], quality: 1, ready: false },
          { recipeId: "chips", remaining: [], done: [], quality: 1, ready: false },
        ],
        completedAt: null,
        remade: false,
        expedited: false,
      });
    }
  };

  const ticks = Math.round((hours * 3600) / dtGameSeconds);
  for (let i = 0; i < ticks; i += 1) {
    topUp();
    // Clear anything filled so the book never blocks on completed work.
    world.orders = world.orders.filter((o) => o.completedAt === null && !o.items.every((it) => it.ready));
    tick(world);
  }

  const batches = world.history.reduce((a, d) => a + d.batchesMade, 0) + world.day.batchesMade;
  const walk = world.history.reduce((a, d) => a + d.walkSeconds, 0) + world.day.walkSeconds;
  return { batches, walkMinutes: walk / 60 };
};

export const runLayout = (
  label: string,
  venueId: string,
  layout: Placement[],
  days: number,
  seed: string,
  staffCount: number,
): LayoutResult => {
  const world = createWorld({ seed, venueId, staffCount, layout });
  runDays(world, days);

  const pass = layout.find((p) => p.type === "pass");
  const grill = layout.find((p) => p.type === "grill");
  const tiles = pass && grill ? tileDistance(centreOf(grill), centreOf(pass)) : 0;

  const t = world.history.reduce(
    (a, d) => ({
      served: a.served + d.ordersCompleted,
      batches: a.batches + d.batchesMade,
      wait: a.wait + d.waitSecondsTotal,
      walk: a.walk + d.walkSeconds,
      revenue: a.revenue + d.revenue,
      waste: a.waste + d.waste,
    }),
    { served: 0, batches: 0, wait: 0, walk: 0, revenue: 0, waste: 0 },
  );

  return {
    label,
    grillToPassTiles: tiles,
    grillToPassSeconds: pass && grill ? travelSeconds(centreOf(grill), centreOf(pass)) : 0,
    served: t.served,
    batches: t.batches,
    meanWaitMinutes: t.served > 0 ? t.wait / t.served / 60 : 0,
    walkMinutes: t.walk / 60,
    revenue: t.revenue,
    waste: t.waste,
  };
};
