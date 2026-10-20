/**
 * STEP 7b GATES — rostering and firing.
 *
 * BUILD_PLAN step 7 specified "hiring AND firing"; the audit found firing,
 * resale and financing had all been dropped silently. Q13 then established
 * rostering as the keystone: a permanent hire costs $452 on the Mondays nobody
 * comes, so the shape of the week has to be something the player can answer.
 *
 * Every operator solves the peak by rostering. The sim could not express it.
 *
 * Step 10 moved where the money is in these gates — see the long note on the
 * optimum below. What did not move is why the step exists: labour has to be a
 * curve the player can be wrong about in both directions.
 */
import { describe, expect, it } from 'vitest';
import { ECONOMY } from '@/config/economy';
import { buy, fire, hireCost, setRoster, weeklyWage } from '@/sim/actions';
import { buildScenario } from '@/sim/scenario';
import { isRostered } from '@/sim/entities/staff';
import { Cash } from '@/sim/types';

const SEEDS = [1, 2, 3, 4, 5, 6];
const DAYS = 56;
const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];

/** Run a shop, hire on day one, roster everyone hired for the given weekdays. */
function withCrew(seed: number, days: number[], runDays = DAYS, hires = 1): number {
  const world = buildScenario({ seed });
  world.runDays(1);
  if (days.length > 0) {
    for (let h = 0; h < hires; h++) {
      const result = buy(world.state, 'hire');
      expect(result.ok, result.reason).toBe(true);
      const hired = world.state.staff[1 + h];
      expect(hired).toBeDefined();
      for (const day of days) setRoster(world.state, (hired as { id: string }).id, day, true);
    }
  }
  world.runDays(runDays - 1);
  return world.state.ledger.cash.cents;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('STEP 7b — a new hire starts on no days at all', () => {
  it('is on the books but not on the floor until you roster them', () => {
    const world = buildScenario({ seed: 1 });
    world.runDays(1);
    buy(world.state, 'hire');
    const hired = world.state.staff[1];
    expect(hired).toBeDefined();
    for (let day = 0; day < 7; day++) {
      expect(isRostered(hired as never, day)).toBe(false);
    }
    // Inheriting a full week as a default is what made a hire a fixed cost
    // rather than a choice.
  });

  it('costs one shift up front, not a week', () => {
    const world = buildScenario({ seed: 1 });
    const shift = hireCost(world.state);
    const week = weeklyWage(world.state);
    expect(shift.cents).toBeGreaterThan(0);
    expect(shift.cents).toBeLessThan(week.cents / 2);
  });
});

describe('STEP 7b — an un-rostered staffer costs nothing and does nothing', () => {
  it('does not accrue wages on a day they are off', () => {
    const worldA = buildScenario({ seed: 3 });
    worldA.runDays(1);
    buy(worldA.state, 'hire');
    worldA.runDays(3);

    const worldB = buildScenario({ seed: 3 });
    worldB.runDays(4);

    // The hire's only cost across three days is the one shift paid up front.
    const gap = worldB.state.ledger.cash.cents - worldA.state.ledger.cash.cents;
    expect(gap).toBeCloseTo(hireCost(worldB.state).cents, -2);
  });

  it('does no work on a day they are off', () => {
    const world = buildScenario({ seed: 3 });
    world.runDays(1);
    buy(world.state, 'hire');
    world.runDays(3);
    const hired = world.state.staff[1];
    expect(hired).toBeDefined();
    expect((hired as { shiftSeconds: number }).shiftSeconds).toBe(0);
  });
});

describe('STEP 7b — the roster has an optimum, and both sides of it lose', () => {
  /**
   * The gate this whole step exists for: **staffing must be a curve with a
   * peak, not a slider.** Understaff and you shed customers; overstaff and you
   * pay people to watch a bench.
   *
   * It used to assert something narrower — that a seven-day roster for the
   * SECOND person was a trap. That was true and it stopped being true at step
   * 10, when §6.1 wired reputation into demand. It is worth being precise about
   * why, because "the test changed" is exactly the sentence a rewrite hides
   * behind:
   *
   * Before, the only thing a second pair of hands bought was the walkouts they
   * prevented that day. On a Monday that is two customers, against $387 of
   * wage — a straightforward loss. Now, preventing a walkout also prevents the
   * two-star review it leaves, and the rating feeds `reputationMultiplier`,
   * which feeds tomorrow's arrivals. Measured over eight weeks: a seven-day
   * second staffer ends on 4.00 stars against 3.31 with nobody, and 0.35 +
   * 1.15 x (s/5)^1.6 turns that gap into 20% more foot traffic. The second
   * person is not paying for Monday's two covers, they are paying for the
   * compounding.
   *
   * That is §6.1 working as specified, not a regression — and the pillar it has
   * to satisfy is unharmed, because the THIRD person still loses badly. The
   * decision moved from "which days" to "how many, and then which days".
   *
   *   hires  shape        cash    (56 days, six seeds)
   *   0      —          $58,377
   *   1      all 7      $80,755   <- the peak
   *   2      all 7      $60,019
   *   3      all 7      $39,123
   *   2      Thu–Sat    $65,563
   *   3      Thu–Sat    $56,394
   *
   * Note the shape decision reappears above the peak: at two extra hires,
   * Thu–Sat ($65,563) beats all-7 ($60,019). Once you are past what the kitchen
   * can absorb, the only staffing that pays is staffing on the busy days.
   */
  const nobody = mean(SEEDS.map((s) => withCrew(s, [])));
  const oneAllWeek = mean(SEEDS.map((s) => withCrew(s, ALL_WEEK)));
  const twoAllWeek = mean(SEEDS.map((s) => withCrew(s, ALL_WEEK, DAYS, 2)));
  const threeAllWeek = mean(SEEDS.map((s) => withCrew(s, ALL_WEEK, DAYS, 3)));
  const twoWeekend = mean(SEEDS.map((s) => withCrew(s, [4, 5, 6], DAYS, 2)));

  it('punishes understaffing — doing nothing is not the answer', () => {
    expect(oneAllWeek).toBeGreaterThan(nobody);
  });

  it('punishes overstaffing — there is a peak, and it is not the last hire', () => {
    // If every hire paid, there would be no decision, only a purchase.
    expect(twoAllWeek).toBeLessThan(oneAllWeek);
    expect(threeAllWeek).toBeLessThan(twoAllWeek);
  });

  it('makes over-hiring an actual trap, not merely a smaller win', () => {
    // The second extra body lands within noise of never hiring at all
    // ($60,019 against $58,377) — that is the shoulder of the curve, and
    // asserting a sign there would be asserting noise. The third is
    // unambiguous: $39,123 against $58,377, a third of the shop's money spent
    // on people with nothing to do.
    expect(threeAllWeek).toBeLessThan(nobody);
  });

  it('makes the SHAPE of the roster matter once headcount is past the peak', () => {
    // Two extra people every day is money set on fire; two extra people on the
    // days that are actually busy is merely expensive. The gap between those
    // two is the roster still being a decision.
    expect(twoWeekend).toBeGreaterThan(twoAllWeek);
  });
});

describe('STEP 7b — firing is slow and costs money (§10)', () => {
  it('pays notice and keeps them on the floor until it runs out', () => {
    const world = buildScenario({ seed: 5 });
    world.runDays(1);
    buy(world.state, 'hire');
    const hired = world.state.staff[1] as { id: string };
    setRoster(world.state, hired.id, 6, true);

    const before = world.state.ledger.cash.cents;
    const result = fire(world.state, hired.id);
    expect(result.ok, result.reason).toBe(true);
    expect(result.reason).toContain('fortnight');

    const notice = Cash.scale(weeklyWage(world.state), ECONOMY.NOTICE_WEEKS);
    expect(before - world.state.ledger.cash.cents).toBe(notice.cents);
    // Still there — they work it out.
    expect(world.state.staff.length).toBe(2);

    world.runDays(ECONOMY.NOTICE_WEEKS * 7 + 1);
    expect(world.state.staff.length).toBe(1);
  });

  it('refuses to leave the shop with nobody in it', () => {
    const world = buildScenario({ seed: 5 });
    world.runDays(1);
    const only = world.state.staff[0] as { id: string };
    const result = fire(world.state, only.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('open the shop');
  });

  it('will not re-roster someone on their way out', () => {
    const world = buildScenario({ seed: 5 });
    world.runDays(1);
    buy(world.state, 'hire');
    const hired = world.state.staff[1] as { id: string };
    fire(world.state, hired.id);
    const result = setRoster(world.state, hired.id, 6, true);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('notice');
  });
});

describe('STEP 7b — the readout counts who is actually on', () => {
  it('says one person on a day only one person is rostered', () => {
    const world = buildScenario({ seed: 7 });
    world.runDays(1);
    buy(world.state, 'hire');
    world.runDays(6);
    expect(world.state.onToday).toBe(1);
    const line = world.state.bottleneck?.line ?? '';
    if (line.includes('Not enough hands')) expect(line).toContain('one person');
  });
});

describe('STEP 7b — the roster you edit is next week, not this afternoon', () => {
  it('cannot conjure a pair of hands into the middle of a rush', () => {
    // Found by attacking the diff: the kitchen read the editable roster live,
    // so rostering someone on at 7pm put them on the floor that second.
    const world = buildScenario({ seed: 9 });
    world.runDays(2);
    buy(world.state, 'hire');
    const hired = world.state.staff[1] as { id: string; shiftSeconds: number };

    setRoster(world.state, hired.id, world.clock.dayOfWeek, true);
    world.runTicks(600);
    expect(world.state.workingToday.has(hired.id)).toBe(false);
    expect(hired.shiftSeconds).toBe(0);

    // Tomorrow, they are on.
    world.runDays(1);
    expect(world.state.workingToday.has(hired.id)).toBe(true);
  });

  it('cannot dodge the wage by rostering someone off at lunchtime', () => {
    const paid = (turnOff: boolean): number => {
      const world = buildScenario({ seed: 9 });
      world.runDays(1);
      buy(world.state, 'hire');
      const hired = world.state.staff[1] as { id: string };
      for (let d = 0; d < 7; d++) setRoster(world.state, hired.id, d, true);
      world.runDays(1);
      const before = world.state.accruedWages.cents;
      world.runTicks(1200);
      if (turnOff) setRoster(world.state, hired.id, world.clock.dayOfWeek, false);
      world.runTicks(1200);
      return world.state.accruedWages.cents - before;
    };
    // Two hours of cover for a quarter of the cost would delete the decision.
    expect(paid(true)).toBe(paid(false));
  });

  it('never leaves the shop with nobody in it, however you order the sackings', () => {
    const world = buildScenario({ seed: 9 });
    world.runDays(1);
    buy(world.state, 'hire');
    buy(world.state, 'hire');
    expect(world.state.staff.length).toBe(3);

    expect(fire(world.state, (world.state.staff[1] as { id: string }).id).ok).toBe(true);
    expect(fire(world.state, (world.state.staff[2] as { id: string }).id).ok).toBe(true);
    // Both are on notice; the last one standing cannot go.
    const last = fire(world.state, (world.state.staff[0] as { id: string }).id);
    expect(last.ok).toBe(false);

    world.runDays(ECONOMY.NOTICE_WEEKS * 7 + 2);
    expect(world.state.staff.length).toBeGreaterThanOrEqual(1);
  });
});

/**
 * Tick to the exact moment the next day's shutters go up.
 *
 * `runDays(1)` trades a whole day, so sampling after it is sampling at
 * midnight — long after the walk-in happened and the staffer moved to a
 * station. `workingToday` is set on the opening tick and this stops there.
 */
function runToNextOpen(world: ReturnType<typeof buildScenario>): void {
  for (let i = 0; i < 40000; i++) {
    const opening = world.clock.isOpeningTick();
    world.tick();
    if (opening) return;
  }
  throw new Error('never opened');
}

describe('STEP 7b — the roster is visible on the floor (§21.2)', () => {
  it('does not put an un-rostered staffer in the building', () => {
    // A roster you cannot see on the floor is a spreadsheet. Saturday has to
    // look different from Tuesday.
    const world = buildScenario({ seed: 11 });
    world.runDays(1);
    buy(world.state, 'hire');
    const hired = world.state.staff[1] as { id: string };
    setRoster(world.state, hired.id, 6, true);

    let sawSaturday = false;
    for (let day = 0; day < 9; day++) {
      runToNextOpen(world);
      // On for Saturday, and only Saturday.
      expect(world.state.workingToday.has(hired.id)).toBe(world.clock.dayOfWeek === 6);
      if (world.clock.dayOfWeek === 6) sawSaturday = true;
    }
    expect(sawSaturday).toBe(true);
  });

  it('brings a new hire in through the front door on their first shift', () => {
    const world = buildScenario({ seed: 11 });
    world.runDays(1);
    buy(world.state, 'hire');
    const hired = world.state.staff[1] as {
      id: string;
      arriving: boolean;
      y: number;
      walkSeconds: number;
    };
    // On the books, not in the building.
    expect(hired.arriving).toBe(true);
    expect(hired.y).toBeLessThan(world.state.site.entryTile.y + 1);

    for (let d = 0; d < 7; d++) setRoster(world.state, hired.id, d, true);
    runToNextOpen(world);
    expect(hired.arriving).toBe(false);

    // They are charged the walk from the door to wherever the kitchen wants
    // them — which is the part that is actually true and actually matters. It
    // used to assert their POSITION was still near the door on this tick, and
    // that passed by luck: the kitchen happened to have no work for them on
    // the opening tick, so nothing had moved them yet. The moment §6.2 put a
    // table of six in the first minute of trade, there was work, and they
    // crossed the room inside the same tick.
    //
    // One tick is twelve game seconds — twenty-seven tiles of walking in a shop
    // fifteen tiles deep. At 120x compression NO walk is ever visible in the
    // sim's own sampling; smoothing it is the renderer's job, between ticks,
    // and it is not done. That is DEBT-1, and this gate no longer pretends
    // otherwise.
    expect(hired.walkSeconds).toBeGreaterThan(0);
  });
});
