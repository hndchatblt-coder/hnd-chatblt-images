/**
 * Staff agents. DESIGN.md §7.1, §26 (staff scope).
 *
 * §26: staff belong to the COMPANY, not to a site. They are assigned to a
 * site, and that assignment can change. A two-year griller who opened
 * Leichhardt has to be able to become Rosebery's opening manager in Act II
 * and a regional trainer in Act III — which is impossible if `Staff` is a
 * field on a venue.
 */
import type { Tile } from '../floor';
import type { SiteId, StaffId } from '../types';

export interface Staff {
  readonly id: StaffId;
  readonly name: string;
  /** Which site they are rostered to. Reassignable — never ownership. */
  siteId: SiteId;
  /** 1.0 runs recipe durations as written. The log learning curve is step 18. */
  skill: number;
  /** The job they are on, or null if free. */
  jobId: string | null;
  /** Seconds worked in the current shift. Drives payroll (§8) and fatigue. */
  shiftSeconds: number;
  /** The tile they are standing at, or heading to. Pathing works in tiles. */
  tile: Tile;
  /**
   * Continuous position in grid coordinates, updated as they walk. Equal to
   * `tile` when stationary. The renderer draws from here — a person who
   * teleports between tiles reads as a bug, and §21.5's whole point is that
   * human motion looks different from machine motion.
   */
  x: number;
  y: number;
  /** Seconds spent walking today. The throughput tax, made visible. */
  walkSeconds: number;
  /**
   * Which days of the week they work, indexed by `DayOfWeek`.
   *
   * This is the verb that makes labour a decision rather than a fixed cost.
   * A permanent hire is paid on the Mondays nobody comes; a rostered one is
   * paid for the Saturday they are needed. Every operator solves the peak this
   * way and the sim could not express it.
   */
  roster: boolean[];
  /** Set when they have been let go. They work out their notice first. */
  leavingOnDay: number | null;
  /**
   * True until they have walked in from the street for the first time. §21.2 —
   * a new hire arrives through the front door on their first shift; they do not
   * blink into existence beside the pass.
   */
  arriving: boolean;
}

export function makeStaff(
  id: StaffId,
  name: string,
  siteId: SiteId,
  skill: number,
  tile: Tile,
  roster: readonly boolean[],
): Staff {
  return {
    id,
    name,
    siteId,
    skill,
    jobId: null,
    shiftSeconds: 0,
    tile,
    x: tile.x,
    y: tile.y,
    walkSeconds: 0,
    roster: [...roster],
    leavingOnDay: null,
    arriving: false,
  };
}

/** On today? Someone working out notice still turns up. */
export function isRostered(staff: Staff, dayOfWeek: number): boolean {
  return staff.roster[dayOfWeek] === true;
}

export const isStaffFree = (staff: Staff): boolean => staff.jobId === null;
