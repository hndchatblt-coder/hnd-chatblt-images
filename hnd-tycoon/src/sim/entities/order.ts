/**
 * Customers and their orders. DESIGN.md §6.2, §7.
 *
 * A customer is separate from their order on purpose. Archetypes (§6.2) live
 * on the customer — patience, spend, review rate, silhouette — while the order
 * is what the kitchen schedules against. A table of six is one customer record
 * and six covers' worth of order lines.
 */
import type { ItemId, OrderId, RecipeId } from '../types';

export type CustomerState = 'waiting' | 'served' | 'left';

export interface Customer {
  readonly id: string;
  /** Tick the customer walked in. Wait is measured from here. */
  readonly arrivedAt: number;
  readonly orderId: OrderId;
  state: CustomerState;
  servedAt: number | null;
}

export interface OrderLine {
  readonly recipeId: RecipeId;
  /** The finished item this line is waiting on — the sink of the recipe DAG. */
  readonly item: ItemId;
  readonly quantity: number;
  fulfilled: number;
}

export type OrderState = 'open' | 'served' | 'abandoned';

export interface Order {
  readonly id: OrderId;
  readonly customerId: string;
  readonly placedAt: number;
  readonly lines: OrderLine[];
  state: OrderState;
  servedAt: number | null;
}

/**
 * An order is complete only when EVERY line is fulfilled. Nothing goes out
 * half-made — that is a step-2 exit criterion and it stays true forever.
 */
export function isOrderComplete(order: Order): boolean {
  return order.lines.every((line) => line.fulfilled >= line.quantity);
}

/** Units of a finished item still outstanding across an order. */
export function outstandingOf(order: Order, item: ItemId): number {
  let total = 0;
  for (const line of order.lines) {
    if (line.item === item) total += Math.max(0, line.quantity - line.fulfilled);
  }
  return total;
}
