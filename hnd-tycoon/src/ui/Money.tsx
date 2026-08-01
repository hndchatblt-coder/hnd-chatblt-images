/**
 * Cash. DESIGN.md §22.3 — **numbers tween, never jump.** A value that changes
 * without motion reads as a bug, and money is the number the player watches
 * most.
 */
import { useEffect, useRef, useState } from 'react';

const APPROACH = 0.18;
const SNAP_CENTS = 50;

export function Money({ cents }: { readonly cents: number }): JSX.Element {
  const [shown, setShown] = useState(cents);
  const target = useRef(cents);
  const flash = useRef(0);

  target.current = cents;

  useEffect(() => {
    let raf = 0;
    const step = (): void => {
      setShown((current) => {
        const gap = target.current - current;
        if (Math.abs(gap) < SNAP_CENTS) return target.current;
        return current + gap * APPROACH;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    flash.current = Date.now();
  }, [cents]);

  const dollars = Math.round(shown / 100);
  return (
    <span className={`cash mono ${cents < 0 ? 'overdrawn' : ''}`}>
      {cents < 0 ? '-' : ''}${Math.abs(dollars).toLocaleString('en-AU')}
    </span>
  );
}
