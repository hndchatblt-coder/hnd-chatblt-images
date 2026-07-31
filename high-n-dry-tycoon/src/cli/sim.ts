/**
 * `npm run sim -- --days 7 --seed 42`
 *
 * M0's gate: this must give a stable day report, and the same seed must give byte-identical
 * output. Nothing here reads the wall clock or the environment for that reason.
 */
import { createWorld, runDays } from "../sim/world.js";
import { dayLine, header, profitAndLoss, summary } from "../sim/report.js";

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const days = Number(arg("days", "7"));
const seed = arg("seed", "42");
const venueId = arg("venue", "leichhardt");
const staffCount = Number(arg("staff", "1"));

const world = createWorld({ seed, venueId, staffCount });
console.log(`High N' Dry Tycoon — headless sim`);
console.log(`seed ${seed} · ${days} days`);
console.log(header(world));
console.log("");

runDays(world, days);
for (const d of world.history) {
  if (d.covers === 0 && d.ordersCompleted === 0) continue;
  console.log(dayLine(d));
}
console.log(summary(world));
console.log(profitAndLoss(world));
