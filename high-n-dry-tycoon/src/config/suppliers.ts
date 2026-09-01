/**
 * The supply meta (§8), unlocked at three venues.
 *
 * The lever is volume: order enough beef across the group and the price per kilo drops. The
 * friction is everything else — deliveries run on schedules, storage competes with kitchen space
 * in *tiles*, and stock spoils. Running out mid-service 86s the item, which customers notice by
 * name.
 *
 * Target: a good player moves COGS from ~34% to under 27%.
 */
export interface VolumeTier {
  /** Kilos or units per week across the whole group. */
  minWeeklyVolume: number;
  /** Multiplies list price. */
  priceMultiplier: number;
}

export interface SupplierDef {
  id: string;
  name: string;
  items: string[];
  /** Sunday-first. Supplier X does Tuesday and Friday only. */
  deliveryDays: number[];
  tiers: VolumeTier[];
  /** Days before this supplier's goods spoil. */
  shelfLifeDays: Record<string, number>;
}

export const suppliers: SupplierDef[] = [
  {
    id: "meat",
    name: "Riverina Meats",
    items: ["beef"],
    deliveryDays: [2, 5],
    tiers: [
      { minWeeklyVolume: 0, priceMultiplier: 1 },
      { minWeeklyVolume: 120, priceMultiplier: 0.92 },
      { minWeeklyVolume: 320, priceMultiplier: 0.84 },
      { minWeeklyVolume: 700, priceMultiplier: 0.76 },
    ],
    shelfLifeDays: { beef: 3 },
  },
  {
    id: "bakery",
    name: "Bourke St Bakehouse",
    items: ["bun"],
    deliveryDays: [1, 3, 5],
    tiers: [
      { minWeeklyVolume: 0, priceMultiplier: 1 },
      { minWeeklyVolume: 200, priceMultiplier: 0.9 },
      { minWeeklyVolume: 600, priceMultiplier: 0.82 },
    ],
    shelfLifeDays: { bun: 2 },
  },
  {
    id: "produce",
    name: "Flemington Produce",
    items: ["garnish", "potato"],
    deliveryDays: [1, 4],
    tiers: [
      { minWeeklyVolume: 0, priceMultiplier: 1 },
      { minWeeklyVolume: 150, priceMultiplier: 0.93 },
      { minWeeklyVolume: 400, priceMultiplier: 0.86 },
    ],
    shelfLifeDays: { garnish: 4, potato: 7 },
  },
  {
    id: "dry",
    name: "Trade supplies",
    items: ["cheese", "oil"],
    deliveryDays: [3],
    tiers: [
      { minWeeklyVolume: 0, priceMultiplier: 1 },
      { minWeeklyVolume: 100, priceMultiplier: 0.94 },
      { minWeeklyVolume: 300, priceMultiplier: 0.88 },
    ],
    shelfLifeDays: { cheese: 21, oil: 60 },
  },
];

export const storage = {
  /** Units a single cool-room tile holds. Storage competes with kitchen space. */
  unitsPerCoolRoomTile: 90,
  unitsPerDryStoreTile: 140,
} as const;

/**
 * The commissary: buy at top tier, prep centrally, run trucks. This is where COGS actually falls,
 * and the failure mode is a venue running dry at 7pm on a Saturday.
 */
export const commissary = {
  purchaseCost: 180000,
  /** Central prep beats every retail tier. */
  priceMultiplier: 0.68,
  /** Pressing patties and batching sauces centrally saves kitchen time at each venue. */
  prepTimeSaving: 0.18,
  weeklyOverhead: 2100,
  /** Minimum venues before it's offered — below this the overhead never pays. */
  minVenues: 3,
} as const;

export const trucks = {
  cost: 42000,
  /** Units per run. */
  capacity: 900,
  runningCostPerRun: 85,
  /** Game hours a run takes. */
  hoursPerRun: 3,
} as const;
