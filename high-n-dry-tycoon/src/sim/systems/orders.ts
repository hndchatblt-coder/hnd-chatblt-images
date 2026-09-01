/**
 * Turning a queued customer into work: an order, exploded into the steps of its recipes' DAGs.
 *
 * A step is ready when everything it depends on is done. That is the only rule, and it is what
 * makes a recipe a factory line rather than a countdown.
 */
import { recipeById } from "../../config/recipes.js";
import type { World } from "../world.js";

export const takeOrders = (world: World): void => {
  for (const customer of world.customers) {
    if (customer.state !== "queued") continue;

    const order = {
      id: world.nextOrderId++,
      customerId: customer.id,
      placedAt: world.clock.elapsed,
      items: customer.basket.map((recipeId) => {
        const recipe = recipeById.get(recipeId);
        if (!recipe) throw new Error(`unknown recipe: ${recipeId}`);
        return {
          recipeId,
          remaining: recipe.steps.map((s) => s.id),
          done: [] as string[],
          quality: 1,
          ready: false,
        };
      }),
      completedAt: null,
      remade: false,
      expedited: false,
    };

    world.orders.push(order);
    customer.orderId = order.id;
    customer.state = "waiting";
  }
};
