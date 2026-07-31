/**
 * Turning a queued customer into work: an order, exploded into the steps of its recipes' DAGs.
 *
 * A step is ready when everything it depends on is done. That is the only rule, and it is what
 * makes a recipe a factory line rather than a countdown.
 */
import { recipeById } from "../../config/recipes.js";
import type { Task } from "../entities.js";
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

/** Every step whose dependencies are satisfied and which nobody is already working. */
export const readyTasks = (world: World): Task[] => {
  const out: Task[] = [];
  for (const order of world.orders) {
    if (order.completedAt !== null) continue;
    order.items.forEach((item, itemIndex) => {
      const recipe = recipeById.get(item.recipeId);
      if (!recipe) return;
      for (const stepId of item.remaining) {
        const step = recipe.steps.find((s) => s.id === stepId);
        if (!step) continue;
        const key = `${order.id}:${itemIndex}:${stepId}`;
        if (world.inFlight.has(key)) continue;
        const ready = step.dependsOn.every((d) => item.done.includes(d));
        if (!ready) continue;
        out.push({
          orderId: order.id,
          itemIndex,
          stepId,
          station: step.station,
          remaining: step.duration,
          assignedTo: null,
        });
      }
    });
  }
  return out;
};
