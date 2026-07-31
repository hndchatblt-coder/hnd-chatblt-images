/**
 * Milestone gates (§15). Run by `npm run gate` after typecheck and tests. Non-zero exit on
 * failure so it can sit in CI.
 */
import { execFileSync } from "node:child_process";
import { layoutWithGrillOffset, runLayoutSeeded, throughputUnderSaturation } from "../harness/layoutProbe.js";
import { defaultLayout } from "../sim/layouts.js";
import { venueById } from "../config/venues.js";
import { createWorld, runDays } from "../sim/world.js";
import { bots } from "../harness/bots.js";
import { runSessions } from "../harness/session.js";
import { economy } from "../config/economy.js";
import { chart, spiralAndRecover } from "../harness/spiral.js";

let failures = 0;
const check = (name: string, ok: boolean, detail: string): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
};

/* ------------------------------------------------------------------- M0 */
console.log("M0 gate — headless core\n");

const run = (seed: string): string =>
  execFileSync("npx", ["tsx", "src/cli/sim.ts", "--days", "7", "--seed", seed], {
    encoding: "utf8",
  });

const first = run("42");
check("byte-identical across processes", first === run("42"), `${first.length} bytes, two processes`);
check("a different seed gives a different run", first !== run("43"), "seed 42 vs 43");

const world = createWorld({ seed: "42", staffCount: 2 });
runDays(world, 7);
check(
  "seven days of trade",
  world.history.filter((d) => d.ordersCompleted > 0).length === 7,
  `${world.history.filter((d) => d.ordersCompleted > 0).length} days with completed orders`,
);
check("idle survives seven days", world.cash > 0, `cash $${world.cash.toFixed(2)}`);

/* ------------------------------------------------------------------- M1 */
console.log("\nM1 gate — space\n");

const venue = venueById.get("leichhardt");
if (!venue) throw new Error("no leichhardt");

const seeds = ["1", "2", "3", "4", "5", "6", "7", "8"];
const staffForGate = 2;
const near = runLayoutSeeded("stock fit-out", "leichhardt", defaultLayout(venue), 14, seeds, staffForGate);
const far = runLayoutSeeded(
  "+6 tiles apart",
  "leichhardt",
  layoutWithGrillOffset("leichhardt", 6),
  14,
  seeds,
  staffForGate,
);
console.log(`${seeds.length} seeds x 14 days, ${staffForGate} staff — means:\n`);

const pad = (s: string, n: number): string => s.padEnd(n);
console.log(
  [pad("layout", 16), pad("grill→pass", 12), pad("batches", 10), pad("served", 9), pad("walking", 10), "revenue"].join(""),
);
for (const r of [near, far]) {
  console.log(
    [
      pad(r.label, 16),
      pad(`${r.grillToPassTiles} tiles`, 12),
      pad(r.batches.toFixed(0), 10),
      pad(r.served.toFixed(0), 9),
      pad(`${r.walkMinutes.toFixed(0)} min`, 10),
      `$${r.revenue.toFixed(0)}`,
    ].join(""),
  );
}

const movedBy = far.grillToPassTiles - near.grillToPassTiles;

// The clean measurement: unlimited orders, so throughput is pure kitchen capacity with no
// demand-side feedback to confound it.
const satSeeds = ["1", "2", "3", "4", "5", "6"];
const satNear = satSeeds.map((s) => throughputUnderSaturation("leichhardt", defaultLayout(venue), 33, s, 2));
const satFar = satSeeds.map((s) =>
  throughputUnderSaturation("leichhardt", layoutWithGrillOffset("leichhardt", 6), 33, s, 2),
);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const nearBatches = mean(satNear.map((r) => r.batches));
const farBatches = mean(satFar.map((r) => r.batches));
const nearWalk = mean(satNear.map((r) => r.walkMinutes));
const farWalk = mean(satFar.map((r) => r.walkMinutes));

console.log(`\n  saturated kitchen, ${satSeeds.length} seeds x 3 trading days:`);
console.log(`    stock fit-out   ${nearBatches.toFixed(0)} batches, ${nearWalk.toFixed(0)} min walking`);
console.log(`    +6 tiles apart  ${farBatches.toFixed(0)} batches, ${farWalk.toFixed(0)} min walking\n`);

const throughputDrop = (nearBatches - farBatches) / nearBatches;
const walkRise = (farWalk - nearWalk) / nearWalk;

console.log("");
check("grill and pass are 6+ tiles further apart", movedBy >= 6, `${near.grillToPassTiles} → ${far.grillToPassTiles} tiles`);
check(
  "throughput measurably drops",
  farBatches < nearBatches,
  `${nearBatches.toFixed(0)} → ${farBatches.toFixed(0)} batches (${(throughputDrop * 100).toFixed(1)}% fewer)`,
);
check(
  "and the cause is visible as walk time",
  farWalk > nearWalk,
  `${nearWalk.toFixed(0)} → ${farWalk.toFixed(0)} min walking (+${(walkRise * 100).toFixed(0)}%)`,
);

/* ------------------------------------------------------------------- M2 */
console.log("\nM2 gate — economy\n");

const pad2 = (s: string, n: number): string => s.padEnd(n);
console.log([pad2("bot", 12), pad2("cash", 12), pad2("rep", 7), pad2("staff", 7), pad2("cogs%", 8), pad2("labour%", 9), "reconciles"].join(""));

let allReconcile = true;
let allRan = true;

for (const bot of bots) {
  let world;
  try {
    world = createWorld({ seed: "42", staffCount: 2 });
    runSessions(world, bot, 90);
  } catch (error) {
    allRan = false;
    console.log(`${pad2(bot.id, 12)}CRASHED — ${(error as Error).message}`);
    continue;
  }

  // The reconciliation: cash must be exactly starting cash plus every posted movement. If these
  // disagree, some code moved money without telling the ledger and the P&L is fiction.
  const posted = Object.values(world.ledger).reduce((a, b) => a + b, 0);
  const expected = economy.startingCash + posted;
  const drift = Math.abs(world.cash - expected);
  const reconciles = drift < 0.005;
  if (!reconciles) allReconcile = false;

  const revenue = world.ledger.revenue ?? 0;
  console.log(
    [
      pad2(bot.id, 12),
      pad2(`$${world.cash.toFixed(0)}`, 12),
      pad2(world.reputation.toFixed(2), 7),
      pad2(String(world.staff.length), 7),
      pad2(`${((revenue > 0 ? -(world.ledger.cogs ?? 0) / revenue : 0) * 100).toFixed(1)}%`, 8),
      pad2(`${((revenue > 0 ? -(world.ledger.wages ?? 0) / revenue : 0) * 100).toFixed(1)}%`, 9),
      reconciles ? "yes" : `NO (${drift.toFixed(4)})`,
    ].join(""),
  );
}

console.log("");
check("all four bots run 90 days without crashing", allRan, `${bots.length} bots`);
check("P&L reconciles to the cent", allReconcile, "cash === starting cash + every posted movement");

/* ------------------------------------------------------------------- M3 */
console.log("\nM3 gate — the tension\n");

const { points, switchDay } = spiralAndRecover("42", 30, 25, 2);
const atSwitch = points[switchDay - 1];
// A spiral is peak-to-trough, not day-5-to-trough. Sampling a fixed early day understated it
// badly: naive crashes inside the first week, so by day 5 most of the fall had already happened.
const naivePhase = points.slice(0, switchDay);
const peak = naivePhase.reduce((a, b) => (b.reputation > a.reputation ? b : a));
const trough = naivePhase
  .slice(naivePhase.indexOf(peak))
  .reduce((a, b) => (b.reputation < a.reputation ? b : a));
const end = points[points.length - 1];

console.log(chart(points, switchDay));
console.log("");
console.log(`  peak     ${peak.reputation.toFixed(2)} stars on day ${peak.day}, balk ${(peak.balkRate * 100).toFixed(0)}%`);
console.log(`  trough   ${trough.reputation.toFixed(2)} stars on day ${trough.day}, balk ${(trough.balkRate * 100).toFixed(0)}%`);
console.log(`  switch   ${atSwitch?.reputation.toFixed(2)} stars on day ${switchDay}`);
console.log(`  day ${end?.day}   ${end?.reputation.toFixed(2)} stars, balk ${((end?.balkRate ?? 0) * 100).toFixed(0)}%`);
console.log("");

check(
  "naive demonstrably spirals",
  trough.reputation < peak.reputation - 0.4,
  `${peak.reputation.toFixed(2)} (day ${peak.day}) → ${trough.reputation.toFixed(2)} (day ${trough.day})`,
);
check(
  "and demonstrably recovers on balanced",
  (end?.reputation ?? 0) > (atSwitch?.reputation ?? 0) + 0.2,
  `${atSwitch?.reputation.toFixed(2)} → ${end?.reputation.toFixed(2)} stars over ${points.length - switchDay} days`,
);
check(
  "recovery takes real discipline, not a button",
  points.length - switchDay >= 8,
  `${points.length - switchDay} days of it`,
);

console.log(failures === 0 ? "\nGATES GREEN" : `\nGATES RED — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
