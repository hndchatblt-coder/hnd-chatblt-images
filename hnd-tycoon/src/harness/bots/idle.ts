/**
 * `bot:idle` — the control. DESIGN.md §25.2, and the pillar it defends.
 *
 * It does nothing at all after day one. Its job is not to win; its job is to
 * prove the floor exists. **"The player can never lose"** means a shop left
 * completely alone must plateau, not die — no fail screen, no death spiral you
 * cannot walk away from, no negative-cash hole that opens on its own.
 *
 * It is also the honest baseline for every other bot. A strategy that beats
 * doing nothing by nothing is not a strategy, and the audit that started this
 * whole rebuild found exactly that: doing nothing dominated.
 */
import type { Bot } from '../bot';

export const idle: Bot = {
  name: 'idle',
  onSession(): void {
    // Deliberately empty. See above — this is a measurement, not an oversight.
  },
};
