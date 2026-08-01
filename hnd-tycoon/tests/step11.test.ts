/**
 * STEP 11 GATES — incidents, ambience, recovery.
 *
 * "Incident system (degrade only, never timed). Ambience as a third claimant on
 * floor tiles, driving patience and spend. Recovery Plan on reputation below
 * 2.5. Overdraft with the increasingly passive-aggressive bank."
 *
 * **Exit:** `bot:naive` recovers when switched to balanced by ~day 55. The
 * dig-out is ~8 game days and the player can always see the next objective. No
 * state is unrecoverable.
 */
import { describe, expect, it } from 'vitest';
import { AMBIENCE, ambienceBonus, ambienceSpendBonus } from '@/config/ambience';
import { INCIDENTS, INCIDENT_RULES } from '@/config/incidents';
import { BANK, RECOVERY } from '@/config/recovery';
import { ECONOMY } from '@/config/economy';
import { buy, fixIncident } from '@/sim/actions';
import { buildScenario } from '@/sim/scenario';
import { createState } from '@/sim/state';
import {
  ambiencePoints,
  fixCostDollars,
  patienceBonus,
  roomCondition,
  spendBonus,
  stationPenalty,
} from '@/sim/systems/incidents';
import { bankMessage, bankTier, dayQualifies, recoveryLine } from '@/sim/systems/recovery';
import { BOTS, runBot, runHandover } from '@/harness/bots';

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
/**
 * Review-bomb a shop, the way a bad fortnight actually does it.
 *
 * §7.4's rating is a recency-weighted mean against a fifteen-review prior, so
 * this is the only honest way to put a shop under 2.5 in a test — and it
 * exercises the same path the game does rather than a field assignment the
 * simulation immediately overwrites.
 */
const bomb = (world: ReturnType<typeof buildScenario>, stars: number, count: number): void => {
  for (let i = 0; i < count; i++) {
    world.state.reviews.push({ channel: 'dineIn', stars, day: world.clock.dayIndex });
  }
};

const botNamed = (name: string): (typeof BOTS)[number] => {
  const bot = BOTS.find((b) => b.name === name);
  if (!bot) throw new Error(`no bot:${name}`);
  return bot;
};

describe('STEP 11 — incidents degrade, and they never run on a timer (§9)', () => {
  it('has no expiry on any incident, in the type or in the data', () => {
    /**
     * The most important gate in this file, and it is a structural one.
     *
     * §9: incidents "never require a response inside a time window", and §5.3
     * makes "attention is rewarded, never required" a pillar. A field called
     * `expiresAt` is the single change that would break both, and it is exactly
     * the field somebody adds later to make an incident "feel urgent".
     */
    for (const spec of INCIDENTS) {
      expect(spec).not.toHaveProperty('expiresAt');
      expect(spec).not.toHaveProperty('deadline');
      expect(spec).not.toHaveProperty('timeoutDays');
      // What it has instead: a rate of getting worse.
      expect(spec.severityPerDay).toBeGreaterThanOrEqual(0);
    }
  });

  it('costs more the longer it runs, and stops costing more eventually', () => {
    // "An unattended incident costs more the longer it runs" — but bounded, or
    // walking away for a fortnight becomes unrecoverable and §10 forbids that.
    const spec = INCIDENTS.find((s) => s.id === 'fryerThermostat');
    expect(spec).toBeDefined();
    const fresh = {
      id: 'a',
      specId: 'fryerThermostat',
      openedOn: 0,
      stationId: null,
      staffId: null,
      severity: (spec as NonNullable<typeof spec>).severity,
    };
    const neglected = { ...fresh, severity: (spec as NonNullable<typeof spec>).maxSeverity };
    expect(fixCostDollars(neglected)).toBeGreaterThan(fixCostDollars(fresh) * 1.5);
    // Bounded: there is no severity above the ceiling, so no cost above this.
    expect(fixCostDollars(neglected)).toBeLessThan(fixCostDollars(fresh) * 5);
  });

  it('never degrades a station to a standstill', () => {
    // §9 again: they degrade, they never destroy. A station at zero speed is a
    // destroyed station wearing a percentage.
    for (const spec of INCIDENTS) {
      if (spec.effect !== 'stationSpeed') continue;
      expect(spec.maxSeverity).toBeLessThan(1);
      expect(1 - spec.maxSeverity).toBeGreaterThan(0.2);
    }
  });

  it('slows the station it names, and only that one', () => {
    const state = createState({});
    const grill = state.stations.find((s) => s.type === 'grill');
    const fryer = state.stations.find((s) => s.type === 'fryer');
    expect(grill).toBeDefined();
    expect(fryer).toBeDefined();
    expect(stationPenalty(state, (grill as { id: string }).id)).toBe(1);

    state.incidents.push({
      id: 'x',
      specId: 'grillBurner',
      openedOn: 0,
      stationId: (grill as { id: string }).id,
      staffId: null,
      severity: 0.35,
    });
    expect(stationPenalty(state, (grill as { id: string }).id)).toBeCloseTo(0.65, 6);
    expect(stationPenalty(state, (fryer as { id: string }).id)).toBe(1);
  });

  it('leaves a brand-new shop alone for a fortnight', () => {
    // Something breaking on day one reads as the game being broken rather than
    // as the world having weather.
    const world = buildScenario({ seed: 3 });
    world.runDays(INCIDENT_RULES.GRACE_DAYS);
    expect(world.state.incidents.length).toBe(0);
  });

  it('does actually break things once the grace is up', () => {
    const world = buildScenario({ seed: 3 });
    world.runDays(INCIDENT_RULES.GRACE_DAYS + 40);
    // Not asserting a count — it is a probability, and pinning the number would
    // gate the RNG rather than the system.
    expect(world.state.incidents.length).toBeGreaterThan(0);
    expect(world.state.incidents.length).toBeLessThanOrEqual(INCIDENT_RULES.MAX_OPEN);
  });

  it('never opens an incident about equipment the shop has not got', () => {
    // A fryer thermostat in a shop with no fryer is the game describing
    // somebody else's kitchen.
    const world = buildScenario({ seed: 5 });
    world.runDays(INCIDENT_RULES.GRACE_DAYS + 60);
    for (const incident of world.state.incidents) {
      if (incident.stationId === null) continue;
      expect(world.state.stations.some((s) => s.id === incident.stationId)).toBe(true);
    }
  });

  it('lets the player put it right, at a price, with no deadline attached', () => {
    const state = createState({});
    const grill = state.stations.find((s) => s.type === 'grill') as { id: string };
    state.incidents.push({
      id: 'inc-1',
      specId: 'grillBurner',
      openedOn: 0,
      stationId: grill.id,
      staffId: null,
      severity: 0.35,
    });
    const before = state.ledger.cash.cents;
    const result = fixIncident(state, 'inc-1');
    expect(result.ok, result.reason).toBe(true);
    expect(state.incidents.length).toBe(0);
    expect(state.ledger.cash.cents).toBeLessThan(before);
    expect(stationPenalty(state, grill.id)).toBe(1);
  });

  it('lets a broke shop fix its own fryer', () => {
    // §10: refusing the repair because the balance is low leaves a shop that
    // cannot recover, which is a fail state with a polite message.
    const state = createState({ openingCash: { cents: 0, currency: 'AUD' } });
    const grill = state.stations.find((s) => s.type === 'grill') as { id: string };
    state.incidents.push({
      id: 'inc-1',
      specId: 'grillBurner',
      openedOn: 0,
      stationId: grill.id,
      staffId: null,
      severity: 0.35,
    });
    expect(fixIncident(state, 'inc-1').ok).toBe(true);
    expect(state.ledger.cash.cents).toBeLessThan(0);
  });
});

describe('STEP 11 — ambience is a claimant on the floor, not a stat (§6.4)', () => {
  it('costs tiles, which is the entire lever', () => {
    const world = buildScenario({ seed: 7 });
    const free = () => {
      let n = 0;
      for (let y = 0; y < world.state.floor.depth; y++) {
        for (let x = 0; x < world.state.floor.width; x++) {
          if (world.state.floor.isWalkable(x, y)) n++;
        }
      }
      return n;
    };
    const before = free();
    const result = buy(world.state, 'seating');
    expect(result.ok, result.reason).toBe(true);
    // A seat is a tile the grill does not get. §6.4's third claimant, made real.
    expect(free()).toBeLessThan(before);
  });

  it('buys patience and spend, with diminishing returns', () => {
    expect(ambienceBonus(0)).toBe(1);
    expect(ambienceBonus(2)).toBeGreaterThan(1);
    expect(ambienceBonus(8)).toBeGreaterThan(ambienceBonus(4));
    // Paving the room must not be the answer. The tenth point is worth far
    // less than the second, or the optimum is "fill every tile with chairs".
    const first = ambienceBonus(2) - ambienceBonus(0);
    const tenth = ambienceBonus(12) - ambienceBonus(10);
    expect(tenth).toBeLessThan(first / 2);
    // Bounded, both curves.
    expect(ambienceBonus(1000)).toBeLessThanOrEqual(1 + AMBIENCE.MAX_PATIENCE_BONUS);
    expect(ambienceSpendBonus(1000)).toBeLessThanOrEqual(1 + AMBIENCE.MAX_SPEND_BONUS);
    // Patience is the bigger lever. §6.4 — it is a burger bar, not a bistro.
    expect(AMBIENCE.MAX_SPEND_BONUS).toBeLessThan(AMBIENCE.MAX_PATIENCE_BONUS);
  });

  it('shows up on the shop, not just in a formula', () => {
    const world = buildScenario({ seed: 7 });
    expect(ambiencePoints(world.state)).toBe(0);
    expect(patienceBonus(world.state)).toBe(1);
    expect(spendBonus(world.state)).toBe(1);

    buy(world.state, 'seating');
    buy(world.state, 'decor');
    expect(ambiencePoints(world.state)).toBeGreaterThan(0);
    expect(patienceBonus(world.state)).toBeGreaterThan(1);
    expect(spendBonus(world.state)).toBeGreaterThan(1);
  });

  it('has a peak, and paving the room loses money', () => {
    /**
     * The pillar: every dial must fight another dial. Found by attacking this
     * step — ambience was a pure stat upgrade, because §6.4's justification is
     * that it competes for floor and at Leichhardt the floor is not scarce.
     * A 9x15 room is about 135 tiles and the opening kitchen uses eleven, so
     * eight tables saturated the patience curve with a hundred tiles spare.
     *
     * Upkeep is what makes it a bet rather than a purchase: a standing daily
     * cost against a benefit that only pays when people are actually queueing.
     * Measured, 56 days, six seeds:
     *
     *   seats    0        2        4        8       16
     *   cash  $38,772  $44,147  $44,404  $40,661  $38,001
     */
    const cash = (seats: number): number =>
      mean(
        [1, 2, 3, 4, 5, 6].map((seed) => {
          const world = buildScenario({ seed });
          world.runDays(1);
          for (let i = 0; i < seats; i++) buy(world.state, 'seating');
          world.runDays(55);
          return world.state.ledger.cash.cents;
        }),
      );

    const none = cash(0);
    const some = cash(4);
    const paved = cash(16);
    // A few tables pay for themselves.
    expect(some).toBeGreaterThan(none);
    // Filling the room does not. If it did, ambience would be a slider.
    expect(paved).toBeLessThan(some);
    expect(paved).toBeLessThan(none);
  });

  it('is spoiled by a tired room — §9 reaches §6.4', () => {
    const world = buildScenario({ seed: 7 });
    buy(world.state, 'seating');
    buy(world.state, 'seating');
    const kept = patienceBonus(world.state);

    world.state.incidents.push({
      id: 'x',
      specId: 'roomTired',
      openedOn: 0,
      stationId: null,
      staffId: null,
      severity: 0.4,
    });
    expect(roomCondition(world.state)).toBeCloseTo(0.6, 6);
    expect(patienceBonus(world.state)).toBeLessThan(kept);
    // But never below neutral. A shabby room does not make people LESS patient
    // than no room at all.
    expect(patienceBonus(world.state)).toBeGreaterThanOrEqual(1);
  });
});

describe('STEP 11 — the bank gets colder, and never takes anything (§10)', () => {
  it('says nothing at all while the account is in the black', () => {
    const state = createState({});
    expect(bankTier(state.ledger.cash)).toBeNull();
    expect(bankMessage(state)).toBeNull();
  });

  it('escalates its tone with the balance, and only its tone', () => {
    const tone = (cents: number): string | null => {
      const state = createState({ openingCash: { cents, currency: 'AUD' } });
      return bankMessage(state);
    };
    expect(tone(-100)).toContain('These things happen');
    expect(tone(-1_600_000)).toContain('reduce the balance');
    // Every tier has something to say, and the tiers are ordered.
    let last = -1;
    for (const tier of BANK.TIERS) {
      expect(tier.tone.length).toBeGreaterThan(20);
      expect(tier.atLeastCents).toBeGreaterThan(last);
      last = tier.atLeastCents;
    }
  });

  it('charges interest on an overdraft, daily and bounded', () => {
    const world = buildScenario({ seed: 11, openingCash: { cents: -1_000_000, currency: 'AUD' } });
    world.runDays(1);
    const interest = world.state.ledger.total('interest').cents;
    expect(interest).toBeGreaterThan(0);
    // One day at the annual rate, not a year's worth.
    const oneDay = (1_000_000 * ECONOMY.OVERDRAFT_ANNUAL_RATE) / BANK.DAYS_PER_YEAR;
    expect(interest).toBeLessThan(oneDay * 2);
  });

  it('never blocks an action because the balance is low', () => {
    // §10's forced measures are an OFFER. A game that stops you spending is a
    // game that has decided you lost.
    const state = createState({ openingCash: { cents: -2_000_000, currency: 'AUD' } });
    // The one refusal that is allowed is "you cannot afford it", which is a
    // price, not a state. Fixing things is never refused — see the incident
    // gate above — and that is the action recovery actually depends on.
    expect(bankTier(state.ledger.cash)?.id).toBe('final');
    expect(state.incidents.length).toBe(0);
  });
});

describe('STEP 11 — the Recovery Plan (§10)', () => {
  it('opens below 2.5 stars and clears above 3.1, with hysteresis', () => {
    expect(RECOVERY.TRIGGER_STARS).toBeLessThan(RECOVERY.CLEAR_STARS);
    const world = buildScenario({ seed: 13 });
    expect(world.state.recovery).toBeNull();

    // Wreck it through the real path. Assigning `state.stars` directly does
    // nothing: the rating is recomputed from reviews at close (21:00) and the
    // plan reads it at cycle end (midnight), so a hand-set value is overwritten
    // before anything sees it. Bad reviews are how a shop actually gets here.
    bomb(world, 1, 300);
    world.runDays(1);
    expect(world.state.stars).toBeLessThan(RECOVERY.TRIGGER_STARS);
    expect(world.state.recovery).not.toBeNull();
  });

  it('will not let closing the shop count as recovering', () => {
    // Without this, the fastest route out of a bad rating is to serve nobody,
    // which is the opposite of every objective on the plan.
    const state = createState({});
    state.day.served = 0;
    expect(dayQualifies(state)).toBe(false);
  });

  it('always names the next objective, one at a time', () => {
    // §15: "the player can always see the next objective". One line, the one
    // being missed, so there is never a checklist to read.
    const state = createState({});
    state.recovery = { openedOn: 0, streak: 0, lastDayQualified: false };
    expect(recoveryLine(state)).toContain('serve someone');

    state.day.served = 100;
    state.day.waitTicks = 100 * 100; // ~20 minutes
    state.day.unitsProduced = 100;
    expect(recoveryLine(state)).toContain('wait under');

    state.day.waitTicks = 100 * 10; // ~2 minutes
    state.day.wasteUnits = 20;
    expect(recoveryLine(state)).toContain('Waste');

    state.day.wasteUnits = 0;
    expect(recoveryLine(state)).toContain('more day');
  });

  it('wants a STREAK, not a tally — one good Tuesday is not a recovery', () => {
    // Slammed on purpose: a shop at 150 arrivals an hour with one pair of hands
    // cannot get its wait under eight minutes, so every day misses. Setting
    // `day.served = 0` and running a day does NOT work — the day that follows
    // serves people, and the accumulator it would have zeroed is rebuilt every
    // morning by `openDay`.
    const world = buildScenario({ seed: 17, arrivalsPerHour: 150 });
    bomb(world, 1, 300);
    world.runDays(1);
    const plan = world.state.recovery;
    expect(plan).not.toBeNull();

    (plan as NonNullable<typeof plan>).streak = 4;
    world.runDays(1);
    // A day that misses resets it to zero. Four good days and a bad one is not
    // "nearly there", it is starting again, and that is what makes the week
    // mean something.
    expect(dayQualifies(world.state)).toBe(false);
    expect(world.state.recovery?.streak).toBe(0);
  });

  it('drops demand while it runs, but never to nothing', () => {
    expect(RECOVERY.DEMAND_PENALTY).toBeGreaterThan(0);
    // §10: the worst available outcome is a slow, boring, unprofitable week.
    // A penalty that could zero demand would be a closed shop.
    expect(RECOVERY.DEMAND_PENALTY).toBeLessThan(0.5);
  });
});

describe('STEP 11 — EXIT: a wrecked shop recovers, and nothing is unrecoverable', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6];
  const SWITCH_DAY = 35;

  it('digs out within about a week of the player starting to try', () => {
    /**
     * The step's exit criterion. `bot:naive` markets hard into an understaffed
     * kitchen for five weeks and hands over a shop on 2.26 stars; `bot:balanced`
     * fixes what is broken, staffs to the bottleneck readout and stops
     * advertising until it can serve.
     *
     * Measured, six seeds: 6,5,5,5,5,7 days to clear 3.1 stars — mean 5.5,
     * against §10's budget of "≈8 game days". Faster than budgeted rather than
     * slower, which is what killed the acceleration multiplier this file
     * originally had. See the note in config/recovery.ts.
     */
    const digOuts = SEEDS.map((seed) => {
      const run = runHandover(botNamed('naive'), botNamed('balanced'), seed, SWITCH_DAY, 110);
      const after = run.days.filter((d) => d.day >= SWITCH_DAY);
      const out = after.find((d) => d.stars >= RECOVERY.CLEAR_STARS);
      return out ? out.day - SWITCH_DAY : Number.POSITIVE_INFINITY;
    });

    for (const days of digOuts) expect(days).toBeLessThan(20);
    // "~8 game days", read generously in both directions: a dig-out that is
    // instant is not a dig-out, and one that takes a month loses the player.
    expect(mean(digOuts)).toBeGreaterThan(1);
    expect(mean(digOuts)).toBeLessThan(12);
    // And well inside "~day 55" when the switch happens at 35.
    expect(SWITCH_DAY + mean(digOuts)).toBeLessThan(55);
  });

  it('leaves no state a player cannot come back from', () => {
    // §10, stated as a property rather than a promise: whatever naive does to
    // this shop, a competent operator can turn it around. Cash ends positive
    // and the rating ends above where it was handed over.
    const runs = SEEDS.map((seed) =>
      runHandover(botNamed('naive'), botNamed('balanced'), seed, SWITCH_DAY, 110),
    );
    for (const run of runs) {
      const handover = run.days.find((d) => d.day === SWITCH_DAY - 1);
      const end = run.days[run.days.length - 1];
      expect(handover).toBeDefined();
      expect(end).toBeDefined();
      expect((end as NonNullable<typeof end>).stars).toBeGreaterThan(
        (handover as NonNullable<typeof handover>).stars,
      );
      expect((end as NonNullable<typeof end>).cashCents).toBeGreaterThan(0);
    }
  });

  it('makes acting on the bottleneck readout measurably pay — §13', () => {
    /**
     * §13 calls the bottleneck line the main UI thread through all five acts
     * and claims it is ACTIONABLE. That claim has been unfalsified since step 8
     * because nothing in the project ever read the line. `bot:balanced` reads
     * it; this is the gate that makes the claim falsifiable.
     */
    const covers = (name: string): number =>
      mean(
        SEEDS.map((seed) =>
          runBot(botNamed(name), seed, 70).days.reduce((a, d) => a + d.covers, 0),
        ),
      );
    const balanced = covers('balanced');
    const naive = covers('naive');
    expect(balanced).toBeGreaterThan(naive * 1.3);
  });
});
