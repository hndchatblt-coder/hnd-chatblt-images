/**
 * The shop — canvas scene.
 *
 * The reframe (Ben, after M2): a clicker where buying things only changes a number is inert.
 * Here the shop IS the readout. Every generator bought physically appears — a fryer, someone
 * standing at the grill, a delivery hatch, a second venue's sign — and the customer traffic
 * thickens as the business grows. Tapping serves a customer at the counter; your staff serve the
 * rest on their own, which is idle income made visible.
 *
 * Canvas owns the scene and particles only. All chrome is DOM (BUILD_BRIEF §5).
 */
const W = 390;
const H = 330;

const STEEL = "#8A9199";

const LAMP_BAR_Y = 20;
const LAMP_BULB_Y = 38;
/** Back wall meets the bench here. */
const BENCH_TOP = 112;
const GRATE_TOP = 126;
const GRATE_HEIGHT = 36;
const COUNTER_TOP = 172;
const COUNTER_H = 20;
/** Customers stand on this line, in front of the counter. */
const FLOOR_Y = 286;
const QUEUE_X = 58;
const QUEUE_STEP = 46;
const MAX_QUEUE = 7;

const PATTY_X = 74;
const PATTY_Y = 142;
const PATTY_RX = 30;
const PATTY_RY = 13;
const PATTY_SIDE = 9;

const SKIN = ["#F2CBA3", "#E5B183", "#CE9463", "#A9714A", "#835434", "#FBDDBC"];
const HAIR = ["#2C1D12", "#4A2E19", "#6E4626", "#7C2E2E", "#3A3A3A", "#C8A24E", "#584070", "#D8D2C6"];
const SHIRT = ["#C6553F", "#3E7FA8", "#4F8F42", "#C99A2E", "#6E5AA8", "#B96A93", "#2F8C82", "#C4763A"];

interface Customer {
  id: number;
  x: number;
  targetX: number;
  state: "in" | "wait" | "served" | "leaving";
  skin: string;
  hair: string;
  hairStyle: number;
  shirt: string;
  bob: number;
  pop: number;
  /** Ticks down while the "served by staff" tick shows above them. */
  autoT: number;
}

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

interface RisingNumber {
  x: number;
  y: number;
  t: number;
  drift: number;
  text: string;
}

/** What the shop should look like right now — pushed in from the engine every frame. */
export interface Business {
  /** Owned count per generator, parallel to config.generators.list. */
  generators: number[];
  /** 0..1 how hard the kitchen is going. Drives lamp, flames and traffic. */
  busy: number;
  /** Serves per second the staff manage on their own. Visual only — cash comes from the engine. */
  autoServesPerSecond: number;
}

export class Scene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private scale = 1;
  private reduced = false;
  private lastAt = 0;
  private nextId = 1;

  private squash = 0;
  private flare = 0;
  private lampPulse = 0;
  private business: Business = { generators: [], busy: 0, autoServesPerSecond: 0 };

  private customers: Customer[] = [];
  private grease: Grease[] = [];
  private smoke: Smoke[] = [];
  private rising: RisingNumber[] = [];
  private nextArrival = 0.6;
  private autoCredit = 0;
  private lastServedX = W / 2;

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

  setBusiness(business: Business): void {
    this.business = business;
  }

  private owned(index: number): number {
    return this.business.generators[index] ?? 0;
  }

  /** How many are queued or walking in. */
  private waiting(): Customer[] {
    return this.customers.filter((c) => c.state === "in" || c.state === "wait");
  }

  /**
   * Tap. Serves the customer nearest the tap if there's one there. Returns true if a sale
   * happened, so the caller can charge the engine for exactly one click.
   */
  tapAt(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;

    let best: Customer | null = null;
    let bestDistance = 46;
    for (const c of this.customers) {
      if (c.state !== "wait") continue;
      const d = Math.hypot(c.x - x, FLOOR_Y - 30 - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = c;
      }
    }
    if (!best) return false;
    this.serve(best, false);
    return true;
  }

  /** Attaches the take to the last customer served, so the number rises where the eye is. */
  showSale(text: string): void {
    this.rising.push({
      x: this.lastServedX,
      y: FLOOR_Y - 74,
      t: 0,
      drift: (Math.random() - 0.5) * 18,
      text,
    });
    if (this.rising.length > 20) this.rising.shift();
  }

  private serve(customer: Customer, auto: boolean): void {
    customer.state = "served";
    customer.pop = 1;
    this.lastServedX = customer.x;
    if (auto) {
      customer.autoT = 0.9;
      return;
    }
    this.squash = 1;
    this.flare = 1;
    this.lampPulse = 1;
    if (this.reduced) return;
    for (let i = 0; i < 7; i += 1) {
      const angle = Math.PI + Math.random() * Math.PI;
      const speed = 55 + Math.random() * 120;
      this.grease.push({
        x: PATTY_X + (Math.random() - 0.5) * PATTY_RX,
        y: PATTY_Y - 4,
        vx: Math.cos(angle) * speed * 0.7,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.35,
        max: 0.8,
        r: 1 + Math.random() * 1.8,
      });
    }
    this.smoke.push({
      x: PATTY_X + (Math.random() - 0.5) * 24,
      y: PATTY_Y - 18,
      vy: -20 - Math.random() * 14,
      life: 1,
      max: 1,
      r: 7 + Math.random() * 7,
    });
  }

  private frame = (now: number): void => {
    const t = now / 1000;
    const dt = Math.min(0.05, this.lastAt === 0 ? 0.016 : t - this.lastAt);
    this.lastAt = t;
    this.update(dt);
    this.draw(t);
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const decay = (v: number, rate: number): number => v * Math.pow(rate, dt);
    this.squash = decay(this.squash, 0.0008);
    this.flare = decay(this.flare, 0.004);
    this.lampPulse = decay(this.lampPulse, 0.01);

    // Traffic thickens with the business. Never so fast the queue is a wall of strangers.
    const staff = this.business.generators.reduce((a, b) => a + b, 0);
    // A burger bar always has someone at the counter. If arrivals are sparse the player simply
    // cannot tap — serving would be throttled by traffic rather than by their thumb, which the
    // economy (tuned around ~2 taps/sec) does not expect.
    const arrivalGap = Math.max(0.35, 1.2 - Math.log10(1 + staff) * 0.35);
    this.nextArrival -= dt;
    if (this.nextArrival <= 0) {
      this.nextArrival = arrivalGap * (0.6 + Math.random() * 0.8);
      if (this.waiting().length < MAX_QUEUE) this.spawn();
    }

    // Staff serve on their own — idle income, made visible.
    this.autoCredit += this.business.autoServesPerSecond * dt;
    while (this.autoCredit >= 1) {
      this.autoCredit -= 1;
      const front = this.customers.find((c) => c.state === "wait");
      if (!front) {
        this.autoCredit = 0;
        break;
      }
      this.serve(front, true);
    }

    let slot = 0;
    for (const c of this.customers) {
      if (c.state === "in" || c.state === "wait") {
        c.targetX = QUEUE_X + slot * QUEUE_STEP;
        slot += 1;
        const speed = c.state === "in" ? 4 : 7;
        c.x += (c.targetX - c.x) * Math.min(1, dt * speed);
        if (c.state === "in" && Math.abs(c.x - c.targetX) < 4) c.state = "wait";
      } else if (c.state === "served") {
        c.pop = Math.max(0, c.pop - dt * 2.6);
        c.autoT = Math.max(0, c.autoT - dt);
        if (c.pop <= 0 && c.autoT <= 0) c.state = "leaving";
      } else {
        c.x -= 132 * dt;
      }
      c.bob += dt;
    }
    this.customers = this.customers.filter((c) => c.x > -40);

    for (const g of this.grease) {
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vy += 420 * dt;
      g.life -= dt;
    }
    this.grease = this.grease.filter((g) => g.life > 0).slice(-60);

    for (const s of this.smoke) {
      s.y += s.vy * dt;
      s.r += 12 * dt;
      s.life -= dt;
    }
    this.smoke = this.smoke.filter((s) => s.life > 0).slice(-12);

    for (const r of this.rising) r.t += dt * 1.35;
    this.rising = this.rising.filter((r) => r.t < 1);
  }

  private spawn(): void {
    const id = this.nextId;
    this.nextId += 1;
    this.customers.push({
      id,
      x: W + 24,
      targetX: W,
      state: "in",
      skin: SKIN[id % SKIN.length] as string,
      hair: HAIR[(id * 3) % HAIR.length] as string,
      hairStyle: id % 4,
      shirt: SHIRT[(id * 5) % SHIRT.length] as string,
      bob: Math.random() * 6,
      pop: 0,
      autoT: 0,
    });
  }

  /* ------------------------------------------------------------------ draw */

  private draw(t: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.drawRoom(t);
    this.drawMenuBoard();
    this.drawLamp(t);
    this.drawStations(t);
    this.drawBench();
    this.drawGrill(t);
    this.drawPatty(t);
    this.drawSmoke();
    this.drawGrease();
    this.drawCounter();
    this.drawCustomers(t);
    this.drawRisingNumbers();
  }

  private drawRoom(t: number): void {
    const ctx = this.ctx;
    const wall = ctx.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, "#5A626A");
    wall.addColorStop(0.4, "#4A5158");
    wall.addColorStop(1, "#2F343A");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1;
    for (let y = 6; y < BENCH_TOP; y += 7) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin((y + t * 3) * 0.4) * 0.5);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Specials board. Fills the back wall, and it's the most honest object in a burger bar. */
  private drawMenuBoard(): void {
    const ctx = this.ctx;
    const x = 150;
    const y = 52;
    const w = 224;
    const h = 52;
    ctx.fillStyle = "#1B1F23";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#2A3036";
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = "rgba(255,190,110,0.9)";
    ctx.font = "700 10px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("HIGH N' DRY", x + 10, y + 18);
    ctx.fillStyle = "rgba(246,241,228,0.62)";
    ctx.font = "8px ui-monospace, monospace";
    ctx.fillText("FLAME-GRILLED", x + 10, y + 30);
    ctx.fillText("CHIPS", x + 10, y + 41);
    ctx.fillStyle = "rgba(246,241,228,0.42)";
    ctx.textAlign = "right";
    ctx.fillText("12", x + w - 10, y + 30);
    ctx.fillText("5", x + w - 10, y + 41);
    ctx.textAlign = "left";
  }

  private drawLamp(t: number): void {
    const ctx = this.ctx;
    const intensity = 0.35 + this.business.busy * 0.4 + this.lampPulse * 0.25 + Math.sin(t * 1.7) * 0.02;

    const cone = ctx.createRadialGradient(W / 2, LAMP_BULB_Y, 16, W / 2, COUNTER_TOP, 260);
    cone.addColorStop(0, `rgba(255,158,27,${0.26 * intensity})`);
    cone.addColorStop(0.5, `rgba(255,158,27,${0.11 * intensity})`);
    cone.addColorStop(1, "rgba(255,158,27,0)");
    ctx.fillStyle = cone;
    ctx.fillRect(0, LAMP_BAR_Y, W, H - LAMP_BAR_Y);

    ctx.fillStyle = "#2E3338";
    ctx.fillRect(52, LAMP_BAR_Y, W - 104, 13);
    ctx.fillStyle = "#5C646C";
    ctx.fillRect(52, LAMP_BAR_Y, W - 104, 3);

    for (let i = 0; i < 3; i += 1) {
      const x = W / 2 + (i - 1) * 74;
      const glow = ctx.createRadialGradient(x, LAMP_BULB_Y, 1, x, LAMP_BULB_Y, 24);
      glow.addColorStop(0, `rgba(255,190,90,${0.8 * intensity + 0.15})`);
      glow.addColorStop(1, "rgba(255,158,27,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, LAMP_BULB_Y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,214,150,${0.7 + intensity * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(x, LAMP_BULB_Y - 1, 8, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * The business, made visible. Each generator you own puts something real behind the counter.
   * This is the whole point of the reframe: buying changes the shop, not just a number.
   */
  private drawStations(t: number): void {
    const ctx = this.ctx;

    // 2 fryer, 3 grill hand, 4 front of house, 5 delivery hatch, 6+ venues on the board.
    if (this.owned(1) > 0) this.drawFryer(158, GRATE_TOP - 14, t);
    if (this.owned(4) > 0) this.drawHatch(310, GRATE_TOP - 26);
    if (this.owned(2) > 0) this.drawStaff(112, BENCH_TOP - 4, "#E8E3D8", t, 0);
    if (this.owned(3) > 0) this.drawStaff(212, BENCH_TOP - 4, "#D8E3EA", t, 1.7);
    if (this.owned(0) > 0) this.drawTongs(48, GRATE_TOP - 16, this.owned(0));

    // Venues earn a line on the board.
    const venues = ["ROSEBERY", "NEUTRAL BAY", "GHOST KITCHEN", "FRANCHISE", "FACTORY", "STATION", "FUTURES"];
    const listed = venues.filter((_, i) => this.owned(5 + i) > 0);
    if (listed.length > 0) {
      ctx.fillStyle = "rgba(20,18,16,0.55)";
      ctx.fillRect(W - 118, 62, 112, 12 + listed.length * 11);
      ctx.fillStyle = "rgba(255,190,110,0.85)";
      ctx.font = "700 7px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("NOW TRADING", W - 112, 72);
      ctx.fillStyle = "rgba(246,241,228,0.75)";
      listed.forEach((name, i) => ctx.fillText(name, W - 112, 83 + i * 11));
    }
  }

  private drawTongs(x: number, y: number, count: number): void {
    const ctx = this.ctx;
    const pairs = Math.min(4, Math.ceil(count / 12));
    ctx.strokeStyle = "#B9C0C7";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < pairs; i += 1) {
      const px = x + i * 7;
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px + 3, y - 16);
      ctx.moveTo(px + 3, y);
      ctx.lineTo(px + 3, y - 16);
      ctx.stroke();
    }
  }

  private drawFryer(x: number, y: number, t: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#C3CAD1";
    ctx.fillRect(x - 26, y - 16, 52, 30);
    ctx.fillStyle = "#E4E9ED";
    ctx.fillRect(x - 26, y - 16, 52, 5);
    ctx.fillStyle = "#E8B93F";
    ctx.fillRect(x - 21, y - 6, 42, 14);
    // Basket bubbling.
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    for (let i = 0; i < 4; i += 1) {
      const bx = x - 15 + i * 10;
      const by = y + 4 - ((t * 22 + i * 9) % 12);
      ctx.beginPath();
      ctx.arc(bx, by, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#8A9199";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 18, y - 8);
    ctx.lineTo(x + 26, y - 18);
    ctx.stroke();
  }

  private drawHatch(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#20252A";
    ctx.fillRect(x - 34, y, 68, 34);
    ctx.fillStyle = "#3D454C";
    ctx.fillRect(x - 30, y + 4, 60, 22);
    ctx.fillStyle = "rgba(255,190,110,0.5)";
    ctx.font = "700 7px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("PICKUP", x, y + 18);
    ctx.textAlign = "left";
  }

  private drawStaff(x: number, groundY: number, whites: string, t: number, phase: number): void {
    const ctx = this.ctx;
    const bob = Math.sin(t * 3 + phase) * 1.2;
    const y = groundY + bob;
    ctx.fillStyle = whites;
    ctx.fillRect(x - 9, y - 22, 18, 22);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(x - 9, y - 9, 18, 9);
    ctx.fillStyle = "#E5B183";
    ctx.beginPath();
    ctx.arc(x, y - 28, 7, 0, Math.PI * 2);
    ctx.fill();
    // Cap.
    ctx.fillStyle = whites;
    ctx.fillRect(x - 8, y - 36, 16, 5);
    ctx.beginPath();
    ctx.arc(x, y - 36, 6, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#241F1C";
    ctx.beginPath();
    ctx.arc(x - 2.4, y - 28, 1, 0, Math.PI * 2);
    ctx.arc(x + 2.4, y - 28, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBench(): void {
    const ctx = this.ctx;
    const bench = ctx.createLinearGradient(0, BENCH_TOP, 0, COUNTER_TOP);
    bench.addColorStop(0, "#767E86");
    bench.addColorStop(1, STEEL);
    ctx.fillStyle = bench;
    ctx.fillRect(0, BENCH_TOP, W, COUNTER_TOP - BENCH_TOP);
    ctx.fillStyle = "rgba(255,214,160,0.22)";
    ctx.fillRect(0, BENCH_TOP, W, 2);
  }

  private drawGrill(t: number): void {
    const ctx = this.ctx;
    const left = 18;
    const right = 138;
    ctx.fillStyle = "#191614";
    ctx.fillRect(left, GRATE_TOP, right - left, GRATE_HEIGHT);
    const emberAlpha = 0.2 + this.business.busy * 0.3 + this.flare * 0.3;
    ctx.fillStyle = `rgba(226,64,28,${emberAlpha})`;
    ctx.fillRect(left, GRATE_TOP, right - left, GRATE_HEIGHT);
    ctx.strokeStyle = "#2A2724";
    ctx.lineWidth = 4;
    for (let i = 0; i <= 5; i += 1) {
      const y = GRATE_TOP + (i / 5) * GRATE_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    if (this.reduced) return;
    const strength = 0.45 + this.business.busy * 0.45 + this.flare;
    for (let i = 0; i < 5; i += 1) {
      const x = left + 14 + i * 24;
      const wobble = Math.sin(t * 7 + i * 1.9) * 0.5 + 0.5;
      const height = (10 + wobble * 14) * strength;
      const base = GRATE_TOP + 6;
      const flame = ctx.createLinearGradient(0, base - height, 0, base);
      flame.addColorStop(0, "rgba(255,226,140,0)");
      flame.addColorStop(0.4, `rgba(255,196,80,${0.5 * strength})`);
      flame.addColorStop(1, "rgba(226,64,28,0)");
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(x - 5, base);
      ctx.quadraticCurveTo(x, base - height, x + 5, base);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** The patty still cooks — it's the anchor, just no longer the button. */
  private drawPatty(t: number): void {
    const ctx = this.ctx;
    const squashAmount = this.squash * 0.22;
    const rx = PATTY_RX * (1 + squashAmount * 0.5);
    const ry = PATTY_RY * (1 - squashAmount);
    const side = PATTY_SIDE * (1 - squashAmount);
    const cy = PATTY_Y + Math.sin(t * 1.3) * 0.4;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(PATTY_X, cy + side + 5, rx * 0.9, ry * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4A2A16";
    ctx.beginPath();
    ctx.ellipse(PATTY_X, cy + side, rx, ry, 0, 0, Math.PI);
    ctx.rect(PATTY_X - rx, cy, rx * 2, side);
    ctx.fill();

    const top = ctx.createRadialGradient(PATTY_X - rx * 0.3, cy - ry * 0.5, 2, PATTY_X, cy, rx * 1.2);
    top.addColorStop(0, "#9A6136");
    top.addColorStop(0.6, "#6E3F1F");
    top.addColorStop(1, "#4A2714");
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.ellipse(PATTY_X, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(26,18,12,0.7)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.ellipse(PATTY_X, cy + i * ry * 0.5, rx * 0.7, ry * 0.18, 0, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
    ctx.lineCap = "butt";

    ctx.strokeStyle = `rgba(255,196,110,${0.35 + this.flare * 0.5})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(PATTY_X, cy, rx - 1, ry - 1, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }

  private drawCounter(): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, COUNTER_TOP, 0, COUNTER_TOP + COUNTER_H);
    g.addColorStop(0, "#9AA2AA");
    g.addColorStop(1, "#5F676E");
    ctx.fillStyle = g;
    ctx.fillRect(0, COUNTER_TOP, W, COUNTER_H);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(0, COUNTER_TOP, W, 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, COUNTER_TOP + COUNTER_H - 2, W, 2);
    // Floor.
    const floor = ctx.createLinearGradient(0, COUNTER_TOP + COUNTER_H, 0, H);
    floor.addColorStop(0, "#393F45");
    floor.addColorStop(1, "#282D32");
    ctx.fillStyle = floor;
    ctx.fillRect(0, COUNTER_TOP + COUNTER_H, W, H - COUNTER_TOP - COUNTER_H);
  }

  private drawCustomers(t: number): void {
    const ctx = this.ctx;
    for (const c of this.customers) {
      const idle = c.state === "wait" ? Math.sin(c.bob * 3) * 1.3 : 0;
      const y = FLOOR_Y + idle;
      const x = c.x;

      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(x, y + 3, 17, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // A customer you can serve glows — the only thing on screen asking to be tapped.
      if (c.state === "wait") {
        const glow = ctx.createRadialGradient(x, y - 26, 2, x, y - 26, 38);
        const pulse = 0.26 + Math.sin(t * 3.4 + c.id) * 0.1;
        glow.addColorStop(0, `rgba(255,190,90,${pulse})`);
        glow.addColorStop(1, "rgba(255,158,27,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x - 38, y - 64, 76, 76);
      }
      if (c.pop > 0) {
        ctx.strokeStyle = `rgba(255,240,210,${c.pop * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - 28, 14 + (1 - c.pop) * 24, 0, Math.PI * 2);
        ctx.stroke();
      }

      const scale = c.pop > 0 ? 1 + Math.sin(c.pop * Math.PI) * 0.1 : 1;
      const bodyW = 30 * scale;
      const bodyH = 34 / scale;
      ctx.fillStyle = c.shirt;
      // Shoulders, not a pill: a slightly tapered torso with sleeves reads as a person.
      ctx.beginPath();
      ctx.moveTo(x - bodyW / 2, y);
      ctx.lineTo(x - bodyW / 2 + 2, y - bodyH + 4);
      ctx.quadraticCurveTo(x, y - bodyH - 3, x + bodyW / 2 - 2, y - bodyH + 4);
      ctx.lineTo(x + bodyW / 2, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.fillRect(x - bodyW / 2 + 1, y - bodyH + 6, 4, bodyH - 6);
      ctx.fillRect(x + bodyW / 2 - 5, y - bodyH + 6, 4, bodyH - 6);
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(x - bodyW / 2, y - bodyH, bodyW, bodyH * 0.35);

      const headY = y - bodyH - 11;
      ctx.fillStyle = c.skin;
      ctx.beginPath();
      ctx.arc(x, headY, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.hair;
      ctx.beginPath();
      if (c.hairStyle === 0) ctx.arc(x, headY, 11.5, Math.PI, Math.PI * 2);
      else if (c.hairStyle === 1) {
        ctx.arc(x, headY, 12, Math.PI * 0.88, Math.PI * 2.12);
      } else if (c.hairStyle === 2) {
        ctx.arc(x, headY, 11.5, Math.PI, Math.PI * 2);
        ctx.rect(x - 11.5, headY - 1, 23, 8);
      } else {
        ctx.arc(x, headY - 1, 10.5, Math.PI * 1.1, Math.PI * 1.9);
      }
      ctx.fill();

      ctx.fillStyle = "#241F1C";
      if (c.state === "served") {
        ctx.strokeStyle = "#241F1C";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(x - 4, headY - 1, 2.1, Math.PI * 1.1, Math.PI * 1.9);
        ctx.arc(x + 4, headY - 1, 2.1, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, headY + 3, 3.2, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x - 4, headY, 1.5, 0, Math.PI * 2);
        ctx.arc(x + 4, headY, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Staff got this one — a small tick, so idle income is legible without stealing focus.
      if (c.autoT > 0) {
        ctx.globalAlpha = Math.min(1, c.autoT * 2);
        ctx.strokeStyle = "#9BC06B";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x - 5, headY - 18);
        ctx.lineTo(x - 1, headY - 14);
        ctx.lineTo(x + 6, headY - 23);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawSmoke(): void {
    const ctx = this.ctx;
    for (const s of this.smoke) {
      ctx.fillStyle = `rgba(232,232,228,${(s.life / s.max) * 0.14})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawGrease(): void {
    const ctx = this.ctx;
    for (const g of this.grease) {
      ctx.fillStyle = `rgba(255,190,110,${Math.min(1, g.life / g.max) * 0.9})`;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRisingNumbers(): void {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    for (const r of this.rising) {
      const ease = 1 - Math.pow(1 - r.t, 2.2);
      const y = r.y - ease * 58;
      const x = r.x + r.drift * ease;
      const alpha = r.t < 0.15 ? r.t / 0.15 : 1 - Math.pow((r.t - 0.15) / 0.85, 2);
      const size = 16 + (1 - Math.pow(1 - Math.min(1, r.t * 5), 2)) * 4;
      ctx.font = `700 ${size}px ui-monospace, "SF Mono", monospace`;
      ctx.fillStyle = `rgba(24,16,10,${alpha * 0.55})`;
      ctx.fillText(r.text, x + 1.5, y + 1.5);
      ctx.fillStyle = `rgba(255,232,190,${alpha})`;
      ctx.fillText(r.text, x, y);
    }
    ctx.textAlign = "left";
  }
}

export const SCENE_ASPECT = H / W;
