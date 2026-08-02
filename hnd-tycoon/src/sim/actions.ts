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
import { MACHINE_BY_ID, MACHINE_RULES } from '@/config/machines';
import { unlocked } from './systems/ladder';
import { availableSpecials, surplusCost } from './systems/specials';
import { SPECIAL_BY_ID, SPECIAL_RULES } from '@/config/specials';
import { RUNGS, type Rung } from '@/config/ladder';
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
  // Machines are priced by their spec and do not get the duplicate step: §14.5
  // allows one per station, so there is no second one to charge more for.
  if (item.kind === 'machine') return item.price.cents;
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
  // §15.1 and §14.5: the ladder is the gate, not the bank balance. A rung opens
  // a capability, which is why a rung never pays cash — the reward IS this.
  const gateKind = item.kind === 'machine' ? 'machine' : 'catalogue';
  const gateId = item.kind === 'machine' ? item.machine : item.id;
  // The SITE requirement wins when both apply. See `siteGate`.
  const sited = item.kind === 'machine' ? siteGate(item.machine) : null;
  if (sited) return sited;
  if (!unlocked(state, gateKind, gateId)) {
    const rung = rungGating(gateKind, gateId);
    return {
      ok: false,
      reason: rung ? `Not yet — ${rung.label.toLowerCase()} first.` : 'Not yet.',
    };
  }
  if (item.kind === 'hire') return hire(state);
  if (item.kind === 'machine') return buyMachine(state, item.machine);
  return install(state, item.station, item);
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

/** Which rung opens this, so the refusal can name it. */
function rungGating(kind: string, id: string): Rung | undefined {
  return RUNGS.find((r) => r.reward.kind === kind && r.reward.id === id);
}

/**
 * §15.1's panel gate, enforced in the SIM rather than by hiding a button.
 *
 * A HUD that hides the roster while `setRoster` still works is not a gate, it
 * is a curtain: the harness walks straight past it and the balance numbers are
 * measured against a game nobody plays. So the refusal lives here, where the
 * bots hit it too, and the button disappearing is the consequence rather than
 * the mechanism.
 */
function panelGate(state: SimState, panel: 'roster' | 'trade' | 'parLevels'): ActionResult | null {
  if (unlocked(state, 'panel', panel)) return null;
  const rung = rungGating('panel', panel);
  return { ok: false, reason: rung ? `Not yet — ${rung.label.toLowerCase()} first.` : 'Not yet.' };
}

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
  const gate = panelGate(state, 'roster');
  if (gate) return gate;
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
 * Fit a machine to a station. §14.2.
 *
 * It needs a station of the right type to bolt onto AND floor of its own, which
 * is §14.3's floor-space cost made real rather than asserted. The refusal
 * messages are the interesting part: "you have no fryer" and "there is nowhere
 * to put it" are two different problems and the player has to be told which.
 */
/**
 * §14.5's venue-count gate. Act I is one site, so tier 5 is visible and locked
 * rather than absent — §15 wants the next rung on screen, not hidden.
 *
 * Checked BEFORE the ladder gate in `buy`, because §14.5 names both gates and
 * the site one is the more specific answer: "for an operation with two shops"
 * tells the player what the business has to become, where the rung label only
 * repeats it back through the ladder.
 */
function siteGate(machineId: string): ActionResult | null {
  const spec = MACHINE_BY_ID[machineId];
  const sites = ONE;
  if (!spec || (spec.requiresSites ?? ONE) <= sites) return null;
  return {
    ok: false,
    reason: `${spec.label} is for an operation with ${spec.requiresSites} shops. Not yet.`,
  };
}

export function buyMachine(state: SimState, machineId: string): ActionResult {
  const spec = MACHINE_BY_ID[machineId];
  if (!spec) return { ok: false, reason: `No such thing as a ${machineId}` };

  const sited = siteGate(machineId);
  if (sited) return sited;

  const hosts = state.stations.filter((s) => s.type === spec.station);
  if (hosts.length === NONE) {
    const label = STATION_SPECS[spec.station].label.toLowerCase();
    return { ok: false, reason: `${spec.label} bolts onto a ${label}. You have not got one.` };
  }
  // §14.5: never remove the last decision at a station. One of each per host.
  const host = MACHINE_RULES.ONE_PER_STATION
    ? hosts.find((s) => !s.machines.includes(machineId))
    : hosts[NONE];
  if (!host) {
    return { ok: false, reason: `Every ${STATION_SPECS[spec.station].label.toLowerCase()} already has one.` };
  }
  if (state.ledger.cash.cents < spec.price.cents) {
    return { ok: false, reason: `${Cash.format(spec.price)}. Not in the account.` };
  }

  /**
   * **Only the tiles beyond the host's own footprint come out of the room.**
   *
   * A clamshell replaces a flat-top, an auto-lift fryer replaces a fryer, and a
   * bench-top sauce rail sits on the bench. Charging each of them for its whole
   * size was measured and it was ruinous — see the note on `width` in
   * config/machines.ts.
   *
   * What is left over is taken as a strip beside the host, which is what a
   * conveyor toaster hanging off the end of a bench or a 2x2 robot cabinet
   * where a 1x1 fryer used to be actually looks like.
   */
  const fittingId = `${machineId}@${host.id}`;
  const hostPlacement = state.floor.placementOf(host.id);
  const hostTiles = hostPlacement
    ? footprintOf(host.type, hostPlacement.at).length
    : NONE;
  const tiles = spec.width * spec.depth;
  const extra =
    spec.benchTop === true
      ? NONE
      : spec.standalone === true
        ? tiles
        : tiles - hostTiles;

  if (extra > NONE) {
    const spot = bestSpotForFootprint(state, extra, ONE, host.id);
    if (!spot) {
      return {
        ok: false,
        reason: `Nowhere to put it — ${spec.label.toLowerCase()} needs ${extra} more tile${extra === ONE ? '' : 's'} beside the ${STATION_SPECS[spec.station].label.toLowerCase()}.`,
      };
    }
    // Rotation has to be applied HERE as well as in the search, or a strip
    // found legal at 1xN reserves Nx1 somewhere it does not fit.
    const w = spot.rotated === true ? ONE : extra;
    const d = spot.rotated === true ? extra : ONE;
    state.floor.reserve(fittingId, spot, w, d);
  }
  host.machines.push(machineId);
  host.machineHours[machineId] = NONE;
  state.ledger.post('capex', spec.price);

  return { ok: true, reason: `${spec.label} is in.`, installedId: fittingId };
}

/**
 * §14.4. Stop paying for maintenance, or start again.
 *
 * Skipping is a legitimate move in a cash crunch and the game should not scold
 * anyone for it — it is expensive later, which is the whole of the decision.
 */
export function setMaintenance(state: SimState, on: boolean): ActionResult {
  state.maintaining = on;
  return {
    ok: true,
    reason: on
      ? 'Servicing back on. Things will break less.'
      : 'Servicing paused. It will save money now and cost more later.',
  };
}

/**
 * Would reserving these tiles leave every station still workable and still
 * reachable from every other?
 *
 * Tries it and undoes it. A dry-run beats a hand-written adjacency argument,
 * because the thing that goes wrong is never the case you thought about.
 */
function leavesShopWorkable(
  state: SimState,
  at: Tile,
  width: number,
  depth: number,
): boolean {
  const floor = state.floor;
  const PROBE = '__probe__';
  floor.reserve(PROBE, at, width, depth);
  try {
    for (const station of state.stations) {
      // Somewhere to stand and work.
      if (floor.accessTiles(station.id).length === NONE) return false;
    }
    // And the line still joins up: a machine that cuts the room in two leaves
    // two half-kitchens that cannot hand food to each other.
    for (const a of state.stations) {
      for (const b of state.stations) {
        if (!Number.isFinite(floor.betweenStations(a.id, b.id))) return false;
      }
    }
    // Nobody currently standing on the floor is sealed off from the pass.
    for (const staff of state.staff) {
      if (!floor.isWalkable(staff.tile.x, staff.tile.y)) return false;
    }
    return true;
  } finally {
    floor.release(PROBE);
  }
}

/**
 * Where a machine goes: **as close as possible to the station it bolts onto.**
 *
 * The first cut returned the first legal tile scanning from the origin, which
 * is the doorway. Measured: a conveyor bun toaster landed at (1,0), fourteen
 * tiles from the toaster it is attached to, in the front row where the queue
 * comes in. That is nonsense to look at and it was expensive — every machine
 * narrowed the walkable strip by the door, and the kiosk alone cost $11,299
 * over ninety days, more than the thing costs to buy.
 *
 * Scored rather than first-found, exactly like `bestSpotFor` does for stations.
 */
function bestSpotForFootprint(
  state: SimState,
  width: number,
  depth: number,
  hostId: string,
): Placement | null {
  const floor = state.floor;
  const standing = state.staff.map((s) => s.tile);
  const anchors = floor.accessTiles(hostId);
  let best: { at: Placement; score: number } | null = null;

  for (let y = NONE; y < floor.depth; y += ONE) {
    for (let x = NONE; x < floor.width; x += ONE) {
      for (const rotated of [false, true]) {
        const w = rotated ? depth : width;
        const d = rotated ? width : depth;
        if (!floor.fits({ x, y }, w, d, standing)) continue;
        // **And it must not wall in something that already exists.**
        //
        // `fits` only asks whether the tiles are free. Measured: a conveyor bun
        // toaster took the last access tile of the toaster it was bolted to,
        // and the station became unworkable — covers fell from 10,595 to 116
        // over ninety days and staff-hours went UP, because the kitchen spent
        // the day unable to make a bun. This is the same class as the audit
        // finding where a purchase stranded a staffer, and it needs the same
        // kind of check: simulate the placement, confirm the shop still works,
        // put it back.
        if (!leavesShopWorkable(state, { x, y }, w, d)) continue;
        let score = NONE;
        for (const anchor of anchors) {
          score += Math.abs(anchor.x - x) + Math.abs(anchor.y - y);
        }
        score = anchors.length ? score / anchors.length : y;
        if (best === null || score < best.score) best = { at: { x, y, rotated }, score };
      }
    }
  }
  return best?.at ?? null;
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
  const gate = panelGate(state, 'trade');
  if (gate) return gate;
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
  const gate = panelGate(state, 'trade');
  if (gate) return gate;
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
/**
 * Pick next week's special, and say how much to prep. §18.
 *
 * One action for both, because they are one decision: *"what draws people,
 * what your kitchen can produce at volume, what you can prep without eating
 * the waste."* Splitting them would let a player choose the brisket and then
 * think about the prep on Thursday, which is precisely the thinking §18 wants
 * to happen on Monday.
 *
 * Lands next Monday. Same shape as §8.2's price change and for the same
 * reason: catching a rush you can already see is not a decision.
 */
export function setSpecial(
  state: SimState,
  specialId: string | null,
  prepUnits: number,
  promote = false,
): ActionResult {
  state.special.pendingPromo = promote && specialId !== null;
  if (specialId === null) {
    state.special.pending = null;
    state.special.prepTarget = NONE;
    return { ok: true, reason: 'No special next week. Nothing to bin, nothing to draw them in.' };
  }
  const spec = SPECIAL_BY_ID[specialId];
  if (!spec) return { ok: false, reason: `No such special: ${specialId}` };
  if (!availableSpecials(state).some((s) => s.id === specialId)) {
    return { ok: false, reason: `${spec.label} is not on the board yet.` };
  }
  if (prepUnits < NONE) return { ok: false, reason: 'Cannot prep a negative number of anything.' };

  state.special.pending = specialId;
  state.special.prepTarget = Math.round(prepUnits);

  // The honest warning at the moment of the decision, the same as §8.3's
  // cost-per-cover. Under half the promise and it will not open at all.
  const floor = Math.ceil(spec.prepUnits * SPECIAL_RULES.MIN_READY_FRACTION);
  if (state.special.prepTarget < floor) {
    return {
      ok: true,
      reason: `${spec.label} from Monday. ${state.special.prepTarget} is under the ${floor} it needs to open at all — you will draw the crowd and turn them away.`,
    };
  }
  const over = state.special.prepTarget - spec.prepUnits;
  if (over > NONE) {
    const waste = surplusCost(spec, over);
    return {
      ok: true,
      reason: `${spec.label} from Monday, ${state.special.prepTarget} prepped. ${over} more than it will sell — about ${Cash.format(money(waste, state.ledger.cash.currency))} in the bin.`,
    };
  }
  return { ok: true, reason: `${spec.label} from Monday, ${state.special.prepTarget} prepped.` };
}

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
