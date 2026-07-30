/**
 * The engine. Pure TS, zero DOM imports (BUILD_BRIEF §5): tick, tap, purchase, golden patties,
 * achievements, prestige, offline settlement. The UI reads state and dispatches these intents;
 * the playbot calls exactly the same functions.
 *
 * State is mutated in place for speed (a clicker ticks at 60fps and the state is small); every
 * function is deterministic given `state.rngState`, so replays and the sim stay honest.
 */
import {
  config,
  parseTierUpgradeId,
  tierUpgradeId,
  type AchievementDef,
  type EconomyConfig,
} from "./config.js";
import { derive, generatorCost, tierUpgradeCost, tierUpgradeName, type Derived } from "./derive.js";
import { Rng } from "./rng.js";
import { totalGenerators, type GameState } from "./state.js";

const ZERO = 0;
const ONE = 1;

export type PurchaseKind = "generator" | "tier" | "click" | "global";

export interface PurchaseOption {
  id: string;
  kind: PurchaseKind;
  name: string;
  cost: number;
  /** Index into config.generators.list for generator/tier purchases. */
  generatorIndex: number | null;
  /** Extra $/sec this purchase is worth, at the caller's tap rate. Used by the playbot. */
  gainPerSecond: number;
  affordable: boolean;
}

export interface OfflineReport {
  seconds: number;
  cappedSeconds: number;
  earned: number;
  rate: number;
}

export interface TapResult {
  earned: number;
  caughtGolden: boolean;
}

/* ------------------------------------------------------------------ earning */

function addRevenue(state: GameState, amount: number): void {
  if (amount <= ZERO) return;
  state.cash += amount;
  state.runRevenue += amount;
  state.lifetimeRevenue += amount;
  if (state.runRevenue > state.stats.bestRunRevenue) state.stats.bestRunRevenue = state.runRevenue;
}

/* --------------------------------------------------------------------- tap */

export function tap(state: GameState, c: EconomyConfig = config): TapResult {
  const d = derive(state, c);
  addRevenue(state, d.clickPower);
  state.taps += ONE;
  state.stats.totalTaps += ONE;
  state.burgersSold += ONE;
  checkAchievements(state, c);
  return { earned: d.clickPower, caughtGolden: false };
}

/* -------------------------------------------------------------------- tick */

export function tick(state: GameState, dtSeconds: number, c: EconomyConfig = config): number {
  if (dtSeconds <= ZERO) return ZERO;
  state.timeSeconds += dtSeconds;

  const d = derive(state, c);
  const earned = d.cps * dtSeconds;
  addRevenue(state, earned);
  state.burgersSold += earned > ZERO ? ONE : ZERO;

  expireEffects(state);
  updateGolden(state, d, c);
  checkAchievements(state, c);
  return earned;
}

function expireEffects(state: GameState): void {
  if (state.golden.activeEffects.length === ZERO) return;
  const survivors = [];
  for (const effect of state.golden.activeEffects) {
    if (effect.endsAt > state.timeSeconds) {
      survivors.push(effect);
    } else if (effect.value < ONE) {
      // The health inspector finished and took nothing with them.
      state.golden.inspectorSurvived += ONE;
    }
  }
  state.golden.activeEffects = survivors;
}

/* ------------------------------------------------------------------ golden */

function scheduleNextGolden(state: GameState, d: Derived, c: EconomyConfig): void {
  const rng = Rng.fromState(state.rngState);
  const gap = rng.range(c.golden.spawnSecondsMin, c.golden.spawnSecondsMax) * d.goldenRateMult;
  state.golden.nextSpawnAt = state.timeSeconds + gap;
  state.rngState = rng.getState();
}

function updateGolden(state: GameState, d: Derived, c: EconomyConfig): void {
  const onScreen = state.golden.onScreen;
  if (onScreen) {
    if (state.timeSeconds >= onScreen.expiresAt) {
      state.golden.onScreen = null;
      scheduleNextGolden(state, d, c);
    }
    return;
  }
  if (state.timeSeconds >= state.golden.nextSpawnAt) {
    const rng = Rng.fromState(state.rngState);
    const effect = rng.pickWeighted(c.golden.effects, (e) => e.weight);
    state.rngState = rng.getState();
    state.golden.onScreen = {
      effectId: effect.id,
      spawnedAt: state.timeSeconds,
      expiresAt: state.timeSeconds + c.golden.durationSeconds * d.goldenDurationMult,
    };
  }
}

/** Tap the golden patty. Returns the effect that fired, or null if there was nothing there. */
export function tapGolden(state: GameState, c: EconomyConfig = config): string | null {
  const onScreen = state.golden.onScreen;
  if (!onScreen) return null;
  const effect = c.golden.effects.find((e) => e.id === onScreen.effectId);
  if (!effect) return null;

  const d = derive(state, c);
  if (effect.type === "instantCash") {
    const fromBank = state.cash * (effect.bankShare ?? ZERO);
    const fromProduction = d.cps * (effect.secondsOfProduction ?? ZERO);
    addRevenue(state, Math.min(fromBank, fromProduction));
  } else {
    state.golden.activeEffects.push({
      effectId: effect.id,
      type: effect.type,
      value: effect.value ?? ONE,
      endsAt: state.timeSeconds + (effect.seconds ?? ZERO) * d.goldenDurationMult,
    });
  }

  state.golden.caught += ONE;
  state.golden.onScreen = null;
  scheduleNextGolden(state, d, c);
  checkAchievements(state, c);
  return effect.id;
}

/* ---------------------------------------------------------------- purchase */

export function buyGenerator(
  state: GameState,
  index: number,
  count = ONE,
  c: EconomyConfig = config,
): boolean {
  const def = c.generators.list[index];
  if (!def) return false;
  const cost = generatorCost(state, index, count, c);
  if (state.cash < cost) return false;
  state.cash -= cost;
  state.generators[index] = (state.generators[index] ?? ZERO) + count;
  if (!state.purchaseOrder.includes(def.id)) state.purchaseOrder.push(def.id);
  checkAchievements(state, c);
  return true;
}

/** Every upgrade currently purchasable (unlocked and not owned), with its cost. */
export function availableUpgrades(state: GameState, c: EconomyConfig = config): PurchaseOption[] {
  const owned = new Set(state.upgrades);
  const options: PurchaseOption[] = [];

  c.generators.list.forEach((def, index) => {
    const count = state.generators[index] ?? ZERO;
    c.generatorTiers.thresholds.forEach((threshold, tierIndex) => {
      const id = tierUpgradeId(def.id, tierIndex);
      if (owned.has(id) || count < threshold) return;
      options.push({
        id,
        kind: "tier",
        name: tierUpgradeName(def, tierIndex, c),
        cost: tierUpgradeCost(def, tierIndex, c),
        generatorIndex: index,
        gainPerSecond: ZERO,
        affordable: false,
      });
    });
  });

  for (const up of c.clickUpgrades) {
    if (owned.has(up.id)) continue;
    options.push({
      id: up.id,
      kind: "click",
      name: up.name,
      cost: up.cost,
      generatorIndex: null,
      gainPerSecond: ZERO,
      affordable: false,
    });
  }

  for (const up of c.globalUpgrades) {
    if (owned.has(up.id)) continue;
    options.push({
      id: up.id,
      kind: "global",
      name: up.name,
      cost: up.cost,
      generatorIndex: null,
      gainPerSecond: ZERO,
      affordable: false,
    });
  }

  return options;
}

export function upgradeCost(id: string, c: EconomyConfig = config): number {
  const tier = parseTierUpgradeId(id);
  if (tier) {
    const def = c.generators.list.find((g) => g.id === tier.generatorId);
    if (!def) return Number.POSITIVE_INFINITY;
    return tierUpgradeCost(def, tier.tierIndex, c);
  }
  const click = c.clickUpgrades.find((u) => u.id === id);
  if (click) return click.cost;
  const global = c.globalUpgrades.find((u) => u.id === id);
  if (global) return global.cost;
  return Number.POSITIVE_INFINITY;
}

export function buyUpgrade(state: GameState, id: string, c: EconomyConfig = config): boolean {
  if (state.upgrades.includes(id)) return false;
  const unlocked = availableUpgrades(state, c).some((o) => o.id === id);
  if (!unlocked) return false;
  const cost = upgradeCost(id, c);
  if (state.cash < cost) return false;
  state.cash -= cost;
  state.upgrades.push(id);
  checkAchievements(state, c);
  return true;
}

/**
 * Every purchase available right now, scored by payback. `tapsPerSecond` lets the caller value
 * click upgrades honestly — the idle profile gets no value from them, the tryhard profile gets a
 * lot. This is what the playbot's greedy strategy sorts on.
 */
export function purchaseOptions(
  state: GameState,
  tapsPerSecond: number,
  c: EconomyConfig = config,
): PurchaseOption[] {
  const before = derive(state, c);
  const baseline = before.cps + before.clickPower * tapsPerSecond;
  const options: PurchaseOption[] = [];

  c.generators.list.forEach((def, index) => {
    const cost = generatorCost(state, index, ONE, c);
    const probe: GameState = { ...state, generators: [...state.generators] };
    probe.generators[index] = (probe.generators[index] ?? ZERO) + ONE;
    const after = derive(probe, c);
    options.push({
      id: def.id,
      kind: "generator",
      name: def.name,
      cost,
      generatorIndex: index,
      gainPerSecond: after.cps + after.clickPower * tapsPerSecond - baseline,
      affordable: state.cash >= cost,
    });
  });

  for (const option of availableUpgrades(state, c)) {
    const probe: GameState = { ...state, upgrades: [...state.upgrades, option.id] };
    const after = derive(probe, c);
    options.push({
      ...option,
      gainPerSecond: after.cps + after.clickPower * tapsPerSecond - baseline,
      affordable: state.cash >= option.cost,
    });
  }

  return options;
}

/* ---------------------------------------------------------------- prestige */

export function goodwillFor(lifetimeRevenue: number, c: EconomyConfig = config): number {
  const { goodwillScale, goodwillDivisor, goodwillExponent } = c.prestige;
  if (lifetimeRevenue <= ZERO) return ZERO;
  return Math.floor(goodwillScale * Math.pow(lifetimeRevenue / goodwillDivisor, goodwillExponent));
}

/** Goodwill this sale would award right now. */
export function pendingGoodwill(state: GameState, c: EconomyConfig = config): number {
  return Math.max(ZERO, goodwillFor(state.lifetimeRevenue, c) - state.goodwillClaimed);
}

export function canSellBusiness(state: GameState, c: EconomyConfig = config): boolean {
  return (
    state.lifetimeRevenue >= c.prestige.minLifetimeRevenueToSell && pendingGoodwill(state, c) > ZERO
  );
}

/**
 * Sell the business. Grants Goodwill, wipes the run, keeps everything permanent. Nothing the
 * player has earned is ever removed — Goodwill and perks and achievements all survive.
 */
export function sellBusiness(state: GameState, c: EconomyConfig = config): number {
  if (!canSellBusiness(state, c)) return ZERO;
  const awarded = pendingGoodwill(state, c);
  state.goodwill += awarded;
  state.goodwillClaimed += awarded;
  state.prestigeCount += ONE;

  const runSeconds = state.timeSeconds - state.stats.runStartedAtSeconds;
  if (state.stats.fastestPrestigeSeconds === null || runSeconds < state.stats.fastestPrestigeSeconds) {
    state.stats.fastestPrestigeSeconds = runSeconds;
  }

  startNewRun(state, c);
  checkAchievements(state, c);
  return awarded;
}

function startingCash(state: GameState, c: EconomyConfig): number {
  let cash = ZERO;
  const perks = new Set(state.perks);
  for (const perk of c.prestige.perks) {
    if (perk.effect === "startingCash" && perks.has(perk.id)) cash += perk.value;
  }
  return cash;
}

export function startNewRun(state: GameState, c: EconomyConfig = config): void {
  state.generators = c.generators.list.map(() => ZERO);
  state.upgrades = [];
  state.purchaseOrder = [];
  state.cash = startingCash(state, c);
  state.runRevenue = ZERO;
  state.taps = ZERO;
  state.golden.onScreen = null;
  state.golden.activeEffects = [];
  state.stats.runStartedAtSeconds = state.timeSeconds;

  const rng = Rng.fromState(state.rngState);
  state.golden.nextSpawnAt =
    state.timeSeconds + rng.range(c.golden.firstSpawnSecondsMin, c.golden.firstSpawnSecondsMax);
  state.rngState = rng.getState();
}

export function buyPerk(state: GameState, id: string, c: EconomyConfig = config): boolean {
  if (state.perks.includes(id)) return false;
  const perk = c.prestige.perks.find((p) => p.id === id);
  if (!perk) return false;
  if (state.goodwill < perk.cost) return false;
  state.goodwill -= perk.cost;
  state.perks.push(id);
  return true;
}

/* ----------------------------------------------------------------- offline */

/**
 * Settle time spent away. Reduced rate, hard cap, never negative — no punishment for leaving and
 * no timer you have to come back for (BUILD_BRIEF §3.8). A backwards clock change settles nothing
 * rather than clawing anything back.
 */
export function settleOffline(
  state: GameState,
  nowMs: number,
  c: EconomyConfig = config,
): OfflineReport {
  const elapsedSeconds = Math.max(ZERO, (nowMs - state.wallClockMs) / c.time.msPerSecond);
  const capSeconds = c.offline.capHours * c.time.secondsPerHour;
  const cappedSeconds = Math.min(elapsedSeconds, capSeconds);
  const d = derive(state, c);
  const rate = d.cps * c.offline.rateShare * d.offlineRateMult;
  const earned = rate * cappedSeconds;

  state.wallClockMs = nowMs;
  if (earned > ZERO) addRevenue(state, earned);
  checkAchievements(state, c);

  return { seconds: elapsedSeconds, cappedSeconds, earned, rate };
}

/* ------------------------------------------------------------ achievements */

function achievementMet(state: GameState, def: AchievementDef, c: EconomyConfig): boolean {
  const t = defTrigger(def);
  const value = t.value ?? ZERO;
  switch (t.type) {
    case "taps":
      return state.stats.totalTaps >= value;
    case "cash":
      return state.cash >= value;
    case "lifetimeRevenue":
      return state.lifetimeRevenue >= value;
    case "cashWithNoGenerators":
      return state.cash >= value && totalGenerators(state) === ZERO;
    case "generatorOwned": {
      const index = c.generators.list.findIndex((g) => g.id === t.target);
      return index >= ZERO && (state.generators[index] ?? ZERO) >= value;
    }
    case "allGeneratorsOwned":
      return state.generators.every((owned) => owned > ZERO);
    case "totalGenerators":
      return totalGenerators(state) >= value;
    case "cps":
      return derive(state, c).cps >= value;
    case "goldenCaught":
      return state.golden.caught >= value;
    case "inspectorSurvived":
      return state.golden.inspectorSurvived >= value;
    case "upgradesOwned":
      return state.upgrades.length >= value;
    case "prestigeCount":
      return state.prestigeCount >= value;
    case "goodwill":
      return state.goodwill >= value;
    case "boughtBefore": {
      const targetAt = state.purchaseOrder.indexOf(t.target ?? "");
      const otherAt = state.purchaseOrder.indexOf(t.other ?? "");
      return targetAt >= ZERO && (otherAt < ZERO || targetAt < otherAt);
    }
    default:
      return false;
  }
}

function defTrigger(def: AchievementDef): AchievementDef["trigger"] {
  return def.trigger;
}

/** Returns the ids newly unlocked by this check, so the UI can announce them. */
export function checkAchievements(state: GameState, c: EconomyConfig = config): string[] {
  const owned = new Set(state.achievements);
  const unlocked: string[] = [];
  for (const def of c.achievements) {
    if (owned.has(def.id)) continue;
    if (achievementMet(state, def, c)) {
      state.achievements.push(def.id);
      unlocked.push(def.id);
    }
  }
  return unlocked;
}

export { derive, generatorCost };
