/**
 * One place that assembles a running world.
 *
 * The CLI, the tests and the balance harness must all build the simulation the
 * same way, because system registration order changes the RNG consumption
 * order and therefore every balance number. A scenario built by hand in three
 * places is three simulations that agree until the day they don't.
 */
import type { RushWindow } from '@/config/demand';
import { ArrivalsSystem } from './systems/arrivals';
import { KitchenSystem } from './systems/kitchen';
import { ServiceSystem } from './systems/service';
import { World, type WorldOptions } from './world';

export interface ScenarioOptions extends WorldOptions {
  /** Customers per game hour. Defaults to the site's own foot traffic. */
  arrivalsPerHour?: number | null;
  /** A demand spike to cook ahead of. Step 10 replaces this with real curves. */
  rush?: RushWindow | null;
}

/**
 * Registration order is load-bearing and deliberate:
 *
 *   arrivals — people walk in before anything can be made for them
 *   kitchen  — work advances, and new work starts
 *   service  — whatever reached the pass this tick goes out this tick
 *
 * Putting service first would add a full tick of latency to every order for
 * no reason anyone could later find.
 */
export function buildScenario(opts: ScenarioOptions): World {
  const world = new World(opts);
  world
    .register(new ArrivalsSystem(opts.arrivalsPerHour ?? null, opts.rush ?? null))
    .register(new KitchenSystem())
    .register(new ServiceSystem());
  return world;
}
