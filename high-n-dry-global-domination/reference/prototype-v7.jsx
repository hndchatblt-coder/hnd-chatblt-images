import { useState, useEffect, useRef, useCallback } from "react";

// ============ HIGH N' DRY: GLOBAL DOMINATION — v7 — THE EXPEDITOR + DOWNTIME ECONOMY ============
const CFG = {
  items: {
    burger: { icon: "🍔", price: 12, label: "GRILL", col: "#FF7A2F", baseCook: 4.0 },
    chips: { icon: "🍟", price: 5, label: "FRYER", col: "#E8C547", baseCook: 3.0 },
    drink: { icon: "🥤", price: 3, label: "DRINKS", col: "#6FA8DC", baseCook: 2.0 },
  },
  netRate: 0.44, tipPct: 0.25, tipWindow: 0.6, tapBoost: 0.34, staffMult: 3.0,
  lanes: {
    burger: { hire: { name: "Deano", cost: 900 }, speedUp: { base: 220, g: 1.9 }, stockUp: { base: 350, g: 2.0 } },
    chips: { hire: { name: "Tash", cost: 250 }, speedUp: { base: 100, g: 1.9 }, stockUp: { base: 160, g: 2.0 } },
    drink: { hire: { name: "Sammy", cost: 150 }, speedUp: { base: 60, g: 1.9 }, stockUp: { base: 110, g: 2.0 } },
  },
  sizes: [
    { name: "Shopfront", cost: 0, speedCap: 3, stockCap: 2, maxQ: 5, w: 0.62, prepCap: 15 },
    { name: "Corner Site", cost: 4000, speedCap: 5, stockCap: 4, maxQ: 7, w: 0.8, prepCap: 25 },
    { name: "Flagship", cost: 15000, speedCap: 8, stockCap: 6, maxQ: 9, w: 0.97, prepCap: 40 },
  ],
  baseStock: { burger: 3, chips: 4, drink: 5 },
  patienceSec: 24,
  waveGap: (i) => Math.max(4, 16 - i * 10) + Math.random() * 6,
  waveSize: (i) => 1 + Math.floor(Math.random() * (1 + Math.round(i * 2.6))),
  gminPerSec: 2,
  // downtime economy
  research: { taps: 35, bangerChance: 0.2, surgeSec: 60, flopCash: 25 },
  prep: { boost: 1.6 },
  ads: { baseCost: 200, costG: 1.3, surgeSec: 45, cooldownSec: 60 },
  flyer: { chance: 0.55 },
  coin: { chance: 0.3, life: 4 },
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FACES = ["🧔", "👩", "🧑", "👨‍🦱", "👵", "🧢", "👷", "🧕", "🕺", "👩‍🎤"];
const SP_A = ["Seoul Fire", "Vegemite Aioli", "Midnight Char", "Double Leprechaun", "Bondi Smash", "Truffle Tradie", "Gochujang Gauntlet", "Brisket Sunrise"];
const SP_B = ["Burger", "Stack", "Melt", "Loader", "Beast", "Special"];
const fmt = (v) => (v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e4 ? (v / 1e3).toFixed(1) + "k" : Math.floor(v).toLocaleString());
const upCost = (u, l) => Math.round(u.base * Math.pow(u.g, l));

let CID = 0;
function makeCustomer(big, fat) {
  const roll = Math.random();
  let need;
  if (big) need = { burger: 3 + Math.floor(Math.random() * 3), chips: 2, drink: 2 };
  else if (roll < 0.3) need = { burger: 1, chips: Math.random() < 0.5 ? 1 : 0, drink: Math.random() < 0.5 ? 1 : 0 };
  else if (roll < 0.55) need = { burger: 0, chips: 1, drink: Math.random() < 0.6 ? 1 : 0 };
  else if (roll < 0.75) need = { burger: 0, chips: 0, drink: 1 + (Math.random() < 0.3 ? 1 : 0) };
  else need = { burger: 1 + (Math.random() < 0.4 ? 1 : 0), chips: 1, drink: 1 };
  if (fat) { need.burger += Math.random() < 0.6 ? 1 : 0; need.chips += Math.random() < 0.5 ? 1 : 0; } // surge customers order bigger
  const value = Object.keys(need).reduce((a, k) => a + need[k] * CFG.items[k].price, 0);
  return { id: ++CID, need, value, patience: 1, face: big ? "👷" : FACES[CID % FACES.length], x: -20, y: 0, state: "in", big, shakeT: 0 };
}

export default function HighNDryV7() {
  const [, force] = useState(0);
  const canvasRef = useRef(null);
  const S = useRef({
    cash: 260, dispCash: 260, lifetime: 0, served: 0, walked: 0, tips: 0,
    gmin: 2 * 1440 + 11 * 60,
    customers: [], passersby: [], coins: [], nextWave: 2, busTimer: 50 + Math.random() * 50, nextWalker: 2,
    lanes: {
      burger: { hired: false, speedLvl: 0, stockLvl: 0, stock: 1, prog: 0, flash: 0 },
      chips: { hired: false, speedLvl: 0, stockLvl: 0, stock: 1, prog: 0, flash: 0 },
      drink: { hired: false, speedLvl: 0, stockLvl: 0, stock: 2, prog: 0, flash: 0 },
    },
    size: 0, projectiles: [], floats: [],
    research: 0, researchFlash: 0,
    prep: 0,
    adUses: 0, adCooldown: 0,
    surge: 0, surgeLabel: null,
    toast: null, firstHireDone: false, overlay: null,
  });

  const stockCap = (lane) => CFG.baseStock[lane] + S.current.lanes[lane].stockLvl + S.current.size;

  const startSurge = (sec, label) => {
    const s = S.current;
    s.surge = Math.max(s.surge, sec);
    s.surgeLabel = label;
    s.nextWave = Math.min(s.nextWave, 0.8);
  };

  const tick = useCallback(() => {
    const s = S.current;
    const dt = 0.1;
    s.gmin += CFG.gminPerSec * dt;
    const day = Math.floor(s.gmin / 1440) % 7;
    const hour = Math.floor((s.gmin % 1440) / 60);
    const raw = hour >= 11 && hour <= 14 ? 0.85 : hour >= 18 && hour <= 21 ? 1.0 : hour >= 15 && hour <= 17 ? 0.35 : hour >= 7 ? 0.3 : 0.15;
    let intensity = Math.min(1, raw * (day >= 4 ? 1.15 : 1));
    if (s.surge > 0) { s.surge -= dt; intensity = 1.2; if (s.surge <= 0) { s.surgeLabel = null; s.toast = "The surge is over. Back to earning it the slow way."; } }
    if (s.adCooldown > 0) s.adCooldown -= dt;

    s.nextWave -= dt;
    if (s.nextWave <= 0) {
      s.nextWave = CFG.waveGap(intensity);
      const n = CFG.waveSize(intensity);
      for (let i = 0; i < n; i++) {
        const inQ = s.customers.filter((c) => c.state === "in" || c.state === "wait").length;
        if (inQ < CFG.sizes[s.size].maxQ) setTimeout(() => { S.current.customers.push(makeCustomer(false, S.current.surge > 0)); }, i * 450);
        else s.walked++;
      }
    }
    s.busTimer -= dt;
    if (s.busTimer <= 0) {
      s.busTimer = 70 + Math.random() * 70;
      const inQ = s.customers.filter((c) => c.state === "in" || c.state === "wait").length;
      if (inQ < CFG.sizes[s.size].maxQ) { s.customers.push(makeCustomer(true, false)); s.toast = "Tradie crew's in. Big order, short fuse, big money."; }
    }
    // street traffic
    s.nextWalker -= dt;
    if (s.nextWalker <= 0) { s.nextWalker = 3.5 + Math.random() * 4; s.passersby.push({ x: -15, id: ++CID }); }

    s.customers.forEach((c) => {
      if (c.state === "wait") {
        c.patience -= dt / (CFG.patienceSec * (c.big ? 0.85 : 1));
        if (c.patience <= 0) { c.state = "angry"; s.walked++; }
      }
      if (c.shakeT > 0) c.shakeT -= dt;
    });

    for (const k of Object.keys(s.lanes)) {
      const L = s.lanes[k];
      if (L.stock < stockCap(k)) {
        let rate = (1 / CFG.items[k].baseCook) * Math.pow(1.18, L.speedLvl) * (L.hired ? CFG.staffMult : 1);
        if (s.prep > 0) rate *= CFG.prep.boost;
        L.prog += rate * dt;
        if (L.prog >= 1) { L.prog = 0; L.stock++; L.flash = 1; if (s.prep > 0) s.prep--; }
      } else L.prog = 0;
      L.flash *= 0.9;
    }

    s.coins.forEach((c) => (c.life -= dt));
    s.coins = s.coins.filter((c) => c.life > 0);
    s.researchFlash *= 0.9;
    s.dispCash += (s.cash - s.dispCash) * 0.18;
    force((x) => x + 1);
  }, []);

  useEffect(() => { const id = setInterval(tick, 100); return () => clearInterval(id); }, [tick]);

  const tryServe = (c) => {
    const s = S.current;
    if (c.state !== "wait") return;
    const can = Object.keys(c.need).every((k) => s.lanes[k].stock >= c.need[k]);
    if (!can) { c.shakeT = 0.5; if (navigator.vibrate) navigator.vibrate([15, 30, 15]); force((x) => x + 1); return; }
    Object.keys(c.need).forEach((k) => {
      s.lanes[k].stock -= c.need[k];
      for (let i = 0; i < c.need[k]; i++) s.projectiles.push({ lane: k, to: c.id, t: -i * 0.08 });
    });
    let p = c.value * CFG.netRate;
    const tipped = c.patience > CFG.tipWindow;
    if (tipped) { p += c.value * CFG.tipPct; s.tips++; }
    s.cash += p; s.lifetime += p; s.served++;
    c.state = "served";
    if (Math.random() < CFG.coin.chance) s.coins.push({ x: c.x + 20 + Math.random() * 30, y: 0, val: 2 + Math.round(Math.random() * 3), life: CFG.coin.life, id: ++CID });
    s.floats.push({ x: c.x, txt: tipped ? `+$${Math.round(p)} TIP!` : `+$${Math.round(p)}`, t: 0, gold: tipped });
    if (navigator.vibrate) navigator.vibrate(12);
    force((x) => x + 1);
  };

  const canvasTap = (e) => {
    const cv = canvasRef.current;
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * cv.width;
    const y = ((e.clientY - r.top) / r.height) * cv.height;
    const s = S.current;
    // coins first (they're on top and time-limited)
    for (const c of s.coins) {
      if (Math.hypot(c.x - x, c.y - y) < 26) {
        s.cash += c.val; s.lifetime += c.val;
        s.floats.push({ x: c.x, txt: `+$${c.val}`, t: 0 });
        s.coins = s.coins.filter((k) => k.id !== c.id);
        if (navigator.vibrate) navigator.vibrate(6);
        force((v) => v + 1); return;
      }
    }
    // passersby — flyer
    for (const p of s.passersby) {
      if (Math.hypot(p.x - x, (198) - y) < 28 && !p.done) {
        p.done = true;
        const inQ = s.customers.filter((c) => c.state === "in" || c.state === "wait").length;
        if (Math.random() < CFG.flyer.chance && inQ < CFG.sizes[s.size].maxQ) {
          s.customers.push(makeCustomer(false, false));
          s.floats.push({ x: p.x, txt: "flyer worked!", t: 0 });
          s.passersby = s.passersby.filter((k) => k.id !== p.id);
        } else {
          s.floats.push({ x: p.x, txt: "nah mate", t: 0 });
        }
        if (navigator.vibrate) navigator.vibrate(6);
        force((v) => v + 1); return;
      }
    }
    // customers — serve
    let best = null, bd = 1e9;
    s.customers.forEach((c) => {
      if (c.state !== "wait") return;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < 34 && d < bd) { bd = d; best = c; }
    });
    if (best) tryServe(best);
  };

  const boost = (lane) => {
    const L = S.current.lanes[lane];
    if (L.stock >= stockCap(lane)) return;
    L.prog += CFG.tapBoost;
    if (L.prog >= 1) { L.prog = 0; L.stock++; L.flash = 1; if (S.current.prep > 0) S.current.prep--; }
    if (navigator.vibrate) navigator.vibrate(5);
    force((x) => x + 1);
  };

  const tapResearch = () => {
    const s = S.current;
    s.research++;
    s.researchFlash = 1;
    if (navigator.vibrate) navigator.vibrate(4);
    if (s.research >= CFG.research.taps) {
      s.research = 0;
      const name = `The ${SP_A[Math.floor(Math.random() * SP_A.length)]} ${SP_B[Math.floor(Math.random() * SP_B.length)]}`;
      if (Math.random() < CFG.research.bangerChance) {
        startSurge(CFG.research.surgeSec, `BANGER: ${name}`);
        s.toast = `${name} is going OFF. Word's out. Brace.`;
      } else {
        s.cash += CFG.research.flopCash; s.lifetime += CFG.research.flopCash;
        s.toast = `${name}. Leichhardt has voted. +$${CFG.research.flopCash} — at least the staff ate well.`;
      }
    }
    force((x) => x + 1);
  };

  const tapPrep = () => {
    const s = S.current;
    if (s.prep >= CFG.sizes[s.size].prepCap) return;
    s.prep++;
    if (navigator.vibrate) navigator.vibrate(4);
    force((x) => x + 1);
  };

  const adCost = () => Math.round(CFG.ads.baseCost * Math.pow(CFG.ads.costG, S.current.adUses));
  const buyAd = () => {
    const s = S.current;
    if (s.adCooldown > 0 || s.cash < adCost()) return;
    s.cash -= adCost(); s.adUses++;
    s.adCooldown = CFG.ads.cooldownSec + CFG.ads.surgeSec;
    startSurge(CFG.ads.surgeSec, "AD BLITZ");
    s.toast = "Boosted. The algorithm has chosen you. Don't waste it.";
    force((x) => x + 1);
  };

  // ---------- CANVAS ----------
  useEffect(() => {
    let raf;
    const draw = () => {
      const s = S.current, cv = canvasRef.current;
      if (!cv) { raf = requestAnimationFrame(draw); return; }
      const ctx = cv.getContext("2d");
      const W = cv.width, H = cv.height;
      const hour = Math.floor((s.gmin % 1440) / 60);
      const t = performance.now() / 1000;
      const nightT = hour >= 19 || hour <= 5 ? 0.5 : hour >= 17 ? 0.25 : 0;
      ctx.fillStyle = `rgb(${22 - nightT * 10},${19 - nightT * 8},${15 - nightT * 6})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#0E0C09"; ctx.fillRect(0, H - 26, W, 26);

      const venueW = CFG.sizes[s.size].w * W, vx = (W - venueW) / 2;
      ctx.fillStyle = "#241F17"; ctx.fillRect(vx, 16, venueW, H - 42);
      ctx.fillStyle = "#FF7A2F"; ctx.font = "700 10px 'JetBrains Mono'";
      ctx.fillText(CFG.sizes[s.size].name.toUpperCase(), vx + 8, 30);
      // surge banner
      if (s.surge > 0) {
        ctx.fillStyle = `rgba(255,122,47,${0.75 + Math.sin(t * 6) * 0.2})`;
        ctx.font = "800 11px 'JetBrains Mono'";
        ctx.fillText(`⚡ ${s.surgeLabel} · ${Math.ceil(s.surge)}s`, vx + 8, H - 34);
      }
      // prep pile
      if (s.prep > 0) {
        ctx.font = "10px sans-serif";
        ctx.fillText("🧅".repeat(Math.min(6, Math.ceil(s.prep / 5))), vx + venueW - 70, 30);
        ctx.fillStyle = "#8FBF6A"; ctx.font = "700 9px 'JetBrains Mono'";
        ctx.fillText(`prep ${s.prep}`, vx + venueW - 70, 40);
      }

      const laneKeys = ["burger", "chips", "drink"];
      const stW = (venueW - 30) / 3;
      const stationXY = {};
      laneKeys.forEach((k, i) => {
        const sx = vx + 15 + i * stW, sy = 42;
        stationXY[k] = { x: sx + stW / 2, y: sy + 12 };
        const L = s.lanes[k];
        ctx.fillStyle = "#3A3226"; ctx.fillRect(sx, sy, stW - 10, 14);
        ctx.fillStyle = CFG.items[k].col;
        ctx.fillRect(sx, sy + 16, (stW - 10) * Math.min(1, L.prog), 3);
        if (L.flash > 0.3) { ctx.fillStyle = `rgba(255,201,138,${L.flash * 0.5})`; ctx.beginPath(); ctx.arc(sx + stW / 2, sy + 7, 13, 0, 7); ctx.fill(); }
        ctx.font = "12px sans-serif";
        if (L.hired) ctx.fillText("🧑‍🍳", sx + stW / 2 - 7, sy - 3 + Math.sin(t * 5 + i * 2) * 1.5);
        ctx.font = "11px sans-serif";
        const cap = stockCap(k);
        for (let j = 0; j < cap; j++) {
          ctx.globalAlpha = j < L.stock ? 1 : 0.18;
          ctx.fillText(CFG.items[k].icon, sx + 2 + j * 12, sy + 32);
        }
        ctx.globalAlpha = 1;
      });

      const cy = H - 70;
      ctx.fillStyle = "#3A3226"; ctx.fillRect(vx + 10, cy, venueW - 20, 10);

      const qStart = vx + 30;
      let qi = 0;
      s.customers.forEach((c) => {
        const target = qStart + qi * ((venueW - 56) / CFG.sizes[s.size].maxQ);
        if (c.state === "in") { c.x += 95 / 60; if (c.x >= target) c.state = "wait"; qi++; }
        else if (c.state === "wait") { c.x += (target - c.x) * 0.1; qi++; }
        else if (c.state === "served") { c.x += 100 / 60; }
        else if (c.state === "angry") { c.x -= 110 / 60; }
        const shake = c.shakeT > 0 ? Math.sin(t * 60) * 3 : 0;
        const y = cy + 18; c.y = y - 8;
        const bob = Math.sin(t * 8 + c.id) * 1.2;
        ctx.font = c.big ? "20px sans-serif" : "16px sans-serif";
        ctx.fillText(c.state === "served" ? "😋" : c.state === "angry" ? "😤" : c.face, c.x - 8 + shake, y + bob);
        if (c.state === "wait") {
          const affordable = Object.keys(c.need).every((k) => s.lanes[k].stock >= c.need[k]);
          ctx.strokeStyle = c.shakeT > 0 ? "#E03616" : affordable ? "#8FBF6A" : c.patience < 0.35 ? "#E03616" : "#FF7A2F";
          ctx.lineWidth = affordable ? 3 : 2;
          ctx.beginPath(); ctx.arc(c.x, y - 6 + bob, c.big ? 14 : 11, -Math.PI / 2, -Math.PI / 2 + c.patience * Math.PI * 2); ctx.stroke();
          const parts = laneKeys.flatMap((k) => Array(Math.max(0, c.need[k])).fill(k));
          if (parts.length) {
            ctx.font = "10px sans-serif";
            const bw = Math.max(20, parts.length * 11 + 6);
            ctx.fillStyle = affordable ? "rgba(200,235,180,0.95)" : "rgba(239,227,204,0.92)";
            ctx.beginPath(); ctx.roundRect(c.x - bw / 2, y - 38, bw, 14, 4); ctx.fill();
            parts.forEach((k, j) => {
              const missing = s.lanes[k].stock < c.need[k];
              ctx.globalAlpha = c.shakeT > 0 && missing && Math.sin(t * 25) > 0 ? 0.2 : 1;
              ctx.fillText(CFG.items[k].icon, c.x - bw / 2 + 3 + j * 11, y - 27);
              ctx.globalAlpha = 1;
            });
          }
          if (c.big) { ctx.font = "700 8px 'JetBrains Mono'"; ctx.fillStyle = "#FFC98A"; ctx.fillText(`$${c.value}`, c.x - 8, y - 42); }
        }
      });
      s.customers = s.customers.filter((c) => c.x > -25 && c.x < W + 25);

      // passersby — tappable
      s.passersby.forEach((p) => {
        p.x += 55 / 60;
        ctx.font = "14px sans-serif";
        ctx.globalAlpha = 0.85;
        ctx.fillText("🚶", p.x, H - 8 + Math.sin(t * 10 + p.id) * 1);
        ctx.globalAlpha = 1;
      });
      s.passersby = s.passersby.filter((p) => p.x < W + 20).slice(-6);

      // coins
      s.coins.forEach((c) => {
        c.y = cy + 26;
        ctx.globalAlpha = Math.min(1, c.life / 1.5);
        ctx.font = "13px sans-serif";
        ctx.fillText("🪙", c.x - 6, c.y + Math.sin(t * 6 + c.id) * 2);
        ctx.globalAlpha = 1;
      });

      s.projectiles.forEach((p) => {
        p.t += 1 / 20;
        if (p.t < 0) return;
        const c = s.customers.find((x) => x.id === p.to);
        const from = stationXY[p.lane];
        if (!c || !from) { p.t = 2; return; }
        const x = from.x + (c.x - from.x) * p.t;
        const y = from.y + (cy + 8 - from.y) * p.t - Math.sin(Math.max(0, p.t) * Math.PI) * 32;
        ctx.font = "12px sans-serif"; ctx.fillText(CFG.items[p.lane].icon, x - 6, y);
      });
      s.projectiles = s.projectiles.filter((p) => p.t < 1);

      s.floats.forEach((f) => {
        f.t += 1 / 55;
        ctx.font = `700 ${f.gold ? 12.5 : 11}px 'JetBrains Mono'`;
        ctx.fillStyle = f.gold ? `rgba(255,201,138,${1 - f.t})` : `rgba(143,191,106,${1 - f.t})`;
        ctx.fillText(f.txt, f.x - 22, cy - 8 - f.t * 26);
      });
      s.floats = s.floats.filter((f) => f.t < 1);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const s = S.current;
  const day = Math.floor(s.gmin / 1440) % 7;
  const hour = Math.floor((s.gmin % 1440) / 60);
  const min = Math.floor(s.gmin % 60);
  const size = CFG.sizes[s.size];

  const hire = (lane) => {
    const c = CFG.lanes[lane].hire.cost;
    if (s.cash < c || s.lanes[lane].hired) return;
    s.cash -= c; s.lanes[lane].hired = true;
    if (!s.firstHireDone) { s.firstHireDone = true; s.overlay = { name: CFG.lanes[lane].hire.name, lane }; }
    else s.toast = `${CFG.lanes[lane].hire.name}'s on. The pass fills itself a little faster now.`;
    force((x) => x + 1);
  };
  const buyUp = (lane, kind) => {
    const L = s.lanes[lane];
    const lvl = kind === "speed" ? L.speedLvl : L.stockLvl;
    const cap = kind === "speed" ? size.speedCap : size.stockCap;
    if (lvl >= cap) return;
    const c = upCost(CFG.lanes[lane][kind === "speed" ? "speedUp" : "stockUp"], lvl);
    if (s.cash < c) return;
    s.cash -= c;
    if (kind === "speed") L.speedLvl++; else L.stockLvl++;
    force((x) => x + 1);
  };
  const renovate = () => {
    if (s.size >= 2 || s.cash < CFG.sizes[s.size + 1].cost) return;
    s.cash -= CFG.sizes[s.size + 1].cost; s.size++;
    s.toast = `${CFG.sizes[s.size].name}. Longer queue, deeper pass, higher caps.`;
    force((x) => x + 1);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#16130F", color: "#EFE3CC", fontFamily: "'Barlow', system-ui, sans-serif", maxWidth: 430, margin: "0 auto", paddingBottom: 40, userSelect: "none" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Text:wght@700;800&family=Barlow:wght@400;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
        button { -webkit-tap-highlight-color: transparent; font-family: inherit; touch-action: manipulation; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
      `}</style>

      <div style={{ padding: "12px 16px 6px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div style={{ fontFamily: "'Big Shoulders Stencil Text'", fontWeight: 800, fontSize: 20, letterSpacing: 1, color: "#FF7A2F" }}>HIGH N' DRY</div>
          <div style={{ fontSize: 11, color: "#8A7D66", fontFamily: "'JetBrains Mono'" }}>{DAYS[day]} {String(hour).padStart(2, "0")}:{String(min).padStart(2, "0")} · tips {s.tips}</div>
        </div>
        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 23, fontWeight: 700 }}>${fmt(s.dispCash)}</div>
      </div>

      <div style={{ margin: "4px 12px", borderRadius: 10, overflow: "hidden", border: `1px solid ${s.surge > 0 ? "#FF7A2F" : "#2A241D"}` }}>
        <canvas ref={canvasRef} width={406} height={210} style={{ width: "100%", display: "block" }} onPointerDown={canvasTap} />
      </div>
      <div style={{ margin: "5px 16px 8px", fontSize: 11, color: "#8A7D66", textAlign: "center" }}>
        Tap customers to serve · tap 🚶 to flyer them · grab 🪙 before they fade
      </div>

      {/* STATION BOOST PADS */}
      <div style={{ margin: "0 12px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {Object.keys(CFG.lanes).map((lane) => {
          const L = s.lanes[lane]; const it = CFG.items[lane];
          const cap = stockCap(lane);
          const demand = s.customers.filter((c) => c.state === "wait").reduce((a, c) => a + Math.max(0, c.need[lane]), 0);
          const short = demand > L.stock;
          return (
            <button key={lane} onPointerDown={() => boost(lane)}
              style={{ padding: "9px 4px 7px", background: "#241F17", border: `2px solid ${short ? it.col : "#2A241D"}`, borderRadius: 12, color: "#EFE3CC", position: "relative", overflow: "hidden", transform: `scale(${1 + L.flash * 0.04})` }}>
              <div style={{ position: "absolute", bottom: 0, left: 0, height: 4, width: `${Math.min(1, L.prog) * 100}%`, background: it.col, transition: "width 0.08s linear" }} />
              <div style={{ fontSize: 20 }}>{it.icon}</div>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 700, color: L.stock === 0 ? "#E03616" : "#EFE3CC" }}>{L.stock}<span style={{ color: "#6B604D" }}>/{cap}</span></div>
              {short && <div style={{ position: "absolute", top: 3, right: 5, background: "#E03616", borderRadius: 10, minWidth: 18, padding: "0 4px", fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono'" }}>need {demand}</div>}
            </button>
          );
        })}
      </div>

      {/* DOWNTIME ROW — research, prep, ads */}
      <div style={{ margin: "8px 12px 0", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <button onPointerDown={tapResearch}
          style={{ padding: "9px 4px 7px", background: "#1D1A24", border: "1px solid #3A3050", borderRadius: 12, color: "#EFE3CC", position: "relative", overflow: "hidden", transform: `scale(${1 + s.researchFlash * 0.03})` }}>
          <div style={{ position: "absolute", bottom: 0, left: 0, height: 4, width: `${(s.research / CFG.research.taps) * 100}%`, background: "#A88FDC" }} />
          <div style={{ fontSize: 18 }}>🧪</div>
          <div style={{ fontSize: 11, fontWeight: 700 }}>NEW SPECIAL</div>
          <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: "#8A7D66" }}>{s.research}/{CFG.research.taps} · tap to R&D</div>
        </button>
        <button onPointerDown={tapPrep}
          style={{ padding: "9px 4px 7px", background: "#1A2417", border: "1px solid #2A4020", borderRadius: 12, color: "#EFE3CC", position: "relative", overflow: "hidden", opacity: s.prep >= size.prepCap ? 0.6 : 1 }}>
          <div style={{ position: "absolute", bottom: 0, left: 0, height: 4, width: `${(s.prep / size.prepCap) * 100}%`, background: "#8FBF6A" }} />
          <div style={{ fontSize: 18 }}>🔪</div>
          <div style={{ fontSize: 11, fontWeight: 700 }}>{s.prep >= size.prepCap ? "PREP FULL" : "PREP"}</div>
          <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: "#8A7D66" }}>{s.prep}/{size.prepCap} · +60% cook speed</div>
        </button>
        <button onClick={buyAd} disabled={s.adCooldown > 0 || s.cash < adCost()}
          style={{ padding: "9px 4px 7px", background: s.adCooldown > 0 ? "#1A1610" : "#24171D", border: "1px solid #502A3A", borderRadius: 12, color: "#EFE3CC", position: "relative", overflow: "hidden", opacity: s.adCooldown > 0 || s.cash < adCost() ? 0.55 : 1 }}>
          <div style={{ fontSize: 18 }}>📣</div>
          <div style={{ fontSize: 11, fontWeight: 700 }}>{s.adCooldown > 0 ? `COOLDOWN ${Math.ceil(s.adCooldown)}s` : "BOOST SOCIALS"}</div>
          <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: "#DC8FA8" }}>${fmt(adCost())} · 45s rush</div>
        </button>
      </div>

      {/* hires & upgrades */}
      <div style={{ margin: "8px 12px 0", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {Object.keys(CFG.lanes).map((lane) => {
          const L = s.lanes[lane]; const lc = CFG.lanes[lane];
          return (
            <div key={lane} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {!L.hired ? (
                <button onClick={() => hire(lane)} disabled={s.cash < lc.hire.cost}
                  style={{ padding: "8px 4px", background: s.cash >= lc.hire.cost ? "#FF7A2F" : "#1A1610", color: s.cash >= lc.hire.cost ? "#16130F" : "#6B604D", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12 }}>
                  Hire {lc.hire.name}<br /><span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11 }}>${fmt(lc.hire.cost)}</span>
                </button>
              ) : (
                <div style={{ padding: "6px 4px", textAlign: "center", fontSize: 11, color: "#8FBF6A", background: "#1D2417", borderRadius: 8, border: "1px solid #2A3A20" }}>🧑‍🍳 {lc.hire.name}</div>
              )}
              <button onClick={() => buyUp(lane, "speed")} disabled={L.speedLvl >= size.speedCap || s.cash < upCost(lc.speedUp, L.speedLvl)}
                style={{ padding: "7px 4px", background: "#241F17", border: "1px solid #2A241D", borderRadius: 8, color: "#EFE3CC", fontSize: 10.5, opacity: L.speedLvl >= size.speedCap ? 0.5 : s.cash >= upCost(lc.speedUp, L.speedLvl) ? 1 : 0.5 }}>
                {L.speedLvl >= size.speedCap ? "Speed MAX" : <>Cook speed {L.speedLvl}/{size.speedCap}<br /><span style={{ fontFamily: "'JetBrains Mono'", color: "#FF7A2F" }}>${fmt(upCost(lc.speedUp, L.speedLvl))}</span></>}
              </button>
              <button onClick={() => buyUp(lane, "stock")} disabled={L.stockLvl >= size.stockCap || s.cash < upCost(lc.stockUp, L.stockLvl)}
                style={{ padding: "7px 4px", background: "#241F17", border: "1px solid #2A241D", borderRadius: 8, color: "#EFE3CC", fontSize: 10.5, opacity: L.stockLvl >= size.stockCap ? 0.5 : s.cash >= upCost(lc.stockUp, L.stockLvl) ? 1 : 0.5 }}>
                {L.stockLvl >= size.stockCap ? "Pass MAX" : <>Pass space {L.stockLvl}/{size.stockCap}<br /><span style={{ fontFamily: "'JetBrains Mono'", color: "#FF7A2F" }}>${fmt(upCost(lc.stockUp, L.stockLvl))}</span></>}
              </button>
            </div>
          );
        })}
      </div>

      {s.size < 2 && (
        <button onClick={renovate} disabled={s.cash < CFG.sizes[s.size + 1].cost}
          style={{ display: "block", width: "calc(100% - 24px)", margin: "10px 12px 0", padding: 11, background: "#241F17", color: "#EFE3CC", border: "1px solid #FF7A2F", borderRadius: 10, fontWeight: 700, fontSize: 13, opacity: s.cash >= CFG.sizes[s.size + 1].cost ? 1 : 0.5 }}>
          RENOVATE → {CFG.sizes[s.size + 1].name.toUpperCase()} — ${fmt(CFG.sizes[s.size + 1].cost)}
        </button>
      )}

      <div style={{ margin: "10px 16px 0", fontSize: 11, color: "#6B604D", fontFamily: "'JetBrains Mono'", display: "flex", justifyContent: "space-between" }}>
        <span>served {fmt(s.served)}</span><span>walked {fmt(s.walked)}</span><span>lifetime ${fmt(s.lifetime)}</span>
      </div>

      {s.toast && (
        <div onClick={() => { s.toast = null; force((x) => x + 1); }}
          style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 48px)", maxWidth: 380, padding: "11px 15px", background: "#EFE3CC", color: "#16130F", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 20 }}>
          {s.toast}
        </div>
      )}

      {s.overlay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(14,12,9,0.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", zIndex: 30 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🧑‍🍳</div>
          <div style={{ fontFamily: "'Big Shoulders Stencil Text'", fontWeight: 800, fontSize: 30, color: "#FF7A2F", letterSpacing: 2, marginBottom: 10 }}>{s.overlay.name.toUpperCase()} IS ON</div>
          <div style={{ fontSize: 15, maxWidth: 300, lineHeight: 1.5, marginBottom: 24 }}>
            The {CFG.items[s.overlay.lane].label.toLowerCase()} stocks itself faster now. You run the pass — that's the job that matters.
          </div>
          <button onClick={() => { s.overlay = null; force((x) => x + 1); }}
            style={{ padding: "12px 32px", background: "#FF7A2F", color: "#16130F", border: "none", borderRadius: 8, fontFamily: "'Big Shoulders Stencil Text'", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>
            RUN THE PASS
          </button>
        </div>
      )}
    </div>
  );
}
