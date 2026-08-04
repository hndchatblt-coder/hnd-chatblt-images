/**
 * The daily headline. DESIGN.md §15.2.
 *
 * *"Every day ends on a one-line verdict above the P&L: 'Best Tuesday yet.' /
 * 'Lost eleven customers to the queue.' / 'Waste ate your Wednesday.' Specific,
 * from real data, never generic encouragement. For most sessions it's the thing
 * the player remembers."*
 *
 * **The exit criterion is a writing criterion**: read twenty and cut any that
 * could apply to any day. So every line here is built from a NUMBER the day
 * actually produced, and the ones that could not be are not here.
 *
 * Two rules that fall out of that, and both are enforced by a test:
 *
 * 1. **Every template interpolates at least one figure from the day.** A line
 *    with no number in it is generic by construction — "a solid day" fits every
 *    day ever traded.
 * 2. **No encouragement.** Nothing here tells the player they did well or
 *    badly in the abstract; it tells them what happened. "Lost eleven customers
 *    to the queue" is a fact they can act on. "Keep it up!" is a sticker.
 *
 * Tone is §22's: affectionate, grimy, Australian, played straight. Never winks.
 */

/** Everything a headline may read. Assembled at close from the day's figures. */
export interface DayFacts {
  readonly dayName: string;
  readonly covers: number;
  readonly balked: number;
  readonly revenueCents: number;
  readonly wasteUnits: number;
  readonly unitsProduced: number;
  readonly meanWaitMinutes: number;
  readonly stars: number;
  readonly starsYesterday: number;
  /** Best covers on this weekday before today. Zero when it is the first. */
  readonly bestSameDayCovers: number;
  /** Best revenue on any day before today. */
  readonly bestRevenueCents: number;
  /** Wages, rent, utilities and stock the day cost, whether it traded or not. */
  readonly costsCents: number;
  readonly incidentsOpen: number;
  readonly staffOn: number;
  readonly reviewsToday: number;
  /**
   * How many days running this template has now won, today included.
   *
   * Reading eighty-four consecutive headlines turned up the one weakness the
   * twenty-line exit criterion misses: every individual line was specific and
   * true, and *"Waste ate your Wednesday — 33 things binned"* still landed on
   * five days out of seven. Specific is not the same as worth reading twice.
   *
   * So a repeat says the thing the repeat actually means. One is a bad day;
   * four in a row is a habit, and the headline should be the one telling the
   * player that rather than leaving them to notice.
   */
  readonly streak: number;
}

export interface HeadlineTemplate {
  readonly id: string;
  /** Higher wins when several apply. The most notable thing about the day. */
  readonly weight: number;
  readonly applies: (d: DayFacts) => boolean;
  readonly say: (d: DayFacts) => string;
  /**
   * What to say from the second consecutive day onward. Optional: a line only
   * needs one when repeating it would be dead air. `d.streak` is the run length
   * including today, so the earliest this is ever called is with `streak = 2`.
   */
  readonly again?: (d: DayFacts) => string;
}

/** "second", "third"… for streaks. Beyond the list it falls back to digits. */
const ORDINALS = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth'] as const;
const run = (n: number): string => ORDINALS[n] ?? `${n}th`;
/** Same word, at the head of a sentence. */
const Run = (n: number): string => {
  const word = run(n);
  return (word[0] ?? '').toUpperCase() + word.slice(1);
};

const money = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-AU')}`;
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * Ordered by how much the day was ABOUT the thing, not by how bad it is.
 *
 * A shop that lost forty customers and also set a revenue record was about the
 * forty customers. The weights encode that judgement and nothing else does.
 */
export const HEADLINES: readonly HeadlineTemplate[] = [
  {
    id: 'walkouts',
    weight: 100,
    applies: (d) => d.balked > 0 && d.balked >= d.covers * 0.15,
    say: (d) =>
      `Lost ${d.balked} ${plural(d.balked, 'customer', 'customers')} to the queue.`,
    again: (d) =>
      `Another ${d.balked} out the door. ${Run(d.streak)} day running you have turned people away.`,
  },
  {
    id: 'waste',
    weight: 90,
    applies: (d) => d.unitsProduced > 0 && d.wasteUnits / d.unitsProduced > 0.12,
    say: (d) =>
      `Waste ate your ${d.dayName} — ${d.wasteUnits} ${plural(d.wasteUnits, 'thing', 'things')} binned, ${pct(d.wasteUnits / d.unitsProduced)} of what you made.`,
    again: (d) =>
      `${d.wasteUnits} more in the bin. That is the ${run(d.streak)} day straight over a tenth of everything you cooked.`,
  },
  {
    id: 'ratingDrop',
    weight: 85,
    applies: (d) => d.starsYesterday - d.stars >= 0.15,
    say: (d) =>
      `Down to ${d.stars.toFixed(1)} stars from ${d.starsYesterday.toFixed(1)}. ${d.reviewsToday} ${plural(d.reviewsToday, 'review', 'reviews')} yesterday.`,
  },
  {
    id: 'brokenKit',
    weight: 80,
    applies: (d) => d.incidentsOpen > 0 && d.meanWaitMinutes > 9,
    say: (d) =>
      `${d.incidentsOpen} ${plural(d.incidentsOpen, 'thing', 'things')} still broken, and the wait is up to ${d.meanWaitMinutes.toFixed(0)} minutes.`,
    again: (d) =>
      // Deliberately "now": the count moves between days, and saying "still 3
      // things" when yesterday's one fault became today's three is a small lie
      // in a line whose whole job is being trusted.
      `${Run(d.streak)} day trading broken — ${d.incidentsOpen} ${plural(d.incidentsOpen, 'thing', 'things')} now, ${d.meanWaitMinutes.toFixed(0)} minutes to get served.`,
  },
  {
    id: 'recordRevenue',
    weight: 70,
    applies: (d) => d.bestRevenueCents > 0 && d.revenueCents > d.bestRevenueCents,
    say: (d) => `${money(d.revenueCents)} through the till. Best day you have had.`,
  },
  {
    id: 'bestWeekday',
    weight: 60,
    applies: (d) => d.bestSameDayCovers > 0 && d.covers > d.bestSameDayCovers,
    say: (d) => `Best ${d.dayName} yet — ${d.covers} covers.`,
  },
  {
    id: 'ratingClimb',
    weight: 55,
    applies: (d) => d.stars - d.starsYesterday >= 0.15,
    say: (d) => `Up to ${d.stars.toFixed(1)} stars. Word is getting round.`,
  },
  {
    id: 'longWait',
    weight: 45,
    applies: (d) => d.covers > 0 && d.meanWaitMinutes > 11,
    say: (d) =>
      `${d.meanWaitMinutes.toFixed(0)} minutes to get a burger. People noticed.`,
    again: (d) =>
      `Still ${d.meanWaitMinutes.toFixed(0)} minutes for a burger, ${run(d.streak)} day in a row.`,
  },
  {
    id: 'shortHanded',
    weight: 40,
    applies: (d) => d.staffOn <= 1 && d.covers > 60,
    say: (d) => `${d.covers} covers on your own. That is not a plan.`,
    again: (d) => `${d.covers} more covers, still on your own. ${Run(d.streak)} day of it.`,
  },
  {
    id: 'clean',
    weight: 30,
    applies: (d) => d.covers > 0 && d.balked === 0,
    say: (d) => `${d.covers} covers and nobody walked out.`,
    again: (d) => `${d.covers} covers, nobody walked. ${run(d.streak)} clean day in a row.`,
  },
  {
    id: 'quiet',
    weight: 20,
    applies: (d) => d.covers > 0 && d.covers < 40,
    say: (d) => `Quiet ${d.dayName}. ${d.covers} covers and ${money(d.revenueCents)}.`,
    again: (d) => `Another quiet one — ${d.covers} covers, ${money(d.revenueCents)}. ${Run(d.streak)} day under forty.`,
  },
  {
    id: 'ordinary',
    /**
     * The floor. Still carries two real figures, because §15.2 forbids generic
     * encouragement and "a steady day" is exactly that — it would be true of
     * every day the shop ever trades.
     */
    weight: 10,
    applies: (d) => d.covers > 0,
    say: (d) => `${d.covers} covers, ${money(d.revenueCents)}.`,
    again: (d) => `${d.covers} covers, ${money(d.revenueCents)}. Same shape as yesterday.`,
  },
  {
    id: 'shut',
    weight: 5,
    applies: (d) => d.covers === 0,
    /**
     * A shut day is the one day with no covers to quote, so it quotes the
     * figure that does not care whether anybody came: the day still cost you
     * ${money}. Which is also the more useful half of the sentence.
     */
    say: (d) => `Nothing through the door all ${d.dayName}. ${money(d.costsCents)} out the door anyway.`,
    again: (d) => `Shut again — ${run(d.streak)} day running, another ${money(d.costsCents)} gone.`,
  },
];
