/**
 * `bot:balanced` — the player who is paying attention. DESIGN.md §25.2.
 *
 * *"Holds a target wait, markets only with spare capacity, and ACTS ON THE
 * BOTTLENECK READOUT."*
 *
 * That last clause is the reason this bot is worth building and not just a
 * better-tuned naive. §13 calls the bottleneck line the main UI thread through
 * all five acts, and claims it is *actionable* — that a player who does what it
 * says gets measurably better outcomes than one who does not. That claim has
 * been unfalsified since step 8 because nothing ever read the line. This bot
 * reads it, and `npm run balance` now fails if following it does not pay.
 *
 * It is deliberately not clairvoyant. It sees the same readout, the same
 * ratings and the same cash a player sees, and it makes the boring correct
 * decision in that order:
 *
 *   1. fix what is broken — a limping fryer is never the cheapest thing to ignore
 *   2. do what the bottleneck line says
 *   3. only once the wait is under target, spend on demand
 *
 * Step 11's exit criterion is that a shop wrecked by `bot:naive` recovers when
 * handed to this one by about day 55. It has to dig out, not merely coast.
 */
import { CATALOGUE_BY_ID } from '@/config/catalogue';
import { MARKETING_CHANNELS } from '@/config/marketing';
import { RECOVERY } from '@/config/recovery';
import { buy, canAfford, fixIncident, setMarketing, setRoster } from '@/sim/actions';
import { meanWaitMinutes } from '@/sim/systems/service';
import type { World } from '@/sim/world';
import type { Bot } from '../bot';

/**
 * The wait it steers to. Under §7.4's six-minute grace, because a shop sitting
 * exactly on the grace line has no room for a Saturday.
 */
const TARGET_WAIT_MINUTES = 5;
/** Cash it will not spend below. A shop with no buffer cannot absorb §9. */
const RESERVE_CENTS = 250_000;
const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];

export const balanced: Bot = {
  name: 'balanced',
  onSession(world: World): void {
    const state = world.state;
    const wait = meanWaitMinutes(state.day.waitTicks, state.day.served);
    const struggling = wait > TARGET_WAIT_MINUTES || state.day.balked > state.day.served * 0.1;

    // 1. Fix what is broken, first and without hesitating. §9's whole design is
    //    that an unattended fault costs more the longer it runs, so "I will get
    //    to it" is the expensive option and a bot that models a thoughtful
    //    player should not take it.
    for (const incident of [...state.incidents]) {
      fixIncident(state, incident.id);
    }

    // 2. Do what the readout says. §13.
    const constraint = state.bottleneck?.kind ?? null;
    if (constraint === 'staff' && state.ledger.cash.cents > RESERVE_CENTS) {
      const result = buy(state, 'hire');
      if (result.ok) {
        const hired = state.staff[state.staff.length - 1];
        // On every day. The roster shape is step 7b's decision and this bot is
        // not clever about it — it is clever about WHEN to add a person at all.
        if (hired) for (const day of ALL_WEEK) setRoster(state, hired.id, day, true);
      }
    } else if (constraint === 'station' && state.ledger.cash.cents > RESERVE_CENTS) {
      // The station the readout named, if the shop sells one. `subject` is the
      // station type, and catalogue ids match it — deliberately, so acting on
      // the readout is a lookup rather than a mapping table nobody maintains.
      const named = state.bottleneck?.subject ?? null;
      const item = named === null ? undefined : CATALOGUE_BY_ID[named];
      if (item && canAfford(state, item)) buy(state, item.id);
    }

    // 3. Demand is the LAST thing it buys, and only from a shop that can serve
    //    it. This is the exact inversion of naive, and §8.3 is why: marketing
    //    into a queue you cannot clear pays for walkouts.
    const canServe = !struggling && state.stars >= RECOVERY.CLEAR_STARS;
    for (const channel of MARKETING_CHANNELS) {
      setMarketing(state, channel.id, canServe ? channel.weeklyCost : 0);
    }
  },
};
