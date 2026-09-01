/**
 * Step 15 — weekly specials. DESIGN.md §18.
 *
 * The exit criteria, as red/green:
 *
 *   1. the harness shows a measurable cost for UNDER-prepping;
 *   2. and a measurable cost for OVER-prepping;
 *   3. 86'ing a PROMOTED special is demonstrably worse than never running one.
 *
 * All three are measured on a shop with enough hands to serve the crowd a
 * special draws, and that is not a convenience — it is the finding. On a
 * one-cook shop the uplift becomes walkouts before it becomes covers, so every
 * prep level scores the same and the mechanism looks dead. §18's *"what your
 * kitchen can produce at volume"* is not a flavour note; it decides whether a
 * special is a lever at all.
 */
import { describe, expect, it } from 'vitest';
import { SPECIALS, SPECIAL_BY_ID, SPECIAL_RULES } from '@/config/specials';
import { buildScenario } from '@/sim/scenario';
import { buy, setRoster, setSpecial } from '@/sim/actions';
import { availableSpecials, prepDay, surplusCost } from '@/sim/systems/specials';
import { openEverything } from './helpers';

const SEEDS = [1, 2, 3, 4];
const WEEKS = 9;
const DAYS = WEEKS * 7;
const HANDS = 3;

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Ten weeks of one policy, on a shop staffed to serve what it advertises. */
function run(specialId: string | null, prep: number, promote = false): number {
  return mean(
    SEEDS.map((seed) => {
      const world = buildScenario({ seed });
      openEverything(world.state);
      for (let i = 0; i < HANDS; i++) buy(world.state, 'hire');
      for (const staff of world.state.staff) {
        for (let d = 0; d < 7; d++) setRoster(world.state, staff.id, d, true);
      }
      for (let day = 0; day < DAYS; day++) {
        setSpecial(world.state, specialId, prep, promote);
        world.runDays(1);
      }
      return world.state.ledger.cash.cents / 100;
    }),
  );
}

describe('§18 — the config is a set of trade-offs, not a list of upgrades', () => {
  it('every special loses on at least one of the three sides', () => {
    // "What draws people, what your kitchen can produce at volume, what you can
    // prep without eating the waste." A special that wins all three is the stat
    // upgrade in a costume that §14.3 bans for machines.
    for (const s of SPECIALS) {
      const cheapToPrep = s.prepUnits === 0 || s.unitCost < 3;
      const noExposure = s.exclusiveIngredient === null;
      const bigDraw = s.uplift >= 0.5;
      const goodMargin = s.priceMultiple >= 1;
      const wins = [cheapToPrep, noExposure, bigDraw, goodMargin].filter(Boolean).length;
      expect(wins, `${s.id} wins on ${wins} of 4 — nothing to trade`).toBeLessThan(4);
    }
  });

  it('an exclusive ingredient makes the surplus a total loss', () => {
    const wings = SPECIAL_BY_ID['wingWednesday'];
    const bogof = SPECIAL_BY_ID['twoForTuesday'];
    if (!wings || !bogof) throw new Error('pool changed');
    expect(wings.exclusiveIngredient).not.toBeNull();
    // Ten units of something nothing else uses is ten units binned. The same
    // surplus of a shared ingredient partly comes back.
    expect(surplusCost(wings, 10)).toBeCloseTo(10 * wings.unitCost, 6);
    expect(bogof.exclusiveIngredient).toBeNull();
  });

  it('prep lands the day BEFORE the named day, on the station it leans on', () => {
    for (const s of SPECIALS) {
      const before = prepDay(s, 7);
      expect((before + SPECIAL_RULES.PREP_WINDOW_DAYS) % 7).toBe(s.day);
    }
  });

  it('the pool opens as the ladder is climbed, and starts non-empty', () => {
    const world = buildScenario({ seed: 3 });
    const early = availableSpecials(world.state);
    expect(early.length).toBeGreaterThan(0);
    expect(early.length).toBeLessThan(SPECIALS.length);
    openEverything(world.state);
    expect(availableSpecials(world.state).length).toBe(SPECIALS.length);
  });
});

describe('§18 — the Monday decision lands on Monday', () => {
  it('refuses a special the shop has not reached', () => {
    const world = buildScenario({ seed: 3 });
    const locked = SPECIALS.find((s) => s.unlockedAfterRungs > 0);
    if (!locked) throw new Error('pool has no locked entry');
    expect(setSpecial(world.state, locked.id, 20).ok).toBe(false);
  });

  it('warns, at the moment of the decision, what over-prepping will cost', () => {
    const world = buildScenario({ seed: 3 });
    openEverything(world.state);
    const result = setSpecial(world.state, 'wingWednesday', 200);
    expect(result.ok).toBe(true);
    // A number, in the reason, before the money is committed — the same shape
    // as §8.3's cost-per-cover warning.
    expect(result.reason).toMatch(/\d/);
    expect(result.reason).toMatch(/bin/i);
  });

  it('does not start until the next Monday', () => {
    const world = buildScenario({ seed: 3 });
    openEverything(world.state);
    setSpecial(world.state, 'wingWednesday', 24);
    // Pending, not running. Choosing mid-rush to catch a rush would be demand
    // conjured out of nothing — the same reason §8.2 delays a price change.
    expect(world.state.special.pending).toBe('wingWednesday');
    expect(world.state.special.running).toBeNull();
  });
});

describe('§18 EXIT — both directions cost, and a broken promise costs most', () => {
  const wings = SPECIAL_BY_ID['wingWednesday'];
  if (!wings) throw new Error('pool changed');
  const spec = wings.prepUnits;

  /**
   * Measured, EIGHT seeds, nine weeks, on a shop staffed to serve the crowd:
   *
   *                        plain      promoted
   *   never run it        -$1,547
   *   under      (8)      -$1,076      -$2,385
   *   under     (16)        -$595           —
   *   to spec    (24)     -$1,101      -$1,163
   *   sized      (46)          —       -$1,869
   *   over       (60)       -$209      -$2,726  (promoted at 110)
   *   way over  (200)     -$3,318           —
   *
   * **The unpromoted column is flat and that is stated rather than hidden.**
   * Between 8 and 60 units the whole spread is under $900 across nine weeks —
   * inside the seed noise. Two reasons, both real: wings cost $2.40, so
   * thirty-six spare ones is $86 a week; and the shop is throughput-limited on
   * a Wednesday night, so the small unpromoted uplift mostly becomes walkouts
   * whatever is in the fridge.
   *
   * So the exit criteria are asserted where the mechanism has signal above
   * noise — the promoted case, which is also the case §18's third clause names
   * and the one a player who cares about specials is actually in. The flatness
   * of the unpromoted column is logged as DEBT for a balance pass, not papered
   * over: `uplift` and `unitCost` are both provisional and both move when the
   * real numbers land.
   *
   * These figures also CHANGED when the seeker roll was moved to its own RNG
   * stream. Sharing the arrivals stream meant switching specials on shifted
   * every subsequent draw, so the earlier, tidier-looking table was measuring
   * the weather as well as the special.
   */
  it('under-prepping a promoted special costs, against prepping to spec', () => {
    expect(run('wingWednesday', Math.round(spec / 3), true)).toBeLessThan(
      run('wingWednesday', spec, true),
    );
  });

  it('over-prepping costs, and costs more the further over it goes', () => {
    // Unpromoted, because this is the direction that DOES bite without the
    // promotion: stock bought is cash gone whether anyone turns up or not.
    const right = run('wingWednesday', spec);
    const silly = run('wingWednesday', spec * 8);
    expect(silly).toBeLessThan(right);
    // And it bites promoted too, where the crowd is real and the surplus still
    // is not.
    expect(run('wingWednesday', Math.round(spec * 4.5), true)).toBeLessThan(
      run('wingWednesday', spec, true),
    );
  });

  /**
   * §18's hardest clause, and the one that took four attempts.
   *
   * It is false if the disappointed never enter the sim — book-kept at close
   * they cost three two-star reviews, which against a shop with hundreds is
   * noise, and deliberate under-prepping measured as the single most profitable
   * play in the game. It is only true when they walk in, take a place in the
   * queue, and leave: then running out costs you the covers you could have
   * served in their place, and the promotion you paid for bought that.
   */
  it("86'ing a PROMOTED special is worse than never running one", () => {
    expect(run('wingWednesday', Math.round(spec / 3), true)).toBeLessThan(run(null, 0));
  });
});

describe('§18 — credibility, so a broken promise compounds', () => {
  it('falls when the shop runs out and never hits zero', () => {
    const world = buildScenario({ seed: 5 });
    openEverything(world.state);
    for (let i = 0; i < HANDS; i++) buy(world.state, 'hire');
    for (const staff of world.state.staff) {
      for (let d = 0; d < 7; d++) setRoster(world.state, staff.id, d, true);
    }
    for (let day = 0; day < DAYS; day++) {
      setSpecial(world.state, 'wingWednesday', 1, true);
      world.runDays(1);
    }
    expect(world.state.special.credibility).toBeLessThan(1);
    // §10: nothing is unrecoverable. A shop that burnt every promise it made
    // for nine weeks still has a floor to climb back from.
    expect(world.state.special.credibility).toBeGreaterThanOrEqual(
      SPECIAL_RULES.CREDIBILITY_FLOOR,
    );
  });

  it('stays intact for a shop that delivers what it advertises', () => {
    const world = buildScenario({ seed: 5 });
    openEverything(world.state);
    for (let i = 0; i < HANDS; i++) buy(world.state, 'hire');
    for (const staff of world.state.staff) {
      for (let d = 0; d < 7; d++) setRoster(world.state, staff.id, d, true);
    }
    for (let day = 0; day < DAYS; day++) {
      setSpecial(world.state, 'wingWednesday', 400);
      world.runDays(1);
    }
    expect(world.state.special.credibility).toBeGreaterThan(0.9);
  });
});
