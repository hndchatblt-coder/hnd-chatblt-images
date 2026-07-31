/**
 * Handing food over, and what the customer thought of it (§4.8, §4.9).
 *
 * Satisfaction is the product of three independent scores rather than a sum, so being terrible at
 * any one of them ruins the order. That is how it actually works: perfect food twenty minutes
 * late is still a bad experience.
 */
import { economy } from "../../config/economy.js";
import { recipeById } from "../../config/recipes.js";
import { reviews as reviewCfg } from "../../config/reviews.js";
import type { Order } from "../entities.js";
import type { World } from "../world.js";

export const waitScore = (waitSeconds: number): number => {
  const minutes = waitSeconds / 60;
  const over = minutes - reviewCfg.graceMinutes;
  if (over <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - over / reviewCfg.toleranceMinutes));
};

export const satisfactionFor = (world: World, order: Order, waitSeconds: number): number => {
  const quality =
    order.items.reduce((a, i) => a + i.quality, 0) / Math.max(1, order.items.length);
  const accuracy = order.remade ? reviewCfg.accuracyPenaltyOnRemake : 1;
  return waitScore(waitSeconds) * quality * accuracy;
};

export const stepService = (world: World): void => {
  for (const order of world.orders) {
    if (order.completedAt !== null) continue;
    if (!order.items.every((i) => i.ready)) continue;

    order.completedAt = world.clock.elapsed;
    const customer = world.customers.find((c) => c.id === order.customerId);
    if (!customer) continue;
    customer.state = "served";

    const wait = order.completedAt - order.placedAt;
    const satisfaction = satisfactionFor(world, order, wait);

    // Money. Revenue at menu price, COGS on everything the order actually consumed.
    for (const item of order.items) {
      const recipe = recipeById.get(item.recipeId);
      if (!recipe) continue;
      world.cash += world.menuPrice[item.recipeId] ?? 0;
      world.day.revenue += world.menuPrice[item.recipeId] ?? 0;
      for (const [ingredient, qty] of Object.entries(recipe.ingredients)) {
        const cost = (economy.ingredientCost[ingredient] ?? 0) * qty;
        world.cash -= cost;
        world.day.cogs += cost;
      }
    }

    world.day.ordersCompleted += 1;
    world.day.waitSecondsTotal += wait;
    world.day.satisfactionTotal += satisfaction;

    // Angry people review about four times as often as happy ones. That asymmetry is the game.
    const chance =
      satisfaction < reviewCfg.angryThreshold
        ? reviewCfg.reviewChanceAngry
        : satisfaction >= reviewCfg.happyThreshold
          ? reviewCfg.reviewChanceHappy
          : (reviewCfg.reviewChanceHappy + reviewCfg.reviewChanceAngry) / 2;

    if (world.rng.chance(chance)) {
      world.pendingReviews.push({
        at: world.clock.elapsed,
        stars: Math.max(1, Math.min(5, Math.round(1 + satisfaction * 4))),
        reason: satisfaction < reviewCfg.angryThreshold ? "long wait" : "good feed",
      });
    }

    // Rolling estimate of how long service is taking, which is what the next arrival reads.
    const k = reviewCfg.serviceEstimateSmoothing;
    world.rollingServiceSeconds = world.rollingServiceSeconds * (1 - k) + wait * k;
  }

  // Retire finished work so the arrays don't grow without bound over 90 days.
  world.orders = world.orders.filter((o) => o.completedAt === null);
  world.customers = world.customers.filter((c) => c.state === "queued" || c.state === "waiting");
};
