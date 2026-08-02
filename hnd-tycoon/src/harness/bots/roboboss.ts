/**
 * `bot:roboboss` — automates aggressively. §25.2: *"viable but brittle."*
 *
 * Buys the next rung of §14.2's ladder the moment it can afford it, staffs the
 * minimum it can get away with because that is what the machines are for, and
 * pays for servicing because it has a lot to lose.
 *
 * **Brittle is the design.** §14.3 gives every machine a continuous utilities
 * draw whether busy or not, so a quiet Monday costs a roboboss shop money that
 * a staffed shop simply does not spend — automation is *worse* than staff on a
 * dead day. And §14.4: "a failed machine is worse than never automating."
 *
 * The exit criterion is that it lands within 25% of `bot:balanced`. If it wins
 * outright the ladder is a straight upgrade path and §14.3 has failed; if it
 * loses badly nobody would ever climb it.
 */
import { MACHINES } from '@/config/machines';
import { buy, canAfford, fixIncident, setMaintenance, setRoster } from '@/sim/actions';
import { CATALOGUE_BY_ID } from '@/config/catalogue';
import { meanWaitMinutes } from '@/sim/systems/service';
import type { World } from '@/sim/world';
import type { Bot } from '../bot';

/**
 * Keeps this back. A machine you cannot service is a machine you cannot run.
 *
 * $1,800 was far too thin: the bot spent to the floor every session, so any bad
 * week tipped it into overdraft and §10's interest did the rest. Measured at
 * -$51,045 over ninety days. An operator who automates aggressively is not an
 * operator with no buffer — they have MORE fixed cost to cover, so they need
 * more.
 */
const RESERVE_CENTS = 1_200_000;
const TARGET_WAIT_MINUTES = 7;
const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];

export const roboboss: Bot = {
  name: 'roboboss',
  onSession(world: World): void {
    const state = world.state;

    // Pays for servicing. It has more to lose than anyone.
    setMaintenance(state, true);
    for (const incident of [...state.incidents]) fixIncident(state, incident.id);

    // Cheapest unowned rung first, so it climbs rather than saving for the
    // robot and running a manual kitchen for two months while it does.
    const rungs = [...MACHINES].sort((a, b) => a.price.cents - b.price.cents);
    for (const spec of rungs) {
      const owned = state.stations.some((s) => s.machines.includes(spec.id));
      if (owned) continue;
      const item = CATALOGUE_BY_ID[spec.id];
      if (!item) continue;
      if (state.ledger.cash.cents - spec.price.cents < RESERVE_CENTS) continue;
      if (!canAfford(state, item)) continue;
      // Buys ONE rung per session. Emptying the account in one sitting is a
      // different bot, and a less interesting one.
      if (buy(state, item.id).ok) break;
    }

    // Hires only when the machines are not coping AND there is no rung left to
    // buy. The machines are the point; a roboboss that also staffs up like
    // `balanced` is just `balanced` with a bigger capex bill.
    const rungsLeft = MACHINES.some(
      (m) => !state.stations.some((s) => s.machines.includes(m.id)),
    );
    const wait = meanWaitMinutes(state.day.waitTicks, state.day.served);
    if (!rungsLeft && wait > TARGET_WAIT_MINUTES && state.ledger.cash.cents > RESERVE_CENTS * 2) {
      const result = buy(state, 'hire');
      if (result.ok) {
        const hired = state.staff[state.staff.length - 1];
        if (hired) for (const day of ALL_WEEK) setRoster(state, hired.id, day, true);
      }
    }
  },
};
