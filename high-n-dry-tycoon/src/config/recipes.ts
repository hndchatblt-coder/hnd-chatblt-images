/**
 * Recipes are DAGs of steps, not timers (§4.4). This is what makes the kitchen a factory rather
 * than a queue with a delay on it.
 *
 * The batch sizes are the point. A grill doing four patties in 90s is wildly efficient if four
 * patties of demand exist in that window, and pure waste if you cook four and sell one. Batching
 * against freshness is a live decision every service.
 */
export type StationType = "grill" | "fryer" | "prep" | "toast" | "assembly" | "pass" | "drinks";

export interface Step {
  id: string;
  station: StationType;
  /** Seconds at skill 1.0. */
  duration: number;
  /** Units produced per execution. */
  batchSize: number;
  dependsOn: string[];
  output: string;
  /** Seconds before quality starts to decay (§4.7). */
  freshnessWindow?: number;
}

export interface Recipe {
  id: string;
  name: string;
  /** Raw ingredients consumed per unit sold. */
  ingredients: Record<string, number>;
  steps: Step[];
}

/** Launch menu is two items plus drinks. The rest unlock — the DAG only gets interesting when
 *  items start competing for the same station. */
export const recipes: Recipe[] = [
  {
    id: "cheeseburger",
    name: "Classic cheeseburger",
    ingredients: { beef: 1, bun: 1, cheese: 1, garnish: 1 },
    steps: [
      { id: "patty", station: "grill", duration: 90, batchSize: 4, dependsOn: [], output: "patty", freshnessWindow: 480 },
      { id: "bun", station: "toast", duration: 25, batchSize: 6, dependsOn: [], output: "bun", freshnessWindow: 180 },
      { id: "garnish", station: "prep", duration: 12, batchSize: 8, dependsOn: [], output: "garnish", freshnessWindow: 1200 },
      { id: "assemble", station: "assembly", duration: 18, batchSize: 1, dependsOn: ["patty", "bun", "garnish"], output: "burger" },
      { id: "plate", station: "pass", duration: 6, batchSize: 1, dependsOn: ["assemble"], output: "cheeseburger" },
    ],
  },
  {
    id: "chips",
    name: "Chips",
    ingredients: { potato: 1, oil: 1 },
    steps: [
      { id: "basket", station: "fryer", duration: 195, batchSize: 3, dependsOn: [], output: "chips", freshnessWindow: 300 },
      { id: "plate", station: "pass", duration: 6, batchSize: 1, dependsOn: ["basket"], output: "chips" },
    ],
  },
];

/** What a customer orders. Most people get a burger; a good share add chips. */
export const basket = {
  /** Probability a customer adds chips to a burger. */
  chipsAttachRate: 0.55,
} as const;

export const recipeById = new Map(recipes.map((r) => [r.id, r]));
