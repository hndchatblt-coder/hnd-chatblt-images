/**
 * Pricing and marketing. DESIGN.md §8.2, §8.3.
 *
 * Two levers, one sheet, because they are the same decision seen from two
 * sides: how much you charge and how hard you shout about it. §8.3 puts them on
 * the same weekly bill for exactly that reason.
 *
 * The two things on this screen that are not optional:
 *
 *   §8.2 — the FAIR-PRICE BAND, live, beside the price. A price input with no
 *   reference is a number to guess at. One with "here is what a shop at your
 *   rating gets away with" printed under it is a decision, and it is the main
 *   way reputation converts into money.
 *
 *   §8.3 — COST PER COVER, on the marketing panel. The trap is that the spend
 *   line looks identical whether the money is working or not. This is the
 *   number that tells them apart, and without it the panel is a way to lose
 *   money quietly.
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

type Pricing = ReturnType<Game['pricing']>;
type Marketing = ReturnType<Game['marketing']>;

export function Trade({ open, onClose, game, onMessage }: Props): JSX.Element | null {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [marketing, setMarketing] = useState<Marketing | null>(null);

  useEffect(() => {
    if (!open) return;
    const read = (): void => {
      const g = game();
      if (!g) return;
      setPricing(g.pricing());
      setMarketing(g.marketing());
    };
    read();
    const id = setInterval(read, 1000 / POLL_HZ);
    return () => clearInterval(id);
  }, [open, game]);

  if (!open) return null;

  const shown = pricing?.pending ?? pricing?.current ?? 1;
  const band = pricing?.band ?? { low: 0.88, high: 1.12 };
  // Where the current price sits against the band, as a percentage across the
  // whole legal range — so the marker and the band are drawn in one coordinate
  // system and cannot drift apart.
  const across = (v: number): number => {
    const min = pricing?.min ?? 0.6;
    const max = pricing?.max ?? 1.8;
    return ((v - min) / (max - min)) * PERCENT;
  };
  const verdict =
    shown > band.high ? 'over the odds' : shown < band.low ? 'under the odds' : 'about right';

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      {/* Stop a tap inside the sheet from closing it. Every other sheet in the
          game dismisses on backdrop tap and this one did not, which on a phone
          reads as the app having hung. */}
      <div
        className="sheet trade"
        role="dialog"
        aria-label="Prices and marketing"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="sheet-head">
        <h2>Prices &amp; marketing</h2>
        <button type="button" className="sheet-close" onClick={onClose}>
          Done
        </button>
      </div>

      <section className="panel">
        <h3>What you charge</h3>
        <div className="price-value mono">{Math.round(shown * PERCENT)}%</div>
        <div className="price-verdict">{verdict} for {pricing?.stars.toFixed(1) ?? '—'} stars</div>

        {/* The band, drawn. A range printed as two numbers is arithmetic; a
            range drawn under the thing you are moving is a target. */}
        <div className="band-track">
          <div
            className="band-fair"
            style={{ left: `${across(band.low)}%`, width: `${across(band.high) - across(band.low)}%` }}
          />
          <div className="band-marker" style={{ left: `${across(shown)}%` }} />
        </div>
        <div className="band-legend">
          <span>{Math.round((pricing?.min ?? 0.6) * PERCENT)}%</span>
          <span className="band-legend-fair">
            fair: {Math.round(band.low * PERCENT)}&ndash;{Math.round(band.high * PERCENT)}%
          </span>
          <span>{Math.round((pricing?.max ?? 1.8) * PERCENT)}%</span>
        </div>

        <div className="price-buttons">
          {[-10, -5, 5, 10].map((step) => (
            <button
              key={step}
              type="button"
              className="price-step"
              onClick={() => {
                const g = game();
                if (!g) return;
                const result = g.setPrice(
                  Math.round((shown + step / PERCENT) * PERCENT) / PERCENT,
                );
                onMessage(result.reason ?? '');
              }}
            >
              {step > 0 ? `+${step}` : step}%
            </button>
          ))}
        </div>
        {/* Not a footnote. The delay is the mechanic — see setPrice. */}
        <p className="note">
          {pricing?.pending !== null && pricing?.pending !== undefined
            ? `${Math.round(pricing.pending * PERCENT)}% starts tomorrow.`
            : 'Price changes start the next trading day.'}
        </p>
      </section>

      <section className="panel">
        <h3>Getting the word out</h3>
        {marketing?.channels.map(({ channel, weekly }) => (
          <div className="channel" key={channel.id}>
            <div className="channel-head">
              <span className="channel-name">{channel.label}</span>
              <span className={weekly > 0 ? 'channel-spend on mono' : 'channel-spend mono'}>
                {weekly > 0 ? `$${weekly}/wk` : 'off'}
              </span>
            </div>
            <p className="channel-blurb">{channel.blurb}</p>
            <div className="channel-buttons">
              {[0, channel.weeklyCost / 2, channel.weeklyCost].map((amount, i) => (
                <button
                  key={i}
                  type="button"
                  className={Math.round(weekly) === Math.round(amount) ? 'chip on' : 'chip'}
                  onClick={() => {
                    const g = game();
                    if (!g) return;
                    const result = g.setMarketing(channel.id, Math.round(amount));
                    onMessage(result.reason ?? '');
                  }}
                >
                  {amount === 0 ? 'Off' : `$${Math.round(amount)}`}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* §8.3, the required number. Shown as "—" rather than "$0.00" when
            nothing is being spent: zero would read as free, and free is the one
            thing marketing never is. */}
        <div className="cost-per-cover">
          <span className="label">COST PER COVER</span>
          {marketing && marketing.costPerCoverCents > 0 ? (
            <Money cents={marketing.costPerCoverCents} />
          ) : (
            <span className="cash mono">&mdash;</span>
          )}
        </div>
        {marketing && marketing.efficiency < 1 && (
          <p className="note bad">
            At {pricing?.stars.toFixed(1) ?? '—'} stars every dollar buys{' '}
            {Math.round(marketing.efficiency * PERCENT)}% of what it would at five. Fix the
            queue before you buy more of it.
          </p>
        )}
      </section>
      </div>
    </div>
  );
}
