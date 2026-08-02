/**
 * Contracts. DESIGN.md §16.
 *
 * *"A bounded external job with a fixed deadline, a specific requirement and a
 * real reward."*
 *
 * **The exit criterion is a safety property, not a balance one:** *"a contract
 * can be failed without the run becoming unrecoverable, and a player
 * mid-recovery can decline indefinitely and still progress."* Everything in
 * this file is shaped by it.
 *
 * Three consequences, each of which is the thing that would otherwise break it:
 *
 * 1. **Nothing here posts a negative to the ledger, ever.** Failing costs
 *    reputation. A forfeited deposit lands hardest on the shop least able to
 *    absorb it — which is precisely the shop most likely to fail — and §10
 *    forbids a state the player cannot come back from. There is a test that
 *    watches `ledger.post` across a failure and requires it to be silent.
 * 2. **An ignored offer lapses; it never becomes a failure.** The player this
 *    protects is the one who has not opened the app for two days, and §4.3
 *    forbids punishing them for it. Lapsing is free and leaves no mark.
 * 3. **Nothing on the §15.1 ladder depends on a contract.** Declining forever
 *    costs progress nothing, because rungs are measured on the shop's own
 *    trading. A contract can only ever ADD a capability early.
 *
 * §26: deadlines are game days. `Capability` is §15.1's, unchanged, so a
 * contract opens a door exactly as a rung does. Later acts re-skin these as
 * regional launches and resupply windows without the shape moving.
 */
import {
  CONTRACTS,
  CONTRACT_BY_ID,
  CONTRACT_RULES,
  type Contract,
} from '@/config/contracts';
import { MARKETING } from '@/config/marketing';
import { meanWaitMinutes } from './service';
import type { SimState } from '../state';
import type { System, World } from '../world';

const NONE = 0;
const ONE = 1;

/** Is the system open to this shop at all? §16 unlocks it at 4.0 stars. */
export function contractsUnlocked(state: SimState): boolean {
  return state.stars >= CONTRACT_RULES.UNLOCK_STARS;
}

/** Everything the shop is good enough to be offered. */
export function eligible(state: SimState): readonly Contract[] {
  return CONTRACTS.filter((c) => state.stars >= c.minStars);
}

/**
 * How far through the job the shop is, 0..1, for the readout.
 *
 * The influencer is inverted and that is not a special case bolted on — it is
 * the only contract whose target is a CEILING. Being under seven minutes is
 * passing; the progress bar has to mean the same thing on every row or it
 * means nothing on any of them.
 */
export function progressOf(state: SimState): number {
  const active = state.contract;
  if (!active) return NONE;
  const spec = CONTRACT_BY_ID[active.id];
  if (!spec) return NONE;
  if (spec.stresses === 'serviceQuality') {
    return active.progress <= spec.target ? ONE : NONE;
  }
  return Math.min(ONE, active.progress / spec.target);
}

/** Plain English for the HUD. One line, always with the days left in it. */
export function contractLine(state: SimState): string | null {
  const active = state.contract;
  if (!active) return null;
  const spec = CONTRACT_BY_ID[active.id];
  if (!spec) return null;
  const left = active.dueOnDay - state.dayIndex;
  const days = left === ONE ? '1 day' : `${left} days`;
  if (spec.stresses === 'serviceQuality') {
    return `${spec.label} — keep the wait under ${spec.target} minutes. ${days} left.`;
  }
  return `${spec.label} — ${Math.floor(active.progress)} of ${spec.target}. ${days} left.`;
}

export class ContractsSystem implements System {
  readonly name = 'contracts';

  /**
   * Offer, expire, and score. All at close, because a contract is measured in
   * whole trading days and §16 puts every deadline in game days.
   */
  onClose(world: World): void {
    this.accrue(world);
    this.settle(world);
    this.offer(world);
    // What people think of you is about lately. §7.4 weights reviews by
    // recency; goodwill has to fade the same way or contracts become a rating
    // you buy once and keep forever, which is the stat-with-no-downside this
    // project bans by pillar.
    world.state.contractGoodwill *= ONE - CONTRACT_RULES.GOODWILL_DECAY_PER_DAY;
  }

  /**
   * Count today towards the job. Each stress reads a different existing
   * counter, which is the point of having five of them.
   */
  private accrue(world: World): void {
    const state = world.state;
    const active = state.contract;
    if (!active) return;
    const spec = CONTRACT_BY_ID[active.id];
    if (!spec) return;

    switch (spec.stresses) {
      // §18's prep machinery, pointed at somebody else's function. Whatever the
      // kitchen made beyond what it sold is what is in the cool room for Friday.
      case 'prepAhead':
        active.progress += Math.max(NONE, state.day.unitsProduced - state.day.served);
        break;
      // Forty covers a day, every weekday. A day short is a day short — this
      // one counts qualifying DAYS, not covers, so one enormous Tuesday cannot
      // cover a missed Wednesday.
      case 'dailyQuota':
        if (state.day.served >= spec.target) active.progress += ONE;
        break;
      // A week's trading with two of yours somewhere else. The staff are
      // removed by `onOpen`; the target is covers served in spite of it.
      case 'staffAway':
        active.progress += state.day.served;
        break;
      case 'dayDiverted':
        active.progress += state.day.served;
        break;
      // The only one measured as a ceiling. Worst mean wait across the window
      // is what counts, because one good lunch does not undo the visit.
      case 'serviceQuality':
        active.progress = Math.max(
          active.progress,
          meanWaitMinutes(state.day.waitTicks, state.day.served),
        );
        break;
    }
  }

  /** Deadline day: pay it, or mark it failed. Either way it is over. */
  private settle(world: World): void {
    const state = world.state;
    const active = state.contract;
    if (!active || state.dayIndex < active.dueOnDay) return;
    const spec = CONTRACT_BY_ID[active.id];
    if (!spec) {
      state.contract = null;
      return;
    }

    const passed =
      spec.stresses === 'serviceQuality'
        ? active.progress <= spec.target
        : active.progress >= spec.target;

    if (passed) {
      if (spec.feeDollars > NONE) {
        state.ledger.post('revenue', {
          cents: spec.feeDollars * 100,
          currency: state.ledger.cash.currency,
        });
      }
      if (spec.reward) state.contractRewards.push(spec.reward);
      state.contractGoodwill += spec.reputationSwing;
      // §16: the influencer buys awareness rather than money, and it decays
      // like any other awareness — a spike, not a permanent gift.
      if (spec.stresses === 'serviceQuality') {
        state.marketingAwareness = Math.min(
          MARKETING.MAX_AWARENESS,
          state.marketingAwareness + CONTRACT_RULES.INFLUENCER_AWARENESS,
        );
      }
      state.contractsDone += ONE;
      world.record('contractDone', spec.label);
    } else {
      // **Reputation only. Nothing here touches the ledger and a test watches
      // it.** §10: no state the player cannot come back from, and a cash
      // penalty on a failed job is one.
      state.contractGoodwill -= spec.reputationSwing;
      state.contractsFailed += ONE;
      world.record('contractFailed', spec.label);
    }
    state.contract = null;
    state.staffAway = NONE;
  }

  /** §16: "one offered every 4-6 game days" once the shop is good enough. */
  private offer(world: World): void {
    const state = world.state;
    if (state.contract) return;
    if (!contractsUnlocked(state)) return;

    // An offer nobody answered goes away quietly. Not a failure, not a mark.
    if (state.contractOffer && state.dayIndex >= state.contractOffer.lapsesOnDay) {
      world.record('contractLapsed', state.contractOffer.id);
      state.contractOffer = null;
      state.nextOfferDay = state.dayIndex + this.gap(world);
    }
    if (state.contractOffer) return;
    if (state.dayIndex < state.nextOfferDay) return;

    const pool = eligible(state);
    if (pool.length === NONE) return;
    const pick = pool[world.rngFor(this.name).int(NONE, pool.length - ONE)];
    if (!pick) return;
    state.contractOffer = {
      id: pick.id,
      lapsesOnDay: state.dayIndex + CONTRACT_RULES.OFFER_OPEN_DAYS,
    };
    world.record('contractOffered', pick.label);
  }

  private gap(world: World): number {
    return world
      .rngFor(this.name)
      .int(CONTRACT_RULES.OFFER_EVERY_MIN_DAYS, CONTRACT_RULES.OFFER_EVERY_MAX_DAYS);
  }

  /**
   * The festival takes people off the floor for its whole run. §8's labour
   * problem, arriving from outside for once.
   *
   * Applied at open rather than at accept, because `openDay` rebuilds
   * `workingToday` every morning — the same trap D043 caught with `staffAbsent`,
   * where a write at day end was silently undone before anybody read it.
   */
  onOpen(world: World): void {
    const state = world.state;
    state.staffAway = NONE;
    const active = state.contract;
    if (!active) return;
    const spec = CONTRACT_BY_ID[active.id];
    if (!spec || spec.stresses !== 'staffAway') return;

    const away = Math.min(CONTRACT_RULES.FESTIVAL_STAFF_AWAY, state.workingToday.size - ONE);
    if (away <= NONE) return;
    // Never the last pair of hands. A shop with nobody in it is a fail state
    // wearing a contract's clothes, and §10 does not allow one.
    for (const id of [...state.workingToday].slice(NONE, away)) {
      state.workingToday.delete(id);
    }
    state.onToday = state.workingToday.size;
    state.staffAway = away;
  }
}
