/** Public surface of the headless engine. The UI imports only from here. */
export {
  config,
  parseTierUpgradeId,
  tierUpgradeId,
  validateConfig,
  type AchievementDef,
  type ClickUpgradeDef,
  type EconomyConfig,
  type GeneratorDef,
  type GlobalUpgradeDef,
  type GoldenEffectDef,
  type PerkDef,
} from "./config.js";
export {
  derive,
  generatorCost,
  goodwillMultiplier,
  tierUpgradeCost,
  tierUpgradeName,
  type Derived,
} from "./derive.js";
export {
  availableUpgrades,
  buyGenerator,
  buyPerk,
  buyUpgrade,
  canSellBusiness,
  checkAchievements,
  goodwillFor,
  pendingGoodwill,
  purchaseOptions,
  sellBusiness,
  settleOffline,
  startNewRun,
  tap,
  tapGolden,
  tick,
  upgradeCost,
  type OfflineReport,
  type PurchaseKind,
  type PurchaseOption,
  type TapResult,
} from "./engine.js";
export { formatCash, formatDuration, formatNumber, formatRate, type Notation } from "./numbers.js";
export { Rng } from "./rng.js";
export {
  clearSave,
  deserialize,
  exportSave,
  importSave,
  load,
  LocalStorageAdapter,
  MemoryStorageAdapter,
  save,
  serialize,
  type StorageAdapter,
} from "./save.js";
export { createInitialState, totalGenerators, type ActiveEffect, type GameState } from "./state.js";
export {
  bestLayout,
  defaultLayout,
  EMPTY as EMPTY_BAY,
  layoutValue,
  normalizeLayout,
  placeableGenerators,
  productionWeights,
  scoreLayout,
  swapBays,
  type LayoutScore,
} from "./layout.js";
