/**
 * Recipes as step DAGs. DESIGN.md §7.
 *
 * The batch sizes are the point: a grill doing four patties in 90s is wildly
 * efficient IF you have four patties of demand in the window, and wasteful if
 * you cook four and sell one. Batching vs freshness is the core tension.
 *
 * Numbers transcribed directly from the spec. Do not re-derive them.
 */
import { money, type ItemId, type RecipeId } from '@/sim/types';

export type StationType = 'grill' | 'fryer' | 'prep' | 'toast' | 'assembly' | 'pass' | 'drinks';

/**
 * How much of a staff member's time a step actually occupies, versus how much
 * is just elapsed cooking. DESIGN.md §14.1 — automation buys back ATTENTION,
 * not time. A grill patty is 90s of cooking but ~22s of human attention.
 */
export interface AttentionProfile {
  /** Loading, pressing, dressing. Always staffed. */
  readonly setupSeconds: number;
  /** Flipping, shaking, watching. Automatable. */
  readonly tendSeconds: number;
  /** Unloading, plating. Automatable at higher tiers. */
  readonly teardownSeconds: number;
  /** If true, unattended overrun burns the item. */
  readonly canLapse: boolean;
}

export interface Step {
  readonly id: string;
  readonly station: StationType;
  /** Total elapsed seconds at skill 1.0. */
  readonly duration: number;
  readonly batchSize: number;
  readonly dependsOn: readonly string[];
  readonly output: ItemId;
  /** Seconds before quality begins to decay. */
  readonly freshnessWindow?: number;
  readonly attention: AttentionProfile;
  /**
   * Raw ingredients this step consumes, per unit produced. They belong here
   * rather than on the recipe because otherwise a binned patty would cost the
   * price of a whole cheeseburger, and every root step would be charged the
   * full list.
   */
  readonly consumes?: Readonly<Record<string, number>>;
}

export interface Recipe {
  readonly id: RecipeId;
  readonly name: string;
  readonly sellPrice: ReturnType<typeof money>;
  readonly ingredients: Readonly<Record<string, number>>;
  readonly steps: readonly Step[];
  /** Null in Acts I–II. Drives regional fit in Act III. §26. */
  readonly tasteVector?: readonly number[];
}

const attn = (
  setupSeconds: number,
  tendSeconds: number,
  teardownSeconds: number,
  canLapse = false,
): AttentionProfile => ({ setupSeconds, tendSeconds, teardownSeconds, canLapse });

export const RECIPES: Readonly<Record<string, Recipe>> = {
  cheeseburger: {
    id: 'cheeseburger' as RecipeId,
    name: 'Classic Cheeseburger',
    sellPrice: money(16.5),
    ingredients: { mince: 0.15, bun: 1, cheese: 1, salad: 0.05, sauce: 0.03 },
    steps: [
      {
        id: 'patty',
        station: 'grill',
        duration: 90,
        batchSize: 4,
        dependsOn: [],
        output: 'patty' as ItemId,
        freshnessWindow: 480,
        consumes: { mince: 0.15 },
        // 90s cooking, ~22s attention: load, flip, pull. The flip is what a
        // clamshell grill removes. §14.2
        attention: attn(8, 10, 4, true),
      },
      {
        id: 'bun',
        station: 'toast',
        duration: 25,
        batchSize: 6,
        dependsOn: [],
        output: 'toastedBun' as ItemId,
        freshnessWindow: 180,
        consumes: { bun: 1 },
        attention: attn(5, 2, 3, true),
      },
      {
        id: 'garnish',
        station: 'prep',
        duration: 12,
        batchSize: 8,
        dependsOn: [],
        output: 'garnish' as ItemId,
        freshnessWindow: 1200,
        consumes: { salad: 0.05 },
        attention: attn(4, 6, 2, false),
      },
      {
        id: 'assemble',
        station: 'assembly',
        duration: 18,
        batchSize: 1,
        dependsOn: ['patty', 'bun', 'garnish'],
        output: 'assembledBurger' as ItemId,
        consumes: { cheese: 1, sauce: 0.03 },
        // Sauce dispenser removes ~40% of setup. §14.2
        attention: attn(10, 6, 2, false),
      },
      {
        id: 'plate',
        station: 'pass',
        duration: 6,
        batchSize: 1,
        dependsOn: ['assemble'],
        output: 'servedBurger' as ItemId,
        attention: attn(3, 0, 3, false),
      },
    ],
  },

  chips: {
    id: 'chips' as RecipeId,
    name: 'Chips',
    sellPrice: money(7.5),
    ingredients: { potato: 0.2, oil: 0.02, salt: 0.002 },
    steps: [
      {
        id: 'basket',
        station: 'fryer',
        duration: 195,
        batchSize: 3,
        dependsOn: [],
        output: 'chips' as ItemId,
        freshnessWindow: 300,
        consumes: { potato: 0.2, oil: 0.02, salt: 0.002 },
        // The shake and the pull are what an auto-lift fryer removes,
        // and it flips canLapse to false. §14.2
        attention: attn(6, 14, 6, true),
      },
      {
        id: 'plateChips',
        station: 'pass',
        duration: 5,
        batchSize: 1,
        dependsOn: ['basket'],
        output: 'servedChips' as ItemId,
        attention: attn(3, 0, 2, false),
      },
    ],
  },
};

/** Launch menu is two items plus drinks. The rest unlock. §7. */
export const LAUNCH_MENU: readonly string[] = ['cheeseburger', 'chips'];
