/**
 * STEP 4 GATES — attention profiles and buffers.
 *
 * "Par-cooking ahead of a simulated rush measurably improves wait *and*
 * measurably increases waste. Both effects visible in the day report. The core
 * tension exists in text." (BUILD_PLAN step 4.)
 *
 * It does. Cooking four patties ahead buys 1.5 minutes off the mean wait and
 * costs 9% more waste; cooking twelve ahead buys 4.4 minutes and costs seven
 * times the waste. Neither number is tuned — they fall out of §7.3's quality
 * curve applied to §14.1's attention split.
 */
import { describe, expect, it } from 'vitest';
import { DEMAND } from '@/config/demand';
import { KITCHEN } from '@/config/kitchen';
import { RECIPES, type Step } from '@/config/recipes';
import { qualityOf, Stock } from '@/sim/entities/stock';
import { attentionSplit, freshnessWith } from '@/sim/systems/kitchen';
import { buildScenario } from '@/sim/scenario';
import { mean, runSeeds, SATURATION_RATE } from '@/harness/probe';
import type { ItemId } from '@/sim/types';

const SEEDS = [1, 2, 3, 4, 5, 6];
/** Four is enough for a ratio; a quiet run is cheap but not free. */
const QUIET_SEEDS = [1, 2, 3, 4];
const DAYS = 5;
/** Base trade plus a two-hour triple-rate rush to cook ahead of. */
const RUSHY = { days: DAYS, arrivalsPerHour: 30, rush: DEMAND.TEST_RUSH };

/**
 * Two on. The pass now carries front-of-house work, so with a single staffer
 * cooking ahead steals the very hands that serve — and the §7.3 freshness
 * tension gets swamped by a constraint that has nothing to do with freshness.
 * Par-cooking is a decision you make when you have the people to make it.
 */
const CREW = [
  { id: 'staff-1', name: 'Dev', skill: 1 },
  { id: 'staff-2', name: 'Marnie', skill: 1 },
];

const step = (recipe: string, id: string): Step =>
  (RECIPES[recipe]?.steps.find((s) => s.id === id) as Step);

describe('STEP 4 — the attention split (§14.1)', () => {
  it('splits a patty into 8s loading, 68s cooking alone, 14s finishing', () => {
    const split = attentionSplit(step('cheeseburger', 'patty'));
    expect(split).toEqual({ setup: 8, cook: 68, finish: 14 });
    // Twenty-two seconds of human attention inside ninety seconds of cooking.
    // That ratio is the whole premise of the automation ladder.
    expect(split.setup + split.finish).toBe(22);
    expect(split.setup + split.cook + split.finish).toBe(90);
  });

  it('leaves fully manual steps fully manual', () => {
    // Assembling a burger is eighteen seconds of hands. There is nothing to
    // walk away from, and no machine in §14.2 claims otherwise.
    expect(attentionSplit(step('cheeseburger', 'assemble')).cook).toBe(0);
    expect(attentionSplit(step('cheeseburger', 'garnish')).cook).toBe(0);
  });

  it('never invents or loses elapsed time', () => {
    for (const recipe of Object.values(RECIPES)) {
      for (const s of recipe.steps) {
        const split = attentionSplit(s);
        expect(split.setup + split.cook + split.finish).toBeCloseTo(s.duration, 6);
      }
    }
  });

  it('lets one person run a bigger kitchen than they could watch', () => {
    // The claim in one measurement: the same shop, the same staffer, the same
    // arrivals — the only difference is whether cooking holds a person.
    const covers = (unattended: boolean): number => {
      const world = buildScenario({ seed: 1, arrivalsPerHour: 40 });
      // Reach past config deliberately: this asserts the mechanism, not a tunable.
      const original = KITCHEN.UNATTENDED_COOKING;
      (KITCHEN as { UNATTENDED_COOKING: boolean }).UNATTENDED_COOKING = unattended;
      try {
        world.runDays(DAYS);
        return world.dayReports.reduce((a, r) => a + Number(r.lines['covers'] ?? 0), 0);
      } finally {
        (KITCHEN as { UNATTENDED_COOKING: boolean }).UNATTENDED_COOKING = original;
      }
    };
    // +12%, measured. It was +20% before attention became per-item: charging
    // a batch of four for four sets of hands means there is less attention
    // left for walking away from, so the release buys proportionally less.
    expect(covers(true)).toBeGreaterThan(covers(false) * 1.1);
  });
});

describe('STEP 4 — par-cooking improves wait AND increases waste', () => {
  const noPar = runSeeds({ ...RUSHY, staff: CREW }, SEEDS);
  const somePar = runSeeds({ ...RUSHY, staff: CREW, parLevels: { patty: 8 } }, SEEDS);
  const lotsOfPar = runSeeds(
    { ...RUSHY, staff: CREW, parLevels: { patty: 12, chips: 6 } },
    SEEDS,
  );

  it('measurably improves mean wait', () => {
    const base = mean(noPar.map((r) => r.meanWaitMinutes));
    const par8 = mean(somePar.map((r) => r.meanWaitMinutes));
    const par12 = mean(lotsOfPar.map((r) => r.meanWaitMinutes));
    expect(par8).toBeLessThan(base);
    expect(par12).toBeLessThan(par8);
  });

  it('measurably increases waste', () => {
    const base = mean(noPar.map((r) => r.wasteUnits));
    const par8 = mean(somePar.map((r) => r.wasteUnits));
    const par12 = mean(lotsOfPar.map((r) => r.wasteUnits));
    // 256 -> 594 -> 1787 units binned.
    expect(par8).toBeGreaterThan(base * 1.5);
    expect(par12).toBeGreaterThan(par8 * 1.5);
  });

  it('is a trade, not a free win — it buys time, never capacity', () => {
    /**
     * Par-cooking buys the customer's time, not the shop's capacity. If it also
     * raised throughput it would just be an upgrade, and there would be no
     * decision to make.
     *
     * This asserted "covers move less than 5%" and drifted to 5.9% at step 11.
     * Two hypotheses, both measured, and the obvious one was wrong:
     *
     *   balking       noPar 281.5 walkouts, par12 292.7 — par-cooking turned
     *                 away slightly MORE people, so this is not it
     *   recovery      noPar spent 0.8 days of 5 under the §10 Recovery Plan,
     *                 par12 spent none — and the plan takes 12% off demand
     *
     * So the extra covers are arrivals the no-par shop never got, because it
     * dipped under 2.5 stars and the review-bomb penalty bit. That is three
     * systems interacting correctly and a gate measuring the wrong quantity:
     * `covers` was never a throughput measure here, because `served/arrived` is
     * 1.000 in BOTH arms — this kitchen clears its board either way.
     *
     * The capacity claim is now asserted where it actually lives.
     */
    const ratio = (rs: typeof noPar): number =>
      mean(rs.map((r) => r.covers)) / mean(rs.map((r) => r.arrived));
    // Neither arm is capacity-bound. This is what "covers barely move" was
    // reaching for and never actually said.
    expect(ratio(noPar)).toBeCloseTo(1, 2);
    expect(ratio(lotsOfPar)).toBeCloseTo(1, 2);

    // Units made per customer served: the shop's real output per head, which
    // par-cooking must not change. It cooks the same food, earlier.
    const perHead = (rs: typeof noPar): number =>
      mean(rs.map((r) => r.unitsProduced)) / mean(rs.map((r) => r.covers));
    expect(perHead(lotsOfPar) / perHead(noPar)).toBeCloseTo(1, 1);

    // And it does not turn the kitchen into a bigger kitchen: the covers gap
    // stays small enough to be an economy effect rather than a capacity one.
    const covers = (rs: typeof noPar): number => mean(rs.map((r) => r.covers));
    expect(Math.abs(covers(lotsOfPar) / covers(noPar) - 1)).toBeLessThan(0.1);
  });

  it('shows both effects in the day report', () => {
    const world = buildScenario({ ...RUSHY, seed: 1, staff: CREW, parLevels: { patty: 8 } });
    world.runDays(DAYS);
    for (const report of world.dayReports) {
      expect(report.lines).toHaveProperty('waste');
      expect(report.lines).toHaveProperty('meanWaitMin');
    }
    const totalWaste = world.dayReports.reduce((a, r) => a + Number(r.lines['waste'] ?? 0), 0);
    expect(totalWaste).toBeGreaterThan(0);
  });

  it('wastes almost nothing on a quiet day, and a cabinet fixes what it does', () => {
    // Waste has to be a consequence of a DECISION or of overload, never a
    // standing tax. This gate asserted zero until §6.2's table of six landed,
    // and the six-top makes it genuinely non-zero: six burgers is one order, so
    // the toaster fires a batch of six at once and assembly works through them
    // one at a time. The last bun of that six sits. Measured across four seeds
    // at five arrivals an hour, that is 16 units on 1,055 — 1.5%, all of it
    // toasted buns, nothing else on any other item.
    //
    // That is not a standing tax, it is the shape of the demand meeting the
    // batch size of the toaster — and the answer to it is a purchase. A single
    // holding cabinet takes it to 0.3%. Asserting the DROP rather than the
    // level is the stronger gate anyway: it proves the cabinet does something,
    // which "expect(0)" never could.
    const quiet = runSeeds({ days: DAYS, arrivalsPerHour: 5 }, QUIET_SEEDS);
    const withCabinet = runSeeds(
      { days: DAYS, arrivalsPerHour: 5, holdingCabinets: 1 },
      QUIET_SEEDS,
    );
    const bare = mean(quiet.map((r) => r.wasteUnits));
    const cabinet = mean(withCabinet.map((r) => r.wasteUnits));
    const produced = mean(quiet.map((r) => r.unitsProduced));

    // Small in absolute terms: a quiet day is not a shop throwing food away.
    expect(bare / produced).toBeLessThan(0.03);
    // And it is the cabinet's problem to solve, not a number that never moves.
    expect(cabinet).toBeLessThan(bare / 2);
  });
});

describe('STEP 4 — freshness, quality and waste (§7.3)', () => {
  it('holds quality at 1 inside the window, then decays linearly', () => {
    expect(qualityOf(0, 480)).toBe(1);
    expect(qualityOf(480, 480)).toBe(1);
    expect(qualityOf(480 + KITCHEN.QUALITY_DECAY_SECONDS / 2, 480)).toBeCloseTo(0.5, 6);
    expect(qualityOf(999, undefined)).toBe(1);
  });

  it('bins items below quality 0.35', () => {
    const stock = new Stock();
    const patty = 'patty' as ItemId;
    stock.add(patty, 4, 0, 480);
    // Still good at eight minutes plus a little decay.
    expect(stock.binExpired(600).size).toBe(0);
    expect(stock.count(patty)).toBe(4);
    // 0.35 is reached 390 seconds past the window.
    const binned = stock.binExpired(480 + 0.66 * KITCHEN.QUALITY_DECAY_SECONDS);
    expect(binned.get(patty)?.units).toBe(4);
    expect(stock.count(patty)).toBe(0);
  });

  it('draws oldest-first, the way a kitchen rotates', () => {
    const stock = new Stock();
    const patty = 'patty' as ItemId;
    stock.add(patty, 2, 0, 480);
    stock.add(patty, 2, 500, 480);
    // At t=600 the first lot is 600s old (past window), the second is 100s.
    const drawn = stock.take(patty, 2, 600);
    expect(drawn).not.toBeNull();
    expect(drawn?.quality).toBeCloseTo(qualityOf(600, 480), 6);
    // The fresh lot survives untouched.
    expect(stock.meanQuality(patty, 600)).toBe(1);
  });

  it('refuses a partial take rather than half-filling an order', () => {
    const stock = new Stock();
    const chips = 'chips' as ItemId;
    stock.add(chips, 2, 0, 300);
    expect(stock.take(chips, 3, 0)).toBeNull();
    expect(stock.count(chips)).toBe(2);
  });
});

describe('STEP 4 — canLapse: food left unattended suffers', () => {
  it('marks the steps that can lapse and the ones that cannot', () => {
    expect(step('cheeseburger', 'patty').attention.canLapse).toBe(true);
    expect(step('chips', 'basket').attention.canLapse).toBe(true);
    // You cannot burn an assembled burger by not looking at it.
    expect(step('cheeseburger', 'assemble').attention.canLapse).toBe(false);
  });

  it('degrades a cooked batch nobody comes back for', () => {
    // Overload one staffer badly enough that cooked food sits waiting.
    // Trade opens at 11:00, which is tick 3300 — a shorter loop never opens
    // the shop and the test would pass or fail for the wrong reason.
    const world = buildScenario({ seed: 3, arrivalsPerHour: 120 });
    let sawLapse = false;
    let sawQualityLoss = false;
    for (let i = 0; i < 9000 && !sawQualityLoss; i++) {
      world.tick();
      for (const job of world.state.jobs.values()) {
        if (job.lapseSeconds > KITCHEN.LAPSE_GRACE_SECONDS) sawLapse = true;
        if (job.canLapse && job.quality < 1) sawQualityLoss = true;
      }
    }
    expect(sawLapse).toBe(true);
    expect(sawQualityLoss).toBe(true);
  });

  it('never lets a job lapse below zero quality', () => {
    const world = buildScenario({ seed: 4, arrivalsPerHour: 120 });
    world.runDays(2);
    for (const job of world.state.jobs.values()) {
      expect(job.quality).toBeGreaterThanOrEqual(0);
      expect(job.quality).toBeLessThanOrEqual(1);
    }
  });
});

describe('STEP 4 — holding cabinets extend freshness windows (§14.2 tier 1)', () => {
  it('multiplies the window, and only for items that have one', () => {
    expect(freshnessWith(480, 0)).toBe(480);
    expect(freshnessWith(480, 1)).toBe(480 * KITCHEN.HOLDING_CABINET_FRESHNESS_MULTIPLIER);
    expect(freshnessWith(undefined, 2)).toBeUndefined();
  });

  it('cuts the waste that par-cooking creates', () => {
    const without = runSeeds({ ...RUSHY, staff: CREW, parLevels: { patty: 8 } }, SEEDS);
    const withOne = runSeeds(
      { ...RUSHY, staff: CREW, parLevels: { patty: 8 }, holdingCabinets: 1 },
      SEEDS,
    );
    // 594 -> 139 units binned.
    expect(mean(withOne.map((r) => r.wasteUnits))).toBeLessThan(
      mean(without.map((r) => r.wasteUnits)) * 0.5,
    );
  });

  it('buys nothing on its own — it only pays if you cook ahead', () => {
    const noPar = runSeeds({ ...RUSHY, staff: CREW }, SEEDS);
    // The shape every good upgrade in this game should have. A cabinet with
    // make-to-order production changes the wait not at all.
    const noParCabinet = runSeeds({ ...RUSHY, staff: CREW, holdingCabinets: 1 }, SEEDS);
    const before = mean(noPar.map((r) => r.meanWaitMinutes));
    const after = mean(noParCabinet.map((r) => r.meanWaitMinutes));
    expect(Math.abs(after / before - 1)).toBeLessThan(0.05);
  });
});

describe('STEP 4 — the six-tile floor delta, carried from step 3', () => {
  /**
   * Step 3 measured 6.6% and predicted attention profiles would roughly triple
   * it. **That prediction was wrong**, and in an interesting direction: once a
   * staffer can walk away from a cooking patty, extra walking eats their idle
   * time before it eats production. The raw capacity tax actually FELL, to
   * ~3.5% of batches.
   *
   * What did NOT fall is what the customer experiences. At the point where the
   * tight kitchen is just coping, the stretched one has already tipped over,
   * and the gap in covers served is ~9.5%. That is the honest number and it is
   * the one a player would feel.
   *
   * Q1 is still open, and now has real data behind it. See D016.
   */
  const KNEE = SATURATION_RATE;
  const tight = runSeeds({ days: DAYS, layoutId: 'leichhardtTight', arrivalsPerHour: KNEE }, [1, 2, 3, 4]);
  const stretched = runSeeds({ days: DAYS, layoutId: 'leichhardtStretched', arrivalsPerHour: KNEE }, [1, 2, 3, 4]);

  it('costs covers at the point the kitchen is just coping', () => {
    const delta = 1 - mean(stretched.map((r) => r.covers)) / mean(tight.map((r) => r.covers));
    // Smaller than the 9.4% measured before §6.3, because a stretched kitchen
    // now loses customers to the door as well as to the clock — the cost has
    // moved into `walked`, it has not gone away.
    expect(delta).toBeGreaterThan(0.02);
  });

  it('costs far more in wait than in capacity — the real bite', () => {
    // The stretched kitchen does not fail so much as fall behind. With balking
    // in play the gap now shows up as walkouts as well as wait, so the wait
    // multiple is smaller than the 2.7x measured before §6.3 existed.
    expect(mean(stretched.map((r) => r.meanWaitMinutes))).toBeGreaterThan(
      mean(tight.map((r) => r.meanWaitMinutes)) * 1.02,
    );
  });
});
