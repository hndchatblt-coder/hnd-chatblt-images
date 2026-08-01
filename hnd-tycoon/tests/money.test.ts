import { describe, it, expect } from 'vitest';
import { Cash, money, cents, ZERO } from '@/sim/types';

describe('Money — the P&L must reconcile to the cent (step 6 gate)', () => {
  it('stores minor units as integers', () => {
    expect(money(16.5).cents).toBe(1650);
    expect(money(0.1).cents).toBe(10);
  });

  it('does not accumulate float error over a long run', () => {
    // The classic 0.1 + 0.2 problem, which would quietly break the P&L gate.
    let total = ZERO();
    for (let i = 0; i < 10_000; i++) total = Cash.add(total, money(0.1));
    expect(total.cents).toBe(100_000);
    expect(Cash.major(total)).toBe(1000);
  });

  it('refuses to mix currencies', () => {
    expect(() => Cash.add(money(1, 'AUD'), money(1, 'USD'))).toThrow(/mismatch/i);
  });

  it('computes ratios for COGS% and labour%', () => {
    const cogs = money(340);
    const revenue = money(1000);
    expect(Cash.ratio(cogs, revenue)).toBeCloseTo(0.34, 5);
  });

  it('handles negative cash — overdraft is legal', () => {
    const broke = Cash.sub(money(100), money(250));
    expect(Cash.isNegative(broke)).toBe(true);
    expect(Cash.format(broke)).toBe('AUD -150.00');
  });

  it('sums a list', () => {
    expect(Cash.sum([money(1.5), money(2.25), cents(25)]).cents).toBe(400);
  });
});
