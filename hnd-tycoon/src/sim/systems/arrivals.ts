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
import {
  DEMAND,
  daypartMultiplier,
  dayOfWeekMultiplier,
  type MenuMixEntry,
  type RushWindow,
} from '@/config/demand';
import { ARCHETYPES, ARCHETYPE_MEAN_QUANTITY, type Archetype } from '@/config/archetypes';
import { TIME } from '@/config/time';
import { TICKS_PER_GAME_HOUR } from '../clock';
import type { Rng } from '../rng';
import type { System, World } from '../world';
import { reviewBalk } from './reputation';
import { demandMultiplier } from './demand';
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
    // §6.1. Two more terms of the demand formula. Reputation, marketing, price
    // resistance and the pinned-at-zero competitor pressure multiply in here
    // too, and nothing else in this file changes when they do.
    const perHour =
      base *
      daypartMultiplier(world.clock.hourOfDay) *
      dayOfWeekMultiplier(world.clock.dayOfWeek) *
      demandMultiplier(world.state, world.state.stars) *
      this.rushMultiplier(world.clock.hourOfDay);
    // `baseFootTraffic` is COVERS per hour, not parties per hour. §6.2's table
    // of six is six of those covers arriving on one ticket, so the party rate
    // has to come down to keep the volume honest. See ARCHETYPE_MEAN_QUANTITY.
    const lambda = perHour / ARCHETYPE_MEAN_QUANTITY / TICKS_PER_GAME_HOUR;
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
   * §6.3, §6.2. A customer looks at the queue and decides. The estimate is the
   * one they can actually make from the footpath — how many people are ahead of
   * them — not anything the kitchen knows.
   *
   * Patience is per archetype and it is the whole of §6.2's teeth. The
   * app-speed customer runs a 1.4-minute fuse and the Regular a 6.4-minute one,
   * against the same queue: at a five-deep pass on one pair of hands you keep
   * the Regulars and lose the impulse trade, which is exactly the shop a slow
   * kitchen turns into.
   */
  private balks(world: World, archetype: Archetype): boolean {
    const queue = world.state.openOrders.length;
    const hands = Math.max(ONE, world.state.onToday);
    const estWaitMinutes =
      (queue * (DEMAND.BALK.secondsPerQueuedPersonPerStaff / hands)) / TIME.SECONDS_PER_MINUTE;
    const over = estWaitMinutes - DEMAND.BALK.patienceMinutes * archetype.patience;
    if (over <= NONE) return false;
    const p = Math.min(
      DEMAND.BALK.maxProbability,
      over / (DEMAND.BALK.patienceWindowMinutes * archetype.patience),
    );
    return this.stream(world).bool(p);
  }

  private walkIn(world: World): void {
    const state = world.state;
    // The archetype is chosen BEFORE the balk check, because who is standing on
    // the footpath is what decides whether they stay. Rolling it afterwards
    // would make every walkout an average customer and delete §6.2 from the
    // only place it changes an outcome.
    const archetype = pickArchetype(this.stream(world));

    if (this.balks(world, archetype)) {
      // Counted as one decision, not as `quantity` covers: this stat is the
      // arrival process seen from the door, and the Poisson gate reads it that
      // way. Lost covers are a revenue question, and the P&L already answers it.
      state.day.balked += ONE;
      state.balked += ONE;
      state.day.balkedBy[archetype.id] = (state.day.balkedBy[archetype.id] ?? NONE) + ONE;
      // Hand it to the screen. The stat is the receipt; this is the event, and
      // step 10 gates on the event being legible first.
      state.walkouts.push({
        id: state.counters.customer,
        archetypeId: archetype.id,
        queueLength: state.openOrders.length,
      });
      // Nothing is draining this in a headless run. Keep the newest few — a
      // renderer can only show a handful at once anyway, and an unbounded
      // array on a 70-day harness run is a leak with a design justification.
      if (state.walkouts.length > DEMAND.BALK.MAX_PENDING_WALKOUTS) {
        state.walkouts.splice(NONE, state.walkouts.length - DEMAND.BALK.MAX_PENDING_WALKOUTS);
      }
      // §6.3: a walkout leaves a two-star mark 6% of the time — scaled by how
      // loud this kind of customer is. The earliest warning the player gets
      // that the queue is costing them.
      reviewBalk(state, archetype.reviewRate);
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
      archetypeId: archetype.id,
      lines: [
        {
          recipeId: graph.recipeId,
          item: graph.finishedItem as ItemId,
          // A table of six is ONE ticket for six burgers, not six tickets. That
          // distinction is the dread: it hits the kitchen as a single
          // indivisible lump and it blocks the pass until all six exist.
          quantity: choice.quantity * archetype.quantity,
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
      archetypeId: archetype.id,
    });
    state.day.arrived += ONE;
  }
}

/** §6.2. Weighted pick over the archetype table. */
export function pickArchetype(rng: Rng): Archetype {
  const total = ARCHETYPES.reduce((sum, a) => sum + a.weight, NONE);
  let roll = rng.next() * total;
  for (const archetype of ARCHETYPES) {
    roll -= archetype.weight;
    if (roll <= NONE) return archetype;
  }
  return ARCHETYPES[ARCHETYPES.length - ONE] as Archetype;
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
