/**
 * `bot:tightarse` — minimum staff, maximum margin, never automates. §25.2.
 *
 * The operator who has read one book about margin. Every instinct here is a
 * real one that real operators have: charge what the market will bear, keep the
 * wage bill down, do not buy equipment you can manage without, and stop paying
 * a service contract on a machine that is working fine.
 *
 * It is not a strawman and it must not be beatable by a mile. §14.2's exit
 * criterion is that it finishes within 25% of `bot:balanced` — **neither
 * strategy may dominate.** If running lean loses badly then automation is
 * mandatory and there is no decision; if it wins, the ladder is decoration.
 */
import { RECOVERY } from '@/config/recovery';
import { buy, fixIncident, setMaintenance, setPrice, setRoster } from '@/sim/actions';
import { meanWaitMinutes } from '@/sim/systems/service';
import type { World } from '@/sim/world';
import type { Bot } from '../bot';

/** What it charges. Above the fair band, deliberately — that IS the strategy. */
const PRICE = 1.18;
/** It will carry one extra pair of hands and no more. */
const MAX_HIRES = 1;
/** Only hires when the wait is bad enough that walkouts cost more than a wage. */
const DESPERATE_WAIT_MINUTES = 11;

export const tightarse: Bot = {
  name: 'tightarse',
  onSession(world: World): void {
    const state = world.state;

    // Never pays for servicing. §14.4 says skipping is correct in a cash crunch
    // and expensive later; this bot treats every week as a cash crunch.
    setMaintenance(state, false);
    setPrice(state, PRICE);

    // Fixes things, because a broken station costs covers and covers are
    // margin. Being tight is not the same as being stupid.
    for (const incident of [...state.incidents]) fixIncident(state, incident.id);

    const wait = meanWaitMinutes(state.day.waitTicks, state.day.served);
    const hires = state.staff.length - 1;
    if (wait > DESPERATE_WAIT_MINUTES && hires < MAX_HIRES) {
      const result = buy(state, 'hire');
      if (result.ok) {
        const hired = state.staff[state.staff.length - 1];
        // Weekend only. If you must pay someone, pay them on the days that pay.
        if (hired) for (const day of [5, 6]) setRoster(state, hired.id, day, true);
      }
    }

    // No machines, ever. No marketing either — it believes the food sells
    // itself, and at a good rating it is not entirely wrong.
    void RECOVERY;
  },
};
