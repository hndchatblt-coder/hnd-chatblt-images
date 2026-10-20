/**
 * The venue, rendered (§11).
 *
 * Reads sim state and draws it. **Nothing here writes to the sim** — the boundary runs one way,
 * which is what lets the whole simulation run headless in Node and be trusted by the harness.
 *
 * The screen is a cross-section of the shop: street at the bottom, back-of-house at the top, two
 * flows meeting at the pass in the middle (§5). Depth on the grid maps to up-screen, which is
 * what makes a narrow Sydney shopfront suit portrait so well.
 */
import { Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import { brand, pattyColour, ticketColour, type as typeface } from "../../config/brand.js";
import { floor as floorCfg } from "../../config/floor.js";
import { stationByType } from "../../config/stations.js";
import type { World } from "../../sim/world.js";
import { LEAN, ShapeRegistry, TILE, type ShapeId } from "../shapes/ShapeRegistry.js";

const STATION_SHAPE: Record<string, ShapeId> = {
  grill: "grill",
  fryer: "fryer",
  prep: "prep",
  toast: "toast",
  assembly: "assembly",
  pass: "pass",
  drinks: "drinks",
};

export class Scene {
  readonly root = new Container();
  private readonly floorLayer = new Container();
  private readonly stationLayer = new Container();
  private readonly agentLayer = new Container();
  private readonly fxLayer = new Graphics();
  private readonly labelLayer = new Container();

  private readonly staffSprites: Sprite[] = [];
  private readonly customerSprites: Sprite[] = [];
  private readonly labels: Text[] = [];

  constructor(
    private readonly shapes: ShapeRegistry,
    private readonly world: World,
  ) {
    this.root.addChild(this.floorLayer, this.stationLayer, this.agentLayer, this.fxLayer, this.labelLayer);
    this.buildFloor();
    this.buildStations();
  }

  /** Tile coords → screen. Depth runs up the screen: y=0 is the street at the bottom. */
  private toScreen(x: number, y: number): { sx: number; sy: number } {
    const depth = this.world.venue.grid.d;
    return { sx: x * TILE, sy: (depth - 1 - y) * TILE };
  }

  private buildFloor(): void {
    const { w, d } = this.world.venue.grid;
    const g = new Graphics();
    for (let x = 0; x < w; x += 1) {
      for (let y = 0; y < d; y += 1) {
        const { sx, sy } = this.toScreen(x, y);
        // Back of house is tiled and pale; the customer side is warm-dim quarry tile.
        const backOfHouse = y > d * 0.45;
        g.rect(sx, sy, TILE, TILE).fill(backOfHouse ? brand.tile : brand.floor);
        g.rect(sx, sy, TILE, TILE).stroke({
          width: 1,
          color: backOfHouse ? brand.grout : brand.floorDeep,
          alignment: 1,
        });
      }
    }
    // The street, and the doorway light spilling in — literally where customers come from.
    const doorScreen = this.toScreen(floorCfg.doorTile.x, floorCfg.doorTile.y);
    g.rect(0, doorScreen.sy + TILE, w * TILE, TILE * 1.4).fill(brand.street);
    g.rect(doorScreen.sx - TILE * 0.4, doorScreen.sy, TILE * 1.8, TILE).fill(brand.lampHot);

    for (const b of this.world.venue.blocked) {
      const { sx, sy } = this.toScreen(b.x, b.y);
      g.rect(sx, sy, TILE, TILE).fill("#6B6560").stroke({ width: 2, color: brand.char });
    }
    this.floorLayer.addChild(g);
  }

  private buildStations(): void {
    this.stationLayer.removeChildren();
    for (const station of this.world.stations) {
      const shapeId = STATION_SHAPE[station.type];
      if (!shapeId) continue;
      const def = stationByType.get(station.type);
      const depth = def?.footprint.d ?? 1;
      const sprite = new Sprite(this.shapes.get(shapeId));
      // Anchor at the station's far corner so its footprint lands on the tiles it occupies.
      const { sx, sy } = this.toScreen(station.x, station.y + depth - 1);
      sprite.x = sx;
      sprite.y = sy - TILE * LEAN;
      this.stationLayer.addChild(sprite);
    }
  }

  /** Called every frame. Cheap: it moves existing sprites rather than making new ones. */
  update(): void {
    const world = this.world;

    // Staff and customers.
    this.sync(this.staffSprites, world.staff.length, "staff", this.agentLayer);
    world.staff.forEach((s, i) => {
      const sprite = this.staffSprites[i];
      if (!sprite) return;
      // Nudge apart so three people standing on the same tile read as three people.
      const { sx, sy } = this.toScreen(s.x + (i % 3) * 0.28 - 0.28, s.y);
      sprite.x = sx;
      sprite.y = sy - TILE * LEAN;
      sprite.visible = true;
    });

    const queued = world.customers.filter((c) => c.state === "queued" || c.state === "waiting");
    this.sync(this.customerSprites, queued.length, "customer", this.agentLayer);
    queued.forEach((c, i) => {
      const sprite = this.customerSprites[i];
      if (!sprite) return;
      // The queue snakes back from the door, which is what makes "out the door" legible.
      const col = i % Math.max(1, world.venue.grid.w - 2);
      const row = Math.floor(i / Math.max(1, world.venue.grid.w - 2));
      const { sx, sy } = this.toScreen(1 + col, Math.max(0, 1 + row));
      sprite.x = sx;
      sprite.y = sy;
      sprite.visible = true;
    });

    this.drawFx();
  }

  /**
   * The dynamic layer: carry lines, the food colour ramp, and the ticket rail. Everything here
   * genuinely changes shape per frame, which is why it is a Graphics redraw rather than a sprite.
   */
  private drawFx(): void {
    const g = this.fxLayer;
    g.clear();

    // Somebody carrying a batch across the shop. This is the thing you watch, and the whole
    // argument for making carrying an explicit move.
    for (const job of this.world.jobs) {
      const staff = this.world.staff.find((s) => s.id === job.staffId);
      const station = this.world.stations.find((s) => s.id === job.stationId);
      if (!staff || !station) continue;
      const from = this.toScreen(staff.x, staff.y);
      const to = this.toScreen(station.x, station.y);
      const carrying = (job.carryRemaining ?? 0) > 0;
      g.moveTo(from.sx + TILE / 2, from.sy + TILE / 2)
        .lineTo(to.sx + TILE / 2, to.sy + TILE / 2)
        .stroke({ width: carrying ? 2 : 1, color: carrying ? brand.lamp : brand.steelDark, alpha: carrying ? 0.85 : 0.3 });
    }

    // Food on the grill, on the raw → burnt ramp. Continuous, so it is a colour interpolation
    // rather than four sprite frames (§11).
    const grills = this.world.stations.filter((s) => s.type === "grill");
    for (const grill of grills) {
      const patties = this.world.stock.get("patty") ?? [];
      patties.slice(0, 4).forEach((lot, i) => {
        const age = this.world.clock.elapsed - lot.madeAt;
        const doneness = Math.min(1, age / Math.max(1, lot.freshnessWindow ?? 480));
        const { sx, sy } = this.toScreen(grill.x, grill.y);
        g.circle(sx + TILE * 0.4 + (i % 2) * TILE * 0.7, sy + TILE * 0.35 + Math.floor(i / 2) * TILE * 0.4, TILE * 0.16)
          .fill(pattyColour(doneness));
      });
    }

    // The ticket rail: age runs white → amber → red, and it is the single most important
    // glanceable signal in the game (§11.4).
    const open = this.world.orders.filter((o) => o.completedAt === null);
    const railY = -TILE * 1.2;
    open.slice(0, 14).forEach((order, i) => {
      const age = (this.world.clock.elapsed - order.placedAt) / 60;
      const fraction = Math.min(1, age / 14);
      g.rect(i * TILE * 0.62, railY, TILE * 0.5, TILE * 0.8)
        .fill(ticketColour(fraction))
        .stroke({ width: 1, color: brand.char });
    });
  }

  private sync(pool: Sprite[], needed: number, shape: ShapeId, layer: Container): void {
    while (pool.length < needed) {
      const sprite = new Sprite(this.shapes.get(shape));
      layer.addChild(sprite);
      pool.push(sprite);
    }
    for (let i = needed; i < pool.length; i += 1) {
      const sprite = pool[i];
      if (sprite) sprite.visible = false;
    }
  }

  /** The floor's extent, for fitting the camera. Excludes labels and the ticket rail, which
   *  would otherwise drag the fit off-centre. */
  floorBounds(): { x: number; y: number; width: number; height: number } {
    const { w, d } = this.world.venue.grid;
    return { x: 0, y: -TILE * 1.4, width: w * TILE, height: (d + 2.6) * TILE };
  }

  /** Station names, only at Tier 1/2 where they're legible. */
  showLabels(show: boolean): void {
    if (!show) {
      for (const label of this.labels) label.visible = false;
      return;
    }
    if (this.labels.length === 0) {
      const style = new TextStyle({ fontFamily: typeface.mono, fontSize: 8, fill: brand.char });
      for (const station of this.world.stations) {
        const def = stationByType.get(station.type);
        const text = new Text({ text: (def?.name ?? station.type).toUpperCase(), style });
        const { sx, sy } = this.toScreen(station.x, station.y);
        text.x = sx;
        text.y = sy - 10;
        this.labelLayer.addChild(text);
        this.labels.push(text);
      }
    }
    for (const label of this.labels) label.visible = true;
  }
}
