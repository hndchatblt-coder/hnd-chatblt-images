/**
 * Grid to screen. DESIGN.md §12, §22.2.
 *
 * Top-down with a shallow oblique lean. **Not isometric** — there is no
 * rotation, so grid x is screen x and a nine-wide room is nine taps wide.
 * Depth is foreshortened (a tile is wider than it is deep) and anything with
 * height gets a front face drawn beneath its top face. Those two things
 * together are the entire lean.
 *
 * The screen is a cross-section with the street at the BOTTOM, so screen y
 * runs opposite to grid y: grid row 0 is the door, at the bottom of the frame,
 * and the back wall is up-screen. Food flows down, customers flow up. §12.
 */
import { RENDER } from '@/config/render';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Centre of a grid cell, in screen pixels. Accepts fractional coordinates. */
export function toScreen(gx: number, gy: number): ScreenPoint {
  return {
    x: RENDER.ORIGIN_X + (gx + 0.5) * RENDER.TILE_WIDTH,
    y: RENDER.FLOOR_BOTTOM - (gy + 0.5) * RENDER.TILE_DEPTH,
  };
}

/** Top-left corner of a grid cell. */
export function toScreenCorner(gx: number, gy: number): ScreenPoint {
  return {
    x: RENDER.ORIGIN_X + gx * RENDER.TILE_WIDTH,
    y: RENDER.FLOOR_BOTTOM - (gy + 1) * RENDER.TILE_DEPTH,
  };
}

/**
 * Draw order. Things nearer the street must be drawn over things behind them,
 * or a cook standing in front of the grill disappears into it. Higher sorts
 * later, so it is simply "how far down the screen you are".
 */
export function depthSort(gy: number): number {
  return -gy;
}

/** Screen size of a footprint that is `w` tiles wide and `d` tiles deep. */
export function footprintSize(w: number, d: number): { width: number; height: number } {
  return { width: w * RENDER.TILE_WIDTH, height: d * RENDER.TILE_DEPTH };
}
