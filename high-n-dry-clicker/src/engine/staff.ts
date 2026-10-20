/**
 * Who works here, and who keeps coming back.
 *
 * Deliberately a pure function of (seed, prestigeCount, index) rather than stored state: no save
 * migration, no bloat, and a new crew rolls in after every sale — which is its own small pleasure,
 * and the ticker already jokes about it ("The new owners have changed the tongs.").
 *
 * Quirks are flavour only. They modify nothing, so the sim stays honest and nobody has to balance
 * a joke.
 */
import content from "../../content/staff.json";

export interface StaffMember {
  name: string;
  quirk: string;
}

const ROSTER = (content as { staff: StaffMember[] }).staff;
const REGULARS = (content as { regulars: string[] }).regulars;

/** Deterministic, and spread out enough that neighbouring stations don't get neighbouring names. */
function pick<T>(items: readonly T[], seed: number, run: number, index: number): T {
  const n = Math.abs(seed + run * 31 + index * 7919);
  return items[n % items.length] as T;
}

/** The person standing at generator `index` this run. */
export function staffFor(seed: number, prestigeCount: number, index: number): StaffMember {
  return pick(ROSTER, seed, prestigeCount, index);
}

/** A regular's name, stable for a given customer id within a run. */
export function regularName(seed: number, prestigeCount: number, customerId: number): string {
  return pick(REGULARS, seed, prestigeCount, customerId);
}

export const REGULAR_COUNT = REGULARS.length;
