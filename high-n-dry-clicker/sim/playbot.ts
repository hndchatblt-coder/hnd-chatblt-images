/**
 * Playbot — headless simulated playthroughs feeding the G3/G4 gates.
 *
 * Strategy: greedy best-payback. Every second, of everything affordable, buy the purchase with the
 * lowest cost-per-extra-$/sec, and keep buying while anything is affordable and worth it. Click
 * upgrades are valued at the profile's own tap rate, so `idle` correctly assigns them no value and
 * `tryhard` correctly prioritises them.
 *
 * Taps are batched per tick (clickPower × taps this second) rather than looped one at a time. Same
 * arithmetic, ~100× faster; the engine's per-tap path is exercised by the unit tests instead.
 *
 * Writes reports/pacing.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config, type SimProfileDef } from "../src/engine/config.js";
import { derive } from "../src/engine/derive.js";
import { bestLayout, productionWeights } from "../src/engine/layout.js";
import {
  buyGenerator,
  buyPerk,
  buyUpgrade,
  canSellBusiness,
  checkAchievements,
  pendingGoodwill,
  purchaseOptions,
  sellBusiness,
  tapGolden,
  tick,
} from "../src/engine/engine.js";
import { Rng } from "../src/engine/rng.js";
import { createInitialState, totalGenerators, type GameState } from "../src/engine/state.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORTS = join(HERE, "..", "reports");

export interface BuyEvent {
  t: number;
  kind: string;
  id: string;
  cost: number;
  /** cps × clickPower multiple this purchase produced, for the max-step assertion. */
  stepCps: number;
  stepClick: number;
}

export interface Sample {
  t: number;
  cash: number;
  cps: number;
  clickPower: number;
  revenue: number;
  generators: number;
}

export interface ProfileResult {
  profile: string;
  seconds: number;
  buys: BuyEvent[];
  samples: Sample[];
  revenueAtWindow: number;
  finalRevenue: number;
  finalCps: number;
  /** Terminal state, so a run can be forked for equivalent-progression comparisons. */
  endState?: GameState;
  taps: number;
  goldenCaught: number;
  firstPrestigeAtSeconds: number | null;
  generatorFirstBoughtAt: Record<string, number | null>;
  generatorUnlockedAt: Record<string, number | null>;
  maxDeadWindowSeconds: number;
  /** When the longest dead window began — so a failure can be diagnosed, not guessed at. */
  maxDeadWindowAtSeconds: number;
  achievements: number;
  prestiges: number;
  goodwill: number;
  /** Longest gap between consecutive purchases, seconds — the "cliff" check. */
  maxPurchaseGapSeconds: number;
}

const SAMPLE_EVERY_SECONDS = 15;

function effectiveTapsPerSecond(profile: SimProfileDef, state: GameState): number {
  if (profile.bootstrapTaps) {
    // Bootstrap only: tap until the first generator exists, then stop for good.
    return totalGenerators(state) === 0 ? 1 : 0;
  }
  return profile.tapsPerSecond * profile.dutyCycle;
}

export interface RunOptions {
  seed?: number;
  /** Start from an existing state (deep-cloned) instead of a fresh game. */
  startState?: GameState;
  /** Override the run length in seconds. */
  seconds?: number;
  /**
   * How the bot treats the bench.
   *
   * `naive` never rearranges — the layout stays in unlock order all run. **The G4 pacing gates are
   * evaluated on this**, deliberately: a new system must never be allowed to quietly rescue an
   * existing pacing failure, or we would have hidden B1 and B4 rather than fixed them
   * (PLAN_THE_LINE.md PART THREE).
   *
   * `tidy` runs AUTO after every purchase, which is the ceiling a player can reach.
   */
  layoutPolicy?: "naive" | "tidy";
}

export function runProfile(
  profile: SimProfileDef,
  seedOrOptions: number | RunOptions = 1234,
): ProfileResult {
  const opts: RunOptions =
    typeof seedOrOptions === "number" ? { seed: seedOrOptions } : seedOrOptions;
  const seed = opts.seed ?? 1234;
  const c = config;
  const state = opts.startState
    ? (JSON.parse(JSON.stringify(opts.startState)) as GameState)
    : createInitialState(seed);
  const layoutPolicy = opts.layoutPolicy ?? "naive";
  const simRng = new Rng(seed ^ profile.id.length);
  const startRevenue = state.lifetimeRevenue;
  const startTime = state.timeSeconds;
  const totalSeconds = opts.seconds ?? c.sim.hours * c.time.secondsPerHour;
  const windowSeconds = c.sim.gates.activeVsIdleWindowMinutes * c.time.secondsPerMinute;

  const buys: BuyEvent[] = [];
  const samples: Sample[] = [];
  const generatorFirstBoughtAt: Record<string, number | null> = {};
  const generatorUnlockedAt: Record<string, number | null> = {};
  for (const g of c.generators.list) {
    generatorFirstBoughtAt[g.id] = null;
    generatorUnlockedAt[g.id] = null;
  }

  let revenueAtWindow = 0;
  let firstPrestigeAtSeconds: number | null = null;
  let deadRun = 0;
  let deadRunStartedAt = 0;
  let maxDeadWindowSeconds = 0;
  let maxDeadWindowAtSeconds = 0;
  let goldenDecided: number | null = null;
  let prestiges = 0;
  let lastPurchaseAt = 0;
  let maxPurchaseGapSeconds = 0;

  for (let elapsed = 0; elapsed < totalSeconds; elapsed += c.sim.tickSeconds) {
    const taps = effectiveTapsPerSecond(profile, state) * c.sim.tickSeconds;

    // Batched tapping.
    if (taps > 0) {
      const d = derive(state, c);
      const earned = d.clickPower * taps;
      state.cash += earned;
      state.runRevenue += earned;
      state.lifetimeRevenue += earned;
      state.taps += taps;
      state.stats.totalTaps += taps;
      state.burgersSold += taps;
    }

    tick(state, c.sim.tickSeconds, c);

    // Golden patties: decide once per spawn whether this profile catches it.
    const onScreen = state.golden.onScreen;
    if (onScreen) {
      if (goldenDecided !== onScreen.spawnedAt) {
        goldenDecided = onScreen.spawnedAt;
        if (simRng.chance(profile.goldenCatchRate)) tapGolden(state, c);
      }
    }

    // Track unlock times for the "unbought after unlock" pacing metric.
    c.generators.list.forEach((g, i) => {
      if (generatorUnlockedAt[g.id] === null) {
        const cost = g.baseCost * Math.pow(c.generators.costGrowth, state.generators[i] ?? 0);
        if (state.cash >= cost) generatorUnlockedAt[g.id] = state.timeSeconds;
      }
    });

    // Greedy purchasing: keep buying the best payback while anything is affordable.
    let bought = true;
    let purchasesThisTick = 0;
    while (bought && purchasesThisTick < c.generators.list.length + c.clickUpgrades.length) {
      bought = false;
      const options = purchaseOptions(state, effectiveTapsPerSecond(profile, state), c);
      const affordable = options.filter((o) => o.affordable && o.gainPerSecond > 0);
      if (affordable.length === 0) break;
      affordable.sort((a, b) => a.cost / a.gainPerSecond - b.cost / b.gainPerSecond);
      const best = affordable[0];
      if (!best) break;

      const before = derive(state, c);
      const ok =
        best.kind === "generator" && best.generatorIndex !== null
          ? buyGenerator(state, best.generatorIndex, 1, c)
          : buyUpgrade(state, best.id, c);
      if (!ok) break;
      // A tidy player sorts the line out whenever the shop changes. A naive one never does.
      if (layoutPolicy === "tidy") {
        const mid = derive(state, c);
        state.layout = bestLayout(
          state.generators,
          productionWeights(state.generators, mid.generatorMults, c),
          c,
        );
      }

      const after = derive(state, c);
      buys.push({
        t: state.timeSeconds,
        kind: best.kind,
        id: best.id,
        cost: best.cost,
        stepCps: before.cps > 0 ? after.cps / before.cps : 1,
        stepClick: before.clickPower > 0 ? after.clickPower / before.clickPower : 1,
      });
      if (best.kind === "generator" && best.generatorIndex !== null) {
        const g = c.generators.list[best.generatorIndex];
        if (g && generatorFirstBoughtAt[g.id] === null) {
          generatorFirstBoughtAt[g.id] = state.timeSeconds;
        }
      }
      const gap = state.timeSeconds - lastPurchaseAt;
      if (gap > maxPurchaseGapSeconds) maxPurchaseGapSeconds = gap;
      lastPurchaseAt = state.timeSeconds;
      bought = true;
      purchasesThisTick += 1;
    }

    // Dead window: nothing affordable, nothing on screen, nothing in flight.
    const opts = purchaseOptions(state, effectiveTapsPerSecond(profile, state), c);
    const anythingAffordable = opts.some((o) => o.affordable && o.gainPerSecond > 0);
    const somethingHappening =
      state.golden.onScreen !== null || state.golden.activeEffects.length > 0 || taps > 0;
    if (!anythingAffordable && !somethingHappening) {
      if (deadRun === 0) deadRunStartedAt = state.timeSeconds;
      deadRun += c.sim.tickSeconds;
      if (deadRun > maxDeadWindowSeconds) {
        maxDeadWindowSeconds = deadRun;
        maxDeadWindowAtSeconds = deadRunStartedAt;
      }
    } else {
      deadRun = 0;
    }

    if (firstPrestigeAtSeconds === null && canSellBusiness(state, c)) {
      firstPrestigeAtSeconds = state.timeSeconds - startTime;
    }

    // Sell the business when the payoff is a real step up, then spend the Goodwill. Without this
    // the bot never restarts stronger and never reaches the top of the ladder — which is not how
    // the game is played.
    if (canSellBusiness(state, c)) {
      const gain = pendingGoodwill(state, c);
      const per = c.prestige.multiplierPerGoodwill;
      const now = 1 + state.goodwill * per;
      const after = 1 + (state.goodwill + gain) * per;
      if (after / now >= c.sim.prestigeHeuristic.minMultiplierGain) {
        sellBusiness(state, c);
        prestiges += 1;
      }
    }
    // Buy any perk we can afford, cheapest first.
    for (const perk of [...c.prestige.perks].sort((a, b) => a.cost - b.cost)) {
      if (state.goodwill >= perk.cost) buyPerk(state, perk.id, c);
    }
    if (revenueAtWindow === 0 && state.timeSeconds - startTime >= windowSeconds) {
      revenueAtWindow = state.lifetimeRevenue - startRevenue;
    }
    if (Math.round(state.timeSeconds) % SAMPLE_EVERY_SECONDS === 0) {
      const d = derive(state, c);
      samples.push({
        t: state.timeSeconds,
        cash: state.cash,
        cps: d.cps,
        clickPower: d.clickPower,
        revenue: state.lifetimeRevenue,
        generators: totalGenerators(state),
      });
    }
  }

  checkAchievements(state, c);
  const final = derive(state, c);
  return {
    profile: profile.id,
    seconds: totalSeconds,
    buys,
    samples,
    revenueAtWindow,
    endState: state,
    finalRevenue: state.lifetimeRevenue - startRevenue,
    finalCps: final.cps,
    taps: state.stats.totalTaps,
    goldenCaught: state.golden.caught,
    firstPrestigeAtSeconds,
    generatorFirstBoughtAt,
    generatorUnlockedAt,
    maxDeadWindowSeconds,
    maxDeadWindowAtSeconds,
    achievements: state.achievements.length,
    prestiges,
    goodwill: state.goodwill,
    maxPurchaseGapSeconds,
  };
}

export interface PacingReport {
  generatedAt: string;
  configVersion: string;
  profiles: ProfileResult[];
}

export function runAll(seed = 1234): PacingReport {
  return {
    generatedAt: new Date().toISOString(),
    configVersion: config.version,
    profiles: config.sim.profiles.map((p) => runProfile(p, seed)),
  };
}

function summarise(report: PacingReport): void {
  const { secondsPerMinute } = config.time;
  for (const p of report.profiles) {
    const prestige =
      p.firstPrestigeAtSeconds === null
        ? "never"
        : `${(p.firstPrestigeAtSeconds / secondsPerMinute).toFixed(1)}min`;
    const unbought = Object.entries(p.generatorFirstBoughtAt)
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    console.log(
      [
        p.profile.padEnd(8),
        `revenue@30m ${p.revenueAtWindow.toExponential(2)}`,
        `final ${p.finalRevenue.toExponential(2)}`,
        `cps ${p.finalCps.toExponential(2)}`,
        `buys ${String(p.buys.length).padStart(4)}`,
        `golden ${String(p.goldenCaught).padStart(3)}`,
        `1st sale ${prestige.padStart(8)}`,
        `dead ${String(p.maxDeadWindowSeconds).padStart(4)}s@${(p.maxDeadWindowAtSeconds/60).toFixed(0)}m`,
        `sales ${p.prestiges}`,
        `gap ${p.maxPurchaseGapSeconds.toFixed(0)}s`,
        `ach ${p.achievements}/${config.achievements.length}`,
        unbought.length > 0 ? `UNBOUGHT: ${unbought.join(",")}` : "all gens bought",
      ].join("  "),
    );
  }
}

/** Run directly (`npm run playbot`) to regenerate reports/pacing.json. */
export function main(): PacingReport {
  const report = runAll();
  mkdirSync(REPORTS, { recursive: true });
  // endState is for forking runs in-process; it would bloat the report for no reader.
  const serialisable = {
    ...report,
    profiles: report.profiles.map(({ endState: _endState, ...rest }) => rest),
  };
  writeFileSync(join(REPORTS, "pacing.json"), JSON.stringify(serialisable, null, 2));
  summarise(report);
  console.log("\nwrote reports/pacing.json");
  return report;
}

if (process.argv[1]?.includes("playbot")) main();
