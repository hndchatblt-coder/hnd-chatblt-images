/**
 * Render-side interpolation and fade-in. Playtest feedback, after step 17.
 *
 * *"The character just pops around the screen and things pop in and out."*
 *
 * **The sim was never the problem.** `KitchenSystem.stride` already gives a
 * staffer a fractional position along their leg, so movement is smooth in game
 * terms. The sim advances at 10 Hz and the renderer draws at 60; between two
 * ticks the sprite sat at exactly the same pixel and then jumped. That is a
 * 100ms judder, ten times a second, on the thing your eye follows.
 *
 * Fixed by exponential smoothing toward the simulated position rather than by
 * interpolating between two stored ticks. The tick-pair approach needs the
 * renderer to know where in the tick it is and to keep a shadow copy of the
 * previous state, and it breaks the moment speed changes or a frame is long.
 * A time-constant chase needs neither, and degrades into "slightly behind"
 * rather than into "wrong".
 *
 * **Two things it must not do**, and both were mistakes worth avoiding:
 *
 *  - it must not smooth a TELEPORT. A staffer who finishes their shift and
 *    respawns at the door, or a queue slot reused by a different customer,
 *    would otherwise sail across the room. Past `SNAP_TILES` it jumps, which is
 *    what the sim meant.
 *  - it must not lag more at speed. At 4x the sim covers four times the ground
 *    per real second, so a fixed time constant would leave the sprite four
 *    times further behind. The rate scales with the speed multiplier.
 */

export interface Smoothed {
  x: number;
  y: number;
  /** Seconds this entity has existed, for the fade-in. */
  age: number;
  /** Marked each frame; anything unmarked is gone and gets dropped. */
  seen: boolean;
}

export const SMOOTHING = {
  /**
   * Chase rate, per second, at 1x. Reaches ~95% of the gap in 150ms — fast
   * enough to feel attached to the simulation, slow enough to hide the tick.
   */
  RATE: 20,
  /**
   * Beyond this many tiles of error, snap. A respawn at the door or a pooled
   * slot changing owner is a discontinuity, not a movement.
   */
  SNAP_TILES: 2.5,
  /**
   * Seconds to fade a newly-seen sprite in. Short: this is to take the hard
   * edge off an appearance, not to make things drift into being.
   */
  FADE_SECONDS: 0.22,
  /**
   * The same snap rule for callers working in SCREEN pixels rather than tiles.
   *
   * The queue lays itself out in screen space, and passing it the tile
   * threshold meant a 2.5-PIXEL snap — so it snapped every frame and the
   * smoothing silently did nothing. Two units, two constants, named.
   */
  SNAP_PIXELS: 90,
} as const;

/**
 * Positions that chase the simulation, keyed by a stable entity id.
 *
 * Keyed by ID rather than by pool slot on purpose. Pool slots are recycled
 * between frames, so smoothing by slot would blend one customer's position
 * into the next customer who happened to land in that slot — which is a more
 * confusing kind of popping than the one being fixed.
 */
export class Smoother {
  private readonly tracked = new Map<string, Smoothed>();

  /** Call once per frame before any `chase`. */
  begin(): void {
    for (const entry of this.tracked.values()) entry.seen = false;
  }

  /**
   * Move this entity's drawn position toward its simulated one.
   *
   * @param dt     real seconds since the last frame
   * @param speed  the game's current speed multiplier
   * @returns the position to draw at, and how faded in it is
   */
  chase(
    key: string,
    x: number,
    y: number,
    dt: number,
    speed: number,
    snap: number = SMOOTHING.SNAP_TILES,
  ): { x: number; y: number; alpha: number } {
    let entry = this.tracked.get(key);
    if (!entry) {
      // First sight: start exactly where the sim says, and fade in. Starting
      // anywhere else would make every arrival slide in from nowhere.
      entry = { x, y, age: 0, seen: true };
      this.tracked.set(key, entry);
    }
    entry.seen = true;
    entry.age += dt;

    const dx = x - entry.x;
    const dy = y - entry.y;
    if (Math.abs(dx) > snap || Math.abs(dy) > snap) {
      entry.x = x;
      entry.y = y;
    } else {
      // 1 - e^(-k dt) is frame-rate independent, which matters because this
      // container drops to 12fps and a per-frame lerp constant would visibly
      // change the feel of the game with the frame rate.
      const k = SMOOTHING.RATE * Math.max(1, speed);
      const t = 1 - Math.exp(-k * dt);
      entry.x += dx * t;
      entry.y += dy * t;
    }

    return {
      x: entry.x,
      y: entry.y,
      alpha: Math.min(1, entry.age / SMOOTHING.FADE_SECONDS),
    };
  }

  /** Call once per frame after all `chase`. Drops anything that has gone. */
  end(): void {
    for (const [key, entry] of this.tracked) {
      if (!entry.seen) this.tracked.delete(key);
    }
  }

  /** For tests and for the debug readout. */
  get size(): number {
    return this.tracked.size;
  }
}
