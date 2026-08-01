/**
 * Who walks in, and when. DESIGN.md §6.1.
 *
 * Arrivals are a **Poisson process**, not a metronome. That is the single most
 * consequential choice in this system: fourteen customers an hour arriving
 * evenly is a kitchen that never struggles, and fourteen arriving in four
 * minutes is the game. Bursts are the content.
 *
 * Step 2 runs the first term of the §6.1 demand formula only — flat foot
 * traffic. Daypart and day-of-week curves, reputation, marketing, price
 * resistance and the pinned-at-zero competitor pressure all multiply into
 * `ratePerHour` at step 10, and nothing here changes when they do.
 */
import { DEMAND, type MenuMixEntry, type RushWindow } from '@/config/demand';
import { TIME } from '@/config/time';
import { TICKS_PER_GAME_HOUR } from '../clock';
import type { Rng } from '../rng';
import type { System, World } from '../world';
import { id, type ItemId, type OrderId, type RecipeId } from '../types';

const NONE = 0;
const ONE = 1;

export class ArrivalsSystem implements System {
  readonly name = 'arrivals';
  private rng: Rng | null = null;

  /**
   * Customers per game hour before any multiplier. Held on the system rather
   * than read per tick so the harness can vary it without touching config.
   */
  constructor(
    private readonly ratePerHourOverride: number | null = null,
    private readonly rush: RushWindow | null = null,
  ) {}

  private stream(world: World): Rng {
    // Forked once and kept. Re-forking each tick would hand back the same
    // sequence forever, because the root RNG never advances.
    this.rng ??= world.rngFor(this.name);
    return this.rng;
  }

  tick(world: World): void {
    if (!world.clock.isOpen) return;

    const base =
      this.ratePerHourOverride ?? DEMAND.FLAT_RATE_OVERRIDE ?? world.state.site.baseFootTraffic;
    const perHour = base * this.rushMultiplier(world.clock.hourOfDay);
    const lambda = perHour / TICKS_PER_GAME_HOUR;
    const arrivals = this.stream(world).poisson(lambda);
    for (let i = NONE; i < arrivals; i += ONE) this.walkIn(world);
  }

  /** Step 10 replaces this with the full daypart and day-of-week curves. */
  private rushMultiplier(hourOfDay: number): number {
    if (!this.rush) return ONE;
    const inWindow = hourOfDay >= this.rush.fromHour && hourOfDay < this.rush.toHour;
    return inWindow ? this.rush.multiplier : ONE;
  }

  /**
   * §6.3. A customer looks at the queue and decides. The estimate is the one
   * they can actually make from the footpath — how many people are ahead of
   * them — not anything the kitchen knows.
   */
  private balks(world: World): boolean {
    const queue = world.state.openOrders.length;
    const hands = Math.max(ONE, world.state.staff.length);
    const estWaitMinutes =
      (queue * (DEMAND.BALK.secondsPerQueuedPersonPerStaff / hands)) / TIME.SECONDS_PER_MINUTE;
    const over = estWaitMinutes - DEMAND.BALK.patienceMinutes;
    if (over <= NONE) return false;
    const p = Math.min(
      DEMAND.BALK.maxProbability,
      over / DEMAND.BALK.patienceWindowMinutes,
    );
    return this.stream(world).bool(p);
  }

  private walkIn(world: World): void {
    const state = world.state;
    if (this.balks(world)) {
      state.day.balked += ONE;
      state.balked += ONE;
      return;
    }
    const choice = pickFromMix(this.stream(world), DEMAND.MENU_MIX);
    const graph = state.graphs.get(id<RecipeId>(choice.recipeId));
    if (!graph) throw new Error(`Menu mix references unknown recipe: ${choice.recipeId}`);

    const now = world.clock.now as number;
    const customerId = `c${state.counters.customer++}`;
    const orderId = id<OrderId>(`o${state.counters.order++}`);

    state.orders.set(orderId, {
      id: orderId,
      customerId,
      placedAt: now,
      lines: [
        {
          recipeId: graph.recipeId,
          item: graph.finishedItem as ItemId,
          quantity: choice.quantity,
          fulfilled: NONE,
        },
      ],
      state: 'open',
      servedAt: null,
      qualitySum: NONE,
      qualityUnits: NONE,
    });
    state.openOrders.push(orderId);
    state.customers.set(customerId, {
      id: customerId,
      arrivedAt: now,
      orderId,
      state: 'waiting',
      servedAt: null,
    });
    state.day.arrived += ONE;
  }
}

/** Weighted pick. Weights need not sum to one. */
export function pickFromMix(rng: Rng, mix: readonly MenuMixEntry[]): MenuMixEntry {
  const total = mix.reduce((sum, entry) => sum + entry.weight, NONE);
  let roll = rng.next() * total;
  for (const entry of mix) {
    roll -= entry.weight;
    if (roll <= NONE) return entry;
  }
  return mix[mix.length - ONE] as MenuMixEntry;
}
