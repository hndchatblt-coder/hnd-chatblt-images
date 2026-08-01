/**
 * Handing food over. DESIGN.md §7, §7.4.
 *
 * An order goes out only when EVERY line is fulfilled. Nothing leaves the pass
 * half-made — a burger with no chips is not a served order, it is a burger
 * sitting under the heat lamp going stale while the fryer catches up. That is
 * a step-2 exit criterion and it stays true for the rest of the project.
 *
 * Orders are filled in arrival order. FIFO is not neutral — it is the default
 * the player later overrides with Expedite (§22.6), and Expedite is only
 * interesting because there is an order to disturb.
 *
 * Satisfaction, reviews and reputation land at step 9. Wait is measured here
 * from the tick the customer walked in, because that is what they experienced.
 */
import { REPORT } from '@/config/report';
import { TIME } from '@/config/time';
import { GAME_SECONDS_PER_TICK } from '../clock';
import { isOrderComplete, type Order } from '../entities/order';
import type { SimState } from '../state';
import type { System, World } from '../world';

const NONE = 0;
const ONE = 1;

export class ServiceSystem implements System {
  readonly name = 'service';

  tick(world: World): void {
    const state = world.state;
    const now = world.clock.now as number;

    for (let i = NONE; i < state.openOrders.length; ) {
      const orderId = state.openOrders[i];
      const order = orderId === undefined ? undefined : state.orders.get(orderId);
      if (!order) {
        state.openOrders.splice(i, ONE);
        continue;
      }

      this.drawFromPass(state, order);

      if (isOrderComplete(order)) {
        this.serve(state, order, now);
        state.openOrders.splice(i, ONE);
        continue;
      }
      i += ONE;
    }
  }

  onClose(world: World): void {
    const day = world.state.day;
    world.record('arrived', day.arrived);
    world.record('covers', day.served);
    world.record(
      'meanWaitMin',
      meanWaitMinutes(day.waitTicks, day.served).toFixed(REPORT.MINUTE_DECIMALS),
    );
    world.record('openAtClose', world.state.openOrders.length);
  }

  private drawFromPass(state: SimState, order: Order): void {
    for (const line of order.lines) {
      const outstanding = line.quantity - line.fulfilled;
      if (outstanding <= NONE) continue;
      const available = Math.min(outstanding, state.stock.count(line.item));
      if (available > NONE && state.stock.take(line.item, available)) {
        line.fulfilled += available;
      }
    }
  }

  private serve(state: SimState, order: Order, now: number): void {
    order.state = 'served';
    order.servedAt = now;

    const customer = state.customers.get(order.customerId);
    if (customer) {
      customer.state = 'served';
      customer.servedAt = now;
    }

    state.day.served += ONE;
    state.day.waitTicks += now - order.placedAt;
  }
}

/** Mean wait in game minutes. Zero covers reads as zero, not NaN. */
export function meanWaitMinutes(waitTicks: number, served: number): number {
  if (served <= NONE) return NONE;
  return ((waitTicks / served) * GAME_SECONDS_PER_TICK) / TIME.SECONDS_PER_MINUTE;
}
