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
import { ECONOMY } from '@/config/economy';
import { STATION_SPECS } from '@/config/stations';
import type { StationType } from '@/config/recipes';
import { footprintOf, type Placement, type Tile } from './floor';
import { makeStation } from './entities/station';
import { makeStaff } from './entities/staff';
import { hourlyCost, JURISDICTIONS } from '@/config/economy';
import { CALENDARS, type DayOfWeek } from '@/config/time';
import { Cash, id, ZERO, type Money, type SiteId, type StaffId } from './types';
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
    return { ok: false, reason: `A week up front is ${Cash.format(cost)}. Not in the account.` };
  }

  const name = ROSTER[state.staff.length % ROSTER.length] ?? 'New starter';
  const staffId = id<StaffId>(`staff-${state.staff.length + ONE}`);

  // Through the front door, as §21.2 says: "staff arrive through the door on
  // their first shift, walk to their station". Spawning them on top of the
  // existing cook made eight hires look like one person.
  const door = state.floor.nearestWalkable(state.site.entryTile) ?? state.site.entryTile;
  state.staff.push(makeStaff(staffId, name, state.site.id as SiteId, ONE, door));
  state.ledger.post('wages', cost);

  return { ok: true, reason: `${name} starts today.`, installedId: staffId };
}

/**
 * A week's wages up front. Hiring was free, unlimited and instantly
 * unrecoverable — eight taps put a shop $156k down over 60 days with no fire
 * action to undo it. A real cost at the moment of decision is the cheapest way
 * to teach that labour is the biggest line in the business.
 */
export function hireCost(state: SimState): Money {
  const jurisdiction = JURISDICTIONS[state.site.jurisdictionId] ?? JURISDICTIONS['nsw'];
  if (!jurisdiction) return ZERO();
  let week = ZERO();
  const daysPerWeek = CALENDARS[state.site.calendarId]?.daysPerWeek ?? NONE;
  for (let day = NONE; day < daysPerWeek; day += ONE) {
    week = Cash.add(
      week,
      Cash.scale(hourlyCost(jurisdiction, day as DayOfWeek), state.site.tradingHoursPerDay),
    );
  }
  return week;
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
