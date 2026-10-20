/**
 * The M5 gate (§7.1), non-negotiable and in CI: over 7 simulated days across seeds and layouts,
 * the fast sim must land within 5% of the full sim on revenue, waste and reputation.
 *
 * Compared on the **mean across seeds**, not seed by seed. The fast sim is a closed form and has
 * no per-seed variance at all, while the full sim's own revenue swings ±5% between seeds — so a
 * seed-by-seed comparison mostly measures the full sim's noise, not the model's accuracy.
 */
import { time } from "../config/time.js";
import { venueById } from "../config/venues.js";
import { layoutWithGrillOffset } from "./layoutProbe.js";
import { defaultLayout } from "../sim/layouts.js";
import { runFast } from "../sim/fastsim/fastsim.js";
import { createWorld, runDays } from "../sim/world.js";
import type { Placement } from "../sim/floor.js";

export interface FastCheckRow {
  metric: string;
  full: number;
  fast: number;
  driftPct: number;
}

export const compareFastSim = (
  seeds: string[],
  layouts: Placement[][],
  days: number,
  staffCount: number,
): FastCheckRow[] => {
  const full = { revenue: 0, waste: 0, reputation: 0 };
  const fast = { revenue: 0, waste: 0, reputation: 0 };
  let runs = 0;

  for (const layout of layouts) {
    for (const seed of seeds) {
      const a = createWorld({ seed, staffCount, layout });
      runDays(a, days);
      full.revenue += a.history.reduce((x, d) => x + d.revenue, 0);
      full.waste += a.history.reduce((x, d) => x + d.waste, 0);
      full.reputation += a.reputation;

      const b = createWorld({ seed, staffCount, layout });
      const r = runFast(b, days * time.hoursPerDay);
      fast.revenue += r.revenue;
      fast.waste += r.waste;
      fast.reputation += r.reputation;
      runs += 1;
    }
  }

  const row = (metric: string, f: number, g: number): FastCheckRow => ({
    metric,
    full: f / runs,
    fast: g / runs,
    driftPct: f === 0 ? 0 : ((g - f) / f) * 100,
  });

  return [
    row("revenue", full.revenue, fast.revenue),
    row("waste", full.waste, fast.waste),
    row("reputation", full.reputation, fast.reputation),
  ];
};

export const gateLayouts = (): Placement[][] => {
  const venue = venueById.get("leichhardt");
  if (!venue) throw new Error("no leichhardt");
  return [
    defaultLayout(venue),
    layoutWithGrillOffset("leichhardt", 3),
    layoutWithGrillOffset("leichhardt", 6),
  ];
};
