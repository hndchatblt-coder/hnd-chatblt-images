/**
 * The motion budget. BUILD_PLAN step 17.
 *
 * *"Motion budget degradation — individual fidgets cull as density rises."*
 *
 * A pure function rather than a method on `Scene`, so it can be tested without
 * standing up PixiJS — and because the decision is the design, while the
 * drawing is just the consequence of it.
 *
 * **Three properties, and each one is a mistake this could have made:**
 *
 * 1. **Nothing is ever culled at low density.** A budget that shaves a little
 *    off every frame to be safe makes the quiet shop worse to look at for no
 *    gain, and the quiet shop is the first thing a new player sees.
 * 2. **Culling is by RANK, never random.** Freezing a random half of the room
 *    gives you a crowd where some people twitch and some are statues, which
 *    reads as a bug. Dropping the fidget on whoever is furthest from the front
 *    reads as depth of field — the people you are looking at move, and the back
 *    of the room is texture, which is what it is anyway.
 * 3. **The walk cycle is never culled.** A body still travels its path at any
 *    density. Freezing that would make a heaving shop look like a photograph,
 *    which is a worse lie than a crowd that does not fidget.
 *
 * Driven by a headcount rather than by measured frame time, deliberately. A
 * budget that reads fps oscillates — cull, get faster, un-cull, get slower —
 * and that pulsing is far more visible than the culling it is trying to hide.
 * It is also unmeasurable in this container: two consecutive runs of
 * `npm run fps` on identical code reported 2.10ms and 5.40ms of render, a 2.6x
 * swing, so anything that steered on that number would be steering on noise.
 */
import { RENDER } from '@/config/render';

/** What a body is allowed to do at the current density. */
export interface MotionAllowance {
  /** Per-person phase, speed and sway — §21.5's "people are irregular". */
  readonly fidget: boolean;
  /** Travelling along a path. Never culled, at any density. */
  readonly walk: boolean;
}

export const STILL: MotionAllowance = { fidget: false, walk: true };
export const FULL: MotionAllowance = { fidget: true, walk: true };

/**
 * @param moving  bodies on screen capable of motion
 * @param rank    0 is nearest the front; higher is further back
 */
export function allowanceFor(moving: number, rank: number): MotionAllowance {
  if (moving <= RENDER.MOTION_BUDGET.FULL_UNTIL) return FULL;
  return rank < RENDER.MOTION_BUDGET.NEAR_COUNT ? FULL : STILL;
}

/** How many bodies keep their per-person motion at this density. */
export function fidgetingAt(moving: number): number {
  if (moving <= RENDER.MOTION_BUDGET.FULL_UNTIL) return moving;
  return Math.min(moving, RENDER.MOTION_BUDGET.NEAR_COUNT);
}
