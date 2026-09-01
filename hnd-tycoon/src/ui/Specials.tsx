/**
 * The Monday choice. DESIGN.md §18.
 *
 * *"Three-sided decision every Monday: what draws people, what your kitchen can
 * produce at volume, what you can prep without eating the waste."*
 *
 * **All three sides are on the row.** The draw, the station it leans on, and
 * what a unit costs to prep — visible without tapping into anything, because
 * the decision IS the comparison between them. A list of names with the
 * details behind a detail view is a menu, not a decision, and §18 is explicit
 * that this is the most business-shaped mechanic in the game.
 *
 * The prep number is the second half and it gets its own control, because §18's
 * exit criterion is that under- AND over-prepping both cost. A slider that
 * defaults to the spec'd figure would answer the question for the player; this
 * one starts there and says out loud what moving it does.
 */
import { useEffect, useState } from 'react';
import { Money } from './Money';
import type { Game } from '@/render/Game';

interface Props {
  open: boolean;
  onClose: () => void;
  game: () => Game | null;
  onMessage: (message: string) => void;
}

const PREP_STEP = 2;
const PREP_MAX_MULTIPLE = 4;
const PERCENT = 100;

export function Specials({ open, onClose, game, onMessage }: Props): JSX.Element | null {
  const [chosen, setChosen] = useState<string | null>(null);
  const [prep, setPrep] = useState(0);
  const [promote, setPromote] = useState(false);
  const data = open ? (game()?.specials() ?? null) : null;

  // Open on whatever is already queued, so the panel is a view of a decision
  // rather than a form that forgets it.
  useEffect(() => {
    if (!open || !data) return;
    setChosen(data.pending);
    setPrep(data.prepTarget);
    setPromote(data.promoted);
    // Only when the sheet opens. Re-syncing every poll would fight the player's
    // thumb mid-drag, which is the single most common way a slider feels broken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !data) return null;

  const spec = data.options.find((o) => o.id === chosen) ?? null;
  const suggested = spec ? Math.round(spec.prepUnits * (promote ? data.promoUplift : 1)) : 0;
  const max = spec ? Math.max(PREP_STEP, spec.prepUnits * PREP_MAX_MULTIPLE) : 0;
  const wasteCents = spec ? Math.round(Math.max(0, prep - suggested) * spec.unitCost * PERCENT) : 0;

  const commit = (): void => {
    const result = game()?.setSpecial(chosen, prep, promote);
    if (result?.reason) onMessage(result.reason);
    onClose();
  };

  return (
    <div className="sheet-backdrop" role="dialog" aria-label="Next week's special">
      <div className="sheet">
        <header className="sheet-head">
          <h2>Next week</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Done
          </button>
        </header>

        {data.running !== null && (
          <p className="sheet-note">
            This week you are running{' '}
            {data.options.find((o) => o.id === data.running)?.label ?? data.running}.
            {' '}A special starts on Monday and runs the week.
          </p>
        )}

        {/* §18's credibility, but only once it is a thing that has happened.
            A permanent "reputation: 100%" bar teaches the player to ignore it. */}
        {data.credibility < 1 && (
          <p className="sheet-note bad">
            People are {Math.round(data.credibility * PERCENT)}% as likely to turn up for a
            special now. You ran out on them.
          </p>
        )}

        <ul className="specials">
          <li>
            <button
              type="button"
              className={chosen === null ? 'special on' : 'special'}
              onClick={() => {
                setChosen(null);
                setPrep(0);
                setPromote(false);
              }}
            >
              <span className="special-label">No special</span>
              <span className="special-blurb">
                Nothing to bin, and nothing to bring anyone in.
              </span>
            </button>
          </li>
          {data.options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={chosen === option.id ? 'special on' : 'special'}
                onClick={() => {
                  setChosen(option.id);
                  setPrep(Math.round(option.prepUnits * (promote ? data.promoUplift : 1)));
                }}
              >
                <span className="special-label">{option.label}</span>
                <span className="special-blurb">{option.blurb}</span>
                {/* The three sides, in order: draw, kitchen, waste. */}
                <span className="special-facts">
                  <span>
                    {option.dayName} &middot; +{Math.round(option.uplift * PERCENT)}%
                  </span>
                  <span>leans on the {option.station.toLowerCase()}</span>
                  <span className={option.exclusive ? 'exposed' : undefined}>
                    {option.prepUnits === 0
                      ? 'nothing to prep'
                      : option.exclusive
                        ? `${option.prepUnits} to prep, binned if unsold`
                        : `${option.prepUnits} to prep`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {spec && spec.prepUnits > 0 && (
          <div className="prep">
            <label htmlFor="prep-range">
              Prep <strong>{prep}</strong>
              {prep < suggested && <em className="bad"> — you will run out</em>}
              {prep > suggested && (
                <em className="bad">
                  {' '}
                  &mdash; about <Money cents={wasteCents} /> in the bin
                </em>
              )}
              {prep === suggested && <em> — about what it sells, on an average week</em>}
            </label>
            <input
              id="prep-range"
              type="range"
              min={0}
              max={max}
              step={PREP_STEP}
              value={prep}
              onChange={(e) => setPrep(Number(e.target.value))}
            />
            {/* Said plainly, because it is the whole trap: demand is bursty, so
                the "right" number is right on average and wrong most weeks. */}
            <p className="sheet-note">
              Some weeks more turn up than others. Prepping exactly what it sells
              on average means running short about half the time.
            </p>
          </div>
        )}

        {spec && (
          <label className="promote">
            <input
              type="checkbox"
              checked={promote}
              onChange={(e) => {
                setPromote(e.target.checked);
                setPrep(Math.round(spec.prepUnits * (e.target.checked ? data.promoUplift : 1)));
              }}
            />
            <span>
              Promote it — <Money cents={data.promoCost * PERCENT} /> for the week.
              <em> Draws a much bigger crowd. Make sure you can feed them.</em>
            </span>
          </label>
        )}

        <button type="button" className="shop-open" onClick={commit}>
          {chosen === null ? 'No special next week' : 'Lock it in for Monday'}
        </button>
      </div>
    </div>
  );
}
