/**
 * The kitchen as a factory. DESIGN.md §7, §7.1, §7.3, §14.1.
 *
 * ## The tick is a budget, not a step
 *
 * A staffer gets twelve game seconds per tick and spends them; a job that
 * finishes with budget left releases the rest into the next job in the same
 * tick. Advancing one job by one whole dt per tick would make every step cost
 * at least twelve seconds regardless of the recipe, flattening the difference
 * between a 6s plate and a 195s fryer basket — and making walking free, which
 * would delete design pillar one outright.
 *
 * ## A job is six phases, and only four of them hold a person
 *
 *   travel  -> walk to the station                         staff
 *   setup   -> load it                                     staff + station
 *   cooking -> it cooks                                    station only
 *   recall  -> walk back to it                             staff
 *   finish  -> tend and unload                             staff + station
 *   carry   -> deliver the output to whatever consumes it  staff
 *
 * **The staffer is released during `cooking`.** That is §14.1 and it is the
 * premise of the entire automation ladder: a grill patty is ninety seconds of
 * cooking and twenty-two seconds of human attention, so removing the attention
 * lets one person run three grills. Automation buys back attention, not time.
 *
 * It also means a cooked item can sit on an unattended station waiting for
 * someone to come back. If the step `canLapse`, it spoils while it waits —
 * which is why finishing outranks starting (`RESCUE_LAPSING_FIRST`).
 *
 * ## The scheduler pulls, it does not push
 *
 * Work nearest the customer starts first (`RecipeGraph.pull`). A scheduler
 * that services the deepest unmet requirement instead makes patties forever
 * while nothing reaches the pass: measured at 45 arrivals/hr, pull serves 86%
 * of them and push serves 4%.
 *
 * ## Batches are sized to need, unless you have set a par level
 *
 * Cooking more than is needed is par-cooking. It buys wait time and it buys
 * waste, and which one dominates depends on whether the rush you cooked for
 * turns up. That is a decision, so it lives in config as `PAR_LEVELS` and is
 * off by default — never the scheduler's own idea.
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

/**
 * How a step's elapsed duration divides into staffed and unstaffed time.
 * §14.1. Tend sits inside the cook window because that is what tending is —
 * you flip it while it is cooking — so the three parts still sum to `duration`
 * and no time is invented.
 */
export function attentionSplit(step: Step): {
  setup: number;
  cook: number;
  finish: number;
} {
  const { setupSeconds, tendSeconds, teardownSeconds } = step.attention;
  if (!KITCHEN.UNATTENDED_COOKING) {
    return { setup: step.duration, cook: NONE, finish: NONE };
  }
  const finish = tendSeconds + teardownSeconds;
  const cook = Math.max(NONE, step.duration - setupSeconds - finish);
  return { setup: setupSeconds, cook, finish };
}

/**
 * How long an item stays good, given the holding cabinets you own. §14.2.
 * Items with no freshness window (assembled burgers waiting at the pass are
 * handled by wait time, not staleness) are unaffected.
 */
export function freshnessWith(
  base: number | undefined,
  holdingCabinets: number,
): number | undefined {
  if (base === undefined) return undefined;
  if (holdingCabinets <= NONE) return base;
  return base * KITCHEN.HOLDING_CABINET_FRESHNESS_MULTIPLIER ** holdingCabinets;
}

/** Where someone is, partway through a walking leg. */
function stride(staff: Staff, from: Tile, to: Tile, total: number, remaining: number): void {
  if (total <= NONE) return;
  const done = Math.min(ONE, Math.max(NONE, ONE - remaining / total));
  staff.x = from.x + (to.x - from.x) * done;
  staff.y = from.y + (to.y - from.y) * done;
}

function settle(staff: Staff, at: Tile): void {
  staff.tile = at;
  staff.x = at.x;
  staff.y = at.y;
}

export class KitchenSystem implements System {
  readonly name = 'kitchen';

  tick(world: World): void {
    const state = world.state;
    const budget = new Map<StaffId, number>();
    for (const staff of state.staff) budget.set(staff.id, GAME_SECONDS_PER_TICK);

    const now = world.clock.now as number;
    const nowSeconds = now * GAME_SECONDS_PER_TICK;

    // Unattended cooking advances ONCE per tick, before anything else.
    //
    // It must not sit inside the interleave loop below. That loop runs until
    // nobody can make further progress, so a cooking branch inside it would
    // advance the same fryer basket once per pass — up to sixty-four times a
    // tick. Measured before this was pulled out: the fryer logged 123% of
    // trading hours against work that implied 49%.
    this.advanceCooking(state);

    let passes = NONE;
    for (;;) {
      const worked = this.advanceJobs(state, budget, nowSeconds);
      const rescued = this.assignFinishers(state, budget);
      const started = this.schedule(state, budget, now);
      if (!worked && !rescued && !started) break;
      if (++passes >= MAX_PASSES) break;
    }

    this.binWaste(state, nowSeconds);
  }

  onClose(world: World): void {
    const day = world.state.day;
    world.record('batches', day.batches);
    world.record('units', day.unitsProduced);
    world.record('waste', day.wasteUnits);
    world.record('walkMin', (day.walkSeconds / KITCHEN.SECONDS_PER_MINUTE).toFixed(ONE));
    const busy = day.walkSeconds + day.workSeconds;
    world.record(
      'walkShare',
      busy > NONE ? `${((day.walkSeconds / busy) * 100).toFixed(ONE)}%` : '0%',
    );
  }

  // --- Working ----------------------------------------------------------

  /**
   * Everything that happens whether or not a person is present: food cooking
   * on an unattended station, and cooked food going off while it waits for
   * someone to come back for it. Exactly one tick's worth, once per tick.
   */
  private advanceCooking(state: SimState): void {
    for (const job of state.jobs.values()) {
      if (job.phase === 'cooking') {
        const station = state.stations.find((s) => s.id === job.stationId);
        if (!station) continue;
        const rate = station.speedMultiplier;
        // Charge the station only for the cooking it actually did, so a
        // basket with four seconds left does not bill a whole tick.
        const spent = Math.min(GAME_SECONDS_PER_TICK, job.cookRemaining / rate);
        job.cookRemaining -= spent * rate;
        station.runSeconds += spent;
        if (job.cookRemaining <= EPSILON) job.phase = 'recall';
        continue;
      }

      // Cooked, unattended, waiting for someone to come back for it.
      if (job.phase === 'recall' && job.staffId === null) {
        job.lapseSeconds += GAME_SECONDS_PER_TICK;
        if (job.canLapse && job.lapseSeconds > KITCHEN.LAPSE_GRACE_SECONDS) {
          job.quality = Math.max(
            NONE,
            job.quality - GAME_SECONDS_PER_TICK * KITCHEN.LAPSE_QUALITY_LOSS_PER_SECOND,
          );
        }
      }
    }
  }

  private advanceJobs(
    state: SimState,
    budget: Map<StaffId, number>,
    nowSeconds: number,
  ): boolean {
    let any = false;
    const finished: Job[] = [];

    for (const job of state.jobs.values()) {
      const station = state.stations.find((s) => s.id === job.stationId);
      if (!station) continue;
      if (job.phase === 'cooking') continue;
      if (job.staffId === null) continue;
      const staff = state.staff.find((s) => s.id === job.staffId);
      if (!staff) continue;

      let available = budget.get(staff.id) ?? NONE;
      if (available <= EPSILON) continue;

      const walk = (seconds: number): void => {
        staff.walkSeconds += seconds;
        staff.shiftSeconds += seconds;
        state.day.walkSeconds += seconds;
      };
      const work = (seconds: number): void => {
        station.runSeconds += seconds;
        staff.shiftSeconds += seconds;
        state.day.workSeconds += seconds;
      };

      if (job.phase === 'travel' || job.phase === 'recall') {
        const spent = Math.min(available, job.travelRemaining);
        job.travelRemaining -= spent;
        available -= spent;
        walk(spent);
        any = any || spent > EPSILON;
        stride(staff, job.legFrom, job.workTile, job.legSeconds, job.travelRemaining);
        if (job.travelRemaining <= EPSILON) {
          settle(staff, job.workTile);
          job.phase = job.phase === 'travel' ? 'setup' : 'finish';
        }
      }

      const rate = station.speedMultiplier * staff.skill;

      if (job.phase === 'setup' && available > EPSILON) {
        const spent = Math.min(available, job.setupRemaining / rate);
        job.setupRemaining -= spent * rate;
        available -= spent;
        work(spent);
        any = any || spent > EPSILON;
        if (job.setupRemaining <= EPSILON) {
          if (job.cookRemaining > EPSILON) {
            // Loaded and left to cook. The staffer is free — this is the line
            // that makes the automation ladder mean something.
            job.phase = 'cooking';
            staff.jobId = null;
            job.staffId = null;
            continue;
          }
          job.phase = 'finish';
        }
      }

      if (job.phase === 'finish' && available > EPSILON) {
        const spent = Math.min(available, job.finishRemaining / rate);
        job.finishRemaining -= spent * rate;
        available -= spent;
        work(spent);
        any = any || spent > EPSILON;
        if (job.finishRemaining <= EPSILON) {
          station.jobId = null;
          job.phase = 'carry';
          job.legFrom = { x: staff.x, y: staff.y };
          job.legSeconds = job.carryRemaining;
        }
      }

      if (job.phase === 'carry' && available > EPSILON) {
        const spent = Math.min(available, job.carryRemaining);
        job.carryRemaining -= spent;
        available -= spent;
        walk(spent);
        any = any || spent > EPSILON;
        if (job.deliverTile) {
          stride(staff, job.legFrom, job.deliverTile, job.legSeconds, job.carryRemaining);
        }
        if (job.carryRemaining <= EPSILON) {
          if (job.deliverTile) settle(staff, job.deliverTile);
          finished.push(job);
        }
      }

      budget.set(staff.id, available);
    }

    for (const job of finished) this.deliver(state, job, nowSeconds);
    return any;
  }

  /** The output only exists once someone has carried it to where it is used. */
  private deliver(state: SimState, job: Job, nowSeconds: number): void {
    // A lapsed item is born stale: it enters the buffer already partway
    // through its freshness window rather than at full quality.
    const lost = ONE - job.quality;
    const freshFor = job.freshnessWindow;
    const bornAt = freshFor === undefined ? nowSeconds : nowSeconds - lost * freshFor;

    state.stock.add(job.output, job.batch, bornAt, freshFor);
    state.day.batches += ONE;

    const graph = state.graphs.get(job.recipeId);
    if (graph && graph.finishedItem === job.output) state.day.unitsProduced += job.batch;

    const station = state.stations.find((s) => s.id === job.stationId);
    if (station && station.jobId === job.id) station.jobId = null;
    if (job.staffId !== null) {
      const staff = state.staff.find((s) => s.id === job.staffId);
      if (staff) staff.jobId = null;
    }
    state.jobs.delete(job.id);
  }

  private binWaste(state: SimState, nowSeconds: number): void {
    const binned = state.stock.binExpired(nowSeconds);
    for (const units of binned.values()) state.day.wasteUnits += units;
  }

  // --- Coming back for what is already cooked ---------------------------

  /**
   * Jobs sitting cooked and unattended get a person before anything new is
   * started. Most urgent first: what is actually spoiling, then what is
   * nearest the customer, then whoever has waited longest.
   */
  private assignFinishers(state: SimState, budget: Map<StaffId, number>): boolean {
    if (!KITCHEN.RESCUE_LAPSING_FIRST) return false;

    const waiting = [...state.jobs.values()]
      .filter((j) => j.phase === 'recall' && j.staffId === null)
      .sort(
        (a, b) =>
          Number(b.canLapse) - Number(a.canLapse) ||
          a.depth - b.depth ||
          b.lapseSeconds - a.lapseSeconds ||
          a.id.localeCompare(b.id),
      );

    let any = false;
    for (const job of waiting) {
      const staff = state.staff.find(
        (s) => isStaffFree(s) && (budget.get(s.id) ?? NONE) > EPSILON,
      );
      if (!staff) break;
      const tiles = state.floor.pathTiles(staff.tile, job.workTile);
      if (!Number.isFinite(tiles)) continue;
      job.staffId = staff.id;
      staff.jobId = job.id;
      job.travelRemaining = walkSeconds(tiles);
      job.legFrom = { x: staff.x, y: staff.y };
      job.legSeconds = job.travelRemaining;
      any = true;
    }
    return any;
  }

  // --- Choosing what to make next ---------------------------------------

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
        const par = state.parLevels[step.output as string] ?? NONE;
        const gross = Math.max(required.get(step.output) ?? NONE, par);
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
        const station = this.nearestStation(state, candidate.step.station, staff.tile, true);
        if (!station) break;

        const batch = this.batchSize(state, candidate);
        if (batch < ONE) break;

        const opened = this.open(state, candidate, station.station, staff, batch, now, station.at);
        if (!opened) break;

        for (const input of candidate.graph.inputsOf(candidate.step.id)) {
          state.stock.take(input, batch, now * GAME_SECONDS_PER_TICK);
        }
        candidate.net -= batch;
        started = true;
      }
    }

    return started;
  }

  /**
   * The nearest station of a type. `freeOnly` distinguishes somewhere to work
   * (must be free) from somewhere to deliver (you carry patties to the
   * assembly bench even if someone is standing at it).
   */
  private nearestStation(
    state: SimState,
    type: Step['station'],
    from: Tile,
    freeOnly: boolean,
  ): { station: Station; at: Tile; tiles: number } | null {
    let best: { station: Station; at: Tile; tiles: number } | null = null;
    for (const station of state.stations) {
      if (station.type !== type) continue;
      if (freeOnly && !isStationFree(station)) continue;
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
      ? this.nearestStation(state, consumer.station, workTile, false)
      : null;
    const carryTiles = delivery ? state.floor.pathTiles(workTile, delivery.at) : NONE;
    const split = attentionSplit(candidate.step);
    // Holding cabinets extend how long the output stays good. §14.2 tier 1 —
    // they buy nothing on their own, only in combination with a decision to
    // cook ahead.
    const freshFor = freshnessWith(candidate.step.freshnessWindow, state.holdingCabinets);

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
      legFrom: { x: staff.x, y: staff.y },
      legSeconds: walkSeconds(travelTiles),
      setupRemaining: split.setup,
      cookRemaining: split.cook,
      finishRemaining: split.finish,
      lapseSeconds: NONE,
      canLapse: candidate.step.attention.canLapse,
      quality: ONE,
      freshnessWindow: freshFor,
      depth: candidate.depth,
      carryRemaining: Number.isFinite(carryTiles) ? walkSeconds(carryTiles) : NONE,
      workTile,
      deliverTile: delivery?.at ?? null,
    };
    state.jobs.set(jobId, job);
    station.jobId = jobId;
    staff.jobId = jobId;
    return true;
  }
}
