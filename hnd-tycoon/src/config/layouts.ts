/**
 * Named floorplans. DESIGN.md §12, §19 (blueprints).
 *
 * A layout is which station sits on which tile. These are the starting
 * arrangements and the ones the harness measures against; the player rearranges
 * them in renovate mode at step 19, and saves their own as blueprints.
 *
 * Leichhardt is 9 wide and 15 deep with a column at (4,7), gas along the back
 * wall only, and plumbing on the right-hand wall at the far end. That is not
 * decoration: it means the grill can only ever live at the back, the prep bench
 * can only ever live on the right, and every burger has to cross the room.
 */
import type { StationType } from './recipes';

export interface PlacedStation {
  readonly id: string;
  readonly type: StationType;
  readonly x: number;
  readonly y: number;
  readonly rotated?: boolean;
  readonly speedMultiplier?: number;
}

export interface NamedLayout {
  readonly id: string;
  readonly siteId: string;
  readonly label: string;
  readonly stations: readonly PlacedStation[];
  readonly notes: string;
}

/**
 * The line as tight as Leichhardt's services allow. Gas pins the grill, the
 * fryer and the toaster to the back wall; plumbing pins prep to the right-hand
 * wall; assembly and the pass are the only stations free to move, so they sit
 * immediately in front of the cooking.
 */
const LEICHHARDT_TIGHT: readonly PlacedStation[] = [
  { id: 'toast-1', type: 'toast', x: 1, y: 14 },
  { id: 'grill-1', type: 'grill', x: 2, y: 14 },
  { id: 'fryer-1', type: 'fryer', x: 5, y: 14 },
  { id: 'prep-1', type: 'prep', x: 8, y: 10, rotated: true },
  { id: 'assembly-1', type: 'assembly', x: 2, y: 12 },
  { id: 'pass-1', type: 'pass', x: 4, y: 9 },
];

export const LAYOUTS: Readonly<Record<string, NamedLayout>> = {
  leichhardtTight: {
    id: 'leichhardtTight',
    siteId: 'leichhardt',
    label: 'Leichhardt — tight',
    stations: LEICHHARDT_TIGHT,
    notes: 'Everything as close to the gas as the room allows. The baseline.',
  },

  /**
   * The same kitchen with the pass moved six tiles down the room, toward the
   * street. The grill cannot move — gas is one wall — so the distance between
   * the grill and the pass is opened up from the other end. This is the layout
   * step 3's gate measures against, and the delta is the single most important
   * number in the project.
   */
  leichhardtStretched: {
    id: 'leichhardtStretched',
    siteId: 'leichhardt',
    label: 'Leichhardt — pass six tiles out',
    stations: LEICHHARDT_TIGHT.map((s) => (s.id === 'pass-1' ? { ...s, y: 3 } : s)),
    notes: 'Identical to tight except the pass. Six more tiles between cooking and serving.',
  },
};

export const DEFAULT_LAYOUT_FOR: Readonly<Record<string, string>> = {
  leichhardt: 'leichhardtTight',
};
