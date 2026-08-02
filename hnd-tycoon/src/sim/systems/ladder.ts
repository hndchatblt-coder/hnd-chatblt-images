/**
 * The ladder, the unlocks and the daily headline. §15.1, §15.2, §15.3.
 *
 * One system because they are one loop: the day's figures decide the headline
 * AND whether a rung landed, and a rung landing is what opens the next thing
 * the player can do. Splitting them would mean computing the same day twice.
 *
 * **The ladder is the unlock system.** §15.1 forbids cash rewards, so a rung
 * awards a capability — a panel, a catalogue line, a rung of §14.2's machine
 * ladder. That also satisfies §14.5's *"gate on ladder rungs and venue count,
 * never purely behind cash"* without a second mechanism, and it is what makes
 * "systems arrive one per session" true rather than aspirational.
 */
import { HEADLINES, type DayFacts } from '@/config/headline';
import { LADDER, RUNGS, type Rung } from '@/config/ladder';
import { SHOPFRONT, type CatalogueItem } from '@/config/catalogue';
import { MACHINE_BY_ID } from '@/config/machines';
import { MARKETING_CHANNELS } from '@/config/marketing';
import { fairPriceBand } from './demand';
import { DAY_NAMES } from '@/config/time';
import { meanWaitMinutes } from './service';
import type { Constraint } from './bottleneck';
import { fixCostDollars } from './incidents';
import { priceOf } from '../actions';
import type { SimState } from '../state';
import type { System, World } from '../world';

const NONE = 0;
const ONE = 1;
const CENTS = 100;

/** Is a capability open yet? Everything not named by a rung is open from the start. */
export function unlocked(state: SimState, kind: string, id: string): boolean {
  const gate = RUNGS.find((r) => r.reward.kind === kind && r.reward.id === id);
  if (!gate) return true;
  return state.rungs.includes(gate.id);
}

/**
 * §15.1: *"Two rungs always in the HUD; the rest browsable."*
 *
 * **Not filtered to the current act**, and that is a fix rather than an
 * oversight. Filtering to Act I emptied the panel the moment the tenth rung
 * landed — which `bot:balanced` reaches inside seventy days — leaving the most
 * invested player in the game with no stated objective at all. §15's claim is
 * that the next objective is ALWAYS visible; an empty list is the readout
 * version of the dead zone §15.3 exists to forbid.
 *
 * So it falls through to the next act. Act II's rungs are unreachable in Act I
 * and that is exactly what makes them the right thing to show: "buy a second
 * shop with cash, not debt" is a real objective long before it is a possible
 * one.
 */
export function nextRungs(state: SimState, count = LADDER.VISIBLE): readonly Rung[] {
  return RUNGS.filter((r) => !state.rungs.includes(r.id)).slice(NONE, count);
}

/** The day, as the headline writer sees it. */
export function factsFor(state: SimState, world: World): DayFacts {
  const day = state.day;
  return {
    dayName: DAY_NAMES[world.clock.dayOfWeek] ?? 'day',
    covers: day.served,
    balked: day.balked,
    revenueCents: state.ledger.today('revenue').cents,
    wasteUnits: day.wasteUnits,
    unitsProduced: day.unitsProduced,
    meanWaitMinutes: meanWaitMinutes(day.waitTicks, day.served),
    stars: state.stars,
    starsYesterday: state.starsYesterday,
    bestSameDayCovers: state.bestCoversByWeekday[world.clock.dayOfWeek] ?? NONE,
    bestRevenueCents: state.bestRevenueCents,
    costsCents: state.ledger.todayExpenses().cents,
    incidentsOpen: state.incidents.length,
    staffOn: state.onToday,
    reviewsToday: day.reviews,
    // Filled by `headlineFor`, which is the only place that knows which
    // template won. Callers pass the run so far; the writer adds today.
    streak: state.headlineStreak,
  };
}

/**
 * The most notable true thing about the day. §15.2.
 *
 * Highest-weight applicable template wins — a shop that lost forty customers
 * AND set a revenue record was about the forty customers.
 *
 * `lastId` is yesterday's winner and `runSoFar` how many days it had already
 * run. When today's winner is the same template it gets to say something new
 * (see `HeadlineTemplate.again`): the fact repeating IS the news by then.
 */
export function headlineFor(
  facts: DayFacts,
  lastId: string | null = null,
  runSoFar = NONE,
): { line: string; id: string; streak: number } {
  let best = HEADLINES[HEADLINES.length - ONE];
  let bestWeight = -ONE;
  for (const template of HEADLINES) {
    if (!template.applies(facts)) continue;
    if (template.weight > bestWeight) {
      best = template;
      bestWeight = template.weight;
    }
  }
  if (!best) return { line: '', id: '', streak: NONE };
  const streak = best.id === lastId ? runSoFar + ONE : ONE;
  const today = { ...facts, streak };
  const line = streak > ONE && best.again ? best.again(today) : best.say(today);
  return { line, id: best.id, streak };
}

export class LadderSystem implements System {
  readonly name = 'ladder';

  /**
   * Runs at CLOSE, not at cycle end, because the headline is a verdict on the
   * trading day and the player reads it with the P&L.
   */
  onClose(world: World): void {
    const state = world.state;
    const facts = factsFor(state, world);

    const written = headlineFor(facts, state.headlineId, state.headlineStreak);
    state.headline = written.line;
    state.headlineId = written.id;
    state.headlineStreak = written.streak;
    world.record('headline', state.headline);

    // Accumulate the week BEFORE awarding, so a rung measured over a week can
    // see the day that completed it.
    state.weekWaste.wasted += facts.wasteUnits;
    state.weekWaste.produced += facts.unitsProduced;
    state.weekWaste.revenueCents += facts.revenueCents;
    state.weekWaste.wagesCents = state.ledger.total('wages').cents - state.weekWaste.wagesAtWeekStart;
    state.weekWaste.costsCents =
      state.ledger.totalExpenses().cents - state.weekWaste.costsAtWeekStart;

    this.award(state, world, facts);

    // A new week starts clean. Rolling seven days would let a good weekend
    // carry five bad days, which is not what §15.1 means by "a week".
    if (this.weekBoundary(world)) {
      state.weekWaste.wasted = NONE;
      state.weekWaste.produced = NONE;
      state.weekWaste.revenueCents = NONE;
      state.weekWaste.wagesAtWeekStart = state.ledger.total('wages').cents;
      state.weekWaste.costsAtWeekStart = state.ledger.totalExpenses().cents;
    }

    // Records, updated AFTER the headline so "best day yet" compares against
    // the days before it rather than against itself.
    const dow = world.clock.dayOfWeek;
    state.bestCoversByWeekday[dow] = Math.max(
      state.bestCoversByWeekday[dow] ?? NONE,
      facts.covers,
    );
    state.bestRevenueCents = Math.max(state.bestRevenueCents, facts.revenueCents);
    state.starsYesterday = state.stars;

    // §15.3's dead-zone detector needs to know whether today offered anything
    // worth doing. Recorded per day; the harness reads the longest gap.
    if (hadDecision(state)) state.lastDecisionDay = state.dayIndex;
    world.record('decisionGap', decisionGap(state));
  }

  /**
   * **At most one rung per day**, in ladder order. §15.1: *"systems arrive one
   * per session."*
   *
   * Measured, not assumed: without this cap the shop banks `fiftyCovers`,
   * `thousandDay` and `hundredCovers` on its FIRST trading day — 139 covers and
   * $2,724 on a Sunday clears all three at once — and by day 6 it is holding six
   * of the ten Act I rungs. Three panels opening in one evening is not pacing,
   * it is a firehose, and the player learns none of them.
   *
   * The alternative was to raise §15.1's thresholds until one day clears one
   * rung. Rejected: those figures are the spec's verbatim, they read as human
   * targets a burger shop owner would recognise, and moving them to fit this
   * shop's demand curve would hide a demand-curve question inside a progression
   * config. Capping the RATE is reversible; rewriting the spec's numbers is not.
   *
   * One consequence worth stating rather than leaving to be discovered: the
   * three weekly rungs can only land on the payroll boundary, and the cap takes
   * one of them, so a shop that clears waste, labour AND profit in its first
   * good week banks them over three weeks. That is the pacing working, not
   * failing — but it is the kind of true-and-surprising thing that gets "fixed"
   * by somebody who has not read this paragraph.
   */
  private award(state: SimState, world: World, facts: DayFacts): void {
    for (const rung of RUNGS) {
      if (state.rungs.includes(rung.id)) continue;
      if (rung.act !== ONE) continue;
      if (!this.met(rung, state, world, facts)) continue;
      state.rungs.push(rung.id);
      // §15.1: a capability, never cash. Nothing here touches the ledger, and
      // there is a test asserting exactly that.
      state.justUnlocked = rung.id;
      world.record('rung', rung.label);
      return;
    }
  }

  private met(rung: Rung, state: SimState, world: World, facts: DayFacts): boolean {
    switch (rung.id) {
      case 'fiftyCovers':
        return facts.covers >= LADDER.COVERS_EARLY;
      case 'hundredCovers':
        return facts.covers >= LADDER.COVERS_MID;
      case 'thousandDay':
        return facts.revenueCents >= LADDER.REVENUE_DAY * 100;
      case 'secondStaff':
        return state.onToday >= LADDER.STAFF_ON_FLOOR;
      case 'zeroWalkouts':
        return facts.covers > NONE && facts.balked === NONE;
      case 'fourStars':
        return state.stars >= LADDER.STARS;
      case 'unattendedService':
        return (
          facts.covers > NONE &&
          state.stations.some((s) => s.machines.length > NONE)
        );
      // The weekly ones only resolve on the shop's own week boundary. A rolling
      // seven days would let a good weekend carry five bad days.
      case 'wasteUnderEight':
        return this.weekBoundary(world) && state.weekWaste.produced > NONE
          ? state.weekWaste.wasted / state.weekWaste.produced < LADDER.WASTE_FRACTION
          : false;
      case 'labourUnderThirtyTwo':
        return this.weekBoundary(world) && state.weekWaste.revenueCents > NONE
          ? state.weekWaste.wagesCents / state.weekWaste.revenueCents <
              LADDER.LABOUR_FRACTION
          : false;
      case 'profitableWeek':
        return (
          this.weekBoundary(world) &&
          state.weekWaste.revenueCents > state.weekWaste.costsCents
        );
      default:
        return false;
    }
  }

  private weekBoundary(world: World): boolean {
    return world.clock.dayOfWeek === world.clock.daysPerWeek - ONE;
  }
}

/**
 * §15.3: *"`bot:balanced` must never go more than 3 game days without a
 * meaningful decision available."*
 *
 * **A meaningful decision is one the player could take TODAY that would move
 * the thing currently holding the shop back.** Not "something exists that they
 * have not bought" — that is true of almost every day a shop ever trades, and a
 * detector that can never report a gap is a gate that cannot fail. This project
 * has shipped one of those before (D030); the first draft of this function was
 * another (it counted `hire`, which is unowned and affordable forever, so it
 * measured `gap=0` on all 84 days probed, including the flat ones).
 *
 * So it is anchored to §13's readout, which is the game's own published
 * statement of what is wrong:
 *
 *   something is broken and the repair is within reach; or
 *   the readout names a constraint and something affordable ADDRESSES it.
 *
 * "Addresses" is specific per constraint kind, and one kind — `space` — has no
 * answer in the catalogue at all, because you cannot buy floor at Leichhardt.
 * That is the case that makes the detector falsifiable: a shop wedged against
 * its own walls with everything else fine genuinely has nothing to do, and
 * §15.3 exists to make sure the game never leaves the player there.
 *
 * What deliberately does NOT count: a rung existing, cash existing, or an
 * unowned item that has nothing to do with the constraint. Those are ambient.
 */
export function hadDecision(state: SimState): boolean {
  const cash = state.ledger.cash.cents;

  // Something is broken and the repair is within reach.
  for (const incident of state.incidents) {
    if (fixCostDollars(incident) * CENTS <= cash) return true;
  }

  const constraint = state.bottleneck;
  if (!constraint) return false;

  for (const item of SHOPFRONT) {
    if (item.kind === 'machine' && !unlocked(state, 'machine', item.machine)) continue;
    if (item.kind === 'equipment' && !unlocked(state, 'catalogue', item.id)) continue;
    if (priceOf(state, item) > cash) continue;
    if (addresses(item, constraint, state)) return true;
  }

  return false;
}

/** Would buying this move the named constraint? Nothing else is a decision. */
function addresses(item: CatalogueItem, constraint: Constraint, state: SimState): boolean {
  switch (constraint.kind) {
    // Not enough hands. One thing fixes that, and it is not equipment.
    case 'staff':
      return item.kind === 'hire';
    // A named station is starving the line. A second one, or a machine that
    // takes over its work — but only if that machine is not already bolted on.
    case 'station': {
      if (item.kind === 'equipment') return item.station === constraint.subject;
      if (item.kind === 'machine') {
        const spec = MACHINE_BY_ID[item.machine];
        if (!spec || spec.station !== constraint.subject) return false;
        return !state.stations.some((st) => st.machines.includes(item.machine));
      }
      return false;
    }
    // Capacity to spare, nobody coming. Seating raises both how long people
    // will wait and what they spend. Pricing and marketing cost nothing to
    // CHANGE, so they only count as a move when there is something to move to:
    // a price outside the band people at this rating accept, or a week of the
    // cheapest channel the shop can actually pay for.
    case 'demand': {
      if (item.kind === 'equipment' && item.id === 'seating') return true;
      if (!unlocked(state, 'panel', 'trade')) return false;
      const band = fairPriceBand(state.stars);
      if (state.priceMultiplier < band.low || state.priceMultiplier > band.high) return true;
      const cheapest = Math.min(...MARKETING_CHANNELS.map((c) => c.weeklyCost));
      return cheapest * CENTS <= state.ledger.cash.cents;
    }
    // You cannot buy floor. This is the branch that lets the gate fail.
    case 'space':
      return false;
    default:
      return false;
  }
}

/**
 * Days since anything was worth doing.
 *
 * Takes no "today" argument on purpose. It used to, and the two call sites
 * passed two different things — `clock.dayIndex` (which has already rolled to
 * tomorrow by the time the harness samples) and `state.dayIndex` (the day that
 * actually traded). Every bot read a gap of at least 1 on every day of its
 * life, which made 276 ordinary days look like dead ones and hid the real
 * seven-day run underneath them. One convention, owned here.
 */
export function decisionGap(state: SimState): number {
  return state.dayIndex - state.lastDecisionDay;
}

/** Plain English for the HUD, so a rung reads as a door rather than a badge. */
export function rungLine(rung: Rung): string {
  return `${rung.label} — ${rung.unlocks}`;
}

/** Total banked, for the report. */
export function ladderProgress(state: SimState): string {
  const act1 = RUNGS.filter((r) => r.act === ONE).length;
  return `${state.rungs.length}/${act1}`;
}
