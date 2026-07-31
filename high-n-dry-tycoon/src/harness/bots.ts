/**
 * Policy bots (§14). Balance is tuned with these and verified by playing — never the other way
 * round.
 *
 * The session model matters and is not optional: this is a mobile game, so bots play three
 * 8-minute sessions a day with offline stretches between and a 9-hour overnight gap. Tuning
 * against a continuous 90-day run would tune a game nobody's play pattern matches.
 */
import type { World } from "../sim/world.js";

export interface Bot {
  id: string;
  blurb: string;
  /**
   * Called once per in-session decision window. Bots act on the world the way a player would:
   * hiring, marketing, buying. M0 only ships `idle`, which does nothing after day 1 and must
   * survive — the others arrive with the systems they need.
   */
  decide(world: World): void;
}

export const idleBot: Bot = {
  id: "idle",
  blurb: "Does nothing after day 1. Must survive — plateaus, never dies.",
  decide: () => {
    // Deliberately empty. If this bot ever goes bankrupt, the game punishes absence, which the
    // brief forbids ("Attention is rewarded, never required").
  },
};

export const bots: Bot[] = [idleBot];
export const botById = new Map(bots.map((b) => [b.id, b]));
