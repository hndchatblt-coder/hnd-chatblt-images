/**
 * Everything about how the shop is drawn. DESIGN.md §12, §21, §22.2.
 *
 * **Projection: top-down with a shallow oblique lean. Not isometric.** Grid
 * axes match thumb axes, so left is left and back-of-house is up-screen. The
 * lean comes from two things and no rotation at all: depth tiles are shorter
 * than they are wide, and anything with height gets a front face drawn below
 * its top face. That reads as three dimensions without the depth-sorting misery
 * of a true isometric grid, and it keeps a 9-wide room 9 taps wide.
 *
 * **The screen is a cross-section, street at the BOTTOM.** Grid y=0 is the
 * door and grid y=depth-1 is the back wall, so screen y runs the other way:
 * food flows down the screen and customers flow up it. §12.
 */
export const RENDER = {
  /** Portrait dev frame. §12 — this is the target, not a preview size. */
  FRAME_WIDTH: 390,
  FRAME_HEIGHT: 844,

  /**
   * A floor tile: wider than it is deep. The foreshortening IS the lean.
   *
   * Sized so Leichhardt's 9x15 fills the frame rather than sitting in a void.
   * 9 x 40 = 360 of 390 across; 15 x 31 = 465 down, which leaves the top of
   * the frame for the HUD and the bottom for the street and the queue.
   */
  TILE_WIDTH: 40,
  TILE_DEPTH: 31,

  /** How tall things stand. Drawn as a front face under the top face. */
  HEIGHT: {
    station: 22,
    counter: 15,
    column: 40,
    person: 32,
  },

  /**
   * The shop is a warm box in a cold city (§22.2). This is that box: a warm
   * wash over the interior, brightest at the pass, falling off toward the
   * back. Without it the room is merely dark, which is not the same thing.
   */
  GLOW: {
    alpha: 0.30,
    radiusTiles: 7,
    /** Concentric rings baked into the texture. More rings, softer falloff. */
    rings: 22,
  },

  /**
   * The back wall, above the last grid row. It is not decoration: without it
   * the kitchen is a floating rectangle in a void, and the extraction hood
   * over the gas run is the clearest possible statement of why the grill
   * lives where it lives.
   */
  WALL: {
    height: 190,
    hoodDrop: 30,
    /** The skirting where wall meets floor. Without it the wall reads as floor. */
    skirting: 5,
  },

  /** Where the grid sits in the frame. Leaves the top bar and thumb zone free. */
  ORIGIN_X: 15,
  /**
   * Screen y of grid row 0 — the door end. The street and the queue live
   * below it, which is why it is not at the bottom of the frame.
   */
  FLOOR_BOTTOM: 716,
  /** How many rows of street to draw below the door. */
  STREET_ROWS: 4,

  /**
   * Silhouettes must read at 12px (§22.2), so people are drawn a touch larger
   * than a tile suggests. A cook who reads as a floor tile is not a cook.
   */
  PERSON_WIDTH: 18,

  /** Steam, and how much of it. Culled hard as density rises (§21.3). */
  STEAM: {
    maxParticles: 120,
    riseSpeed: 14,
    lifeSeconds: 1.6,
    spawnPerSecond: 3.2,
    size: 7,
  },

  /**
   * Human motion is irregular, machine motion is metronomic. §21.5 calls this
   * the single distinction that does the most visual work, and says to
   * exaggerate it deliberately. These are the exaggeration.
   */
  MOTION: {
    /** Walk bob amplitude in pixels, and its cycle. */
    bobPixels: 1.6,
    bobHz: 2.4,
    /** Per-person speed jitter, so two people never walk in lockstep. */
    speedJitter: 0.12,
  },

  /**
   * The install beat. §21.2 — a one-time arrival animation with weight:
   * drop-in, 2px shake, settle. Two seconds, once, never repeated. This is the
   * purchase's payoff moment and it is cheap to build.
   */
  INSTALL: {
    seconds: 1.9,
    dropPixels: 110,
    dropFraction: 0.42,
    shakePixels: 2,
    shakeCycles: 7,
  },

  /** Customers queue outside the door, up-screen from it. */
  QUEUE: {
    spacingPixels: 17,
    maxVisible: 14,
  },

  /** Real seconds of a frame beyond which we stop trying to catch up. */
  MAX_FRAME_SECONDS: 0.25,
} as const;
