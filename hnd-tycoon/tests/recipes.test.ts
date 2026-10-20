import { describe, it, expect } from 'vitest';
import { RECIPES, LAUNCH_MENU } from '@/config/recipes';

describe('recipe DAGs', () => {
  it('launch menu is two items plus drinks (§7)', () => {
    expect(LAUNCH_MENU).toHaveLength(2);
  });

  it('every step dependency resolves to a real step', () => {
    for (const recipe of Object.values(RECIPES)) {
      const ids = new Set(recipe.steps.map((s) => s.id));
      for (const step of recipe.steps) {
        for (const dep of step.dependsOn) {
          expect(ids.has(dep), `${recipe.id}.${step.id} depends on missing ${dep}`).toBe(true);
        }
      }
    }
  });

  it('has no dependency cycles', () => {
    for (const recipe of Object.values(RECIPES)) {
      const byId = new Map(recipe.steps.map((s) => [s.id, s]));
      const state = new Map<string, 'visiting' | 'done'>();
      const visit = (sid: string): void => {
        if (state.get(sid) === 'done') return;
        if (state.get(sid) === 'visiting') throw new Error(`cycle at ${recipe.id}.${sid}`);
        state.set(sid, 'visiting');
        for (const d of byId.get(sid)?.dependsOn ?? []) visit(d);
        state.set(sid, 'done');
      };
      expect(() => recipe.steps.forEach((s) => visit(s.id))).not.toThrow();
    }
  });

  it('attention never exceeds elapsed duration (§14.1)', () => {
    // Automation buys back attention, not time. If attention >= duration
    // there is nothing to buy back and the whole ladder is meaningless.
    for (const recipe of Object.values(RECIPES)) {
      for (const s of recipe.steps) {
        const a = s.attention;
        const total = a.setupSeconds + a.tendSeconds + a.teardownSeconds;
        expect(total, `${recipe.id}.${s.id}`).toBeLessThanOrEqual(s.duration);
      }
    }
  });

  it('the grill patty leaves meaningful attention to automate', () => {
    const patty = RECIPES.cheeseburger?.steps.find((s) => s.id === 'patty');
    expect(patty).toBeDefined();
    const a = patty!.attention;
    // Spec: 90s cooking, ~22s attention.
    expect(a.setupSeconds + a.tendSeconds + a.teardownSeconds).toBeLessThan(30);
    // The flip is what a clamshell removes — it must be non-trivial.
    expect(a.tendSeconds).toBeGreaterThan(5);
  });

  it('batch sizes create the batching-vs-freshness tension', () => {
    const patty = RECIPES.cheeseburger?.steps.find((s) => s.id === 'patty');
    expect(patty?.batchSize).toBeGreaterThan(1);
    expect(patty?.freshnessWindow).toBeGreaterThan(0);
  });
});
