/**
 * Policy bot interface. DESIGN.md §25.2.
 *
 * Never hand-tune balance by playing. Tune with the harness, verify by playing.
 *
 * Five bots, and the important property is that NONE of them dominates:
 *   naive     — buys cheapest, markets constantly. Should visibly spiral.
 *   balanced  — holds a target wait, markets only with spare capacity,
 *               and ACTS ON THE BOTTLENECK READOUT.
 *   tightarse — minimum staff, maximum margin, never automates.
 *   roboboss  — automates aggressively on finance. Viable but brittle.
 *   idle      — nothing after day 1. Must survive; plateaus, never dies.
 */
import type { World } from '@/sim/world';

export interface Bot {
  readonly name: string;
  /**
   * Called once per simulated session, not per tick — bots make the decisions
   * a player would make when they open the app, not continuous micro-decisions.
   */
  onSession(world: World): void;
}

export interface BotRunResult {
  readonly bot: string;
  readonly days: number;
  /** Filled in from step 6 onward. Keys mirror the daily P&L. */
  readonly finalMetrics: Readonly<Record<string, number | string>>;
  /**
   * §15.3 — the dead-zone detector. Longest run of game days with no
   * meaningful decision available. Must stay under 3 for every bot but idle.
   */
  readonly longestDecisionFreeGapDays: number;
}
