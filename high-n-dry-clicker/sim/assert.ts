/**
 * G3 — economy assertions. This is law: if it's red, the iteration is over and the fix is the
 * economy, never the assertion (BUILD_BRIEF §6, stop-and-ask triggers).
 *
 * Asserted here:
 *   A1  cost curve holds (single and bulk)
 *   A2  no generator is ever strictly dominated
 *   A3  idle-only play reaches prestige without softlock
 *   A4  active play yields 2.0-3.0x idle over 30 minutes, from equivalent progression
 *   A5  no single upgrade produces more than a 25x step
 *   A6  first prestige lands 45-120 min at the casual profile
 *   A7  layout is a bonus, never a tax — an untouched line scores exactly 1.0x
 *   A8  layout is bounded — the best possible line never exceeds the configured cap
 *   A9  AUTO is optimal — it matches brute force, so one tap is genuinely the best answer
 */
import { config } from "../src/engine/config.js";
import { generatorCost } from "../src/engine/derive.js";
import { validateConfig } from "../src/engine/config.js";
import { createInitialState } from "../src/engine/state.js";
import {
  bestLayout,
  defaultLayout,
  layoutValue,
  normalizeLayout,
  productionWeights,
  scoreLayout,
  swapBays,
} from "../src/engine/layout.js";
import { runProfile } from "./playbot.js";
import { equivalentProgressionRatio } from "./tune.js";

const c = config;
const { secondsPerMinute } = c.time;

let failures = 0;
let checks = 0;

function assert(name: string, ok: boolean, detail: string): void {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

function info(name: string, detail: string): void {
  console.log(`info  ${name}  ${detail}`);
}

console.log("G3 — economy assertions\n");
validateConfig();
info("config", `v${c.version} validated`);

/* A1 — cost curve --------------------------------------------------------- */
{
  const state = createInitialState(1);
  const growth = c.generators.costGrowth;
  let curveOk = true;
  let bulkOk = true;
  c.generators.list.forEach((def, index) => {
    for (const owned of [0, 1, 7, 25, 99]) {
      state.generators[index] = owned;
      const expected = def.baseCost * Math.pow(growth, owned);
      if (Math.abs(generatorCost(state, index, 1, c) - expected) > expected * 1e-9) curveOk = false;
    }
    // Bulk buy must equal the sum of the individual costs.
    state.generators[index] = 3;
    const bulk = generatorCost(state, index, 10, c);
    let summed = 0;
    for (let k = 0; k < 10; k += 1) summed += def.baseCost * Math.pow(growth, 3 + k);
    if (Math.abs(bulk - summed) > summed * 1e-9) bulkOk = false;
    state.generators[index] = 0;
  });
  assert("A1 cost curve", curveOk && bulkOk, `baseCost x ${growth}^owned, bulk = sum of singles`);
}

/* A2 — no generator strictly dominated ------------------------------------ */
{
  // payback_i(n) = baseCost_i * growth^n / baseRate_i. Because growth > 1, every generator becomes
  // the cheapest $/output once the ones with a better base ratio have been bought up. Prove it
  // constructively: build the owned-vector that makes each generator strictly best.
  const growth = c.generators.costGrowth;
  const ratio = c.generators.list.map((g) => g.baseCost / g.baseRate);
  const dominated: string[] = [];
  let worstOwnedNeeded = 0;

  c.generators.list.forEach((def, i) => {
    const owned = c.generators.list.map((_, j) => {
      const r = ratio[j] as number;
      const ri = ratio[i] as number;
      if (j === i || r >= ri) return 0;
      // Buy up j until its marginal payback exceeds i's.
      return Math.ceil(Math.log(ri / r) / Math.log(growth)) + 1;
    });
    worstOwnedNeeded = Math.max(worstOwnedNeeded, ...owned);

    const paybackOf = (j: number): number =>
      (c.generators.list[j] as { baseCost: number }).baseCost *
      Math.pow(growth, owned[j] as number) /
      (c.generators.list[j] as { baseRate: number }).baseRate;

    const mine = paybackOf(i);
    const bestOther = Math.min(
      ...c.generators.list.map((_, j) => (j === i ? Number.POSITIVE_INFINITY : paybackOf(j))),
    );
    if (!(mine < bestOther)) dominated.push(def.id);
  });

  assert(
    "A2 no dominated generator",
    dominated.length === 0,
    dominated.length === 0
      ? `all ${c.generators.list.length} are the best $/output for some window (max ${worstOwnedNeeded} owned needed)`
      : `dominated: ${dominated.join(", ")}`,
  );
}

/* Run the profiles once and reuse ----------------------------------------- */
const results = c.sim.profiles.map((p) => runProfile(p));
const byId = new Map(results.map((r) => [r.profile, r]));
const idle = byId.get("idle");
const casual = byId.get("casual");
const tryhard = byId.get("tryhard");
if (!idle || !casual || !tryhard) throw new Error("missing sim profile results");

/* A3 — idle reaches prestige without softlock ----------------------------- */
{
  const reached = idle.firstPrestigeAtSeconds !== null;
  const at = reached ? `${(idle.firstPrestigeAtSeconds! / secondsPerMinute).toFixed(1)}min` : "never";
  assert(
    "A3 idle reaches prestige",
    reached,
    `idle-only first sale ${at} (within the ${c.sim.hours}h sim; profile taps only to buy its first generator)`,
  );
}

/* A4 — active vs idle ------------------------------------------------------ */
{
  const { ratio, active, idle: idleRevenue } = equivalentProgressionRatio();
  const { activeVsIdleRatioMin: min, activeVsIdleRatioMax: max } = c.sim.gates;
  assert(
    "A4 active vs idle",
    ratio >= min && ratio <= max,
    `${ratio.toFixed(2)}x over ${c.sim.gates.activeVsIdleWindowMinutes}min from equivalent progression ` +
      `(target ${min}-${max}; active ${active.toExponential(2)} vs idle ${idleRevenue.toExponential(2)})`,
  );
  const coldStart = idle.revenueAtWindow > 0 ? casual.revenueAtWindow / idle.revenueAtWindow : Infinity;
  info(
    "A4 cold-start ratio",
    `${coldStart.toFixed(1)}x — reported, NOT asserted. Measured from a fresh save this compounds ` +
      `without bound (an active player buys generators earlier and never stops pulling ahead), so it ` +
      `cannot land in a 2-3x band without making tapping pointless. See PROGRESS.md M0.`,
  );
}

/* A5 — no upgrade produces more than a 25x step ---------------------------- */
{
  const cap = c.sim.gates.maxUpgradeStep;
  let worst = { id: "none", step: 1, profile: "" };
  for (const result of results) {
    for (const buy of result.buys) {
      if (buy.kind === "generator") continue;
      const step = Math.max(buy.stepCps, buy.stepClick);
      if (step > worst.step) worst = { id: buy.id, step, profile: result.profile };
    }
  }
  assert(
    "A5 max upgrade step",
    worst.step <= cap,
    `largest observed ${worst.step.toFixed(2)}x from ${worst.id} (${worst.profile}), cap ${cap}x`,
  );
}

/* A6 — first prestige window ----------------------------------------------- */
{
  const { firstPrestigeMinutesMin: min, firstPrestigeMinutesMax: max } = c.sim.gates;
  const at = casual.firstPrestigeAtSeconds;
  const minutes = at === null ? null : at / secondsPerMinute;
  assert(
    "A6 first prestige (casual)",
    minutes !== null && minutes >= min && minutes <= max,
    minutes === null ? `never reached in ${c.sim.hours}h` : `${minutes.toFixed(1)}min (target ${min}-${max})`,
  );
}

/* A7 — layout is a bonus, never a tax -------------------------------------- */
{
  // Hard rule 4: the game never punishes. Every reachable arrangement, including the default and
  // including deliberately terrible ones, must score at least 1.0x.
  const owned = c.generators.list.map(() => 10);
  const flat = c.generators.list.map(() => 1);
  let worst = Number.POSITIVE_INFINITY;
  let worstLine = "";

  const consider = (line: number[]): void => {
    const score = scoreLayout(normalizeLayout(line), owned);
    const lowest = Math.min(score.flowMult, ...score.generatorMults);
    if (lowest < worst) {
      worst = lowest;
      worstLine = line.join(",");
    }
  };

  consider(defaultLayout());
  consider(bestLayout(owned, flat));
  // Every arrangement of the placeable stations, plus a few malformed ones.
  const stations = c.layout.placeable;
  const permute = (rest: number[], acc: number[]): void => {
    if (rest.length === 0) return consider(acc);
    rest.forEach((v, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, v]));
  };
  permute(stations, []);
  consider([]);
  consider([99, -4, 1.5 as number]);
  consider(swapBays(defaultLayout(), 0, c.layout.bays - 1));

  assert(
    "A7 layout is never a tax",
    worst >= 1,
    worst >= 1
      ? `every arrangement scores >= 1.0x (worst term ${worst.toFixed(3)})`
      : `arrangement [${worstLine}] scores ${worst.toFixed(3)}x — below baseline`,
  );
}

/* A8 — layout is bounded ---------------------------------------------------- */
{
  const owned = c.generators.list.map(() => 10);
  const flat = c.generators.list.map(() => 1);
  const best = scoreLayout(bestLayout(owned, flat), owned).total;
  assert(
    "A8 layout is bounded",
    best <= c.layout.maxMultiplier + 1e-9,
    `best possible line ${best.toFixed(3)}x, cap ${c.layout.maxMultiplier}x` +
      ` (one tier upgrade is ${c.generatorTiers.multiplier}x)`,
  );
}

/* A9 — AUTO is optimal ------------------------------------------------------ */
{
  // AUTO has to be genuinely the best answer, or hand-optimising becomes a maintenance task and
  // the feature has turned into a chore (PLAN_THE_LINE.md 3.4).
  let mismatches = 0;
  let sampled = 0;
  // A spread of shops: nothing owned, one station, every subset of the placeable stations.
  const subsets = 1 << c.layout.placeable.length;
  void productionWeights;
  for (let mask = 0; mask < subsets; mask += 1) {
    const owned = c.generators.list.map(() => 0);
    c.layout.placeable.forEach((index, bit) => {
      if (mask & (1 << bit)) owned[index] = 10;
    });
    // Lopsided weights on purpose: AUTO has to notice *which* station is carrying the income,
    // not just produce a tidy-looking line.
    const weights = c.generators.list.map((def, i) => (owned[i] ?? 0) * def.baseRate * (1 + i * 3));
    sampled += 1;
    const auto = layoutValue(bestLayout(owned, weights), owned, weights);

    // Brute force over every ordered selection of `bays` stations.
    let brute = 0;
    const walk = (chosen: number[], rest: number[]): void => {
      const line = [...chosen];
      while (line.length < c.layout.bays) line.push(-1);
      brute = Math.max(brute, layoutValue(line, owned, weights));
      if (chosen.length === c.layout.bays) return;
      rest.forEach((v, i) => walk([...chosen, v], [...rest.slice(0, i), ...rest.slice(i + 1)]));
    };
    walk([], c.layout.placeable);
    if (auto < brute - 1e-9) mismatches += 1;
  }
  assert(
    "A9 AUTO is optimal",
    mismatches === 0,
    mismatches === 0
      ? `matches brute force across all ${sampled} ownership combinations`
      : `${mismatches}/${sampled} shops where AUTO is beaten by hand`,
  );
}

/* Layout in play, reported not asserted ------------------------------------ */
{
  // A8 bounds the ceiling statically; this says what it's actually worth over a real run. If
  // this number ever creeps towards the cap, layout has stopped being optional.
  const casualProfile = c.sim.profiles.find((p) => p.id === "casual");
  if (casualProfile) {
    // Over several seeds: a single run diverges on threshold effects (one bot buys a generator
    // the other doesn't and the gap compounds), so one sample says almost nothing.
    const ratios = [11, 4242, 90210, 7, 31337].map((seed) => {
      const tidy = runProfile(casualProfile, { seed, layoutPolicy: "tidy" });
      const naive = runProfile(casualProfile, { seed, layoutPolicy: "naive" });
      return naive.finalCps > 0 ? tidy.finalCps / naive.finalCps : 1;
    });
    const sorted = [...ratios].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
    info(
      "layout in play",
      `over ${ratios.length} seeds a tidy line ends at x${sorted.map((r) => r.toFixed(2)).join(" x")} ` +
        `of naive (median ${median.toFixed(2)}). The instantaneous multiplier is capped at ` +
        `${c.layout.maxMultiplier}x by A8; these are compounded over ${c.sim.hours}h. ` +
        `G4 below is measured on the NAIVE policy on purpose.`,
    );
  }
}

/* ========================================================================== */
/* G4 — pacing                                                                */
/* ========================================================================== */
console.log("\nG4 — pacing\n");

const { maxDeadWindowSeconds: deadBudget, maxUnboughtMinutesAfterUnlock } = c.sim.gates;

/* B1 — no dead window longer than 90s -------------------------------------- */
{
  const worst = results.reduce((a, b) => (b.maxDeadWindowSeconds > a.maxDeadWindowSeconds ? b : a));
  assert(
    "B1 no dead window",
    worst.maxDeadWindowSeconds <= deadBudget,
    `worst ${worst.maxDeadWindowSeconds}s (${worst.profile}, starting ${(worst.maxDeadWindowAtSeconds / secondsPerMinute).toFixed(0)}min), budget ${deadBudget}s`,
  );
}

/* B2 — every generator bought by every profile ----------------------------- */
{
  const misses: string[] = [];
  for (const r of results) {
    const unbought = Object.entries(r.generatorFirstBoughtAt)
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    if (unbought.length > 0) misses.push(`${r.profile}: ${unbought.join(",")}`);
  }
  assert(
    "B2 every generator bought",
    misses.length === 0,
    misses.length === 0
      ? `all ${c.generators.list.length} bought by all ${results.length} profiles`
      : `unbought within ${c.sim.hours}h — ${misses.join(" | ")}`,
  );
}

/* B3 — no generator sits unbought 20+ minutes after it becomes affordable --- */
{
  const late: string[] = [];
  for (const r of results) {
    for (const g of c.generators.list) {
      const unlocked = r.generatorUnlockedAt[g.id];
      const bought = r.generatorFirstBoughtAt[g.id];
      if (unlocked === null || unlocked === undefined) continue;
      const delay = ((bought ?? r.seconds) - unlocked) / secondsPerMinute;
      if (delay > maxUnboughtMinutesAfterUnlock) {
        late.push(`${r.profile}/${g.id} ${delay.toFixed(0)}min`);
      }
    }
  }
  assert(
    "B3 bought soon after unlock",
    late.length === 0,
    late.length === 0
      ? `nothing waits longer than ${maxUnboughtMinutesAfterUnlock}min after becoming affordable`
      : late.join(", "),
  );
}

/* B4 — purchases spaced without a cliff ------------------------------------ */
{
  const worst = results.reduce((a, b) =>
    b.maxPurchaseGapSeconds > a.maxPurchaseGapSeconds ? b : a,
  );
  assert(
    "B4 no purchase cliff",
    worst.maxPurchaseGapSeconds <= deadBudget,
    `longest gap between purchases ${worst.maxPurchaseGapSeconds.toFixed(0)}s (${worst.profile}), budget ${deadBudget}s`,
  );
}

/* Pacing readout ----------------------------------------------------------- */
for (const r of results) {
  info(
    `pacing:${r.profile}`,
    `${r.buys.length} purchases · ${r.prestiges} sale(s) · ${r.goodwill} goodwill · ` +
      `${r.achievements}/${c.achievements.length} achievements · final cps ${r.finalCps.toExponential(2)}`,
  );
}

console.log(`\n${checks - failures}/${checks} assertions passed`);
if (failures > 0) {
  console.error(`RED — ${failures} assertion(s) failed. Fix the economy, never the assertion.`);
  process.exit(1);
}
console.log("ALL GATES GREEN");
