/**
 * The bank, and the way back. DESIGN.md §10.
 *
 * This file is the one that has to make "the player can never lose" survive
 * contact with a player who has genuinely wrecked the place. Two halves:
 *
 * **The bank.** Cash goes negative, interest accrues daily, and the tone of the
 * message escalates. Nothing is ever seized and no action is ever blocked —
 * §10's "forced measures" arrive as an offer to sell equipment, which is
 * painful and reversible, not as a repossession.
 *
 * **The Recovery Plan.** Below 2.5 stars it opens with concrete objectives, and
 * meeting them accelerates repair — by telling you what to fix, not by putting
 * a thumb on the scale. There is no hidden multiplier here and there was very
 * nearly one; see the long note in `config/recovery.ts` for the measurement
 * that killed it.
 */
import { BANK, RECOVERY } from '@/config/recovery';
import { ECONOMY } from '@/config/economy';
import { REPORT } from '@/config/report';
import { meanWaitMinutes } from './service';
import { Cash, type Money } from '../types';
import type { SimState } from '../state';
import type { System, World } from '../world';

const NONE = 0;
const ONE = 1;

export interface RecoveryPlan {
  /** Game day it opened. */
  readonly openedOn: number;
  /** Consecutive days that have met every objective. */
  streak: number;
  /** Whether yesterday qualified. Drives the "keep it up" line in the HUD. */
  lastDayQualified: boolean;
}

/** Which bank tier a balance falls in. Null when the account is in the black. */
export function bankTier(cash: Money): (typeof BANK.TIERS)[number] | null {
  if (cash.cents >= NONE) return null;
  const under = -cash.cents;
  let found: (typeof BANK.TIERS)[number] | null = null;
  for (const tier of BANK.TIERS) {
    if (under >= tier.atLeastCents) found = tier;
  }
  return found;
}

/** Did this day meet every Recovery Plan objective? §10 */
export function dayQualifies(state: SimState): boolean {
  const wait = meanWaitMinutes(state.day.waitTicks, state.day.served);
  // A day with no covers at all cannot qualify. Closing the shop is not a
  // recovery strategy, and without this it is the fastest one available.
  if (state.day.served <= NONE) return false;
  if (wait > RECOVERY.OBJECTIVES.WAIT_MINUTES) return false;
  const produced = Math.max(ONE, state.day.unitsProduced);
  if (state.day.wasteUnits / produced > RECOVERY.OBJECTIVES.WASTE_FRACTION) return false;
  return true;
}

export class RecoverySystem implements System {
  readonly name = 'recovery';

  onDayEnd(world: World): void {
    const state = world.state;
    this.charge(state);
    this.plan(world);
  }

  /**
   * Daily interest on an overdrawn account. §10 step 1.
   *
   * Charged on the balance only — never compounded onto a fee, and never
   * allowed to become a number that grows faster than a shop can earn. A debt
   * that outruns the business is a fail state with extra steps.
   */
  private charge(state: SimState): void {
    if (state.ledger.cash.cents >= NONE) {
      state.bankTier = null;
      return;
    }
    const owed = -state.ledger.cash.cents;
    const daily = ECONOMY.OVERDRAFT_ANNUAL_RATE / BANK.DAYS_PER_YEAR;
    const interest = Math.round(owed * daily);
    if (interest > NONE) {
      state.ledger.post('interest', { cents: interest, currency: state.ledger.cash.currency });
    }
    state.bankTier = bankTier(state.ledger.cash)?.id ?? null;
  }

  private plan(world: World): void {
    const state = world.state;

    if (state.recovery === null) {
      if (state.stars < RECOVERY.TRIGGER_STARS) {
        state.recovery = {
          openedOn: world.clock.dayIndex,
          streak: NONE,
          lastDayQualified: false,
        };
      }
      return;
    }

    const qualified = dayQualifies(state);
    state.recovery.lastDayQualified = qualified;
    // A streak, not a tally: the objectives are about running a shop properly
    // for a week, and one good Tuesday in a bad fortnight is not that.
    state.recovery.streak = qualified ? state.recovery.streak + ONE : NONE;

    // Out the other side. Hysteresis at CLEAR_STARS, or the plan flickers on
    // and off every day the rating wobbles around 2.5.
    if (state.stars >= RECOVERY.CLEAR_STARS) state.recovery = null;
  }

  onClose(world: World): void {
    const state = world.state;
    if (state.recovery !== null) {
      world.record(
        'recovery',
        `day ${state.recovery.streak}/${RECOVERY.OBJECTIVES.DAYS}`,
      );
    }
    if (state.bankTier !== null) world.record('bank', state.bankTier);
  }
}

/**
 * The line the bank would say, or null when the account is in the black.
 * Exported for the HUD — §10's "emails with declining warmth" are the mechanic,
 * not decoration, because a tone is how the game tells you how much trouble you
 * are in without a screen that says you lost.
 */
export function bankMessage(state: SimState): string | null {
  const tier = bankTier(state.ledger.cash);
  if (!tier) return null;
  return tier.tone;
}

/**
 * What the Recovery Plan should say next. One objective at a time, always the
 * one being missed, so §15 "the player can always see the next objective" holds
 * without a checklist screen.
 */
export function recoveryLine(state: SimState): string | null {
  if (state.recovery === null) return null;
  const wait = meanWaitMinutes(state.day.waitTicks, state.day.served);
  const produced = Math.max(ONE, state.day.unitsProduced);
  const waste = state.day.wasteUnits / produced;

  if (state.day.served <= NONE) return 'Open up and serve someone. Nothing recovers while shut.';
  if (wait > RECOVERY.OBJECTIVES.WAIT_MINUTES) {
    return `Get the wait under ${RECOVERY.OBJECTIVES.WAIT_MINUTES} minutes — it is ${wait.toFixed(REPORT.MINUTE_DECIMALS)} today.`;
  }
  if (waste > RECOVERY.OBJECTIVES.WASTE_FRACTION) {
    return `Waste is ${(waste * 100).toFixed(REPORT.PERCENT_DECIMALS)}% — get it under ${RECOVERY.OBJECTIVES.WASTE_FRACTION * 100}%.`;
  }
  const left = RECOVERY.OBJECTIVES.DAYS - state.recovery.streak;
  if (left > NONE) return `${left} more day${left === ONE ? '' : 's'} like today and word gets around.`;
  return 'Word is getting around. Keep it exactly like this.';
}

/**
 * What the shop gets back for something it sells. §10 tier 4's forced measure
 * is an OFFER to sell equipment, and this is its price — sixty cents in the
 * dollar, which is what makes it painful, and reversible only in the sense that
 * you can buy another one later at full price.
 */
export function resaleValue(purchase: Money): Money {
  return Cash.scale(purchase, ECONOMY.RESALE_FRACTION);
}
