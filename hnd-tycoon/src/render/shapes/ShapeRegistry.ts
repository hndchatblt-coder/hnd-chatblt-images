/**
 * Every shape in the game, drawn once. DESIGN.md §22.2.
 *
 * **No raster assets. Everything drawn from code.** A shape is described with
 * `Graphics`, rendered once into a `RenderTexture` at boot, and from then on
 * instanced as sprites. Only genuinely dynamic geometry redraws per frame.
 *
 * Two things fall out of this that matter more than the performance:
 *
 * 1. Every state is continuous. Raw → seared → perfect → burnt is a colour
 *    interpolation, not four sprite frames.
 * 2. Acts III–V cost no art pipeline. A drone and a colony module are shapes
 *    in this registry.
 *
 * **Silhouettes must read at 12px.** Every shape here is designed at its real
 * size and checked small: hard edges, strong outlines, colour carrying all the
 * information. No gradients, no soft shadows, no detail that dies at distance.
 */
import { Container, Graphics, Sprite, Texture, type Renderer } from 'pixi.js';
import { BRAND } from '@/config/brand';
import { RENDER } from '@/config/render';
import { MACHINES } from '@/config/machines';
import type { StationType } from '@/config/recipes';
import { camera } from '../projection';

export type ShapeKey = string;

/** A box with a top face and a front face. The front face IS the oblique lean. */
interface BoxSpec {
  readonly widthTiles: number;
  readonly depthTiles: number;
  readonly height: number;
  readonly top: number;
  readonly front: number;
  /** Drawn onto the top face — a hotplate, a bench surface, an oil bath. */
  readonly inset?: number;
}

export class ShapeRegistry {
  private readonly textures = new Map<ShapeKey, Texture>();

  constructor(private readonly renderer: Renderer) {}

  /** Everything the shop needs, baked at boot. */
  bake(): void {
    const tw = camera.tileWidth;
    const td = camera.tileDepth;

    this.bakeGraphics('floor', (g) => {
      g.rect(0, 0, tw, td).fill(BRAND.interior.floor);
      g.rect(0, 0, tw, td).stroke({ color: BRAND.interior.seam, width: 1, alignment: 1 });
    });
    this.bakeGraphics('floorAlt', (g) => {
      g.rect(0, 0, tw, td).fill(BRAND.interior.floorAlt);
      g.rect(0, 0, tw, td).stroke({ color: BRAND.interior.seam, width: 1, alignment: 1 });
    });
    this.bakeGraphics('street', (g) => {
      g.rect(0, 0, tw, td).fill(BRAND.street.cold);
    });

    // The column you cannot remove and will hate. §12
    this.bakeBox('column', {
      widthTiles: 1,
      depthTiles: 1,
      height: RENDER.HEIGHT.column,
      top: BRAND.equipment.enamel,
      front: BRAND.equipment.enamelDark,
    });

    this.bakeStations();
    this.bakePeople();
    this.bakeWall();
    this.bakeBits();
  }

  private bakeStations(): void {
    const kit = BRAND.equipment;
    const h = RENDER.HEIGHT.station;

    // Each station is a silhouette first. At 12px you should still be able to
    // tell the grill from the fryer from the pass — width, depth and the top
    // inset are doing all of that work.
    this.bakeBox('station:grill', {
      widthTiles: 2,
      depthTiles: 1,
      height: h,
      top: kit.steel,
      front: kit.steelDark,
      inset: kit.hotplate,
    });
    this.bakeBox('station:fryer', {
      widthTiles: 1,
      depthTiles: 1,
      height: h,
      top: kit.steel,
      front: kit.steelDark,
      inset: kit.oil,
    });
    this.bakeBox('station:toast', {
      widthTiles: 1,
      depthTiles: 1,
      height: RENDER.HEIGHT.counter,
      top: kit.steel,
      front: kit.steelDark,
    });
    this.bakeBox('station:prep', {
      widthTiles: 3,
      depthTiles: 1,
      height: RENDER.HEIGHT.counter,
      top: kit.steel,
      front: kit.steelDark,
    });
    this.bakeBox('station:prep:rot', {
      widthTiles: 1,
      depthTiles: 3,
      height: RENDER.HEIGHT.counter,
      top: kit.steel,
      front: kit.steelDark,
    });
    this.bakeBox('station:assembly', {
      widthTiles: 3,
      depthTiles: 1,
      height: RENDER.HEIGHT.counter,
      top: kit.timber,
      front: kit.timberDark,
    });
    // The signature element. §22.2 — warmer, taller, and the visual centre.
    this.bakeBox('station:pass', {
      widthTiles: 1,
      depthTiles: 2,
      height: RENDER.HEIGHT.counter,
      top: kit.timber,
      front: kit.timberDark,
      inset: BRAND.interior.warm,
    });
    this.bakeBox('station:drinks', {
      widthTiles: 1,
      depthTiles: 1,
      height: RENDER.HEIGHT.station,
      top: kit.enamel,
      front: kit.enamelDark,
    });
  }

  private bakePeople(): void {
    const w = RENDER.PERSON_WIDTH;
    const h = RENDER.HEIGHT.person;

    // Chef whites. Hard-edged, high contrast against the dark floor, readable
    // as a person at 12px because the head reads as a separate mass.
    this.bakeGraphics('staff', (g) => {
      g.roundRect(0, h * 0.3, w, h * 0.7, 2).fill(BRAND.people.whites);
      g.roundRect(0, h * 0.3, w, h * 0.7, 2).stroke({ color: BRAND.people.whitesDark, width: 1 });
      g.rect(0, h * 0.72, w, h * 0.28).fill(BRAND.people.apron);
      g.circle(w / 2, h * 0.2, w * 0.34).fill(BRAND.people.skin);
      // The cap. It is what separates a cook from a customer at a glance.
      g.rect(w * 0.12, h * 0.02, w * 0.76, h * 0.1).fill(BRAND.people.whites);
    });

    this.bakeGraphics('customer', (g) => {
      g.roundRect(0, h * 0.3, w, h * 0.7, 3).fill(BRAND.people.customer);
      g.circle(w / 2, h * 0.2, w * 0.34).fill(BRAND.people.skin);
    });
    this.bakeGraphics('customerAlt', (g) => {
      g.roundRect(0, h * 0.3, w, h * 0.7, 3).fill(BRAND.people.customerAlt);
      g.circle(w / 2, h * 0.2, w * 0.34).fill(BRAND.people.skin);
    });

    /**
     * A docket, in two parts: paper, and the band across the top of it.
     *
     * Only the BAND takes the age tint. Tinting the whole docket turned the
     * rail into a solid red bar that read as equipment bolted to the wall
     * rather than as paper — the colour has to be a flag ON something, not the
     * thing itself. §21.3 reserves the three ramp hues for exactly this.
     */
    this.bakeGraphics('ticket', (g) => {
      const tw = RENDER.RAIL.ticketWidth;
      const th = RENDER.RAIL.ticketHeight;
      g.roundRect(0, 0, tw, th, 2).fill(BRAND.signal.ticketFresh);
      // Ruled lines, so it reads as a docket and not as a white rectangle.
      g.rect(tw * 0.18, th * 0.46, tw * 0.64, 1.4).fill(0x8d8880);
      g.rect(tw * 0.18, th * 0.64, tw * 0.44, 1.4).fill(0x8d8880);
      g.rect(tw * 0.18, th * 0.82, tw * 0.54, 1.4).fill(0x8d8880);
    });
    /**
     * Machines. §21.2 — nothing purchasable ships without a distinct on-screen
     * presence, and §21.5 needs them to read as MACHINE at a glance.
     *
     * Two things carry that reading before any motion happens: a cold steel
     * body against the warm room, and a hard horizontal band across the middle
     * — the seam, hopper mouth or platen line that every real piece of catering
     * kit has and no person does. Silhouette first, as always.
     */
    for (const spec of MACHINES) {
      /**
       * Narrower and shorter than the station it sits on, deliberately.
       *
       * The first cut matched the station's footprint exactly and drew over it
       * at the same anchor, so a clamshell did not read as "a grill with a
       * clamshell on it" — it read as the grill having been deleted. A fitted
       * machine has to leave its host visible underneath or the room loses the
       * stations the player spent the first ten steps learning to recognise.
       */
      const w = Math.max(1, spec.width) * camera.tileWidth * 0.62;
      const h = RENDER.HEIGHT.station * 0.8;
      this.bakeGraphics(`machine:${spec.id}`, (g) => {
        g.roundRect(0, 0, w, h, 2).fill(BRAND.equipment.enamelDark);
        g.roundRect(0.5, 0.5, w - 1, h * 0.55, 2).fill(BRAND.equipment.steel);
        // The band. Machines have a mouth; people do not.
        g.rect(0, h * 0.55, w, Math.max(2, h * 0.14)).fill(BRAND.equipment.hotplate);
        // Hard edge, so it reads as a fitted unit and not as a smudge.
        g.roundRect(0, 0, w, h, 2).stroke({ color: BRAND.interior.seam, width: 1 });
      });
      // The part that moves. Drawn separately so the cycle can translate it
      // without redrawing the body every frame.
      this.bakeGraphics(`machine:${spec.id}:arm`, (g) => {
        const aw = w * 0.66;
        const ah = Math.max(3, h * 0.2);
        g.roundRect(0, 0, aw, ah, 1.5).fill(BRAND.equipment.steel);
        g.roundRect(0, 0, aw, ah, 1.5).stroke({ color: BRAND.interior.seam, width: 1 });
      });
    }

    this.bakeGraphics('ticketFlag', (g) => {
      const tw = RENDER.RAIL.ticketWidth;
      g.roundRect(0, 0, tw, RENDER.RAIL.flagHeight, 2).fill(0xffffff);
    });
  }

  private bakeWall(): void {
    const tw = camera.tileWidth;
    const kit = BRAND.equipment;

    // Tiled splashback. Grubby, not clinical. It has to read as a WALL and not
    // as more floor, so: a different tile pitch, a vertical seam the floor
    // never has, a darkening toward the ceiling, and a hard skirting line at
    // the bottom. The skirting is what actually sells it.
    this.bakeGraphics('wall', (g) => {
      const h = RENDER.WALL.height;
      g.rect(0, 0, tw, h).fill(BRAND.interior.surface);
      // Falls off toward the ceiling — light comes from the room, not above.
      for (let i = 0; i < 8; i++) {
        g.rect(0, (h / 8) * i, tw, h / 8).fill({
          color: BRAND.street.night,
          alpha: 0.5 - i * 0.06,
        });
      }
      for (let y = 0; y < h; y += 19) {
        g.rect(0, y, tw, 1).fill({ color: BRAND.interior.seam, alpha: 0.7 });
      }
      for (let y = 0; y < h; y += 38) {
        g.rect(tw / 2, y, 1, 19).fill({ color: BRAND.interior.seam, alpha: 0.7 });
      }
      g.rect(0, h - RENDER.WALL.skirting, tw, RENDER.WALL.skirting).fill(
        BRAND.equipment.enamelDark,
      );
      g.rect(0, h - RENDER.WALL.skirting, tw, 1).fill(BRAND.interior.seam);
    });

    // The extraction hood. This is the single most explanatory object on the
    // screen: it hangs over the gas run and nowhere else.
    this.bakeGraphics('hood', (g) => {
      g.rect(0, 0, tw, RENDER.WALL.hoodDrop).fill(kit.steelDark);
      g.rect(0, RENDER.WALL.hoodDrop - 4, tw, 4).fill(kit.steel);
      g.rect(0, RENDER.WALL.hoodDrop, tw, 3).fill({ color: BRAND.interior.warm, alpha: 0.5 });
    });

    // A soft radial wash, baked once. A hard-edged ellipse reads as a bug.
    this.bakeGraphics('glow', (g) => {
      const rx = RENDER.GLOW.radiusTiles * camera.tileWidth;
      const ry = RENDER.GLOW.radiusTiles * camera.tileDepth * 1.6;
      for (let i = RENDER.GLOW.rings; i > 0; i--) {
        const t = i / RENDER.GLOW.rings;
        g.ellipse(rx, ry, rx * t, ry * t).fill({
          color: BRAND.interior.warm,
          alpha: (RENDER.GLOW.alpha / RENDER.GLOW.rings) * (1 - t * 0.55),
        });
      }
    });
  }

  private bakeBits(): void {
    // Food. Drawn white so a sprite tint can carry the whole raw→burnt ramp —
    // that is why the ramp is an interpolation rather than four sprites.
    this.bakeGraphics('food', (g) => {
      g.circle(7, 7, 6).fill(0xffffff);
      g.circle(7, 7, 6).stroke({ color: 0x000000, width: 1, alpha: 0.35 });
    });
    this.bakeGraphics('steam', (g) => {
      g.circle(RENDER.STEAM.size, RENDER.STEAM.size, RENDER.STEAM.size).fill(BRAND.fx.steam);
    });
    // Pilot light: equipment must look ON at rest. §21.2 idle signature.
    this.bakeGraphics('pilot', (g) => {
      g.circle(3, 3, 2.5).fill(BRAND.equipment.pilot);
    });
    // Service points, drawn into the floor so the constraint is visible before
    // the player hits it.
    this.bakeGraphics('service', (g) => {
      g.rect(0, 0, camera.tileWidth, 3).fill({ color: BRAND.equipment.pilot, alpha: 0.28 });
    });
  }

  // --- Baking -----------------------------------------------------------

  private bakeBox(key: ShapeKey, spec: BoxSpec): void {
    const w = spec.widthTiles * camera.tileWidth;
    const d = spec.depthTiles * camera.tileDepth;
    this.bakeGraphics(key, (g) => {
      // Front face first, so the top face overlaps it cleanly.
      g.rect(0, d, w, spec.height).fill(spec.front);
      g.rect(0, 0, w, d).fill(spec.top);
      if (spec.inset !== undefined) {
        g.rect(3, 3, w - 6, d - 6).fill(spec.inset);
      }
      // One hard outline around the whole silhouette. This is what survives
      // at 12px when nothing else does.
      g.rect(0, 0, w, d + spec.height).stroke({
        color: BRAND.interior.seam,
        width: 1,
        alignment: 1,
      });
    });
  }

  private bakeGraphics(key: ShapeKey, draw: (g: Graphics) => void): void {
    const g = new Graphics();
    draw(g);
    const texture = this.renderer.generateTexture({ target: g, resolution: 2 });
    this.textures.set(key, texture);
    g.destroy();
  }

  // --- Using ------------------------------------------------------------

  get(key: ShapeKey): Texture {
    const t = this.textures.get(key);
    if (!t) throw new Error(`ShapeRegistry: no shape "${key}" — bake it first`);
    return t;
  }

  sprite(key: ShapeKey): Sprite {
    return new Sprite(this.get(key));
  }

  /** The texture key for a station, honouring rotation where it has one. */
  stationKey(type: StationType, rotated: boolean): ShapeKey {
    const rotatedKey = `station:${type}:rot`;
    if (rotated && this.textures.has(rotatedKey)) return rotatedKey;
    return `station:${type}`;
  }

  destroy(): void {
    for (const t of this.textures.values()) t.destroy(true);
    this.textures.clear();
  }
}

/** A pooled container of sprites, so density costs allocation once. §21.3 */
export class SpritePool {
  private readonly live: Sprite[] = [];
  private next = 0;

  constructor(
    private readonly registry: ShapeRegistry,
    private readonly key: ShapeKey,
    private readonly layer: Container,
  ) {}

  /** Start a frame. Everything not taken this frame gets hidden. */
  begin(): void {
    this.next = 0;
  }

  take(): Sprite {
    let sprite = this.live[this.next];
    if (!sprite) {
      sprite = this.registry.sprite(this.key);
      this.live.push(sprite);
      this.layer.addChild(sprite);
    }
    sprite.visible = true;
    this.next++;
    return sprite;
  }

  end(): void {
    for (let i = this.next; i < this.live.length; i++) {
      const sprite = this.live[i];
      if (sprite) sprite.visible = false;
    }
  }
}
