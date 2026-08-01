/**
 * STEP 7b GATES — rostering and firing.
 *
 * BUILD_PLAN step 7 specified "hiring AND firing"; the audit found firing,
 * resale and financing had all been dropped silently. Q13 then established
 * rostering as the keystone: a permanent hire costs $452 on the Mondays nobody
 * comes, so it can never pay for itself however sharp the Saturday peak is.
 *
 * Every operator solves the peak by rostering. The sim could not express it.
 */
import { describe, expect, it } from 'vitest';
import { ECONOMY } from '@/config/economy';
import { buy, fire, hireCost, setRoster, weeklyWage } from '@/sim/actions';
import { buildScenario } from '@/sim/scenario';
import { isRostered } from '@/sim/entities/staff';
import { Cash } from '@/sim/types';

const SEEDS = [1, 2, 3, 4, 5, 6];
const DAYS = 56;

/** Run a shop, hire on day one, roster them for the given weekdays. */
function withCrew(seed: number, days: number[], runDays = DAYS): number {
  const world = buildScenario({ seed });
  world.runDays(1);
  if (days.length > 0) {
    const result = buy(world.state, 'hire');
    expect(result.ok, result.reason).toBe(true);
    const hired = world.state.staff[1];
    expect(hired).toBeDefined();
    for (const day of days) setRoster(world.state, (hired as { id: string }).id, day, true);
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

describe('STEP 7b — rostering the weekend beats rostering the week', () => {
  /**
   * The gate this whole step exists for. Saturday needs a second person and
   * Monday does not, so the shape of the roster is the decision — and the
   * wrong shape is worse than not hiring at all.
   */
  const nobody = mean(SEEDS.map((s) => withCrew(s, [])));
  const weekend = mean(SEEDS.map((s) => withCrew(s, [5, 6])));
  const everyDay = mean(SEEDS.map((s) => withCrew(s, [0, 1, 2, 3, 4, 5, 6])));

  it('makes a weekend roster the best of the three', () => {
    expect(weekend).toBeGreaterThan(everyDay);
    expect(weekend).toBeGreaterThan(nobody);
  });

  it('leaves a full-week roster losing money — the trap is still a trap', () => {
    // If every roster paid, there would be no decision, only a purchase.
    expect(everyDay).toBeLessThan(nobody);
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
    const hired = world.state.staff[1] as { id: string; arriving: boolean; y: number };
    expect(hired.arriving).toBe(true);

    for (let d = 0; d < 7; d++) setRoster(world.state, hired.id, d, true);
    runToNextOpen(world);
    // Out on the street at the moment the doors open. They do not blink into
    // existence beside the pass.
    //
    // This has to be sampled ON the opening tick. One tick is twelve game
    // seconds, which is twenty-seven tiles of walking in a shop fifteen tiles
    // deep — so by the next sample they are already at a station. The walk-in
    // is real and, at the shipped time compression, invisible. See DEBT-1.
    expect(hired.arriving).toBe(false);
    expect(hired.y).toBeLessThan(world.state.site.entryTile.y + 1);
  });
});
