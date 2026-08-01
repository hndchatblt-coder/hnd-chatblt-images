/**
 * STEP 10 GATES — demand, pricing, marketing, balking.
 *
 * "Full demand formula including `competitorPressure` pinned at zero (§6.1).
 * Daypart and day-of-week curves. Customer archetypes. Balking with the
 * ambience modifier. Pricing UI with a live fair-price band (§8.2). Marketing
 * channels with cost-per-cover surfaced (§8.3)." — BUILD_PLAN step 10.
 *
 * The `bot:naive` half of the exit criterion is gated by `npm run balance`,
 * which prints the chart and fails the build if the spiral stops happening.
 */
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  ARCHETYPE_MEAN_QUANTITY,
  ARCHETYPE_PATIENCE_MEAN,
  archetypeOf,
} from '@/config/archetypes';
import { MARKETING, MARKETING_CHANNELS, PRICING } from '@/config/marketing';
import { REPUTATION } from '@/config/reputation';
import { RENDER } from '@/config/render';
import { DAYPART, DAY_OF_WEEK, daypartMultiplier, dayOfWeekMultiplier } from '@/config/demand';
import { setMarketing, setPrice } from '@/sim/actions';
import { buildScenario } from '@/sim/scenario';
import { createState } from '@/sim/state';
import {
  costPerCover,
  demandMultiplier,
  demandRate,
  fairPriceBand,
  fairPriceMultiplier,
  marketingEfficiency,
  priceResistance,
  reputationMultiplier,
} from '@/sim/systems/demand';
import { mean, runSeeds } from '@/harness/probe';

const SEEDS = [1, 2, 3, 4];
const DAYS = 28;

describe('STEP 10 — the whole of the §6.1 formula is present', () => {
  it('multiplies every term the spec lists, including the ones pinned at zero', () => {
    const state = createState({});
    // competitorPressure is zero until Act III and specialUplift until step 15.
    // §6.1 is explicit that both must be IN the formula from the start: "adding
    // it later to a shipped economy would require rebalancing everything."
    expect(state.competitorPressure).toBe(0);
    expect(state.specialUplift).toBe(0);

    // With everything neutral, the only live term is reputation.
    const neutral = demandMultiplier(state, REPUTATION.PRIOR_STARS);
    expect(neutral).toBeCloseTo(reputationMultiplier(REPUTATION.PRIOR_STARS), 10);

    // And each term, moved on its own, moves the answer in the stated direction.
    const marketed = { ...state, marketingAwareness: 0.5 };
    expect(demandMultiplier(marketed, REPUTATION.PRIOR_STARS)).toBeCloseTo(neutral * 1.5, 8);

    const special = { ...state, specialUplift: 0.2 };
    expect(demandMultiplier(special, REPUTATION.PRIOR_STARS)).toBeCloseTo(neutral * 1.2, 8);

    const pressured = { ...state, competitorPressure: 0.3 };
    expect(demandMultiplier(pressured, REPUTATION.PRIOR_STARS)).toBeCloseTo(neutral * 0.7, 8);
  });

  it('makes a half-star at the top worth more than a half-star at the bottom', () => {
    // The exponent is the reason reputation is an asset and not a score: a
    // linear curve would make these two gaps identical. Measured, the half-star
    // from 4.5 to 5.0 is worth 0.178 of foot traffic and the half-star from 3.0
    // to 3.5 is worth 0.142 — about 25% more, not the several times more the
    // exponent might suggest at a glance. 1.6 is a gentle curve on purpose;
    // anything steeper would make an early bad week unrecoverable, and §10
    // forbids that.
    const lowGap = reputationMultiplier(3.5) - reputationMultiplier(3.0);
    const highGap = reputationMultiplier(5.0) - reputationMultiplier(4.5);
    expect(highGap).toBeGreaterThan(lowGap * 1.2);
  });

  it('never lets a bad rating take the shop to zero trade', () => {
    // §10: the player can never lose. A one-star shop is a bad business, not a
    // dead one — some people are just hungry and standing outside.
    expect(reputationMultiplier(REPUTATION.MIN_STARS)).toBeGreaterThan(0.3);
    expect(reputationMultiplier(REPUTATION.MAX_STARS)).toBeGreaterThan(
      reputationMultiplier(REPUTATION.MIN_STARS) * 2,
    );
  });

  it('carries the daypart and day-of-week curves into the rate', () => {
    const state = createState({});
    const satDinner = demandRate(state, REPUTATION.PRIOR_STARS, 19, 6);
    const tueAfternoon = demandRate(state, REPUTATION.PRIOR_STARS, 16, 2);
    // Saturday at seven against Tuesday at four. If these were close, there
    // would be no peak to staff for and no roster decision at all.
    expect(satDinner / tueAfternoon).toBeGreaterThan(10);
  });

  it('normalises the daypart curve so its shape cannot move the total', () => {
    const hours = Object.keys(DAYPART).map(Number);
    const avg = mean(hours.map((h) => daypartMultiplier(h)));
    expect(avg).toBeCloseTo(1, 6);
    // Day-of-week is deliberately NOT normalised — a week is a week, and Friday
    // really is busier than Monday in total, not just in shape.
    expect(dayOfWeekMultiplier(6)).toBeGreaterThan(dayOfWeekMultiplier(1));
    expect(DAY_OF_WEEK.length).toBe(7);
  });
});

describe('STEP 10 — archetypes (§6.2) are mechanical, not decorative', () => {
  it('gives every archetype teeth in at least one system', () => {
    for (const a of ARCHETYPES) {
      expect(a.weight).toBeGreaterThan(0);
      expect(a.patience).toBeGreaterThan(0);
      // Decoration is an archetype identical to the average in every dimension.
      const distinct =
        Math.abs(a.patience - 1) > 0.05 ||
        Math.abs(a.spend - 1) > 0.05 ||
        Math.abs(a.reviewRate - 1) > 0.05 ||
        a.quantity !== 1;
      expect(distinct, `${a.id} is indistinguishable from an average customer`).toBe(true);
    }
  });

  it('normalises patience harmonically, so adding shape cannot move the level', () => {
    // The bug this catches, measured: the authored table has an ARITHMETIC mean
    // patience of 1.01 and looks perfectly balanced. Balking runs as
    // over/(window * patience), so what actually matters is the harmonic mean —
    // 0.73 — and the shop shed 9% of a quiet Monday as a result.
    const harmonic =
      1 / mean(ARCHETYPES.map((a) => a.weight / a.patience)) / (1 / mean(ARCHETYPES.map((a) => a.weight)));
    expect(harmonic).toBeCloseTo(1, 6);
    expect(ARCHETYPE_PATIENCE_MEAN).toBeGreaterThan(0);
    expect(ARCHETYPE_PATIENCE_MEAN).toBeLessThan(1);
  });

  it('keeps the spread that makes §6.2 worth having', () => {
    const patiences = ARCHETYPES.map((a) => a.patience);
    // Normalising the level must not flatten the differences — the whole point
    // is that the app-speed customer and the Regular experience the same queue
    // completely differently.
    expect(Math.max(...patiences) / Math.min(...patiences)).toBeGreaterThan(3);
  });

  it('normalises quantity, so a table of six is a lump and not free money', () => {
    // Covers per arrival. Without dividing the arrival rate by this, adding the
    // six-top raised revenue per arrival by 40% and left wages alone, which
    // made labour 40% cheaper in real terms overnight.
    expect(ARCHETYPE_MEAN_QUANTITY).toBeCloseTo(1.4, 2);
    expect(ARCHETYPES.some((a) => a.quantity > 1)).toBe(true);
  });

  it('puts six burgers on ONE ticket, not six tickets', () => {
    // The dread is that it arrives indivisible: the pass is blocked until all
    // six exist. Six separate orders would just be a busy minute.
    const world = buildScenario({ seed: 3 });
    world.runDays(4);
    const sixTops = [...world.state.orders.values()].filter(
      (o) => o.archetypeId === 'tableOfSix',
    );
    expect(sixTops.length).toBeGreaterThan(0);
    for (const order of sixTops) {
      expect(order.lines.length).toBe(1);
      expect(order.lines[0]?.quantity).toBe(6);
    }
  });

  it('makes the impatient walk first when the queue builds', () => {
    // The property that makes archetypes visible without a label: a slow
    // service does not lose an average slice of its customers, it loses a
    // specific KIND of customer.
    const world = buildScenario({ seed: 5, arrivalsPerHour: 90 });
    world.runDays(7);
    const balked = world.state.day.balkedBy;
    const share = (id: string): number =>
      (balked[id] ?? 0) / Math.max(1, Object.values(balked).reduce((a, b) => a + b, 0));
    const weight = (id: string): number =>
      (archetypeOf(id).weight) / ARCHETYPES.reduce((a, b) => a + b.weight, 0);

    // App-speed customers are over-represented among walkouts; Regulars under.
    expect(share('deliverooBrain')).toBeGreaterThan(weight('deliverooBrain'));
    expect(share('regular')).toBeLessThan(weight('regular'));
  });

  it('reports walkouts by archetype so the readout can say which kind', () => {
    const world = buildScenario({ seed: 7, arrivalsPerHour: 90 });
    world.runDays(3);
    const by = world.state.day.balkedBy;
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBe(world.state.day.balked);
  });
});

describe('STEP 10 — pricing is a lever with a delayed cost (§8.2)', () => {
  it('raises the fair price with the rating — this is how reputation pays', () => {
    expect(fairPriceMultiplier(4.6)).toBeGreaterThan(fairPriceMultiplier(3.8));
    expect(fairPriceMultiplier(REPUTATION.PRIOR_STARS)).toBeCloseTo(
      PRICING.FAIR_PRICE_AT_PRIOR,
      10,
    );
    const band = fairPriceBand(4.6);
    expect(band.low).toBeLessThan(band.high);
    expect(band.high - band.low).toBeCloseTo(PRICING.FAIR_BAND * 2, 10);
  });

  it('charges no resistance inside the band and real resistance above it', () => {
    // Priced at or under fair, nobody minds. That has to be true or the only
    // strategy is to charge as little as possible.
    expect(priceResistance(fairPriceMultiplier(3.8), 3.8)).toBe(0);
    expect(priceResistance(0.8, 3.8)).toBe(0);
    const over = priceResistance(1.4, 3.8);
    expect(over).toBeGreaterThan(0.5);
    expect(over).toBeLessThanOrEqual(PRICING.MAX_RESISTANCE);
    // A four-and-a-half-star shop gets away with a price that would hurt a
    // three-star one. Same price, different resistance.
    expect(priceResistance(1.15, 4.5)).toBeLessThan(priceResistance(1.15, 3.2));
  });

  it('lands the change TOMORROW, not this afternoon', () => {
    // The delay is the design. An instant price would let the player ride it up
    // through the lunch rush and drop it before anyone noticed — a slider, not
    // a decision.
    const world = buildScenario({ seed: 11 });
    world.runDays(2);
    const before = world.state.priceMultiplier;

    const result = setPrice(world.state, 1.25);
    expect(result.ok, result.reason).toBe(true);
    expect(world.state.priceMultiplier).toBe(before);
    expect(world.state.pendingPriceMultiplier).toBe(1.25);

    world.runDays(1);
    expect(world.state.priceMultiplier).toBe(1.25);
    expect(world.state.pendingPriceMultiplier).toBeNull();
  });

  it('refuses a price outside the range, and says so in English', () => {
    const state = createState({});
    const tooHigh = setPrice(state, PRICING.MAX_MULTIPLIER + 1);
    expect(tooHigh.ok).toBe(false);
    expect(tooHigh.reason).toContain('%');
    expect(state.pendingPriceMultiplier).toBeNull();
  });

  it('tells the player where they have landed relative to the band', () => {
    const state = createState({});
    expect(setPrice(state, 1.5).reason).toContain('Above');
    expect(setPrice(state, 0.7).reason).toContain('Under');
    expect(setPrice(state, 1.0).reason).toContain('expect');
  });

  it('trades margin against volume — both directions cost something', () => {
    // The pillar: every dial must fight another dial. Charge more and fewer
    // people come; charge less and you make nothing on the ones who do.
    const runs = (price: number): { cash: number; covers: number } => {
      const rs = SEEDS.map((seed) => {
        const world = buildScenario({ seed });
        setPrice(world.state, price);
        world.runDays(DAYS);
        let covers = 0;
        for (const r of world.dayReports) covers += Number(r.lines['covers'] ?? 0);
        return { cash: world.state.ledger.cash.cents, covers };
      });
      return {
        cash: mean(rs.map((r) => r.cash)),
        covers: mean(rs.map((r) => r.covers)),
      };
    };

    const cheap = runs(0.8);
    const fair = runs(1.0);
    const dear = runs(1.5);

    // Charging more genuinely thins the room.
    expect(dear.covers).toBeLessThan(fair.covers);
    expect(cheap.covers).toBeGreaterThanOrEqual(fair.covers);
    // And giving it away is not a strategy either.
    expect(cheap.cash).toBeLessThan(fair.cash);
  });
});

describe('STEP 10 — marketing is bad money after bad when the shop is bad (§8.3)', () => {
  it('scales efficiency with reputation, exactly as the spec says', () => {
    expect(marketingEfficiency(REPUTATION.MIN_STARS)).toBeCloseTo(
      MARKETING.EFFICIENCY_AT_ONE_STAR,
      10,
    );
    expect(marketingEfficiency(REPUTATION.MAX_STARS)).toBeCloseTo(
      MARKETING.EFFICIENCY_AT_FIVE_STARS,
      10,
    );
    // A two-star shop pays roughly three times per customer what a five-star
    // shop pays. That ratio IS "bad money after bad".
    expect(marketingEfficiency(5) / marketingEfficiency(2)).toBeGreaterThan(2);
  });

  it('surfaces cost-per-cover, which is the number that makes it visible', () => {
    const world = buildScenario({ seed: 13 });
    world.runDays(2);
    for (const channel of MARKETING_CHANNELS) {
      setMarketing(world.state, channel.id, channel.weeklyCost);
    }
    world.runDays(2);

    const perCover = costPerCover(world.state, world.clock.daysPerWeek);
    expect(perCover.cents).toBeGreaterThan(0);
    // The day report carries it, so the panel has something to draw.
    const line = world.dayReports[world.dayReports.length - 1]?.lines['costPerCover'];
    expect(line).toBeDefined();
  });

  it('warns at the moment of the decision, not in next week&apos;s P&L', () => {
    const state = createState({});
    state.stars = 2.0;
    const bad = setMarketing(state, 'social', 420);
    expect(bad.ok).toBe(true);
    // A number, in the reason string, at the moment they commit the money.
    expect(bad.reason).toMatch(/\d+(\.\d+)?x per customer/);

    state.stars = 4.8;
    expect(setMarketing(state, 'social', 420).reason).not.toContain('per customer');
  });

  it('bills weekly with payroll, as one number', () => {
    // §8.3: "the Sunday bill is labour plus marketing, two decisions arriving
    // as one number."
    const world = buildScenario({ seed: 17 });
    world.runDays(1);
    for (const channel of MARKETING_CHANNELS) {
      setMarketing(world.state, channel.id, channel.weeklyCost);
    }
    const before = world.state.ledger.total('marketing').cents;
    world.runDays(8);
    const after = world.state.ledger.total('marketing').cents;
    const weekly = MARKETING_CHANNELS.reduce((a, c) => a + c.weeklyCost, 0);
    expect(after - before).toBeGreaterThanOrEqual(weekly * 100);
  });

  it('decays awareness, so a spend stopped is a spend that fades', () => {
    const world = buildScenario({ seed: 19 });
    world.runDays(1);
    setMarketing(world.state, 'social', 420);
    world.runDays(10);
    const peak = world.state.marketingAwareness;
    expect(peak).toBeGreaterThan(0);

    setMarketing(world.state, 'social', 0);
    world.runDays(10);
    expect(world.state.marketingAwareness).toBeLessThan(peak / 2);
  });

  it('caps awareness — you cannot buy a queue out of nothing', () => {
    const world = buildScenario({ seed: 23 });
    world.runDays(1);
    for (const channel of MARKETING_CHANNELS) {
      setMarketing(world.state, channel.id, channel.weeklyCost * 50);
    }
    world.runDays(30);
    expect(world.state.marketingAwareness).toBeLessThanOrEqual(MARKETING.MAX_AWARENESS);
  });

  it('refuses a channel that does not exist, and a negative spend', () => {
    const state = createState({});
    expect(setMarketing(state, 'skywriting', 100).ok).toBe(false);
    expect(setMarketing(state, 'social', -100).ok).toBe(false);
  });
});

describe('STEP 10 — the queue fits the street it is drawn on', () => {
  it('never lays a customer out past the strip fitCamera reserved', () => {
    /**
     * This project has now drawn the queue underneath the opaque bottom bar
     * TWICE — once with a hardcoded canvas size, and again the moment a queue
     * got long enough to need a fifth row. Both times it hid the single most
     * emotionally legible object on the screen, and the second time it hid the
     * walkout, which is this step's entire exit criterion.
     *
     * So it is a gate rather than a comment. The furthest-back person in the
     * queue must stand inside the street, with the head offset included.
     */
    const deepest =
      RENDER.QUEUE.headOffset + (RENDER.QUEUE.rows - 1) * RENDER.QUEUE.rowPitch;
    expect(deepest).toBeLessThan(RENDER.STREET_ROWS);
    // And with the sprite's own height on top of it, still inside.
    expect(deepest + RENDER.QUEUE.rowPitch).toBeLessThanOrEqual(RENDER.STREET_ROWS);
  });

  it('keeps the ticket rail ramp in the order the eye expects', () => {
    // White, then amber, then red. A rail where red came before amber would be
    // worse than no rail — §21.3 reserves these three hues precisely so that
    // their ORDER carries meaning without a legend.
    expect(RENDER.RAIL.amberMinutes).toBeLessThan(RENDER.RAIL.redMinutes);
    // Amber has to arrive before §7.4 starts docking satisfaction, or the
    // warning lands after the damage.
    expect(RENDER.RAIL.amberMinutes).toBeLessThanOrEqual(REPUTATION.WAIT_GRACE_MINUTES);
  });
});

describe('STEP 10 — balking is still what makes speed worth money (§6.3)', () => {
  it('turns people away when the queue builds, and keeps them when it does not', () => {
    const quiet = runSeeds({ days: 7, arrivalsPerHour: 8 }, SEEDS);
    const slammed = runSeeds({ days: 7, arrivalsPerHour: 120 }, SEEDS);
    const quietRate = mean(quiet.map((r) => r.balked)) / mean(quiet.map((r) => r.arrived));
    const slammedRate = mean(slammed.map((r) => r.balked)) / mean(slammed.map((r) => r.arrived));
    expect(quietRate).toBeLessThan(0.05);
    expect(slammedRate).toBeGreaterThan(quietRate * 3);
  });

  it('moves the walkout stat before it moves the rating', () => {
    // §6.3: "balk rate is a headline HUD stat — it must move before reputation
    // does." Measured mid-service, not at the end of the day: the walkout
    // counter ticks the instant somebody turns around, while the rating is a
    // recency-weighted mean recomputed at close. There is a whole trading day
    // in which the HUD can warn you and the star rating cannot.
    //
    // Note what this does NOT claim. Over a full slammed day the rating moves
    // plenty — 3.80 to 2.03 at 120 arrivals an hour, because a day like that
    // generates hundreds of reviews and swamps the fifteen-review prior. The
    // ordering is what matters, not the size.
    const world = buildScenario({ seed: 29, arrivalsPerHour: 120 });
    const startStars = world.state.stars;

    let sawWalkoutBeforeRatingMoved = false;
    for (let i = 0; i < 6000; i++) {
      world.tick();
      if (world.state.balked > 0) {
        sawWalkoutBeforeRatingMoved = world.state.stars === startStars;
        break;
      }
    }
    expect(world.state.balked).toBeGreaterThan(0);
    expect(sawWalkoutBeforeRatingMoved).toBe(true);
  });
});
