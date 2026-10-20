/**
 * Shared test setup.
 *
 * Step 14 made §15.1's ladder the real unlock gate: `setPrice`, `setMarketing`
 * and `setRoster` refuse in the SIM until their rung lands, and the catalogue
 * refuses to sell a locked line. That is deliberate — a gate the harness walks
 * past is a curtain, not a gate — but it means a test about PRICING has to say
 * that the shop has already earned the pricing panel, or it is measuring the
 * gate instead of the thing it came to measure.
 *
 * So: this is the one line those tests add. It is not a back door; it is the
 * fixture saying "assume a shop three weeks in", which is what every one of
 * them already assumed implicitly.
 */
import { RUNGS } from '@/config/ladder';
import type { SimState } from '@/sim/state';

/** Bank every Act I rung, so a test can exercise a mechanism it did not earn. */
export function openEverything(state: SimState): void {
  for (const rung of RUNGS) {
    if (rung.act !== 1) continue;
    if (!state.rungs.includes(rung.id)) state.rungs.push(rung.id);
  }
}
