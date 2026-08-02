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
import { attentionSplit, downMachines } from '@/sim/systems/kitchen';
import { MACHINES, MACHINE_BY_ID } from '@/config/machines';
import type { SimState } from '@/sim/state';
import type { Job } from '@/sim/entities/station';
import { BRAND } from '@/config/brand';
import { TIME } from '@/config/time';
import { GAME_SECONDS_PER_TICK } from '@/sim/clock';
import { camera, depthSort, toScreen, toScreenCorner } from '../projection';
import { ShapeRegistry, SpritePool } from '../shapes/ShapeRegistry';
import { foodColour, lerpColour } from '../palette';

const NONE = 0;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * How many people the street can show at once. DERIVED, never set — the street
 * has a fixed depth that `fitCamera` reserves, and a queue laid out past it is
 * drawn underneath the opaque bottom bar.
 */
const QUEUE_MAX_VISIBLE = RENDER.QUEUE.perRow * RENDER.QUEUE.rows;

/** Game minutes between two ticks. The rail and the slump both read in these. */
const waitMinutesOf = (from: number, now: number): number =>
  (Math.max(0, now - from) * GAME_SECONDS_PER_TICK) / TIME.SECONDS_PER_MINUTE;

interface Steam {
  x: number;
  y: number;
  life: number;
  drift: number;
}

/**
 * A walkout being played. Drained from `state.walkouts` and animated here,
 * because the sim has no business knowing how long an animation runs.
 */
interface Departing {
  readonly id: number;
  readonly alt: boolean;
  /** Where in the queue they got to before giving up. */
  readonly slot: number;
  age: number;
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
  private ticketPool!: SpritePool;
  private flagPool!: SpritePool;
  private readonly machinePools = new Map<string, SpritePool>();
  private readonly armPools = new Map<string, SpritePool>();

  /** Walkouts currently playing. See `drawWalkouts`. */
  private readonly departing: Departing[] = [];

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
    this.ticketPool = new SpritePool(this.registry, 'ticket', this.fxLayer);
    this.flagPool = new SpritePool(this.registry, 'ticketFlag', this.fxLayer);
    for (const spec of MACHINES) {
      this.machinePools.set(
        spec.id,
        new SpritePool(this.registry, `machine:${spec.id}`, this.actorLayer),
      );
      this.armPools.set(
        spec.id,
        new SpritePool(this.registry, `machine:${spec.id}:arm`, this.actorLayer),
      );
    }

    // Set LAST, and it has to actually BE last: reconcileStations() reads it to
    // decide whether an arriving station gets an install beat, and it runs in
    // the same frame as build(). Setting it early made the whole opening
    // kitchen drop out of the ceiling. It was sitting mid-list, which was
    // harmless only because nothing between here and there reads it — a comment
    // saying "last" above a line that is not last is a trap for the next edit.
    this.built = true;
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

  /**
   * One frame. `dt` is real seconds since the last one; `now` is the sim tick.
   *
   * The tick is passed in rather than derived. It was briefly inferred from the
   * newest order's `placedAt`, which is wrong in the one case that matters: a
   * stalled kitchen takes no new orders, so time would appear to stop and the
   * ticket rail would freeze white at exactly the moment it needed to go red.
   */
  render(state: SimState, dt: number, now: number): void {
    this.build(state);
    this.reconcileStations(state, dt);
    this.elapsed += dt;

    this.staffPool.begin();
    this.customerPool.begin();
    this.customerAltPool.begin();
    this.foodPool.begin();
    this.steamPool.begin();
    this.pilotPool.begin();
    this.ticketPool.begin();
    this.flagPool.begin();
    for (const p of this.machinePools.values()) p.begin();
    for (const p of this.armPools.values()) p.begin();

    this.drawStations(state);
    this.drawMachines(state, now);
    this.drawFood(state);
    this.drawStaff(state);
    this.drawQueue(state, now);
    this.drawWalkouts(state, dt);
    this.drawRail(state, now);
    this.drawSteam(state, dt);

    this.staffPool.end();
    this.customerPool.end();
    this.customerAltPool.end();
    this.foodPool.end();
    this.steamPool.end();
    this.pilotPool.end();
    this.ticketPool.end();
    this.flagPool.end();
    for (const p of this.machinePools.values()) p.end();
    for (const p of this.armPools.values()) p.end();
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
   * **The rhythm beat. §21.5, and density stage 2.**
   *
   * A machine is drawn on its host station and moves on a fixed clock: one
   * period, the same phase for every unit of the same kind, no jitter and no
   * easing. Two clamshells are in perfect lockstep. That is deliberate and it
   * is the entire trick — next to `drawStaff`, which is built to never repeat,
   * the room reads as organic or mechanical without a single label.
   *
   * The sawtooth matters. A sine would read as breathing; a hard stroke and
   * return reads as a mechanism.
   */
  private drawMachines(state: SimState, now: number): void {
    void now;
    for (const station of state.stations) {
      if (station.machines.length === NONE) continue;
      const placement = state.floor.placementOf(station.id);
      if (!placement) continue;
      const down = downMachines(state, station);

      for (const machineId of station.machines) {
        const spec = MACHINE_BY_ID[machineId];
        const pool = this.machinePools.get(machineId);
        const armPool = this.armPools.get(machineId);
        if (!spec || !pool || !armPool) continue;

        // On the host, slightly proud of it, so it reads as fitted rather than
        // as a second station standing nearby.
        const at = this.stationPosition(placement.at, station.type);
        if (!at) continue;

        // Sat ON the host and offset up, so the station reads underneath it.
        // Two machines on one station stack rather than overlap.
        const slot = station.machines.indexOf(machineId);
        const body = pool.take();
        body.anchor.set(0.5, 1);
        // Feet ON the station, not floating above it. The lift is a fraction of
        // a TILE, not of the machine's own height — offsetting by the latter
        // put a clamshell up over the extraction hood, detached from the grill
        // it is bolted to, which reads as a rendering bug rather than as a
        // fitted machine.
        body.position.set(
          at.x + (slot - (station.machines.length - 1) / 2) * camera.tileWidth * 0.42,
          at.y + camera.tileDepth * 0.3,
        );
        body.zIndex = depthSort(placement.at.y) + 2;

        const broken = down.has(machineId);
        const working = station.jobId !== null && !broken;

        // Idle: equipment looks ON at rest (§21.2). Evenly, unlike a person.
        body.alpha = working
          ? 1
          : 1 - RENDER.RHYTHM.idleAlpha * (0.5 + 0.5 * Math.sin(this.elapsed * RENDER.RHYTHM.idleHz * Math.PI * 2));

        const arm = armPool.take();
        arm.anchor.set(0.5, 1);
        arm.zIndex = body.zIndex + 1;

        // The cycle. `this.elapsed` and nothing else — no per-unit phase, so
        // machines of a kind move as one.
        const t = (this.elapsed % RENDER.RHYTHM.cycleSeconds) / RENDER.RHYTHM.cycleSeconds;
        let travel: number;
        if (broken) {
          /**
           * **Visible before it is notified** — a step 13 requirement.
           *
           * It stalls partway through the stroke and buzzes there. It reads
           * wrong instantly for the same reason the healthy cycle reads right:
           * everything else about a machine is perfectly regular, so a machine
           * that is not is the loudest thing in the room.
           */
          travel =
            RENDER.RHYTHM.faultStallFraction +
            (Math.sin(this.elapsed * RENDER.RHYTHM.faultHz * Math.PI * 2) *
              RENDER.RHYTHM.faultJitterPixels) /
              RENDER.RHYTHM.strokePixels;
        } else if (!working) {
          travel = 0;
        } else {
          // Sawtooth: hard stroke, hard return. A sine would read as breathing.
          travel =
            t < RENDER.RHYTHM.strokeFraction
              ? t / RENDER.RHYTHM.strokeFraction
              : 1 - (t - RENDER.RHYTHM.strokeFraction) / (1 - RENDER.RHYTHM.strokeFraction);
        }
        /**
         * The arm travels ALONG the gantry, not up and down it. A crossbeam
         * with something sliding under it is the clearest possible statement
         * that a machine is working, and horizontal travel is legible at a
         * glance in a way a few pixels of lift is not.
         */
        const span = camera.tileWidth * spec.width * 0.28;
        arm.anchor.set(0.5, 0);
        arm.position.set(
          body.x + (travel - 0.5) * 2 * span,
          body.y - RENDER.HEIGHT.machine * 0.82,
        );
        arm.tint = broken ? BRAND.signal.ticketCritical : 0xffffff;
      }
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

      const split = attentionSplit(step, job.batch, state.stations.find((s) => s.id === job.stationId));
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
      // Not in today: not in the building. A roster you cannot see on the
      // floor is a spreadsheet, and the whole point of it is that Saturday
      // looks different from Tuesday.
      if (!state.workingToday.has(staff.id) && !staff.arriving) return;

      const sprite = this.staffPool.take();
      sprite.anchor.set(0.5, 1);
      const at = toScreen(staff.x, staff.y);

      const job = staff.jobId === null ? null : state.jobs.get(staff.jobId);
      const walking = job?.phase === 'travel' || job?.phase === 'recall' || job?.phase === 'carry';

      /**
       * **The human half of §21.5, and it has to be built to never repeat.**
       *
       * This used to be one clean sine, which made a cook exactly as
       * metronomic as a clamshell — the contrast the whole step is about did
       * not exist, it was just two things oscillating.
       *
       * Three things make a gait instead of an oscillation, and none of them
       * appears anywhere in `drawMachines`:
       *
       *   a per-person phase AND a per-person speed, so nobody is ever in step
       *   with anybody else (`speedJitter`, declared in config at step 5 and
       *   unused until now);
       *
       *   a second, slower sway beaten against the bob on a deliberately
       *   non-harmonic period, so the combined motion has no visible cycle;
       *
       *   sideways wander while walking and a slow fidget while standing,
       *   because §21.5 asks for "small course corrections" and "occasional
       *   idle fidget" and a person who holds a perfectly straight line reads
       *   as being on rails.
       */
      const phase = index * 1.7;
      const rate = 1 + ((index % 5) - 2) * RENDER.MOTION.speedJitter;
      const clock = this.elapsed * rate + phase;

      const bob = walking
        ? Math.abs(Math.sin(clock * Math.PI * RENDER.MOTION.bobHz)) * RENDER.MOTION.bobPixels
        : Math.sin(clock * RENDER.MOTION.fidgetHz * Math.PI * 2) * RENDER.MOTION.fidgetPixels;
      const sway = Math.sin(clock * RENDER.MOTION.swayHz * Math.PI * 2) * RENDER.MOTION.swayPixels;
      const wander = walking
        ? Math.sin(clock * RENDER.MOTION.swayHz * Math.PI * 2 * 0.5) * RENDER.MOTION.wanderPixels
        : 0;

      sprite.position.set(at.x + wander, at.y + camera.tileDepth * 0.4 - bob - sway * 0.5);
      sprite.zIndex = depthSort(staff.y);
      // Someone working out their notice is still here, just not for long.
      sprite.alpha = staff.leavingOnDay !== null ? 0.62 : 1;
    });
  }

  /**
   * The queue. Customers flow UP the screen from the street (§12), so the head
   * of the queue is at the door and the tail runs down toward the kerb. That
   * ordering matters: it is how a stranger reads which way things are going.
   */
  private drawQueue(state: SimState, now: number): void {
    const waiting = [...state.customers.values()].filter((c) => c.state === 'waiting');
    const entry = state.site.entryTile;
    const shown = Math.min(waiting.length, QUEUE_MAX_VISIBLE);

    for (let i = 0; i < shown; i++) {
      const customer = waiting[i];
      if (!customer) continue;
      // Alternate silhouettes so a queue is a crowd, not a barcode.
      const pool = i % 2 === 0 ? this.customerPool : this.customerAltPool;
      const sprite = pool.take();
      sprite.anchor.set(0.5, 1);

      const at = this.queueSlot(entry, i);
      // A tiny per-customer sway. People waiting are never quite still.
      const sway = Math.sin((this.elapsed + i * 2.1) * 0.9) * 1.2;

      /**
       * §6.2, "customer mood through posture". Nobody is annoyed for the first
       * six minutes; after that they sag and lean, and by eighteen they are
       * fully slumped. It is three and a half pixels and five degrees, which is
       * nothing at all until fourteen people are doing it at once — and then it
       * is the most legible thing on the screen, with no number attached.
       */
      const waitMinutes = waitMinutesOf(customer.arrivedAt, now);
      const mood = clamp01(
        (waitMinutes - RENDER.QUEUE.slumpAfterMinutes) / RENDER.QUEUE.slumpOverMinutes,
      );
      sprite.position.set(at.x + sway, at.y + mood * RENDER.QUEUE.slumpPixels);
      sprite.rotation = (mood * RENDER.QUEUE.slumpLeanDegrees * Math.PI) / 180;
      sprite.scale.set(RENDER.QUEUE.scale);
      sprite.zIndex = depthSort(entry.y - Math.floor(i / RENDER.QUEUE.perRow)) + 5;
      // The back of the queue fades rather than ending in a hard edge, so a
      // line longer than the street can hold reads as "and more" instead of as
      // a clipping bug.
      sprite.alpha = i < QUEUE_MAX_VISIBLE - 2 ? 1 : 0.5;
    }
  }

  /**
   * Where the nth person in the queue stands. Shared with the walkout, so a
   * departing customer starts from exactly where they were standing.
   *
   * Laid out INSIDE the street `fitCamera` reserved. See RENDER.QUEUE — a
   * queue that runs past it is drawn under the opaque bottom bar, which is a
   * bug this project has already shipped once.
   */
  private queueSlot(entry: { x: number; y: number }, i: number): { x: number; y: number } {
    const row = Math.floor(i / RENDER.QUEUE.perRow);
    const col = (i % RENDER.QUEUE.perRow) - (RENDER.QUEUE.perRow - 1) / 2;
    return toScreen(
      entry.x + col * RENDER.QUEUE.columnPitch,
      entry.y - RENDER.QUEUE.headOffset - row * RENDER.QUEUE.rowPitch,
    );
  }

  /**
   * **The step 10 exit criterion.** "A walkout is legible on screen before the
   * stat moves."
   *
   * The stat is a receipt. This is the event, and the whole reason it exists is
   * that a number ticking from 11 to 12 in a corner is not something a player
   * notices, and a person turning around and leaving is.
   *
   * The shape is deliberate and the pause is the load-bearing part: they arrive
   * at the back of the queue, stand still long enough to be seen looking at it,
   * and only then turn and walk off down the street, fading at the very end.
   * Without the pause it reads as a customer being served, which is the exact
   * opposite message.
   */
  private drawWalkouts(state: SimState, dt: number): void {
    // Drain. The sim hands these over and never looks at them again.
    for (const walkout of state.walkouts) {
      this.departing.push({
        id: walkout.id,
        alt: walkout.id % 2 === 1,
        slot: Math.min(walkout.queueLength, QUEUE_MAX_VISIBLE - 1),
        age: 0,
      });
    }
    state.walkouts.length = 0;

    const entry = state.site.entryTile;
    for (let i = this.departing.length - 1; i >= 0; i--) {
      const d = this.departing[i];
      if (!d) continue;
      d.age += dt;
      const t = d.age / RENDER.WALKOUT.seconds;
      if (t >= 1) {
        this.departing.splice(i, 1);
        continue;
      }

      const sprite = (d.alt ? this.customerAltPool : this.customerPool).take();
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(RENDER.QUEUE.scale);
      // Cold, so they read as leaving the warm box rather than joining it.
      sprite.tint = RENDER.WALKOUT.tint;

      const at = this.queueSlot(entry, d.slot);
      // Left or right, decided by who they are, so two walkouts in the same
      // second do not overlap into one confusing blob.
      const side = d.id % 2 === 0 ? -1 : 1;
      // Standing still, looking. Then away.
      const away = clamp01(
        (t - RENDER.WALKOUT.lookFraction) / (1 - RENDER.WALKOUT.lookFraction),
      );
      // Down-screen is out of the shop and away down the street. §12 — the
      // street is at the bottom, so leaving is unambiguously downward.
      const bob =
        away > 0 ? Math.sin(d.age * RENDER.WALKOUT.bobHz * Math.PI * 2) * RENDER.WALKOUT.bobPixels : 0;
      sprite.position.set(
        at.x + side * away * RENDER.WALKOUT.driftPixels,
        at.y + away * RENDER.WALKOUT.travelPixels + bob,
      );
      // They turn to go. A person leaving is not a person standing.
      sprite.rotation = side * away * 0.14;
      sprite.alpha = 1 - clamp01((t - RENDER.WALKOUT.fadeFrom) / (1 - RENDER.WALKOUT.fadeFrom));
      // In front of the queue they just left, so the departure is never hidden
      // behind the crowd that caused it.
      sprite.zIndex = depthSort(entry.y) + 20;
    }
  }

  /**
   * The ticket rail. §22.6, and the age ramp §21.3 reserves three hues for.
   *
   * Every open order is a docket. It comes up white, goes amber at five minutes
   * and red at eleven, and a red one pulses. This is the shop's stress with no
   * number attached to it — the player learns to read the colour of the rail
   * out of the corner of their eye and never has to look at a wait figure.
   */
  private drawRail(state: SimState, now: number): void {
    const shown = Math.min(state.openOrders.length, RENDER.RAIL.maxVisible);
    if (shown === 0) return;

    const pitch = RENDER.RAIL.ticketWidth + RENDER.RAIL.gapPixels;
    // Over the pass, because that is where dockets live and because it puts the
    // rail beside the food it is describing. Pinned to the back wall it
    // overlapped the extraction hood and read as equipment.
    const pass = state.stations.find((s) => s.type === 'pass');
    const placement = pass ? state.floor.placementOf(pass.id) : undefined;
    const anchor = placement
      ? this.stationPosition(placement.at, 'pass')
      : toScreen(state.floor.width / 2 - 0.5, 1);
    if (!anchor) return;
    const left = anchor.x - (pitch * shown) / 2;
    const top = anchor.y - RENDER.RAIL.liftPixels - RENDER.RAIL.ticketHeight;

    for (let i = 0; i < shown; i++) {
      const orderId = state.openOrders[i];
      const order = orderId === undefined ? undefined : state.orders.get(orderId);
      if (!order) continue;

      const sprite = this.ticketPool.take();
      sprite.anchor.set(0.5, 0);
      const x = left + i * pitch + RENDER.RAIL.ticketWidth / 2;
      sprite.position.set(x, top);
      // Paper hangs crooked. Deterministic per slot, so it does not shimmer.
      const tilt = (((i % 3) - 1) * RENDER.RAIL.tiltDegrees * Math.PI) / 180;
      sprite.rotation = tilt;
      sprite.zIndex = 1000;

      // The band across the top. THIS is what ages — the paper stays paper.
      const flag = this.flagPool.take();
      flag.anchor.set(0.5, 0);
      flag.position.set(x, top);
      flag.rotation = tilt;
      flag.zIndex = 1001;

      const minutes = waitMinutesOf(order.placedAt, now);
      if (minutes >= RENDER.RAIL.redMinutes) {
        flag.tint = BRAND.signal.ticketCritical;
        // The only pulsing thing on screen. It should be impossible to miss and
        // there should never be more than one kind of it.
        flag.alpha =
          1 - RENDER.RAIL.pulseAlpha * (0.5 + 0.5 * Math.sin(this.elapsed * RENDER.RAIL.pulseHz * Math.PI * 2));
      } else if (minutes >= RENDER.RAIL.amberMinutes) {
        flag.tint = lerpColour(
          BRAND.signal.ticketWarning,
          BRAND.signal.ticketCritical,
          clamp01(
            (minutes - RENDER.RAIL.amberMinutes) /
              (RENDER.RAIL.redMinutes - RENDER.RAIL.amberMinutes),
          ),
        );
        flag.alpha = 1;
      } else {
        flag.tint = BRAND.signal.ticketFresh;
        flag.alpha = 1;
      }

      // A six-top docket is a taller docket. Dread, before you read a number.
      const items = order.lines.reduce((a, l) => a + l.quantity, 0);
      sprite.scale.set(1, items > 1 ? 1 + Math.min(items, 6) * 0.07 : 1);
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
