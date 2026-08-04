/**
 * What each station is, how much floor it eats, and what it has to be plugged
 * into. DESIGN.md §7.1, §12.
 *
 * Footprints are transcribed from the spec. They are the reason the floor is a
 * puzzle rather than a list: a 3×1 prep bench does not fit across Rosebery's
 * seven-wide room without eating nearly half of it, and the grill can only ever
 * live where the gas is.
 *
 * §26: these are abstract service-point requirements, not restaurant plumbing.
 * A colony module needs power and atmosphere; the mechanism is identical.
 */
import type { ServicePoint } from './sites';
import type { StationType } from './recipes';

export interface StationSpec {
  /** Tiles wide × tiles deep, before rotation. */
  readonly width: number;
  readonly depth: number;
  /** Every one of these must sit under the station's footprint. */
  readonly requires: readonly ServicePoint[];
  readonly label: string;
}

export const STATION_SPECS: Readonly<Record<StationType, StationSpec>> = {
  // Gas only. Extraction over a flat-top is a code requirement in the real
  // world and a station you would never place elsewhere in the game, so it
  // would be a constraint that constrains nothing.
  grill: { width: 2, depth: 1, requires: ['gas'], label: 'Grill' },
  // Gas AND extraction. This is the tightest requirement in the game and it is
  // why the fryer is the station that ruins a floorplan.
  fryer: { width: 1, depth: 1, requires: ['gas', 'extraction'], label: 'Fryer' },
  // The sink is part of the prep bench, so prep is chained to the plumbing —
  // which at Leichhardt is on the opposite wall to the gas.
  prep: { width: 3, depth: 1, requires: ['plumbing'], label: 'Prep bench' },
  // A bench toaster. The conveyor toaster (§14.2) is the one that needs
  // three-phase, and it arrives at step 12 as its own trade-off.
  toast: { width: 1, depth: 1, requires: [], label: 'Toaster' },
  assembly: { width: 3, depth: 1, requires: [], label: 'Assembly bench' },
  pass: { width: 1, depth: 2, requires: [], label: 'The pass' },
  drinks: { width: 1, depth: 1, requires: [], label: 'Drinks fridge' },
  // §6.4. A two-top against a wall. Cooks nothing, needs nothing, and is
  // competing with the fryer for the only tiles that exist.
  seating: { width: 1, depth: 2, requires: [], label: 'Table and chairs' },
  decor: { width: 1, depth: 1, requires: [], label: 'Fit-out' },
};

/**
 * Does a batch happen all at once, or one after another?
 *
 * A grill, a fryer and a toaster process the whole batch in one window — four
 * patties cook in the same ninety seconds as one. A prep bench, an assembly
 * bench and the pass are hands: four of anything takes four times as long.
 *
 * Getting this wrong in either direction breaks §14.1. Treat hand work as
 * simultaneous and a batch of eight garnishes costs the same as one; treat
 * cooking as sequential and four patties take six minutes.
 */
export const SIMULTANEOUS_BATCH: Readonly<Record<StationType, boolean>> = {
  grill: true,
  fryer: true,
  toast: true,
  prep: false,
  assembly: false,
  pass: false,
  drinks: false,
  // Neither is ever worked, so the answer is arbitrary — but it has to BE an
  // answer, because §14.1 reads this per station type and a missing key is a
  // batch of eight costing the same as a batch of one.
  seating: false,
  decor: false,
};

export const FLOOR = {
  /** Metres per tile. §7.1. A 2×1 grill is therefore 80cm of bench. */
  TILE_METRES: 0.4,
  /**
   * Walking pace in a working kitchen, carrying something, around other
   * people. Not a corridor pace — that would make distance free.
   */
  WALK_METRES_PER_SECOND: 0.9,
  /**
   * Diagonal movement is not allowed. Kitchens have benches; you walk around
   * them. This also keeps A* costs integral and the distance cache exact.
   */
  ALLOW_DIAGONAL: false,
} as const;

/** Seconds to walk a given number of tiles. */
export function walkSeconds(tiles: number): number {
  return (tiles * FLOOR.TILE_METRES) / FLOOR.WALK_METRES_PER_SECOND;
}
