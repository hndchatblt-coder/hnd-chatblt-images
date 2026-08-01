/**
 * The buffer between steps, and the clock running on everything in it.
 * DESIGN.md §7.3.
 *
 *   quality = 1                          if age <= window
 *           = 1 - (age - window) / decay if beyond
 *
 * Below 0.35 the item is binned. That single rule is what makes the production
 * game a game: **par-cooking ahead of a rush is the correct play and also how
 * you lose money.** A buffer of four patties is a fast Friday or it is four
 * patties in the bin, and which one it turns out to be is not knowable when
 * you decide.
 *
 * Stock is held as dated lots, not a count. FIFO on the way out — oldest
 * first, the way a real kitchen rotates — so par-cooked stock is consumed
 * before fresh stock and the buffer does not quietly accumulate a stale layer
 * that never gets used and always gets binned.
 */
import { KITCHEN } from '@/config/kitchen';
import type { ItemId } from '../types';

const NONE = 0;
const ONE = 1;

export interface Lot {
  readonly item: ItemId;
  units: number;
  /** Game seconds since the run began, when this lot finished. */
  readonly producedAt: number;
  /** Seconds before quality starts to fall. Undefined = never stales. */
  readonly freshnessWindow: number | undefined;
}

/** §7.3, exactly as written. */
export function qualityOf(ageSeconds: number, freshnessWindow: number | undefined): number {
  if (freshnessWindow === undefined) return ONE;
  if (ageSeconds <= freshnessWindow) return ONE;
  return ONE - (ageSeconds - freshnessWindow) / KITCHEN.QUALITY_DECAY_SECONDS;
}

export class Stock {
  /** Lots per item, oldest first. */
  private readonly lots = new Map<ItemId, Lot[]>();

  count(item: ItemId): number {
    let total = NONE;
    for (const lot of this.lots.get(item) ?? []) total += lot.units;
    return total;
  }

  add(item: ItemId, units: number, producedAt: number, freshnessWindow?: number): void {
    const list = this.lots.get(item) ?? [];
    list.push({ item, units, producedAt, freshnessWindow });
    this.lots.set(item, list);
  }

  /**
   * Removes units oldest-first if all are present, and reports the mean
   * quality of what was taken. Returns null and changes nothing otherwise —
   * a partial take would leave the kitchen holding half an order.
   */
  take(item: ItemId, units: number, now: number): { quality: number } | null {
    if (this.count(item) < units) return null;
    const list = this.lots.get(item) ?? [];
    let remaining = units;
    let qualitySum = NONE;

    while (remaining > NONE && list.length > NONE) {
      const lot = list[NONE] as Lot;
      const drawn = Math.min(remaining, lot.units);
      qualitySum += qualityOf(now - lot.producedAt, lot.freshnessWindow) * drawn;
      lot.units -= drawn;
      remaining -= drawn;
      if (lot.units <= NONE) list.shift();
    }

    if (list.length === NONE) this.lots.delete(item);
    return { quality: units > NONE ? qualitySum / units : ONE };
  }

  has(item: ItemId, units: number): boolean {
    return this.count(item) >= units;
  }

  /**
   * Bins everything past saving. Returns what was lost, per item, so the day
   * report can name it — "eleven patties" is a fact a player can act on,
   * "waste 3.2%" is a number they scroll past.
   */
  binExpired(now: number): Map<ItemId, number> {
    const binned = new Map<ItemId, number>();
    for (const [item, list] of this.lots) {
      const kept: Lot[] = [];
      for (const lot of list) {
        if (qualityOf(now - lot.producedAt, lot.freshnessWindow) < KITCHEN.WASTE_QUALITY_FLOOR) {
          binned.set(item, (binned.get(item) ?? NONE) + lot.units);
        } else {
          kept.push(lot);
        }
      }
      if (kept.length === NONE) this.lots.delete(item);
      else this.lots.set(item, kept);
    }
    return binned;
  }

  /** Mean quality of what is currently held, for the day report. */
  meanQuality(item: ItemId, now: number): number {
    const list = this.lots.get(item) ?? [];
    let units = NONE;
    let sum = NONE;
    for (const lot of list) {
      sum += qualityOf(now - lot.producedAt, lot.freshnessWindow) * lot.units;
      units += lot.units;
    }
    return units > NONE ? sum / units : ONE;
  }

  /** Deterministic snapshot for reports and save files. Sorted by item id. */
  entries(): readonly [ItemId, number][] {
    return [...this.lots.keys()]
      .map((item) => [item, this.count(item)] as [ItemId, number])
      .filter(([, n]) => n > NONE)
      .sort(([a], [b]) => String(a).localeCompare(String(b)));
  }
}
