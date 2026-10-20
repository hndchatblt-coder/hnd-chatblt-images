/** The game clock. Pure arithmetic on elapsed game seconds — no wall clock anywhere in the sim. */
import { dtGameSeconds, time } from "../config/time.js";

export interface Clock {
  /** Game seconds since the business opened on day 0. */
  elapsed: number;
}

export const createClock = (): Clock => ({ elapsed: 0 });

export const advance = (clock: Clock): void => {
  clock.elapsed += dtGameSeconds;
};

/** Whole days since start. */
export const dayIndex = (clock: Clock): number =>
  Math.floor(clock.elapsed / (time.hoursPerDay * time.secondsPerHour));

/** 0-6, Sunday first. Day 0 of the game is a Monday, because that is when you'd open. */
export const dayOfWeek = (clock: Clock): number => (dayIndex(clock) + 1) % time.daysPerWeek;

/** Fractional hour of day, 0-24. */
export const hourOfDay = (clock: Clock): number =>
  (clock.elapsed % (time.hoursPerDay * time.secondsPerHour)) / time.secondsPerHour;

export const isTrading = (clock: Clock): boolean => {
  const h = hourOfDay(clock);
  return h >= time.openHour && h < time.closeHour;
};

/** Formats as `D3 18:42` — stable, locale-free, safe to diff between runs. */
export const stamp = (clock: Clock): string => {
  const h = hourOfDay(clock);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `D${dayIndex(clock)} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
