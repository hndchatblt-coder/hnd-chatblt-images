/**
 * The audit questions that must be *measured*, not argued (§18 Q1, Q2). These are tests rather
 * than a one-off script so the property survives every future balance change.
 */
import { describe, expect, it } from "vitest";
import { sweepStaff } from "../src/harness/sweep.js";

describe("every dial fights another dial", () => {
  // Range chosen to span the turnover. Wages are shift-only, so the shop absorbs more staff than
  // it used to before hiring stops paying — and revenue plateaus at 6 because the kitchen runs out
  // of stations, which is space doing its job.
  const rows = sweepStaff([1, 2, 4, 6, 8, 10, 12], 14, "42");

  it("staffing has a genuine optimum rather than being free to max", () => {
    // Pillar: "Any single stat can be maxed with no downside" is a stated fail condition.
    // Gross profit must peak somewhere in the middle and fall off, or hiring is a free win.
    const gross = rows.map((r) => r.gross);
    const best = gross.indexOf(Math.max(...gross));
    expect(best).toBeGreaterThan(0);
    expect(best).toBeLessThan(rows.length - 1);
    // And overstaffing must actually hurt, not merely stop helping.
    expect(gross[gross.length - 1]!).toBeLessThan(0);
  });

  it("revenue plateaus once there are more staff than stations", () => {
    // More bodies than benches does nothing, which is the spatial constraint showing up in the
    // economy rather than only in the walk times.
    const last = rows[rows.length - 1]!;
    const secondLast = rows[rows.length - 2]!;
    expect(Math.abs(last.revenue - secondLast.revenue)).toBeLessThan(1);
  });

  it("more staff always buys shorter waits — the cost is money, not service", () => {
    // The trade has to be legible: staff buy service, service buys reputation, reputation costs
    // wages. If waits got *worse* with more staff something is wrong with tasking.
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.meanWaitMinutes).toBeLessThanOrEqual(rows[i - 1]!.meanWaitMinutes + 0.1);
    }
  });

  it("the profit-optimal shop is not the best-reputation shop", () => {
    // This is the decision. Peak gross and peak reputation must sit at different staffing levels,
    // otherwise there is one right answer and no choice to make.
    const bestGross = rows.reduce((a, b) => (b.gross > a.gross ? b : a));
    const bestRep = rows.reduce((a, b) => (b.reputation > a.reputation ? b : a));
    expect(bestRep.value).toBeGreaterThan(bestGross.value);
  });
});
