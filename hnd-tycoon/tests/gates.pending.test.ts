/**
 * PENDING GATES — the exit criteria for upcoming steps, written as tests.
 *
 * These are `it.todo` / skipped until the step that implements them. When you
 * start a step, UNSKIP its block first, watch it fail, then make it pass.
 * That is the whole point: it converts a prose exit criterion into red/green
 * and removes the temptation to declare a vague gate "essentially met".
 *
 * Do not delete a pending gate because it is inconvenient. If a gate is wrong,
 * change it deliberately and log it in docs/DECISIONS.md.
 */
import { describe, it } from 'vitest';

// STEP 2 — LIVE in tests/step2.test.ts. Converted, failed, passed.

// STEP 3 — LIVE in tests/step3.test.ts. Delta measured at 6.6% of covers.

describe('STEP 4 — attention profiles and buffers', () => {
  it.todo('par-cooking before a rush measurably improves mean wait');
  it.todo('par-cooking before a rush measurably increases waste');
  it.todo('items below quality 0.35 are binned automatically');
  it.todo('a step with canLapse burns if unattended past its window');
  it.todo('holding cabinets extend freshness windows');
  /**
   * Carried forward from step 3. The floor gate measured 6.6%, short of the
   * >=10% recommended for Q1, because walking is only 4% of staff time while
   * a staffer stands and watches a 90-second patty. Splitting elapsed time
   * from attention should cut staff-seconds per cover by roughly two thirds
   * and make the same six tiles bite three times as hard.
   *
   * If it does not, Q1's threshold is wrong or the walk model is too cheap,
   * and that is a design conversation with Ben rather than a tuning exercise.
   */
  it.todo('with attention profiles, the six-tile delta reaches 10% of covers');
});

describe('STEP 6 — economy', () => {
  it.todo('P&L reconciles to the cent over a 90-day run');
  it.todo('Sunday trade is genuinely marginal at baseline staffing');
  it.todo('penalty rates come from the jurisdiction ruleset, not constants');
});

describe('STEP 8 — bottleneck readout', () => {
  it.todo('reports the binding constraint, not the busiest station');
  it.todo('a grill at 100% with nothing waiting on it is NOT the bottleneck');
  it.todo('a grill at 80% with assembly starved IS the bottleneck');
  it.todo('non-station constraints are reachable: walk distance, covers, demand');
  it.todo('bot:balanced acting on the readout outperforms one ignoring it');
});

describe('STEP 12 — automation must not dominate', () => {
  it.todo('bot:roboboss finishes within 25% of bot:balanced on cash');
  it.todo('bot:tightarse finishes within 25% of bot:balanced on cash');
  it.todo('every machine in config declares at least two new costs it creates');
});

describe('STEP 14 — no dead zones', () => {
  it.todo('no bot has a decision-free gap longer than 3 game days');
});

describe('STEP 20 — ship criteria', () => {
  it.todo('bot:balanced reaches the venue-2 threshold at game day 45-60');
  it.todo('labour lands 28-34% unautomated, 22-26% automated');
  it.todo('COGS lands 30-36% pre-commissary');
  it.todo('no stat can be maximised with no downside');
  it.todo('a save created at step 6 still loads');
});
