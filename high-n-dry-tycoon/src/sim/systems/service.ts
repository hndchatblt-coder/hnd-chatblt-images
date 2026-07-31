/**
 * Handing food over, and what the customer thought of it (§4.8, §4.9).
 *
 * Satisfaction is the product of three independent scores rather than a sum, so being terrible at
 * any one of them ruins the order. That is how it actually works: perfect food twenty minutes
 * late is still a bad experience.
 */
import { recipeById } from "../../config/recipes.js";
import { demand } from "../../config/demand.js";
import { reviews as reviewCfg } from "../../config/reviews.js";
import type { Order } from "../entities.js";
import { post } from "./economy.js";
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

/**
 * People who gave up. A customer who ordered and then waited three times their patience walks out
 * — and unlike a balk, they are properly angry about it.
 */
export const stepReneging = (world: World): void => {
  const limit = demand.balk.renegeAtPatienceMultiple;
  for (const customer of world.customers) {
    if (customer.state !== "waiting") continue;
    const waited = (world.clock.elapsed - customer.arrivedAt) / 60;
    if (waited < customer.patienceMinutes * limit) continue;

    customer.state = "balked";
    world.day.reneged += 1;
    if (world.rng.chance(demand.balk.renegeReviewChance)) {
      world.pendingReviews.push({
        at: world.clock.elapsed,
        stars: demand.balk.renegeReviewStars,
        reason: "waited and gave up",
      });
    }
    // The order goes in the bin. The food, if any of it was made, is wasted.
    const order = world.orders.find((o) => o.id === customer.orderId);
    if (order) order.completedAt = world.clock.elapsed;
  }
};

export const stepService = (world: World): void => {
  for (const order of world.orders) {
    if (order.completedAt !== null) continue;
    if (!order.items.every((i) => i.ready)) continue;

    order.completedAt = world.clock.elapsed;
    const customer = world.customers.find((c) => c.id === order.customerId);
    // A customer who already gave up isn't there to hand it to.
    if (!customer || customer.state !== "waiting") continue;
    customer.state = "served";

    const wait = order.completedAt - order.placedAt;
    const satisfaction = satisfactionFor(world, order, wait);

    // Money. Revenue at menu price, COGS on everything the order actually consumed.
    for (const item of order.items) {
      const recipe = recipeById.get(item.recipeId);
      if (!recipe) continue;
      // COGS was already booked by the kitchen when it made the food — including the batches
      // that never sold. Charging again here would double-count and hide waste.
      void recipe;
      const price = world.menuPrice[item.recipeId] ?? 0;
      post(world, "revenue", price);
      world.day.revenue += price;
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
