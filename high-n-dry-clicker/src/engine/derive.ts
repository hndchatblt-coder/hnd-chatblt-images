/**
 * Multiplier resolution — the one place the economy's arithmetic lives.
 *
 *   cps         = Σ(owned_i × baseRate_i × genMult_i × layoutMult_i) × globalMult × flowMult
 *                 × productionMult
 *   clickPower  = (baseCash × clickMult + perGenBonus × generatorsOwned + cpsShare × cps) × globalMult
 *
 * clickPower reads cps but cps never reads clickPower, so there's no circularity. cpsShare is the
 * "convert generator output into click power" mechanic that keeps active play meaningful late
 * (BUILD_BRIEF §3.3).
 */
import {
  config,
  parseTierUpgradeId,
  type EconomyConfig,
  type GeneratorDef,
} from "./config.js";
import { bayCount, normalizeLayout, scoreLayout, type LayoutScore } from "./layout.js";
import { totalGenerators, type GameState } from "./state.js";

const ZERO = 0;
const ONE = 1;

export interface Derived {
  /** Cash per second from generators, all multipliers applied. */
  cps: number;
  /** Cash per tap, all multipliers applied. */
  clickPower: number;
  globalMult: number;
  productionMult: number;
  clickMult: number;
  generatorMults: number[];
  /** Per-generator contribution to cps, for the "what's earning" readout. */
  generatorCps: number[];
  goodwillMult: number;
  offlineRateMult: number;
  goldenRateMult: number;
  goldenDurationMult: number;
  /** What the line on the bench is worth. Always ≥ 1 — layout is a bonus, never a tax (A7). */
  layout: LayoutScore;
}

export function generatorCost(
  state: GameState,
  index: number,
  count = ONE,
  c: EconomyConfig = config,
): number {
  const def = c.generators.list[index];
  if (!def) return Number.POSITIVE_INFINITY;
  const owned = state.generators[index] ?? ZERO;
  const growth = c.generators.costGrowth;
  // Geometric series: baseCost × growth^owned × (growth^count − 1) / (growth − 1)
  const first = def.baseCost * Math.pow(growth, owned);
  if (count === ONE) return first;
  return (first * (Math.pow(growth, count) - ONE)) / (growth - ONE);
}

export function tierUpgradeCost(
  def: GeneratorDef,
  tierIndex: number,
  c: EconomyConfig = config,
): number {
  const multiplier = c.generatorTiers.costMultipliers[tierIndex] ?? ZERO;
  return def.baseCost * multiplier;
}

export function tierUpgradeName(
  def: GeneratorDef,
  tierIndex: number,
  c: EconomyConfig = config,
): string {
  const template = c.generatorTiers.names[tierIndex] ?? "{name}";
  return template.replace("{name}", def.name);
}

export function goodwillMultiplier(state: GameState, c: EconomyConfig = config): number {
  return ONE + state.goodwill * c.prestige.multiplierPerGoodwill;
}

export function derive(state: GameState, c: EconomyConfig = config): Derived {
  const owned = new Set(state.upgrades);
  const perks = new Set(state.perks);

  let clickMult = ONE;
  let perGenBonus = ZERO;
  let perGenMult = ONE;
  let cpsShareAdded = ZERO;
  let cpsShareMult = ONE;

  for (const up of c.clickUpgrades) {
    if (!owned.has(up.id)) continue;
    switch (up.effect) {
      case "clickMult":
        clickMult *= up.value;
        break;
      case "perGenerator":
        perGenBonus += up.value;
        break;
      case "perGeneratorMult":
        perGenMult *= up.value;
        break;
      case "cpsShare":
        cpsShareAdded += up.value;
        break;
      case "cpsShareMult":
        cpsShareMult *= up.value;
        break;
    }
  }
  // Multiplying a small non-zero base keeps every step bounded; switching the term on from zero
  // was a 294x cliff (G3 A5).
  const cpsShare = c.click.baseCpsShare * cpsShareMult + cpsShareAdded;

  const goodwillMult = goodwillMultiplier(state, c);
  let globalMult = goodwillMult;
  for (const up of c.globalUpgrades) {
    if (owned.has(up.id)) globalMult *= up.value;
  }

  let offlineRateMult = ONE;
  let goldenRateMult = ONE;
  let goldenDurationMult = ONE;
  for (const perk of c.prestige.perks) {
    if (!perks.has(perk.id)) continue;
    switch (perk.effect) {
      case "globalMult":
        globalMult *= perk.value;
        break;
      case "clickMult":
        clickMult *= perk.value;
        break;
      case "offlineRateMult":
        offlineRateMult *= perk.value;
        break;
      case "goldenRateMult":
        goldenRateMult *= perk.value;
        break;
      case "goldenDurationMult":
        goldenDurationMult *= perk.value;
        break;
      case "startingCash":
        break;
    }
  }

  // Golden patty effects in flight.
  let productionMult = ONE;
  for (const effect of state.golden.activeEffects) {
    if (effect.endsAt <= state.timeSeconds) continue;
    if (effect.type === "productionMult") productionMult *= effect.value;
    if (effect.type === "clickMult") clickMult *= effect.value;
  }

  // Per-generator tier multipliers.
  const generatorMults = c.generators.list.map(() => ONE);
  for (const id of state.upgrades) {
    const parsed = parseTierUpgradeId(id);
    if (!parsed) continue;
    const index = c.generators.list.findIndex((g) => g.id === parsed.generatorId);
    if (index < ZERO) continue;
    generatorMults[index] = (generatorMults[index] ?? ONE) * c.generatorTiers.multiplier;
  }

  // What the arrangement of the bench is worth. Both terms floor at 1, so a line nobody has ever
  // touched earns exactly what it earned before layout existed (A7).
  const layout = scoreLayout(
    normalizeLayout(state.layout, c, bayCount(state.upgrades, c)),
    state.generators,
    c,
  );

  const generatorCps: number[] = [];
  let baseCps = ZERO;
  c.generators.list.forEach((def, index) => {
    const count = state.generators[index] ?? ZERO;
    const each = def.baseRate * (generatorMults[index] ?? ONE) * (layout.generatorMults[index] ?? ONE);
    const contribution = count * each * globalMult * layout.flowMult * productionMult;
    generatorCps.push(contribution);
    baseCps += contribution;
  });

  const generatorsOwned = totalGenerators(state);
  const clickPower =
    (c.click.baseCash * clickMult + perGenBonus * perGenMult * generatorsOwned + cpsShare * baseCps) *
    globalMult;

  return {
    cps: baseCps,
    clickPower,
    globalMult,
    productionMult,
    clickMult,
    generatorMults,
    generatorCps,
    goodwillMult,
    offlineRateMult,
    goldenRateMult,
    goldenDurationMult,
    layout,
  };
}
