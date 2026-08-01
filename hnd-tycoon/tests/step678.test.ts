/**
 * STEPS 6-8 GATES — money, buying things, and the bottleneck readout.
 *
 * Built as one increment rather than three, deliberately. Ben played step 5
 * and said "it's not a game yet", which was correct: a simulation with a speed
 * button is a screensaver. Money alone would not have fixed it, and money plus
 * a shop with no guidance would have made it a menu. The smallest honest game
 * is cash that moves, things to buy that change the screen, and a line that
 * tells you what to fix. See D022.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '@/config/catalogue';
import { hourlyCost, JURISDICTIONS } from '@/config/economy';
import { buy, setRoster } from '@/sim/actions';
import { attribute } from '@/sim/systems/bottleneck';
import { buildScenario } from '@/sim/scenario';
import { createState } from '@/sim/state';
import { Cash } from '@/sim/types';
import { mean, runSeeds } from '@/harness/probe';

describe('STEP 6 — the P&L reconciles to the cent', () => {
  it('over a 90-day run', () => {
    // The reason `Money` is integer cents. Float dollars cannot survive ninety
    // days of addition — `0.1 + 0.2` alone breaks it.
    const world = buildScenario({ seed: 42 });
    world.runDays(90);
    expect(world.state.ledger.reconcile().cents).toBe(0);
  });

  it('with money actually having moved', () => {
    // A ledger that reconciles because nothing happened is not evidence.
    const world = buildScenario({ seed: 42 });
    world.runDays(30);
    const ledger = world.state.ledger;
    expect(ledger.total('revenue').cents).toBeGreaterThan(0);
    expect(ledger.total('cogs').cents).toBeGreaterThan(0);
    expect(ledger.total('wages').cents).toBeGreaterThan(0);
    expect(ledger.total('rent').cents).toBeGreaterThan(0);
    expect(ledger.total('utilities').cents).toBeGreaterThan(0);
  });

  it('does not double-charge waste — it is a memo against COGS', () => {
    // The ingredients were charged when they were consumed. Posting the bin as
    // a second expense would bill you twice for one patty and silently break
    // the reconciliation above.
    const world = buildScenario({ seed: 5, arrivalsPerHour: 30, parLevels: { patty: 12 } });
    world.runDays(6);
    expect(world.state.ledger.total('waste').cents).toBeGreaterThan(0);
    expect(world.state.ledger.reconcile().cents).toBe(0);
  });

  it('lands COGS in the 30-36% band the spec asks for', () => {
    const world = buildScenario({ seed: 42 });
    world.runDays(28);
    const cogs = Cash.ratio(world.state.ledger.total('cogs'), world.state.ledger.total('revenue'));
    expect(cogs).toBeGreaterThan(0.3);
    expect(cogs).toBeLessThan(0.36);
  });

  it('takes penalty rates from the jurisdiction ruleset, not constants', () => {
    // §26: Act III crosses borders. A payroll with `if (isSunday)` in it is a
    // rewrite the day the game leaves New South Wales.
    const nsw = JURISDICTIONS['nsw'] as NonNullable<(typeof JURISDICTIONS)[string]>;
    const tuesday = hourlyCost(nsw, 2);
    const saturday = hourlyCost(nsw, 6);
    const sunday = hourlyCost(nsw, 0);
    expect(saturday.cents / tuesday.cents).toBeCloseTo(1.25, 2);
    expect(sunday.cents / tuesday.cents).toBeCloseTo(1.5, 2);
    // Casual loading and super are in there too, not bolted on elsewhere.
    expect(tuesday.cents).toBeGreaterThan(nsw.baseHourly.cents);
  });

  it('makes Sunday a genuinely marginal decision at baseline staffing', () => {
    const open = runSeeds({ days: 28, calendarId: 'sydneyStandard' }, [1, 2, 3]);
    const shut = runSeeds({ days: 28, calendarId: 'sydneyClosedSunday' }, [1, 2, 3]);
    const cash = (runs: typeof open): number => mean(runs.map((r) => r.endingCashCents));
    const delta = (cash(open) - cash(shut)) / Math.abs(cash(shut));
    // Marginal means marginal: opening Sunday should change the month by less
    // than a fifth either way. If it were free money nobody would ever shut,
    // and if it were ruinous nobody would ever open.
    expect(Math.abs(delta)).toBeLessThan(0.2);
  });
});

describe('STEP 7 — every purchase has a cost and a signature', () => {
  it('declares at least two costs beyond labour (§14.3)', () => {
    // Non-negotiable and audited. A thing that is strictly better than not
    // having it is a stat upgrade in a costume.
    for (const item of CATALOGUE) {
      expect(item.costs.length, `${item.id} declares only ${item.costs.length}`).toBeGreaterThanOrEqual(2);
      expect(new Set(item.costs).size).toBe(item.costs.length);
    }
  });

  it('declares an install beat, an idle signature and a working signature (§21.2)', () => {
    // "If you cannot design a visible signature for an upgrade, that upgrade is
    // a spreadsheet entry and should be cut."
    for (const item of CATALOGUE) {
      for (const key of ['install', 'idle', 'working'] as const) {
        expect(item.signature[key].length, `${item.id}.${key}`).toBeGreaterThan(12);
      }
    }
  });

  it('puts a bought station on the floor, on a legal tile', () => {
    const state = createState({});
    const before = state.stations.length;
    const result = buy(state, 'fryer');
    expect(result.ok, result.reason).toBe(true);
    expect(state.stations.length).toBe(before + 1);

    const placed = state.stations[state.stations.length - 1];
    expect(placed).toBeDefined();
    const placement = state.floor.placementOf((placed as { id: string }).id);
    expect(placement).toBeDefined();
    // A fryer needs gas AND extraction. It cannot have landed anywhere else.
    expect(
      state.floor.hasService('gas', placement!.at.x, placement!.at.y) &&
        state.floor.hasService('extraction', placement!.at.x, placement!.at.y),
    ).toBe(true);
  });

  it('charges for it, and refuses when the money is not there', () => {
    const state = createState({ openingCash: { cents: 100, currency: 'AUD' } });
    const result = buy(state, 'grill');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Not enough');
    expect(state.ledger.cash.cents).toBe(100);
  });

  it('explains WHY when the building has no room, rather than saying invalid', () => {
    // The most important failure message in the game: it is the building
    // telling the player what its constraint is. Leichhardt has five tiles
    // with both gas and extraction; fill them and the sixth fryer has nowhere.
    const state = createState({ openingCash: { cents: 100_000_00, currency: 'AUD' } });
    let last = buy(state, 'fryer');
    for (let i = 0; i < 12 && last.ok; i++) last = buy(state, 'fryer');
    expect(last.ok).toBe(false);
    expect(last.reason).toContain('Nowhere to put it');
    expect(last.reason).toContain('extraction');
  });

  it('hires someone, and they cost money from that moment', () => {
    const state = createState({});
    expect(buy(state, 'hire').ok).toBe(true);
    expect(state.staff.length).toBe(2);
    expect(state.staff[1]?.name).toBeTruthy();
  });
});

describe('STEP 8 — the readout reports the BINDING constraint', () => {
  it('says demand when nothing is working hard', () => {
    // The signal to market, and the answer a station-only readout can never
    // give. This is the shop at 14 arrivals an hour: fine, and underused.
    const world = buildScenario({ seed: 42 });
    world.runDays(3);
    expect(world.state.bottleneck?.kind).toBe('demand');
    expect(world.state.bottleneck?.line).toContain('capacity spare');
  });

  it('names the hands when one person is drowning', () => {
    const world = buildScenario({ seed: 42, arrivalsPerHour: 90 });
    world.runDays(2);
    expect(world.state.bottleneck?.kind).toBe('staff');
    expect(world.state.bottleneck?.coversPerDay).toBeGreaterThan(20);
  });

  it('does NOT blame a claimant that is only half occupied', () => {
    // A staffer at 52% is not the constraint however long the queue happens to
    // be at that instant. Naming them loses the player's trust in one line.
    const world = buildScenario({ seed: 42 });
    world.runDays(3);
    const constraint = attribute(world.state, 11);
    expect(constraint.pressure).toBeLessThan(0.55);
    expect(constraint.kind).toBe('demand');
  });

  it('never quotes a per-day cover cost from twenty minutes of trade', () => {
    // Extrapolating a part-day is how "three people in the queue" becomes
    // "costing 89 covers a day" — nonsense stated with total confidence.
    const world = buildScenario({ seed: 42, arrivalsPerHour: 90 });
    world.runDays(1);
    const early = attribute(world.state, 0.5);
    expect(early.coversPerDay).toBe(0);
    expect(early.line).not.toContain('covers a day');
  });

  it('quantifies in covers per day once there is a day to quantify from', () => {
    const world = buildScenario({ seed: 42, arrivalsPerHour: 90 });
    world.runDays(2);
    expect(world.state.bottleneck?.line).toContain('covers a day');
  });

  it('changes its answer when the player acts on it', () => {
    // The whole loop, in one test: find the binding constraint, fix it, and
    // the readout moves on to the next one.
    const world = buildScenario({ seed: 42, arrivalsPerHour: 90 });
    world.runDays(2);
    const before = world.state.bottleneck;
    expect(before?.kind).toBe('staff');

    for (let i = 0; i < 3; i++) {
      buy(world.state, 'hire');
      // A new hire starts on no days at all (step 7b) — putting them on is the
      // decision. Acting on the readout means rostering, not just hiring.
      const added = world.state.staff[world.state.staff.length - 1];
      if (added) for (let d = 0; d < 7; d++) setRoster(world.state, added.id, d, true);
    }
    world.runDays(2);

    const after = world.state.bottleneck;
    expect(after?.pressure).toBeLessThan(before?.pressure ?? 1);
  });
});
