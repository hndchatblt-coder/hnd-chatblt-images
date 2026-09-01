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
import { compareFastSim, gateLayouts } from "../harness/fastCheck.js";

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
// Recovery is measured trough-to-peak, symmetrically with the spiral. Reading the final day
// alone once scored a run that had climbed 2.73 → 4.48 as a failure, because day 55 happened to
// land on an incident that took a station offline. Incidents are transient by design; a single
// day is not evidence either way.
const recoveryPhase = points.slice(switchDay);
const recovered = recoveryPhase.reduce((a, b) => (b.reputation > a.reputation ? b : a));
const end = points[points.length - 1];

console.log(chart(points, switchDay));
console.log("");
console.log(`  peak     ${peak.reputation.toFixed(2)} stars on day ${peak.day}, balk ${(peak.balkRate * 100).toFixed(0)}%`);
console.log(`  trough   ${trough.reputation.toFixed(2)} stars on day ${trough.day}, balk ${(trough.balkRate * 100).toFixed(0)}%`);
console.log(`  switch   ${atSwitch?.reputation.toFixed(2)} stars on day ${switchDay}`);
console.log(`  recovered ${recovered.reputation.toFixed(2)} stars by day ${recovered.day}, balk ${(recovered.balkRate * 100).toFixed(0)}%`);
console.log(`  day ${end?.day}   ${end?.reputation.toFixed(2)} stars, balk ${((end?.balkRate ?? 0) * 100).toFixed(0)}%  (incidents keep happening)`);
console.log("");

check(
  "naive demonstrably spirals",
  trough.reputation < peak.reputation - 0.4,
  `${peak.reputation.toFixed(2)} (day ${peak.day}) → ${trough.reputation.toFixed(2)} (day ${trough.day})`,
);
check(
  "and demonstrably recovers on balanced",
  recovered.reputation > trough.reputation + 0.4,
  `${trough.reputation.toFixed(2)} → ${recovered.reputation.toFixed(2)} stars by day ${recovered.day}`,
);
check(
  "recovery takes real discipline, not a button",
  recovered.day - switchDay >= 8,
  `${recovered.day - switchDay} days of disciplined trading`,
);

/* ------------------------------------------------------------------- M5 */
console.log("\nM5 gate — fast sim within 5% of full sim\n");

const fsSeeds = Array.from({ length: 20 }, (_, i) => String(i + 1));
const rows = compareFastSim(fsSeeds, gateLayouts(), 7, 3);
console.log(`  ${fsSeeds.length} seeds x ${gateLayouts().length} layouts x 7 days\n`);
for (const r of rows) {
  console.log(
    `  ${r.metric.padEnd(12)}full ${r.full.toFixed(2).padStart(10)}   fast ${r.fast.toFixed(2).padStart(10)}   ${r.driftPct >= 0 ? "+" : ""}${r.driftPct.toFixed(1)}%`,
  );
}
console.log("");
for (const r of rows) {
  check(`${r.metric} within 5%`, Math.abs(r.driftPct) <= 5, `${r.driftPct >= 0 ? "+" : ""}${r.driftPct.toFixed(1)}%`);
}

/* ------------------------------------------------------------------- M6 */
console.log("\nM6 gate — the supply meta\n");

// Same shop, same seed, three supply positions. Only the buying changes.
const supplyRun = (label: string, weeklyVolume: number, hasCommissary: boolean) => {
  const w = createWorld({ seed: "42", staffCount: 3 });
  w.hasCommissary = hasCommissary;
  // Volume tiers are earned across the group; a single venue's own buying is topped up by the
  // rest of the estate, which is the entire point of buying as a group.
  const bump = (): void => {
    for (const item of Object.keys(economy.ingredientCost)) {
      w.weeklyVolume[item] = weeklyVolume;
    }
  };
  bump();
  for (let d = 0; d < 21; d += 1) {
    runDays(w, 1);
    bump();
  }
  const revenue = w.ledger.revenue ?? 0;
  const cogs = -(w.ledger.cogs ?? 0);
  const pct = revenue > 0 ? cogs / revenue : 0;
  console.log(`  ${label.padEnd(28)}COGS ${(pct * 100).toFixed(1)}%`);
  return pct;
};

const single = supplyRun("one venue, no volume", 0, false);
const group = supplyRun("three venues, top retail tier", 800, false);
const withCommissary = supplyRun("commissary", 0, true);

console.log("");
check(
  "volume tiers actually cut COGS",
  group < single,
  `${(single * 100).toFixed(1)}% → ${(group * 100).toFixed(1)}%`,
);
check(
  "a good supply solution gets COGS under 27%",
  withCommissary < 0.27,
  `${(single * 100).toFixed(1)}% unsupplied → ${(withCommissary * 100).toFixed(1)}% with a commissary`,
);

console.log(failures === 0 ? "\nGATES GREEN" : `\nGATES RED — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
