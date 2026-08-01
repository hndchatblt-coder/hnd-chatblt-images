/**
 * The canvas, and nothing else. DESIGN.md §21.4.
 *
 * React owns the HUD; Pixi owns the floor. They never fight over the same
 * pixels, and React never re-renders on a sim tick — a HUD that reconciled at
 * 10Hz would cost more than the simulation it is describing.
 */
import { useEffect, useRef, useState } from 'react';
import { Game } from '@/render/Game';

export interface GameCanvasProps {
  readonly seed: number;
  readonly onReady?: (game: Game) => void;
}

export function GameCanvas({ seed, onReady }: GameCanvasProps): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let game: Game | null = new Game({ seed });
    let cancelled = false;

    game
      .start(element)
      .then(() => {
        if (cancelled || !game) return;
        onReady?.(game);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

    return () => {
      cancelled = true;
      game?.destroy();
      game = null;
    };
    // Deliberately once per seed: restarting the simulation is a decision, not
    // a side effect of a prop changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  if (error) return <pre className="fatal">{error}</pre>;
  return <div className="canvas-host" ref={host} />;
}
