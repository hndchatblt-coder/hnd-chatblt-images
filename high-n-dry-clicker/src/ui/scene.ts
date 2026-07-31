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

/* DESIGN_TOKENS.md pass 3 — "the line". Cream tile is the ground; steel is an accent. */
const TILE = "#EDE4D3";
const GROUT = "#CFC3AC";
const TIMBER = "#8A5A32";
const STEEL = "#A8AFB6";
const STEEL_DARK = "#7C848C";

const LAMP_BAR_Y = 20;
const LAMP_BULB_Y = 38;
/** Back wall meets the bench here. */
const BENCH_TOP = 112;
const GRATE_TOP = 126;
const GRATE_HEIGHT = 36;
const COUNTER_TOP = 172;
const COUNTER_H = 30;
/** Customers stand on this line, in front of the counter. */
const FLOOR_Y = 268;
const QUEUE_X = 68;
const QUEUE_STEP = 46;
const MAX_QUEUE = 7;

/**
 * The bench, divided into bays, left to right in the order food travels. The grill is plumbed in
 * at the left and can't move; the three bays to its right hold stations.
 *
 * This exists because E1 broke without it: four people at a station is what tier 3 looks like,
 * and at fixed positions the crews ran off the right edge and stood inside the fryer. It is also
 * the skeleton PART TWO of PLAN_THE_LINE.md needs, so it's built once, here.
 */
const GRILL_X = 14;
const GRILL_RIGHT = 150;
/** Base bays; fitouts add more, so the live count comes in on `Business`. */
export const BAYS = 3;
/** Mirrors economy.config.json layout.placeable — the scene stays free of config imports. */
const PLACEABLE = [0, 1, 2, 3, 4];
const EMPTY_BAY = -1;
/** Colour that stands for each station on the back shelf. */
const STATION_TINT: Record<number, string> = {
  0: "#C8CED4",
  1: "#E8B93F",
  2: "#E8E3D8",
  3: "#2E3A44",
  4: "#3E7FA8",
};
const SHORT_NAME: Record<number, string> = {
  0: "PREP",
  1: "FRYER",
  2: "GRILL",
  3: "COUNTER",
  4: "PICKUP",
};
const BAY_LEFT = 154;
const PATTY_Y = GRATE_TOP + 16;
/** Small ones, several of them. The single giant patty was Cookie Clicker's cookie (pass 3). */
const PATTY_R = 9;

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
  /** Fades out on the way to the door. */
  fade?: number;
  /** Set for a regular — a face you know. */
  regular?: string;
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

/**
 * Food leaving the kitchen. Every serve — yours or your staff's — puts one of these on the pass
 * and flies it to the customer who ordered it, so your $/sec reads as a visible rate of burgers
 * going out rather than only as a number climbing. DESIGN_TOKENS pass 3, stolen from the way
 * Idle Miner Tycoon makes throughput physical.
 */
interface Burger {
  fromX: number;
  toX: number;
  toY: number;
  t: number;
  spin: number;
}

/**
 * A new hire arriving. Buying the first of a station used to be a toast; now the person walks in
 * off the street, crosses the floor and steps in behind the counter. PLAN_THE_LINE.md 2.2.
 */
interface Walker {
  index: number;
  t: number;
  skin: string;
  hair: string;
  role: "cook" | "server";
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
}

interface RisingNumber {
  x: number;
  y: number;
  t: number;
  drift: number;
  text: string;
}

/**
 * How far back the camera has pulled. One canvas, three framings — the scale idea from
 * SCALE_PLAN.md §1. You can always come back to the counter and serve, so clicking never dies.
 */
export type View = 0 | 1 | 2;

export const VIEW_NAMES = ["The counter", "The shop", "The strip"] as const;

/** What the shop should look like right now — pushed in from the engine every frame. */
export interface Business {
  /** Owned count per generator, parallel to config.generators.list. */
  generators: number[];
  /** 0..1 how hard the kitchen is going. Drives lamp, flames and traffic. */
  busy: number;
  /** Serves per second the staff manage on their own. Visual only — cash comes from the engine. */
  autoServesPerSecond: number;
  /** Who is standing where, by generator index. */
  staffNames: Record<number, string>;
  /**
   * 0..1 how much shop there is, from total units owned. Drives the continuous stuff — dockets on
   * the rail, mess on the bench, trays, how fast the crew move. The tier ladder is stepped; this
   * is what stops there being a flat stretch between the steps (PLAN_THE_LINE.md 2.5).
   */
  density: number;
  /**
   * Tier upgrades owned per generator, 0-3 (the x2s at 10/25/50 owned). Each step physically
   * replaces the equipment — see PLAN_THE_LINE.md 2.1. Until this landed, the 36 most
   * significant purchases in the game were invisible.
   */
  tiers: number[];
  /** Bay index → generator index, -1 for empty. The bench, as the player arranged it. */
  layout: number[];
  /** How many bays the bench has — grows with fitouts. */
  bays: number;
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
  private business: Business = {
    generators: [],
    busy: 0,
    autoServesPerSecond: 0,
    staffNames: {},
    density: 0,
    tiers: [],
    layout: [],
    bays: 3,
  };

  private customers: Customer[] = [];
  private grease: Grease[] = [];
  private smoke: Smoke[] = [];
  private rising: RisingNumber[] = [];
  private burgers: Burger[] = [];
  private walkers: Walker[] = [];
  private dust: Dust[] = [];
  /** Per-generator install pop, 1 → 0. Scales the station as it lands. */
  private stationPop: number[] = [];
  /** Camera push-in on a power beat, 1 → 0. */
  private push = 0;
  /** The bay currently picked up, or null. Tap one, tap another, they swap. */
  private heldBay: number | null = null;
  /** Set by the app so the scene can label bays without importing content. */
  bayLabel?: (generatorIndex: number) => string;
  /** Called when the player asks for two bays to swap. */
  onSwapBays?: (a: number, b: number) => void;
  private view: View = 0;
  private prevView: View = 0;
  /** 1 = settled on `view`; counts down from 0 during a pull-back. */
  private viewT = 1;
  private unlockedView: View = 0;
  private nextArrival = 0.6;
  private autoCredit = 0;
  private lastServedX = W / 2;
  /** Supplied by the app so the scene stays free of content imports. */
  regularFor?: (customerId: number) => string | undefined;

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

    // The camera earns its pull-back: front of house opens up the shop, a second venue opens
    // up the strip. Crossing a threshold pulls back once, on its own — that's the reward beat.
    const unlocked: View = this.owned(5) > 0 ? 2 : this.owned(3) > 0 ? 1 : 0;
    if (unlocked > this.unlockedView) {
      this.unlockedView = unlocked;
      this.setView(unlocked);
    }
  }

  getView(): View {
    return this.view;
  }

  getUnlockedView(): View {
    return this.unlockedView;
  }

  /** Which bay is picked up, if any — the app mirrors this into the readout. */
  getHeldBay(): number | null {
    return this.heldBay;
  }

  clearHeldBay(): void {
    this.heldBay = null;
  }

  setView(view: View): void {
    if (view === this.view || view > this.unlockedView) return;
    this.heldBay = null;
    this.prevView = this.view;
    this.view = view;
    this.viewT = 0;
  }

  /**
   * A station arrived. `first` means this is the first of its kind, so somebody walks in for it;
   * otherwise the gear just lands. Called by the app on purchase (PLAN_THE_LINE.md 2.2).
   */
  install(index: number, first: boolean): void {
    this.stationPop[index] = 1;
    this.puff(this.stationX(index), BENCH_TOP + 4, 10);
    if (!first) return;
    const id = this.nextId;
    this.nextId += 1;
    this.walkers.push({
      index,
      t: 0,
      skin: SKIN[id % SKIN.length] as string,
      hair: HAIR[(id * 3) % HAIR.length] as string,
      role: index === 3 || index === 4 ? "server" : "cook",
    });
  }

  /** A tier upgrade landed — the rig changes, and the camera leans in to watch it. */
  upgraded(index: number): void {
    this.stationPop[index] = 1;
    this.push = 1;
    this.lampPulse = 1;
    this.puff(this.stationX(index), BENCH_TOP + 4, 18);
  }

  private puff(x: number, y: number, count: number): void {
    if (this.reduced) return;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.PI + Math.random() * Math.PI;
      this.dust.push({
        x,
        y,
        vx: Math.cos(angle) * (30 + Math.random() * 70),
        vy: Math.sin(angle) * (20 + Math.random() * 50),
        life: 0.4 + Math.random() * 0.4,
        r: 2 + Math.random() * 3.5,
      });
    }
    this.dust = this.dust.slice(-90);
  }

  /** Where on the bench a given generator lives. Off-bench things answer with their own spot. */
  private stationX(index: number): number {
    if (index === 0) return 40;
    if (index === 4) return 348;
    if (index >= 5) return 72;
    return this.bayX(index - 1);
  }

  private owned(index: number): number {
    return this.business.generators[index] ?? 0;
  }

  /** Bays on the bench right now. */
  private bays(): number {
    return Math.max(1, this.business.bays || BAYS);
  }

  private bayW(): number {
    return (W - BAY_LEFT - 6) / this.bays();
  }

  /** Centre of bay `i`. */
  private bayX(i: number): number {
    return BAY_LEFT + this.bayW() * (i + 0.5);
  }

  /** How far a station has been upgraded, 0-3. */
  private tier(index: number): number {
    return this.business.tiers[index] ?? 0;
  }

  /**
   * The flat-top grows with the crew working it — a second flat-top at tier 2, the full bench at
   * tier 3. It's the widest object in the room, so it carries the tier ladder better than
   * anything else on screen.
   */
  private grillRight(): number {
    return GRILL_RIGHT;
  }

  /** How many are queued or walking in. */
  private waiting(): Customer[] {
    return this.customers.filter((c) => c.state === "in" || c.state === "wait");
  }

  /**
   * Where a customer sits in the current framing. The queue is one logical line; each view just
   * looks at it from further away.
   */
  private place(c: Customer): { x: number; y: number; scale: number } {
    if (this.view === 0) return { x: c.x, y: FLOOR_Y, scale: 1 };
    if (this.view === 1) {
      // Out the front. The head of the queue is at the door, so the line runs away down the
      // footpath — the direction flips because from out here the door is on the right.
      return { x: 300 - (c.x - QUEUE_X) * 0.75, y: 262, scale: 0.62 };
    }
    // Too far away to be individuals; a knot of people outside Leichhardt.
    return { x: 52 + (c.x - QUEUE_X) * 0.3, y: 248, scale: 0.3 };
  }

  /**
   * Tap. Serves the customer nearest the tap if there's one there. Returns true if a sale
   * happened, so the caller can charge the engine for exactly one click. Works at the counter and
   * at the shopfront; from the strip you zoom back in to serve.
   */
  tapAt(clientX: number, clientY: number): boolean {
    if (this.view > 1) return false;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;

    // The bench is the arranging surface — no build mode, no second screen (BUILD_BRIEF §0).
    // Tap a bay to pick it up, tap another to swap. Tap the same one again to put it down.
    if (this.view === 0 && y >= BENCH_TOP && y <= COUNTER_TOP && x >= BAY_LEFT) {
      const bay = Math.min(this.bays() - 1, Math.floor((x - BAY_LEFT) / this.bayW()));
      if (this.heldBay === null) {
        // Only worth picking up if there's something in it or something to bring to it.
        this.heldBay = bay;
      } else if (this.heldBay === bay) {
        this.heldBay = null;
      } else {
        this.onSwapBays?.(this.heldBay, bay);
        this.heldBay = null;
      }
      return false;
    }

    let best: Customer | null = null;
    let bestDistance = this.view === 0 ? 46 : 30;
    for (const c of this.customers) {
      if (c.state !== "wait") continue;
      const p = this.place(c);
      const d = Math.hypot(p.x - x, p.y - 30 * p.scale - y);
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
      y: (this.view === 0 ? FLOOR_Y : this.view === 1 ? 262 : 246) - 74,
      t: 0,
      drift: (Math.random() - 0.5) * 18,
      text,
    });
    if (this.rising.length > 20) this.rising.shift();
  }

  private serve(customer: Customer, auto: boolean): void {
    customer.state = "served";
    customer.pop = 1;
    const spot = this.place(customer);
    this.lastServedX = spot.x;

    // The burger flies at the counter only — from the footpath you can't see the pass, and a
    // burger crossing the strip would be a mile wide.
    if (this.view === 0 && this.burgers.length < 24) {
      this.burgers.push({
        fromX: GRILL_X + 40 + Math.random() * 70,
        toX: spot.x,
        toY: spot.y - 46,
        t: 0,
        spin: (Math.random() - 0.5) * 1.4,
      });
    }

    if (auto) {
      customer.autoT = 0.9;
      return;
    }
    // A player who is serving fast pulls the next person in. Without this the arrival gap is a
    // hard cap on tapping — at a cold start you could only earn ~0.8 serves/sec no matter how
    // hard you went, while the economy is tuned around ~2 taps/sec. Word gets around; the shop
    // is busy because you are serving, not the other way round.
    if (this.waiting().length < 3) this.nextArrival = Math.min(this.nextArrival, 0.22);
    this.squash = 1;
    this.flare = 1;
    this.lampPulse = 1;
    if (this.reduced) return;
    for (let i = 0; i < 7; i += 1) {
      const angle = Math.PI + Math.random() * Math.PI;
      const speed = 55 + Math.random() * 120;
      this.grease.push({
        x: GRILL_X + 30 + Math.random() * 90,
        y: PATTY_Y - 4,
        vx: Math.cos(angle) * speed * 0.7,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.35,
        max: 0.8,
        r: 1 + Math.random() * 1.8,
      });
    }
    this.smoke.push({
      x: GRILL_X + 40 + Math.random() * 70,
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
    const arrivalGap = Math.max(0.3, 0.55 - Math.log10(1 + staff) * 0.16);
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
        // The front of the queue is consumed constantly once staff are serving, so the whole line
        // is always shuffling up. Slow easing here leaves people permanently overlapping.
        const speed = c.state === "in" ? 5 : 20;
        c.x += (c.targetX - c.x) * Math.min(1, dt * speed);
        if (c.state === "in" && Math.abs(c.x - c.targetX) < 4) c.state = "wait";
      } else if (c.state === "served") {
        c.pop = Math.max(0, c.pop - dt * 2.6);
        c.autoT = Math.max(0, c.autoT - dt);
        if (c.pop <= 0 && c.autoT <= 0) c.state = "leaving";
      } else {
        // Off quickly, or they walk straight through the people still queueing.
        c.x += 260 * dt;
        c.fade = Math.max(0, (c.fade === undefined ? 1 : c.fade) - dt * 2.6);
      }
      c.bob += dt;
    }
    this.customers = this.customers.filter((c) => c.x < W + 50 && (c.fade === undefined || c.fade > 0));

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

    for (const b of this.burgers) b.t += dt * 1.6;
    this.burgers = this.burgers.filter((b) => b.t < 1);

    for (const w of this.walkers) w.t += dt * 0.48;
    this.walkers = this.walkers.filter((w) => w.t < 1);

    for (const d of this.dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 130 * dt;
      d.life -= dt;
    }
    this.dust = this.dust.filter((d) => d.life > 0);

    for (let i = 0; i < this.stationPop.length; i += 1) {
      const v = this.stationPop[i] ?? 0;
      if (v > 0) this.stationPop[i] = Math.max(0, v - dt * 2.2);
    }
    this.push = Math.max(0, this.push - dt * 1.5);

    if (this.viewT < 1) this.viewT = Math.min(1, this.viewT + dt * 1.15);
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
      fade: 1,
      regular: this.regularFor?.(id),
    });
  }

  /* ------------------------------------------------------------------ draw */

  private draw(t: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // A tier upgrade leans the camera in about 4% and lets it settle. Small enough to feel
    // rather than read, which is the whole point of a power beat (BUILD_BRIEF §2).
    if (this.push > 0 && !this.reduced) {
      const k = 1 + Math.sin(this.push * Math.PI) * 0.04;
      ctx.setTransform(this.scale * k, 0, 0, this.scale * k, ((1 - k) * W * this.scale) / 2, ((1 - k) * H * this.scale) / 2);
    }

    if (this.viewT >= 1) {
      this.drawView(this.view, t);
      return;
    }
    // Pull-back: the view you're leaving shrinks away, the one you're arriving at opens up.
    const e = 1 - Math.pow(1 - this.viewT, 3);
    const out = this.prevView < this.view;
    this.drawScaled(this.prevView, t, out ? 1 + e * 0.9 : 1 - e * 0.45, 1 - e);
    this.drawScaled(this.view, t, out ? 0.55 + e * 0.45 : 1.9 - e * 0.9, e);
  }

  private drawScaled(view: View, t: number, scale: number, alpha: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -H / 2);
    this.drawView(view, t);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawView(view: View, t: number): void {
    if (view === 1) {
      this.drawShopView(t);
      return;
    }
    if (view === 2) {
      this.drawStripView(t);
      return;
    }
    this.drawCounterView(t);
  }

  private drawCounterView(t: number): void {
    this.drawRoom(t);
    this.drawMenuBoard();
    this.drawLamp(t);
    this.drawBench();
    this.drawBayFurniture();
    this.drawBenchClutter();
    this.drawGrill(t);
    this.drawPatties(t);
    this.drawStations(t);
    this.drawDocketRail();
    this.drawSmoke();
    this.drawGrease();
    this.drawCounter();
    this.drawCustomers(t);
    this.drawWalkers(t);
    this.drawBurgers();
    this.drawDust();
    this.drawRisingNumbers();
  }

  /* ---------------------------------------------------------------- view 1: the shop */

  /** Your shopfront from the footpath. The queue is out the door — that's the whole point. */
  private drawShopView(t: number): void {
    const ctx = this.ctx;
    const busy = this.business.busy;

    // Sky and the street.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#232A31");
    sky.addColorStop(0.55, "#2E363E");
    sky.addColorStop(1, "#22282E");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Neighbouring frontage, deliberately dull so yours reads as the lit one.
    ctx.fillStyle = "#272E35";
    ctx.fillRect(0, 62, 42, 178);
    ctx.fillRect(348, 74, 42, 166);
    ctx.fillStyle = "rgba(160,180,200,0.07)";
    ctx.fillRect(8, 92, 24, 30);
    ctx.fillRect(358, 104, 24, 30);

    // The building, with a parapet.
    ctx.fillStyle = "#39424A";
    ctx.fillRect(42, 54, 306, 186);
    ctx.fillStyle = "#2E363D";
    ctx.fillRect(38, 48, 314, 12);

    // The lit sign washes the wall around it.
    const signGlow = ctx.createRadialGradient(195, 84, 8, 195, 84, 150);
    signGlow.addColorStop(0, `rgba(255,158,27,${0.2 + busy * 0.18})`);
    signGlow.addColorStop(1, "rgba(255,158,27,0)");
    ctx.fillStyle = signGlow;
    ctx.fillRect(42, 60, 306, 134);
    ctx.fillStyle = "#1B1F23";
    ctx.fillRect(72, 66, 246, 32);
    ctx.fillStyle = "#FF9E1B";
    ctx.font = "700 19px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("HIGH N' DRY", 195, 89);
    ctx.textAlign = "left";

    // Awning: scalloped, with a shadow under it so it reads as cloth, not a stripe.
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(46, 116, 296, 8);
    const bays = 8;
    const bayW = 300 / bays;
    for (let i = 0; i < bays; i += 1) {
      const x = 46 + i * bayW;
      ctx.fillStyle = i % 2 === 0 ? "#C6402B" : "#EFE3CC";
      ctx.beginPath();
      ctx.moveTo(x, 104);
      ctx.lineTo(x + bayW, 104);
      ctx.lineTo(x + bayW, 116);
      ctx.arc(x + bayW / 2, 116, bayW / 2, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(46, 104, 300, 3);

    // Window, with the pass glowing behind it.
    const win = ctx.createLinearGradient(0, 126, 0, 196);
    win.addColorStop(0, `rgba(255,196,120,${0.52 + busy * 0.24})`);
    win.addColorStop(1, "rgba(255,158,27,0.14)");
    ctx.fillStyle = win;
    ctx.fillRect(62, 126, 198, 70);
    ctx.strokeStyle = "#1B1F23";
    ctx.lineWidth = 4;
    ctx.strokeRect(62, 126, 198, 70);

    // Staff silhouettes working behind the glass. Dark enough to read against a lit window.
    const crew = Math.min(4, Object.keys(this.business.staffNames).length);
    for (let i = 0; i < crew; i += 1) {
      // Seen over the pass, so only the top half of them.
      const x = 92 + i * 44;
      const y = 168 + Math.sin(t * 2.6 + i * 1.7) * 1.6;
      ctx.fillStyle = "rgba(24,18,12,0.72)";
      ctx.beginPath();
      ctx.moveTo(x - 8, 194);
      ctx.lineTo(x - 7, y + 3);
      ctx.quadraticCurveTo(x, y - 3, x + 7, y + 3);
      ctx.lineTo(x + 8, 194);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y - 6, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tiled lower wall — the white-tile burger shop, seen at night.
    ctx.fillStyle = "#434C54";
    ctx.fillRect(42, 196, 306, 44);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    for (let ty = 204; ty < 240; ty += 12) {
      ctx.beginPath();
      ctx.moveTo(42, ty);
      ctx.lineTo(348, ty);
      ctx.stroke();
    }

    // Door, propped open, with the light spilling out.
    ctx.fillStyle = "#1B1F23";
    ctx.fillRect(276, 126, 52, 114);
    ctx.fillStyle = `rgba(255,196,120,${0.34 + busy * 0.22})`;
    ctx.fillRect(281, 132, 42, 108);
    ctx.fillStyle = "rgba(255,196,120,0.10)";
    ctx.beginPath();
    ctx.moveTo(281, 240);
    ctx.lineTo(323, 240);
    ctx.lineTo(346, 282);
    ctx.lineTo(258, 282);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#C6402B";
    ctx.fillRect(288, 148, 28, 11);
    ctx.fillStyle = "#F6F1E4";
    ctx.font = "700 7px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("OPEN", 302, 156);
    ctx.textAlign = "left";

    // Footpath.
    ctx.fillStyle = "#2A3138";
    ctx.fillRect(0, 240, W, H - 240);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0, 240, W, 2);

    // A-frame board on the kerb. It says the same thing it always says.
    ctx.fillStyle = "#2F2721";
    ctx.beginPath();
    ctx.moveTo(38, 300);
    ctx.lineTo(54, 252);
    ctx.lineTo(86, 252);
    ctx.lineTo(102, 300);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(246,241,228,0.6)";
    ctx.font = "700 7px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("NO", 70, 276);
    ctx.fillText("BOOKINGS", 70, 287);
    ctx.textAlign = "left";

    this.drawCustomers(t);
    this.drawRisingNumbers();
  }

  /* --------------------------------------------------------------- view 2: the strip */

  /** Your venues on the strip, and whoever else is trading. */
  private drawStripView(t: number): void {
    const ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#1B222A");
    sky.addColorStop(0.6, "#262E36");
    sky.addColorStop(1, "#1E242A");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Skyline behind.
    ctx.fillStyle = "#222931";
    for (let i = 0; i < 11; i += 1) {
      const bh = 24 + ((i * 37) % 52);
      ctx.fillRect(i * 36, 96 - bh, 30, bh);
    }

    const busy = this.business.busy;
    const slots = [
      // A venue's tier is how full it looks — upgrading Rosebery lights Rosebery's windows.
      { label: "LEICHHARDT", owned: true, rival: false, rise: 18, tier: this.tier(2) },
      { label: "ROSEBERY", owned: this.owned(5) > 0, rival: false, rise: 8, tier: this.tier(5) },
      { label: "NEUTRAL BAY", owned: this.owned(6) > 0, rival: false, rise: 13, tier: this.tier(6) },
      { label: "GHOST KITCHEN", owned: this.owned(7) > 0, rival: false, rise: 2, tier: this.tier(7) },
      { label: "GRILLZILLA", owned: false, rival: true, rise: 15, tier: 0 },
      { label: "PATTY CVLT", owned: false, rival: true, rise: 6, tier: 0 },
    ];
    const slotW = W / slots.length;
    const BASE = 230;

    slots.forEach((slot, i) => {
      const x = i * slotW;
      const top = 108 - slot.rise;
      const lit = slot.owned;
      const cx = x + slotW / 2;

      // Light pollution above an open venue — a soft dome in the sky, not a band across it.
      if (lit) {
        const sg = ctx.createRadialGradient(cx, top, 2, cx, top, 62);
        sg.addColorStop(0, `rgba(255,158,27,${0.12 + busy * 0.1})`);
        sg.addColorStop(1, "rgba(255,158,27,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(cx - 62, top - 62, 124, 62);
      }

      // Frontage.
      ctx.fillStyle = lit ? "#39424A" : "#2A3138";
      ctx.fillRect(x + 2, top, slotW - 4, BASE - top);
      ctx.fillStyle = lit ? "#2E363D" : "#242A30";
      ctx.fillRect(x, top - 5, slotW, 7);

      // A wash down the frontage, clipped to its own slot so it can't smear the sky.
      if (lit) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 2, top, slotW - 4, BASE - top);
        ctx.clip();
        const g = ctx.createRadialGradient(cx, top + 38, 4, cx, top + 38, 74);
        g.addColorStop(0, `rgba(255,158,27,${0.2 + busy * 0.16})`);
        g.addColorStop(1, "rgba(255,158,27,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + 2, top, slotW - 4, BASE - top);
        ctx.restore();
      }

      // Sign board. Long names get two lines so nothing runs into the neighbours.
      const words = slot.label.split(" ");
      ctx.fillStyle = lit ? "#15181B" : "#22282E";
      ctx.fillRect(x + 5, top + 10, slotW - 10, words.length > 1 ? 20 : 13);
      ctx.fillStyle = lit ? "#FF9E1B" : slot.rival ? "rgba(150,190,225,0.34)" : "rgba(246,241,228,0.24)";
      ctx.font = "700 6.5px ui-monospace, monospace";
      ctx.textAlign = "center";
      words.forEach((word, w) => {
        ctx.fillText(word, cx, top + 20 + w * 8);
      });
      ctx.textAlign = "left";

      // Awning in the house colours, only on ours.
      if (lit) {
        for (let b = 0; b < 4; b += 1) {
          ctx.fillStyle = b % 2 === 0 ? "#C6402B" : "#EFE3CC";
          ctx.fillRect(x + 4 + b * ((slotW - 8) / 4), top + 36, (slotW - 8) / 4, 5);
        }
      }

      // Windows: a grid, so a lit venue reads as full of people rather than a tan block.
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 3; c += 1) {
          const wx = x + 9 + c * 16;
          const wy = top + 48 + r * 20;
          if (wy + 12 > BASE - 6) continue;
          // Half the windows at tier 0, every one of them by tier 3.
          const density = 2 + slot.tier;
          const on = lit && (i * 7 + r * 3 + c * 5) % 5 < density;
          ctx.fillStyle = on
            ? `rgba(255,196,120,${0.4 + busy * 0.22})`
            : lit
              ? "rgba(255,196,120,0.12)"
              : "rgba(150,170,190,0.06)";
          ctx.fillRect(wx, wy, 12, 13);
        }
      }
    });

    // Road.
    ctx.fillStyle = "#20262C";
    ctx.fillRect(0, 230, W, H - 230);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 14]);
    ctx.beginPath();
    ctx.moveTo(0, 282);
    ctx.lineTo(W, 282);
    ctx.stroke();
    ctx.setLineDash([]);

    // Delivery bikes running your orders.
    const bikes = Math.min(4, 1 + Math.floor(this.business.busy * 4));
    for (let i = 0; i < bikes; i += 1) {
      const x = ((t * (52 + i * 17) + i * 120) % (W + 60)) - 30;
      ctx.fillStyle = "#C6402B";
      ctx.fillRect(x, 262, 16, 8);
      ctx.fillStyle = "#1B1F23";
      ctx.beginPath();
      ctx.arc(x + 3, 272, 3.4, 0, Math.PI * 2);
      ctx.arc(x + 13, 272, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawCustomers(t);
    this.drawRisingNumbers();
  }

  private drawRoom(t: number): void {
    const ctx = this.ctx;

    // Cream subway tile, not grey steel. The old ground filled most of the frame and read cold
    // no matter how many warm lamps were hung on it (DESIGN_TOKENS pass 3).
    const wall = ctx.createLinearGradient(0, 0, 0, BENCH_TOP);
    wall.addColorStop(0, "#D8CDB8");
    wall.addColorStop(0.45, TILE);
    wall.addColorStop(1, "#E4DAC7");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, BENCH_TOP);

    const tileW = 34;
    const tileH = 17;
    ctx.strokeStyle = GROUT;
    ctx.lineWidth = 1.5;
    for (let row = 0, y = 0; y < BENCH_TOP; row += 1, y += tileH) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      const offset = row % 2 === 0 ? 0 : tileW / 2;
      for (let x = offset; x <= W; x += tileW) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, Math.min(y + tileH, BENCH_TOP));
        ctx.stroke();
      }
    }

    // The lamp lands on the tile — this is where the warmth in the room comes from.
    const wash = ctx.createRadialGradient(W / 2, LAMP_BULB_Y, 10, W / 2, LAMP_BULB_Y, 240);
    wash.addColorStop(0, `rgba(255,158,27,${0.16 + this.lampPulse * 0.1})`);
    wash.addColorStop(1, "rgba(255,158,27,0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, BENCH_TOP);
    void t;

    // The customer side: dim, but warm-dim. It was blue-grey, which split the scene in half —
    // a warm lit kitchen sitting on top of a cold empty room.
    const floorTop = COUNTER_TOP + COUNTER_H;
    const floor = ctx.createLinearGradient(0, floorTop, 0, H);
    floor.addColorStop(0, "#54423A");
    floor.addColorStop(0.5, "#40322C");
    floor.addColorStop(1, "#2E2420");
    ctx.fillStyle = floor;
    ctx.fillRect(0, floorTop, W, H - floorTop);

    // Quarry tile in perspective. The courses open up as the floor comes towards you, and the
    // joints run to a vanishing point — parallel verticals here read as a brick wall, not a floor.
    ctx.strokeStyle = "rgba(255,222,180,0.07)";
    ctx.lineWidth = 1;
    let gap = 6;
    for (let y = floorTop + gap; y < H; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      gap += 2.4;
    }
    for (let i = -4; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * 22, floorTop);
      ctx.lineTo(W / 2 + i * 96, H);
      ctx.stroke();
    }

    // Warm spill off the pass, pooling on the floor where the queue stands.
    const spill = ctx.createRadialGradient(W / 2, floorTop, 10, W / 2, floorTop, 230);
    spill.addColorStop(0, `rgba(255,158,27,${0.2 + this.business.busy * 0.08})`);
    spill.addColorStop(1, "rgba(255,158,27,0)");
    ctx.fillStyle = spill;
    ctx.fillRect(0, COUNTER_TOP, W, H - COUNTER_TOP);
  }

  /** Specials board. Fills the back wall, and it's the most honest object in a burger bar. */
  private drawMenuBoard(): void {
    const ctx = this.ctx;
    const x = 150;
    const y = 52;
    const w = 156;
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
    const layout = this.business.layout;

    // The bench: whatever the player put in each bay, drawn there.
    for (let bay = 0; bay < this.bays(); bay += 1) {
      const index = layout[bay] ?? EMPTY_BAY;
      if (index === EMPTY_BAY || this.owned(index) === 0) continue;
      this.popped(index, this.bayX(bay), COUNTER_TOP, () => this.drawStationInBay(index, bay, t));
    }

    // Anything owned but off the line goes on the back shelf. It still produces — the bench is
    // only where the bonuses live — but you can see it isn't on the line.
    const off = PLACEABLE.filter((i: number) => this.owned(i) > 0 && !layout.includes(i));
    if (off.length > 0) this.drawBackShelf(off);

    this.drawTradingBoard();
  }

  /** Bays are tappable when there's something to move. Lifted bay draws a marching outline. */
  private drawBayFurniture(): void {
    if (this.view !== 0) return;
    const ctx = this.ctx;
    const held = this.heldBay;
    for (let bay = 0; bay < this.bays(); bay += 1) {
      const x = BAY_LEFT + bay * this.bayW();
      // A shallow notch in the bench edge marks where one bay ends and the next begins.
      ctx.fillStyle = "rgba(40,34,28,0.18)";
      ctx.fillRect(x, BENCH_TOP, 1.5, COUNTER_TOP - BENCH_TOP);
      if (held === bay) {
        ctx.strokeStyle = "rgba(255,158,27,0.9)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(x + 2, BENCH_TOP + 2, this.bayW() - 4, COUNTER_TOP - BENCH_TOP - 4);
        ctx.setLineDash([]);
      } else if (held !== null) {
        // Where it could go.
        ctx.strokeStyle = "rgba(255,240,216,0.32)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 5]);
        ctx.strokeRect(x + 3, BENCH_TOP + 3, this.bayW() - 6, COUNTER_TOP - BENCH_TOP - 6);
        ctx.setLineDash([]);
      }
    }
  }

  private drawStationInBay(index: number, bay: number, t: number): void {
    const x = this.bayX(bay);
    if (index === 0) this.drawPrepBench(x, t);
    else if (index === 1) this.drawFryer(x, GRATE_TOP + 16, t);
    else if (index === 2) this.drawCrew(x, 2, "#E8E3D8", t, 0, "cook");
    else if (index === 3) this.drawCrew(x, 3, "#2E3A44", t, 1.7, "server");
    else if (index === 4) this.drawPickup(x);
  }

  /**
   * Gear you own that isn't on the line. Small, on a shelf against the back wall, labelled —
   * because "the shop is the readout" has to keep holding even when the bench is full.
   */
  private drawBackShelf(indices: number[]): void {
    const ctx = this.ctx;
    const shelfY = 98;
    ctx.fillStyle = "#9AA2AA";
    ctx.fillRect(6, shelfY + 13, W - 12, 2.5);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(6, shelfY + 15.5, W - 12, 2);

    indices.forEach((index, i) => {
      const x = 22 + i * 46;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#6E767E";
      ctx.fillRect(x - 13, shelfY - 1, 26, 14);
      ctx.fillStyle = STATION_TINT[index] ?? "#C8CED4";
      ctx.fillRect(x - 11, shelfY + 1, 22, 10);
      ctx.restore();
      ctx.fillStyle = "rgba(60,50,40,0.75)";
      ctx.font = "700 6px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(SHORT_NAME[index] ?? "", x, shelfY + 24);
      ctx.textAlign = "left";
    });
  }

  private drawTradingBoard(): void {
    const ctx = this.ctx;
    const venues = ["ROSEBERY", "NEUTRAL BAY", "GHOST KITCHEN", "FRANCHISE", "FACTORY", "STATION", "FUTURES"];
    const listed = venues.filter((_, i) => this.owned(5 + i) > 0);
    if (listed.length === 0) return;
    const boardH = 14 + listed.length * 11;
    ctx.fillStyle = "#6B4526";
    ctx.fillRect(8, 44, 130, boardH + 4);
    ctx.fillStyle = "#2A2622";
    ctx.fillRect(11, 47, 124, boardH - 2);
    ctx.fillStyle = "rgba(255,190,110,0.85)";
    ctx.font = "700 7px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("NOW TRADING", 16, 56);
    ctx.fillStyle = "rgba(246,241,228,0.75)";
    listed.forEach((name, i) => ctx.fillText(name, 16, 67 + i * 11));
  }

  /** Prep: a rack of tongs over a bench of mise-en-place tubs. */
  private drawPrepBench(x: number, t: number): void {
    const ctx = this.ctx;
    const tier = this.tier(0);
    const rails = tier >= 2 ? 2 : 1;
    const perRail = 3 + tier;

    for (let rail = 0; rail < rails; rail += 1) {
      const ry = GRATE_TOP + 4 - rail * 14;
      ctx.fillStyle = "#5C646C";
      ctx.fillRect(x - perRail * 4.5, ry - 15, perRail * 9, 2.5);
      ctx.strokeStyle = "#6E767E";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < perRail; i += 1) {
        const px = x - perRail * 4.5 + 3 + i * 9;
        ctx.beginPath();
        ctx.moveTo(px, ry);
        ctx.lineTo(px + 3, ry - 14);
        ctx.moveTo(px + 3, ry);
        ctx.lineTo(px + 3, ry - 14);
        ctx.stroke();
      }
    }

    const tubs = 2 + tier;
    const tubW = Math.max(7, Math.min(13, (this.bayW() - 14) / tubs));
    for (let i = 0; i < tubs; i += 1) {
      const tx = x - (tubs * tubW) / 2 + i * tubW;
      ctx.fillStyle = "#20252A";
      ctx.fillRect(tx - 1, GRATE_TOP + 13, tubW, 15);
      ctx.fillStyle = "#C8CED4";
      ctx.fillRect(tx, GRATE_TOP + 14, tubW - 2, 13);
      ctx.fillStyle = ["#7CA84E", "#C6402B", "#E0B23A", "#E8E3D8", "#A9714A"][i % 5] as string;
      ctx.fillRect(tx + 1, GRATE_TOP + 15, tubW - 4, 6);
    }
    void t;
  }

  /** The pickup end: a heated shelf with delivery bags on it. */
  private drawPickup(x: number): void {
    const ctx = this.ctx;
    const tier = this.tier(4);
    // Sized to its bay: a fitout makes bays narrower, and a unit that keeps its own width would
    // spill into the neighbours (and off the right edge).
    const half = Math.min(34, this.bayW() / 2 - 3);
    ctx.fillStyle = "#20252A";
    ctx.fillRect(x - half, GRATE_TOP - 4, half * 2, 44);
    ctx.fillStyle = "#2E353B";
    ctx.fillRect(x - half + 3, GRATE_TOP - 1, half * 2 - 6, 38);
    // Heat lamp inside the shelf.
    ctx.fillStyle = "rgba(255,158,27,0.4)";
    ctx.fillRect(x - half + 5, GRATE_TOP + 1, half * 2 - 10, 3);
    ctx.fillStyle = "rgba(255,190,110,0.85)";
    ctx.font = "700 6.5px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("PICKUP", x, GRATE_TOP + 36);
    ctx.textAlign = "left";

    const bags = [1, 2, 4, 6][tier] ?? 1;
    const bagW = Math.min(15, (half * 2 - 14) / 3);
    for (let i = 0; i < bags; i += 1) {
      const bx = x - half + 6 + (i % 3) * (bagW + 3);
      const by = GRATE_TOP + 7 + Math.floor(i / 3) * 13;
      ctx.fillStyle = "#3E7FA8";
      ctx.fillRect(bx, by, bagW, 11);
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.fillRect(bx + 2, by + 2, bagW - 6, 2.5);
    }
  }

  private drawFryer(x: number, y: number, t: number): void {
    const ctx = this.ctx;
    const tier = this.tier(1);
    const baskets = [1, 2, 3, 3][tier] ?? 1;
    const wide = Math.min(this.bayW() - 10, 30 + baskets * 8);
    const left = x - wide / 2;
    const top = y - 16;

    // Stainless body with a control panel, so it reads as an appliance rather than a cabinet.
    ctx.fillStyle = "#20252A";
    ctx.fillRect(left - 1, top - 1, wide + 2, 33);
    const body = ctx.createLinearGradient(0, top, 0, top + 32);
    body.addColorStop(0, "#D2D8DE");
    body.addColorStop(0.45, "#AEB5BC");
    body.addColorStop(1, "#868E96");
    ctx.fillStyle = body;
    ctx.fillRect(left, top, wide, 32);

    // Oil well, recessed into the top — you look down into a fryer, not through it.
    ctx.fillStyle = "#1C1610";
    ctx.fillRect(left + 3, top + 3, wide - 6, 15);
    const oil = ctx.createLinearGradient(0, top + 3, 0, top + 18);
    oil.addColorStop(0, "#A8761E");
    oil.addColorStop(1, "#5E4110");
    ctx.fillStyle = oil;
    ctx.fillRect(left + 4, top + 4, wide - 8, 13);

    const basketW = (wide - 10) / baskets;
    for (let b = 0; b < baskets; b += 1) {
      const bx = left + 5 + b * basketW;
      // From tier 3 the baskets lift and drop on their own — nobody is standing there.
      const lift = tier >= 3 ? Math.max(0, Math.sin(t * 1.1 + b * 2.1)) * 7 : 0;
      const by = top + 5 - lift;

      ctx.fillStyle = "#E8B93F";
      ctx.fillRect(bx + 1, by + 1, basketW - 4, 10);
      ctx.strokeStyle = "#5C646C";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, basketW - 3, 11);
      for (let g = 1; g < 3; g += 1) {
        ctx.beginPath();
        ctx.moveTo(bx + g * ((basketW - 3) / 3), by);
        ctx.lineTo(bx + g * ((basketW - 3) / 3), by + 11);
        ctx.stroke();
      }
      // Handle up over the rim.
      ctx.strokeStyle = "#3A4046";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(bx + basketW - 4, by + 2);
      ctx.lineTo(bx + basketW - 1, by - 6);
      ctx.stroke();

      // Oil working, only where a basket is actually in it.
      if (lift < 2) {
        ctx.fillStyle = "rgba(255,240,200,0.5)";
        for (let i = 0; i < 3; i += 1) {
          const px = bx + 2 + i * ((basketW - 6) / 3);
          const py = top + 16 - ((t * 20 + i * 7 + b * 5) % 12);
          ctx.beginPath();
          ctx.arc(px, py, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Control panel.
    ctx.fillStyle = "#2E353B";
    ctx.fillRect(left + 3, top + 22, wide - 6, 7);
    for (let d = 0; d < Math.min(3, baskets); d += 1) {
      ctx.fillStyle = tier >= 3 ? "#7CC46B" : "#E0B23A";
      ctx.beginPath();
      ctx.arc(left + 8 + d * 9, top + 25.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // The auto-lift gantry.
    if (tier >= 3) {
      ctx.fillStyle = "#8C949C";
      ctx.fillRect(left, top - 9, wide, 3);
      ctx.fillStyle = "#5C646C";
      for (let b = 0; b < baskets; b += 1) {
        ctx.fillRect(left + 5 + b * basketW + basketW / 2, top - 7, 2, 6);
      }
    }
  }

  /** Runs `body` scaled around (x, y) by the station's install pop. Nothing to do at rest. */
  private popped(index: number, x: number, y: number, body: () => void): void {
    const pop = this.stationPop[index] ?? 0;
    if (pop <= 0) {
      body();
      return;
    }
    const ctx = this.ctx;
    const k = 1 + Math.sin(pop * Math.PI) * 0.16;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.translate(-x, -y);
    body();
    ctx.restore();
  }

  private drawDust(): void {
    const ctx = this.ctx;
    for (const d of this.dust) {
      ctx.fillStyle = `rgba(240,232,214,${Math.max(0, d.life) * 0.5})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Somebody's first shift. They come in off the street, cross the floor and step up behind the
   * counter — you watch the hire happen instead of reading about it.
   */
  private drawWalkers(t: number): void {
    if (this.view !== 0) return;
    const ctx = this.ctx;
    for (const w of this.walkers) {
      const targetX = this.stationX(w.index);
      // Two beats: walk across the floor, then step up behind the counter and fade into the crew.
      const cross = Math.min(1, w.t / 0.62);
      const step = Math.max(0, (w.t - 0.62) / 0.38);
      const x = W + 24 + (targetX - W - 24) * cross;
      const y = FLOOR_Y + (COUNTER_TOP - 6 - FLOOR_Y) * step;
      const scale = 1 - step * 0.34;
      const alpha = step > 0.7 ? 1 - (step - 0.7) / 0.3 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      const bob = Math.sin(t * 9) * (cross < 1 ? 1.6 : 0);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(0, 3, 15, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = w.role === "cook" ? "#E8E3D8" : "#2E3A44";
      ctx.fillRect(-10, -24 + bob, 20, 24);
      ctx.fillStyle = "#C6402B";
      ctx.fillRect(-9, -12 + bob, 18, 12);
      ctx.fillStyle = w.skin;
      ctx.beginPath();
      ctx.arc(0, -32 + bob, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = w.hair;
      ctx.beginPath();
      ctx.arc(0, -32 + bob, 9.5, Math.PI, Math.PI * 2);
      ctx.fill();
      // In uniform, so a new hire crossing the floor doesn't read as another customer.
      if (w.role === "cook") {
        ctx.fillStyle = "#F2EEE6";
        ctx.fillRect(-8, -44 + bob, 16, 5);
        ctx.beginPath();
        ctx.arc(0, -44 + bob, 6, Math.PI, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#1E242A";
        ctx.beginPath();
        ctx.arc(0, -40 + bob, 7.5, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-7.5, -41 + bob, 15, 3);
        ctx.fillRect(-11, -41 + bob, 8, 2.5);
      }
      ctx.fillStyle = "#241F1C";
      ctx.beginPath();
      ctx.arc(-3.5, -32 + bob, 1.4, 0, Math.PI * 2);
      ctx.arc(3.5, -32 + bob, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawCrew(
    x: number,
    index: number,
    whites: string,
    t: number,
    phase: number,
    role: "cook" | "server",
  ): void {
    const heads = 1 + this.tier(index);
    const spread = Math.min(20, (this.bayW() - 24) / Math.max(1, heads - 1));
    const left = x - ((heads - 1) * spread) / 2;
    for (let i = 0; i < heads; i += 1) {
      this.drawStaff(
        left + i * spread,
        COUNTER_TOP - 6,
        whites,
        t,
        phase + i * 1.3,
        i === 0 ? this.business.staffNames[index] : undefined,
        role,
      );
    }
  }

  private drawStaff(
    x: number,
    groundY: number,
    whites: string,
    t: number,
    phase: number,
    name: string | undefined,
    role: "cook" | "server",
  ): void {
    const ctx = this.ctx;
    // They work faster when the shop is going — the crew are part of the tempo readout.
    const bob = Math.sin(t * (3 + this.business.busy * 3.5) + phase) * (1.2 + this.business.busy * 0.7);
    const y = groundY + bob;
    // Whites on a light stainless bench need an edge or they dissolve into it.
    ctx.fillStyle = "rgba(40,30,22,0.3)";
    ctx.fillRect(x - 10.5, y - 23, 21, 23);
    ctx.fillStyle = whites;
    ctx.fillRect(x - 9, y - 22, 18, 22);
    // Cooks wear the house red apron; front of house wear the brand tee under a black cap.
    ctx.fillStyle = role === "cook" ? "#B44A32" : "#C6402B";
    ctx.fillRect(x - 8, y - 11, 16, 11);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(x - 8, y - 11, 16, 1.5);
    ctx.fillStyle = "#E5B183";
    ctx.beginPath();
    ctx.arc(x, y - 28, 7, 0, Math.PI * 2);
    ctx.fill();
    if (role === "cook") {
      // Chef's cap.
      ctx.fillStyle = "#F2EEE6";
      ctx.fillRect(x - 8, y - 36, 16, 5);
      ctx.beginPath();
      ctx.arc(x, y - 36, 6, Math.PI, Math.PI * 2);
      ctx.fill();
    } else {
      // Flat cap with a peak.
      ctx.fillStyle = "#1E242A";
      ctx.beginPath();
      ctx.arc(x, y - 33, 7.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 7.5, y - 34, 15, 3);
      ctx.fillRect(x - 11, y - 34, 8, 2.5);
    }
    ctx.fillStyle = "#241F1C";
    ctx.beginPath();
    ctx.arc(x - 2.4, y - 28, 1, 0, Math.PI * 2);
    ctx.arc(x + 2.4, y - 28, 1, 0, Math.PI * 2);
    ctx.fill();

    if (name) {
      // On a plate, so the name doesn't fight the bench edge behind it.
      const label = name.toUpperCase();
      ctx.font = "700 8px ui-monospace, monospace";
      const wide = ctx.measureText(label).width + 8;
      const nx = Math.min(W - wide / 2 - 2, Math.max(wide / 2 + 2, x));
      ctx.fillStyle = "rgba(20,18,16,0.62)";
      ctx.fillRect(nx - wide / 2, y - 50, wide, 12);
      ctx.fillStyle = "rgba(255,214,160,0.92)";
      ctx.textAlign = "center";
      ctx.fillText(label, nx, y - 41);
      ctx.textAlign = "left";
    }
  }

  private drawBench(): void {
    const ctx = this.ctx;
    const bench = ctx.createLinearGradient(0, BENCH_TOP, 0, COUNTER_TOP);
    bench.addColorStop(0, "#C3C9CF");
    bench.addColorStop(0.5, STEEL);
    bench.addColorStop(1, STEEL_DARK);
    ctx.fillStyle = bench;
    ctx.fillRect(0, BENCH_TOP, W, COUNTER_TOP - BENCH_TOP);
    // Lamplight catching the front lip of the stainless.
    ctx.fillStyle = "rgba(255,214,160,0.5)";
    ctx.fillRect(0, BENCH_TOP, W, 2);
  }

  /**
   * The bench, lived-in. A docket rail that fills up, trays that stack, and mess that accumulates
   * — all off `density`, all deterministic so nothing twitches between frames.
   */
  private drawBenchClutter(): void {
    const ctx = this.ctx;
    const d = this.business.density;

    // Mess. Deterministic positions so it never twitches, and it only ever accumulates.
    const spots = Math.round(d * 14);
    for (let i = 0; i < spots; i += 1) {
      const x = 20 + ((i * 6151) % (W - 40));
      const y = BENCH_TOP + 2 + ((i * 3719) % 46);
      ctx.fillStyle = i % 3 === 0 ? "rgba(198,64,43,0.16)" : "rgba(90,70,40,0.14)";
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + ((i * 13) % 4), 1.4 + ((i * 7) % 3) * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Orders on. Hangs off the heat-lamp bar where a real rail does, and fills as the business
   * grows. Purely scenery — it says how much work is on, it isn't a control. (The docket-to-rail
   * *interaction* was cut in M2 because it read as an instruction; this is the furniture.)
   */
  private drawDocketRail(): void {
    const ctx = this.ctx;
    const tickets = Math.round(this.business.density * 12);
    if (tickets === 0) return;

    const railY = LAMP_BAR_Y + 13;
    ctx.fillStyle = "#5C646C";
    ctx.fillRect(52, railY, W - 104, 1.5);

    for (let i = 0; i < tickets; i += 1) {
      const x = 58 + i * 23;
      if (x > W - 62) break;
      const lean = (((i * 37) % 5) - 2) * 0.02;
      ctx.save();
      ctx.translate(x, railY);
      ctx.rotate(lean);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(-6, 1, 14, 13);
      ctx.fillStyle = "#F6F1E4";
      ctx.fillRect(-7, 0, 14, 13);
      ctx.fillStyle = "rgba(90,80,66,0.5)";
      for (let l = 0; l < 3; l += 1) ctx.fillRect(-5, 3 + l * 3, 10, 1);
      // The peg it hangs on.
      ctx.fillStyle = "#3A4046";
      ctx.fillRect(-1.5, -2.5, 3, 3);
      ctx.restore();
    }
  }

  private drawGrill(t: number): void {
    const ctx = this.ctx;
    const left = 14;
    const right = 162;
    ctx.fillStyle = "#191614";
    ctx.fillRect(left, GRATE_TOP, right - left, GRATE_HEIGHT);
    const emberAlpha = 0.2 + this.business.busy * 0.3 + this.flare * 0.3;
    ctx.fillStyle = `rgba(226,64,28,${emberAlpha})`;
    ctx.fillRect(left, GRATE_TOP, right - left, GRATE_HEIGHT);
    ctx.strokeStyle = "#2A2724";
    ctx.lineWidth = 4;
    if (this.tier(2) >= 2) {
      // A second flat-top butted up against the first — you can see the join.
      ctx.fillStyle = "#3A3532";
      ctx.fillRect(GRILL_RIGHT - 2, GRATE_TOP, 4, GRATE_HEIGHT);
    }
    for (let i = 0; i <= 5; i += 1) {
      const y = GRATE_TOP + (i / 5) * GRATE_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    if (this.reduced) return;
    const strength = 0.45 + this.business.busy * 0.45 + this.flare;
    const jets = Math.round((right - left) / 26);
    for (let i = 0; i < jets; i += 1) {
      const x = left + 16 + i * 26;
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

  /**
   * Patties. Plural, and small.
   *
   * This used to be one 80px disc in the middle of the screen — Cookie Clicker's cookie with a
   * burger skin on it. It was the click target until the reframe moved tapping onto customers,
   * and then it just sat there being the largest, best-lit object on screen doing nothing. Ben
   * called it: "why is the patty so stupidly large". Now it's a row of them cooking, and how
   * many are down depends on how hard the shop is going.
   */
  private drawPatties(t: number): void {
    const ctx = this.ctx;
    const right = this.grillRight();
    const count = Math.min(4 + this.tier(2) * 2, 2 + Math.round(this.business.busy * 5));
    const span = right - GRILL_X - 28;

    for (let i = 0; i < count; i += 1) {
      const x = GRILL_X + 16 + (span * i) / Math.max(1, count - 1);
      // Each one is on its own clock, so the grill never pulses in unison.
      const cook = (t * 0.55 + i * 0.37) % 1;
      const sizzle = Math.sin(t * 9 + i * 2.3) * 0.5 + 0.5;
      const r = PATTY_R * (1 - this.squash * 0.12);
      const y = PATTY_Y + sizzle * 0.7;

      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(x, y + 4, r * 0.95, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rare to charred across the cook cycle — you can see them come along.
      const done = 0.35 + cook * 0.45;
      const top = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r * 1.25);
      top.addColorStop(0, `rgb(${Math.round(168 - done * 70)},${Math.round(104 - done * 46)},${Math.round(60 - done * 28)})`);
      top.addColorStop(1, `rgb(${Math.round(96 - done * 40)},${Math.round(54 - done * 22)},${Math.round(30 - done * 12)})`);
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();

      // Two bar marks, because that's what a grate leaves.
      ctx.strokeStyle = "rgba(24,16,10,0.6)";
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      for (let m = -1; m <= 1; m += 2) {
        ctx.beginPath();
        ctx.ellipse(x, y + m * r * 0.22, r * 0.62, r * 0.1, 0, Math.PI * 0.12, Math.PI * 0.88);
        ctx.stroke();
      }
      ctx.lineCap = "butt";

      // Fat catching the lamp along the near edge.
      ctx.strokeStyle = `rgba(255,196,110,${0.3 + sizzle * 0.25 + this.flare * 0.35})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x, y, r - 0.8, r * 0.62 - 0.8, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
  }

  /** A burger crossing from the pass to whoever ordered it — throughput you can watch. */
  private drawBurgers(): void {
    const ctx = this.ctx;
    for (const b of this.burgers) {
      const e = b.t;
      const x = b.fromX + (b.toX - b.fromX) * e;
      // An arc, so it reads as handed over rather than dragged along a rail.
      const y = PATTY_Y + (b.toY - PATTY_Y) * e - Math.sin(e * Math.PI) * 34;
      const fade = e > 0.82 ? 1 - (e - 0.82) / 0.18 : 1;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(x, y);
      ctx.rotate(b.spin * e);

      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(0, 7, 8, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Bottom bun, patty, cheese, top bun. Small, but unmistakably a burger.
      ctx.fillStyle = "#C98F4E";
      ctx.beginPath();
      ctx.ellipse(0, 4, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6E3F1F";
      ctx.fillRect(-8, -0.5, 16, 4);
      ctx.fillStyle = "#E0B23A";
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.lineTo(5, 3.5);
      ctx.lineTo(-5, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#E0A868";
      ctx.beginPath();
      ctx.ellipse(0, -1, 8.5, 6, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 3; i += 1) {
        ctx.fillRect(-4 + i * 3.4, -4.6 + (i % 2) * 1.4, 1.4, 1.4);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawCounter(): void {
    const ctx = this.ctx;
    // Timber counter front — the warm mass the customers stand at.
    const g = ctx.createLinearGradient(0, COUNTER_TOP, 0, COUNTER_TOP + COUNTER_H);
    g.addColorStop(0, "#A26E3E");
    g.addColorStop(1, TIMBER);
    ctx.fillStyle = g;
    ctx.fillRect(0, COUNTER_TOP, W, COUNTER_H);
    // Stainless pass edge along the top of it, lit.
    ctx.fillStyle = "#C8CED4";
    ctx.fillRect(0, COUNTER_TOP, W, 4);
    ctx.fillStyle = "rgba(255,214,160,0.55)";
    ctx.fillRect(0, COUNTER_TOP, W, 1.5);
    // Panelled front and a kick rail, so it's a piece of joinery rather than a brown stripe.
    ctx.strokeStyle = "rgba(58,34,18,0.5)";
    ctx.lineWidth = 1.5;
    for (let x = 26; x < W; x += 72) {
      ctx.strokeRect(x, COUNTER_TOP + 9, 52, COUNTER_H - 18);
    }
    ctx.fillStyle = "rgba(255,214,160,0.1)";
    ctx.fillRect(0, COUNTER_TOP + 6, W, 1);
    ctx.fillStyle = "#5E3D22";
    ctx.fillRect(0, COUNTER_TOP + COUNTER_H - 4, W, 4);
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fillRect(0, COUNTER_TOP + COUNTER_H - 1, W, 1);
  }

  private drawCustomers(t: number): void {
    const ctx = this.ctx;
    for (const c of this.customers) {
      ctx.globalAlpha = c.fade === undefined ? 1 : c.fade;
      const spot = this.place(c);
      const idle = c.state === "wait" ? Math.sin(c.bob * 3) * 1.3 * spot.scale : 0;
      const y = spot.y + idle;
      const x = spot.x;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(spot.scale, spot.scale);
      ctx.translate(-x, -y);

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

      // A regular is a face you know. Name only — no mechanics, no badge, no noise.
      // From the strip you're too far away to recognise anyone.
      if (c.regular && c.state === "wait" && this.view < 2) {
        ctx.fillStyle = "rgba(246,241,228,0.62)";
        ctx.font = "700 8px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(c.regular, x, headY - 16);
        ctx.textAlign = "left";
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
      ctx.restore();
      ctx.globalAlpha = 1;
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
