import { TIME, type TradingCalendar, type DayOfWeek, DAY_NAMES } from '@/config/time';
import { gameTime, type GameTime } from './types';

export type { GameTime };
export const asGameTime = gameTime;

export const TICKS_PER_GAME_HOUR = TIME.TICK_HZ * TIME.REAL_SECONDS_PER_GAME_HOUR;

/**
 * How many GAME seconds one tick advances. 12 at the shipped rates.
 *
 * This is the number every duration in the simulation is charged against, so
 * it being right matters more than anything else in this file. Ten ticks per
 * REAL second, thirty real seconds per game hour — three hundred ticks an hour,
 * therefore twelve game seconds a tick. Recipe durations are in game seconds.
 */
export const GAME_SECONDS_PER_TICK = TIME.SECONDS_PER_HOUR / TICKS_PER_GAME_HOUR;

/** Ticks per game second. The reciprocal, kept for readability at call sites. */
export const TICKS_PER_GAME_SECOND = 1 / GAME_SECONDS_PER_TICK;

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

  get daysPerWeek(): number {
    return this.calendar.daysPerWeek;
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

  /** How many hours of trade have elapsed today. Zero before opening. */
  get hoursOpenToday(): number {
    const openHours = this.calendar.hours[this.dayOfWeek];
    if (!openHours) return 0;
    return Math.max(0, Math.min(this.hourOfDay, openHours.close) - openHours.open);
  }

  /** Trading hours in the current day. Zero if closed. */
  get tradingHoursToday(): number {
    const openHours = this.calendar.hours[this.dayOfWeek];
    return openHours ? openHours.close - openHours.open : 0;
  }

  format(): string {
    const h = Math.floor(this.hourOfDay);
    const m = Math.floor((this.hourOfDay - h) * TIME.MINUTES_PER_HOUR);
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
