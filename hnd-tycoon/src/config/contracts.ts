/**
 * Contracts. DESIGN.md §16.
 *
 * *"A bounded external job with a fixed deadline, a specific requirement and a
 * real reward."* They exist to answer *"what do I do when the venue runs
 * well"* — a question §16 says otherwise arrives around day 20 and ends the
 * run.
 *
 * **Each of the five stresses a DIFFERENT system, or this is one contract with
 * five names.** That is the design work in this file and it is the only thing
 * that makes the list worth having:
 *
 *   functionCatering  prep-ahead, against normal service (§18's machinery)
 *   corporateLunch    a daily quota that crowds out walk-ins (§6.3 balking)
 *   festivalStall     staff pulled off the roster for a week (§8 labour)
 *   foodTruckDay      one day's staff and stock diverted (§13's constraint)
 *   influencerVisit   no revenue at all; a service-quality bar (§7.4 reviews)
 *
 * Read down `stresses` and no two are the same. A sixth contract that stressed
 * something already on the list would be filler, and the check is a test.
 *
 * **Two rules from §16 that are load-bearing and easy to erode:**
 *
 * 1. *"Always optional and declinable with no penalty. A player mid-recovery
 *    must be able to say no."* So accepting is free and there is no decline
 *    cost anywhere in this file. The whole price is in the doing.
 * 2. *"Rewards are capabilities and reputation, not just cash."* Same
 *    `Capability` union §15.1's ladder already uses — a contract opens a door,
 *    exactly as a rung does, and for the same reason.
 *
 * **Failing costs reputation and never cash.** §10 forbids a state the player
 * cannot come back from, and a forfeited deposit lands hardest on the shop
 * least able to absorb it — which is the shop most likely to fail one. The
 * exit criterion is that a failed contract leaves the run recoverable, and the
 * cheapest way to break it is a penalty denominated in money.
 *
 * §26: `Capability` and `Site` throughout, deadlines in `GameTime` days only.
 * Later acts re-skin these as regional launches and resupply windows without
 * the shape changing.
 */
import type { Capability } from './ladder';

/** Which existing system a contract leans on. No two may share one. */
export type ContractStress =
  | 'prepAhead'
  | 'dailyQuota'
  | 'staffAway'
  | 'dayDiverted'
  | 'serviceQuality';

export interface Contract {
  readonly id: string;
  readonly label: string;
  /** Who is asking, in the voice. §22 — affectionate, grimy, played straight. */
  readonly blurb: string;
  readonly stresses: ContractStress;
  /** Game days from acceptance to the deadline. §16: never real time. */
  readonly days: number;
  /**
   * What has to be true to pass. Read by whichever system owns the stress —
   * `units` is burgers for a catering job and covers a day for a lunch
   * account, because the unit follows the stress.
   */
  readonly target: number;
  /** Cash on delivery, in dollars. Zero for the influencer — that is the point. */
  readonly feeDollars: number;
  /** §16: "rewards are capabilities and reputation, not just cash." */
  readonly reward: Capability | null;
  /**
   * Stars-worth of goodwill on delivery, and the same magnitude against you on
   * failure. Symmetric on purpose: a job whose upside exceeds its downside is
   * a free roll, and §16's contracts are supposed to be a decision.
   */
  readonly reputationSwing: number;
  /** Minimum rating before it is offered. §16 unlocks the system at 4.0. */
  readonly minStars: number;
}

export const CONTRACTS: readonly Contract[] = [
  {
    id: 'functionCatering',
    label: 'Eighty burgers, Friday six',
    blurb:
      'A fortieth at the bowlo. One pickup, one van, and they are not waiting around.',
    stresses: 'prepAhead',
    days: 5,
    target: 80,
    feeDollars: 1150,
    reward: { kind: 'catalogue', id: 'drinks' },
    reputationSwing: 0.25,
    minStars: 4.0,
  },
  {
    id: 'corporateLunch',
    label: 'Forty covers, every weekday, a fortnight',
    blurb:
      'The office across the road. Discounted, guaranteed, and squarely on top of your lunch rush.',
    stresses: 'dailyQuota',
    days: 14,
    target: 40,
    feeDollars: 2600,
    reward: { kind: 'machine', id: 'kiosk' },
    // Steady money is worth less reputation than a job people talk about.
    reputationSwing: 0.15,
    minStars: 4.0,
  },
  {
    id: 'festivalStall',
    label: 'A week on a festival site',
    blurb:
      'Stripped menu, borrowed gear, and two of yours gone from the roster all week.',
    stresses: 'staffAway',
    days: 7,
    target: 300,
    feeDollars: 3400,
    reward: { kind: 'machine', id: 'conveyorToaster' },
    reputationSwing: 0.35,
    minStars: 4.1,
  },
  {
    id: 'foodTruckDay',
    label: 'The truck, for one Saturday',
    blurb:
      'Good money for a day out. The shop trades badly without you, and Saturday is Saturday.',
    stresses: 'dayDiverted',
    days: 3,
    target: 120,
    feeDollars: 1450,
    reward: { kind: 'catalogue', id: 'seating' },
    reputationSwing: 0.2,
    minStars: 4.0,
  },
  {
    id: 'influencerVisit',
    label: 'Someone with a camera is coming in',
    blurb:
      'Two hundred thousand followers and no intention of paying. Feed them fast or feed them slow.',
    stresses: 'serviceQuality',
    days: 4,
    // Mean wait in minutes, and the ONLY contract where the target is a
    // ceiling rather than a floor. §16: "tight service buys a large temporary
    // awareness spike; otherwise a very public bad review."
    target: 7,
    feeDollars: 0,
    reward: null,
    // The biggest swing in the file, in both directions, for the job that pays
    // nothing. That IS the contract.
    reputationSwing: 0.55,
    minStars: 4.0,
  },
];

export const CONTRACT_BY_ID: Readonly<Record<string, Contract>> = Object.fromEntries(
  CONTRACTS.map((c) => [c.id, c]),
);

export const CONTRACT_RULES = {
  /** §16, verbatim: "one active contract maximum." */
  MAX_ACTIVE: 1,
  /** §16: "unlock at 4.0 stars, roughly a week in." */
  UNLOCK_STARS: 4.0,
  /** §16: "one offered every 4-6 game days after." */
  OFFER_EVERY_MIN_DAYS: 4,
  OFFER_EVERY_MAX_DAYS: 6,
  /**
   * How long an offer stays on the table before it lapses.
   *
   * A lapsed offer is NOT a failure and costs nothing — §16 says declinable
   * with no penalty, and an offer that quietly becomes a failure if ignored
   * would break that for exactly the player it protects: the one who has not
   * opened the app for two days.
   */
  OFFER_OPEN_DAYS: 3,
  /**
   * Awareness the influencer buys on a pass, and the §8.3 cap it counts
   * against. A spike, decaying like any other awareness.
   */
  INFLUENCER_AWARENESS: 0.45,
  /** Staff the festival takes off the roster for its duration. */
  FESTIVAL_STAFF_AWAY: 2,
  /**
   * Fraction of accumulated contract goodwill that fades each day.
   *
   * **Without this, contracts are a stat that maximises with no downside** —
   * the pillar this project bans by name. Goodwill was permanent for about an
   * hour: measured over ninety days, a shop that took every job ran +0.71 stars
   * above one that declined every job, purely from the ledger of past
   * successes, and a shop that kept going would have pinned at 5.0 and stopped
   * caring what anybody thought of the food.
   *
   * §7.4's reviews are recency-weighted for exactly this reason — what people
   * think of you is about lately. A catering job you nailed six weeks ago is
   * not why anyone walks in today.
   *
   * // PROVISIONAL — 4% a day gives a good job about a fortnight of visible
   * benefit, which is roughly how long a well-received function stays in the
   * conversation. No real figure for this.
   */
  GOODWILL_DECAY_PER_DAY: 0.04,
} as const;
