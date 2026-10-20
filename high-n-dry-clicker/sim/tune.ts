/**
 * Tuning sweep. Not a gate — a tool for finding config values that make the gates green, so
 * balance is measured rather than guessed. Never used to change an assertion.
 *
 *   npx tsx sim/tune.ts ratio     sweep generator-rate scale vs the active/idle ratio
 *   npx tsx sim/tune.ts threshold find the prestige threshold for a 45-120min first sale
 */
import { config, type EconomyConfig } from "../src/engine/config.js";
import { runProfile } from "./playbot.js";

const c = config as EconomyConfig;

function clone(): EconomyConfig {
  return JSON.parse(JSON.stringify(c)) as EconomyConfig;
}

/** Mutates the live config object in place (module singleton) so runProfile picks it up. */
function apply(next: EconomyConfig): void {
  Object.assign(c, next);
}

const original = clone();

function revenueAt(profileId: string, minutes: number): number {
  const profile = c.sim.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error(`no profile ${profileId}`);
  const saved = c.sim.hours;
  c.sim.hours = minutes / c.time.secondsPerMinute;
  const result = runProfile(profile);
  c.sim.hours = saved;
  return result.finalRevenue;
}

function firstSaleMinutes(profileId: string): number | null {
  const profile = c.sim.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error(`no profile ${profileId}`);
  const result = runProfile(profile);
  return result.firstPrestigeAtSeconds === null
    ? null
    : result.firstPrestigeAtSeconds / c.time.secondsPerMinute;
}

/**
 * Active-vs-idle from EQUIVALENT PROGRESSION: build one mid-game state, fork it, then run the same
 * 30 minutes as an active player and as an idler. This answers "is playing worth 2-3x idling?",
 * which is the question the gate is asking. (Measuring from a cold start instead answers "how far
 * ahead does an active player get?", which compounds without bound — see PROGRESS.md M0.)
 */
export function equivalentProgressionRatio(warmupMinutes = 20): {
  ratio: number;
  active: number;
  idle: number;
} {
  const casual = c.sim.profiles.find((p) => p.id === "casual");
  const idleProfile = c.sim.profiles.find((p) => p.id === "idle");
  if (!casual || !idleProfile) throw new Error("missing sim profiles");

  const warmup = runProfile(casual, {
    seconds: warmupMinutes * c.time.secondsPerMinute,
  });
  const start = warmup.endState;
  if (!start) throw new Error("warmup produced no end state");

  const windowSeconds = c.sim.gates.activeVsIdleWindowMinutes * c.time.secondsPerMinute;
  const active = runProfile(casual, { startState: start, seconds: windowSeconds });
  // A true idler from this state: no taps at all (bootstrap already happened long ago).
  const pureIdle = { ...idleProfile, bootstrapTaps: false };
  const idle = runProfile(pureIdle, { startState: start, seconds: windowSeconds });

  return {
    ratio: idle.finalRevenue > 0 ? active.finalRevenue / idle.finalRevenue : Number.POSITIVE_INFINITY,
    active: active.finalRevenue,
    idle: idle.finalRevenue,
  };
}

function sweepShare(): void {
  console.log("baseCpsShare | equivalent-progression casual/idle over 30min");
  for (const share of [0, 0.5, 1, 1.5, 2, 2.5, 3, 4]) {
    const next = clone();
    next.click.baseCpsShare = share;
    apply(next);
    const { ratio } = equivalentProgressionRatio();
    const band = ratio >= 2 && ratio <= 3 ? "  <-- in band" : "";
    console.log(`${String(share).padStart(12)} | ${ratio.toFixed(3)}${band}`);
    apply(original);
  }
}

function sweepRatio(): void {
  const window = c.sim.gates.activeVsIdleWindowMinutes;
  console.log(`rate scale | click cpsShare | casual/idle @${window}min | tryhard/idle`);
  for (const rateScale of [1, 2, 5, 10, 20]) {
    for (const baseCpsShare of [0, 0.5, 1]) {
      const next = clone();
      next.generators.list = next.generators.list.map((g) => ({
        ...g,
        baseRate: g.baseRate * rateScale,
      }));
      next.click.baseCpsShare = baseCpsShare;
      apply(next);
      const idle = revenueAt("idle", window);
      const casual = revenueAt("casual", window);
      const tryhard = revenueAt("tryhard", window);
      const ratio = idle > 0 ? casual / idle : Number.POSITIVE_INFINITY;
      const tryRatio = idle > 0 ? tryhard / idle : Number.POSITIVE_INFINITY;
      console.log(
        `${String(rateScale).padStart(10)} | ${String(baseCpsShare).padStart(14)} | ` +
          `${ratio.toFixed(2).padStart(22)} | ${tryRatio.toFixed(2)}`,
      );
      apply(original);
    }
  }
}

function sweepThreshold(): void {
  console.log("Measuring casual lifetime revenue over time to place the prestige threshold.");
  const profile = c.sim.profiles.find((p) => p.id === "casual");
  if (!profile) throw new Error("no casual profile");
  const result = runProfile(profile);
  const marks = [30, 45, 60, 75, 90, 120];
  for (const minutes of marks) {
    const t = minutes * c.time.secondsPerMinute;
    const sample = [...result.samples].reverse().find((s) => s.t <= t);
    console.log(
      `  ${String(minutes).padStart(3)}min  lifetime revenue ${(sample?.revenue ?? 0).toExponential(3)}`,
    );
  }
  console.log(
    `\ncurrent minLifetimeRevenueToSell = ${c.prestige.minLifetimeRevenueToSell.toExponential(3)}` +
      ` → first sale at ${firstSaleMinutes("casual")?.toFixed(1) ?? "never"}min`,
  );
}

// Only sweep when invoked directly — assert.ts imports equivalentProgressionRatio from here.
if (process.argv[1]?.includes("tune")) {
  const mode = process.argv[2] ?? "ratio";
  if (mode === "ratio") sweepRatio();
  else if (mode === "share") sweepShare();
  else if (mode === "threshold") sweepThreshold();
  else console.log("usage: tsx sim/tune.ts [ratio|share|threshold]");
}
