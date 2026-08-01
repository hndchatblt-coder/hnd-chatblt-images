/**
 * The buffer between steps. DESIGN.md §7.3.
 *
 * Step 2 counts units. Step 4 replaces the count with dated lots so that
 * freshness, quality decay and waste on expiry become real — which is what
 * makes par-cooking ahead of a rush both the correct play and how you lose
 * money. The interface is deliberately narrow so that swap costs nothing.
 */
import type { ItemId } from '../types';

const NONE = 0;

export class Stock {
  private readonly counts = new Map<ItemId, number>();

  count(item: ItemId): number {
    return this.counts.get(item) ?? NONE;
  }

  add(item: ItemId, units: number): void {
    this.counts.set(item, this.count(item) + units);
  }

  /** Removes units if all are present. Returns false and changes nothing otherwise. */
  take(item: ItemId, units: number): boolean {
    const held = this.count(item);
    if (held < units) return false;
    this.counts.set(item, held - units);
    return true;
  }

  has(item: ItemId, units: number): boolean {
    return this.count(item) >= units;
  }

  /** Deterministic snapshot for reports and save files. Sorted by item id. */
  entries(): readonly [ItemId, number][] {
    return [...this.counts.entries()]
      .filter(([, n]) => n > NONE)
      .sort(([a], [b]) => String(a).localeCompare(String(b)));
  }
}
