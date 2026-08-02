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
  /**
   * Override the site's foot traffic. Unset in the shipped app.
   *
   * It exists because the only honest way to check that a walkout, a slumped
   * queue or a red ticket rail actually renders is to make one happen and look
   * at it, and at Leichhardt's real foot traffic a Sunday lunchtime has a queue
   * of nought. Reasoning about pixels is not evidence.
   */
  readonly arrivalsPerHour?: number;
  /**
   * Machines to fit at boot. Unset in the shipped app.
   *
   * Same reason as `arrivalsPerHour`: the only honest way to check that §21.5's
   * mechanical/human contrast actually reads is to put an automated kitchen and
   * a manual one side by side and look at them. Reasoning about motion is not
   * evidence, and a machine takes far too long to earn in real play to check
   * by playing.
   */
  readonly machines?: readonly string[];
  readonly onReady?: (game: Game) => void;
}

export function GameCanvas({ seed, arrivalsPerHour, machines, onReady }: GameCanvasProps): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let game: Game | null = new Game({ seed, arrivalsPerHour: arrivalsPerHour ?? null });
    let cancelled = false;

    game
      .start(element)
      .then(() => {
        if (cancelled || !game) return;
        for (const id of machines ?? []) game.buy(id);
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
  }, [seed, arrivalsPerHour, machines]);

  if (error) return <pre className="fatal">{error}</pre>;
  return <div className="canvas-host" ref={host} />;
}
