/**
 * The fit-out a venue opens with.
 *
 * Deliberately not optimal. Anything that burns goes on the back wall where the gas is, and the
 * pass goes down near the street where the customers are — which is correct, and also means
 * somebody walks the length of the shop holding a bun. That is exactly the problem the player is
 * supposed to notice and solve (§5), so the starting layout has to have it.
 *
 * Positions are wishes, not commands: each station gets a preferred spot and then a widening
 * search for somewhere legal. Leichhardt's column sits precisely where the assembly bench wants
 * to be, which is the venue doing its job.
 */
import type { StationType } from "../config/recipes.js";
import type { VenueDef } from "../config/venues.js";
import { canPlace, type Placement } from "./floor.js";

const findSpot = (
  venue: VenueDef,
  placed: Placement[],
  type: StationType,
  wish: { x: number; y: number },
): Placement | null => {
  // Spiral out from the wish. Small radius first so the intent of the layout survives.
  for (let r = 0; r <= Math.max(venue.grid.w, venue.grid.d); r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const candidate: Placement = { type, x: wish.x + dx, y: wish.y + dy };
        if (canPlace(venue, placed, candidate).ok) return candidate;
      }
    }
  }
  return null;
};

export const defaultLayout = (venue: VenueDef): Placement[] => {
  const back = venue.grid.d - 1;
  const mid = Math.max(0, Math.floor(venue.grid.w / 2) - 1);

  const wishes: { type: StationType; wish: { x: number; y: number } }[] = [
    { type: "grill", wish: { x: 0, y: back } },
    { type: "fryer", wish: { x: 3, y: back } },
    { type: "toast", wish: { x: 5, y: back } },
    { type: "prep", wish: { x: 0, y: back - 1 } },
    { type: "assembly", wish: { x: mid, y: Math.floor(back / 2) } },
    { type: "pass", wish: { x: mid, y: 2 } },
    { type: "drinks", wish: { x: mid + 2, y: 2 } },
  ];

  const placed: Placement[] = [];
  for (const { type, wish } of wishes) {
    const spot = findSpot(venue, placed, type, wish);
    if (!spot) throw new Error(`no legal spot for ${type} in ${venue.id}`);
    placed.push(spot);
  }
  return placed;
};
