/**
 * Venues (§5). Each is a different puzzle, not a re-skin — the grid shape and where the gas runs
 * is the constraint the whole spatial layer is built on.
 *
 * Screen is a cross-section: street at the bottom (depth 0), back of house at the top.
 */
export interface VenueDef {
  id: string;
  name: string;
  grid: { w: number; d: number };
  /** Tiles that can never be built on. Leichhardt's column is the famous one. */
  blocked: { x: number; y: number }[];
  /** Where each service point is available, as tile lists. */
  services: { gas: { x: number; y: number }[]; plumbing: { x: number; y: number }[] };
  rentPerWeek: number;
  /** Multiplies demand.baseFootTraffic. */
  footTrafficMultiplier: number;
  /** Skews the daypart curve — Rosebery is a lunch venue in an industrial pocket. */
  daypartSkew: { lunch: number; dinner: number };
  /** How much people will pay, and how little they will wait. */
  spendMultiplier: number;
  patienceMultiplier: number;
  notes: string;
}

/** Back wall of any venue, where the gas runs. */
const backWall = (w: number, d: number): { x: number; y: number }[] =>
  Array.from({ length: w }, (_, x) => ({ x, y: d - 1 }));

export const venues: VenueDef[] = [
  {
    id: "leichhardt",
    name: "Leichhardt",
    grid: { w: 9, d: 15 },
    blocked: [{ x: 4, y: 7 }],
    services: { gas: backWall(9, 15), plumbing: [{ x: 0, y: 13 }, { x: 1, y: 13 }] },
    rentPerWeek: 1450,
    footTrafficMultiplier: 1,
    daypartSkew: { lunch: 1, dinner: 1 },
    spendMultiplier: 1,
    patienceMultiplier: 1,
    notes: "Narrow terrace. Structural column at (4,7) you cannot remove and will hate.",
  },
  {
    id: "rosebery",
    name: "Rosebery",
    grid: { w: 7, d: 22 },
    blocked: [],
    services: { gas: backWall(7, 22), plumbing: [{ x: 0, y: 20 }, { x: 6, y: 20 }] },
    rentPerWeek: 1180,
    footTrafficMultiplier: 1.15,
    daypartSkew: { lunch: 1.6, dinner: 0.45 },
    spendMultiplier: 0.92,
    patienceMultiplier: 1.1,
    notes: "Absurdly long and deep. Walk distance is brutal. Enormous lunch, dead dinner.",
  },
  {
    id: "neutralBay",
    name: "Neutral Bay",
    grid: { w: 11, d: 11 },
    blocked: [],
    services: { gas: backWall(11, 11), plumbing: [{ x: 10, y: 9 }] },
    rentPerWeek: 2350,
    footTrafficMultiplier: 0.95,
    daypartSkew: { lunch: 0.8, dinner: 1.35 },
    spendMultiplier: 1.28,
    patienceMultiplier: 0.78,
    notes: "Squat and wide, roomy-feeling but the kitchen zone is tiny. Savage rent, high spend, low patience.",
  },
];

export const venueById = new Map(venues.map((v) => [v.id, v]));
