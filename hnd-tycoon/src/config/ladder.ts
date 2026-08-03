/**
 * The progression ladder. DESIGN.md §15.1, and §26 on acts as a dimension.
 *
 * **Never award a flat cash bonus.** §15.1 is unambiguous: *"award a
 * capability, so the reward changes what the player can do rather than
 * skipping a decision."* A cash prize for serving fifty covers hands the player
 * the next purchase; a capability hands them the next question.
 *
 * That makes the ladder the unlock system rather than a scoreboard beside one,
 * which is also how §14.5's *"gate on ladder rungs and venue count"* gets
 * satisfied without inventing a second mechanism. A rung is the only thing in
 * this game that opens a door.
 *
 * §26: `act` is a dimension from the start. Act III's rungs are authored later
 * and the system must already carry them — a ladder that assumes one act is a
 * rewrite the moment there are two.
 */

/** What a rung opens. Never money. */
export type Capability =
  /** A catalogue id becomes purchasable. */
  | { readonly kind: 'catalogue'; readonly id: string }
  /** A whole panel of the HUD appears. Systems arrive one per session. */
  | { readonly kind: 'panel'; readonly id: 'roster' | 'trade' | 'parLevels' }
  /** A machine rung on §14.2's ladder. */
  | { readonly kind: 'machine'; readonly id: string };

export interface Rung {
  readonly id: string;
  /** What the player is asked to do. Plain, specific, checkable. */
  readonly label: string;
  /** §26 — acts are a dimension from day one, not a later refactor. */
  readonly act: 1 | 2 | 3;
  readonly tier: 'early' | 'mid' | 'late';
  /** What it opens. §15.1: a capability, never cash. */
  readonly reward: Capability;
  /** One line, shown when it lands. Says what you can now DO. */
  readonly unlocks: string;
}

/**
 * §15.1's list, in its order, with a capability attached to each.
 *
 * The pairing is deliberate and it is the design work: each rung opens the
 * thing you would want next *because of what you just proved you could do*.
 * Serving fifty covers in a day is the moment a second pair of hands starts
 * making sense, so that is the rung that opens the roster.
 *
 * **The roster is NOT on this ladder, and that is the rule the rest follow.**
 * It was rung one for a day. But §15.1's reward *"changes what the player can
 * do"*, and the shop is handed over with staff already on a default roster —
 * so gating it does not GIVE a capability, it confiscates one and hands it
 * back. Locks and unlocks are not the same shape.
 *
 * It also showed up in the harness before it showed up in the argument. With
 * the roster behind rung one and rungs landing one a day, `bot:balanced` — the
 * bot whose entire edge is reading the constraint and staffing to it — lost
 * $5,679 over ninety days to two shut days, and `bot:roboboss`, who barely
 * rosters, sailed to +25.0% against step 12's 25% ceiling. Handicapping the
 * representative player was never the intent.
 *
 * **The trade panel hangs off `fiftyCovers` — the first rung anyone reaches.**
 * It was on `secondStaff` first, which requires two people rostered, which
 * `bot:naive` — a player who buys advertising instead of hiring — never does.
 * That made §25.2's naive trap unreachable: naive spent AUD 0 on marketing
 * across seventy days and finished indistinguishable from the shop nobody
 * touched. A gate that quietly disarms the game's central trap is the wrong
 * gate, however tidy it reads.
 */
export const RUNGS: readonly Rung[] = [
  {
    id: 'fiftyCovers',
    label: 'Serve 50 covers in a day',
    act: 1,
    tier: 'early',
    reward: { kind: 'panel', id: 'trade' },
    unlocks: 'Prices and marketing. What you charge is a decision now.',
  },
  {
    id: 'secondStaff',
    label: 'Get a second pair of hands on the floor',
    act: 1,
    tier: 'early',
    reward: { kind: 'catalogue', id: 'drinks' },
    unlocks: 'A holding cabinet. With two of you on, cooking ahead is worth it.',
  },
  {
    id: 'zeroWalkouts',
    label: 'A full day with nobody walking out',
    act: 1,
    tier: 'early',
    reward: { kind: 'catalogue', id: 'seating' },
    unlocks: 'Tables. People wait longer in a room worth sitting in.',
  },
  {
    id: 'thousandDay',
    label: 'Your first $1,000 day',
    act: 1,
    tier: 'early',
    reward: { kind: 'catalogue', id: 'assembly' },
    unlocks: 'A second bench. Somewhere else to build while the grill catches up.',
  },
  {
    id: 'wasteUnderEight',
    label: 'A week with waste under 8%',
    act: 1,
    tier: 'early',
    reward: { kind: 'panel', id: 'parLevels' },
    unlocks: 'You choose how far ahead the kitchen cooks.',
  },
  {
    id: 'fourStars',
    label: 'Reach 4.0 stars',
    act: 1,
    tier: 'mid',
    reward: { kind: 'machine', id: 'sauceRail' },
    unlocks: 'The sauce rail. Dressing a burger stops being a job.',
  },
  {
    id: 'hundredCovers',
    label: '100 covers in a day',
    act: 1,
    tier: 'mid',
    reward: { kind: 'machine', id: 'conveyorToaster' },
    unlocks: 'The conveyor toaster, if toast is ever what holds you up.',
  },
  {
    id: 'labourUnderThirtyTwo',
    label: 'A week with labour under 32%',
    act: 1,
    tier: 'mid',
    reward: { kind: 'machine', id: 'clamshell' },
    unlocks: 'The clamshell. No flip, no watching, one cook level forever.',
  },
  {
    id: 'profitableWeek',
    label: 'A week trading profitably after wages',
    act: 1,
    tier: 'mid',
    reward: { kind: 'machine', id: 'kiosk' },
    unlocks: 'A kiosk. It takes orders; the Regulars liked being greeted.',
  },
  {
    id: 'unattendedService',
    label: 'A full service with an automated station',
    act: 1,
    tier: 'mid',
    reward: { kind: 'machine', id: 'autoLiftFryer' },
    unlocks: 'The auto-lift fryer. The basket pulls itself.',
  },
  /**
   * Act II's first rung is authored here rather than later, because §26 says
   * the ladder must carry acts as a dimension from the start and an untested
   * dimension is a claim. It is unreachable in Act I — which is the point.
   */
  {
    id: 'secondVenue',
    label: 'Buy a second shop with cash, not debt',
    act: 2,
    tier: 'mid',
    reward: { kind: 'machine', id: 'roboFry' },
    unlocks: 'The robotic fry station. One shop was never the business for it.',
  },
];

export const RUNGS_BY_ID: Readonly<Record<string, Rung>> = Object.fromEntries(
  RUNGS.map((r) => [r.id, r]),
);

export const LADDER = {
  /** §15.1: "Two rungs always in the HUD; the rest browsable." */
  VISIBLE: 2,
  /**
   * Rungs that may land in one trading day. §15.1's "one per session", and
   * D055 measured what happens without it: three on the first Sunday.
   *
   * Shared by both award paths — the intra-day one that makes the ladder feel
   * responsive, and the close one that settles rungs needing a whole day.
   */
  PER_DAY: 1,
  /**
   * The one rung the per-day cap may not delay. §19's hook: *"first 30 minutes
   * — watch food get made, understand the chain, see one bottleneck named,
   * complete one ladder rung."*
   *
   * Measured, and it was failing. `thousandDay` fires at about forty-five
   * covers because this shop takes over twenty dollars a head, so on two seeds
   * in three it consumed day zero's single rung and `fiftyCovers` — the rung
   * that opens pricing and marketing — waited until the next day. At 1x that is
   * twenty real minutes before the player can touch the two levers they came
   * looking for, and a playtester reported exactly that: *"you can't boost
   * customers by doing weekly specials or paid advertising."*
   *
   * A player who does not see the ladder answer them in their first session
   * does not learn there is a ladder. So the first rung is exempt: at most two
   * things land on day zero, one of which is the game explaining itself.
   */
  ALWAYS_IMMEDIATE: 'fiftyCovers',
  /**
   * Rungs measured over a week need a week. Checked on the payroll boundary so
   * "a week" means the shop's week and not a rolling seven days, which would
   * let a good Saturday and a good Sunday carry five bad days.
   */
  WEEK_RUNGS: ['wasteUnderEight', 'labourUnderThirtyTwo', 'profitableWeek'] as const,
  /** Thresholds, all from §15.1 verbatim. */
  COVERS_EARLY: 50,
  COVERS_MID: 100,
  REVENUE_DAY: 1000,
  STARS: 4.0,
  WASTE_FRACTION: 0.08,
  LABOUR_FRACTION: 0.32,
  STAFF_ON_FLOOR: 2,
} as const;
