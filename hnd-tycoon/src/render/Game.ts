/**
 * The loop that joins the simulation to the screen. DESIGN.md §5.1, §21.4.
 *
 * **The sim never stops for the UI** and it never ties itself to the frame
 * rate. Ticks are fixed at 10 Hz of game time; frames happen whenever the
 * browser feels like it. Speed multiplies the number of ticks processed, never
 * the size of a tick — an accelerated simulation must be the same simulation.
 */
import { Application } from 'pixi.js';
import { BRAND } from '@/config/brand';
import { RENDER } from '@/config/render';
import { TIME } from '@/config/time';
import {
  acceptContract,
  buy,
  declineContract,
  canAfford,
  fire,
  fixIncident,
  priceOf,
  setMarketing,
  setPrice,
  setRoster,
  setSpecial,
  type ActionResult,
} from '@/sim/actions';
import { MARKETING_CHANNELS, PRICING, type MarketingChannel } from '@/config/marketing';
import { costPerCover, fairPriceBand, marketingEfficiency } from '@/sim/systems/demand';
import { fixCostDollars, specOf } from '@/sim/systems/incidents';
import { bankMessage, recoveryLine } from '@/sim/systems/recovery';
import { hourlyCost, JURISDICTIONS } from '@/config/economy';
import { starsOf } from '@/sim/systems/reputation';
import { ladderProgress, nextRungs, unlocked } from '@/sim/systems/ladder';
import { RUNGS_BY_ID } from '@/config/ladder';
import { availableSpecials } from '@/sim/systems/specials';
import { contractLine, progressOf } from '@/sim/systems/contracts';
import { CONTRACT_BY_ID } from '@/config/contracts';
import { SPECIAL_RULES } from '@/config/specials';
import { STATION_SPECS } from '@/config/stations';
import { DAY_NAMES } from '@/config/time';
import type { StationType } from '@/config/recipes';
import { SHOPFRONT, type CatalogueItem } from '@/config/catalogue';
import { buildScenario, type ScenarioOptions } from '@/sim/scenario';
import type { World } from '@/sim/world';
import { Scene } from './scene/Scene';
import { ShapeRegistry } from './shapes/ShapeRegistry';
import { camera, fitCamera } from './projection';

const TICK_SECONDS = 1 / TIME.TICK_HZ;

export class Game {
  readonly app = new Application();
  world: World;
  private scene!: Scene;
  private registry!: ShapeRegistry;
  private host: HTMLElement | null = null;
  private onResize: (() => void) | null = null;
  private accumulator = 0;
  private speed = 1;
  private running = true;

  constructor(options: ScenarioOptions) {
    this.world = buildScenario(options);
  }

  async start(canvasHost: HTMLElement): Promise<void> {
    this.host = canvasHost;
    const size = this.measure();
    Object.assign(camera, fitCamera(size.width, size.height, this.floorWidth, this.floorDepth));

    await this.app.init({
      width: size.width,
      height: size.height,
      background: BRAND.street.night,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, globalThis.devicePixelRatio || 1),
    });
    canvasHost.appendChild(this.app.canvas);

    this.registry = new ShapeRegistry(this.app.renderer);
    this.registry.bake();
    this.scene = new Scene(this.registry);
    this.app.stage.addChild(this.scene.root);

    // The room has to fit the phone, and phones change size when the browser
    // toolbar slides away or the device rotates.
    this.onResize = () => this.resize();
    globalThis.addEventListener?.('resize', this.onResize);
    globalThis.addEventListener?.('orientationchange', this.onResize);

    // Open on a day that is worth watching. Day 0 is a Sunday and trade starts
    // at 11:00; dropping the player into an empty room at 3am would be an
    // accurate simulation of nothing at all.
    this.world.runTicks(openingTicks(this.world));

    // A handle for `npm run look`, dev builds only.
    //
    // Two steps in a row have shipped a visual claim that could not be
    // screenshotted because the state it needs takes an hour of play to reach
    // — a contract offer wants 4.0 stars, which a fresh shop does not see in
    // forty seconds at 4x. Without this the choice is "assert it from the code
    // and hope", which is the exact habit D054 and D058 exist to break.
    // Narrowed inline rather than pulling `vite/client` into tsconfig — the sim
    // and the harness both typecheck without Vite's ambient types today, and
    // one debug handle is not a reason to change that.
    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV === true) {
      (globalThis as unknown as { __hnd?: Game }).__hnd = this;
    }

    this.app.ticker.add(() => {
      const dt = Math.min(this.app.ticker.deltaMS / 1000, RENDER.MAX_FRAME_SECONDS);
      if (this.running) this.step(dt);
      this.scene.render(this.world.state, dt, this.world.clock.now as number);
    });
  }

  private step(dt: number): void {
    this.accumulator += dt * this.speed;
    let guard = 0;
    while (this.accumulator >= TICK_SECONDS && guard++ < 240) {
      this.world.tick();
      this.accumulator -= TICK_SECONDS;
    }
  }

  /** Everything the shop sells, with live prices and whether you can have it. */
  shopfront(): { item: CatalogueItem; cents: number; affordable: boolean; owned: number }[] {
    const state = this.world.state;
    return SHOPFRONT.map((item) => ({
      item,
      cents: priceOf(state, item),
      affordable: canAfford(state, item),
      owned:
        item.kind === 'hire'
          ? state.staff.length
          : item.kind === 'machine'
            ? state.stations.filter((s) => s.machines.includes(item.machine)).length
            : state.stations.filter((s) => s.type === item.station).length,
    }));
  }

  buy(itemId: string): ActionResult {
    return buy(this.world.state, itemId);
  }

  /**
   * §15.1 and §15.2, for the HUD. The two next rungs, the day's verdict, and
   * which panels the player has actually earned.
   *
   * **This CONSUMES the pending unlock**, which is why it is not called
   * `ladder()`. A rung landing is a once-only event and the HUD polls at 4 Hz,
   * so leaving it in state would redraw the same banner every 250ms until the
   * next rung — a sticker, not a moment. A method that quietly empties a field
   * the caller did not mention is how that becomes somebody else's afternoon,
   * so the name says it.
   */
  takeLadder(): {
    headline: string;
    rungs: { label: string; unlocks: string }[];
    banked: string;
    unlockedNow: { label: string; unlocks: string } | null;
    panels: { roster: boolean; trade: boolean; parLevels: boolean };
  } {
    const state = this.world.state;
    const landed = state.justUnlocked === null ? null : RUNGS_BY_ID[state.justUnlocked];
    state.justUnlocked = null;
    return {
      headline: state.headline,
      rungs: nextRungs(state).map((r) => ({ label: r.label, unlocks: r.unlocks })),
      banked: ladderProgress(state),
      unlockedNow: landed ? { label: landed.label, unlocks: landed.unlocks } : null,
      panels: {
        roster: unlocked(state, 'panel', 'roster'),
        trade: unlocked(state, 'panel', 'trade'),
        parLevels: unlocked(state, 'panel', 'parLevels'),
      },
    };
  }

  /**
   * The shop's rating. §22.5 puts it in the top bar.
   *
   * **One number, and it is the one the economy uses.** `state.stars` is
   * recomputed at each day's close and is what `reputationMultiplier`,
   * `fairPriceMultiplier` and `marketingEfficiency` all read. Computing a
   * fresher one for the UI produced a panel that said "over the odds for 3.3
   * stars" while the action it triggered said "about what people expect" —
   * both correct, against different numbers, which is worse than either being
   * wrong. A rating that settles once a day is also closer to how one works.
   *
   * `channel` still resolves live, because a per-channel breakdown has no cache
   * and §6.5's whole point is that the day delivery lands this takes an
   * argument rather than a refactor.
   */
  stars(channel?: string): number {
    if (channel === undefined) return this.world.state.stars;
    return starsOf(this.world.state.reviews, this.world.clock.dayIndex, channel);
  }

  roster(): { id: string; name: string; roster: boolean[]; leaving: boolean; onToday: boolean }[] {
    return this.world.state.staff.map((s) => ({
      id: s.id,
      name: s.name,
      roster: [...s.roster],
      leaving: s.leavingOnDay !== null,
      onToday: this.world.state.workingToday.has(s.id),
    }));
  }

  /** What one person costs for a full shift on each day. §8's penalty rates. */
  dayCosts(): number[] {
    const site = this.world.state.site;
    const jurisdiction = JURISDICTIONS[site.jurisdictionId] ?? JURISDICTIONS['nsw'];
    if (!jurisdiction) return [];
    return [0, 1, 2, 3, 4, 5, 6].map(
      (d) => hourlyCost(jurisdiction, d as never).cents * site.tradingHoursPerDay,
    );
  }

  setRoster(staffId: string, day: number, on: boolean): ActionResult {
    return setRoster(this.world.state, staffId, day, on);
  }

  /**
   * Everything the pricing panel draws. §8.2 — the band is the whole point:
   * a price input with no reference is a number the player guesses at, and a
   * price input sitting next to "what a shop at your rating gets away with" is
   * a decision.
   */
  pricing(): {
    current: number;
    pending: number | null;
    band: { low: number; high: number };
    min: number;
    max: number;
    stars: number;
  } {
    const state = this.world.state;
    const stars = this.stars();
    return {
      current: state.priceMultiplier,
      pending: state.pendingPriceMultiplier,
      band: fairPriceBand(stars),
      min: PRICING.MIN_MULTIPLIER,
      max: PRICING.MAX_MULTIPLIER,
      stars,
    };
  }

  /**
   * Everything currently wrong, with what it costs to put right. §9.
   *
   * No countdown in this shape and there must never be one — the panel says
   * what is broken and what it costs, and the player deals with it when they
   * are ready. See `IncidentSystem`.
   */
  troubles(): {
    id: string;
    label: string;
    blurb: string;
    fixCents: number;
    /** 0..1 of its own ceiling. Drives how loud the row looks. */
    severity: number;
    fixable: boolean;
  }[] {
    return this.world.state.incidents.map((incident) => {
      const spec = specOf(incident);
      return {
        id: incident.id,
        label: spec.label,
        blurb: spec.blurb,
        fixCents: Math.round(fixCostDollars(incident) * 100),
        severity: spec.maxSeverity > 0 ? incident.severity / spec.maxSeverity : 0,
        fixable: spec.baseFixCost > 0,
      };
    });
  }

  fixIncident(incidentId: string): ActionResult {
    return fixIncident(this.world.state, incidentId);
  }

  /**
   * §10, for the HUD. The bank's tone and the Recovery Plan's next objective
   * are both mechanics rather than decoration: a tone is how the game says how
   * much trouble you are in without a screen that says you lost, and the
   * objective is §15's "the player can always see the next objective".
   */
  trouble(): { bank: string | null; recovery: string | null; inPlan: boolean } {
    return {
      bank: bankMessage(this.world.state),
      recovery: recoveryLine(this.world.state),
      inPlan: this.world.state.recovery !== null,
    };
  }

  setPrice(multiplier: number): ActionResult {
    return setPrice(this.world.state, multiplier);
  }

  /**
   * The marketing panel. §8.3 requires cost-per-cover to be ON it — the whole
   * trap is that the spend line looks identical whether it is working or not,
   * and this is the number that tells them apart.
   */
  marketing(): {
    channels: {
      channel: MarketingChannel;
      weekly: number;
      awareness: number;
    }[];
    efficiency: number;
    costPerCoverCents: number;
    awareness: number;
  } {
    const state = this.world.state;
    return {
      channels: MARKETING_CHANNELS.map((channel) => ({
        channel,
        weekly: state.marketingSpend[channel.id] ?? 0,
        awareness: state.channelAwareness[channel.id] ?? 0,
      })),
      efficiency: marketingEfficiency(this.stars()),
      costPerCoverCents: costPerCover(state, this.world.clock.daysPerWeek).cents,
      awareness: state.marketingAwareness,
    };
  }

  /**
   * The Monday choice. §18 — what draws people, what the kitchen can produce at
   * volume, what you can prep without eating the waste.
   *
   * All three sides are on the row rather than behind a tap, because the whole
   * mechanic is comparing them: the station it leans on IS the second question,
   * and hiding it behind a detail view turns a decision into a menu.
   */
  specials(): {
    running: string | null;
    pending: string | null;
    prepTarget: number;
    promoted: boolean;
    credibility: number;
    options: {
      id: string;
      label: string;
      blurb: string;
      dayName: string;
      station: string;
      prepUnits: number;
      unitCost: number;
      exclusive: boolean;
      uplift: number;
    }[];
    promoCost: number;
    promoUplift: number;
  } {
    const state = this.world.state;
    return {
      running: state.special.running,
      pending: state.special.pending,
      prepTarget: state.special.prepTarget,
      promoted: state.special.pendingPromo,
      credibility: state.special.credibility,
      options: availableSpecials(state).map((s) => ({
        id: s.id,
        label: s.label,
        blurb: s.blurb,
        dayName: DAY_NAMES[s.day] ?? '',
        station: STATION_SPECS[s.station as StationType]?.label ?? s.station,
        prepUnits: s.prepUnits,
        unitCost: s.unitCost,
        exclusive: s.exclusiveIngredient !== null,
        uplift: s.uplift,
      })),
      promoCost: SPECIAL_RULES.PROMO_WEEKLY_COST,
      promoUplift: SPECIAL_RULES.PROMO_UPLIFT,
    };
  }

  /**
   * §16, for the HUD. What is on the table, and what is on.
   *
   * The offer is a CARD the player answers rather than a badge on a panel they
   * might not open. §16's guarantee is that declining is free, and a guarantee
   * nobody is ever shown is not one they can use.
   */
  contracts(): {
    offer: { id: string; label: string; blurb: string; days: number; fee: number } | null;
    active: { line: string; progress: number } | null;
  } {
    const state = this.world.state;
    const offer = state.contractOffer ? CONTRACT_BY_ID[state.contractOffer.id] : undefined;
    const line = contractLine(state);
    return {
      offer: offer
        ? {
            id: offer.id,
            label: offer.label,
            blurb: offer.blurb,
            days: offer.days,
            fee: offer.feeDollars,
          }
        : null,
      active: line === null ? null : { line, progress: progressOf(state) },
    };
  }

  acceptContract(): ActionResult {
    return acceptContract(this.world.state);
  }

  declineContract(): ActionResult {
    return declineContract(this.world.state);
  }

  setSpecial(specialId: string | null, prepUnits: number, promote: boolean): ActionResult {
    return setSpecial(this.world.state, specialId, prepUnits, promote);
  }

  setMarketing(channelId: string, weeklyDollars: number): ActionResult {
    return setMarketing(this.world.state, channelId, weeklyDollars);
  }

  fire(staffId: string): ActionResult {
    return fire(this.world.state, staffId);
  }

  private get floorWidth(): number {
    return this.world.state.floor.width;
  }

  private get floorDepth(): number {
    return this.world.state.floor.depth;
  }

  private measure(): { width: number; height: number } {
    const width = Math.min(
      this.host?.clientWidth || RENDER.FRAME_WIDTH,
      RENDER.FRAME_WIDTH,
    );
    const height = Math.max(
      RENDER.MIN_FRAME_HEIGHT,
      Math.min(globalThis.innerHeight || RENDER.FRAME_HEIGHT, RENDER.FRAME_HEIGHT),
    );
    return { width: Math.round(width), height: Math.round(height) };
  }

  /** Re-fit and re-bake. Textures are sized to the tile, so both must change. */
  private resize(): void {
    const size = this.measure();
    if (size.width === this.app.renderer.width && size.height === this.app.renderer.height) return;
    Object.assign(camera, fitCamera(size.width, size.height, this.floorWidth, this.floorDepth));
    this.app.renderer.resize(size.width, size.height);
    this.scene.destroy();
    this.registry.destroy();
    this.registry = new ShapeRegistry(this.app.renderer);
    this.registry.bake();
    this.scene = new Scene(this.registry);
    this.app.stage.addChild(this.scene.root);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  destroy(): void {
    if (this.onResize) {
      globalThis.removeEventListener?.('resize', this.onResize);
      globalThis.removeEventListener?.('orientationchange', this.onResize);
    }
    this.app.ticker.stop();
    this.scene?.destroy();
    this.registry?.destroy();
    this.app.destroy(true);
  }
}

/** Ticks needed to reach opening time on the first trading day. */
function openingTicks(world: World): number {
  let ticks = 0;
  const limit = world.clock.ticksPerCycle * 2;
  while (!world.clock.isOpen && ticks < limit) {
    world.clock.advance();
    ticks++;
  }
  world.clock.restore(0);
  return ticks;
}
