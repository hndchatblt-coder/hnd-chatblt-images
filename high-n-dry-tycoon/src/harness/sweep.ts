/**
 * Parameter sweeps for the audit (§18 Q1, Q2): is there actually a decision here, and can any
 * stat be maximised with no downside?
 *
 * Answering that by argument is worthless. Sweep it and look at the curve.
 */
import { createWorld, runDays } from "../sim/world.js";

export interface SweepRow {
  value: number;
  revenue: number;
  cogs: number;
  wages: number;
  gross: number;
  labourPct: number;
  balkPct: number;
  meanWaitMinutes: number;
  reputation: number;
}

export const sweepStaff = (counts: number[], days: number, seed: string): SweepRow[] =>
  counts.map((n) => {
    const world = createWorld({ seed, staffCount: n });
    runDays(world, days);
    const t = world.history.reduce(
      (a, d) => ({
        rev: a.rev + d.revenue,
        cogs: a.cogs + d.cogs,
        wages: a.wages + d.wagesAccrued,
        served: a.served + d.ordersCompleted,
        wait: a.wait + d.waitSecondsTotal,
        cov: a.cov + d.covers,
        balk: a.balk + d.balked,
      }),
      { rev: 0, cogs: 0, wages: 0, served: 0, wait: 0, cov: 0, balk: 0 },
    );
    return {
      value: n,
      revenue: t.rev,
      cogs: t.cogs,
      wages: t.wages,
      gross: t.rev - t.cogs - t.wages,
      labourPct: t.rev > 0 ? t.wages / t.rev : 0,
      balkPct: t.cov + t.balk > 0 ? t.balk / (t.cov + t.balk) : 0,
      meanWaitMinutes: t.served > 0 ? t.wait / t.served / 60 : 0,
      reputation: world.reputation,
    };
  });
