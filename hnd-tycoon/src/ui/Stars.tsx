/**
 * The star rating. DESIGN.md §22.5 (top bar), §6.5.
 *
 * Five glyphs and a number, because §22.3 says numbers tween and never jump —
 * a rating that snapped from 3.8 to 2.1 would read as a bug rather than as the
 * week you just had. It also has to be legible muted and at a glance (§22.4),
 * so the fill IS the signal and the number is the detail.
 */
import { useEffect, useRef, useState } from 'react';

const APPROACH = 0.12;
const SNAP = 0.01;

export function Stars({ value }: { readonly value: number }): JSX.Element {
  const [shown, setShown] = useState(value);
  const target = useRef(value);
  target.current = value;

  useEffect(() => {
    let raf = 0;
    const step = (): void => {
      setShown((current) => {
        const gap = target.current - current;
        return Math.abs(gap) < SNAP ? target.current : current + gap * APPROACH;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const filled = Math.round(shown);
  return (
    <div className={shown < 3 ? 'stars sliding' : 'stars'}>
      <span className="glyphs" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= filled ? 'star on' : 'star'}>
            ★
          </span>
        ))}
      </span>
      <span className="mono rating">{shown.toFixed(1)}</span>
    </div>
  );
}
