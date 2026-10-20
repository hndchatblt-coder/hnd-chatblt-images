import { describe, it, expect } from 'vitest';
import { Clock, TICKS_PER_GAME_HOUR } from '@/sim/clock';
import { CALENDARS } from '@/config/time';
import { World } from '@/sim/world';

const cal = CALENDARS.sydneyStandard!;

describe('clock', () => {
  it('a trading day is 11 game hours', () => {
    const c = new Clock(cal);
    expect(c.tradingHoursToday).toBe(11);
  });

  it('opens at 11:00 and closes at 22:00', () => {
    const c = new Clock(cal);
    c.advance(Math.round(10.5 * TICKS_PER_GAME_HOUR));
    expect(c.isOpen).toBe(false);
    c.advance(Math.round(1 * TICKS_PER_GAME_HOUR));
    expect(c.isOpen).toBe(true);
    c.advance(Math.round(11 * TICKS_PER_GAME_HOUR));
    expect(c.isOpen).toBe(false);
  });

  it('advances one day per cycle', () => {
    const c = new Clock(cal);
    expect(c.dayIndex).toBe(0);
    c.advance(c.ticksPerCycle);
    expect(c.dayIndex).toBe(1);
    expect(c.dayOfWeek).toBe(1);
  });

  it('payroll lands once a week, Sunday 23:00', () => {
    const c = new Clock(cal);
    let hits = 0;
    for (let i = 0; i < c.ticksPerCycle * 14; i++) {
      if (c.isPayrollTick()) hits++;
      c.advance();
    }
    expect(hits).toBe(2);
  });

  it('emits exactly one open and one close per trading day', () => {
    const c = new Clock(cal);
    let opens = 0;
    let closes = 0;
    for (let i = 0; i < c.ticksPerCycle * 7; i++) {
      if (c.isOpeningTick()) opens++;
      if (c.isClosingTick()) closes++;
      c.advance();
    }
    expect(opens).toBe(7);
    expect(closes).toBe(7);
  });
});

describe('world', () => {
  it('produces one report per trading day', () => {
    const w = new World({ seed: 1 });
    w.runDays(7);
    expect(w.dayReports.length).toBe(7);
  });

  it('calls system hooks in order', () => {
    const seen: string[] = [];
    const w = new World({ seed: 1 });
    w.register({
      name: 'probe',
      onOpen: () => seen.push('open'),
      onClose: () => seen.push('close'),
      onPayroll: () => seen.push('payroll'),
    });
    w.runDays(8);
    expect(seen.filter((s) => s === 'open').length).toBe(8);
    // Day 0 is Sunday, so days 0..7 spans two payrolls.
    expect(seen.filter((s) => s === 'payroll').length).toBe(2);
    expect(seen[0]).toBe('open');
  });
});
