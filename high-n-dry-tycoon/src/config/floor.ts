/**
 * The floor (§5). Space is the constraint — the first design pillar, and the one with the
 * sharpest fail condition: "layout becomes cosmetic and the player just buys more grills".
 *
 * Everything here exists to make distance cost something.
 */
export const floor = {
  /** Metres per tile. A 40cm grid is roughly a commercial-kitchen module. */
  tileMetres: 0.4,
  /** Metres per second a staff member moves, carrying. Kitchen pace, not a sprint. */
  walkSpeedMetres: 1.15,
  /**
   * Turning and squeezing past people costs more than the straight-line distance suggests, and a
   * cramped kitchen costs more than a roomy one. Applied to every trip.
   */
  congestionPenalty: 0.35,
  /**
   * Fixed cost of every trip between stations, on top of the walk: putting one thing down,
   * picking another up, washing hands. In a real kitchen this dwarfs the walk over short
   * distances, and it is the knob that decides how much layout matters at all.
   */
  handlingSeconds: 8,

  /** Where customers come in and where they wait, in tile coords from the street edge. */
  doorTile: { x: 4, y: 0 },
} as const;

/** Real seconds to cross `tiles` tiles. Exported so the harness can show the walk-time tax. */
export const walkSeconds = (tiles: number): number =>
  (tiles * floor.tileMetres * (1 + floor.congestionPenalty)) / floor.walkSpeedMetres;
