/**
 * The HUD. DESIGN.md §22.5, §21.4.
 *
 *   top bar        cash, clock, trading state
 *   bottleneck     one line, always visible, always quantified. §13
 *   the venue      the canvas
 *   bottom bar     covers, waiting, speed, and the shop
 *
 * §13 calls the bottleneck line the main UI thread through all five acts, and
 * it is the thing that turns watching into playing: without it an idle game
 * with no guidance is a screensaver.
 *
 * It polls at 4 Hz rather than subscribing. A React tree reconciling on every
 * 10 Hz sim tick would cost more than the simulation it is describing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameCanvas } from './GameCanvas';
import { Shop } from './Shop';
import { Money } from './Money';
import type { Game } from '@/render/Game';

const HUD_HZ = 4;

interface Readout {
  clock: string;
  cashCents: number;
  covers: number;
  waiting: number;
  open: boolean;
  bottleneck: string;
  bottleneckKind: string;
}

const EMPTY: Readout = {
  clock: '—',
  cashCents: 0,
  covers: 0,
  waiting: 0,
  open: false,
  bottleneck: 'Opening up',
  bottleneckKind: 'demand',
};

export function App(): JSX.Element {
  const game = useRef<Game | null>(null);
  const [speed, setSpeed] = useState(1);
  const [shopOpen, setShopOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>(EMPTY);

  useEffect(() => {
    const id = setInterval(() => {
      const g = game.current;
      if (!g) return;
      const state = g.world.state;
      setReadout({
        clock: g.world.clock.format(),
        cashCents: state.ledger.cash.cents,
        covers: state.day.served,
        waiting: [...state.customers.values()].filter((c) => c.state === 'waiting').length,
        open: g.world.clock.isOpen,
        bottleneck: state.bottleneck?.line ?? 'Nothing is holding you back',
        bottleneckKind: state.bottleneck?.kind ?? 'demand',
      });
    }, 1000 / HUD_HZ);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const changeSpeed = useCallback((next: number): void => {
    setSpeed(next);
    game.current?.setSpeed(next);
  }, []);

  const purchase = useCallback((itemId: string): void => {
    const result = game.current?.buy(itemId);
    // Every tap gets an answer, including the ones that fail. §21.4 — no dead
    // taps, ever, and a refusal that says why is a design, not an error.
    if (result?.reason) setToast(result.reason);
  }, []);

  return (
    <div className="frame">
      <header className="topbar">
        <span className="site">LEICHHARDT</span>
        <Money cents={readout.cashCents} />
        <span className={readout.open ? 'trading' : 'closed'}>
          {readout.open ? readout.clock.slice(-5) : 'CLOSED'}
        </span>
      </header>

      <div className={`bottleneck kind-${readout.bottleneckKind}`}>{readout.bottleneck}</div>

      <GameCanvas
        seed={42}
        onReady={(g) => {
          game.current = g;
          g.setSpeed(speed);
        }}
      />

      {toast && <div className="toast">{toast}</div>}

      <footer className="bottombar">
        <div className="stats">
          <div className="stat">
            <span className="label">COVERS</span>
            <span className="value mono">{readout.covers}</span>
          </div>
          <div className="stat">
            <span className="label">WAITING</span>
            <span className="value mono">{readout.waiting}</span>
          </div>
          <div className="speeds">
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                type="button"
                className={s === speed ? 'speed on' : 'speed'}
                onClick={() => changeSpeed(s)}
              >
                {s}&times;
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="shop-open" onClick={() => setShopOpen(true)}>
          Spend some money
        </button>
      </footer>

      <Shop
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        rows={() => game.current?.shopfront() ?? []}
        onBuy={purchase}
      />
    </div>
  );
}
