/**
 * Policy bots (§14). Balance is tuned with these and verified by playing — never the other way
 * round.
 *
 * The session model matters and is not optional: this is a mobile game, so bots play three
 * 8-minute sessions a day with offline stretches between and a 9-hour overnight gap. Tuning
 * against a continuous 90-day run would tune a game nobody's play pattern matches.
 */
import { botCfg } from "../config/bots.js";
import { staffNames } from "../config/staff.js";
import { fire, hire, spendMarketing } from "../sim/systems/economy.js";
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

/**
 * The three active bots (§14). Each is a caricature of a real operator, and the point of them is
 * that they should visibly diverge: naive spirals, tightarse plateaus, balanced grows.
 */
const meanWaitMinutes = (world: World): number => {
  const recent = world.history.slice(-3);
  const served = recent.reduce((a, d) => a + d.ordersCompleted, 0);
  if (served === 0) return 0;
  return recent.reduce((a, d) => a + d.waitSecondsTotal, 0) / served / 60;
};

const balkRate = (world: World): number => {
  const recent = world.history.slice(-3);
  const walked = recent.reduce((a, d) => a + d.covers + d.balked, 0);
  if (walked === 0) return 0;
  return recent.reduce((a, d) => a + d.balked, 0) / walked;
};

export const naiveBot: Bot = {
  id: "naive",
  blurb: "Buys the cheapest thing, markets constantly. Should visibly spiral.",
  decide: (world) => {
    // Markets hard regardless of whether anyone can be served. This is the punishment spiral,
    // and it must be emergent rather than scripted (§3).
    spendMarketing(world, Math.min(world.cash * botCfg.naive.marketingShare, botCfg.naive.marketingCap));
    if (world.cash > botCfg.naive.hireAboveCash && world.staff.length < botCfg.naive.maxStaff) {
      hire(world, nextName(world));
    }
  },
};

export const balancedBot: Bot = {
  id: "balanced",
  blurb: "Holds a target wait, markets only with spare capacity.",
  decide: (world) => {
    const wait = meanWaitMinutes(world);
    const balk = balkRate(world);

    // Capacity first: if people are waiting or walking out, hire before spending on demand.
    if ((wait > botCfg.balanced.targetWaitMinutes || balk > botCfg.balanced.targetBalk) &&
        world.cash > botCfg.balanced.hireAboveCash &&
        world.staff.length < botCfg.balanced.maxStaff) {
      hire(world, nextName(world));
      return;
    }
    // Overstaffed and quiet: let someone go rather than carry them.
    if (wait < botCfg.balanced.trimBelowWaitMinutes && world.staff.length > botCfg.balanced.minStaff) {
      const last = world.staff[world.staff.length - 1];
      if (last) fire(world, last.id);
      return;
    }
    // Only market when the kitchen can absorb it.
    if (wait < botCfg.balanced.targetWaitMinutes && balk < botCfg.balanced.targetBalk) {
      spendMarketing(world, Math.min(world.cash * botCfg.balanced.marketingShare, botCfg.balanced.marketingCap));
    }
  },
};

export const tightarseBot: Bot = {
  id: "tightarse",
  blurb: "Minimum staff, maximum margin, slow growth.",
  decide: (world) => {
    if (world.staff.length > botCfg.tightarse.maxStaff) {
      const last = world.staff[world.staff.length - 1];
      if (last) fire(world, last.id);
    }
  },
};

const nextName = (world: World): string =>
  staffNames[world.nextStaffId % staffNames.length] ?? `Staff ${world.nextStaffId}`;

export const bots: Bot[] = [idleBot, naiveBot, balancedBot, tightarseBot];
export const botById = new Map(bots.map((b) => [b.id, b]));
