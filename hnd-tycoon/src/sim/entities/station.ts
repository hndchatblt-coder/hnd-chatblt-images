/**
 * Stations and the jobs running on them. DESIGN.md §7, §7.1.
 *
 * A station is a place work happens; a job is one batch of one step being
 * worked at one station by one person. Step 2 has a job occupy both the
 * station and the staffer for the whole duration. Step 4 splits that into
 * setup / tend / teardown (§14.1) so that a person can walk away from a
 * cooking patty — which is the entire premise of the automation ladder.
 */
import type { StationType } from '@/config/recipes';
import type { Tile } from '../floor';
import type { ItemId, RecipeId, StaffId } from '../types';

export interface Station {
  readonly id: string;
  readonly type: StationType;
  /** 1.0 runs recipe durations as written. Equipment tiers raise it (§14.2). */
  speedMultiplier: number;
  /** The job currently on this station, or null. */
  jobId: string | null;
  /** Cumulative seconds this station has spent working. Drives §8 utilities. */
  runSeconds: number;
}

/**
 * Walk there, do the work, carry the result onward. §7.1.
 *
 * The two walking phases are the whole of design pillar one. A job that
 * teleported its staffer would make the floorplan decoration.
 */
export type JobPhase =
  /** Walking to the station. */
  | 'travel'
  /** Loading it. Staffed. */
  | 'setup'
  /** Cooking. The station is held; the staffer is NOT — this is §14.1. */
  | 'cooking'
  /** Walking back to it, having been somewhere else. */
  | 'recall'
  /** Tending and unloading. Staffed. */
  | 'finish'
  /** Carrying the output to whatever consumes it. */
  | 'carry';

export interface Job {
  readonly id: string;
  readonly recipeId: RecipeId;
  readonly stepId: string;
  readonly stationId: string;
  /** Null while cooking unattended — that is the whole point of §14.1. */
  staffId: StaffId | null;
  /** Units this batch will yield. Capped at the step's batchSize. */
  readonly batch: number;
  readonly output: ItemId;
  readonly startedAt: number;
  phase: JobPhase;
  /** Seconds of walking left to reach the station. */
  travelRemaining: number;
  /** Staffed loading time left. */
  setupRemaining: number;
  /** Unattended cooking time left. */
  cookRemaining: number;
  /** Staffed tending and unloading time left. */
  finishRemaining: number;
  /** Seconds this job has sat cooked and unattended. Drives lapse. */
  lapseSeconds: number;
  /** True if leaving it unattended past the grace window spoils it. */
  readonly canLapse: boolean;
  /** Quality the output will be born with. Falls as the job lapses. */
  quality: number;
  /** Seconds before the output starts to stale, once it exists. */
  readonly freshnessWindow: number | undefined;
  /** How deep in the recipe this step sits. Ties broken by it when rescuing. */
  readonly depth: number;
  /** Seconds of walking left to deliver the output to whatever consumes it. */
  carryRemaining: number;
  /** Where the staffer stands to work. */
  readonly workTile: Tile;
  /** Where the output is going, and where the staffer ends up. Null = stays put. */
  readonly deliverTile: Tile | null;
}

export function makeStation(id: string, type: StationType, speedMultiplier: number): Station {
  return { id, type, speedMultiplier, jobId: null, runSeconds: 0 };
}

export const isStationFree = (station: Station): boolean => station.jobId === null;
