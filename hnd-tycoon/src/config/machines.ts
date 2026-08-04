/**
 * The equipment ladder. DESIGN.md §14.2, §14.3, §14.4, §14.5.
 *
 * **Automation buys back attention, not time.** That sentence is the whole file
 * and it is why nothing here has a `speedMultiplier`. A machine does not make
 * the patty cook faster — ninety seconds is ninety seconds — it takes the
 * flipping and the watching off a person, so that person can be somewhere else
 * while it happens. §14.1's attention split is the mechanism, and every machine
 * below is expressed as a change to `setupSeconds`, `tendSeconds`,
 * `teardownSeconds` or `canLapse`, never to the clock.
 *
 * **§14.3 is non-negotiable and it is enforced by a test.** Each piece trades a
 * labour cost for at least TWO of: capital, floor space, utilities,
 * flexibility, reliability. *"If a piece is strictly better than not having it,
 * it's a stat upgrade in a costume. Cut it or add a cost."*
 *
 * And §14.5's limits: never remove the last decision at a station, never make
 * staff obsolete, never gate purely behind cash.
 *
 * SCOPE. Six rungs, chosen because each is expressible in mechanics that exist
 * today. Two from §14.2's table are deliberately absent rather than faked:
 *
 *   pass-through / conveyor (tier 4) — its cost is "commits you to a flow
 *     direction and makes re-layout costlier", and re-layout is step 19. A
 *     conveyor without it is a walk-distance discount with no downside, which
 *     is precisely the stat upgrade §14.3 bans.
 *   automated oil management (tier 4) — it removes a recurring incident class,
 *     and the incident class it removes should be a fryer-specific one that
 *     does not exist yet. Adding both at once would let me tune the problem to
 *     fit the solution.
 */
import type { CostKind } from './catalogue';
import type { StationType } from './recipes';
import { money, type Money } from '@/sim/types';

/**
 * How a machine changes the attention a step costs.
 *
 * Multipliers, not absolutes, so a machine works on any recipe that runs at its
 * station — including recipes that do not exist yet. A machine hardcoded to
 * "cheeseburger patty" would need editing every time the menu grows, which is
 * exactly the §26 class of mistake.
 */
export interface AttentionDelta {
  readonly setup?: number;
  readonly tend?: number;
  readonly teardown?: number;
  /** Force `canLapse`. An auto-lift basket cannot burn what it pulls itself. */
  readonly canLapse?: boolean;
}

export interface MachineSpec {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  readonly tier: number;
  /** The station whose work it takes over. */
  readonly station: StationType;
  readonly price: Money;
  /**
   * The machine's real size in tiles.
   *
   * **It does not all cost floor.** A clamshell REPLACES a flat-top; it does
   * not stand beside one. Only the tiles beyond its host station's own
   * footprint are taken from the room — see `extraTiles`. Modelling every
   * machine as new floor was measured and it was ruinous: at Leichhardt every
   * tile a machine took lengthened every walk, and a $1,250 bench-top sauce
   * rail destroyed $6,118 of trade over ninety days on its footprint alone.
   *
   * §14.2 describes these as replacements in its own words — "clamshell grill",
   * "conveyor bun toaster", "auto-lift fryer" are all the station, upgraded.
   * The two that genuinely eat room say so: the kiosk is "1x1 of *floor*" and
   * the robotic fry station is a 2x2 cabinet where a 1x1 fryer used to be.
   */
  readonly width: number;
  readonly depth: number;
  /**
   * True when it sits ON its host rather than replacing it — a bench-top.
   * Costs no floor at all, which is why the sauce rail does not list
   * `floorSpace` among its costs.
   */
  readonly benchTop?: boolean;
  /**
   * True when it is an ADDITION rather than a replacement: its whole footprint
   * comes out of the room.
   *
   * The kiosk is the case. §14.2 calls it "1x1 of *floor*" — it goes by the
   * door and the pass stays exactly where it was. Netting it against its host's
   * footprint gave it a NEGATIVE floor cost, because the pass is 1x2 and the
   * kiosk is 1x1, which would have made it free.
   *
   * Three shapes, and every machine is exactly one: bench-top (no floor),
   * replacement (only the excess over its host), addition (all of it).
   */
  readonly standalone?: boolean;
  /**
   * Continuous draw in dollars per trading hour, **whether busy or not**. §14.3
   * is explicit that this is what makes automation *worse* than staff on a dead
   * Monday, and that asymmetry is the entire reason `bot:roboboss` must not
   * dominate.
   */
  readonly utilitiesPerHour: number;
  /** Preventive maintenance, dollars per week. Skippable. §14.4 */
  readonly maintenancePerWeek: number;
  /**
   * Failures per thousand run-hours at zero maintenance. §14.4 — "failure rate
   * proportional to run-hours, inverse to maintenance spend".
   */
  readonly failuresPerKiloHour: number;
  /** How hard it bites when it does fail, as a station-speed severity. */
  readonly failureSeverity: number;
  /** Dollars for a callout. Bigger machines cost more to have looked at. */
  readonly calloutCost: number;
  readonly attention: AttentionDelta;
  /**
   * Sites the company must run before this rung unlocks. §14.5: *"never gate
   * automation purely behind cash. Gate on ladder rungs and venue count."*
   *
   * This is how tier 5 stays in the ladder honestly. A robotic fry station
   * generates about $71 a day of value in one Leichhardt-sized shop, so an
   * honest single-shop price for it would be roughly $5,000 — less than an
   * auto-lift fryer, which is absurd. It is not that the machine is overpriced;
   * it is that one burger bar is not the business that buys one. Visible and
   * locked is also better progression than absent (§15).
   */
  readonly requiresSites?: number;
  readonly costs: readonly CostKind[];
  /** §21.2 — nothing purchasable ships without a distinct on-screen presence. */
  readonly signature: { install: string; idle: string; working: string };
}

export const MACHINES: readonly MachineSpec[] = [
  {
    id: 'sauceRail',
    label: 'Sauce pump rail',
    blurb: 'Dressing a burger stops being a job and becomes two pumps.',
    tier: 1,
    station: 'assembly',
    price: money(950),
    width: 1,
    depth: 1,
    utilitiesPerHour: 0.02,
    maintenancePerWeek: 6,
    // Bench-top, few moving parts. It clogs; it does not explode.
    failuresPerKiloHour: 0.9,
    failureSeverity: 0.25,
    calloutCost: 120,
    // §14.2: "~40% of assembly setup".
    attention: { setup: 0.6 },
    // Bench-top: it sits on the assembly bench and takes no floor. Two costs,
    // which is §14.3's minimum, and both are real.
    benchTop: true,
    costs: ['capital', 'reliability'],
    signature: {
      install: 'Bolted to the bench, lines primed, a test squirt into a cup.',
      idle: 'Six steel nozzles in a row, one of them dripping.',
      working: 'Two quick pumps per burger, exactly the same every time.',
    },
  },
  {
    id: 'clamshell',
    label: 'Clamshell grill',
    blurb: 'Cooks both sides at once. No flip, no watching. One cook level, forever.',
    tier: 2,
    station: 'grill',
    price: money(4600),
    width: 2,
    depth: 1,
    // Heavy gas AND power, and it holds temperature all day. This is the line
    // item that makes a quiet Monday hurt.
    utilitiesPerHour: 1.35,
    maintenancePerWeek: 34,
    failuresPerKiloHour: 2.4,
    failureSeverity: 0.5,
    calloutCost: 640,
    // §14.2: "the flip and the watching: tendSeconds -> ~0".
    attention: { tend: 0.05 },
    /**
     * NOT `floorSpace`. A clamshell is 2x1 and it replaces a 2x1 flat-top, so
     * it takes no floor from the room — and the gate for §14.3 now checks that
     * every declared cost is backed by a number that bites. Claiming a cost you
     * do not charge is how a machine ends up looking expensive on paper and
     * being free in play.
     *
     * The flexibility cost is real and unmodelled today: it cannot do custom
     * cook levels, and there is no custom cook level to lose until §18's
     * specials. Kept because the audit reads this array and removing it later
     * would be quietly dropping a stated cost.
     */
    costs: ['capital', 'utilities', 'flexibility', 'reliability'],
    signature: {
      install: 'Craned in. Two people, a lot of swearing, a gas fitter.',
      idle: 'Lid up, platen glowing, thermostat clicking every forty seconds.',
      working: 'Lid down, timer, lid up. Identical every single time — §21.5.',
    },
  },
  {
    id: 'conveyorToaster',
    label: 'Conveyor bun toaster',
    blurb: 'Buns go in one end. They come out the other whether you wanted them or not.',
    tier: 2,
    station: 'toast',
    price: money(2300),
    width: 2,
    depth: 1,
    // 0.35, down from 0.9. A bun toaster is not a flat-top: it was drawing
    // more than a clamshell holding temperature all day, which made it the one
    // rung with negative operating value at any price.
    utilitiesPerHour: 0.35,
    maintenancePerWeek: 12,
    failuresPerKiloHour: 1.8,
    failureSeverity: 0.45,
    calloutCost: 300,
    // §14.2: "the toast step entirely" — loading is all that is left.
    attention: { tend: 0, teardown: 0.15 },
    /**
     * Bench-top: it replaces the bench toaster ON the bench, which is what a
     * conveyor toaster physically is. Charging it one extra tile beside a
     * toaster that lives in the back-left corner cost $1,345 of trade over
     * ninety days — more than the machine saves — because that corner is where
     * the grill run is worked from.
     *
     * Still three of §14.3's five costs. The tier-3 automatic bun feeder is
     * what takes the loading off it, and that is where the next floor cost is.
     */
    benchTop: true,
    costs: ['capital', 'utilities', 'reliability'],
    signature: {
      install: 'Slid onto the bench, belt threaded, run empty once to burn off.',
      idle: 'Belt turning with nothing on it, elements orange, constant hum.',
      working: 'A steady file of buns, evenly spaced, never hurried.',
    },
  },
  {
    id: 'autoLiftFryer',
    label: 'Auto-lift fryer',
    blurb: 'The basket pulls itself. Chips stop burning because somebody got busy.',
    tier: 3,
    station: 'fryer',
    price: money(7400),
    width: 1,
    depth: 1,
    utilitiesPerHour: 1.1,
    maintenancePerWeek: 42,
    // Oil, heat and a mechanism, all at once. §14.2 flags oil management as
    // its own tier-4 problem for a reason.
    failuresPerKiloHour: 3.1,
    failureSeverity: 0.55,
    calloutCost: 720,
    // §14.2: "basket watching and pulling: canLapse -> false".
    attention: { tend: 0.1, teardown: 0.4, canLapse: false },
    costs: ['capital', 'utilities', 'reliability'],
    signature: {
      install: 'Old fryer out, new one in, oil up, and a very slow first heat.',
      idle: 'Baskets parked high, oil shimmering, a small green light.',
      working: 'Basket drops, timer, basket rises on its own. Nobody watching.',
    },
  },
  {
    id: 'kiosk',
    label: 'Self-order kiosk',
    blurb: 'Takes orders without a person. The Regulars liked being greeted.',
    tier: 3,
    station: 'pass',
    price: money(8950),
    width: 1,
    depth: 1,
    utilitiesPerHour: 0.14,
    maintenancePerWeek: 22,
    failuresPerKiloHour: 1.4,
    failureSeverity: 0.4,
    calloutCost: 260,
    // The pass carries front-of-house work — §14.1's `plate` step is 48 seconds
    // of hands, most of it setup. This is the machine that takes it.
    attention: { setup: 0.45 },
    // §14.2: "1x1 of *floor*". It goes by the door; the pass stays put.
    standalone: true,
    costs: ['capital', 'floorSpace', 'utilities', 'reliability'],
    signature: {
      install: 'Bolted to the floor by the door. Screen wakes up, chimes once.',
      idle: 'Attract loop cycling to nobody. Bright, in a dim room.',
      working: 'Someone prodding it while the person behind them waits.',
    },
  },
  {
    id: 'roboFry',
    label: 'Robotic fry station',
    blurb: 'The whole fry section, in a box. Spectacular when it breaks.',
    tier: 5,
    station: 'fryer',
    price: money(48000),
    width: 2,
    depth: 2,
    utilitiesPerHour: 2.8,
    maintenancePerWeek: 130,
    failuresPerKiloHour: 4.2,
    // §14.4: "a failed machine is WORSE than never automating". This is what
    // that looks like as a number.
    failureSeverity: 0.62,
    calloutCost: 2600,
    attention: { setup: 0.2, tend: 0, teardown: 0.1, canLapse: false },
    // §14.5 gates this on venue count, not cash. One shop is not the business
    // that buys a robot — see `requiresSites`.
    requiresSites: 2,
    costs: ['capital', 'floorSpace', 'utilities', 'flexibility', 'reliability'],
    signature: {
      install: 'A pallet, a forklift, a day of commissioning and a laminated card.',
      idle: 'Standby lighting inside the cabinet. Faint fan. Deeply smug.',
      working: 'Arm, basket, arm, basket. Metronomic — the §21.5 contrast made flesh.',
    },
  },
];

export const MACHINE_BY_ID: Readonly<Record<string, MachineSpec>> = Object.fromEntries(
  MACHINES.map((m) => [m.id, m]),
);

export const MACHINE_RULES = {
  /**
   * §14.4: *"failure rate proportional to run-hours, inverse to maintenance
   * spend. Preventive maintenance is a small recurring cost the player can
   * skip. Skipping is correct in a cash crunch and expensive later. Good
   * decision."*
   *
   * Full maintenance multiplies the failure rate by this; none leaves it at 1.
   * 0.3 means paying up cuts breakdowns by 70% — enough that maintenance is
   * usually right, not so much that skipping it is never survivable.
   */
  MAINTAINED_FAILURE_MULTIPLIER: 0.3,
  /**
   * A brand-new machine does not break in its first week. Not a grace period
   * for the player's benefit — a machine that fails on day one reads as the
   * purchase being broken rather than as equipment having a life.
   */
  BEDDING_IN_HOURS: 40,
  /**
   * One machine of a kind per station. §14.5: "never remove the last decision
   * at a station" — stacking three clamshells on one grill would.
   */
  ONE_PER_STATION: true,
  /**
   * `failuresPerKiloHour` is quoted per thousand run-hours because that is the
   * unit equipment is actually rated in, and because per-hour would be five
   * numbers with four leading zeros that nobody could compare at a glance.
   */
  HOURS_PER_RATED_UNIT: 1000,
} as const;
