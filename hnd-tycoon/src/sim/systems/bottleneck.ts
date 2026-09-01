/**
 * What is actually holding you back. DESIGN.md §13.
 *
 * *"Factory players describe their loop as moving bottleneck to bottleneck —
 * find the binding constraint, fix it, find the next. That only works if the
 * constraint is findable. In a 2D factory you look at where the belt backs up.
 * In a restaurant, in portrait, at 4x speed, you cannot. So the game names
 * it."*
 *
 * Two things this must get right, and both are easy to get wrong:
 *
 * **It reports the BINDING constraint, not the busiest thing.** A grill at
 * 100% with nothing waiting on it is fine — it is perfectly sized. A grill at
 * 80% with assembly starved is the problem. Utilisation alone would name the
 * first and miss the second.
 *
 * **Non-station answers are the interesting ones.** *Not enough hands*, *walk
 * distance*, *demand is the constraint — you have capacity spare*. A readout
 * that can only ever blame a station will send the player to buy equipment
 * they do not need, which is worse than saying nothing.
 *
 * §26: this is a general constraint-attribution service over the sim graph,
 * not a set of kitchen heuristics. In Act II the answer becomes "Rosebery's
 * Tuesday delivery window"; in Act III, "franchisee variance in the western
 * region". The shape of the computation does not change — only what registers
 * itself as a claimant.
 */
import { BOTTLENECK } from '@/config/bottleneck';
import { STATION_SPECS } from '@/config/stations';
import { TIME } from '@/config/time';
import type { StationType } from '@/config/recipes';
import type { SimState } from '../state';
import type { System, World } from '../world';

const NONE = 0;
const ONE = 1;

/** Anything that can be the answer. Stations are only one kind. */
export type ConstraintKind = 'station' | 'staff' | 'space' | 'demand';

export interface Constraint {
  readonly kind: ConstraintKind;
  /** What to say. One line, plain English, always quantified. §13. */
  readonly line: string;
  /** Covers per day this is costing. Zero when demand is the constraint. */
  readonly coversPerDay: number;
  /** 0..1. How hard this claimant is pressed. */
  readonly pressure: number;
  /** For the UI to open the right panel on tap. */
  readonly subject?: string;
}

interface Claimant {
  readonly kind: ConstraintKind;
  readonly subject: string;
  /** 0..1 utilisation. */
  readonly pressure: number;
  /** True if something downstream is waiting on this. §13's "binding" test. */
  readonly starving: boolean;
  readonly describe: (coversLost: number) => string;
}

export class BottleneckSystem implements System {
  readonly name = 'bottleneck';

  onClose(world: World): void {
    const constraint = attribute(world.state, world.clock.tradingHoursToday);
    world.state.bottleneck = constraint;
    world.record('bottleneck', constraint.line);
  }

  /** Kept fresh during the day too, so the HUD line is live rather than daily. */
  tick(world: World): void {
    if (!world.clock.isOpen) return;
    const ticks = world.clock.now as number;
    if (ticks % BOTTLENECK.RECOMPUTE_EVERY_TICKS !== NONE) return;
    world.state.bottleneck = attribute(world.state, Math.max(ONE, world.clock.hoursOpenToday));
  }
}

/**
 * The whole readout, as one pure function so it can be hand-checked against a
 * constructed scenario — which is exactly what step 8's gate asks for.
 */
export function attribute(state: SimState, hoursElapsed: number): Constraint {
  const seconds = Math.max(ONE, hoursElapsed * TIME.SECONDS_PER_HOUR);
  const day = state.day;

  // Covers you did not serve. The queue is the evidence; everything below is
  // an argument about whose fault it is.
  //
  // Extrapolating to a day rate is only honest once there is a day to
  // extrapolate from. Twenty minutes in, three people in the queue becomes
  // "costing 89 covers a day" — nonsense, stated with total confidence, in the
  // one line the player is meant to trust.
  // Balkers never became arrivals, so they are invisible to `arrived - served`.
  // They are also exactly the covers the player is losing, which makes them
  // the most important half of this number.
  const unserved = Math.max(NONE, day.arrived - day.served) + day.balked;
  const coversLost =
    hoursElapsed >= BOTTLENECK.MIN_HOURS_TO_EXTRAPOLATE
      ? Math.round(unserved * (state.site.tradingHoursPerDay / hoursElapsed))
      : NONE;

  const claimants: Claimant[] = [];

  // --- Stations ---------------------------------------------------------
  const byType = new Map<StationType, { run: number; count: number }>();
  for (const station of state.stations) {
    const entry = byType.get(station.type) ?? { run: NONE, count: NONE };
    entry.run += station.runSeconds;
    entry.count += ONE;
    byType.set(station.type, entry);
  }

  // Is anything waiting on this station type right now? That is the difference
  // between "busy" and "binding".
  const waitingOn = new Set<StationType>();
  for (const graph of state.graphs.values()) {
    for (const step of graph.pull) {
      const held = state.stock.count(step.output);
      const consumer = graph.consumerOf.get(step.output);
      if (held > NONE || !consumer) continue;
      // Nothing of this item in the buffer and something downstream wants it.
      waitingOn.add(step.station);
    }
  }

  for (const [type, entry] of byType) {
    const utilisation = entry.run / (seconds * entry.count);
    claimants.push({
      kind: 'station',
      subject: type,
      pressure: Math.min(ONE, utilisation),
      starving: waitingOn.has(type),
      describe: (lost) =>
        `${STATION_SPECS[type].label} is your constraint — ${pct(utilisation)} of service` +
        (lost > NONE ? `, costing about ${lost} covers a day` : ''),
    });
  }

  // --- Hands ------------------------------------------------------------
  const shift = state.staff.reduce((a, s) => a + s.shiftSeconds, NONE);
  const onToday = Math.max(NONE, state.onToday);
  const staffPressure = onToday ? shift / (seconds * onToday) : NONE;
  claimants.push({
    kind: 'staff',
    subject: 'staff',
    pressure: Math.min(ONE, staffPressure),
    starving: waitingOn.size > NONE,
    describe: (lost) =>
      `Not enough hands — ${onToday === ONE ? 'one person is' : `${onToday} people are`} ` +
      `${pct(staffPressure)} occupied` +
      (lost > NONE ? `, costing about ${lost} covers a day` : ''),
  });

  // --- The floor --------------------------------------------------------
  const walk = state.staff.reduce((a, s) => a + s.walkSeconds, NONE);
  const walkShare = shift > NONE ? walk / shift : NONE;
  claimants.push({
    kind: 'space',
    subject: 'walk',
    // Walking only becomes the answer once it is a large share of a busy day.
    pressure: walkShare > BOTTLENECK.WALK_SHARE_FLOOR ? staffPressure * walkShare * 2 : NONE,
    starving: false,
    describe: (lost) =>
      `Walking is your constraint — ${pct(walkShare)} of the shift is spent crossing the room` +
      (lost > NONE ? `, costing about ${lost} covers a day` : ''),
  });

  // --- Nobody's fault ---------------------------------------------------
  //
  // The signal to market, and the one a station-only readout can never give.
  //
  // If nothing is working hard, nothing is the constraint. Blaming a staffer
  // who is half idle is how a readout loses the player's trust in one line.
  //
  // But a queue out the door is never a demand problem, whatever the
  // utilisation numbers say — and saying "you have capacity spare" to someone
  // watching sixty people wait is worse than saying nothing at all. A real
  // queue overrides, and the readout falls through to whoever is most pressed.
  const pressed = claimants.filter((c) => c.pressure >= BOTTLENECK.PRESSURE_FLOOR);
  const queueing =
    state.openOrders.length > BOTTLENECK.QUEUE_IS_REAL || day.balked > BOTTLENECK.UNSERVED_FLOOR;
  if (pressed.length === NONE && !queueing) {
    const spare = Math.round((ONE - Math.max(staffPressure, NONE)) * 100);
    return {
      kind: 'demand',
      line: `Demand is your constraint — you have about ${spare}% capacity spare`,
      coversPerDay: NONE,
      pressure: staffPressure,
    };
  }

  // Binding beats busy: a claimant with something waiting on it outranks a
  // claimant that is merely working hard.
  const ranked = [...claimants].sort(
    (a, b) =>
      Number(b.starving) - Number(a.starving) ||
      b.pressure - a.pressure ||
      a.subject.localeCompare(b.subject),
  );
  const winner = ranked[NONE];
  if (!winner) {
    return { kind: 'demand', line: 'Nothing is holding you back', coversPerDay: NONE, pressure: NONE };
  }

  return {
    kind: winner.kind,
    line: winner.describe(coversLost),
    coversPerDay: coversLost,
    pressure: winner.pressure,
    subject: winner.subject,
  };
}

const pct = (n: number): string => `${Math.round(Math.max(NONE, Math.min(ONE, n)) * 100)}%`;
