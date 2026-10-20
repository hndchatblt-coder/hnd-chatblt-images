/**
 * The Pixi surface, and the loop that drives the sim.
 *
 * Two clocks, deliberately separate (§4.1): the renderer runs at whatever the browser gives it,
 * and the sim runs at a fixed 10 Hz with a constant dt. Speed multiplies the number of ticks
 * processed per frame, **never** dt — that's what keeps 4x identical to 1x and the whole thing
 * replayable.
 */
import { useEffect, useRef } from "react";
import { Application, Container } from "pixi.js";
import { brand } from "../config/brand.js";
import { time } from "../config/time.js";
import { Scene } from "../render/scene/Scene.js";
import { ShapeRegistry } from "../render/shapes/ShapeRegistry.js";
import { createWorld, tick, type World } from "../sim/world.js";
import { hourOfDay, dayIndex } from "../sim/clock.js";
import { useHud } from "./store.js";

export function GameCanvas(): JSX.Element {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return undefined;
    let disposed = false;
    let app: Application | null = null;
    let shapes: ShapeRegistry | null = null;

    const boot = async (): Promise<void> => {
      const application = new Application();
      const mount = host.current;
      if (!mount) return;
      await application.init({
        background: brand.night,
        antialias: false,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true,
        resizeTo: mount,
      });
      if (disposed) {
        application.destroy(true);
        return;
      }
      app = application;
      mount.appendChild(application.canvas);

      const registry = new ShapeRegistry(application.renderer);
      registry.build();
      shapes = registry;

      // Land the player in the middle of a Friday lunch rush. Day 4 is a Friday (day 0 is a
      // Monday), and 12:00 is the peak of the daypart curve. Opening on Monday 11am — the default
      // — gave literally zero customers for the first half hour.
      const world: World = createWorld({ seed: "42", staffCount: 3, startDay: 4, startHour: 12 });
      const scene = new Scene(registry, world);
      scene.showLabels(false);

      const camera = new Container();
      camera.addChild(scene.root);
      application.stage.addChild(camera);

      const fit = (): void => {
        const bounds = scene.floorBounds();
        const pad = 16;
        const sx = (application.screen.width - pad) / Math.max(1, bounds.width);
        const sy = (application.screen.height - pad) / Math.max(1, bounds.height);
        const scale = Math.min(sx, sy);
        camera.scale.set(scale);
        camera.x = (application.screen.width - bounds.width * scale) / 2 - bounds.x * scale;
        camera.y = (application.screen.height - bounds.height * scale) / 2 - bounds.y * scale;
      };
      fit();
      application.renderer.on("resize", fit);

      // The sim clock. Accumulator so a slow frame catches up rather than skipping game time.
      let carry = 0;
      const tickMs = 1000 / time.tickHz;
      let last = performance.now();

      application.ticker.add(() => {
        const now = performance.now();
        const elapsed = Math.min(250, now - last);
        last = now;

        const { paused, speed } = useHud.getState();
        if (!paused) {
          carry += elapsed * speed;
          // Cap the catch-up so a backgrounded tab doesn't lock the main thread on return.
          let steps = 0;
          while (carry >= tickMs && steps < 240) {
            tick(world);
            carry -= tickMs;
            steps += 1;
          }
        }

        scene.update();

        const revenue = world.ledger.revenue ?? 0;
        const served = world.day.ordersCompleted;
        useHud.getState().set({
          cash: world.cash,
          reputation: world.reputation,
          day: dayIndex(world.clock),
          hour: hourOfDay(world.clock),
          covers: world.day.covers,
          balked: world.day.balked + world.day.reneged,
          openOrders: world.orders.filter((o) => o.completedAt === null).length,
          meanWaitMinutes: served > 0 ? world.day.waitSecondsTotal / served / 60 : 0,
          labourPct: revenue > 0 ? -(world.ledger.wages ?? 0) / revenue : 0,
          cogsPct: revenue > 0 ? -(world.ledger.cogs ?? 0) / revenue : 0,
          wastePct: revenue > 0 ? (world.ledger.waste ?? 0) / revenue : 0,
        });
      });
    };

    void boot();

    return () => {
      disposed = true;
      shapes?.destroy();
      app?.destroy(true, { children: true });
    };
  }, []);

  return <div ref={host} style={{ width: "100%", height: "100%" }} />;
}
