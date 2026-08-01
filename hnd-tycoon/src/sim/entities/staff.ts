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
}

export function makeStaff(
  id: StaffId,
  name: string,
  siteId: SiteId,
  skill: number,
  tile: Tile,
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
  };
}

export const isStaffFree = (staff: Staff): boolean => staff.jobId === null;
