/**
 * Supply (§8). Where COGS actually comes down, and where a venue runs dry at 7pm on a Saturday.
 */
import { commissary, suppliers, type SupplierDef } from "../../config/suppliers.js";
import { economy } from "../../config/economy.js";

/** The price multiplier a given weekly volume earns from a supplier. */
export const tierMultiplier = (supplier: SupplierDef, weeklyVolume: number): number => {
  let best = 1;
  for (const tier of supplier.tiers) {
    if (weeklyVolume >= tier.minWeeklyVolume) best = tier.priceMultiplier;
  }
  return best;
};

export const supplierFor = (item: string): SupplierDef | undefined =>
  suppliers.find((s) => s.items.includes(item));

/**
 * What an ingredient actually costs, given group volume and whether a commissary is running.
 *
 * This is the whole supply meta in one function: volume earns tiers, and a commissary beats every
 * retail tier because you're buying wholesale and prepping centrally.
 */
export const unitCost = (
  item: string,
  weeklyVolume: number,
  hasCommissary: boolean,
): number => {
  const list = economy.ingredientCost[item] ?? 0;
  if (hasCommissary) return list * commissary.priceMultiplier;
  const supplier = supplierFor(item);
  if (!supplier) return list;
  return list * tierMultiplier(supplier, weeklyVolume);
};
