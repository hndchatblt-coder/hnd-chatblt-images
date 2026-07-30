/**
 * Config types + loader. `economy.config.json` is law (BUILD_BRIEF §5): every number lives there,
 * and engine code contains no numeric literals except 0, 1 and array indices.
 *
 * Pure: no DOM, no fs. The JSON is imported so this module works identically in the browser
 * bundle, in vitest and in the headless playbot.
 */
import raw from "../../economy.config.json";

export type ClickEffect =
  | "clickMult"
  | "perGenerator"
  | "perGeneratorMult"
  | "cpsShare"
  | "cpsShareMult";
export type GoldenEffectType = "productionMult" | "instantCash" | "clickMult";
export type PerkEffect =
  | "globalMult"
  | "startingCash"
  | "goldenRateMult"
  | "goldenDurationMult"
  | "offlineRateMult"
  | "clickMult";

export interface GeneratorDef {
  id: string;
  name: string;
  baseCost: number;
  baseRate: number;
  flavour: string;
}

export interface ClickUpgradeDef {
  id: string;
  name: string;
  cost: number;
  effect: ClickEffect;
  value: number;
  flavour: string;
}

export interface GlobalUpgradeDef {
  id: string;
  name: string;
  cost: number;
  value: number;
  flavour: string;
}

export interface GoldenEffectDef {
  id: string;
  name: string;
  weight: number;
  type: GoldenEffectType;
  value?: number;
  seconds?: number;
  bankShare?: number;
  secondsOfProduction?: number;
  line: string;
}

export interface PerkDef {
  id: string;
  name: string;
  cost: number;
  effect: PerkEffect;
  value: number;
  flavour: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  trigger: {
    type: string;
    value?: number;
    target?: string;
    other?: string;
  };
}

export interface SimProfileDef {
  id: string;
  tapsPerSecond: number;
  dutyCycle: number;
  goldenCatchRate: number;
  /** Tap only until the first generator is owned, then stop. See config.sim.bootstrapComment. */
  bootstrapTaps: boolean;
}

export interface EconomyConfig {
  version: string;
  save: { schemaVersion: number; autosaveSeconds: number; storageKey: string };
  click: { baseCash: number; baseCpsShare: number };
  generators: { costGrowth: number; list: GeneratorDef[] };
  generatorTiers: {
    thresholds: number[];
    multiplier: number;
    costMultipliers: number[];
    names: string[];
  };
  clickUpgrades: ClickUpgradeDef[];
  globalUpgrades: GlobalUpgradeDef[];
  golden: {
    firstSpawnSecondsMin: number;
    firstSpawnSecondsMax: number;
    spawnSecondsMin: number;
    spawnSecondsMax: number;
    durationSeconds: number;
    effects: GoldenEffectDef[];
  };
  prestige: {
    minLifetimeRevenueToSell: number;
    goodwillScale: number;
    goodwillDivisor: number;
    goodwillExponent: number;
    multiplierPerGoodwill: number;
    perks: PerkDef[];
  };
  offline: { rateShare: number; capHours: number; minSecondsToReport: number };
  ticker: { cycleSeconds: number };
  notation: {
    shortSuffixes: string[];
    groupSize: number;
    decimalsBelowThousand: number;
    decimalsAbove: number;
    scientificThresholdExponent: number;
  };
  time: { msPerSecond: number; secondsPerMinute: number; secondsPerHour: number };
  sim: {
    tickSeconds: number;
    hours: number;
    profiles: SimProfileDef[];
    prestigeHeuristic: { minMultiplierGain: number };
    gates: {
      firstPrestigeMinutesMin: number;
      firstPrestigeMinutesMax: number;
      activeVsIdleRatioMin: number;
      activeVsIdleRatioMax: number;
      activeVsIdleWindowMinutes: number;
      maxUpgradeStep: number;
      maxDeadWindowSeconds: number;
      maxUnboughtMinutesAfterUnlock: number;
    };
  };
  achievements: AchievementDef[];
}

export const config: EconomyConfig = raw as unknown as EconomyConfig;

/** Derived upgrade id for a generator tier, e.g. `tier:fryer:0`. */
export function tierUpgradeId(generatorId: string, tierIndex: number): string {
  return `tier:${generatorId}:${tierIndex}`;
}

export function parseTierUpgradeId(
  id: string,
): { generatorId: string; tierIndex: number } | null {
  const parts = id.split(":");
  if (parts.length !== 3 || parts[0] !== "tier") return null;
  const generatorId = parts[1] as string;
  const tierIndex = Number(parts[2]);
  if (!Number.isInteger(tierIndex)) return null;
  return { generatorId, tierIndex };
}

/**
 * Validates the invariants the engine and the gates rely on. Throws loudly rather than letting a
 * bad config silently produce a broken economy.
 */
export function validateConfig(c: EconomyConfig = config): void {
  const problems: string[] = [];

  if (c.generators.list.length === 0) problems.push("no generators defined");
  if (c.generators.costGrowth <= 1) problems.push("generators.costGrowth must be > 1");

  c.generators.list.forEach((g, i) => {
    if (g.baseCost <= 0) problems.push(`${g.id}: baseCost must be > 0`);
    if (g.baseRate <= 0) problems.push(`${g.id}: baseRate must be > 0`);
    const prev = c.generators.list[i - 1];
    if (prev && g.baseCost <= prev.baseCost) {
      problems.push(`${g.id}: baseCost must exceed ${prev.id} (ladder must ascend)`);
    }
    if (prev && g.baseRate <= prev.baseRate) {
      problems.push(`${g.id}: baseRate must exceed ${prev.id} (ladder must ascend)`);
    }
  });

  const ids = new Set<string>();
  const allIds = [
    ...c.generators.list.map((g) => g.id),
    ...c.clickUpgrades.map((u) => u.id),
    ...c.globalUpgrades.map((u) => u.id),
    ...c.prestige.perks.map((p) => p.id),
    ...c.achievements.map((a) => a.id),
  ];
  for (const id of allIds) {
    if (ids.has(id)) problems.push(`duplicate id: ${id}`);
    ids.add(id);
  }

  if (c.generatorTiers.thresholds.length !== c.generatorTiers.costMultipliers.length) {
    problems.push("generatorTiers.thresholds and costMultipliers must be the same length");
  }
  if (c.golden.effects.length === 0) problems.push("no golden effects defined");
  for (const e of c.golden.effects) {
    if (e.weight <= 0) problems.push(`golden ${e.id}: weight must be > 0`);
  }
  if (c.offline.rateShare < 0 || c.offline.rateShare > 1) {
    problems.push("offline.rateShare must be within 0..1");
  }

  if (problems.length > 0) {
    throw new Error(`economy.config.json is invalid:\n  - ${problems.join("\n  - ")}`);
  }
}
