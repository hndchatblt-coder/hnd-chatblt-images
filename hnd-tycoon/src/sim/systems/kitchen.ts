/**
 * The kitchen as a factory. DESIGN.md §7, §7.1.
 *
 * Two things happen every tick, interleaved:
 *
 *   1. Jobs in progress consume each staffer's tick budget.
 *   2. Free staff and free stations pull the next batch off the requirement
 *      explosion.
 *
 * **The tick is a budget, not a step.** A staffer gets twelve game seconds per
 * tick and spends them; if a six-second plate finishes with six seconds left,
 * those six seconds start the next job in the same tick. Doing it the naive
 * way — one job advanced by one whole dt per tick — makes every step cost at
 * least twelve seconds regardless of what the recipe says, which silently
 * flattens the difference between a 6s plate and a 195s fryer basket. That
 * difference is the game. It also makes walking free, which would delete
 * design pillar one outright.
 *
 * **A job is walk there, work, carry it onward.** The two walking phases are
 * charged against the same budget as the work, which is what makes the
 * distance between dependent stations a throughput tax rather than a diagram.
 *
 * **The scheduler pulls, it does not push.** Work nearest the customer starts
 * first (`RecipeGraph.pull`). A scheduler that services the deepest unmet
 * requirement instead makes patties forever while nothing reaches the pass:
 * measured at 45 arrivals/hr, pull serves 86% of them and push serves 4%.
 *
 * **A batch is sized to outstanding need**, capped by equipment capacity and
 * by what is actually in the buffer. Cooking more than is needed is
 * par-cooking, and that is a decision the player makes at step 4, deliberately
 * and at a cost. It must never be the default.
 */
import { KITCHEN } from '@/config/kitchen';
import { walkSeconds } from '@/config/stations';
import type { Step } from '@/config/recipes';
import { GAME_SECONDS_PER_TICK } from '../clock';
import type { Tile } from '../floor';
import type { RecipeGraph } from '../recipeGraph';
import { isStationFree, type Job, type Station } from '../entities/station';
import { isStaffFree, type Staff } from '../entities/staff';
import type { SimState } from '../state';
import type { System, World } from '../world';
import type { ItemId, StaffId } from '../types';

const NONE = 0;
const ONE = 1;
const EPSILON = KITCHEN.EPSILON;
const MAX_PASSES = KITCHEN.MAX_SCHEDULER_PASSES;

interface Candidate {
  readonly graph: RecipeGraph;
  readonly step: Step;
  net: number;
  readonly depth: number;
}

export class KitchenSystem implements System {
  readonly name = 'kitchen';

  tick(world: World): void {
    const state = world.state;
    const budget = new Map<StaffId, number>();
    for (const staff of state.staff) budget.set(staff.id, GAME_SECONDS_PER_TICK);

    const now = world.clock.now as number;
    let passes = NONE;
    for (;;) {
      const worked = this.advanceJobs(state, budget);
      const started = this.schedule(state, budget, now);
      if (!worked && !started) break;
      if (++passes >= MAX_PASSES) break;
    }
  }

  onClose(world: World): void {
    const day = world.state.day;
    world.record('batches', day.batches);
    world.record('units', day.unitsProduced);
    world.record('walkMin', (day.walkSeconds / KITCHEN.SECONDS_PER_MINUTE).toFixed(ONE));
    const busy = day.walkSeconds + day.workSeconds;
    world.record(
      'walkShare',
      busy > NONE ? `${((day.walkSeconds / busy) * 100).toFixed(ONE)}%` : '0%',
    );
  }

  // --- Working ----------------------------------------------------------

  private advanceJobs(state: SimState, budget: Map<StaffId, number>): boolean {
    let any = false;
    const finished: Job[] = [];

    for (const job of state.jobs.values()) {
      const staff = state.staff.find((s) => s.id === job.staffId);
      const station = state.stations.find((s) => s.id === job.stationId);
      if (!staff || !station) continue;

      let available = budget.get(job.staffId) ?? NONE;
      if (available <= EPSILON) continue;

      // Walking to the station. Charged before a second of work happens.
      if (job.phase === 'travel') {
        const spent = Math.min(available, job.travelRemaining);
        job.travelRemaining -= spent;
        available -= spent;
        staff.walkSeconds += spent;
        staff.shiftSeconds += spent;
        state.day.walkSeconds += spent;
        any = any || spent > EPSILON;
        if (job.travelRemaining <= EPSILON) {
          staff.tile = job.workTile;
          job.phase = 'work';
        }
      }

      if (job.phase === 'work' && available > EPSILON) {
        const rate = station.speedMultiplier * staff.skill;
        const spent = Math.min(available, job.remainingSeconds / rate);
        job.remainingSeconds -= spent * rate;
        available -= spent;
        station.runSeconds += spent;
        staff.shiftSeconds += spent;
        state.day.workSeconds += spent;
        any = any || spent > EPSILON;
        if (job.remainingSeconds <= EPSILON) {
          // The station is free the moment the food comes off it. The staffer
          // is not — they are still holding four patties.
          station.jobId = null;
          job.phase = 'carry';
        }
      }

      if (job.phase === 'carry') {
        const spent = Math.min(available, job.carryRemaining);
        job.carryRemaining -= spent;
        available -= spent;
        staff.walkSeconds += spent;
        staff.shiftSeconds += spent;
        state.day.walkSeconds += spent;
        any = any || spent > EPSILON;
        if (job.carryRemaining <= EPSILON) {
          if (job.deliverTile) staff.tile = job.deliverTile;
          finished.push(job);
        }
      }

      budget.set(job.staffId, available);
    }

    for (const job of finished) this.deliver(state, job);
    return any;
  }

  /** The output only exists once someone has carried it to where it is used. */
  private deliver(state: SimState, job: Job): void {
    state.stock.add(job.output, job.batch);
    state.day.batches += ONE;

    const graph = state.graphs.get(job.recipeId);
    if (graph && graph.finishedItem === job.output) state.day.unitsProduced += job.batch;

    const station = state.stations.find((s) => s.id === job.stationId);
    if (station && station.jobId === job.id) station.jobId = null;
    const staff = state.staff.find((s) => s.id === job.staffId);
    if (staff) staff.jobId = null;
    state.jobs.delete(job.id);
  }

  // --- Choosing what to make next ---------------------------------------

  /**
   * Explodes open orders into a per-item requirement down each recipe DAG,
   * netting off what is already in the buffer and already being cooked, then
   * starts whatever the line can actually start right now.
   */
  private schedule(state: SimState, budget: Map<StaffId, number>, now: number): boolean {
    const required = new Map<ItemId, number>();

    for (const orderId of state.openOrders) {
      const order = state.orders.get(orderId);
      if (!order) continue;
      for (const line of order.lines) {
        const outstanding = line.quantity - line.fulfilled;
        if (outstanding > NONE) {
          required.set(line.item, (required.get(line.item) ?? NONE) + outstanding);
        }
      }
    }

    const inflight = new Map<ItemId, number>();
    for (const job of state.jobs.values()) {
      inflight.set(job.output, (inflight.get(job.output) ?? NONE) + job.batch);
    }

    const candidates: Candidate[] = [];
    for (const graph of state.graphs.values()) {
      // `pull` is shallowest-first, which means a step's own requirement has
      // always been contributed by its dependents before it is reached.
      for (const step of graph.pull) {
        const gross = required.get(step.output) ?? NONE;
        const net = gross - state.stock.count(step.output) - (inflight.get(step.output) ?? NONE);
        if (net <= NONE) continue;
        for (const input of graph.inputsOf(step.id)) {
          required.set(input, (required.get(input) ?? NONE) + net);
        }
        candidates.push({ graph, step, net, depth: graph.depth.get(step.id) ?? NONE });
      }
    }

    // Across recipes as well as within one: nearest the customer first, ties
    // broken by name so the schedule never depends on Map iteration order.
    //
    // The flag exists so the alternative is measurable rather than arguable.
    const direction = KITCHEN.PULL_SHALLOWEST_FIRST ? ONE : -ONE;
    candidates.sort(
      (a, b) =>
        direction * (a.depth - b.depth) ||
        String(a.graph.recipeId).localeCompare(String(b.graph.recipeId)) ||
        a.step.id.localeCompare(b.step.id),
    );

    let started = false;
    for (const candidate of candidates) {
      while (candidate.net > NONE) {
        const staff = state.staff.find(
          (s) => isStaffFree(s) && (budget.get(s.id) ?? NONE) > EPSILON,
        );
        if (!staff) break;

        // Nearest free station of the right type, measured from where this
        // person is actually standing — not the first one in the array.
        const station = this.nearestFreeStation(state, candidate.step.station, staff.tile);
        if (!station) break;

        const batch = this.batchSize(state, candidate);
        if (batch < ONE) break;

        const opened = this.open(state, candidate, station.station, staff, batch, now, station.at);
        if (!opened) break;

        for (const input of candidate.graph.inputsOf(candidate.step.id)) {
          state.stock.take(input, batch);
        }
        candidate.net -= batch;
        started = true;
      }
    }

    return started;
  }

  private nearestFreeStation(
    state: SimState,
    type: Step['station'],
    from: Tile,
  ): { station: Station; at: Tile; tiles: number } | null {
    let best: { station: Station; at: Tile; tiles: number } | null = null;
    for (const station of state.stations) {
      if (station.type !== type || !isStationFree(station)) continue;
      const access = state.floor.nearestAccess(from, station.id);
      if (access.at === null || !Number.isFinite(access.tiles)) continue;
      if (best === null || access.tiles < best.tiles) {
        best = { station, at: access.at, tiles: access.tiles };
      }
    }
    return best;
  }

  /** Capacity, need and what is actually in the buffer — whichever binds first. */
  private batchSize(state: SimState, candidate: Candidate): number {
    const capacity = candidate.step.batchSize;
    let batch = KITCHEN.BATCH_TO_NEED ? Math.min(capacity, Math.ceil(candidate.net)) : capacity;
    for (const input of candidate.graph.inputsOf(candidate.step.id)) {
      batch = Math.min(batch, state.stock.count(input));
    }
    return batch;
  }

  private open(
    state: SimState,
    candidate: Candidate,
    station: Station,
    staff: Staff,
    batch: number,
    now: number,
    workTile: Tile,
  ): boolean {
    const travelTiles = state.floor.pathTiles(staff.tile, workTile);
    if (!Number.isFinite(travelTiles)) return false;

    // Where this output goes next: the station that runs the step consuming
    // it. The finished item goes nowhere — the customer collects it.
    const consumer = candidate.graph.consumerOf.get(candidate.step.output);
    const delivery = consumer
      ? this.nearestFreeOrAnyStation(state, consumer.station, workTile)
      : null;
    const carryTiles = delivery ? state.floor.pathTiles(workTile, delivery.at) : NONE;

    const jobId = `j${state.counters.job++}`;
    const job: Job = {
      id: jobId,
      recipeId: candidate.graph.recipeId,
      stepId: candidate.step.id,
      stationId: station.id,
      staffId: staff.id,
      batch,
      output: candidate.step.output,
      startedAt: now,
      phase: 'travel',
      travelRemaining: walkSeconds(travelTiles),
      remainingSeconds: candidate.step.duration,
      carryRemaining: Number.isFinite(carryTiles) ? walkSeconds(carryTiles) : NONE,
      workTile,
      deliverTile: delivery?.at ?? null,
    };
    state.jobs.set(jobId, job);
    station.jobId = jobId;
    staff.jobId = jobId;
    return true;
  }

  /**
   * The nearest station of a type regardless of whether it is busy — you carry
   * patties to the assembly bench even if someone is using it.
   */
  private nearestFreeOrAnyStation(
    state: SimState,
    type: Step['station'],
    from: Tile,
  ): { station: Station; at: Tile } | null {
    let best: { station: Station; at: Tile; tiles: number } | null = null;
    for (const station of state.stations) {
      if (station.type !== type) continue;
      const access = state.floor.nearestAccess(from, station.id);
      if (access.at === null || !Number.isFinite(access.tiles)) continue;
      if (best === null || access.tiles < best.tiles) {
        best = { station, at: access.at, tiles: access.tiles };
      }
    }
    return best;
  }
}
