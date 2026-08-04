/**
 * `bot:naive` — the player who does the obvious thing. DESIGN.md §25.2.
 *
 * It buys the cheapest thing it can afford, turns every marketing channel up to
 * full, and never rosters anybody. Every one of those is a defensible instinct
 * on its own: spend within your means, get the word out, keep the wage bill
 * down. Together they are a spiral, and **the spiral is the whole point of this
 * bot.** If naive quietly does fine, then §8.3's warning that marketing a bad
 * shop is bad money after bad is decoration.
 *
 * The loop it falls into:
 *   marketing raises arrivals -> one pair of hands cannot serve them ->
 *   the queue builds -> §6.3 walkouts, each leaving a two-star mark ->
 *   reputation falls -> `marketingEfficiency` falls with it, so the SAME spend
 *   buys fewer customers -> and `reputationMultiplier` cuts the foot traffic
 *   the spend was buying against.
 *
 * The bill is fixed and the return decays. That is the shape of the trap, and
 * a player has to be able to watch it happen — hence the chart.
 */
import { CATALOGUE } from '@/config/catalogue';
import { MARKETING_CHANNELS } from '@/config/marketing';
import { buy, canAfford, priceOf, setMarketing } from '@/sim/actions';
import type { World } from '@/sim/world';
import type { Bot } from '../bot';

export const naive: Bot = {
  name: 'naive',
  onSession(world: World): void {
    const state = world.state;

    // Word of mouth is free and advertising is not, but advertising is the one
    // with a button. Full spend on everything, from day one, forever.
    for (const channel of MARKETING_CHANNELS) {
      setMarketing(state, channel.id, channel.weeklyCost);
    }

    // Cheapest first. It is the affordable decision, which is not the same
    // thing as the right one — the cheapest item in the shop is never the
    // constraint, because if it were it would already be fixed.
    const affordable = CATALOGUE.filter((item) => canAfford(state, item)).sort(
      (a, b) => priceOf(state, a) - priceOf(state, b),
    );
    const cheapest = affordable[0];
    if (cheapest) buy(state, cheapest.id);

    // No rostering. A hire that is never put on a day is a wage paid once and
    // a pair of hands never used, which is exactly the mistake this bot is for.
  },
};
