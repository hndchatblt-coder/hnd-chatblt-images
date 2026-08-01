/**
 * The floor: a grid, what can be placed on it, and how long it takes to walk
 * across it. DESIGN.md §7.1, §12, §26.
 *
 * This is the module the whole game rests on. Design pillar one is that space
 * is the binding constraint — if the distance between two stations does not
 * cost measurable throughput, this is a spreadsheet with a burger on it.
 *
 * §26: the grid is abstract and so are the service points. Nothing here knows
 * it is a restaurant. A colony module is a grid with different services.
 *
 * Pathing is A* on a 4-connected grid, which for a room this size is instant
 * and, more usefully, exact — so the distance cache is a lookup rather than an
 * estimate.
 */
import { FLOOR, STATION_SPECS } from '@/config/stations';
import type { SiteDefinition, ServicePoint } from '@/config/sites';
import type { StationType } from '@/config/recipes';

const NONE = 0;
const ONE = 1;

export interface Tile {
  readonly x: number;
  readonly y: number;
}

export interface Placement extends Tile {
  /** Swaps width and depth. A 3×1 prep bench becomes 1×3 against a side wall. */
  readonly rotated?: boolean;
}

export interface PlacementResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/** Tiles a station's footprint covers, in grid coordinates. */
export function footprintOf(type: StationType, at: Placement): Tile[] {
  const spec = STATION_SPECS[type];
  const width = at.rotated === true ? spec.depth : spec.width;
  const depth = at.rotated === true ? spec.width : spec.depth;
  const tiles: Tile[] = [];
  for (let dx = NONE; dx < width; dx += ONE) {
    for (let dy = NONE; dy < depth; dy += ONE) tiles.push({ x: at.x + dx, y: at.y + dy });
  }
  return tiles;
}

export class Floor {
  private readonly blocked = new Set<number>();
  /** Which station occupies a tile, if any. */
  private readonly occupant = new Map<number, string>();
  private readonly placements = new Map<string, { type: StationType; at: Placement }>();
  private readonly services = new Map<ServicePoint, Set<number>>();
  private readonly distanceCache = new Map<string, number>();

  constructor(readonly site: SiteDefinition) {
    for (const o of site.obstructions) this.blocked.add(this.key(o.x, o.y));
    for (const [service, tiles] of Object.entries(site.servicePoints)) {
      this.services.set(
        service as ServicePoint,
        new Set(tiles.map((t) => this.key(t.x, t.y))),
      );
    }
  }

  /**
   * Tile to integer, row-major. Derived from the site's own width rather than
   * a fixed stride, so a wide site can never alias two tiles onto one key.
   */
  private key(x: number, y: number): number {
    return y * this.width + x;
  }

  get width(): number {
    return this.site.width as number;
  }

  get depth(): number {
    return this.site.depth as number;
  }

  inBounds(x: number, y: number): boolean {
    return x >= NONE && y >= NONE && x < this.width && y < this.depth;
  }

  /** Obstructed by the building itself — a column, a stair, a wall. */
  isObstructed(x: number, y: number): boolean {
    return this.blocked.has(this.key(x, y));
  }

  /** Occupied by a station. Staff walk around these, not through them. */
  isOccupied(x: number, y: number): boolean {
    return this.occupant.has(this.key(x, y));
  }

  isWalkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && !this.isObstructed(x, y) && !this.isOccupied(x, y);
  }

  hasService(service: ServicePoint, x: number, y: number): boolean {
    return this.services.get(service)?.has(this.key(x, y)) ?? false;
  }

  // --- Placement ---------------------------------------------------------

  /**
   * Whether a station could go here, and if not, why not in words. The reason
   * string is what the renovate UI shows the player at step 19 — "no gas here"
   * is a design, "invalid" is a bug report.
   */
  canPlace(
    type: StationType,
    at: Placement,
    ignoreStationId?: string,
    occupied: readonly Tile[] = [],
  ): PlacementResult {
    const tiles = footprintOf(type, at);

    // Never build on top of a person. `pathTiles` returns Infinity when the
    // ORIGIN tile is unwalkable, so a staffer built over is stranded for the
    // rest of the run — permanently idle, silently skipped by every scheduler.
    // Measured before this check existed: 17 of 300 real purchases stranded
    // someone, 5 of them permanently, taking covers from 322 to 0.
    for (const t of tiles) {
      if (occupied.some((o) => o.x === t.x && o.y === t.y)) {
        return { ok: false, reason: `someone is standing there` };
      }
    }

    for (const t of tiles) {
      if (!this.inBounds(t.x, t.y)) {
        return { ok: false, reason: `${STATION_SPECS[type].label} would hang off the floor` };
      }
      if (this.isObstructed(t.x, t.y)) {
        return { ok: false, reason: `the column at (${t.x},${t.y}) is in the way` };
      }
      const holder = this.occupant.get(this.key(t.x, t.y));
      if (holder !== undefined && holder !== ignoreStationId) {
        return { ok: false, reason: `${holder} is already there` };
      }
    }

    for (const service of STATION_SPECS[type].requires) {
      const met = tiles.some((t) => this.hasService(service, t.x, t.y));
      if (!met) {
        return { ok: false, reason: `no ${service} under the ${STATION_SPECS[type].label}` };
      }
    }

    // A station nobody can stand at is a station that never runs.
    if (this.accessTilesFor(type, at).length === NONE) {
      return { ok: false, reason: `nowhere to stand at the ${STATION_SPECS[type].label}` };
    }

    return { ok: true };
  }

  place(stationId: string, type: StationType, at: Placement): void {
    const check = this.canPlace(type, at, stationId);
    if (!check.ok) throw new Error(`cannot place ${stationId}: ${check.reason}`);
    this.remove(stationId);
    for (const t of footprintOf(type, at)) this.occupant.set(this.key(t.x, t.y), stationId);
    this.placements.set(stationId, { type, at });
    this.distanceCache.clear();
  }

  remove(stationId: string): void {
    const existing = this.placements.get(stationId);
    if (!existing) return;
    for (const t of footprintOf(existing.type, existing.at)) this.occupant.delete(this.key(t.x, t.y));
    this.placements.delete(stationId);
    this.distanceCache.clear();
  }

  placementOf(stationId: string): { type: StationType; at: Placement } | undefined {
    return this.placements.get(stationId);
  }

  /**
   * Where a person stands to work a station: any walkable tile orthogonally
   * adjacent to its footprint. Stations are worked from the side, never from
   * inside — which is why a bench pushed into a corner is worth less.
   */
  accessTilesFor(type: StationType, at: Placement): Tile[] {
    const own = new Set(footprintOf(type, at).map((t) => this.key(t.x, t.y)));
    const out: Tile[] = [];
    const seen = new Set<number>();
    for (const t of footprintOf(type, at)) {
      for (const n of this.neighbours(t)) {
        const k = this.key(n.x, n.y);
        if (own.has(k) || seen.has(k)) continue;
        if (!this.isWalkable(n.x, n.y)) continue;
        seen.add(k);
        out.push(n);
      }
    }
    return out;
  }

  accessTiles(stationId: string): Tile[] {
    const p = this.placements.get(stationId);
    return p ? this.accessTilesFor(p.type, p.at) : [];
  }

  // --- Pathing -----------------------------------------------------------

  private neighbours(t: Tile): Tile[] {
    const steps = FLOOR.ALLOW_DIAGONAL
      ? [
          [ONE, NONE],
          [-ONE, NONE],
          [NONE, ONE],
          [NONE, -ONE],
          [ONE, ONE],
          [ONE, -ONE],
          [-ONE, ONE],
          [-ONE, -ONE],
        ]
      : [
          [ONE, NONE],
          [-ONE, NONE],
          [NONE, ONE],
          [NONE, -ONE],
        ];
    return steps.map(([dx, dy]) => ({ x: t.x + (dx as number), y: t.y + (dy as number) }));
  }

  /**
   * Shortest walkable path length in tiles, or Infinity if there isn't one.
   * A* with a Manhattan heuristic, which is admissible on a 4-connected grid
   * with uniform cost — so the answer is exact, not approximate.
   */
  pathTiles(from: Tile, to: Tile): number {
    if (from.x === to.x && from.y === to.y) return NONE;
    // Belt and braces on the check in canPlace: if someone has ended up on an
    // unwalkable tile anyway, path them out from the nearest tile they could
    // stand on rather than deleting them from the simulation.
    const start = this.isWalkable(from.x, from.y) ? from : this.nearestWalkable(from);
    if (!start || !this.isWalkable(to.x, to.y)) return Infinity;
    from = start;
    if (from.x === to.x && from.y === to.y) return NONE;

    const cacheKey = `${from.x},${from.y}>${to.x},${to.y}`;
    const cached = this.distanceCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const h = (t: Tile): number => Math.abs(t.x - to.x) + Math.abs(t.y - to.y);
    const gScore = new Map<number, number>([[this.key(from.x, from.y), NONE]]);
    // A plain array kept sorted. The grid is small enough that a binary heap
    // would be ceremony; if a later act paths across a city, replace this.
    const open: { tile: Tile; f: number }[] = [{ tile: from, f: h(from) }];

    while (open.length > NONE) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift() as { tile: Tile; f: number };
      const g = gScore.get(this.key(current.tile.x, current.tile.y)) ?? Infinity;

      if (current.tile.x === to.x && current.tile.y === to.y) {
        this.distanceCache.set(cacheKey, g);
        return g;
      }

      for (const n of this.neighbours(current.tile)) {
        if (!this.isWalkable(n.x, n.y)) continue;
        const tentative = g + ONE;
        if (tentative >= (gScore.get(this.key(n.x, n.y)) ?? Infinity)) continue;
        gScore.set(this.key(n.x, n.y), tentative);
        open.push({ tile: n, f: tentative + h(n) });
      }
    }

    this.distanceCache.set(cacheKey, Infinity);
    return Infinity;
  }

  /**
   * Walking distance from a tile to the nearest place you can stand and work
   * a station, and which tile that is. Infinity if the station is walled in.
   */
  /** The closest tile a person could actually stand on. Used to un-strand. */
  nearestWalkable(from: Tile): Tile | null {
    let best: Tile | null = null;
    let bestDistance = Infinity;
    for (let y = NONE; y < this.depth; y += ONE) {
      for (let x = NONE; x < this.width; x += ONE) {
        if (!this.isWalkable(x, y)) continue;
        const d = Math.abs(x - from.x) + Math.abs(y - from.y);
        if (d < bestDistance) {
          bestDistance = d;
          best = { x, y };
        }
      }
    }
    return best;
  }

  nearestAccess(from: Tile, stationId: string): { tiles: number; at: Tile | null } {
    let best = Infinity;
    let bestTile: Tile | null = null;
    for (const candidate of this.accessTiles(stationId)) {
      const d = this.pathTiles(from, candidate);
      if (d < best) {
        best = d;
        bestTile = candidate;
      }
    }
    return { tiles: best, at: bestTile };
  }

  /** Shortest walk between two stations' working positions. */
  betweenStations(a: string, b: string): number {
    let best = Infinity;
    for (const from of this.accessTiles(a)) {
      for (const to of this.accessTiles(b)) best = Math.min(best, this.pathTiles(from, to));
    }
    return best;
  }
}
