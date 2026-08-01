/**
 * The kitchen: what is installed, and how work gets chosen. DESIGN.md §7, §7.1.
 *
 * Every number the production scheduler uses lives here. The scheduler itself
 * contains no constants — that is hard rule 5, and the reason is that these
 * values are the ones the balance harness will move a hundred times.
 */
import type { StationType } from './recipes';

export interface InstalledStation {
  readonly id: string;
  readonly type: StationType;
  /**
   * Work rate multiplier. 1.0 is the duration as written in the recipe.
   * Equipment tiers (§14.2) raise this; the step-2 gate doubles it to prove
   * the number reaches mean wait.
   */
  readonly speedMultiplier: number;
}

export interface StaffSlot {
  readonly id: string;
  readonly name: string;
  /** Skill 1.0 = recipe durations as written. The learning curve is step 18. */
  readonly skill: number;
}

export const KITCHEN = {
  /**
   * Step 2's opening line: one of each station the launch menu needs, and one
   * person to run all of it. Deliberately under-resourced — a single staffer
   * covering five stations is what makes the first hire legible.
   */
  OPENING_LINE: [
    { id: 'grill-1', type: 'grill', speedMultiplier: 1 },
    { id: 'fryer-1', type: 'fryer', speedMultiplier: 1 },
    { id: 'toast-1', type: 'toast', speedMultiplier: 1 },
    { id: 'prep-1', type: 'prep', speedMultiplier: 1 },
    { id: 'assembly-1', type: 'assembly', speedMultiplier: 1 },
    { id: 'pass-1', type: 'pass', speedMultiplier: 1 },
  ] as readonly InstalledStation[],

  OPENING_STAFF: [{ id: 'staff-1', name: 'Dev', skill: 1 }] as readonly StaffSlot[],

  /**
   * The scheduler pulls, it does not push. Work nearest the customer is
   * started first, so the line drains toward the pass instead of making
   * patties forever while nothing gets plated. Shallowest-first is the whole
   * policy; this flag exists so the alternative can be measured rather than
   * argued about.
   */
  PULL_SHALLOWEST_FIRST: true,

  /**
   * A batch is sized to outstanding need, capped at the equipment's capacity.
   * Cooking MORE than is needed is par-cooking, and that is a decision the
   * player makes deliberately at step 4 — it must not be the default.
   */
  BATCH_TO_NEED: true,

  /** Floating-point slack when deciding a job has finished. Not a tunable. */
  EPSILON: 1e-9,

  /**
   * Backstop on the advance/schedule interleave within one tick. Each pass
   * either burns budget or starts a job, so this can only be reached by a bug.
   * Far above any real iteration count.
   */
  MAX_SCHEDULER_PASSES: 64,
} as const;
