import { describe, it, expect } from 'vitest';
import { Rng } from '@/sim/rng';
import { World } from '@/sim/world';
import { buildScenario } from '@/sim/scenario';

describe('determinism — this is a gate, not a nicety', () => {
  it('same seed produces the same sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 500 }, () => a.next());
    const seqB = Array.from({ length: 500 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    const a = new Rng(42);
    const b = new Rng(43);
    expect(a.next()).not.toEqual(b.next());
  });

  it('named streams are independent and stable', () => {
    const root = new Rng(42);
    const arrivals1 = root.fork('arrivals');
    const arrivals2 = new Rng(42).fork('arrivals');
    const incidents = new Rng(42).fork('incidents');
    expect(arrivals1.next()).toEqual(arrivals2.next());
    expect(new Rng(42).fork('arrivals').next()).not.toEqual(incidents.next());
  });

  it('serialise/deserialise round-trips exactly', () => {
    const a = new Rng('leichhardt');
    for (let i = 0; i < 17; i++) a.next();
    const b = Rng.deserialise(a.serialise());
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(
      Array.from({ length: 20 }, () => b.next()),
    );
  });

  it('two bare worlds with the same seed report identically', () => {
    const run = () => {
      const w = new World({ seed: 42 });
      w.runDays(7);
      return JSON.stringify(w.dayReports);
    };
    expect(run()).toEqual(run());
  });

  it('two FULL simulations with the same seed agree down to the stock count', () => {
    // The bare-world check above passes with no systems registered, so it says
    // nothing about the simulation. This one runs arrivals, kitchen and
    // service and compares everything they touched.
    const run = (seed: number) => {
      const w = buildScenario({ seed });
      w.runDays(7);
      return JSON.stringify({
        reports: w.dayReports,
        counters: w.state.counters,
        stock: w.state.stock.entries(),
        open: w.state.openOrders.length,
        served: [...w.state.orders.values()].filter((o) => o.state === 'served').length,
      });
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it('poisson is bursty but bounded', () => {
    const r = new Rng(7);
    const samples = Array.from({ length: 2000 }, () => r.poisson(1.5));
    const mean = samples.reduce((s, n) => s + n, 0) / samples.length;
    expect(mean).toBeGreaterThan(1.3);
    expect(mean).toBeLessThan(1.7);
    expect(Math.max(...samples)).toBeGreaterThan(3); // bursts happen
  });
});
