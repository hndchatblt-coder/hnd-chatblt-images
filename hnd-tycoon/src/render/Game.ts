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
import { buildScenario, type ScenarioOptions } from '@/sim/scenario';
import type { World } from '@/sim/world';
import { Scene } from './scene/Scene';
import { ShapeRegistry } from './shapes/ShapeRegistry';

const TICK_SECONDS = 1 / TIME.TICK_HZ;

export class Game {
  readonly app = new Application();
  world: World;
  private scene!: Scene;
  private registry!: ShapeRegistry;
  private accumulator = 0;
  private speed = 1;
  private running = true;

  constructor(options: ScenarioOptions) {
    this.world = buildScenario(options);
  }

  async start(canvasHost: HTMLElement): Promise<void> {
    await this.app.init({
      width: RENDER.FRAME_WIDTH,
      height: RENDER.FRAME_HEIGHT,
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

    // Open on a day that is worth watching. Day 0 is a Sunday and trade starts
    // at 11:00; dropping the player into an empty room at 3am would be an
    // accurate simulation of nothing at all.
    this.world.runTicks(openingTicks(this.world));

    this.app.ticker.add(() => {
      const dt = Math.min(this.app.ticker.deltaMS / 1000, RENDER.MAX_FRAME_SECONDS);
      if (this.running) this.step(dt);
      this.scene.render(this.world.state, dt);
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

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  destroy(): void {
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
