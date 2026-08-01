/**
 * Things going wrong, and staying wrong until you deal with them. §9.
 *
 * **There is no timer in this file.** An incident opens, degrades at a rate you
 * can read, and waits. Nothing expires, nothing punishes you for being at work,
 * and nothing requires you to be holding the phone at a particular moment —
 * §5.3 makes that a pillar, and a "respond within two hours or lose the day"
 * mechanic is the single most common way an idle game breaks it.
 *
 * What replaces the timer is `severityPerDay`. The fryer that has been limping
 * for a week is limping much worse than the one that broke this morning, and it
 * costs more to put right *because of what it did in between*.
 */
import { INCIDENTS, INCIDENT_RULES, type IncidentSpec } from '@/config/incidents';
import { AMBIENCE_POINTS, ambienceBonus, ambienceSpendBonus } from '@/config/ambience';
import type { Rng } from '../rng';
import type { SimState } from '../state';
import type { System, World } from '../world';

const NONE = 0;
const ONE = 1;

export interface Incident {
  readonly id: string;
  readonly specId: string;
  /** Game day it opened. Only used for the readout — severity is the mechanic. */
  readonly openedOn: number;
  /** Which station is affected, when the spec names a type. */
  readonly stationId: string | null;
  /** Which staffer is off, when the spec is an absence. */
  readonly staffId: string | null;
  /** 0..maxSeverity. Grows every day it is left alone. */
  severity: number;
}

export function specOf(incident: Incident): IncidentSpec {
  const spec = INCIDENTS.find((s) => s.id === incident.specId);
  if (!spec) throw new Error(`Unknown incident spec: ${incident.specId}`);
  return spec;
}

/**
 * What it costs to put right. Rises with how far it has been let go, and is
 * bounded because `severity` is bounded — walking away for a fortnight has to
 * stay recoverable. §10.
 */
export function fixCostDollars(incident: Incident): number {
  const spec = specOf(incident);
  const above = Math.max(NONE, incident.severity - spec.severity);
  return spec.baseFixCost * (ONE + above * INCIDENT_RULES.COST_PER_SEVERITY);
}

/** Multiplier on a station's speed, given everything currently wrong with it. */
export function stationPenalty(state: SimState, stationId: string): number {
  let penalty = ONE;
  for (const incident of state.incidents) {
    if (incident.stationId !== stationId) continue;
    if (specOf(incident).effect !== 'stationSpeed') continue;
    penalty *= ONE - incident.severity;
  }
  return penalty;
}

/** How much faster everything in the buffer ages. 1.0 is normal. */
export function freshnessPenalty(state: SimState): number {
  let penalty = ONE;
  for (const incident of state.incidents) {
    if (specOf(incident).effect === 'freshness') penalty *= ONE - incident.severity;
  }
  return penalty;
}

/** How well kept the room is. Feeds `ambienceBonus`. §6.4 */
export function roomCondition(state: SimState): number {
  let condition = ONE;
  for (const incident of state.incidents) {
    if (specOf(incident).effect === 'condition') condition *= ONE - incident.severity;
  }
  return condition;
}

/**
 * Total ambience points on the floor, and what that is worth. §6.4.
 *
 * Counted from placed stations, because that is how décor claims tiles — the
 * THIRD claimant alongside kitchen and storage. A seat is a tile the grill
 * does not get, and that is the entire lever.
 */
export function ambiencePoints(state: SimState): number {
  let points = NONE;
  for (const station of state.stations) points += AMBIENCE_POINTS[station.type] ?? NONE;
  return points;
}

/** §6.3's `patience * ambienceBonus`, with §9's room condition folded in. */
export function patienceBonus(state: SimState): number {
  return ambienceBonus(ambiencePoints(state), roomCondition(state));
}

/** §6.4 — a nicer room lifts spend per head as well as patience. */
export function spendBonus(state: SimState): number {
  return ambienceSpendBonus(ambiencePoints(state), roomCondition(state));
}

export class IncidentSystem implements System {
  readonly name = 'incidents';
  private rng: Rng | null = null;

  private stream(world: World): Rng {
    this.rng ??= world.rngFor(this.name);
    return this.rng;
  }

  /**
   * Once a day: age what is already open, then maybe open something new.
   *
   * In that order deliberately. Rolling first would let a brand-new incident
   * age on the day it arrived, which reads as the game having cheated.
   */
  onDayEnd(world: World): void {
    const state = world.state;

    for (const incident of state.incidents) {
      const spec = specOf(incident);
      incident.severity = Math.min(
        spec.maxSeverity,
        incident.severity + spec.severityPerDay,
      );
    }

    // An absence is over once it has HAD its day. There is nothing to fix and
    // nothing was ever asked of the player, so it does not sit on the list
    // shouting — but it has to survive long enough to actually cost a shift.
    // `openedOn < today` is that test: rolled last night, applied this morning
    // in onOpen, cleared tonight.
    for (let i = state.incidents.length - ONE; i >= NONE; i--) {
      const incident = state.incidents[i];
      if (!incident || specOf(incident).effect !== 'staffAbsent') continue;
      if (incident.openedOn < world.clock.dayIndex) state.incidents.splice(i, ONE);
    }

    if (world.clock.dayIndex < INCIDENT_RULES.GRACE_DAYS) return;
    if (state.incidents.length >= INCIDENT_RULES.MAX_OPEN) return;
    if (!this.stream(world).bool(INCIDENT_RULES.CHANCE_PER_DAY)) return;

    this.open(world);
  }

  private open(world: World): void {
    const state = world.state;
    const rng = this.stream(world);

    // Only things that can actually happen to THIS shop: no fryer, no fryer
    // thermostat. An incident naming equipment the player has never bought is
    // the game describing someone else's kitchen.
    const eligible = INCIDENTS.filter((spec) => {
      if (INCIDENT_RULES.UNIQUE_BY_ID && state.incidents.some((i) => i.specId === spec.id)) {
        return false;
      }
      if (spec.effect === 'stationSpeed') {
        return state.stations.some((s) => s.type === spec.station);
      }
      if (spec.effect === 'staffAbsent') {
        // Never the last person standing. A shop with nobody in it is a closed
        // shop, and §10 does not allow the world to close it for you.
        return state.workingToday.size > ONE;
      }
      return true;
    });
    if (eligible.length === NONE) return;

    const total = eligible.reduce((sum, s) => sum + s.weight, NONE);
    let roll = rng.next() * total;
    let chosen = eligible[eligible.length - ONE] as IncidentSpec;
    for (const spec of eligible) {
      roll -= spec.weight;
      if (roll <= NONE) {
        chosen = spec;
        break;
      }
    }

    let stationId: string | null = null;
    if (chosen.effect === 'stationSpeed') {
      const candidates = state.stations.filter((s) => s.type === chosen.station);
      const pick = candidates[Math.floor(rng.next() * candidates.length)];
      stationId = pick?.id ?? null;
    }

    let staffId: string | null = null;
    if (chosen.effect === 'staffAbsent') {
      // Chosen from tomorrow's roster, not today's. The call comes overnight.
      const tomorrow = (world.clock.dayOfWeek + ONE) % world.clock.daysPerWeek;
      const on = state.staff.filter((s) => s.roster[tomorrow] === true).map((s) => s.id);
      staffId = on[Math.floor(rng.next() * on.length)] ?? null;
      // Nobody on tomorrow, or only one person: there is no absence to have.
      // §10 does not let the world close the shop for you.
      if (staffId === null || on.length <= ONE) return;
    }

    state.incidents.push({
      id: `inc-${state.counters.incident++}`,
      specId: chosen.id,
      openedOn: world.clock.dayIndex,
      stationId,
      staffId,
      severity: chosen.severity,
    });
  }

  /**
   * Apply absences to TODAY'S floor.
   *
   * This has to happen here and not where the incident is created. `openDay()`
   * rebuilds `workingToday` from the roster every single morning, so removing
   * somebody from it the night before is a write that is thrown away before it
   * is ever read — the incident existed, cost nothing, and cleared itself.
   * Found by reading the tick order rather than by a failing test, because
   * every visible symptom of it was "no symptom at all".
   */
  onOpen(world: World): void {
    const state = world.state;
    for (const incident of state.incidents) {
      if (specOf(incident).effect !== 'staffAbsent') continue;
      if (incident.staffId === null) continue;
      state.workingToday.delete(incident.staffId);
    }
    state.onToday = state.workingToday.size;
  }

  onClose(world: World): void {
    world.record('incidents', world.state.incidents.length);
  }
}
