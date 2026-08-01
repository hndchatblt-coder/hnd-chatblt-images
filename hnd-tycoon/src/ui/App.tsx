/**
 * The HUD. DESIGN.md §22.5.
 *
 * Step 5 is the first pixels, so this is deliberately thin: the clock, the
 * covers count and the speed control. The full portrait HUD — cash, stars,
 * the bottleneck line, the ticket rail — arrives with the systems that give
 * it something true to say.
 *
 * It polls rather than subscribing. At 4 Hz a HUD costs nothing and a React
 * tree that re-rendered on every 10 Hz sim tick would cost more than the
 * simulation it is describing.
 */
import { useEffect, useRef, useState } from 'react';
import { GameCanvas } from './GameCanvas';
import type { Game } from '@/render/Game';

const HUD_HZ = 4;

interface Readout {
  clock: string;
  covers: number;
  waiting: number;
  open: boolean;
}

export function App(): JSX.Element {
  const game = useRef<Game | null>(null);
  const [speed, setSpeed] = useState(1);
  const [readout, setReadout] = useState<Readout>({
    clock: '—',
    covers: 0,
    waiting: 0,
    open: false,
  });

  useEffect(() => {
    const id = setInterval(() => {
      const g = game.current;
      if (!g) return;
      const state = g.world.state;
      setReadout({
        clock: g.world.clock.format(),
        covers: state.day.served,
        waiting: [...state.customers.values()].filter((c) => c.state === 'waiting').length,
        open: g.world.clock.isOpen,
      });
    }, 1000 / HUD_HZ);
    return () => clearInterval(id);
  }, []);

  const changeSpeed = (next: number): void => {
    setSpeed(next);
    game.current?.setSpeed(next);
  };

  return (
    <div className="frame">
      <header className="topbar">
        <span className="site">LEICHHARDT</span>
        <span className="clock mono">{readout.clock}</span>
        <span className={readout.open ? 'trading' : 'closed'}>
          {readout.open ? 'OPEN' : 'CLOSED'}
        </span>
      </header>

      <GameCanvas
        seed={42}
        onReady={(g) => {
          game.current = g;
          g.setSpeed(speed);
        }}
      />

      <footer className="bottombar">
        <div className="stat">
          <span className="label">COVERS TODAY</span>
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
      </footer>
    </div>
  );
}
