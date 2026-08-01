/**
 * Sites. DESIGN.md §12.
 *
 * NOT `venues` — a venue is one kind of site (§26). The screen is a
 * cross-section of the shop: street at the bottom, back-of-house at the top,
 * the pass in the middle where the two flows meet.
 *
 * Each floorplan is a different puzzle, not a re-skin.
 */
import { money, tiles, type SiteId, type SiteKind, type Tiles } from '@/sim/types';

export type ServicePoint = 'gas' | 'extraction' | 'plumbing' | 'power3phase';

export interface SiteDefinition {
  readonly id: SiteId;
  readonly kind: SiteKind;
  readonly name: string;
  readonly width: Tiles;
  readonly depth: Tiles;
  /** Tiles that cannot be built on. The Leichhardt column lives here. */
  readonly obstructions: readonly { x: number; y: number }[];
  /** Where each service is available. Fixed and annoying, by design. */
  readonly servicePoints: Readonly<Record<ServicePoint, readonly { x: number; y: number }[]>>;
  readonly entryTile: { x: number; y: number };
  readonly weeklyRent: ReturnType<typeof money>;
  readonly calendarId: string;
  /** Arrivals per hour at 1.0 multipliers. §6.1 */
  readonly baseFootTraffic: number;
  /** Multiplier on dine-in spend per head. */
  readonly spendPerHead: number;
  readonly notes: string;
}

const row = (y: number, xs: number[]) => xs.map((x) => ({ x, y }));

export const SITES: Readonly<Record<string, SiteDefinition>> = {
  leichhardt: {
    id: 'leichhardt' as SiteId,
    kind: 'venue',
    name: 'Leichhardt',
    width: tiles(9),
    depth: tiles(15),
    // The column you cannot remove and will hate. §12
    obstructions: [{ x: 4, y: 7 }],
    servicePoints: {
      gas: row(14, [1, 2, 3, 4, 5, 6, 7]),
      extraction: row(14, [2, 3, 4, 5, 6]),
      plumbing: [{ x: 8, y: 11 }, { x: 8, y: 12 }],
      power3phase: row(14, [1, 7]),
    },
    entryTile: { x: 4, y: 0 },
    weeklyRent: money(2400),
    calendarId: 'sydneyStandard',
    baseFootTraffic: 14,
    spendPerHead: 1.0,
    notes: 'Home venue. Narrow terrace, gas along the back wall only. Tutorial-by-shape. Later the commissary anchor.',
  },

  rosebery: {
    id: 'rosebery' as SiteId,
    kind: 'venue',
    name: 'Rosebery',
    width: tiles(7),
    depth: tiles(22),
    obstructions: [],
    servicePoints: {
      gas: row(21, [1, 2, 3, 4, 5]),
      extraction: row(21, [2, 3, 4]),
      plumbing: [{ x: 6, y: 18 }],
      power3phase: row(21, [1, 5]),
    },
    entryTile: { x: 3, y: 0 },
    weeklyRent: money(1900),
    calendarId: 'sydneyStandard',
    baseFootTraffic: 16,
    spendPerHead: 0.85,
    notes: 'Absurdly long and deep. Walk distance is brutal; rewards strict linear flow. Industrial: enormous lunch, dead dinner. Ambience barely matters.',
  },

  neutralBay: {
    id: 'neutralBay' as SiteId,
    kind: 'venue',
    name: 'Neutral Bay',
    width: tiles(11),
    depth: tiles(11),
    obstructions: [{ x: 5, y: 5 }, { x: 6, y: 5 }],
    servicePoints: {
      gas: row(10, [3, 4, 5, 6]),
      extraction: row(10, [4, 5]),
      plumbing: [{ x: 10, y: 8 }],
      power3phase: row(10, [3, 6]),
    },
    entryTile: { x: 5, y: 0 },
    weeklyRent: money(3600),
    calendarId: 'sydneyStandard',
    baseFootTraffic: 12,
    spendPerHead: 1.35,
    notes: 'Squat and wide. Roomy-feeling, tiny kitchen zone, savage rent. High spend per head, low tolerance for waits. Ambience and premium tier both pay.',
  },
};
