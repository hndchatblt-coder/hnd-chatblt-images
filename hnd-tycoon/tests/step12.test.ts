/**
 * STEP 12 GATES — the equipment ladder.
 *
 * "Tiers 1–5 from §14.2, each wired through attention profiles. Machine
 * reliability proportional to run-hours, preventive maintenance as a skippable
 * recurring cost, a new incident class per machine type. **Every machine trades
 * labour for at least two of: capital, floor space, utilities, flexibility,
 * reliability.**"
 *
 * **Exit:** `bot:roboboss` and `bot:tightarse` both finish within 25% of
 * `bot:balanced` — neither strategy may dominate.
 */
import { describe, expect, it } from 'vitest';
import { MACHINES, MACHINE_RULES } from '@/config/machines';
import { RECIPES } from '@/config/recipes';
import { STATION_SPECS } from '@/config/stations';
import { buy } from '@/sim/actions';
import { buildScenario } from '@/sim/scenario';
import { attentionSplit, machinedAttention } from '@/sim/systems/kitchen';
import { valueScore } from '@/sim/systems/reputation';
import { fairPriceBand } from '@/sim/systems/demand';
import { BOTS, runBot } from '@/harness/bots';

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const botNamed = (name: string): (typeof BOTS)[number] => {
  const bot = BOTS.find((b) => b.name === name);
  if (!bot) throw new Error(`no bot:${name}`);
  return bot;
};

describe('STEP 12 — §14.3, enforced rather than asserted', () => {
  it('makes every machine trade labour for at least TWO real costs', () => {
    // "If a piece is strictly better than not having it, it's a stat upgrade
    // in a costume. Cut it or add a cost."
    for (const m of MACHINES) {
      expect(m.costs.length, `${m.id} lists ${m.costs.length} costs`).toBeGreaterThanOrEqual(2);
      expect(new Set(m.costs).size).toBe(m.costs.length);
    }
  });

  it('backs every declared cost with a number that actually bites', () => {
    // A cost listed in an array and nowhere else is a claim, not a cost.
    for (const m of MACHINES) {
      if (m.costs.includes('capital')) expect(m.price.cents).toBeGreaterThan(0);
      if (m.costs.includes('utilities')) expect(m.utilitiesPerHour).toBeGreaterThan(0);
      if (m.costs.includes('reliability')) {
        expect(m.failuresPerKiloHour).toBeGreaterThan(0);
        expect(m.calloutCost).toBeGreaterThan(0);
      }
      if (m.costs.includes('floorSpace')) {
        /**
         * It must genuinely take tiles out of the room, or the cost is a
         * fiction. Three shapes and every machine is exactly one:
         *   bench-top    — sits on its host, takes nothing
         *   replacement  — only the excess over its host's own footprint
         *   standalone   — an addition, all of it
         */
        expect(m.benchTop).not.toBe(true);
        const host = STATION_SPECS[m.station];
        const taken =
          m.standalone === true
            ? m.width * m.depth
            : m.width * m.depth - host.width * host.depth;
        expect(taken, `${m.id} claims floorSpace but takes ${taken} tiles`).toBeGreaterThan(0);
      }
    }
  });

  it('buys back ATTENTION and never time — nothing here touches the clock', () => {
    /**
     * §14.2's thesis, as a structural gate. A patty is ninety seconds on a
     * clamshell exactly as it is on a flat-top.
     */
    for (const m of MACHINES) {
      expect(m).not.toHaveProperty('speedMultiplier');
      expect(m).not.toHaveProperty('durationMultiplier');
      const touches =
        m.attention.setup !== undefined ||
        m.attention.tend !== undefined ||
        m.attention.teardown !== undefined ||
        m.attention.canLapse !== undefined;
      expect(touches, `${m.id} changes nothing about attention`).toBe(true);
    }
  });

  it('never invents unattended time out of a saved second', () => {
    /**
     * The bug this catches cost $4,778 of trade over ninety days from a $1,250
     * bench-top pump, and it is subtle enough to come back.
     *
     * `cook` is the gap a person can walk away during. It is a property of the
     * FOOD. Deriving it as `duration - machinedSetup - machinedFinish` meant
     * that cutting assembly's setup with a sauce rail conjured four seconds of
     * "cooking" into an eighteen-second hand step — and §14.1 released the
     * staffer into it, so buying the machine bought extra walking.
     */
    const assemble = RECIPES['cheeseburger']?.steps.find((s) => s.id === 'assemble');
    expect(assemble).toBeDefined();
    const step = assemble as NonNullable<typeof assemble>;

    const bare = attentionSplit(step, 1);
    expect(bare.cook).toBe(0);

    const withRail = {
      id: 'assembly-1',
      type: 'assembly' as const,
      speedMultiplier: 1,
      jobId: null,
      runSeconds: 0,
      machines: ['sauceRail'],
      machineHours: {},
    };
    const machined = attentionSplit(step, 1, withRail);
    // Less attention, and NOT a gap to walk away into.
    expect(machined.setup).toBeLessThan(bare.setup);
    expect(machined.cook).toBe(0);
    // A hand step that needs less hand takes less time. That is the saving.
    const total = (s: typeof bare): number => s.setup + s.cook + s.finish;
    expect(total(machined)).toBeLessThan(total(bare));
  });

  it('drops a broken machine back to manual rather than taxing the station', () => {
    // §14.4: "the manual fallback is slower because you sold the old gear" —
    // the cost of a breakdown is losing the benefit, not a second penalty on
    // top. Double-counting it made a clogged nozzle run the whole assembly
    // bench at 30%.
    const assemble = RECIPES['cheeseburger']?.steps.find((s) => s.id === 'assemble');
    const station = {
      id: 'assembly-1',
      type: 'assembly' as const,
      speedMultiplier: 1,
      jobId: null,
      runSeconds: 0,
      machines: ['sauceRail'],
      machineHours: {},
    };
    const step = assemble as NonNullable<typeof assemble>;
    const working = machinedAttention(step, station);
    const broken = machinedAttention(step, station, new Set(['sauceRail']));
    expect(working.setupSeconds).toBeLessThan(step.attention.setupSeconds);
    expect(broken).toEqual(step.attention);
  });

  it('gates the top of the ladder on venue count, not on cash — §14.5', () => {
    const robot = MACHINES.find((m) => m.id === 'roboFry');
    expect(robot?.requiresSites).toBeGreaterThan(1);
    const world = buildScenario({ seed: 1, openingCash: { cents: 800_000_000, currency: 'AUD' } });
    world.runDays(1);
    const result = buy(world.state, 'roboFry');
    // Refused with money in the bank, which is the whole point.
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('shops');
  });

  it('never lets a machine wall in the station it bolts onto', () => {
    // Measured before the check existed: a conveyor took the last access tile
    // of its own toaster and covers fell from 10,595 to 116 over ninety days.
    const world = buildScenario({ seed: 1, openingCash: { cents: 800_000_000, currency: 'AUD' } });
    world.runDays(1);
    for (const m of MACHINES) buy(world.state, m.id);
    for (const station of world.state.stations) {
      expect(
        world.state.floor.accessTiles(station.id).length,
        `${station.id} has nowhere to stand`,
      ).toBeGreaterThan(0);
    }
  });

  it('services machines as one skippable weekly cost, never a schedule', () => {
    // §14.4 describes exactly one decision. A per-machine schedule is admin.
    const world = buildScenario({ seed: 1 });
    expect(world.state.maintaining).toBe(true);
    expect(MACHINE_RULES.MAINTAINED_FAILURE_MULTIPLIER).toBeLessThan(1);
    expect(MACHINE_RULES.MAINTAINED_FAILURE_MULTIPLIER).toBeGreaterThan(0);
  });
});

describe('STEP 12 — §8.2: charging over the odds costs you the room', () => {
  it('is free inside the band and never punishes a cheap shop', () => {
    const band = fairPriceBand(3.8);
    expect(valueScore(band.low, 3.8)).toBe(1);
    expect(valueScore(band.high, 3.8)).toBe(1);
    expect(valueScore(0.7, 3.8)).toBe(1);
  });

  it('bites above the band, which is what stops "small and dear" dominating', () => {
    const band = fairPriceBand(3.8);
    expect(valueScore(band.high + 0.1, 3.8)).toBeLessThan(1);
    expect(valueScore(1.5, 3.8)).toBeLessThan(valueScore(band.high + 0.1, 3.8));
    // Bounded — §10 forbids a state you cannot trade out of.
    expect(valueScore(1.8, 3.8)).toBeGreaterThan(0);
  });
});

describe('STEP 12 — EXIT: neither strategy may dominate', () => {
  const SEEDS = [1, 2, 3, 4];
  const DAYS = 90;
  const TOLERANCE = 0.25;

  const finish = (name: string): number =>
    mean(
      SEEDS.map((seed) => {
        const run = runBot(botNamed(name), seed, DAYS);
        return run.days[run.days.length - 1]?.cashCents ?? 0;
      }),
    );

  it('lands tightarse and roboboss within 25% of balanced', () => {
    /**
     * The gate this whole step exists for. Measured, 90 days, four seeds:
     *
     *   balanced   $74,028   21,774 covers   3.39 stars
     *   tightarse  $71,156    8,874 covers   3.47 stars    -3.9%
     *   roboboss   $87,066   13,737 covers   3.91 stars   +17.6%
     *
     * Three genuinely different shops. The lean one serves 40% of the covers
     * for about the same money; the automated one serves fewer covers than the
     * staffed one and keeps more of the takings. None of them is the answer.
     *
     * It started at +85% and -262%, and the whole gap was mis-modelling rather
     * than mis-pricing — see D047-D050.
     */
    const balanced = finish('balanced');
    expect(balanced).toBeGreaterThan(0);

    for (const name of ['tightarse', 'roboboss']) {
      const delta = finish(name) / balanced - 1;
      expect(
        Math.abs(delta),
        `bot:${name} finished ${(delta * 100).toFixed(1)}% from balanced`,
      ).toBeLessThan(TOLERANCE);
    }
  });

  it('keeps the automated shop leaner on labour than the staffed one — §14.5', () => {
    // "Endgame target ~labour 22-26% heavily automated vs 30-34% without."
    // Not asserted to the point here, because Act I is one shop and §14.5 is
    // describing the endgame. What must hold is the DIRECTION: automation buys
    // a lower labour share, and it costs capital and utilities to get it.
    const share = (name: string): number =>
      mean(
        SEEDS.map((seed) => {
          const world = buildScenario({ seed });
          const bot = botNamed(name);
          world.runDays(1);
          for (let day = 1; day < 60; day++) {
            bot.onSession(world);
            world.runDays(1);
          }
          const revenue = world.state.ledger.total('revenue').cents;
          return revenue > 0 ? world.state.ledger.total('wages').cents / revenue : 1;
        }),
      );
    expect(share('roboboss')).toBeLessThan(share('balanced'));
  });
});
