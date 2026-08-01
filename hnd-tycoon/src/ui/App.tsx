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
import { Roster } from './Roster';
import { Money } from './Money';
import { Stars } from './Stars';
import { Trade } from './Trade';
import type { Game } from '@/render/Game';

const HUD_HZ = 4;

interface Readout {
  clock: string;
  cashCents: number;
  covers: number;
  waiting: number;
  balked: number;
  stars: number;
  open: boolean;
  bottleneck: string;
  bottleneckKind: string;
}

const EMPTY: Readout = {
  clock: '—',
  cashCents: 0,
  covers: 0,
  waiting: 0,
  balked: 0,
  stars: 0,
  open: false,
  bottleneck: 'Opening up',
  bottleneckKind: 'demand',
};

export function App(): JSX.Element {
  const game = useRef<Game | null>(null);
  const [speed, setSpeed] = useState(1);
  const [shopOpen, setShopOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [readout, setReadout] = useState<Readout>(EMPTY);

  useEffect(() => {
    const id = setInterval(() => {
      const g = game.current;
      if (!g) return;
      const state = g.world.state;
      setReadout({
        clock: g.world.clock.format().replace(/^D(\d+)\s/, 'D$1 · '),
        cashCents: state.ledger.cash.cents,
        covers: state.day.served,
        waiting: [...state.customers.values()].filter((c) => c.state === 'waiting').length,
        balked: state.day.balked,
        stars: g.stars(),
        open: g.world.clock.isOpen,
        bottleneck: state.bottleneck?.line ?? 'Nothing is holding you back',
        bottleneckKind: state.bottleneck?.kind ?? 'demand',
      });
      setBooted(true);
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
        {/* Nothing until the first poll: the cash readout used to spend three
            seconds racing up from $0, which is a lie about your bank balance. */}
        {booted ? <Money cents={readout.cashCents} /> : <span className="cash mono">&nbsp;</span>}
        <span className={readout.open ? 'trading' : 'closed'}>{readout.clock}</span>
      </header>

      {booted && <Stars value={readout.stars} />}

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
          <div className="stat">
            {/* §6.3: "Balk rate is a headline HUD stat — it must move before
                reputation does." */}
            <span className="label">WALKED</span>
            <span className={readout.balked > 0 ? 'value mono bad' : 'value mono'}>
              {readout.balked}
            </span>
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
        <div className="actions">
          <button type="button" className="shop-open" onClick={() => setShopOpen(true)}>
            Spend some money
          </button>
          <button type="button" className="roster-open" onClick={() => setRosterOpen(true)}>
            Who&rsquo;s on
          </button>
          <button type="button" className="trade-open" onClick={() => setTradeOpen(true)}>
            Prices
          </button>
        </div>
      </footer>

      <Roster
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        game={() => game.current}
        onMessage={setToast}
      />

      <Trade
        open={tradeOpen}
        onClose={() => setTradeOpen(false)}
        game={() => game.current}
        onMessage={setToast}
      />

      <Shop
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        rows={() => game.current?.shopfront() ?? []}
        onBuy={purchase}
      />
    </div>
  );
}
