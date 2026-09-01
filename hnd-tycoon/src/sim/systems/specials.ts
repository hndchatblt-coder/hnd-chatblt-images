/**
 * Weekly specials. DESIGN.md §18.
 *
 * *"Three-sided decision every Monday: what draws people, what your kitchen can
 * produce at volume, what you can prep without eating the waste."*
 *
 * The whole step turns on one property, which is also its exit criterion:
 * **both under-prepping and over-prepping must cost, and 86'ing must be worse
 * than never running it at all.** That third clause is the hard one, because
 * the obvious implementation — a flat reputation penalty for running out —
 * would satisfy the test while being a lie about why it hurts.
 *
 * So it falls out of the mechanism instead. The uplift brings extra arrivals;
 * `SEEKER_FRACTION` of them came FOR the thing. If the thing is gone they do
 * not shrug and order a burger, they leave, and they leave loudly
 * (`EIGHTY_SIX_LOUDNESS` x the special's own `eightySixPenalty`). A shop that
 * never ran the special never drew them and never disappointed them. Running it
 * badly is therefore strictly worse than not running it — not because a
 * constant says so, but because you advertised something and then did not have
 * it, which is what §18 actually describes.
 *
 * **Prep costs real station time.** §18's *"shared stations — a fryer-heavy
 * special in a chips-heavy week is a self-inflicted bottleneck"* is fiction
 * unless the prep competes with service, so it is charged to the host station's
 * `runSeconds` on the day before. That is the same counter the utilities bill
 * and §13's bottleneck readout both read, so prepping sixty wings genuinely
 * shows up as the fryer being the constraint on Tuesday.
 *
 * §26: nothing here knows it is one venue. `state.special` is per-site state in
 * everything but name and the day-of-week arithmetic goes through the clock.
 */
import {
  SPECIALS,
  SPECIAL_BY_ID,
  SPECIAL_RULES,
  type Special,
} from '@/config/specials';
import { TIME } from '@/config/time';
import type { Money } from '../types';
import type { SimState } from '../state';
import type { System, World } from '../world';

const NONE = 0;
const ONE = 1;
const CENTS = 100;

/** Dollars to `Money`. The config talks in dollars; the ledger only cents. */
const dollars = (amount: number): Money => ({
  cents: Math.round(amount * CENTS),
  currency: 'AUD',
});

/** The pool the shop can choose from today. §18's "unlocking pool". */
export function availableSpecials(state: SimState): readonly Special[] {
  return SPECIALS.filter((s) => state.rungs.length >= s.unlockedAfterRungs);
}

/** Is this the special's day, and is the shop inside its window? */
export function inWindow(special: Special, dayOfWeek: number, hour: number): boolean {
  if (special.day !== dayOfWeek) return false;
  return !special.dinnerOnly || hour >= SPECIAL_RULES.DINNER_FROM_HOUR;
}

/** The day before the named day. When prep has to happen, and what it costs. */
export function prepDay(special: Special, daysPerWeek: number): number {
  return (special.day - SPECIAL_RULES.PREP_WINDOW_DAYS + daysPerWeek) % daysPerWeek;
}

/**
 * What over-prepping actually costs, in dollars.
 *
 * An exclusive ingredient has no second life — that IS §18's *"ingredient
 * exposure"*, and it is the only thing separating a cheap mistake from an
 * expensive one. A surplus of something the ordinary menu also uses partly
 * comes back.
 */
export function surplusCost(special: Special, surplus: number): number {
  const recovered = special.exclusiveIngredient === null
    ? SPECIAL_RULES.SHARED_SURPLUS_RECOVERY
    : NONE;
  return surplus * special.unitCost * (ONE - recovered);
}

/**
 * How many the shop can actually serve today. §18's under-prep failure.
 *
 * There is deliberately no "it did not open" state. The first draft had one —
 * below half the promise the special was withdrawn and the uplift never
 * applied — and it inverted the whole mechanic: **announcing a special you
 * cannot deliver became free.** Measured, under-prepping to 15 of 60 cost
 * $331 across nine weeks, all of it stock, and turned nobody away at all.
 *
 * The crowd is drawn by the SIGN, not by the stock. §18: *"you drew the crowd
 * and disappointed them."* You drew them on Monday when you put Wing Wednesday
 * on the board. Whether there are wings left when they arrive is a separate
 * question, and it is the one the player is being asked.
 */
export function servableToday(state: SimState): number {
  return state.special.prepped;
}

export class SpecialsSystem implements System {
  readonly name = 'specials';

  /**
   * Monday locks the week's choice. §18: *"Each Monday the player picks a
   * special. It runs the week."*
   *
   * A pick made on any other day queues for the next Monday — the same shape as
   * §8.2's price change landing tomorrow. The delay IS the design: choosing a
   * special mid-rush to catch a rush would be conjuring demand out of nothing.
   */
  onOpen(world: World): void {
    const state = world.state;
    const special = state.special;

    if (world.clock.dayOfWeek === SPECIAL_RULES.SELECTION_DAY) {
      // Anything left from LAST week is binned before the new one starts. A
      // special is a week's promise; last week's brisket is not this week's.
      //
      // Guarded on the outgoing special rather than the incoming one, because
      // a special whose own named day is the selection day would otherwise be
      // binned at open and charged to `unitsProduced` twice. Nothing in the
      // pool runs on a Monday today, which is exactly why this is the sort of
      // thing that ships broken the first time somebody adds one.
      this.bin(world, special.running);
      special.running = special.pending;
      special.pending = null;
      special.prepped = NONE;
      special.sold = NONE;
      special.turnedAway = NONE;
      special.promoted = special.pendingPromo;
      world.record('special', special.running ?? SPECIAL_RULES.NONE);
      // §8: the promotion is paid on the Monday it starts, whether or not the
      // shop turns out to be able to serve what it just advertised.
      if (special.promoted && special.running !== null) {
        state.ledger.post('marketing', dollars(SPECIAL_RULES.PROMO_WEEKLY_COST));
      }
    }

    const spec = special.running === null ? null : SPECIAL_BY_ID[special.running];
    if (!spec) return;

    // Prep happens on the day before, and it costs the host station real time.
    if (world.clock.dayOfWeek === prepDay(spec, world.clock.daysPerWeek)) {
      this.prep(world, spec);
    }

  }

  /**
   * Charge the prep to the station and to the ledger.
   *
   * The player's `prepTarget` is honoured, not the spec's number — that is the
   * decision. Asking for more than the station can physically do in a day is
   * itself a way to under-prep, which is the nastiest version of §18's trap and
   * the reason the cap is the station's own hours rather than an arbitrary max.
   */
  private prep(world: World, spec: Special): void {
    const state = world.state;
    const wanted = Math.max(NONE, state.special.prepTarget);
    if (wanted === NONE) return;

    const host = state.stations.find((s) => s.type === spec.station);
    if (!host) return;

    // A station has the trading day and no more. Whatever prep takes, service
    // does not get — which is exactly §18's shared-station bottleneck.
    const secondsAvailable = world.clock.tradingHoursToday * TIME.SECONDS_PER_HOUR;
    const secondsWanted = wanted * SPECIAL_RULES.PREP_SECONDS_PER_UNIT;
    const secondsSpent = Math.min(secondsWanted, secondsAvailable - host.runSeconds);
    const done = Math.max(NONE, Math.floor(secondsSpent / SPECIAL_RULES.PREP_SECONDS_PER_UNIT));

    host.runSeconds += done * SPECIAL_RULES.PREP_SECONDS_PER_UNIT;
    state.special.prepped += done;
    state.special.preppedCost += done * spec.unitCost;

    // Stock is bought when it is prepped, not when it sells. That is what makes
    // over-prep a cash decision rather than an accounting one.
    if (done > NONE) {
      state.ledger.post('cogs', dollars(done * spec.unitCost));
    }
    world.record('specialPrepped', String(done));
  }

  /**
   * The uplift, applied only inside the special's own window. §18: *"Wing
   * Wednesday spikes Wednesday dinner, not the whole week."*
   *
   * Written every tick rather than latched, because the window opens and closes
   * inside a trading day and a latched value would leave the shop advertising a
   * special at eleven in the morning.
   */
  tick(world: World): void {
    const state = world.state;
    const spec = state.special.running === null ? null : SPECIAL_BY_ID[state.special.running];
    if (!spec) {
      state.specialUplift = NONE;
      return;
    }
    // The promise, not the pantry. The sign is up all week and the uplift runs
    // whenever the window is open, whether or not there is anything behind the
    // counter — that is what makes running out cost more than never promising.
    const promo = state.special.promoted ? SPECIAL_RULES.PROMO_UPLIFT : ONE;
    state.specialUplift = inWindow(spec, world.clock.dayOfWeek, world.clock.hourOfDay)
      ? spec.uplift * state.special.credibility * promo
      : NONE;
  }

  /**
   * The day the special ran, totted up. §18.
   *
   * The selling and the 86'ing already happened, one customer at a time, as
   * people walked through the door — see `ArrivalsSystem.turnedAwaySeeker`.
   * This used to reconstruct both here from the day's totals, and the
   * reconstruction was wrong twice over: it counted a whole day of arrivals for
   * a spike that only ran at dinner, and it never let the disappointed through
   * the door at all, so running out cost goodwill but no throughput.
   *
   * What is left for close is the part that genuinely is a verdict on the day:
   * what the broken promise did to the shop's credibility, and what the surplus
   * costs to bin.
   */
  onClose(world: World): void {
    const state = world.state;
    const spec = state.special.running === null ? null : SPECIAL_BY_ID[state.special.running];
    if (!spec || world.clock.dayOfWeek !== spec.day) return;

    const turnedAway = state.special.turnedAway;
    const seekers = state.special.sold + turnedAway;
    world.record('specialSold', String(state.special.sold));
    world.record('specialSeekers', String(seekers));

    // §18's real cost, and the one that compounds. A promise you broke stops
    // working: next week's sign draws a smaller crowd, because the people who
    // came for nothing told their mates. Scaled by how badly you missed, so
    // running twenty short of a hundred is a scratch and opening with nothing
    // is a scar.
    if (turnedAway > NONE) {
      const missed = seekers > NONE ? turnedAway / seekers : ONE;
      state.special.credibility = Math.max(
        SPECIAL_RULES.CREDIBILITY_FLOOR,
        state.special.credibility * (ONE - missed * SPECIAL_RULES.CREDIBILITY_HIT),
      );
      world.record('specialEightySixed', String(turnedAway));
      world.record('credibility', state.special.credibility.toFixed(2));
    } else if (seekers > NONE) {
      // A week you delivered buys some of it back. Slowly — §10 says nothing is
      // unrecoverable, not that anything is quickly recovered.
      state.special.credibility +=
        (ONE - state.special.credibility) * SPECIAL_RULES.CREDIBILITY_RECOVERY;
    }

    // Whatever is left after the named day is dead stock. Binned at close, so
    // over-prep costs on the day the player can still see why.
    this.bin(world, state.special.running);
  }

  /** Write off the surplus, and count it as waste so §15.2's headline sees it. */
  private bin(world: World, specialId: string | null): void {
    const state = world.state;
    const spec = specialId === null ? null : SPECIAL_BY_ID[specialId];
    if (!spec) return;
    const surplus = state.special.prepped - state.special.sold;
    if (surplus <= NONE) return;

    const lost = surplusCost(spec, surplus);
    state.day.wasteUnits += surplus;
    state.day.unitsProduced += state.special.prepped;
    if (lost > NONE) world.record('specialWasted', String(surplus));

    state.special.prepped = NONE;
    state.special.sold = NONE;
    state.special.preppedCost = NONE;
  }
}
