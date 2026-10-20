/**
 * What is wrong, and what the bank thinks of it. DESIGN.md §9, §10.
 *
 * Three things, in the order a player cares about them:
 *
 *   **The Recovery Plan's next objective.** §15: "the player can always see the
 *   next objective". One line, the one currently being missed, so there is
 *   never a checklist to read and never a moment where the game has told you
 *   you are in trouble without telling you what to do about it.
 *
 *   **The bank.** §10's escalating tone. It is not a warning dialog and it
 *   never blocks anything — it is the game saying how much trouble you are in
 *   without a screen that says you lost.
 *
 *   **The list of faults.** Each with what it costs to fix, and NO countdown.
 *   §9 forbids a response window and §5.3 makes that a pillar. If a timer ever
 *   appears on this panel, something has gone badly wrong upstream.
 */
import { useEffect, useState } from 'react';
import type { Game } from '@/render/Game';
import { Money } from './Money';

const POLL_HZ = 3;
const PERCENT = 100;

interface Props {
  open: boolean;
  onClose: () => void;
  game: () => Game | null;
  onMessage: (text: string) => void;
}

type Troubles = ReturnType<Game['troubles']>;
type Trouble = ReturnType<Game['trouble']>;

export function TroublePanel({ open, onClose, game, onMessage }: Props): JSX.Element | null {
  const [rows, setRows] = useState<Troubles>([]);
  const [state, setState] = useState<Trouble>({ bank: null, recovery: null, inPlan: false });

  useEffect(() => {
    if (!open) return;
    const read = (): void => {
      const g = game();
      if (!g) return;
      setRows(g.troubles());
      setState(g.trouble());
    };
    read();
    const id = setInterval(read, 1000 / POLL_HZ);
    return () => clearInterval(id);
  }, [open, game]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet trouble"
        role="dialog"
        aria-label="Problems"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>The state of things</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Done
          </button>
        </div>

        {state.inPlan && state.recovery && (
          <section className="panel">
            <h3>Getting back on your feet</h3>
            <p className="objective">{state.recovery}</p>
          </section>
        )}

        {state.bank && (
          <section className="panel">
            <h3>The bank</h3>
            {/* Their words, verbatim, with no interpretation layered on top.
                The tone IS the information. */}
            <p className="bank-tone">&ldquo;{state.bank}&rdquo;</p>
          </section>
        )}

        <section className="panel">
          <h3>Broken things</h3>
          {rows.length === 0 && (
            <p className="note">Nothing is broken. It will not last, but enjoy it.</p>
          )}
          {rows.map((row) => (
            <div className="fault" key={row.id}>
              <div className="fault-head">
                <span className="fault-label">{row.label}</span>
                {/* How far it has been let go. Not a countdown — a state. The
                    bar filling up is "this is getting worse", never "hurry". */}
                <span className="fault-bar" aria-hidden>
                  <span
                    className="fault-bar-fill"
                    style={{ width: `${Math.round(row.severity * PERCENT)}%` }}
                  />
                </span>
              </div>
              <p className="fault-blurb">{row.blurb}</p>
              {row.fixable ? (
                <button
                  type="button"
                  className="fix"
                  onClick={() => {
                    const g = game();
                    if (!g) return;
                    onMessage(g.fixIncident(row.id).reason ?? '');
                  }}
                >
                  Sort it &mdash; <Money cents={row.fixCents} />
                </button>
              ) : (
                <p className="note">Nothing to pay. It passes.</p>
              )}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
