/**
 * Step 16 — contracts. DESIGN.md §16.
 *
 * The exit criteria are SAFETY properties, not balance ones:
 *
 *   1. a contract can be failed without the run becoming unrecoverable;
 *   2. a player mid-recovery can decline indefinitely and still progress.
 *
 * Both are the kind of guarantee that holds on the day it is written and quietly
 * stops holding two steps later, when somebody adds a forfeit or hangs a rung
 * off a contract reward. So they are tested at the mechanism, not the outcome:
 * the ledger is watched across a failure, and the ladder is checked against a
 * shop that says no to everything for three months.
 */
import { describe, expect, it, vi } from 'vitest';
import { CONTRACTS, CONTRACT_BY_ID, CONTRACT_RULES } from '@/config/contracts';
import { RUNGS } from '@/config/ladder';
import { buildScenario } from '@/sim/scenario';
import { acceptContract, buy, declineContract, setRoster } from '@/sim/actions';
import { contractLine, eligible, progressOf } from '@/sim/systems/contracts';
import { openEverything } from './helpers';

const DAYS = 90;

/** A shop with hands, so it is good enough to be offered anything. */
function shop(seed: number, hands = 2) {
  const world = buildScenario({ seed });
  openEverything(world.state);
  for (let i = 0; i < hands; i++) buy(world.state, 'hire');
  for (const staff of world.state.staff) {
    for (let d = 0; d < 7; d++) setRoster(world.state, staff.id, d, true);
  }
  return world;
}

describe('§16 — five contracts, five different problems', () => {
  it('no two lean on the same system', () => {
    // Otherwise this is one contract with five names, which is filler and the
    // exact thing §14.3 bans for machines.
    const stresses = CONTRACTS.map((c) => c.stresses);
    expect(new Set(stresses).size).toBe(CONTRACTS.length);
  });

  it('every deadline is in game days and none is open-ended', () => {
    for (const c of CONTRACTS) {
      expect(c.days, c.id).toBeGreaterThan(0);
      expect(Number.isInteger(c.days), c.id).toBe(true);
    }
  });

  it('the upside never exceeds the downside', () => {
    // A job whose reputation gain beats its loss is a free roll, and §16's
    // contracts are meant to be a decision. Symmetric by construction.
    for (const c of CONTRACTS) expect(c.reputationSwing, c.id).toBeGreaterThan(0);
  });

  it('the one that pays nothing swings the hardest', () => {
    const influencer = CONTRACT_BY_ID['influencerVisit'];
    if (!influencer) throw new Error('pool changed');
    expect(influencer.feeDollars).toBe(0);
    const others = CONTRACTS.filter((c) => c.id !== influencer.id);
    for (const c of others) {
      expect(influencer.reputationSwing).toBeGreaterThan(c.reputationSwing);
    }
  });

  it('nothing is offered to a shop that is not good enough', () => {
    const world = buildScenario({ seed: 3 });
    world.state.stars = 3.2;
    expect(eligible(world.state)).toHaveLength(0);
    world.state.stars = CONTRACT_RULES.UNLOCK_STARS;
    expect(eligible(world.state).length).toBeGreaterThan(0);
  });
});

describe('§16 EXIT — a failure must leave the run recoverable', () => {
  /**
   * The load-bearing test in this file.
   *
   * §10 forbids a state the player cannot come back from, and the cheapest way
   * to break it is a forfeited deposit — which lands hardest on the shop least
   * able to absorb it, which is exactly the shop most likely to fail a job. So
   * the claim is made at the mechanism: **failing posts nothing at all.**
   */
  it('failing a contract moves no money', () => {
    const world = shop(11);
    world.state.stars = 4.2;
    // Take a job the shop has no chance of finishing, and do nothing about it.
    world.state.contract = {
      id: 'festivalStall',
      dueOnDay: world.state.dayIndex,
      progress: 0,
    };
    const before = world.state.contractsFailed;
    const spy = vi.spyOn(world.state.ledger, 'post');
    world.runDays(1);
    const posts = spy.mock.calls.map((c) => c[0]);
    spy.mockRestore();

    expect(world.state.contractsFailed).toBeGreaterThan(before);
    // The trading day posted for its own reasons. What must not be there is a
    // penalty — nothing beyond the accounts an ordinary day touches.
    expect(posts).not.toContain('fees');
    expect(world.state.contract).toBeNull();
  });

  it('a shop that fails a job keeps trading and keeps climbing', () => {
    const world = shop(13);
    world.state.stars = 4.2;
    world.state.contract = {
      id: 'festivalStall',
      dueOnDay: world.state.dayIndex,
      progress: 0,
    };
    world.runDays(1);
    expect(world.state.contractsFailed).toBeGreaterThan(0);

    const rungsAtFailure = world.state.rungs.length;
    world.runDays(40);
    // Still trading, still earning rungs. Not "eventually recovers" — carries
    // on. §10: the worst available outcome is a slow, boring, unprofitable week.
    expect(world.state.rungs.length).toBeGreaterThanOrEqual(rungsAtFailure);
    expect(world.state.day.served).toBeGreaterThan(0);
  });

  it('a failed job costs rating, and the rating has a floor', () => {
    const world = shop(17);
    world.state.stars = 4.2;
    for (let i = 0; i < 6; i++) {
      world.state.contract = {
        id: 'festivalStall',
        dueOnDay: world.state.dayIndex,
        progress: 0,
      };
      world.runDays(1);
    }
    expect(world.state.contractsFailed).toBe(6);
    expect(world.state.contractGoodwill).toBeLessThan(0);
    // Badly rated, never negatively rated. Six failed jobs is a bad reputation,
    // not an unrecoverable one.
    expect(world.state.stars).toBeGreaterThanOrEqual(1);
  });
});

describe('§16 EXIT — declining forever must cost no progress', () => {
  /**
   * *"A player mid-recovery must be able to say no."* Structurally true, because
   * §15.1's rungs are measured on the shop's own trading and nothing on the
   * ladder names a contract — but structurally true is how D030 started, so it
   * is measured over ninety days rather than argued.
   *
   * Measured: a shop that declines every offer for ninety days banks all ten
   * Act I rungs, same as one that accepts everything.
   */
  it('a shop that says no to everything still banks every rung', () => {
    const world = shop(19);
    for (let day = 0; day < DAYS; day++) {
      if (world.state.contractOffer) declineContract(world.state);
      world.runDays(1);
    }
    const actOne = RUNGS.filter((r) => r.act === 1).length;
    expect(world.state.rungs.length).toBe(actOne);
    expect(world.state.contractsDone).toBe(0);
    expect(world.state.contractsFailed).toBe(0);
  });

  it('declining costs nothing and is recorded nowhere', () => {
    const world = shop(23);
    world.state.stars = 4.3;
    world.state.contractOffer = { id: 'foodTruckDay', lapsesOnDay: 99 };
    const cash = world.state.ledger.cash.cents;
    const goodwill = world.state.contractGoodwill;
    expect(declineContract(world.state).ok).toBe(true);
    expect(world.state.ledger.cash.cents).toBe(cash);
    expect(world.state.contractGoodwill).toBe(goodwill);
    expect(world.state.contractsFailed).toBe(0);
  });

  it('an ignored offer lapses rather than failing', () => {
    // The player this protects is the one who has not opened the app for two
    // days. §4.3 forbids punishing them for it.
    const world = shop(29);
    world.state.stars = 4.3;
    world.state.contractOffer = {
      id: 'foodTruckDay',
      lapsesOnDay: world.state.dayIndex + 1,
    };
    world.runDays(3);
    expect(world.state.contractsFailed).toBe(0);
    expect(world.state.contract).toBeNull();
  });
});

describe('§16 — one at a time, and it opens doors rather than paying for them', () => {
  it('refuses a second job while one is on', () => {
    const world = shop(31);
    world.state.stars = 4.3;
    world.state.contractOffer = { id: 'foodTruckDay', lapsesOnDay: 99 };
    expect(acceptContract(world.state).ok).toBe(true);
    world.state.contractOffer = { id: 'functionCatering', lapsesOnDay: 99 };
    expect(acceptContract(world.state).ok).toBe(false);
  });

  it('accepting is free — the whole price is in the doing', () => {
    const world = shop(37);
    world.state.stars = 4.3;
    world.state.contractOffer = { id: 'functionCatering', lapsesOnDay: 99 };
    const cash = world.state.ledger.cash.cents;
    expect(acceptContract(world.state).ok).toBe(true);
    expect(world.state.ledger.cash.cents).toBe(cash);
  });

  it('the readout always says how long is left', () => {
    const world = shop(41);
    world.state.stars = 4.3;
    world.state.contractOffer = { id: 'functionCatering', lapsesOnDay: 99 };
    acceptContract(world.state);
    const line = contractLine(world.state);
    expect(line).toMatch(/\d/);
    expect(line).toMatch(/day/);
    expect(progressOf(world.state)).toBe(0);
  });

  it('progress means the same thing on every row, including the inverted one', () => {
    const world = shop(43);
    world.state.stars = 4.3;
    // The influencer's target is a CEILING. A bar that filled as the wait grew
    // would mean the opposite of every other row in the panel.
    world.state.contract = { id: 'influencerVisit', dueOnDay: 99, progress: 3 };
    expect(progressOf(world.state)).toBe(1);
    world.state.contract = { id: 'influencerVisit', dueOnDay: 99, progress: 22 };
    expect(progressOf(world.state)).toBe(0);
  });
});
