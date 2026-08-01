/**
 * The things a player can actually do. DESIGN.md §12, §21.4.
 *
 * Intents in, state changes out. The UI never touches `SimState` directly —
 * it dispatches one of these, and everything that can go wrong comes back as a
 * `reason` in plain English rather than a silently ignored tap.
 *
 * **Placement is automatic here, and that is deliberate.** §12: *"No station
 * dragging in the live service view."* Renovate is a separate fullscreen mode
 * at step 19, with chunky handles and a live throughput delta before you
 * confirm. Until then a purchase goes to the best legal spot the building
 * allows, which is also the clearest possible demonstration of the constraint:
 * when there is nowhere for a second fryer to go, the game says so.
 */
import { CATALOGUE_BY_ID, ROSTER, type CatalogueItem } from '@/config/catalogue';
import { MARKETING_CHANNELS, PRICING } from '@/config/marketing';
import { STATION_SPECS } from '@/config/stations';
import { fairPriceBand, marketingEfficiency } from './systems/demand';
import type { StationType } from '@/config/recipes';
import { footprintOf, type Placement, type Tile } from './floor';
import { makeStation } from './entities/station';
import { makeStaff } from './entities/staff';
import { ECONOMY, hourlyCost, JURISDICTIONS } from '@/config/economy';
import { CALENDARS, DAY_NAMES, type DayOfWeek } from '@/config/time';
import { Cash, id, money, ZERO, type Money, type SiteId, type StaffId } from './types';
import { fixCostDollars, specOf } from './systems/incidents';
import type { SimState } from './state';

const NONE = 0;
const ONE = 1;


export interface ActionResult {
  readonly ok: boolean;
  /** Plain English. This string is shown to the player, so it has to be true. */
  readonly reason?: string;
  /** Set when the purchase put something on the floor, for the install beat. */
  readonly installedId?: string;
}

export function priceOf(state: SimState, item: CatalogueItem): number {
  if (item.kind === 'hire') return hireCost(state).cents;
  // Each additional copy of a station costs a little more: the easy spot is
  // already taken and the second one always needs more work.
  const owned = state.stations.filter((s) => s.type === item.station).length;
  return item.price.cents * (1 + owned * ECONOMY.DUPLICATE_PRICE_STEP);
}

export function canAfford(state: SimState, item: CatalogueItem): boolean {
  return state.ledger.cash.cents >= priceOf(state, item);
}

export function buy(state: SimState, itemId: string): ActionResult {
  const item = CATALOGUE_BY_ID[itemId];
  if (!item) return { ok: false, reason: `No such thing as a ${itemId}` };
  return item.kind === 'hire' ? hire(state) : install(state, item.station, item);
}

function hire(state: SimState): ActionResult {
  const cost = hireCost(state);
  if (state.ledger.cash.cents < cost.cents) {
    return { ok: false, reason: `A shift up front is ${Cash.format(cost)}. Not in the account.` };
  }

  const name = ROSTER[state.staff.length % ROSTER.length] ?? 'New starter';
  const staffId = id<StaffId>(`staff-${state.staff.length + ONE}`);

  // Through the front door, as §21.2 says: "staff arrive through the door on
  // their first shift, walk to their station". Spawning them on top of the
  // existing cook made eight hires look like one person.
  const door = state.floor.nearestWalkable(state.site.entryTile) ?? state.site.entryTile;
  // On NO days. Putting them on is the decision; inheriting a full week as a
  // default is what made a hire a fixed cost rather than a choice.
  const person = makeStaff(staffId, name, state.site.id as SiteId, ONE, door, EMPTY_ROSTER);
  // They walk in. §21.2 — the arrival IS the install beat for a person.
  person.arriving = true;
  state.staff.push(person);
  state.ledger.post('wages', cost);

  return {
    ok: true,
    reason: `${name} is on the books. Roster them for the days you need.`,
    installedId: staffId,
  };
}

const EMPTY_ROSTER: readonly boolean[] = [false, false, false, false, false, false, false];

/**
 * Put someone on, or take them off, a day of the week. Takes effect tomorrow —
 * rostering mid-rush would be a way to conjure a pair of hands out of nowhere
 * exactly when the queue is worst.
 */
export function setRoster(
  state: SimState,
  staffId: string,
  day: number,
  on: boolean,
): ActionResult {
  const staff = state.staff.find((s) => s.id === staffId);
  if (!staff) return { ok: false, reason: 'Nobody by that name.' };
  if (staff.leavingOnDay !== null) {
    return { ok: false, reason: `${staff.name} is working out their notice.` };
  }
  staff.roster[day] = on;
  return { ok: true, reason: `${staff.name}: ${DAY_NAMES[day] ?? day} ${on ? 'on' : 'off'}.` };
}

/**
 * Let someone go. §10 — recoverable and slow to fix, never instant and never
 * free. Two weeks' notice, paid, and they keep working it. If firing were
 * costless, over-hiring would carry no risk at all and the roster would stop
 * being a decision worth making carefully.
 */
export function fire(state: SimState, staffId: string): ActionResult {
  const staff = state.staff.find((s) => s.id === staffId);
  if (!staff) return { ok: false, reason: 'Nobody by that name.' };
  // Count who will still be here, not who is on the payroll today: two people
  // already working out their notice are not two people.
  const staying = state.staff.filter((s) => s.leavingOnDay === null).length;
  if (staying <= ONE) {
    return { ok: false, reason: 'Somebody has to open the shop.' };
  }
  if (staff.leavingOnDay !== null) {
    return { ok: false, reason: `${staff.name} is already on their way out.` };
  }
  const notice = Cash.scale(weeklyWage(state), ECONOMY.NOTICE_WEEKS);
  staff.leavingOnDay =
    state.dayIndex + ECONOMY.NOTICE_WEEKS * (CALENDARS[state.site.calendarId]?.daysPerWeek ?? NONE);
  state.ledger.post('wages', notice);
  return {
    ok: true,
    reason: `${staff.name} finishes up in a fortnight. ${Cash.format(notice)} in notice.`,
  };
}

/**
 * Put something right. §9.
 *
 * There is no deadline on this and there never will be. The player fixes it
 * when they next open the app, and the only thing the delay costs them is what
 * the fault did in the meantime — which is a price, not a punishment.
 *
 * It is allowed to overdraw the account. §10 puts the bank at the end of a
 * chain of consequences, not in front of a button: refusing the repair because
 * the balance is low would leave a shop that cannot fix its own fryer, which is
 * a fail state with a polite message.
 */
export function fixIncident(state: SimState, incidentId: string): ActionResult {
  const index = state.incidents.findIndex((i) => i.id === incidentId);
  const incident = state.incidents[index];
  if (!incident) return { ok: false, reason: 'Nothing by that name is broken.' };

  const spec = specOf(incident);
  if (spec.baseFixCost <= NONE) {
    return { ok: false, reason: `${spec.label}. Nothing to fix — it passes.` };
  }

  const cost = money(fixCostDollars(incident), state.ledger.cash.currency);
  state.ledger.post('overheads', cost);
  state.incidents.splice(index, ONE);
  return { ok: true, reason: `Sorted. ${Cash.format(cost)}.` };
}

/**
 * §8.2. Move the menu price, as a multiple of what the recipes list.
 *
 * **It lands tomorrow.** That delay is the design, not an implementation
 * convenience: if a price rise took effect instantly the player would ride it
 * up through the lunch rush and drop it before anyone noticed, which is not a
 * decision, it is a slider. Making it a decision means committing to it for a
 * day and finding out afterwards whether you were right.
 */
export function setPrice(state: SimState, multiplier: number): ActionResult {
  const clamped = Math.max(
    PRICING.MIN_MULTIPLIER,
    Math.min(PRICING.MAX_MULTIPLIER, multiplier),
  );
  if (clamped !== multiplier) {
    return {
      ok: false,
      reason: `Prices stay between ${asPercent(PRICING.MIN_MULTIPLIER)} and ${asPercent(PRICING.MAX_MULTIPLIER)} of the menu.`,
    };
  }
  state.pendingPriceMultiplier = clamped;
  const band = fairPriceBand(state.stars);
  const verdict =
    clamped > band.high
      ? 'Above what a shop at your rating gets away with.'
      : clamped < band.low
        ? 'Under the going rate. You will be busy and thin.'
        : 'About what people expect from you.';
  return { ok: true, reason: `${asPercent(clamped)} from tomorrow. ${verdict}` };
}

/**
 * §8.3. Commit a weekly spend to a channel. Billed with payroll, because "the
 * Sunday bill is labour plus marketing, two decisions arriving as one number".
 */
export function setMarketing(
  state: SimState,
  channelId: string,
  weeklyDollars: number,
): ActionResult {
  const channel = MARKETING_CHANNELS.find((c) => c.id === channelId);
  if (!channel) return { ok: false, reason: `No such channel: ${channelId}` };
  if (weeklyDollars < NONE) return { ok: false, reason: 'Cannot spend a negative amount.' };
  state.marketingSpend[channelId] = weeklyDollars;
  if (weeklyDollars === NONE) return { ok: true, reason: `${channel.label} off.` };
  // The honest warning, at the moment of the decision rather than in the P&L a
  // week later. §8.3 is explicit that a bad shop pays more per customer.
  const efficiency = marketingEfficiency(state.stars);
  const thin = efficiency < ONE;
  return {
    ok: true,
    reason: `${channel.label} at $${weeklyDollars}/wk.${thin ? ` At ${state.stars.toFixed(1)} stars you are paying about ${(ONE / efficiency).toFixed(1)}x per customer.` : ''}`,
  };
}

const PERCENT = 100;
const asPercent = (x: number): string => `${Math.round(x * PERCENT)}%`;

/** A full week of one person, at every day's own penalty rate. */
export function weeklyWage(state: SimState): Money {
  const jurisdiction = JURISDICTIONS[state.site.jurisdictionId] ?? JURISDICTIONS['nsw'];
  if (!jurisdiction) return ZERO();
  const daysPerWeek = CALENDARS[state.site.calendarId]?.daysPerWeek ?? NONE;
  let week = ZERO();
  for (let day = NONE; day < daysPerWeek; day += ONE) {
    week = Cash.add(
      week,
      Cash.scale(hourlyCost(jurisdiction, day as DayOfWeek), state.site.tradingHoursPerDay),
    );
  }
  return week;
}

/**
 * One shift up front. It was a full week before rostering existed, because a
 * hire WAS a permanent seven-day cost; now the roster prices the days and this
 * only has to make the decision cost something at the moment you make it.
 */
export function hireCost(state: SimState): Money {
  const daysPerWeek = CALENDARS[state.site.calendarId]?.daysPerWeek ?? ONE;
  return Cash.scale(weeklyWage(state), ONE / Math.max(ONE, daysPerWeek));
}

function install(state: SimState, type: StationType, item: CatalogueItem): ActionResult {
  const cost = priceOf(state, item);
  if (state.ledger.cash.cents < cost) {
    return { ok: false, reason: 'Not enough in the account.' };
  }

  const spot = bestSpotFor(state, type);
  if (!spot) {
    // The most important failure message in the game. It is not "invalid" —
    // it is the building telling the player what its constraint is.
    const spec = STATION_SPECS[type];
    const needs = spec.requires.length
      ? `needs ${spec.requires.join(' and ')}, and every tile with that is taken`
      : `needs ${spec.width}x${spec.depth} tiles clear and there is nowhere`;
    return { ok: false, reason: `Nowhere to put it — ${spec.label.toLowerCase()} ${needs}.` };
  }

  const stationId = `${type}-${state.stations.filter((s) => s.type === type).length + ONE}`;
  state.floor.place(stationId, type, spot);
  state.stations.push(makeStation(stationId, type, ONE));
  state.ledger.post('capex', { cents: Math.round(cost), currency: state.ledger.cash.currency });
  if (type === 'drinks') state.holdingCabinets += ONE;

  return { ok: true, reason: `${item.label} is in.`, installedId: stationId };
}

/**
 * Where a new station goes: the legal spot closest to the work it feeds.
 *
 * "Closest to the pass" would be wrong — a second fryer wants to be near
 * assembly, not near the customer. Scoring against the stations that consume
 * this one's output is what makes an automatically-placed kitchen still look
 * like a kitchen.
 */
export function bestSpotFor(state: SimState, type: StationType): Placement | null {
  const floor = state.floor;
  const anchors = anchorsFor(state, type);
  // Nobody gets built over. See Floor.canPlace.
  const standing = state.staff.map((s) => s.tile);
  let best: { at: Placement; score: number } | null = null;

  for (let y = NONE; y < floor.depth; y += ONE) {
    for (let x = NONE; x < floor.width; x += ONE) {
      for (const rotated of [false, true]) {
        const at: Placement = { x, y, rotated };
        if (!floor.canPlace(type, at, undefined, standing).ok) continue;

        const tiles = footprintOf(type, at);
        const centre = tiles[Math.floor(tiles.length / 2)] as Tile;
        let score = NONE;
        for (const anchor of anchors) score += distanceTo(state, anchor, centre);
        // Fewer anchors means an arbitrary tiebreak; keep it deterministic.
        score = anchors.length ? score / anchors.length : centre.y;
        if (best === null || score < best.score) best = { at, score };
      }
    }
  }

  return best?.at ?? null;
}

/** The stations that will consume this one's output. */
function anchorsFor(state: SimState, type: StationType): string[] {
  const consumers = new Set<StationType>();
  for (const graph of state.graphs.values()) {
    for (const step of graph.steps.values()) {
      if (step.station !== type) continue;
      const consumer = graph.consumerOf.get(step.output);
      if (consumer) consumers.add(consumer.station);
    }
  }
  return state.stations.filter((s) => consumers.has(s.type)).map((s) => s.id);
}

function distanceTo(state: SimState, stationId: string, tile: Tile): number {
  let best = Infinity;
  for (const access of state.floor.accessTiles(stationId)) {
    best = Math.min(best, state.floor.pathTiles(access, tile));
  }
  return Number.isFinite(best) ? best : state.floor.width + state.floor.depth;
}
