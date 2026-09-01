import { describe, it, expect } from 'vitest';
import { SITES } from '@/config/sites';

describe('site definitions', () => {
  it('Leichhardt has the column you cannot remove (§12)', () => {
    expect(SITES.leichhardt?.obstructions).toContainEqual({ x: 4, y: 7 });
  });

  it('every site is portrait — deeper than wide, or square', () => {
    for (const s of Object.values(SITES)) {
      expect(s.depth, s.name).toBeGreaterThanOrEqual(s.width);
    }
  });

  it('service points sit inside the floorplan', () => {
    for (const s of Object.values(SITES)) {
      for (const [service, points] of Object.entries(s.servicePoints)) {
        for (const p of points) {
          expect(p.x, `${s.name} ${service}`).toBeLessThan(s.width);
          expect(p.y, `${s.name} ${service}`).toBeLessThan(s.depth);
        }
      }
    }
  });

  it('service points are not on obstructed tiles', () => {
    for (const s of Object.values(SITES)) {
      const blocked = new Set(s.obstructions.map((o) => `${o.x},${o.y}`));
      for (const points of Object.values(s.servicePoints)) {
        for (const p of points) expect(blocked.has(`${p.x},${p.y}`)).toBe(false);
      }
    }
  });

  it('entry is on the street edge — customers flow up the screen', () => {
    for (const s of Object.values(SITES)) {
      expect(s.entryTile.y, s.name).toBe(0);
    }
  });

  it('each site is a genuinely different puzzle, not a re-skin', () => {
    const shapes = Object.values(SITES).map((s) => `${s.width}x${s.depth}`);
    expect(new Set(shapes).size).toBe(shapes.length);
    const rents = Object.values(SITES).map((s) => s.weeklyRent.cents);
    expect(new Set(rents).size).toBe(rents.length);
  });
});
