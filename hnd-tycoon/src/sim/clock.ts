import { TIME, type TradingCalendar, type DayOfWeek, DAY_NAMES } from '@/config/time';

/** Game time, in whole simulation ticks since the start of the run. */
export type GameTime = number & { readonly __brand: 'GameTime' };

export const asGameTime = (ticks: number): GameTime => ticks as GameTime;

const TICKS_PER_GAME_SECOND = TIME.TICK_HZ * (1 / TIME.REAL_SECONDS_PER_GAME_HOUR) * 3600;
// = ticks per game hour / 3600. Derived, not hardcoded:
export const TICKS_PER_GAME_HOUR = TIME.TICK_HZ * TIME.REAL_SECONDS_PER_GAME_HOUR;

/**
 * The one clock. DESIGN.md §5.
 *
 * sim/ may never call Date.now() — the boundary check enforces it. Real time
 * only ever enters the simulation through the offline-accrual calculation,
 * which converts it to a capped number of trading days before it touches
 * anything. §5.2.
 */
export class Clock {
  private ticks = 0;

  constructor(private readonly calendar: TradingCalendar) {}

  get now(): GameTime {
    return asGameTime(this.ticks);
  }

  advance(n = 1): void {
    this.ticks += n;
  }

  get ticksPerCycle(): number {
    return TICKS_PER_GAME_HOUR * this.calendar.hoursPerCycle;
  }

  /** Whole days elapsed since start. */
  get dayIndex(): number {
    return Math.floor(this.ticks / this.ticksPerCycle);
  }

  get dayOfWeek(): DayOfWeek {
    return (this.dayIndex % this.calendar.daysPerWeek) as DayOfWeek;
  }

  get weekIndex(): number {
    return Math.floor(this.dayIndex / this.calendar.daysPerWeek);
  }

  /** Fractional hour within the current cycle, e.g. 13.5 = 1:30pm. */
  get hourOfDay(): number {
    return (this.ticks % this.ticksPerCycle) / TICKS_PER_GAME_HOUR;
  }

  get isOpen(): boolean {
    const openHours = this.calendar.hours[this.dayOfWeek];
    if (!openHours) return false;
    const h = this.hourOfDay;
    return h >= openHours.open && h < openHours.close;
  }

  /** True on the single tick that opens trade. */
  isOpeningTick(): boolean {
    const openHours = this.calendar.hours[this.dayOfWeek];
    if (!openHours) return false;
    return this.ticks % this.ticksPerCycle === Math.round(openHours.open * TICKS_PER_GAME_HOUR);
  }

  /** True on the single tick that closes trade. Drives the daily report. */
  isClosingTick(): boolean {
    const openHours = this.calendar.hours[this.dayOfWeek];
    if (!openHours) return false;
    return this.ticks % this.ticksPerCycle === Math.round(openHours.close * TICKS_PER_GAME_HOUR);
  }

  /** True on the single tick payroll lands. DESIGN.md §8. */
  isPayrollTick(): boolean {
    return (
      this.dayOfWeek === TIME.PAYROLL_DAY &&
      this.ticks % this.ticksPerCycle === Math.round(TIME.PAYROLL_HOUR * TICKS_PER_GAME_HOUR)
    );
  }

  /** Trading hours in the current day. Zero if closed. */
  get tradingHoursToday(): number {
    const openHours = this.calendar.hours[this.dayOfWeek];
    return openHours ? openHours.close - openHours.open : 0;
  }

  format(): string {
    const h = Math.floor(this.hourOfDay);
    const m = Math.floor((this.hourOfDay - h) * 60);
    const day = DAY_NAMES[this.dayOfWeek] ?? String(this.dayOfWeek);
    return `D${this.dayIndex} ${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  serialise(): number {
    return this.ticks;
  }

  restore(ticks: number): void {
    this.ticks = ticks;
  }
}

export { TICKS_PER_GAME_SECOND };
