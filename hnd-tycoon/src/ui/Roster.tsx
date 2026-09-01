/**
 * Who is on, which days. DESIGN.md §22.5, §8, §13.
 *
 * The most important panel in the game right now, because the roster is the
 * only decision in it where both options are genuinely defensible. Measured
 * over 56 days: nobody $70,291 · Saturday only $71,243 · Friday and Saturday
 * $72,536 · Thursday to Saturday $71,217 · every day $60,054. Over-rostering
 * loses and under-rostering loses, and the middle three are close enough to
 * argue about.
 *
 * It shows the cost of each day, because §8's penalty rates are the reason
 * Sunday is a different question from Tuesday and the player cannot see that
 * anywhere else.
 */
import { useEffect, useState } from 'react';
import type { Game } from '@/render/Game';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface RosterRow {
  readonly id: string;
  readonly name: string;
  readonly roster: readonly boolean[];
  readonly leaving: boolean;
  readonly onToday: boolean;
}

export interface RosterProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly game: () => Game | null;
  readonly onMessage: (message: string) => void;
}

export function Roster({ open, onClose, game, onMessage }: RosterProps): JSX.Element | null {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [dayCost, setDayCost] = useState<number[]>([]);
  const [today, setToday] = useState(0);

  useEffect(() => {
    if (!open) return;
    const refresh = (): void => {
      const g = game();
      if (!g) return;
      setRows(g.roster());
      setDayCost(g.dayCosts());
      setToday(g.world.clock.dayOfWeek);
    };
    refresh();
    const id = setInterval(refresh, 200);
    return () => clearInterval(id);
  }, [open, game]);

  if (!open) return null;

  const toggle = (row: RosterRow, day: number): void => {
    const result = game()?.setRoster(row.id, day, !row.roster[day]);
    if (result?.reason && !result.ok) onMessage(result.reason);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Who&rsquo;s on</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="roster-note">
          Changes start tomorrow. Sunday costs half again; Saturday a quarter.
        </div>

        <div className="roster-days">
          <span />
          {DAYS.map((d, i) => (
            <span key={i} className={i === today ? 'rday now' : 'rday'}>
              {d}
              <em className="mono">${Math.round((dayCost[i] ?? 0) / 100)}</em>
            </span>
          ))}
        </div>

        {rows.map((row) => (
          <div key={row.id} className="roster-row">
            <span className="roster-name">
              {row.name}
              {row.leaving && <em>leaving</em>}
              {!row.leaving && row.onToday && <em className="on">in today</em>}
            </span>
            {row.roster.map((on, day) => (
              <button
                key={day}
                type="button"
                aria-label={`${row.name} ${FULL[day]}`}
                className={on ? 'rcell on' : 'rcell'}
                onClick={() => toggle(row, day)}
              >
                {on ? '●' : ''}
              </button>
            ))}
          </div>
        ))}

        {rows.length > 1 && (
          <div className="roster-fire">
            {rows.slice(1).map((row) => (
              <button
                key={row.id}
                type="button"
                className="letgo"
                disabled={row.leaving}
                onClick={() => {
                  const result = game()?.fire(row.id);
                  if (result?.reason) onMessage(result.reason);
                }}
              >
                {row.leaving ? `${row.name} — finishing up` : `Let ${row.name} go`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
