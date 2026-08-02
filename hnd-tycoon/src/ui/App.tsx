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
import { TroublePanel } from './Trouble';
import type { Game } from '@/render/Game';

const HUD_HZ = 4;
const TOAST_MS = 2600;
const UNLOCK_MS = 5200;

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
  faults: number;
  bank: string | null;
  recovery: string | null;
  /** §15.2 — the day's verdict, one line, above the P&L. */
  headline: string;
  /** §15.1 — "two rungs always in the HUD; the rest browsable." */
  rungs: { label: string; unlocks: string }[];
  banked: string;
  panels: { roster: boolean; trade: boolean; parLevels: boolean };
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
  faults: 0,
  bank: null,
  recovery: null,
  headline: '',
  rungs: [],
  banked: '0/0',
  panels: { roster: false, trade: false, parLevels: false },
};

export function App(): JSX.Element {
  const game = useRef<Game | null>(null);
  const [speed, setSpeed] = useState(1);
  const [shopOpen, setShopOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [troubleOpen, setTroubleOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [landed, setLanded] = useState<{ label: string; unlocks: string } | null>(null);
  const [booted, setBooted] = useState(false);
  const [readout, setReadout] = useState<Readout>(EMPTY);

  useEffect(() => {
    const id = setInterval(() => {
      const g = game.current;
      if (!g) return;
      const state = g.world.state;
      // Consumed, not read — see Game.takeLadder(). Must run every poll or a
      // rung landing between polls is lost.
      const ladder = g.takeLadder();
      if (ladder.unlockedNow) setLanded(ladder.unlockedNow);
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
        faults: state.incidents.length,
        headline: ladder.headline,
        rungs: ladder.rungs,
        banked: ladder.banked,
        panels: ladder.panels,
        ...g.trouble(),
      });
      setBooted(true);
    }, 1000 / HUD_HZ);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  // A rung is a door opening, so it stays up long enough to read what is now
  // behind it — twice a toast, which is the difference between a notification
  // and a moment.
  useEffect(() => {
    if (!landed) return;
    const id = setTimeout(() => setLanded(null), UNLOCK_MS);
    return () => clearTimeout(id);
  }, [landed]);

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
        {booted ? (
          <span className={readout.cashCents < 0 ? 'overdrawn' : undefined}>
            <Money cents={readout.cashCents} />
          </span>
        ) : (
          <span className="cash mono">&nbsp;</span>
        )}
        <span className={readout.open ? 'trading' : 'closed'}>{readout.clock}</span>
      </header>

      {booted && <Stars value={readout.stars} />}

      {/* §15: one line, always visible, always the most useful thing to be
          told right now. The Recovery Plan outranks the bottleneck readout when
          it is open — a shop under 2.5 stars has a more urgent question than
          "what is my constraint", and §10 says the objective must be visible. */}
      <div
        className={
          readout.recovery
            ? 'bottleneck kind-recovery'
            : `bottleneck kind-${readout.bottleneckKind}`
        }
      >
        {readout.recovery ?? readout.bottleneck}
      </div>

      {/* §15.2: the day's verdict sits with the figures it is about, so it is
          pinned to the bottom bar rather than floating over the room. It only
          exists once a day has actually closed. */}
      <GameCanvas
        seed={42}
        onReady={(g) => {
          game.current = g;
          g.setSpeed(speed);
        }}
      />

      {toast && <div className="toast">{toast}</div>}

      {/* §15.1: a rung is the only thing in this game that opens a door, so it
          gets a beat of its own and says what is now behind it. */}
      {landed && (
        <div className="unlock" role="status">
          <span className="unlock-label">{landed.label}</span>
          <span className="unlock-what">{landed.unlocks}</span>
        </div>
      )}

      <footer className="bottombar">
        {readout.headline && <div className="headline">{readout.headline}</div>}

        {/* §15.1: "two rungs always in the HUD; the rest browsable." Always
            visible, because §15's whole claim is that the player can always see
            the next objective without going looking for it. */}
        {readout.rungs.length > 0 && (
          <ol className="rungs">
            {readout.rungs.map((r, i) => (
              <li key={r.label} className={i === 0 ? 'now' : 'then'}>
                <span className="rung-label">{r.label}</span>
                {/* Only the NEXT one names its door. Both did until the phone
                    was actually looked at: four lines of small type under the
                    room, and the room is the game. §15.1 asks for two rungs
                    VISIBLE, not two rungs explained. */}
                {i === 0 && <span className="rung-what">{r.unlocks}</span>}
              </li>
            ))}
          </ol>
        )}

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
          {/* Earned, not hidden-then-revealed. `setRoster` and `setPrice` refuse
              in the SIM until the rung lands (see `panelGate`), so the button
              being absent is the consequence and not the mechanism. */}
          {readout.panels.roster && (
            <button type="button" className="roster-open" onClick={() => setRosterOpen(true)}>
              Who&rsquo;s on
            </button>
          )}
          {readout.panels.trade && (
            <button type="button" className="trade-open" onClick={() => setTradeOpen(true)}>
              Prices
            </button>
          )}
          {/* Only there when there IS something wrong. A permanently visible
              "problems" button on a shop with no problems trains the player to
              ignore it, which is the one thing this button cannot afford. */}
          {(readout.faults > 0 || readout.bank !== null || readout.recovery !== null) && (
            <button
              type="button"
              className="trouble-open"
              onClick={() => setTroubleOpen(true)}
            >
              {readout.faults > 0 ? `Fix (${readout.faults})` : 'Bank'}
            </button>
          )}
        </div>
      </footer>

      <Roster
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        game={() => game.current}
        onMessage={setToast}
      />

      <TroublePanel
        open={troubleOpen}
        onClose={() => setTroubleOpen(false)}
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
