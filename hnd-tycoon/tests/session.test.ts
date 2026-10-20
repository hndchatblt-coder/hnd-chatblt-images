import { describe, it, expect } from 'vitest';
import { offlineGrant, activeGameHours, DEFAULT_SESSION_PATTERN } from '@/harness/session';
import { TIME } from '@/config/time';

describe('offline caps (§5.2) — the rule that stops a night of sleep skipping the game', () => {
  it('a 40-minute gap and a four-day gap grant the same thing', () => {
    expect(offlineGrant(0.67, 0).tradingDays).toBe(offlineGrant(96, 0).tradingDays);
  });

  it('grants at most one trading day per gap', () => {
    expect(offlineGrant(9, 0).tradingDays).toBe(1);
  });

  it('grants at most two trading days per rolling real day', () => {
    expect(offlineGrant(9, 2).tradingDays).toBe(0);
    expect(offlineGrant(9, 1).tradingDays).toBe(1);
  });

  it('runs at 75% efficiency — being present is better, never mandatory', () => {
    expect(offlineGrant(9, 0).efficiency).toBe(0.75);
    expect(offlineGrant(9, 0).efficiency).toBeLessThan(1);
    expect(offlineGrant(9, 0).efficiency).toBeGreaterThan(0);
  });

  it('reports what it capped, so the UI can show the player the arithmetic', () => {
    const g = offlineGrant(16, 2);
    expect(g.cappedFrom).toBeGreaterThan(g.tradingDays);
  });

  it('a zero-length gap grants nothing', () => {
    expect(offlineGrant(0, 0).tradingDays).toBe(0);
  });
});

describe('session pacing', () => {
  it('one real minute buys two game hours at 1x', () => {
    expect(activeGameHours(1)).toBe(2);
  });

  it('an 8-minute session covers most of a trading day', () => {
    // Trading day is 11 game hours; 8 real minutes at 1x buys 16.
    expect(activeGameHours(8)).toBeGreaterThan(11);
  });

  it('three sessions plus offline advances ~6-7 game days per real day', () => {
    const active = DEFAULT_SESSION_PATTERN.reduce(
      (sum, s) => sum + activeGameHours(s.activeMinutes) / 11,
      0,
    );
    const offline = TIME.OFFLINE_MAX_TRADING_DAYS_PER_REAL_DAY * TIME.OFFLINE_EFFICIENCY;
    const total = active + offline;
    expect(total).toBeGreaterThan(5.5);
    expect(total).toBeLessThan(8);
  });
});
