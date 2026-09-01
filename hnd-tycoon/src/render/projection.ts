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

/**
 * The camera. Not a constant — the room has to fit whatever phone is holding
 * it. Shipping a fixed 390x844 canvas put the whole HUD below the fold on
 * every viewport shorter than that, which is most of them once a browser
 * toolbar is showing.
 */
export interface Camera {
  tileWidth: number;
  tileDepth: number;
  originX: number;
  floorBottom: number;
}

export const camera: Camera = {
  tileWidth: RENDER.TILE_WIDTH,
  tileDepth: RENDER.TILE_DEPTH,
  originX: RENDER.ORIGIN_X,
  floorBottom: RENDER.FLOOR_BOTTOM,
};

/**
 * Fit a room of `width x depth` tiles into a viewport, leaving room for the
 * top bar, the bottleneck line, the bottom bar, and the street below the door
 * where the queue stands. The queue is the most emotionally legible object in
 * the game and it was being drawn underneath an opaque panel.
 */
export function fitCamera(
  viewportWidth: number,
  viewportHeight: number,
  tilesWide: number,
  tilesDeep: number,
): Camera {
  const width = Math.min(viewportWidth, RENDER.FRAME_WIDTH);
  const tileWidth = Math.floor((width - RENDER.SIDE_MARGIN * 2) / tilesWide);
  // Depth stays foreshortened relative to width — that IS the oblique lean —
  // but is also capped by the height actually available.
  const usable =
    viewportHeight - RENDER.CHROME.top - RENDER.CHROME.bottom - RENDER.WALL.height;
  const streetRows = RENDER.STREET_ROWS;
  const byHeight = usable / (tilesDeep + streetRows);
  const tileDepth = Math.max(
    RENDER.MIN_TILE_DEPTH,
    Math.floor(Math.min(tileWidth * RENDER.DEPTH_RATIO, byHeight)),
  );
  return {
    tileWidth,
    tileDepth,
    originX: Math.round((width - tileWidth * tilesWide) / 2),
    floorBottom: viewportHeight - RENDER.CHROME.bottom - streetRows * tileDepth,
  };
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Centre of a grid cell, in screen pixels. Accepts fractional coordinates. */
export function toScreen(gx: number, gy: number): ScreenPoint {
  return {
    x: camera.originX + (gx + 0.5) * camera.tileWidth,
    y: camera.floorBottom - (gy + 0.5) * camera.tileDepth,
  };
}

/** Top-left corner of a grid cell. */
export function toScreenCorner(gx: number, gy: number): ScreenPoint {
  return {
    x: camera.originX + gx * camera.tileWidth,
    y: camera.floorBottom - (gy + 1) * camera.tileDepth,
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
  return { width: w * camera.tileWidth, height: d * camera.tileDepth };
}
