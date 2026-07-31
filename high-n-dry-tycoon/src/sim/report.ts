/**
 * The day report. This is M0's entire user interface, and the brief is explicit about why: if the
 * game isn't interesting as a text log of numbers, no amount of animation saves it (§0).
 *
 * Every number is formatted with fixed precision and no locale, so two runs on the same seed
 * produce byte-identical text and the determinism gate can just diff them.
 */
import type { DayTotals } from "./entities.js";
import type { World } from "./world.js";

const money = (n: number): string => `$${n.toFixed(2)}`;
const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
const pad = (s: string, n: number): string => s.padStart(n);

export const dayLine = (d: DayTotals): string => {
  const served = d.ordersCompleted;
  const meanWait = served > 0 ? d.waitSecondsTotal / served / 60 : 0;
  const meanSat = served > 0 ? d.satisfactionTotal / served : 0;
  const balkRate = d.covers + d.balked > 0 ? d.balked / (d.covers + d.balked) : 0;
  const gross = d.revenue - d.cogs;
  const cogsPct = d.revenue > 0 ? d.cogs / d.revenue : 0;
  const labourPct = d.revenue > 0 ? d.wagesAccrued / d.revenue : 0;

  return [
    `D${pad(String(d.day), 3)}`,
    `in ${pad(String(d.covers), 4)}`,
    `balk ${pad(String(d.balked), 4)} (${pad(pct(balkRate), 6)})`,
    `served ${pad(String(served), 4)}`,
    `wait ${pad(meanWait.toFixed(1), 5)}m`,
    `sat ${pad(meanSat.toFixed(2), 5)}`,
    `rev ${pad(money(d.revenue), 10)}`,
    `cogs ${pad(pct(cogsPct), 6)}`,
    `wages ${pad(pct(labourPct), 6)}`,
    `gross ${pad(money(gross), 10)}`,
    `rep ${d.reputationAtClose.toFixed(2)}`,
  ].join("  ");
};

export const header = (world: World): string =>
  [
    `venue      ${world.venue.name} (${world.venue.grid.w}x${world.venue.grid.d})`,
    `staff      ${world.staff.length} — ${world.staff.map((s) => s.name).join(", ")}`,
    `menu       ${Object.entries(world.menuPrice).map(([k, v]) => `${k} ${money(v)}`).join(", ")}`,
  ].join("\n");

export const summary = (world: World): string => {
  const days = world.history.filter((d) => d.covers > 0 || d.ordersCompleted > 0);
  const walkedIn = days.reduce((a, d) => a + d.covers + d.balked, 0);
  const total = days.reduce(
    (a, d) => ({
      covers: a.covers + d.covers,
      balked: a.balked + d.balked,
      revenue: a.revenue + d.revenue,
      cogs: a.cogs + d.cogs,
      wages: a.wages + d.wagesAccrued,
      served: a.served + d.ordersCompleted,
      wait: a.wait + d.waitSecondsTotal,
      sat: a.sat + d.satisfactionTotal,
    }),
    { covers: 0, balked: 0, revenue: 0, cogs: 0, wages: 0, served: 0, wait: 0, sat: 0 },
  );

  const meanWait = total.served > 0 ? total.wait / total.served / 60 : 0;
  const meanSat = total.served > 0 ? total.sat / total.served : 0;
  const balkRate =
    total.covers + total.balked > 0 ? total.balked / (total.covers + total.balked) : 0;

  return [
    "",
    `walked in    ${walkedIn}`,
    `served       ${total.served}`,
    `balked       ${total.balked} (${pct(balkRate)})`,
    `mean wait    ${meanWait.toFixed(1)} min`,
    `mean sat     ${meanSat.toFixed(2)}`,
    `revenue      ${money(total.revenue)}`,
    `cogs         ${money(total.cogs)} (${pct(total.revenue > 0 ? total.cogs / total.revenue : 0)})`,
    `wages        ${money(total.wages)} (${pct(total.revenue > 0 ? total.wages / total.revenue : 0)})`,
    `gross        ${money(total.revenue - total.cogs - total.wages)}`,
    `reputation   ${world.reputation.toFixed(2)} stars from ${world.reviews.length} reviews`,
    `cash         ${money(world.cash)}`,
  ].join("\n");
};
