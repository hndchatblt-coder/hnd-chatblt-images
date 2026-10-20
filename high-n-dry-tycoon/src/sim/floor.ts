/**
 * Placement and distance.
 *
 * Stations occupy footprints, need service points, and cannot overlap each other, the blocked
 * tiles or the walkway to the door. Distance between dependent stations is the throughput tax
 * (§4.5) — that is the whole point of the spatial layer, so it is measured in real walk seconds
 * rather than an abstract penalty.
 */
import { floor, walkSeconds } from "../config/floor.js";
import type { StationType } from "../config/recipes.js";
import { stationByType } from "../config/stations.js";
import type { VenueDef } from "../config/venues.js";
import type { StationInstance } from "./entities.js";

export interface Placement {
  type: StationType;
  x: number;
  y: number;
}

export interface PlacementError {
  ok: false;
  reason: string;
}
export type PlacementResult = { ok: true } | PlacementError;

const tilesOf = (p: Placement): { x: number; y: number }[] => {
  const def = stationByType.get(p.type);
  if (!def) return [];
  const out: { x: number; y: number }[] = [];
  for (let dx = 0; dx < def.footprint.w; dx += 1) {
    for (let dy = 0; dy < def.footprint.d; dy += 1) out.push({ x: p.x + dx, y: p.y + dy });
  }
  return out;
};

/** Centre of a station's footprint, in tile coords. What distances are measured between. */
export const centreOf = (p: Placement): { x: number; y: number } => {
  const def = stationByType.get(p.type);
  const w = def?.footprint.w ?? 1;
  const d = def?.footprint.d ?? 1;
  return { x: p.x + (w - 1) / 2, y: p.y + (d - 1) / 2 };
};

/** Manhattan, because staff walk around benches rather than through them. */
export const tileDistance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const travelSeconds = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => walkSeconds(tileDistance(a, b));

/**
 * Can this go here? Every failure names itself, because Renovate mode has to show a red invalid
 * state with a reason rather than just refusing.
 */
export const canPlace = (
  venue: VenueDef,
  existing: Placement[],
  candidate: Placement,
): PlacementResult => {
  const def = stationByType.get(candidate.type);
  if (!def) return { ok: false, reason: `unknown station: ${candidate.type}` };

  const tiles = tilesOf(candidate);

  for (const t of tiles) {
    if (t.x < 0 || t.y < 0 || t.x >= venue.grid.w || t.y >= venue.grid.d) {
      return { ok: false, reason: "off the floor" };
    }
    if (venue.blocked.some((b) => b.x === t.x && b.y === t.y)) {
      return { ok: false, reason: "there's a column there" };
    }
    if (t.x === floor.doorTile.x && t.y === floor.doorTile.y) {
      return { ok: false, reason: "that's the doorway" };
    }
  }

  for (const other of existing) {
    const otherTiles = tilesOf(other);
    if (tiles.some((t) => otherTiles.some((o) => o.x === t.x && o.y === t.y))) {
      return { ok: false, reason: `overlaps the ${other.type}` };
    }
  }

  // Service points: gas, extraction, plumbing, power. This is the primary spatial puzzle — the
  // gas runs along the back wall, so anything that burns has to live up there.
  for (const need of def.requires) {
    if (need === "power") continue; // power is everywhere; it's the one that never constrains
    const points =
      need === "plumbing" ? venue.services.plumbing : venue.services.gas;
    // Extraction rides with gas in these venues — the same back wall carries both.
    const reachable = tiles.some((t) => points.some((p) => tileDistance(t, p) <= 1));
    if (!reachable) return { ok: false, reason: `no ${need} within reach` };
  }

  return { ok: true };
};

export const toInstance = (p: Placement, index: number): StationInstance => ({
  id: `st${index}`,
  type: p.type,
  x: p.x,
  y: p.y,
  runSeconds: 0,
  busyWith: null,
});
