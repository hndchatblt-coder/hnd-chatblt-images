/**
 * Every primitive in the game, defined once (§11.2).
 *
 * Each shape is drawn into a `RenderTexture` at boot and then instanced as sprites — code-drawn
 * art at sprite performance. Only genuinely dynamic geometry redraws per frame: the food colour
 * ramp, particles, path lines and the ticket rail.
 *
 * Keeping every definition in one registry is what makes the visual language consistent and
 * restyling a one-file job. Nothing outside here is allowed to invent a shape.
 *
 * Projection is **top-down with a shallow oblique lean** (§11.1), not isometric: objects get a
 * short vertical face so they have body, but the floor grid stays axis-aligned to the screen. The
 * grid axes match the player's thumb axes, so dragging in Renovate mode is predictable, and
 * portrait depth reads naturally as up-screen.
 */
import { Graphics, RenderTexture, Texture, type Renderer } from "pixi.js";
import { brand } from "../../config/brand.js";

export const TILE = 22;
/** How much of a tile the oblique face occupies. Enough for body, not enough for depth-sorting. */
export const LEAN = 0.34;

export type ShapeId =
  | "floorTile"
  | "grill"
  | "fryer"
  | "prep"
  | "toast"
  | "assembly"
  | "pass"
  | "drinks"
  | "staff"
  | "customer"
  | "ticket"
  | "tray"
  | "column";

interface ShapeSpec {
  w: number;
  d: number;
  draw: (g: Graphics, w: number, h: number) => void;
}

/** A box with a lit top face and a darker front face. The core of the whole visual language. */
const box = (
  g: Graphics,
  w: number,
  h: number,
  top: string,
  front: string,
  edge = brand.char,
): void => {
  const lean = TILE * LEAN;
  g.rect(0, lean, w, h - lean).fill(front);
  g.rect(0, 0, w, h - lean).fill(top);
  g.rect(0, 0, w, h).stroke({ width: 1.5, color: edge, alignment: 1 });
};

const SPECS: Record<ShapeId, ShapeSpec> = {
  floorTile: {
    w: 1,
    d: 1,
    draw: (g, w, h) => {
      g.rect(0, 0, w, h).fill(brand.floor);
      g.rect(0, 0, w, h).stroke({ width: 1, color: brand.floorDeep, alignment: 1 });
    },
  },
  grill: {
    w: 2,
    d: 1,
    draw: (g, w, h) => {
      box(g, w, h, brand.char, "#0F0C0B");
      // Bars, which is what makes a grill read as a grill at any size.
      for (let i = 1; i < 6; i += 1) {
        const y = (h * i) / 6;
        g.rect(2, y, w - 4, 1.5).fill("#3A2E26");
      }
    },
  },
  fryer: {
    w: 1,
    d: 1,
    draw: (g, w, h) => {
      box(g, w, h, brand.steel, brand.steelDark);
      g.rect(w * 0.16, h * 0.16, w * 0.68, h * 0.5).fill("#6B4A16");
    },
  },
  prep: {
    w: 3,
    d: 1,
    draw: (g, w, h) => {
      box(g, w, h, brand.steel, brand.steelDark);
      for (let i = 0; i < 3; i += 1) {
        g.rect(w * (0.1 + i * 0.28), h * 0.2, w * 0.2, h * 0.4).fill(
          [brand.lettuce, brand.red, brand.cheese][i] as string,
        );
      }
    },
  },
  toast: {
    w: 1,
    d: 1,
    draw: (g, w, h) => {
      box(g, w, h, brand.steel, brand.steelDark);
      g.rect(w * 0.2, h * 0.24, w * 0.6, h * 0.34).fill(brand.bun);
    },
  },
  assembly: {
    w: 2,
    d: 1,
    draw: (g, w, h) => {
      box(g, w, h, "#C9CFD5", brand.steelDark);
      g.rect(w * 0.1, h * 0.24, w * 0.8, h * 0.28).fill(brand.paper);
    },
  },
  pass: {
    w: 1,
    d: 2,
    draw: (g, w, h) => {
      // The signature element (§11.3): finished orders under a heat lamp. This is the thing a
      // screenshot of the game should be recognisable by, so it gets the only warm glow on the
      // bench and the strongest silhouette.
      box(g, w, h, "#D6DBE0", brand.steelDark);
      g.rect(0, 0, w, h * 0.16).fill(brand.lamp);
      g.rect(w * 0.1, h * 0.28, w * 0.8, h * 0.5).fill(brand.lampHot).stroke({ width: 1, color: brand.char });
    },
  },
  drinks: {
    w: 1,
    d: 1,
    draw: (g, w, h) => {
      box(g, w, h, "#3E5C6B", "#263945");
      g.rect(w * 0.2, h * 0.2, w * 0.6, h * 0.44).fill("#8FC4D6");
    },
  },
  staff: {
    w: 1,
    d: 1,
    draw: (g, w, h) => {
      // Silhouette-first: must read at 12px, so it is a shoulder shape and a head, nothing else.
      g.ellipse(w / 2, h * 0.78, w * 0.34, h * 0.14).fill({ color: 0x000000, alpha: 0.3 });
      g.roundRect(w * 0.22, h * 0.36, w * 0.56, h * 0.42, 2).fill(brand.paper);
      g.rect(w * 0.22, h * 0.58, w * 0.56, h * 0.2).fill(brand.red);
      g.circle(w / 2, h * 0.28, w * 0.2).fill(brand.char);
    },
  },
  customer: {
    w: 1,
    d: 1,
    draw: (g, w, h) => {
      g.ellipse(w / 2, h * 0.8, w * 0.3, h * 0.12).fill({ color: 0x000000, alpha: 0.28 });
      g.roundRect(w * 0.26, h * 0.4, w * 0.48, h * 0.4, 2).fill("#5C6B7A");
      g.circle(w / 2, h * 0.32, w * 0.18).fill("#8A99A8");
    },
  },
  ticket: {
    w: 1,
    d: 1,
    draw: (g, w, h) => {
      g.rect(0, 0, w * 0.7, h).fill(brand.paper).stroke({ width: 1, color: brand.char });
    },
  },
  tray: {
    w: 1,
    d: 1,
    draw: (g, w, h) => {
      g.roundRect(0, h * 0.3, w, h * 0.4, 2).fill(brand.red);
    },
  },
  column: {
    w: 1,
    d: 1,
    draw: (g, w, h) => {
      box(g, w, h, "#6B6560", "#4A443F");
    },
  },
};

export class ShapeRegistry {
  private readonly textures = new Map<ShapeId, Texture>();

  constructor(private readonly renderer: Renderer) {}

  /** Draws every primitive once. Called at boot; nothing here runs per frame. */
  build(): void {
    for (const [id, spec] of Object.entries(SPECS) as [ShapeId, ShapeSpec][]) {
      const w = spec.w * TILE;
      const h = spec.d * TILE + TILE * LEAN;
      const g = new Graphics();
      spec.draw(g, w, h);
      const texture = RenderTexture.create({ width: w, height: h, resolution: 2 });
      this.renderer.render({ container: g, target: texture });
      g.destroy();
      this.textures.set(id, texture);
    }
  }

  get(id: ShapeId): Texture {
    const texture = this.textures.get(id);
    if (!texture) throw new Error(`shape not built: ${id}`);
    return texture;
  }

  size(id: ShapeId): { w: number; d: number } {
    const spec = SPECS[id];
    return { w: spec.w, d: spec.d };
  }

  destroy(): void {
    for (const t of this.textures.values()) t.destroy(true);
    this.textures.clear();
  }
}

export const shapeIds = Object.keys(SPECS) as ShapeId[];
