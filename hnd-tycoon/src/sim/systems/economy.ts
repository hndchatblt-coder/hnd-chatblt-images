/**
 * Where the money goes. DESIGN.md §8.
 *
 * Revenue lands when an order is handed over, not when it is placed — a
 * customer who walks out mid-cook has cost you the ingredients and paid you
 * nothing, and that asymmetry is what makes a queue expensive.
 *
 * COGS is charged when ingredients are *consumed*, so a binned patty is
 * already paid for. Waste is therefore not a separate cost, it is a cost you
 * incurred and got nothing for, which is why it is posted to its own account
 * and shown on its own line.
 *
 * Wages accrue only while trading. Billing twenty-four hours a day is an easy
 * mistake and it quietly removes the entire staffing decision: if a staffer
 * costs the same idle as busy, hiring is free at the margin.
 */
import { ECONOMY, hourlyCost, INGREDIENTS, JURISDICTIONS, STATION_UTILITY } from '@/config/economy';
import type { Step } from '@/config/recipes';
import { TIME } from '@/config/time';
import { GAME_SECONDS_PER_TICK } from '../clock';
import { Cash, money, ZERO, type Money } from '../types';
import type { SimState } from '../state';
import type { System, World } from '../world';
import { AMBIENCE } from '@/config/ambience';
import { ambiencePoints } from './incidents';
import { MACHINE_BY_ID } from '@/config/machines';

const NONE = 0;

/**
 * What one unit of a step's output costs in raw ingredients, at the current
 * tier. Per STEP, not per recipe: a binned patty should cost mince, not the
 * price of a whole cheeseburger.
 */
export function stepCost(step: Step, tier: keyof typeof ECONOMY.INGREDIENT_TIERS): Money {
  let total = ZERO();
  for (const [ingredient, quantity] of Object.entries(step.consumes ?? {})) {
    const unit = INGREDIENTS[ingredient];
    if (unit) total = Cash.add(total, Cash.scale(unit, quantity));
  }
  return Cash.scale(total, ECONOMY.INGREDIENT_TIERS[tier].costMultiplier);
}

export class EconomySystem implements System {
  readonly name = 'economy';

  onOpen(world: World): void {
    world.state.ledger.startDay();
  }

  tick(world: World): void {
    const state = world.state;
    if (!world.clock.isOpen) return;

    // Wages accrue by the second, while trading. §8.
    const jurisdiction = JURISDICTIONS[state.site.jurisdictionId] ?? JURISDICTIONS['nsw'];
    if (jurisdiction) {
      const rate = hourlyCost(jurisdiction, world.clock.dayOfWeek);
      const perTick = Cash.scale(
        rate,
        GAME_SECONDS_PER_TICK / TIME.SECONDS_PER_HOUR,
      );
      // Only the people who are actually on today. A staffer with Monday off
      // costs nothing on Monday — that is the whole point of a roster, and it
      // is what turns labour from a fixed cost into a decision.
      state.accruedWages = Cash.add(state.accruedWages, Cash.scale(perTick, state.onToday));
    }
  }

  onClose(world: World): void {
    const state = world.state;
    const ledger = state.ledger;

    // Utilities, on what the equipment actually ran. A dead Monday costs less
    // to power than a slammed Saturday, and automation is *worse* than staff
    // on a dead Monday precisely because it draws whether busy or not.
    for (const station of state.stations) {
      const hours = station.runSeconds / TIME.SECONDS_PER_HOUR;
      const kind = STATION_UTILITY[station.type] ?? 'electric';
      ledger.post('utilities', Cash.scale(ECONOMY.UTILITIES_PER_RUN_HOUR[kind], hours));
    }

    // The bank, if you are under. §8 — cash can go negative.
    if (Cash.isNegative(ledger.cash)) {
      const daily = ECONOMY.OVERDRAFT_ANNUAL_RATE / ECONOMY.DAYS_PER_YEAR;
      ledger.post('interest', Cash.scale(money(-Cash.major(ledger.cash)), daily));
    }

    world.record('cash', Cash.major(ledger.cash).toFixed(0));
    world.record('revenue', Cash.major(ledger.today('revenue')).toFixed(0));
    world.record('cogs%', percent(ledger.today('cogs'), ledger.today('revenue')));
    world.record('waste%', percent(ledger.today('waste'), ledger.today('revenue')));
  }

  /**
   * Standing costs arrive whether you trade or not — that is what makes them
   * standing costs. Posting them at close meant a shut Sunday refunded a
   * seventh of the lease, which handed the "is Sunday worth opening" question
   * $1,459 of phantom savings per four weeks.
   */
  onDayEnd(world: World): void {
    const ledger = world.state.ledger;
    const perDay = (weekly: Money): Money => Cash.scale(weekly, 1 / world.clock.daysPerWeek);
    ledger.post('rent', perDay(world.state.site.weeklyRent));
    ledger.post('overheads', perDay(ECONOMY.INSURANCE_PER_WEEK));
    ledger.post('overheads', perDay(ECONOMY.POS_PER_WEEK));

    // §6.4. A room costs money to keep, every day, whether anyone sat in it or
    // not. Without this, ambience at Leichhardt is a pure stat upgrade — the
    // floor it is supposed to compete for is not scarce in a 9x15 room. See the
    // long note on UPKEEP_PER_POINT_PER_DAY.
    /**
     * §14.3: machines draw *"continuous draw whether busy or not, so automation
     * is WORSE than staff on a dead Monday."*
     *
     * Charged on TRADING HOURS, not run-hours, and that distinction is the
     * whole cost. A staffer you did not roster costs nothing on a quiet
     * Tuesday; a clamshell holding temperature costs the same on a quiet
     * Tuesday as on a slammed Saturday. It is the single line item that stops
     * `bot:roboboss` dominating.
     */
    let draw = 0;
    for (const station of world.state.stations) {
      for (const machineId of station.machines) {
        draw += MACHINE_BY_ID[machineId]?.utilitiesPerHour ?? 0;
      }
    }
    if (draw > 0) {
      ledger.post(
        'utilities',
        money(draw * world.state.site.tradingHoursPerDay, ledger.cash.currency),
      );
    }

    const points = ambiencePoints(world.state);
    if (points > 0) {
      ledger.post(
        'overheads',
        money(points * AMBIENCE.UPKEEP_PER_POINT_PER_DAY, ledger.cash.currency),
      );
    }
  }

  /** §8: wages are paid Sunday 23:00 as a lump. */
  onPayroll(world: World): void {
    const state = world.state;
    // §14.4's preventive maintenance, on the same Sunday bill as everything
    // else. Skippable, and skipping is a real move in a cash crunch.
    if (state.maintaining) {
      let weekly = 0;
      for (const station of state.stations) {
        for (const machineId of station.machines) {
          weekly += MACHINE_BY_ID[machineId]?.maintenancePerWeek ?? 0;
        }
      }
      if (weekly > 0) {
        state.ledger.post('overheads', money(weekly, state.ledger.cash.currency));
      }
    }
    state.ledger.post('wages', state.accruedWages);
    state.lastPayroll = state.accruedWages;
    state.accruedWages = ZERO();
  }
}

function percent(part: Money, whole: Money): string {
  if (whole.cents === NONE) return '—';
  return `${((part.cents / whole.cents) * 100).toFixed(1)}%`;
}

/**
 * Charged the moment a batch starts, because that is when the mince leaves the
 * cool room. Returns the per-unit cost so it can travel with the food.
 */
export function chargeIngredients(state: SimState, step: Step, units: number): Money {
  const unit = stepCost(step, state.ingredientTier);
  if (unit.cents > NONE) state.ledger.post('cogs', Cash.scale(unit, units));
  return unit;
}
