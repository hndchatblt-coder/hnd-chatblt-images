/**
 * Policy-bot balance harness. DESIGN.md §25.2.
 *
 * Never hand-tune balance by playing. Tune with the harness, verify by playing.
 *
 * This ran as a stub that printed a line and exited 0 from step 1 to step 10,
 * which meant `npm run gate` contained a step that could not fail — the same
 * defect logged as D030 against `reconcile()`. It is a real check now.
 *
 * BUILD_PLAN step 10 exit: **`bot:naive` demonstrably spirals — ship the
 * chart.** Both halves are here: the assertions below fail the gate if naive
 * stops spiralling, and the chart is printed so a human can see the shape
 * rather than take a boolean's word for it.
 *
 * Bots do NOT yet run the §25.2 session pattern — three 8-minute sessions a day
 * with offline accrual behind the §5.2 caps. That needs offline accrual, which
 * lands at step 20. Until then a bot decides once per game day, which is a more
 * attentive player than the real pattern, so any spiral measured here is a
 * LOWER bound on how bad it gets.
 */
import { BOTS, runBot, tail, type BotDay, type BotRun } from '@/harness/bots';
import { Cash, type Money } from '@/sim/types';

const DAYS = 70;
const SEEDS = [1, 2, 3, 4];

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const aud = (cents: number): Money => ({ cents: Math.round(cents), currency: 'AUD' });

const failures: string[] = [];
const runs = new Map<string, BotRun[]>();

for (const bot of BOTS) {
  runs.set(
    bot.name,
    SEEDS.map((seed) => runBot(bot, seed, DAYS)),
  );
}

// --- The chart ------------------------------------------------------------
/**
 * Sparklines, not a table. The exit criterion is that a human can SEE the
 * spiral, and a column of numbers is something you scroll past.
 */
const BLOCKS = ' ▁▂▃▄▅▆▇█';

function spark(values: number[], width = 60): string {
  if (values.length === 0) return '';
  const step = Math.max(1, Math.floor(values.length / width));
  const sampled: number[] = [];
  for (let i = 0; i < values.length; i += step) sampled.push(values[i] as number);
  const lo = Math.min(...sampled);
  const hi = Math.max(...sampled);
  const span = hi - lo || 1;
  return sampled
    .map((v) => BLOCKS[Math.round(((v - lo) / span) * (BLOCKS.length - 1))] ?? ' ')
    .join('');
}

/** Mean across seeds, day by day, so the chart is not one seed's luck. */
function acrossSeeds(rs: BotRun[], pick: (d: BotDay) => number): number[] {
  const length = Math.min(...rs.map((r) => r.days.length));
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    out.push(mean(rs.map((r) => pick(r.days[i] as BotDay))));
  }
  return out;
}

const first = (xs: number[]): number => xs[0] ?? 0;
const last = (xs: number[]): number => xs[xs.length - 1] ?? 0;

console.log(`\nBALANCE — ${DAYS} game days, ${SEEDS.length} seeds\n`);

for (const bot of BOTS) {
  const rs = runs.get(bot.name) as BotRun[];
  const cash = acrossSeeds(rs, (d) => d.cashCents);
  const stars = acrossSeeds(rs, (d) => d.stars);
  const balked = acrossSeeds(rs, (d) => d.balked);

  console.log(`  bot:${bot.name}`);
  console.log(
    `    cash   ${spark(cash)}  ${Cash.format(aud(first(cash)))} -> ${Cash.format(aud(last(cash)))}`,
  );
  console.log(
    `    stars  ${spark(stars)}  ${first(stars).toFixed(2)} -> ${last(stars).toFixed(2)}`,
  );
  console.log(
    `    walked ${spark(balked)}  ${first(balked).toFixed(0)}/day -> ${last(balked).toFixed(0)}/day`,
  );
  console.log('');
}

// --- The gate -------------------------------------------------------------
const naiveRuns = runs.get('naive') as BotRun[];
const balancedRuns = runs.get('balanced') as BotRun[];
const idleRuns = runs.get('idle') as BotRun[];

/** §25.2, verbatim: "bot:naive bottoms below 3.0 stars by day 30." */
const BOTTOM_BY_DAY = 30;
const BOTTOM_STARS = 3.0;

const bottom = (rs: BotRun[]): number =>
  mean(
    rs.map((r) => Math.min(...r.days.filter((d) => d.day <= BOTTOM_BY_DAY).map((d) => d.stars))),
  );
const total = (rs: BotRun[], pick: (d: BotDay) => number): number =>
  mean(rs.map((r) => r.days.reduce((a, d) => a + pick(d), 0)));

const naiveBottom = bottom(naiveRuns);
const balancedBottom = bottom(balancedRuns);
const idleBottom = bottom(idleRuns);
const naiveCovers = total(naiveRuns, (d) => d.covers);
const balancedCovers = total(balancedRuns, (d) => d.covers);
const idleCovers = total(idleRuns, (d) => d.covers);
const naiveCash = mean(naiveRuns.map((r) => tail(r, 1, (d) => d.cashCents)));
const balancedCash = mean(balancedRuns.map((r) => tail(r, 1, (d) => d.cashCents)));
const idleCash = mean(idleRuns.map((r) => tail(r, 1, (d) => d.cashCents)));
const naiveSpend = mean(naiveRuns.map((r) => tail(r, 1, (d) => d.marketingCents)));

/**
 * The shape of the trap, stated plainly, because it is NOT what "spiral"
 * makes you expect. Naive does not go broke — §10 forbids a shop dying on
 * its own, so nothing here ever could. What happens is worse and quieter:
 *
 * it looks like it is working. Covers rise by a third. The shop is visibly
 * busier every single day. And the rating falls through the floor, the extra
 * covers exactly pay for the advertising that bought them, and after ten weeks
 * of working much harder the bank balance is no better than the shop that did
 * nothing at all.
 */
console.log('  §25.2 gate — naive spirals, balanced is the control, idle is the floor:');
const row = (label: string, a: string, b: string, c: string): void =>
  console.log(`    ${label.padEnd(20)}${a.padStart(14)}${b.padStart(14)}${c.padStart(14)}`);
row('', 'naive', 'balanced', 'idle');
row(
  `stars bottom by d${BOTTOM_BY_DAY}`,
  naiveBottom.toFixed(2),
  balancedBottom.toFixed(2),
  idleBottom.toFixed(2),
);
row(
  `covers over ${DAYS}d`,
  naiveCovers.toFixed(0),
  balancedCovers.toFixed(0),
  idleCovers.toFixed(0),
);
row('marketing paid', Cash.format(aud(naiveSpend)), '', Cash.format(aud(0)));
row(
  'ending cash',
  Cash.format(aud(naiveCash)),
  Cash.format(aud(balancedCash)),
  Cash.format(aud(idleCash)),
);
console.log('');

if (naiveBottom >= BOTTOM_STARS) {
  failures.push(
    `bot:naive bottomed at ${naiveBottom.toFixed(2)} stars by day ${BOTTOM_BY_DAY}, not below ${BOTTOM_STARS}. ` +
      '§25.2 requires it. Marketing into an understaffed kitchen has to cost you the room.',
  );
}
/**
 * The control is BALANCED, not idle — and that changed at step 11 for a reason
 * worth writing down.
 *
 * Before incidents existed, a shop left completely alone held its rating, so
 * idle was a fair "this is what the shop does on its own" baseline. §9 changed
 * that: a fault nobody fixes degrades to its ceiling and stays there, so idle
 * now drifts to 2.74 stars and BOTH bots end up under 3. Keeping idle as the
 * control would have meant either a gate that always fails or pretending an
 * untended shop does not decay.
 *
 * `balanced` is the stronger control anyway, because it makes the comparison a
 * statement about STRATEGY rather than about neglect: same shop, same weather,
 * one bot reads the bottleneck line and fixes what breaks and the other buys
 * advertising. That is also the first real test of §13's claim that the
 * readout is actionable, which has been unfalsified since step 8.
 */
if (balancedBottom < BOTTOM_STARS) {
  failures.push(
    `bot:balanced bottomed below ${BOTTOM_STARS} (${balancedBottom.toFixed(2)}). ` +
      'A bot that fixes what breaks and staffs to the readout should not be in recovery.',
  );
}
if (balancedCovers <= naiveCovers) {
  failures.push(
    `bot:balanced served ${balancedCovers.toFixed(0)} covers against naive's ${naiveCovers.toFixed(0)}. ` +
      '§13 says the bottleneck readout is ACTIONABLE. If following it does not out-serve ignoring it, it is decoration.',
  );
}
if (balancedCash <= naiveCash) {
  failures.push(
    `bot:balanced finished on ${Cash.format(aud(balancedCash))} against naive's ${Cash.format(aud(naiveCash))}. ` +
      'Playing well has to pay, or none of the readouts mean anything.',
  );
}
if (naiveCovers <= idleCovers) {
  failures.push(
    `bot:naive served ${naiveCovers.toFixed(0)} covers against idle's ${idleCovers.toFixed(0)}. ` +
      'The trap only works if the marketing visibly WORKS — a spend that does nothing is a bug, not a trap.',
  );
}
// §10, the floor: idle must SURVIVE. Not thrive, not hold its rating — survive.
// A shop nobody touches for ten weeks accumulates faults it never fixes and
// ends up rated badly, and that is correct. What it may never do is die.
if (idleCash <= 0) {
  failures.push(
    `bot:idle went backwards to ${Cash.format(aud(idleCash))}. ` +
      'A shop left alone must plateau, never die. There is no fail state in this game.',
  );
}

if (failures.length > 0) {
  console.error('✗ BALANCE FAILURES\n');
  for (const f of failures) console.error('  ' + f);
  console.error('');
  process.exit(1);
}

console.log('✓ balance — naive spirals, balanced pays, idle survives\n');
