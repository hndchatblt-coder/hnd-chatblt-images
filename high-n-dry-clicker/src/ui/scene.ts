/**
 * The Pass — canvas scene. Brushed steel bench under a heat lamp, a grill grate, and the patty.
 * Per DESIGN_TOKENS.md the lamp is a real light source (its intensity tracks production) and the
 * tap feedback is "The Sear": squash, flame flare, grease spit, and a docket that prints and
 * flicks up onto the ticket rail.
 *
 * Canvas owns the scene and particles only. All chrome is DOM (BUILD_BRIEF §5).
 */
const W = 390;
const H = 372;

// DESIGN_TOKENS.md palette. Lamp amber and sear red appear as gradient stops inline where their
// alpha varies with intensity, so they aren't repeated as flat constants here.
const STEEL = "#8A9199";
const STEEL_DARK = "#4A5158";
const CHAR = "#241F1C";
const DOCKET = "#F6F1E4";

const PATTY_X = W / 2;
const PATTY_Y = 236;
const PATTY_RX = 84;
const PATTY_RY = 38;
const PATTY_SIDE = 26;
/** Where the back wall meets the bench. Above the patty so it reads as sitting ON the pass. */
const BENCH_TOP = 196;
const GRATE_TOP = 250;
const GRATE_HEIGHT = 76;
const RAIL_Y = 22;
const MAX_RAIL_DOCKETS = 8;

interface Grease {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
}

interface Smoke {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  r: number;
}

interface FlyingDocket {
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
  rot: number;
  text: string;
}

interface RailDocket {
  slot: number;
  text: string;
  age: number;
  rot: number;
}

export class Scene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private scale = 1;
  private reduced = false;

  private squash = 0;
  private flare = 0;
  private busy = 0;
  private lampPulse = 0;

  private grease: Grease[] = [];
  private smoke: Smoke[] = [];
  private flying: FlyingDocket[] = [];
  private rail: RailDocket[] = [];
  private railSlot = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize();
    window.addEventListener("resize", this.resize);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
  }

  private resize = (): void => {
    const cssWidth = this.canvas.clientWidth || W;
    const cssHeight = (cssWidth * H) / W;
    this.canvas.style.height = `${cssHeight}px`;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.scale = this.canvas.width / W;
  };

  /** 0..1, how hard the kitchen is going. Drives lamp intensity and ambient sizzle. */
  setBusy(amount: number): void {
    this.busy = Math.max(0, Math.min(1, amount));
  }

  /** Is this point on the patty? Used to keep the hit target honest. */
  hitsPatty(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;
    const dx = (x - PATTY_X) / (PATTY_RX + 14);
    const dy = (y - PATTY_Y) / (PATTY_RY + PATTY_SIDE + 12);
    return dx * dx + dy * dy <= 1;
  }

  /** The Sear. One tap. */
  tap(text: string): void {
    this.squash = 1;
    this.flare = 1;
    this.lampPulse = 1;

    if (!this.reduced) {
      const count = 7;
      for (let i = 0; i < count; i += 1) {
        const angle = Math.PI + Math.random() * Math.PI;
        const speed = 60 + Math.random() * 130;
        this.grease.push({
          x: PATTY_X + (Math.random() - 0.5) * PATTY_RX,
          y: PATTY_Y - 6,
          vx: Math.cos(angle) * speed * 0.7,
          vy: Math.sin(angle) * speed,
          life: 0.5 + Math.random() * 0.4,
          max: 0.9,
          r: 1.2 + Math.random() * 2,
        });
      }
      this.smoke.push({
        x: PATTY_X + (Math.random() - 0.5) * 40,
        y: PATTY_Y - 24,
        vy: -22 - Math.random() * 16,
        life: 1.1,
        max: 1.1,
        r: 10 + Math.random() * 10,
      });
    }

    const slot = this.railSlot % MAX_RAIL_DOCKETS;
    this.railSlot += 1;
    this.flying.push({
      x: PATTY_X + (Math.random() - 0.5) * 30,
      y: PATTY_Y - 20,
      tx: this.slotX(slot),
      ty: RAIL_Y + 20,
      t: 0,
      rot: (Math.random() - 0.5) * 0.5,
      text,
    });
  }

  private slotX(slot: number): number {
    const gap = W / (MAX_RAIL_DOCKETS + 1);
    return gap * (slot + 1);
  }

  private frame = (now: number): void => {
    const t = now / 1000;
    const dt = Math.min(0.05, this.lastAt === 0 ? 0.016 : t - this.lastAt);
    this.lastAt = t;
    this.update(dt);
    this.draw(t);
    this.raf = requestAnimationFrame(this.frame);
  };
  private lastAt = 0;

  private update(dt: number): void {
    const decay = (v: number, rate: number): number => v * Math.pow(rate, dt);
    this.squash = decay(this.squash, 0.0008);
    this.flare = decay(this.flare, 0.004);
    this.lampPulse = decay(this.lampPulse, 0.01);

    for (const g of this.grease) {
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vy += 420 * dt;
      g.life -= dt;
    }
    this.grease = this.grease.filter((g) => g.life > 0).slice(-70);

    for (const s of this.smoke) {
      s.y += s.vy * dt;
      s.r += 14 * dt;
      s.life -= dt;
    }
    this.smoke = this.smoke.filter((s) => s.life > 0).slice(-14);

    for (const d of this.flying) d.t += dt * 2.6;
    const landed = this.flying.filter((d) => d.t >= 1);
    for (const d of landed) {
      const slot = Math.round((d.tx / (W / (MAX_RAIL_DOCKETS + 1))) - 1);
      this.rail = this.rail.filter((r) => r.slot !== slot);
      this.rail.push({ slot, text: d.text, age: 0, rot: d.rot * 0.6 });
      if (this.rail.length > MAX_RAIL_DOCKETS) this.rail.shift();
    }
    this.flying = this.flying.filter((d) => d.t < 1);
    for (const r of this.rail) r.age += dt;
  }

  /* ------------------------------------------------------------------ draw */

  private draw(t: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    this.drawRoom(t);
    this.drawLamp(t);
    this.drawRail();
    this.drawBench();
    this.drawGrate(t);
    this.drawFlames(t);
    this.drawPatty(t);
    this.drawSmoke();
    this.drawGrease();
    this.drawFlyingDockets();
  }

  private drawRoom(t: number): void {
    const ctx = this.ctx;
    const wall = ctx.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, "#5A626A");
    wall.addColorStop(0.45, STEEL_DARK);
    wall.addColorStop(1, "#3A4046");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H);

    // Brushed-steel grain.
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1;
    for (let y = 8; y < H; y += 7) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin((y + t * 4) * 0.4) * 0.6);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawLamp(t: number): void {
    const ctx = this.ctx;
    const intensity = 0.35 + this.busy * 0.4 + this.lampPulse * 0.25 + Math.sin(t * 1.7) * 0.02;

    // Light cone falling onto the pass.
    const cone = ctx.createRadialGradient(PATTY_X, 96, 20, PATTY_X, 300, 300);
    cone.addColorStop(0, `rgba(255,158,27,${0.30 * intensity})`);
    cone.addColorStop(0.45, `rgba(255,158,27,${0.13 * intensity})`);
    cone.addColorStop(1, "rgba(255,158,27,0)");
    ctx.fillStyle = cone;
    ctx.fillRect(0, 70, W, H - 70);

    // Housing.
    ctx.fillStyle = "#2E3338";
    ctx.fillRect(72, 74, W - 144, 15);
    ctx.fillStyle = "#5C646C";
    ctx.fillRect(72, 74, W - 144, 4);
    ctx.fillStyle = "#1C2024";
    ctx.fillRect(72, 89, W - 144, 3);

    // Bulbs.
    for (let i = 0; i < 3; i += 1) {
      const x = W / 2 + (i - 1) * 62;
      const glow = ctx.createRadialGradient(x, 92, 1, x, 92, 26);
      glow.addColorStop(0, `rgba(255,190,90,${0.85 * intensity + 0.15})`);
      glow.addColorStop(1, "rgba(255,158,27,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, 92, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,214,150,${0.75 + intensity * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(x, 91, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRail(): void {
    const ctx = this.ctx;
    // The rod.
    ctx.fillStyle = "#20242A";
    ctx.fillRect(0, RAIL_Y, W, 5);
    ctx.fillStyle = "#727A82";
    ctx.fillRect(0, RAIL_Y, W, 2);

    for (const r of this.rail) {
      const x = this.slotX(r.slot);
      const fade = Math.max(0.35, 1 - r.age / 26);
      ctx.save();
      ctx.translate(x, RAIL_Y + 5);
      ctx.rotate(r.rot);
      ctx.globalAlpha = fade;
      this.docketShape(0, 0, 34, 26);
      ctx.fillStyle = CHAR;
      ctx.font = "700 8px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(r.text, 0, 17);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  /** Thermal-paper docket with a torn top edge. Squared corners — nothing rounder than a steel edge. */
  private docketShape(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    const teeth = 6;
    for (let i = 0; i < teeth; i += 1) {
      const step = w / teeth;
      ctx.lineTo(x - w / 2 + step * (i + 0.5), y + 2.2);
      ctx.lineTo(x - w / 2 + step * (i + 1), y);
    }
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x - w / 2, y + h);
    ctx.closePath();
    ctx.fillStyle = DOCKET;
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(x - w / 2, y + h - 2, w, 2);
  }

  private drawBench(): void {
    const ctx = this.ctx;
    const bench = ctx.createLinearGradient(0, BENCH_TOP, 0, H);
    bench.addColorStop(0, "#767E86");
    bench.addColorStop(0.3, STEEL);
    bench.addColorStop(1, "#5F676E");
    ctx.fillStyle = bench;
    ctx.fillRect(0, BENCH_TOP, W, H - BENCH_TOP);
    // Lit front lip where the lamp catches the steel edge.
    ctx.fillStyle = "rgba(255,214,160,0.22)";
    ctx.fillRect(0, BENCH_TOP, W, 2);
  }

  private drawGrate(t: number): void {
    const ctx = this.ctx;
    // Full bleed: the grill is the bench's cooking surface, not a tray sitting on it. A boxed
    // rectangle read as a floating object in the first screenshot pass.
    const left = 0;
    const right = W;
    const top = GRATE_TOP;
    const height = GRATE_HEIGHT;

    ctx.fillStyle = "#191614";
    ctx.fillRect(left, top - 4, right - left, height + 10);
    ctx.fillStyle = "#0E0C0B";
    ctx.fillRect(left, top + height + 2, right - left, 4);

    // Embers glowing between the bars.
    const emberAlpha = 0.20 + this.busy * 0.35 + this.flare * 0.3;
    const ember = ctx.createLinearGradient(0, top, 0, top + height);
    ember.addColorStop(0, `rgba(226,64,28,${emberAlpha})`);
    ember.addColorStop(1, `rgba(120,20,8,${emberAlpha * 0.4})`);
    ctx.fillStyle = ember;
    ctx.fillRect(left - 6, top - 2, right - left + 12, height + 4);

    ctx.strokeStyle = "#2A2724";
    ctx.lineWidth = 5;
    for (let i = 0; i <= 9; i += 1) {
      const y = top + (i / 9) * height;
      ctx.beginPath();
      ctx.moveTo(left - 6, y);
      ctx.lineTo(right + 6, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 9; i += 1) {
      const y = top + (i / 9) * height - 2;
      ctx.beginPath();
      ctx.moveTo(left - 6, y);
      ctx.lineTo(right + 6, y);
      ctx.stroke();
    }
    void t;
  }

  private drawFlames(t: number): void {
    if (this.reduced) return;
    const ctx = this.ctx;
    const strength = 0.55 + this.busy * 0.5 + this.flare * 1.1;
    const count = 11;
    for (let i = 0; i < count; i += 1) {
      const x = 56 + (i / (count - 1)) * (W - 112);
      const wobble = Math.sin(t * 7 + i * 1.9) * 0.5 + 0.5;
      const height = (26 + wobble * 34) * strength;
      if (height < 3) continue;
      // Rise from the patty's contact line so the flames lick up around its edges.
      const base = PATTY_Y + PATTY_SIDE + PATTY_RY * 0.5;
      const flame = ctx.createLinearGradient(0, base - height, 0, base);
      flame.addColorStop(0, "rgba(255,226,140,0.0)");
      flame.addColorStop(0.35, `rgba(255,196,80,${0.55 * strength})`);
      flame.addColorStop(0.75, `rgba(255,120,40,${0.5 * strength})`);
      flame.addColorStop(1, "rgba(226,64,28,0)");
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(x - 7, base);
      ctx.quadraticCurveTo(x - 2, base - height * 0.6, x, base - height);
      ctx.quadraticCurveTo(x + 2, base - height * 0.6, x + 7, base);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawPatty(t: number): void {
    const ctx = this.ctx;
    const squashAmount = this.squash * 0.22;
    const rx = PATTY_RX * (1 + squashAmount * 0.5);
    const ry = PATTY_RY * (1 - squashAmount);
    const side = PATTY_SIDE * (1 - squashAmount * 1.1);
    const cy = PATTY_Y + squashAmount * 10 + Math.sin(t * 1.3) * 0.6;

    // Contact shadow.
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(PATTY_X, cy + side + 12, rx * 0.94, ry * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Heat halo.
    const halo = ctx.createRadialGradient(PATTY_X, cy, rx * 0.5, PATTY_X, cy, rx * 1.7);
    halo.addColorStop(0, `rgba(255,158,27,${0.10 + this.flare * 0.30})`);
    halo.addColorStop(1, "rgba(255,158,27,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(PATTY_X, cy, rx * 1.7, (ry + side) * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Side wall of the patty.
    ctx.fillStyle = "#4A2A16";
    ctx.beginPath();
    ctx.ellipse(PATTY_X, cy + side, rx, ry, 0, 0, Math.PI);
    ctx.rect(PATTY_X - rx, cy, rx * 2, side);
    ctx.fill();
    // Sear line where the crust meets the grill.
    ctx.fillStyle = "rgba(226,64,28,0.30)";
    ctx.fillRect(PATTY_X - rx, cy + side - 5, rx * 2, 5);

    // Top face.
    const top = ctx.createRadialGradient(
      PATTY_X - rx * 0.3,
      cy - ry * 0.5,
      4,
      PATTY_X,
      cy,
      rx * 1.15,
    );
    top.addColorStop(0, "#9A6136");
    top.addColorStop(0.55, "#6E3F1F");
    top.addColorStop(1, "#4A2714");
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.ellipse(PATTY_X, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Char marks.
    ctx.strokeStyle = "rgba(26,18,12,0.75)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    for (let i = -1; i <= 1; i += 1) {
      const offset = i * ry * 0.52;
      ctx.beginPath();
      ctx.ellipse(PATTY_X, cy + offset, rx * 0.74, ry * 0.2, 0, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
    }
    ctx.lineCap = "butt";

    // Crust speckle.
    ctx.fillStyle = "rgba(30,18,10,0.35)";
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2 + i;
      const radius = Math.sqrt((i % 7) / 7) * 0.85;
      ctx.beginPath();
      ctx.arc(
        PATTY_X + Math.cos(angle) * rx * radius,
        cy + Math.sin(angle) * ry * radius,
        1.1 + (i % 3) * 0.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Rim light from the lamp.
    ctx.strokeStyle = `rgba(255,196,110,${0.4 + this.flare * 0.5})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(PATTY_X, cy, rx - 1, ry - 1, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();

    // Glisten.
    ctx.fillStyle = `rgba(255,232,190,${0.30 + this.flare * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(PATTY_X - rx * 0.34, cy - ry * 0.42, rx * 0.18, ry * 0.16, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSmoke(): void {
    const ctx = this.ctx;
    for (const s of this.smoke) {
      const alpha = (s.life / s.max) * 0.16;
      ctx.fillStyle = `rgba(232,232,228,${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawGrease(): void {
    const ctx = this.ctx;
    for (const g of this.grease) {
      const alpha = Math.min(1, g.life / g.max) * 0.95;
      ctx.fillStyle = `rgba(255,190,110,${alpha})`;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFlyingDockets(): void {
    const ctx = this.ctx;
    for (const d of this.flying) {
      const e = 1 - Math.pow(1 - d.t, 3);
      const x = d.x + (d.tx - d.x) * e;
      const y = d.y + (d.ty - d.y) * e - Math.sin(Math.min(1, d.t) * Math.PI) * 46;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(d.rot * (1 - e) * 3);
      ctx.globalAlpha = Math.min(1, (1 - d.t) * 3);
      this.docketShape(0, 0, 38, 28);
      ctx.fillStyle = CHAR;
      ctx.font = "700 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(d.text, 0, 18);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
}

export const SCENE_ASPECT = H / W;
