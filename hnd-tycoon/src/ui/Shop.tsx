/**
 * Spending money. DESIGN.md §14.3, §21.2, §21.4.
 *
 * Every row states **what the thing costs you beyond the money** — §14.3 is
 * non-negotiable: each purchase trades a labour cost for at least two of
 * capital, floor space, utilities, flexibility and reliability. Showing those
 * on the card is what stops the shop being a list of upgrades, and it is the
 * player's only warning that a second grill eats two of the five tiles in the
 * building that have gas.
 *
 * Refusals are shown, not swallowed. "Nowhere to put it — fryer needs gas and
 * extraction, and every tile with that is taken" is the game teaching its own
 * constraint. §21.4: no dead taps, ever.
 */
import { useEffect, useState } from 'react';
import type { CatalogueItem, CostKind } from '@/config/catalogue';

export interface ShopRow {
  readonly item: CatalogueItem;
  readonly cents: number;
  readonly affordable: boolean;
  readonly owned: number;
}

const COST_LABEL: Record<CostKind, string> = {
  capital: 'cash',
  floorSpace: 'floor space',
  utilities: 'power',
  flexibility: 'flexibility',
  reliability: 'reliability',
};

export interface ShopProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly rows: () => ShopRow[];
  readonly onBuy: (itemId: string) => void;
}

export function Shop({ open, onClose, rows, onBuy }: ShopProps): JSX.Element | null {
  const [items, setItems] = useState<ShopRow[]>([]);

  useEffect(() => {
    if (!open) return;
    const refresh = (): void => setItems(rows());
    refresh();
    const id = setInterval(refresh, 150);
    return () => clearInterval(id);
  }, [open, rows]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>The shop</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Done
          </button>
        </div>

        <ul className="shop-list">
          {items.map(({ item, cents, affordable, owned }) => (
            <li key={item.id} className={affordable ? 'shop-row' : 'shop-row broke'}>
              <div className="shop-text">
                <div className="shop-title">
                  {item.label}
                  {owned > 0 && <span className="owned">{owned} already</span>}
                </div>
                <div className="shop-blurb">{item.blurb}</div>
                <div className="shop-costs">
                  costs you {item.costs.map((c) => COST_LABEL[c]).join(' + ')}
                </div>
              </div>
              <button
                type="button"
                className={affordable ? 'buy mono' : 'buy mono cant'}
                onClick={() => onBuy(item.id)}
              >
                {cents === 0 ? 'Hire' : `$${Math.round(cents / 100).toLocaleString('en-AU')}`}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
