/**
 * The shop, on screen. DESIGN.md §12, §21, §22.2, §22.3.
 *
 * Density stage 0 (§21.1): one staffer, one grill, two or three customers, one
 * heat source, one steam wisp. **Almost sleepy — you can follow a single patty
 * end to end.** That is the target and it is deliberately underwhelming,
 * because it is the floor the whole escalation curve is measured from.
 *
 * The four things a stranger should be able to describe after thirty seconds,
 * without being told any of them:
 *
 *   1. People are queueing outside a shop at the bottom of the screen.
 *   2. One person inside is walking between benches doing things.
 *   3. Food changes colour while it cooks, and then it moves.
 *   4. When it reaches the counter, someone at the front leaves happy.
 *
 * Everything here serves those four readings. Anything that does not is
 * decoration and can be cut.
 */
import { Container, Sprite } from 'pixi.js';
import { RENDER } from '@/config/render';
import { STATION_SPECS } from '@/config/stations';
import { footprintOf } from '@/sim/floor';
import { attentionSplit } from '@/sim/systems/kitchen';
import type { SimState } from '@/sim/state';
import type { Job } from '@/sim/entities/station';
import { depthSort, toScreen, toScreenCorner } from '../projection';
import { ShapeRegistry, SpritePool } from '../shapes/ShapeRegistry';
import { foodColour } from '../palette';

interface Steam {
  x: number;
  y: number;
  life: number;
  drift: number;
}

export class Scene {
  readonly root = new Container();

  private readonly floorLayer = new Container();
  private readonly fixedLayer = new Container();
  private readonly actorLayer = new Container();
  private readonly fxLayer = new Container();

  private readonly stationSprites = new Map<string, Sprite>();
  private staffPool!: SpritePool;
  private customerPool!: SpritePool;
  private customerAltPool!: SpritePool;
  private foodPool!: SpritePool;
  private steamPool!: SpritePool;
  private pilotPool!: SpritePool;

  /** Station id -> seconds since it was installed. Drives the install beat. */
  private readonly installing = new Map<string, number>();
  private readonly steam: Steam[] = [];
  private steamCarry = 0;
  private elapsed = 0;
  private built = false;

  constructor(private readonly registry: ShapeRegistry) {
    this.root.addChild(this.floorLayer, this.fixedLayer, this.actorLayer, this.fxLayer);
    // Draw order within the actor layer is by how far down the screen you are,
    // or a cook standing in front of the grill vanishes into it.
    this.actorLayer.sortableChildren = true;
    this.fixedLayer.sortableChildren = true;
  }

  /** The parts that never move: floor, services, stations. Built once. */
  build(state: SimState): void {
    if (this.built) return;
    this.built = true;

    const floor = state.floor;

    // The street, below the door. The shop is a warm box in a cold city and
    // the light spilling out is literally where the customers come from.
    for (let x = -1; x <= floor.width; x++) {
      for (let s = 1; s <= RENDER.STREET_ROWS; s++) {
        const sprite = this.registry.sprite('street');
        const at = toScreenCorner(x, -s);
        sprite.position.set(at.x, at.y);
        this.floorLayer.addChild(sprite);
      }
    }

    for (let y = 0; y < floor.depth; y++) {
      for (let x = 0; x < floor.width; x++) {
        if (floor.isObstructed(x, y)) continue;
        const sprite = this.registry.sprite((x + y) % 2 === 0 ? 'floor' : 'floorAlt');
        const at = toScreenCorner(x, y);
        sprite.position.set(at.x, at.y);
        this.floorLayer.addChild(sprite);
      }
    }

    // Service points drawn into the floor. The player should be able to see
    // why the grill is against the back wall before anyone explains it.
    for (const tiles of Object.values(state.site.servicePoints)) {
      for (const t of tiles) {
        const sprite = this.registry.sprite('service');
        const at = toScreenCorner(t.x, t.y);
        sprite.position.set(at.x, at.y);
        this.floorLayer.addChild(sprite);
      }
    }

    for (const o of state.site.obstructions) {
      const sprite = this.registry.sprite('column');
      const at = toScreenCorner(o.x, o.y);
      sprite.position.set(at.x, at.y);
      sprite.zIndex = depthSort(o.y);
      this.fixedLayer.addChild(sprite);
    }


    // The back wall, and the extraction hood over the gas run. The hood is the
    // most explanatory object on screen: it hangs where the grill has to live.
    const gasTiles = new Set(state.site.servicePoints.extraction.map((t) => t.x));
    for (let x = 0; x < floor.width; x++) {
      const wall = this.registry.sprite('wall');
      const top = toScreenCorner(x, floor.depth - 1);
      wall.position.set(top.x, top.y - RENDER.WALL.height);
      this.floorLayer.addChild(wall);
      if (gasTiles.has(x)) {
        const hood = this.registry.sprite('hood');
        hood.position.set(top.x, top.y - RENDER.WALL.hoodDrop - 6);
        hood.zIndex = -1000;
        this.fixedLayer.addChild(hood);
      }
    }

    // The warm wash. Baked soft — a hard-edged ellipse reads as a bug.
    const glow = this.registry.sprite('glow');
    glow.anchor.set(0.5);
    const centre = toScreen(floor.width / 2 - 0.5, 4);
    glow.position.set(centre.x, centre.y);
    glow.blendMode = 'add';
    this.floorLayer.addChild(glow);

    this.staffPool = new SpritePool(this.registry, 'staff', this.actorLayer);
    this.customerPool = new SpritePool(this.registry, 'customer', this.actorLayer);
    this.customerAltPool = new SpritePool(this.registry, 'customerAlt', this.actorLayer);
    this.foodPool = new SpritePool(this.registry, 'food', this.actorLayer);
    this.steamPool = new SpritePool(this.registry, 'steam', this.fxLayer);
    this.pilotPool = new SpritePool(this.registry, 'pilot', this.fxLayer);
  }

  /**
   * Anything bought mid-service appears here. §21.2: **no purchasable item
   * ships without a distinct on-screen presence.** The install beat is the
   * purchase's payoff moment — it drops in with weight, shakes, and settles.
   */
  private reconcileStations(state: SimState, dt: number): void {
    for (const station of state.stations) {
      if (!this.stationSprites.has(station.id)) {
        const placement = state.floor.placementOf(station.id);
        if (!placement) continue;
        const rotated = placement.at.rotated === true;
        const sprite = this.registry.sprite(this.registry.stationKey(station.type, rotated));
        const spec = STATION_SPECS[station.type];
        const depth = rotated ? spec.width : spec.depth;
        const at = toScreenCorner(placement.at.x, placement.at.y + depth - 1);
        sprite.position.set(at.x, at.y);
        sprite.zIndex = depthSort(placement.at.y);
        this.fixedLayer.addChild(sprite);
        this.stationSprites.set(station.id, sprite);
        // Only animate things that arrive after opening. The kitchen you
        // started with did not fall out of the sky.
        if (this.built) this.installing.set(station.id, 0);
      }
    }

    for (const [id, age] of [...this.installing]) {
      const sprite = this.stationSprites.get(id);
      const placement = state.floor.placementOf(id);
      if (!sprite || !placement) {
        this.installing.delete(id);
        continue;
      }
      const t = age / RENDER.INSTALL.seconds;
      if (t >= 1) {
        sprite.y = Math.round(sprite.y);
        sprite.alpha = 1;
        this.installing.delete(id);
        continue;
      }
      const spec = STATION_SPECS[placement.type];
      const rotated = placement.at.rotated === true;
      const depth = rotated ? spec.width : spec.depth;
      const rest = toScreenCorner(placement.at.x, placement.at.y + depth - 1).y;
      if (t < RENDER.INSTALL.dropFraction) {
        // Falls in from above with weight.
        const k = t / RENDER.INSTALL.dropFraction;
        sprite.y = rest - RENDER.INSTALL.dropPixels * (1 - k * k);
        sprite.alpha = k;
      } else {
        // Two pixels of shake, settling. Cheap, and it is the whole payoff.
        const k = (t - RENDER.INSTALL.dropFraction) / (1 - RENDER.INSTALL.dropFraction);
        const decay = 1 - k;
        sprite.y =
          rest + Math.sin(k * Math.PI * RENDER.INSTALL.shakeCycles) * RENDER.INSTALL.shakePixels * decay;
        sprite.alpha = 1;
      }
      this.installing.set(id, age + dt);
    }
  }

  /** One frame. `dt` is real seconds since the last one. */
  render(state: SimState, dt: number): void {
    this.build(state);
    this.reconcileStations(state, dt);
    this.elapsed += dt;

    this.staffPool.begin();
    this.customerPool.begin();
    this.customerAltPool.begin();
    this.foodPool.begin();
    this.steamPool.begin();
    this.pilotPool.begin();

    this.drawStations(state);
    this.drawFood(state);
    this.drawStaff(state);
    this.drawQueue(state);
    this.drawSteam(state, dt);

    this.staffPool.end();
    this.customerPool.end();
    this.customerAltPool.end();
    this.foodPool.end();
    this.steamPool.end();
    this.pilotPool.end();
  }

  /**
   * Idle and working signatures. §21.2 — equipment should feel ON even when
   * unused, so a fitted-out kitchen looks fitted-out at rest.
   */
  private drawStations(state: SimState): void {
    for (const station of state.stations) {
      const sprite = this.stationSprites.get(station.id);
      const placement = state.floor.placementOf(station.id);
      if (!sprite || !placement) continue;

      const spec = STATION_SPECS[station.type];
      if (spec.requires.length === 0) continue;

      // A pilot light on anything that burns gas, breathing slowly when idle
      // and steady-bright when the station is working.
      const working = station.jobId !== null;
      const pilot = this.pilotPool.take();
      const tiles = footprintOf(station.type, placement.at);
      const front = tiles[0] ?? { x: placement.at.x, y: placement.at.y };
      const at = toScreen(front.x, front.y);
      pilot.position.set(at.x - 4, at.y + RENDER.TILE_DEPTH * 0.5);
      pilot.alpha = working ? 1 : 0.45 + 0.25 * Math.sin(this.elapsed * 1.4);
    }
  }

  /**
   * Food, on the station that is cooking it, coloured by how far through it
   * is. This is the thing a stranger is supposed to notice: it changes colour,
   * and then it moves.
   */
  private drawFood(state: SimState): void {
    for (const job of state.jobs.values()) {
      const placement = state.floor.placementOf(job.stationId);
      if (!placement) continue;
      const step = state.graphs.get(job.recipeId)?.steps.get(job.stepId);
      if (!step) continue;

      const split = attentionSplit(step);
      if (split.cook <= 0 && job.phase !== 'finish') {
        // Nothing visibly cooks at an assembly bench. Draw the item only once
        // it exists, being carried.
        if (job.phase !== 'carry') continue;
      }

      const progress =
        split.cook > 0 ? 1 - job.cookRemaining / split.cook : job.phase === 'carry' ? 1 : 0;

      const where = job.phase === 'carry' ? this.carrierPosition(state, job) : null;
      const at = where ?? this.stationPosition(placement.at, step.station);
      if (!at) continue;

      // A batch of four patties is four things on the grill, not one. The
      // batching-versus-freshness tension is meant to be visible.
      const shown = Math.min(job.batch, 4);
      for (let i = 0; i < shown; i++) {
        const sprite = this.foodPool.take();
        sprite.anchor.set(0.5);
        const spread = (i - (shown - 1) / 2) * 9;
        sprite.position.set(at.x + spread, at.y - 4);
        sprite.tint = foodColour(progress, job.quality);
        sprite.scale.set(job.phase === 'carry' ? 0.7 : 0.9);
        sprite.zIndex = depthSort(placement.at.y) + 1;
      }
    }
  }

  private stationPosition(
    at: { x: number; y: number; rotated?: boolean },
    type: string,
  ): { x: number; y: number } | null {
    const spec = STATION_SPECS[type as keyof typeof STATION_SPECS];
    if (!spec) return null;
    const rotated = at.rotated === true;
    const w = rotated ? spec.depth : spec.width;
    const d = rotated ? spec.width : spec.depth;
    return toScreen(at.x + (w - 1) / 2, at.y + (d - 1) / 2);
  }

  private carrierPosition(state: SimState, job: Job): { x: number; y: number } | null {
    if (job.staffId === null) return null;
    const staff = state.staff.find((s) => s.id === job.staffId);
    if (!staff) return null;
    return toScreen(staff.x, staff.y);
  }

  /**
   * People. §21.5 — human motion is irregular and that irregularity is doing
   * more visual work than anything else on screen. The bob is deliberately
   * exaggerated, and the per-person phase offset means two cooks never walk in
   * step, which is what will make the machines look mechanical at step 13.
   */
  private drawStaff(state: SimState): void {
    state.staff.forEach((staff, index) => {
      const sprite = this.staffPool.take();
      sprite.anchor.set(0.5, 1);
      const at = toScreen(staff.x, staff.y);

      const job = staff.jobId === null ? null : state.jobs.get(staff.jobId);
      const walking = job?.phase === 'travel' || job?.phase === 'recall' || job?.phase === 'carry';
      const phase = index * 1.7;
      const bob = walking
        ? Math.abs(Math.sin((this.elapsed + phase) * Math.PI * RENDER.MOTION.bobHz)) *
          RENDER.MOTION.bobPixels
        : Math.sin((this.elapsed + phase) * 0.8) * 0.4;

      sprite.position.set(at.x, at.y + RENDER.TILE_DEPTH * 0.4 - bob);
      sprite.zIndex = depthSort(staff.y);
    });
  }

  /**
   * The queue. Customers flow UP the screen from the street (§12), so the head
   * of the queue is at the door and the tail runs down toward the kerb. That
   * ordering matters: it is how a stranger reads which way things are going.
   */
  private drawQueue(state: SimState): void {
    const waiting = [...state.customers.values()].filter((c) => c.state === 'waiting');
    const entry = state.site.entryTile;
    const shown = Math.min(waiting.length, RENDER.QUEUE.maxVisible);

    for (let i = 0; i < shown; i++) {
      const customer = waiting[i];
      if (!customer) continue;
      // Alternate silhouettes so a queue is a crowd, not a barcode.
      const pool = i % 2 === 0 ? this.customerPool : this.customerAltPool;
      const sprite = pool.take();
      sprite.anchor.set(0.5, 1);

      const row = Math.floor(i / 3);
      const col = (i % 3) - 1;
      const at = toScreen(entry.x + col * 0.9, entry.y - 1.3 - row * 0.8);
      // A tiny per-customer sway. People waiting are never quite still.
      const sway = Math.sin((this.elapsed + i * 2.1) * 0.9) * 1.2;
      sprite.position.set(at.x + sway, at.y);
      sprite.zIndex = depthSort(entry.y - row) + 5;
      sprite.alpha = i < RENDER.QUEUE.maxVisible - 2 ? 1 : 0.5;
    }
  }

  /**
   * Steam. One wisp at stage 0 — the spec is explicit that day one has exactly
   * one heat source and one steam wisp, and that it should be almost sleepy.
   * Spawn rate is per active cooking station, so density arrives by itself.
   */
  private drawSteam(state: SimState, dt: number): void {
    const sources: { x: number; y: number }[] = [];
    for (const job of state.jobs.values()) {
      if (job.phase !== 'cooking' && job.phase !== 'finish') continue;
      const placement = state.floor.placementOf(job.stationId);
      const step = state.graphs.get(job.recipeId)?.steps.get(job.stepId);
      if (!placement || !step) continue;
      const spec = STATION_SPECS[step.station];
      if (spec.requires.length === 0) continue;
      const at = this.stationPosition(placement.at, step.station);
      if (at) sources.push(at);
    }

    this.steamCarry += dt * RENDER.STEAM.spawnPerSecond * sources.length;
    while (this.steamCarry >= 1 && this.steam.length < RENDER.STEAM.maxParticles) {
      this.steamCarry -= 1;
      const source = sources[this.steam.length % Math.max(1, sources.length)];
      if (!source) break;
      this.steam.push({
        x: source.x + (((this.elapsed * 977) % 13) - 6),
        y: source.y - 6,
        life: RENDER.STEAM.lifeSeconds,
        drift: (((this.elapsed * 613) % 9) - 4) * 0.3,
      });
    }

    for (let i = this.steam.length - 1; i >= 0; i--) {
      const p = this.steam[i];
      if (!p) continue;
      p.life -= dt;
      p.y -= RENDER.STEAM.riseSpeed * dt;
      p.x += p.drift * dt;
      if (p.life <= 0) {
        this.steam.splice(i, 1);
        continue;
      }
      const sprite = this.steamPool.take();
      sprite.anchor.set(0.5);
      sprite.position.set(p.x, p.y);
      const t = p.life / RENDER.STEAM.lifeSeconds;
      sprite.alpha = t * 0.32;
      sprite.scale.set(0.5 + (1 - t) * 0.9);
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
