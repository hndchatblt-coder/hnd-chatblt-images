/**
 * Step 14 — the ladder and the daily headline. §15.1, §15.2, §15.3.
 *
 * Three claims, and each one is here because it is the kind of claim that goes
 * quietly false: a rung that starts paying cash, a headline that drifts into
 * encouragement, and a dead-zone detector that cannot report a dead zone.
 */
import { describe, expect, it, vi } from 'vitest';
import { HEADLINES, type DayFacts } from '@/config/headline';
import { LADDER, RUNGS } from '@/config/ladder';
import { buildScenario } from '@/sim/scenario';
import { setMarketing, setPrice, setRoster } from '@/sim/actions';
import {
  LadderSystem,
  decisionGap,
  hadDecision,
  headlineFor,
  nextRungs,
  unlocked,
} from '@/sim/systems/ladder';

const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  dayName: 'Tue',
  covers: 90,
  balked: 0,
  revenueCents: 180_000,
  wasteUnits: 4,
  unitsProduced: 120,
  meanWaitMinutes: 6,
  stars: 3.5,
  starsYesterday: 3.5,
  bestSameDayCovers: 120,
  bestRevenueCents: 250_000,
  costsCents: 84_000,
  incidentsOpen: 0,
  staffOn: 2,
  reviewsToday: 3,
  streak: 1,
  ...over,
});

describe('§15.1 — a rung awards a capability, never cash', () => {
  /**
   * The load-bearing one. §15.1: *"award a capability, so the reward changes
   * what the player can do rather than skipping a decision."* A cash prize is
   * the single easiest thing to add later when a rung feels unrewarding, and
   * the whole progression design dies the day one does.
   */
  it('no rung has a cash reward, in any act', () => {
    const kinds = new Set(RUNGS.map((r) => r.reward.kind));
    expect([...kinds].sort()).toEqual(['catalogue', 'machine', 'panel']);
  });

  /**
   * The runtime half, and it has to be a spy rather than a cash comparison.
   *
   * `Account` is a closed union, so "no rung account exists" is a compile-time
   * fact and asserting it at runtime would be another check that cannot fail.
   * Comparing cash across the close does not work either — the trading day
   * moves cash for a dozen honest reasons on the same tick.
   *
   * So the claim is made exactly: **the ladder never touches the ledger.** The
   * system is run over a shop that is about to bank a rung, with `post`
   * watched, and it must not post at all. The cheapest way to break §15.1
   * later is a "small" cash bonus on rung one, and this is what catches it.
   */
  it('the ladder never posts to the ledger, on the day a rung lands', () => {
    const world = buildScenario({ seed: 7 });
    let landed = 0;
    for (let day = 0; day < 40 && landed < 3; day++) {
      const banked = world.state.rungs.length;
      const spy = vi.spyOn(world.state.ledger, 'post');
      world.runDays(1);
      const posts = spy.mock.calls.length;
      spy.mockRestore();
      if (world.state.rungs.length === banked) continue;
      landed++;
      // The day posted for trading reasons; the question is whether the CLOSE
      // that banked the rung added one. Re-run just the ladder and count.
      const after = vi.spyOn(world.state.ledger, 'post');
      new LadderSystem().onClose(world);
      expect(after.mock.calls.map((c) => c[0]), `rung ${world.state.justUnlocked ?? ''}`).toEqual(
        [],
      );
      after.mockRestore();
      expect(posts).toBeGreaterThan(0); // the day itself did trade
    }
    expect(landed, 'no rung landed in 40 days — the test proved nothing').toBe(3);
  });

  it('every rung is reachable in principle — no rung gates itself', () => {
    // A rung whose reward is needed to MEET it would be a wall. The obvious
    // way to write one is a machine rung awarded for owning that machine.
    for (const rung of RUNGS) {
      if (rung.reward.kind !== 'machine') continue;
      expect(rung.id).not.toContain(rung.reward.id);
    }
  });

  it('exactly two rungs show in the HUD, and they are the next two', () => {
    const world = buildScenario({ seed: 3 });
    const shown = nextRungs(world.state);
    expect(shown).toHaveLength(LADDER.VISIBLE);
    const actOne = RUNGS.filter((r) => r.act === 1);
    expect(shown[0]?.id).toBe(actOne[0]?.id);
    expect(shown[1]?.id).toBe(actOne[1]?.id);
  });

  it('act II rungs never appear in act I', () => {
    const world = buildScenario({ seed: 3 });
    world.runDays(70);
    const actTwo = RUNGS.filter((r) => r.act === 2).map((r) => r.id);
    expect(actTwo.length).toBeGreaterThan(0);
    for (const id of actTwo) expect(world.state.rungs).not.toContain(id);
  });
});

describe('§15.1 — the ladder is the gate, and the gate is real in the sim', () => {
  /**
   * Not "the button is hidden". The refusal has to live where the harness hits
   * it too, or the balance numbers describe a game nobody plays.
   */
  it('the trade panel refuses before its rung lands', () => {
    const world = buildScenario({ seed: 5 });
    expect(unlocked(world.state, 'panel', 'trade')).toBe(false);
    expect(setPrice(world.state, 1.1).ok).toBe(false);
    expect(setMarketing(world.state, 'letterbox', 100).ok).toBe(false);
  });

  it('and it works the moment it does', () => {
    const world = buildScenario({ seed: 5 });
    world.runDays(2);
    expect(unlocked(world.state, 'panel', 'trade')).toBe(true);
    expect(setPrice(world.state, 1.1).ok).toBe(true);
    expect(setMarketing(world.state, 'letterbox', 100).ok).toBe(true);
  });

  /**
   * The roster is deliberately NOT on the ladder. §15.1's reward *"changes what
   * the player can do"*, and the shop arrives with staff already on a default
   * roster — so gating it confiscates a capability and hands it back, which is
   * a lock wearing an unlock's clothes. Asserted, not merely commented, because
   * putting it back on rung one is a five-second edit that reads like an
   * improvement and cost `bot:balanced` $5,679 over ninety days.
   */
  it('the roster is never gated — a lock is not an unlock', () => {
    const world = buildScenario({ seed: 5 });
    expect(unlocked(world.state, 'panel', 'roster')).toBe(true);
    const staffId = world.state.staff[0]?.id ?? '';
    expect(setRoster(world.state, staffId, 0, true).ok).toBe(true);
    expect(RUNGS.some((r) => r.reward.kind === 'panel' && r.reward.id === 'roster')).toBe(false);
  });

  it('at most one rung lands per day — systems arrive one per session', () => {
    // Without the cap this shop banks three on its first trading day: 139
    // covers and $2,724 clears fifty covers, a hundred covers and a thousand
    // dollars at once.
    const world = buildScenario({ seed: 2 });
    let previous = 0;
    for (let day = 0; day < 30; day++) {
      world.runDays(1);
      expect(world.state.rungs.length - previous).toBeLessThanOrEqual(1);
      previous = world.state.rungs.length;
    }
    expect(previous).toBeGreaterThan(3);
  });
});

describe('§15.2 — the headline is specific, from real data, never generic', () => {
  /**
   * The exit criterion is a writing criterion: *read twenty and cut any that
   * could apply to any day.* A test cannot read, so it enforces the property
   * that makes a generic line impossible to write — every one carries a figure
   * the day actually produced.
   */
  it('every template interpolates at least one figure from the day', () => {
    for (const template of HEADLINES) {
      const said = template.say(facts({ covers: 77, balked: 13, wasteUnits: 29 }));
      expect(said, template.id).toMatch(/\d/);
      if (template.again) {
        expect(template.again(facts({ streak: 3, covers: 77, balked: 13 })), template.id).toMatch(
          /\d|second|third|fourth|fifth|sixth/,
        );
      }
    }
  });

  it('no template is encouragement', () => {
    const stickers = /keep it up|well done|great job|nice work|you can do|amazing|fantastic/i;
    for (const template of HEADLINES) {
      expect(template.say(facts()), template.id).not.toMatch(stickers);
    }
  });

  it('a day always gets a headline, however dull or however bad', () => {
    for (const d of [
      facts(),
      facts({ covers: 0, revenueCents: 0, unitsProduced: 0 }),
      facts({ balked: 200, covers: 3 }),
      facts({ wasteUnits: 300, unitsProduced: 300 }),
    ]) {
      expect(headlineFor(d).line.length).toBeGreaterThan(0);
    }
  });

  it('the day it was most about wins — walkouts outrank a revenue record', () => {
    const both = facts({ balked: 40, covers: 100, revenueCents: 400_000, bestRevenueCents: 250_000 });
    expect(headlineFor(both).id).toBe('walkouts');
  });

  it('a repeat says what the repeat means rather than the same sentence', () => {
    const bad = facts({ wasteUnits: 40, unitsProduced: 120 });
    const first = headlineFor(bad, null, 0);
    expect(first.id).toBe('waste');
    const second = headlineFor(bad, first.id, first.streak);
    expect(second.streak).toBe(2);
    expect(second.line).not.toBe(first.line);
    expect(second.line).toContain('second');
  });

  it('a streak resets when the day changes character', () => {
    const bad = facts({ wasteUnits: 40, unitsProduced: 120 });
    const run = headlineFor(bad, 'waste', 4);
    expect(run.streak).toBe(5);
    const good = headlineFor(facts({ balked: 0 }), run.id, run.streak);
    expect(good.streak).toBe(1);
  });

  it('twenty consecutive days produce a headline every day, none of them blank', () => {
    const world = buildScenario({ seed: 11 });
    const seen: string[] = [];
    for (let day = 0; day < 20; day++) {
      world.runDays(1);
      seen.push(world.state.headline);
    }
    expect(seen.filter((h) => h.length === 0)).toEqual([]);
    // Every one carries a figure. This is the twenty-line criterion, mechanised.
    expect(seen.filter((h) => !/\d/.test(h))).toEqual([]);
    // And no line runs unchanged for a week.
    let longest = 1;
    let run = 1;
    for (let i = 1; i < seen.length; i++) {
      run = seen[i] === seen[i - 1] ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThanOrEqual(3);
  });
});

describe('§15.3 — the dead-zone detector can report a dead zone', () => {
  /**
   * The point of this block. D030 shipped a check that could not fail, and the
   * first draft of `hadDecision` was another — it counted `hire`, which is
   * unowned and affordable forever, so it measured `gap = 0` on every one of
   * 84 days probed. A detector that cannot be false is decoration.
   */
  it('is false when the shop is wedged against its own walls', () => {
    const world = buildScenario({ seed: 4 });
    world.runDays(3);
    // `space` is the constraint with no answer in the catalogue: you cannot buy
    // floor at Leichhardt. Nothing broken, plenty of cash, nothing to do.
    world.state.incidents.length = 0;
    world.state.bottleneck = {
      kind: 'space',
      line: 'Your staff are spending their day walking.',
      coversPerDay: 20,
      pressure: 0.8,
    };
    expect(hadDecision(world.state)).toBe(false);
  });

  it('is false when nothing is affordable', () => {
    const world = buildScenario({ seed: 4 });
    world.runDays(3);
    world.state.incidents.length = 0;
    // Spend it all: the Money type is immutable by design, so the shop has to
    // actually be broke rather than be told it is.
    world.state.ledger.post('rent', world.state.ledger.cash);
    world.state.bottleneck = {
      kind: 'station',
      line: 'The grill is holding you up.',
      coversPerDay: 30,
      pressure: 0.95,
      subject: 'grill',
    };
    expect(hadDecision(world.state)).toBe(false);
  });

  it('is true when the readout names hands and hands are affordable', () => {
    const world = buildScenario({ seed: 4 });
    world.runDays(3);
    world.state.bottleneck = {
      kind: 'staff',
      line: 'Not enough hands.',
      coversPerDay: 25,
      pressure: 0.9,
    };
    expect(hadDecision(world.state)).toBe(true);
  });

  it('is true whenever something is broken and the repair is within reach', () => {
    const world = buildScenario({ seed: 4 });
    world.runDays(30);
    if (world.state.incidents.length === 0) return;
    world.state.bottleneck = {
      kind: 'space',
      line: 'walls',
      coversPerDay: 0,
      pressure: 1,
    };
    expect(hadDecision(world.state)).toBe(true);
  });

  it('a shop left alone never goes three days with nothing worth doing', () => {
    // §15.3 names bot:balanced; `idle` is the harder case, because a shop
    // nobody touches is the one most likely to run out of moves.
    const world = buildScenario({ seed: 9 });
    let worst = 0;
    for (let day = 0; day < 60; day++) {
      world.runDays(1);
      worst = Math.max(worst, decisionGap(world.state));
    }
    expect(worst).toBeLessThanOrEqual(3);
  });
});
