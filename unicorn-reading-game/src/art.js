// Hand-illustrated game art, drawn to canvases at runtime (no image files, so
// the PWA stays tiny and offline-friendly). Storybook-kawaii look: one chunky
// outline weight, one locked palette, soft ambient-occlusion shading only.
//
// Every function returns an HTMLCanvasElement. Callers either wrap it in a
// THREE.CanvasTexture (world sprites) or drop it into the DOM (shop overlay).

const TAU = Math.PI * 2;

// ---- locked palette -------------------------------------------------------
const BUBBLE = '#FF6FC4'; // bubblegum
const GRAPE  = '#8A6BFF';
const SKYB   = '#5FC8FF';
const SUN    = '#FFD166';
const MINTC  = '#7EE081';
const INK    = '#5A2B6B'; // plum ink — the one outline colour
const CREAM  = '#FFFAF6';

// Every other colour is a tint (towards white) or shade (towards ink) of the
// palette, so the whole set stays harmonious.
function mix(a, b, t) {
  const ch = (h, i) => parseInt(h.slice(i, i + 2), 16);
  const q = v => Math.round(v).toString(16).padStart(2, '0');
  return '#' + q(ch(a, 1) + (ch(b, 1) - ch(a, 1)) * t)
             + q(ch(a, 3) + (ch(b, 3) - ch(a, 3)) * t)
             + q(ch(a, 5) + (ch(b, 5) - ch(a, 5)) * t);
}
const tint  = (c, t) => mix(c, '#FFFFFF', t);
const shade = (c, t) => mix(c, INK, t);
const rgba  = (h, a) =>
  `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;

export const MANES = {
  pink:        { main: tint(BUBBLE, .15), dark: shade(BUBBLE, .25) },
  lavender:    { main: tint(GRAPE, .25),  dark: shade(GRAPE, .22) },
  sky:         { main: tint(SKYB, .18),   dark: shade(SKYB, .28) },
  mint:        { main: tint(MINTC, .12),  dark: shade(MINTC, .28) },
  sunshine:    { main: tint(SUN, .1),          dark: shade(SUN, .3) },
  berry:       { main: tint(BUBBLE, .05),      dark: shade(BUBBLE, .42) },
  coral:       { main: tint(mix(BUBBLE, SUN, .5), .15), dark: shade(mix(BUBBLE, SUN, .5), .25) },
  periwinkle:  { main: tint(mix(GRAPE, SKYB, .5), .18), dark: shade(mix(GRAPE, SKYB, .5), .26) },
};

// A unicorn "type" = a mane colourway + an optional coat pattern + an optional
// horn tint. Every friend she meets is one of these — same rigged shape as her
// own buddy, just a different colourway/marking, so the whole roster is free
// to grow without ever needing external art.
export const UNICORN_TYPES = {
  'type.blossom':  { label: 'Blossom',  mane: 'pink',       pattern: null,      hornColor: null },
  'type.starlight':{ label: 'Starlight',mane: 'lavender',   pattern: 'stars',   hornColor: tint(GRAPE, .55) },
  'type.frost':    { label: 'Frost',    mane: 'sky',        pattern: null,      hornColor: tint(SKYB, .5), irisColor: tint(SKYB, .3) },
  'type.clover':   { label: 'Clover',   mane: 'mint',       pattern: 'spots',   hornColor: null },
  'type.sunbeam':  { label: 'Sunbeam',  mane: 'sunshine',   pattern: 'stripes', hornColor: null },
  'type.berry':    { label: 'Berry',    mane: 'berry',      pattern: 'hearts', hornColor: tint(BUBBLE, .4), irisColor: tint(BUBBLE, .35) },
  'type.coral':    { label: 'Coral',    mane: 'coral',      pattern: 'spots',   hornColor: tint(SUN, .3) },
  'type.dream':    { label: 'Dream',    mane: 'periwinkle', pattern: 'stars',   hornColor: tint(SKYB, .45) },
  'type.stardust': { label: 'Stardust', mane: 'lavender',   pattern: null,      hornColor: tint(GRAPE, .6), sparkle: true },
  'type.honey':    { label: 'Honey',    mane: 'sunshine',   pattern: null,      hornColor: null,           irisColor: tint(SUN, .25) },
};

// ---- shared drawing kit ---------------------------------------------------
const LWR = 0.035; // one outline width, relative to canvas size

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }

function rr(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}

// Draw several subpaths as ONE silhouette: a fat ink stroke underneath, then
// the fills on top. Interior seams vanish; only the united outline remains.
function union(x, build, fill, lw) {
  x.save(); x.lineJoin = 'round'; x.lineCap = 'round';
  x.beginPath(); build(x);
  x.strokeStyle = INK; x.lineWidth = lw * 2; x.stroke();
  x.beginPath(); build(x);
  x.fillStyle = fill; x.fill();
  x.restore();
}

// The single shading convention: a soft ambient-occlusion ellipse.
function ao(x, cx, cy, rx, ry, alpha = .16, col = INK) {
  x.save(); x.translate(cx, cy); x.scale(1, ry / rx);
  const g = x.createRadialGradient(0, 0, rx * .15, 0, 0, rx);
  g.addColorStop(0, rgba(col, alpha)); g.addColorStop(1, rgba(col, 0));
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, rx, 0, TAU); x.fill();
  x.restore();
}

// A small coat marking, clipped to whatever shape is currently in the path
// (call right after a fill+stroke, before the next shape resets the path).
// Kept subtle — these mark a TYPE, they shouldn't fight the face for attention.
function coatPattern(x, kind, cx, cy, rx, ry, col) {
  if (!kind) return;
  x.save();
  x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); x.clip();
  x.fillStyle = rgba(col, .38);
  if (kind === 'spots') {
    for (const [dx, dy, r] of [[-.5, -.3, .16], [.35, -.5, .12], [-.15, .35, .14], [.5, .25, .1], [.05, -.05, .11]]) {
      x.beginPath(); x.arc(cx + dx * rx, cy + dy * ry, r * rx, 0, TAU); x.fill();
    }
  } else if (kind === 'stars') {
    for (const [dx, dy, s] of [[-.45, -.35, .16], [.4, -.15, .12], [-.1, .4, .14], [.45, .35, .1]]) {
      x.beginPath(); starPath(x, cx + dx * rx, cy + dy * ry, s * rx, s * rx * .45); x.fill();
    }
  } else if (kind === 'hearts') {
    for (const [dx, dy, s] of [[-.42, -.3, .13], [.38, -.1, .1], [-.05, .38, .12]]) {
      x.beginPath(); heartPath(x, cx + dx * rx, cy + dy * ry, s * rx); x.fill();
    }
  } else if (kind === 'stripes') {
    x.strokeStyle = rgba(col, .4); x.lineWidth = rx * .12; x.lineCap = 'round';
    for (const dx of [-.5, -.1, .3]) {
      x.beginPath(); x.moveTo(cx + dx * rx, cy - ry); x.quadraticCurveTo(cx + (dx + .25) * rx, cy, cx + dx * rx, cy + ry); x.stroke();
    }
  }
  x.restore();
}

function heartPath(x, cx, cy, s) {
  x.moveTo(cx, cy + s * .95);
  x.bezierCurveTo(cx - s * 1.25, cy + s * .1, cx - s * .8, cy - s * .85, cx, cy - s * .28);
  x.bezierCurveTo(cx + s * .8, cy - s * .85, cx + s * 1.25, cy + s * .1, cx, cy + s * .95);
  x.closePath();
}

function starPath(x, cx, cy, R, r, rot = -Math.PI / 2) {
  for (let i = 0; i < 5; i++) {
    const a = rot + i * TAU / 5, a2 = a + Math.PI / 5;
    if (i === 0) x.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    else x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    x.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
  }
  x.closePath();
}

function drawEye(x, cx, cy, s, irisColor) {
  x.beginPath(); x.ellipse(cx, cy, s * .82, s * 1.08, 0, 0, TAU);
  x.fillStyle = INK; x.fill();
  // a tinted iris ring sits between the ink pupil-shape and the sparkle
  // highlights — subtle by design, never louder than the highlight itself.
  if (irisColor) {
    x.beginPath(); x.ellipse(cx, cy + s * .1, s * .5, s * .62, 0, 0, TAU);
    x.fillStyle = rgba(irisColor, .6); x.fill();
  }
  x.beginPath(); x.arc(cx - s * .26, cy - s * .38, s * .36, 0, TAU); x.fillStyle = '#fff'; x.fill();
  x.beginPath(); x.arc(cx + s * .3, cy + s * .42, s * .15, 0, TAU); x.fillStyle = 'rgba(255,255,255,.9)'; x.fill();
}

// A scatter of tiny star-glints — reserved for a "magical" one-or-two types,
// not everyone, or it stops reading as special.
function sparkle(x, cx, cy, rx, ry) {
  x.save();
  x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); x.clip();
  x.fillStyle = 'rgba(255,255,255,.85)';
  for (const [dx, dy, s] of [[-.5, -.55, .05], [.3, -.7, .04], [-.15, -.2, .045], [.5, -.35, .035], [-.35, .05, .04]]) {
    x.beginPath(); starPath(x, cx + dx * rx, cy + dy * ry, s * rx, s * rx * .4); x.fill();
  }
  x.restore();
}

// ---- the chibi unicorn ----------------------------------------------------
// maneKey picks a colourway; apron marks the shopkeeper.
export function unicornCanvas(maneKey = 'pink', { apron = false, pattern = null, hornColor = null, irisColor = null, sparkle: sparkleOn = false } = {}) {
  const { main: mane, dark: maneD } = MANES[maneKey] || MANES.pink;
  const S = 512, c = cv(S), x = c.getContext('2d');
  const lw = S * LWR * .8; // 14.3 — hero canvas, one weight throughout
  x.lineJoin = 'round'; x.lineCap = 'round';

  // ground shadow (the one AO convention)
  ao(x, 256, 480, 140, 22, .18);

  // back mane — a single flowing fall down the left, plus a little tail
  union(x, p => {
    for (const [cx, cy, r] of [[140, 288, 42], [124, 344, 36], [134, 398, 30]]) {
      p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, TAU);
    }
  }, maneD, lw * .5);
  union(x, p => {
    for (const [cx, cy, r] of [[372, 380, 30], [388, 416, 23]]) {
      p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, TAU);
    }
  }, maneD, lw * .5);

  // legs + rounded hooves (drawn first so the body overlaps their tops)
  for (const cx of [204, 308]) {
    rr(x, cx - 28, 388, 56, 90, 26);
    x.fillStyle = CREAM; x.fill(); x.strokeStyle = INK; x.lineWidth = lw; x.stroke();
    rr(x, cx - 28, 446, 56, 32, 16);
    x.fillStyle = tint(BUBBLE, .55); x.fill(); x.stroke();
  }

  // body
  x.beginPath(); x.ellipse(256, 372, 102, 72, 0, 0, TAU);
  x.fillStyle = CREAM; x.fill(); x.strokeStyle = INK; x.lineWidth = lw; x.stroke();
  coatPattern(x, pattern, 256, 372, 102, 72, maneD);
  ao(x, 256, 438, 78, 18, .08); // soft AO inside the body, above the legs

  // shopkeeper apron: bib + skirt as one shape, pocket, heart name-tag
  if (apron) {
    const apCol = tint(SKYB, .72);
    union(x, p => {
      rrPath(p, 214, 334, 84, 64, 20);
      rrPath(p, 174, 388, 164, 58, 26);
    }, apCol, lw * .5);
    // waist stitch
    x.strokeStyle = shade(SKYB, .22); x.lineWidth = lw * .4;
    x.beginPath(); x.moveTo(192, 398); x.quadraticCurveTo(256, 408, 320, 398); x.stroke();
    // pocket
    rr(x, 268, 408, 34, 26, 10);
    x.fillStyle = tint(SKYB, .85); x.fill(); x.strokeStyle = INK; x.lineWidth = lw * .5; x.stroke();
    // heart name-tag
    x.beginPath(); heartPath(x, 230, 380, 14);
    x.fillStyle = BUBBLE; x.fill(); x.strokeStyle = INK; x.lineWidth = lw * .5; x.stroke();
    x.beginPath(); x.arc(225, 375, 3.5, 0, TAU); x.fillStyle = '#fff'; x.fill();
  }

  // head — big chibi head overlapping the chest so they read as one creature
  ao(x, 256, 366, 96, 22, .12);
  x.beginPath(); x.ellipse(256, 226, 144, 128, 0, 0, TAU);
  x.fillStyle = CREAM; x.fill(); x.strokeStyle = INK; x.lineWidth = lw; x.stroke();

  // ears — small, tucked inside the silhouette (mane covers their bases)
  for (const s of [-1, 1]) {
    const bx = 256 + s * 118;
    x.beginPath();
    x.moveTo(bx - s * 30, 128);
    x.quadraticCurveTo(bx - s * 14, 76, bx + s * 14, 88);
    x.quadraticCurveTo(bx + s * 22, 118, bx + s * 8, 142);
    x.closePath();
    x.fillStyle = CREAM; x.fill(); x.strokeStyle = INK; x.lineWidth = lw * .8; x.stroke();
    x.beginPath();
    x.moveTo(bx - s * 14, 122);
    x.quadraticCurveTo(bx - s * 6, 96, bx + s * 8, 102);
    x.quadraticCurveTo(bx + s * 10, 118, bx + s * 2, 130);
    x.closePath();
    x.fillStyle = tint(BUBBLE, .6); x.fill();
  }

  // front mane — one flowing scalloped shape from ear to ear, spilling down
  // the left cheek
  union(x, p => {
    for (const [cx, cy, r] of [
      [182, 150, 44], [238, 124, 48], [296, 128, 46], [346, 156, 38],
      [158, 208, 42], [372, 210, 34],
      [146, 268, 38], [138, 324, 31],
    ]) { p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, TAU); }
  }, mane, lw * .5);
  // curl details inside the mane, in the dark tone
  x.strokeStyle = maneD; x.lineWidth = lw * .45; x.lineCap = 'round';
  for (const [cx, cy, r, a0, a1] of [
    [238, 124, 30, .35 * Math.PI, .95 * Math.PI],
    [346, 156, 24, .3 * Math.PI, .95 * Math.PI],
    [158, 208, 26, .1 * Math.PI, .7 * Math.PI],
    [146, 268, 23, .15 * Math.PI, .75 * Math.PI],
  ]) { x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke(); }
  if (sparkleOn) sparkle(x, 220, 200, 130, 110);

  // horn — gold by default, or a type's own tint — with a candy spiral
  const hornCol = hornColor || SUN;
  x.beginPath();
  x.moveTo(226, 122);
  x.quadraticCurveTo(246, 58, 256, 26);
  x.quadraticCurveTo(266, 58, 286, 122);
  x.quadraticCurveTo(256, 136, 226, 122);
  x.closePath();
  x.fillStyle = hornCol; x.fill(); x.strokeStyle = INK; x.lineWidth = lw * .8; x.stroke();
  x.save(); x.clip();
  x.strokeStyle = shade(hornCol, .35); x.lineWidth = lw * .45;
  for (let i = 0; i < 3; i++) {
    const yy = 104 - i * 28;
    x.beginPath(); x.moveTo(222, yy + 8); x.lineTo(290, yy - 12); x.stroke();
  }
  x.restore();

  // face
  drawEye(x, 206, 244, 28, irisColor); drawEye(x, 306, 244, 28, irisColor);
  ao(x, 172, 290, 30, 24, .55, BUBBLE); ao(x, 340, 290, 30, 24, .55, BUBBLE);
  x.strokeStyle = INK; x.lineWidth = lw * .6; x.lineCap = 'round';
  x.beginPath(); x.arc(256, 288, 20, .2 * Math.PI, .8 * Math.PI); x.stroke();

  return c;
}

// rr but appends to an existing path (for union())
function rrPath(p, a, b, w, h, r) {
  p.moveTo(a + r, b);
  p.arcTo(a + w, b, a + w, b + h, r); p.arcTo(a + w, b + h, a, b + h, r);
  p.arcTo(a, b + h, a, b, r); p.arcTo(a, b, a + w, b, r);
  p.closePath();
}

// ---- a shiny star-coin ----------------------------------------------------
export function coinCanvas(S = 128) {
  const c = cv(S), x = c.getContext('2d'); const cx = S / 2;
  const lw = S * LWR, R = S * .44;
  x.lineJoin = 'round'; x.lineCap = 'round';
  // coin disc with a bottom-right AO crescent (offset self-copy)
  x.beginPath(); x.arc(cx, cx, R, 0, TAU); x.fillStyle = shade(SUN, .22); x.fill();
  x.beginPath(); x.arc(cx - S * .025, cx - S * .035, R, 0, TAU); x.fillStyle = SUN; x.fill();
  x.beginPath(); x.arc(cx, cx, R, 0, TAU); x.strokeStyle = INK; x.lineWidth = lw; x.stroke();
  // inner ring
  x.beginPath(); x.arc(cx, cx, R * .74, 0, TAU); x.strokeStyle = tint(SUN, .45); x.lineWidth = lw * .7; x.stroke();
  // star
  x.beginPath(); starPath(x, cx, cx + S * .01, S * .22, S * .096);
  x.fillStyle = CREAM; x.fill(); x.strokeStyle = shade(SUN, .38); x.lineWidth = lw * .55; x.stroke();
  // glint
  x.beginPath(); x.arc(cx - R * .45, cx - R * .5, S * .035, 0, TAU); x.fillStyle = tint(SUN, .75); x.fill();
  return c;
}

// ---- cosmetic icons (also drawn onto the buddy when equipped) -------------
function icon(draw) {
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.lineJoin = 'round'; x.lineCap = 'round';
  draw(x, S, S * LWR); // lw = 9 — bold enough to read at 56px
  return c;
}

export const COSMETIC_ART = {
  'cos.flower': () => icon((x, S, lw) => {
    const cx = S / 2, cy = S / 2;
    union(x, p => {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3;
        const px = cx + Math.cos(a) * 62, py = cy + Math.sin(a) * 62;
        p.moveTo(px + 34, py);
        p.ellipse(px, py, 34, 46, a + Math.PI / 2, 0, TAU);
      }
    }, tint(BUBBLE, .25), lw * .5);
    // soft inner scallop echo on the lower petals
    x.strokeStyle = shade(BUBBLE, .12); x.lineWidth = lw * .55;
    for (const i of [2, 3, 4]) {
      const a = -Math.PI / 2 + i * Math.PI / 3;
      const px = cx + Math.cos(a) * 62, py = cy + Math.sin(a) * 62;
      x.beginPath(); x.arc(px, py, 24, a - .7, a + .7); x.stroke();
    }
    x.beginPath(); x.arc(cx, cy, 40, 0, TAU);
    x.fillStyle = SUN; x.fill(); x.strokeStyle = INK; x.lineWidth = lw; x.stroke();
    x.beginPath(); x.arc(cx - 12, cy - 12, 8, 0, TAU); x.fillStyle = tint(SUN, .7); x.fill();
  }),

  'cos.bow': () => icon((x, S, lw) => {
    const cx = S / 2, cy = S / 2 - 14;
    union(x, p => {
      for (const s of [-1, 1]) {
        // loop
        p.moveTo(cx, cy);
        p.quadraticCurveTo(cx + s * 46, cy - 78, cx + s * 96, cy - 48);
        p.quadraticCurveTo(cx + s * 118, cy - 12, cx + s * 92, cy + 26);
        p.quadraticCurveTo(cx + s * 46, cy + 52, cx, cy);
        p.closePath();
        // tail
        p.moveTo(cx + s * 6, cy + 18);
        p.quadraticCurveTo(cx + s * 46, cy + 62, cx + s * 42, cy + 100);
        p.lineTo(cx + s * 24, cy + 88);
        p.lineTo(cx + s * 14, cy + 102);
        p.quadraticCurveTo(cx + s * 6, cy + 52, cx, cy + 22);
        p.closePath();
      }
    }, BUBBLE, lw * .5);
    // loop creases
    x.strokeStyle = shade(BUBBLE, .28); x.lineWidth = lw * .55;
    for (const s of [-1, 1]) {
      x.beginPath(); x.moveTo(cx + s * 26, cy - 8);
      x.quadraticCurveTo(cx + s * 60, cy - 26, cx + s * 84, cy - 30); x.stroke();
    }
    // knot
    rr(x, cx - 24, cy - 26, 48, 52, 18);
    x.fillStyle = tint(BUBBLE, .28); x.fill(); x.strokeStyle = INK; x.lineWidth = lw; x.stroke();
    x.beginPath(); x.arc(cx - 8, cy - 10, 6, 0, TAU); x.fillStyle = '#fff'; x.fill();
  }),

  'cos.star': () => icon((x, S, lw) => {
    const cx = S / 2, cy = S / 2 + 6;
    x.beginPath(); starPath(x, cx, cy, 96, 46);
    x.fillStyle = SUN; x.fill(); x.strokeStyle = INK; x.lineWidth = lw * 1.2; x.stroke();
    // kawaii face
    x.fillStyle = INK;
    x.beginPath(); x.arc(cx - 22, cy - 4, 7.5, 0, TAU); x.fill();
    x.beginPath(); x.arc(cx + 22, cy - 4, 7.5, 0, TAU); x.fill();
    x.strokeStyle = INK; x.lineWidth = lw * .6;
    x.beginPath(); x.arc(cx, cy + 6, 12, .2 * Math.PI, .8 * Math.PI); x.stroke();
    ao(x, cx - 40, cy + 10, 12, 10, .55, BUBBLE);
    ao(x, cx + 40, cy + 10, 12, 10, .55, BUBBLE);
    // sparkle in the empty top-left notch
    x.beginPath(); starPath(x, cx - 78, cy - 62, 15, 6);
    x.fillStyle = CREAM; x.fill();
  }),

  'cos.wings': () => icon((x, S, lw) => {
    const cx = S / 2, cy = S / 2 + 10;
    for (const s of [-1, 1]) {
      x.save(); x.translate(cx, cy); x.scale(s, 1);
      union(x, p => {
        p.moveTo(2, 34);
        p.quadraticCurveTo(10, -46, 58, -78);
        p.quadraticCurveTo(92, -98, 112, -88);
        p.quadraticCurveTo(112, -62, 96, -44); // top feather tip
        p.quadraticCurveTo(104, -34, 96, -14);
        p.quadraticCurveTo(84, 2, 66, 6);      // middle feather
        p.quadraticCurveTo(72, 20, 58, 32);
        p.quadraticCurveTo(36, 48, 2, 34);     // bottom feather
        p.closePath();
      }, tint(SKYB, .62), lw * .5);
      // feather part-lines
      x.strokeStyle = shade(SKYB, .2); x.lineWidth = lw * .55;
      x.beginPath(); x.moveTo(20, 8); x.quadraticCurveTo(60, -14, 94, -42); x.stroke();
      x.beginPath(); x.moveTo(16, 22); x.quadraticCurveTo(48, 12, 64, 4); x.stroke();
      x.restore();
    }
  }),

  'cos.crown': () => icon((x, S, lw) => {
    const cx = S / 2;
    union(x, p => {
      // band
      rrPath(p, 46, 152, 164, 54, 20);
      // three rounded points
      p.moveTo(62, 162); p.quadraticCurveTo(66, 110, 78, 78);
      p.quadraticCurveTo(96, 118, 104, 150); p.closePath();
      p.moveTo(112, 156); p.quadraticCurveTo(122, 92, 128, 58);
      p.quadraticCurveTo(134, 92, 144, 156); p.closePath();
      p.moveTo(152, 150); p.quadraticCurveTo(160, 118, 178, 78);
      p.quadraticCurveTo(190, 110, 194, 162); p.closePath();
      // ball tips
      for (const [bx, by] of [[78, 74], [128, 52], [178, 74]]) {
        p.moveTo(bx + 13, by); p.arc(bx, by, 13, 0, TAU);
      }
    }, SUN, lw * .5);
    // jewels
    for (const [gx, gc] of [[88, SKYB], [168, MINTC]]) {
      x.beginPath(); x.arc(gx, 179, 12, 0, TAU);
      x.fillStyle = gc; x.fill(); x.strokeStyle = INK; x.lineWidth = lw * .6; x.stroke();
    }
    x.beginPath(); heartPath(x, cx, 179, 13);
    x.fillStyle = BUBBLE; x.fill(); x.strokeStyle = INK; x.lineWidth = lw * .6; x.stroke();
  }),

  'cos.cape': () => icon((x, S, lw) => {
    const cx = S / 2;
    const capePath = p => {
      p.moveTo(cx - 44, 78);
      p.quadraticCurveTo(cx - 92, 134, cx - 88, 196);
      p.quadraticCurveTo(cx - 60, 184, cx - 44, 198);
      p.quadraticCurveTo(cx - 16, 184, cx, 198);
      p.quadraticCurveTo(cx + 16, 184, cx + 44, 198);
      p.quadraticCurveTo(cx + 60, 184, cx + 88, 196);
      p.quadraticCurveTo(cx + 92, 134, cx + 44, 78);
      p.quadraticCurveTo(cx, 64, cx - 44, 78);
      p.closePath();
    };
    // rainbow fill inside one silhouette
    x.save(); x.beginPath(); capePath(x); x.clip();
    const cols = [BUBBLE, SUN, MINTC, SKYB, GRAPE];
    cols.forEach((col, i) => {
      x.fillStyle = tint(col, .18);
      x.fillRect(cx - 100 + i * 40, 40, 40, 180);
    });
    x.restore();
    x.beginPath(); capePath(x); x.strokeStyle = INK; x.lineWidth = lw; x.stroke();
    // collar
    rr(x, cx - 58, 62, 116, 30, 15);
    x.fillStyle = CREAM; x.fill(); x.strokeStyle = INK; x.lineWidth = lw; x.stroke();
    x.beginPath(); heartPath(x, cx, 78, 10);
    x.fillStyle = BUBBLE; x.fill(); x.strokeStyle = INK; x.lineWidth = lw * .55; x.stroke();
  }),
};

// ---- a drawn padlock for locked things (clearer than a greyed emoji) ------
export function padlockCanvas() {
  return icon((x, S, lw) => {
    const cx = S / 2;
    // shackle
    x.strokeStyle = INK; x.lineWidth = 34;
    x.beginPath(); x.arc(cx, 118, 44, Math.PI, TAU); x.moveTo(cx - 44, 118); x.lineTo(cx - 44, 132);
    x.moveTo(cx + 44, 118); x.lineTo(cx + 44, 132); x.stroke();
    x.strokeStyle = tint(GRAPE, .55); x.lineWidth = 34 - lw * 2;
    x.beginPath(); x.arc(cx, 118, 44, Math.PI, TAU); x.moveTo(cx - 44, 118); x.lineTo(cx - 44, 132);
    x.moveTo(cx + 44, 118); x.lineTo(cx + 44, 132); x.stroke();
    // body
    rr(x, cx - 66, 118, 132, 102, 28);
    x.fillStyle = SUN; x.fill(); x.strokeStyle = INK; x.lineWidth = lw; x.stroke();
    ao(x, cx, 214, 52, 14, .18);
    // keyhole
    x.fillStyle = INK;
    x.beginPath(); x.arc(cx, 158, 14, 0, TAU); x.fill();
    x.beginPath(); x.moveTo(cx - 8, 164); x.lineTo(cx + 8, 164); x.lineTo(cx + 12, 194); x.lineTo(cx - 12, 194); x.closePath(); x.fill();
  });
}

// ---- a wrapped gift (daily surprise / reveals) -----------------------------
export function giftCanvas() {
  return icon((x, S, lw) => {
    const cx = S / 2;
    // box
    rr(x, 58, 122, 140, 96, 16);
    x.fillStyle = BUBBLE; x.fill(); x.strokeStyle = INK; x.lineWidth = lw; x.stroke();
    ao(x, cx, 212, 56, 12, .16);
    // vertical ribbon on box
    rr(x, cx - 13, 122, 26, 96, 6);
    x.fillStyle = SUN; x.fill(); x.strokeStyle = INK; x.lineWidth = lw * .6; x.stroke();
    // lid
    rr(x, 46, 96, 164, 34, 14);
    x.fillStyle = tint(BUBBLE, .3); x.fill(); x.strokeStyle = INK; x.lineWidth = lw; x.stroke();
    rr(x, cx - 13, 96, 26, 34, 6);
    x.fillStyle = SUN; x.fill(); x.strokeStyle = INK; x.lineWidth = lw * .6; x.stroke();
    // bow: two loops + knot
    union(x, p => {
      for (const s of [-1, 1]) {
        p.moveTo(cx, 88);
        p.quadraticCurveTo(cx + s * 24, 40, cx + s * 60, 50);
        p.quadraticCurveTo(cx + s * 72, 78, cx + s * 32, 94);
        p.closePath();
      }
    }, SUN, lw * .5);
    x.beginPath(); x.arc(cx, 84, 15, 0, TAU);
    x.fillStyle = tint(SUN, .35); x.fill(); x.strokeStyle = INK; x.lineWidth = lw * .6; x.stroke();
  });
}
