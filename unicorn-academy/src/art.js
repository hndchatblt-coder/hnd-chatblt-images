/* ================= Unicorn Academy — art system =================
   Tier 1: bespoke rigged SVG (unicorn, landmarks, UI icons, cosmetics).
   Tier 3: procedural scenery generators.
   House style: flat sticker look, plum #5C4A66 outlines ~3px, rounded joins,
   dot eyes with white highlight, optional blush. No platform emoji, ever. */
'use strict';
(() => {
const P = () => UA.PALETTE;
const O = '#5C4A66'; // plum outline
const OW = 3;
const S = (s, a) => { let o = ''; for (const k in a) o += ` ${k}="${a[k]}"`; return `<${s}${o}/>`; };
const G = (attrs, inner) => { let o = ''; for (const k in attrs) o += ` ${k}="${attrs[k]}"`; return `<g${o}>${inner}</g>`; };
const OL = `stroke="${O}" stroke-width="${OW}" stroke-linejoin="round" stroke-linecap="round"`;

/* ---------- tiny helpers ---------- */
UA.sprite = (name, cls) => `<svg class="pk ${cls || ''}" viewBox="0 0 72 72" aria-hidden="true"><use href="#p-${name}"/></svg>`;
UA.shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return '#' + ((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
};

/* ---------- small icons ---------- */
UA.gemSVG = (col = '#B79CFF') => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <polygon points="24,4 42,18 24,44 6,18" fill="${col}" ${OL}/>
  <polygon points="24,4 32,18 24,44 16,18" fill="${UA.shade(col, 28)}" stroke="none"/>
  <circle cx="18" cy="14" r="3.4" fill="#fff" opacity=".85"/></svg>`;
UA.rainbowGemSVG = () => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <defs><linearGradient id="rgg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FF9EC7"/><stop offset=".5" stop-color="#FFD97A"/><stop offset="1" stop-color="#8FD0FF"/></linearGradient></defs>
  <polygon points="24,4 42,18 24,44 6,18" fill="url(#rgg)" ${OL}/>
  <circle cx="18" cy="14" r="3.4" fill="#fff" opacity=".9"/></svg>`;
UA.starSVG = (col = '#FFD97A', empty) => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <polygon points="24,4 29.5,17.5 44,18.5 33,28 36.5,42 24,34.5 11.5,42 15,28 4,18.5 18.5,17.5"
   fill="${empty ? 'rgba(255,255,255,.45)' : col}" ${OL} ${empty ? 'stroke-dasharray="4 3"' : ''}/>
  ${empty ? '' : '<circle cx="18" cy="15" r="2.6" fill="#fff" opacity=".9"/>'}</svg>`;
UA.heartSVG = (col = '#FF7FB2') => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path d="M24 42 C6 30 4 16 13 11 C19 8 24 13 24 17 C24 13 29 8 35 11 C44 16 42 30 24 42Z" fill="${col}" ${OL}/>
  <circle cx="16" cy="16" r="2.6" fill="#fff" opacity=".85"/></svg>`;
UA.homeSVG = () => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path d="M8 24 L24 8 L40 24" fill="none" ${OL} stroke-width="4"/>
  <path d="M12 22 V40 H36 V22" fill="#FFD6E8" ${OL}/>
  <rect x="20" y="28" width="8" height="12" rx="3" fill="#B79CFF" ${OL}/></svg>`;
UA.speakerSVG = () => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path d="M8 19 H16 L26 10 V38 L16 29 H8 Z" fill="#8FD0FF" ${OL}/>
  <path d="M32 17 Q37 24 32 31 M36 12 Q44 24 36 36" fill="none" ${OL}/></svg>`;
UA.tickSVG = () => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <circle cx="24" cy="24" r="20" fill="#9DE0B0" ${OL}/>
  <path d="M14 25 L21 32 L34 17" fill="none" ${OL} stroke-width="5"/></svg>`;
UA.backspaceSVG = () => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path d="M16 12 H40 V36 H16 L6 24 Z" fill="#FFB37A" ${OL}/>
  <path d="M22 19 L32 29 M32 19 L22 29" fill="none" ${OL} stroke-width="4"/></svg>`;
UA.sparkleSVG = (col = '#FFD97A') => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path d="M24 4 Q26 20 44 24 Q26 28 24 44 Q22 28 4 24 Q22 20 24 4Z" fill="${col}" ${OL}/></svg>`;
UA.giftSVG = () => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <rect x="8" y="18" width="32" height="24" rx="5" fill="#FF9EC7" ${OL}/>
  <rect x="6" y="12" width="36" height="9" rx="4" fill="#B79CFF" ${OL}/>
  <path d="M24 12 V42 M24 12 Q16 2 12 9 Q10 14 24 12 M24 12 Q32 2 36 9 Q38 14 24 12" fill="none" ${OL}/></svg>`;
UA.eggSVG = (col = '#E9DDFF', cracked = 0) => `<svg viewBox="0 0 48 60" aria-hidden="true">
  <path d="M24 4 C36 4 42 22 42 36 A18 20 0 0 1 6 36 C6 22 12 4 24 4Z" fill="${col}" ${OL}/>
  <circle cx="17" cy="20" r="3" fill="#fff" opacity=".7"/><circle cx="28" cy="30" r="2.2" fill="#fff" opacity=".5"/>
  ${cracked >= 1 ? `<path d="M12 30 L18 26 L22 32 L28 27" fill="none" ${OL}/>` : ''}
  ${cracked >= 2 ? `<path d="M28 27 L33 33 L38 29 M15 40 L21 36 L26 42" fill="none" ${OL}/>` : ''}</svg>`;

/* ---------- learning-content cards ---------- */
UA.letterCard = (ch, col = '#FF9EC7', lower) => `<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="44" fill="${col}" opacity=".28"/>
  <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
    font-size="62" font-weight="900" fill="${O}" font-family="inherit">${lower ? ch.toLowerCase() : ch.toUpperCase()}</text></svg>`;
UA.bigSmallCard = (ch, col) => `<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="44" fill="${col || '#8FD0FF'}" opacity=".25"/>
  <text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="52" font-weight="900"
    fill="${O}" font-family="inherit">${ch.toUpperCase()}${ch.toLowerCase()}</text></svg>`;
UA.numberCard = (n, col = '#8FD0FF') => `<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="44" fill="${col}" opacity=".28"/>
  <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
    font-size="58" font-weight="900" fill="${O}" font-family="inherit">${n}</text></svg>`;
UA.wordCard = (w, col = '#9DE0B0') => `<svg viewBox="0 0 160 90" aria-hidden="true">
  <rect x="4" y="8" width="152" height="74" rx="22" fill="${col}" opacity=".3"/>
  <text x="80" y="45" text-anchor="middle" dominant-baseline="central"
    font-size="${w.length > 4 ? 38 : 46}" font-weight="900" fill="${O}" font-family="inherit">${w}</text></svg>`;
UA.shapeSVG = (kind, col) => {
  col = col || { circle: '#FF9EC7', square: '#8FD0FF', triangle: '#9DE0B0', star: '#FFD97A', rectangle: '#B79CFF', heart: '#FF7FB2' }[kind];
  const inner = {
    circle: `<circle cx="50" cy="50" r="34" fill="${col}" ${OL}/>`,
    square: `<rect x="18" y="18" width="64" height="64" rx="10" fill="${col}" ${OL}/>`,
    triangle: `<path d="M50 14 L88 82 L12 82 Z" fill="${col}" ${OL}/>`,
    star: `<polygon points="50,10 61,38 91,40 68,60 75,90 50,73 25,90 32,60 9,40 39,38" fill="${col}" ${OL}/>`,
    rectangle: `<rect x="10" y="28" width="80" height="44" rx="10" fill="${col}" ${OL}/>`,
    heart: `<path d="M50 86 C14 62 10 34 28 24 C40 18 50 28 50 36 C50 28 60 18 72 24 C90 34 86 62 50 86Z" fill="${col}" ${OL}/>`,
  }[kind];
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${inner}<circle cx="38" cy="34" r="4" fill="#fff" opacity=".75"/></svg>`;
};
UA.tenFrame = (count, split) => {
  // 2x5 frame; split = [a,b] colours part-whole, else single colour fill
  let cells = '';
  for (let i = 0; i < 10; i++) {
    const x = 6 + (i % 5) * 30, y = 8 + Math.floor(i / 5) * 30;
    cells += `<rect x="${x}" y="${y}" width="26" height="26" rx="6" fill="#FFF9F5" ${OL} stroke-width="2"/>`;
    if (i < count) {
      const col = split ? (i < split[0] ? '#FF9EC7' : '#8FD0FF') : '#FF9EC7';
      cells += `<circle cx="${x + 13}" cy="${y + 13}" r="9" fill="${col}" ${OL} stroke-width="2"/>`;
    }
  }
  return `<svg viewBox="0 0 162 72" aria-hidden="true">${cells}</svg>`;
};
UA.diceFace = (n, col = '#FFF9F5') => {
  const pos = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]],
    4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[30, 25], [70, 25], [30, 50], [70, 50], [30, 75], [70, 75]] }[n] || [];
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="8" y="8" width="84" height="84" rx="18" fill="${col}" ${OL}/>
    ${pos.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="8.5" fill="${O}"/>`).join('')}</svg>`;
};
UA.dotCloud = (n) => {
  let dots = '';
  const placed = [];
  for (let i = 0; i < n; i++) {
    let x, y, ok = 0, tries = 0;
    while (!ok && tries++ < 60) {
      x = 16 + UA.rand(70); y = 16 + UA.rand(70);
      ok = placed.every(p => (p[0] - x) ** 2 + (p[1] - y) ** 2 > 400);
    }
    placed.push([x, y]);
    dots += `<circle cx="${x}" cy="${y}" r="9" fill="${UA.pick(P().rainbow)}" ${OL} stroke-width="2"/>`;
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${dots}</svg>`;
};

/* ---------- the unicorn rig ----------
   240x240 space, faces right. Groups + anchors per SPEC <art_system>.
   opts: {body, mane, baby:0..1, cosmetics:[ids], cls, noAnim} */
UA.unicornSVG = (opts = {}) => {
  const body = opts.body || '#FFD6E8';
  const mane = opts.mane || '#FF7FB2';
  const m2 = UA.shade(mane, 34), m3 = UA.shade(mane, -26);
  const bodyD = UA.shade(body, -22);
  const t = opts.baby || 0; // baby proportion morph
  const headS = 1 + .3 * t, bodyS = 1 - .12 * t, legS = 1 - .3 * t;
  const cos = (opts.cosmetics || []).map(id => UA.COSMETICS[id] ? UA.COSMETICS[id]() : '').join('');
  const wear = (anchor) => (opts.cosmetics || []).filter(id => (UA.BOUTIQUE.find(b => b.id === id) || {}).anchor === anchor)
    .map(id => UA.COSMETICS[id]()).join('');
  const leg = (x, cls) => G({ class: 'rig-' + cls, transform: `translate(${x},170) scale(1,${legS})` },
    `<rect x="-8.5" y="0" width="17" height="50" rx="8.5" fill="${body}" ${OL}/>
     <path d="M-8.5 38 A8.5 10 0 0 0 8.5 38 V42 A8.5 8.5 0 0 1 -8.5 42Z" fill="${bodyD}" stroke="none"/>`);
  return `<svg class="uni-rig ${opts.cls || ''}" viewBox="0 0 240 250" aria-hidden="true">
  ${G({ class: 'rig-body-group' }, `
    ${G({ class: 'rig-tail', transform: 'translate(62,150)' }, `
      <path d="M2 -8 Q-26 -22 -34 -2 Q-40 14 -26 24 Q-38 30 -22 38 Q-4 44 2 24 Q6 8 2 -8Z" fill="${mane}" ${OL}/>
      <path d="M-8 -6 Q-24 2 -20 18 M-6 14 Q-18 20 -12 30" fill="none" stroke="${m2}" stroke-width="4.5" stroke-linecap="round"/>
      ${wear('tail')}`)}
    ${leg(88, 'leg-bl')} ${leg(148, 'leg-br')}
    <ellipse cx="118" cy="152" rx="60" ry="44" fill="${body}" ${OL} transform="scale(${bodyS})" transform-origin="118 152"/>
    <path d="M72 166 Q118 184 164 164" fill="none" stroke="${bodyD}" stroke-width="4" stroke-linecap="round" opacity=".45"/>
    ${G({ class: 'rig-wing' }, `<path d="M92 138 Q60 116 76 100 Q86 92 96 104 Q94 88 110 90 Q124 94 116 112 Q130 106 132 120 Q132 136 106 144Z"
      fill="#FFF9F5" ${OL} opacity=".95"/><path d="M84 116 Q96 122 104 118 M92 104 Q100 110 108 106" stroke="${UA.shade('#FFF9F5', -30)}" stroke-width="3" fill="none" stroke-linecap="round"/>`)}
    ${leg(104, 'leg-fl')} ${leg(160, 'leg-fr')}
    <path d="M138 128 Q150 96 170 82 L196 106 Q186 128 158 138Z" fill="${body}" ${OL}/>
    ${wear('back')} ${wear('feet')}
  `)}
  ${G({ class: 'rig-head-group', transform: `translate(182,84) scale(${headS}) translate(-182,-84)` }, `
    ${G({ class: 'rig-mane-back' }, `<path d="M164 34 Q136 44 132 78 Q130 108 118 126 Q142 128 152 104 Q160 82 166 66 Q172 48 164 34Z" fill="${m3}" ${OL}/>`)}
    <circle cx="182" cy="84" r="35" fill="${body}" ${OL}/>
    <ellipse cx="207" cy="97" rx="17" ry="13" fill="${UA.shade(body, 14)}" ${OL}/>
    <circle cx="213" cy="95" r="2.4" fill="${O}"/>
    <path d="M206 104 Q210 108 215 105" fill="none" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>
    ${G({ class: 'rig-ear' }, `<path d="M160 52 L150 24 L177 38Z" fill="${body}" ${OL}/><path d="M161 46 L156 32 L169 39Z" fill="${mane}" stroke="none"/>`)}
    ${G({ class: 'rig-horn' }, `<path d="M174 50 L190 44 L194 4 Z" fill="#FFD97A" ${OL}/>
      <path d="M182 36 L190 30 M179 44 L191 38" stroke="#F5B940" stroke-width="2.5" fill="none"/>`)}
    ${G({ class: 'rig-mane-mid' }, `<path d="M170 38 Q146 48 146 78 Q146 100 136 114 Q158 112 160 88 Q162 64 176 52 Q180 44 170 38Z" fill="${mane}" ${OL}/>`)}
    ${G({ class: 'rig-mane-front' }, `<path d="M172 36 Q156 32 154 50 Q164 46 170 52 Q178 40 190 46 Q186 32 172 36Z" fill="${m2}" ${OL}/>`)}
    ${G({ class: 'rig-blink' }, `<circle cx="192" cy="76" r="6" fill="${O}"/><circle cx="194.3" cy="73.6" r="2.3" fill="#fff"/>`)}
    <ellipse cx="201" cy="86" rx="6.5" ry="4.2" fill="#FF9EC7" opacity="${.5 + .3 * t}"/>
    ${wear('neck')} ${wear('horn')} ${wear('head')}
  `)}
  ${opts.extra || ''}
</svg>`;
};

/* ---------- cosmetics (drawn in rig coordinate space at their anchor) ---------- */
UA.COSMETICS = {
  'bow-pink': () => `<g transform="translate(158,34) rotate(-14)"><path d="M0 8 Q-18 -4 -16 10 Q-15 22 0 14 Q15 22 16 10 Q18 -4 0 8Z" fill="#FF7FB2" ${OL}/><circle cx="0" cy="10" r="5" fill="#FFD97A" ${OL} stroke-width="2"/></g>`,
  'flower-clip': () => `<g transform="translate(160,38)">${[0, 60, 120, 180, 240, 300].map(a => `<ellipse cx="0" cy="-9" rx="6" ry="9" fill="#FF9EC7" ${OL} stroke-width="2" transform="rotate(${a})"/>`).join('')}<circle r="5.5" fill="#FFD97A" ${OL} stroke-width="2"/></g>`,
  'star-clip': () => `<g transform="translate(159,36) scale(.6)"><polygon points="0,-16 5,-5 16,-4 8,4 10,15 0,9 -10,15 -8,4 -16,-4 -5,-5" fill="#FFD97A" ${OL}/></g>`,
  'sun-hat': () => `<g transform="translate(180,32) rotate(-8)"><ellipse cx="0" cy="8" rx="34" ry="10" fill="#FFF3C4" ${OL}/><path d="M-18 6 Q-16 -18 0 -18 Q16 -18 18 6Z" fill="#FFD97A" ${OL}/><path d="M-18 2 Q0 8 18 2" stroke="#FF7FB2" stroke-width="5" fill="none"/></g>`,
  'party-hat': () => `<g transform="translate(172,30) rotate(-16)"><path d="M0 -30 L16 8 L-16 8Z" fill="#B79CFF" ${OL}/><circle cx="0" cy="-30" r="6" fill="#FF9EC7" ${OL} stroke-width="2"/><path d="M-10 -6 L10 -2 M-13 2 L13 5" stroke="#FFD97A" stroke-width="4" fill="none"/></g>`,
  'butterfly-bow': () => `<g transform="translate(158,34)"><path d="M0 6 Q-20 -12 -18 6 Q-17 20 0 12 Q17 20 18 6 Q20 -12 0 6Z" fill="#8FD0FF" ${OL}/><circle cx="-8" cy="2" r="3" fill="#fff" opacity=".8"/><circle cx="8" cy="2" r="3" fill="#fff" opacity=".8"/><circle cx="0" cy="9" r="4.5" fill="#FF7FB2" ${OL} stroke-width="2"/></g>`,
  'flower-crown': () => `<g transform="translate(180,36) rotate(-6)">${[-24, -8, 8, 24].map((x, i) => `<g transform="translate(${x},${Math.abs(x) / 4 - 4})">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-6" rx="4" ry="6.5" fill="${['#FF9EC7', '#B79CFF', '#8FD0FF', '#FFD97A'][i]}" ${OL} stroke-width="1.6" transform="rotate(${a})"/>`).join('')}<circle r="3.6" fill="#FFF9F5" ${OL} stroke-width="1.6"/></g>`).join('')}</g>`,
  'crown-gold': () => `<g transform="translate(180,30) rotate(-6)"><path d="M-24 10 L-24 -12 L-12 -2 L0 -18 L12 -2 L24 -12 L24 10 Z" fill="#FFD97A" ${OL}/><circle cx="0" cy="-18" r="4.5" fill="#FF7FB2" ${OL} stroke-width="2"/><rect x="-24" y="6" width="48" height="8" rx="4" fill="#F5B940" ${OL} stroke-width="2"/></g>`,
  'crown-crystal': () => `<g transform="translate(180,30) rotate(-6)"><path d="M-22 8 L-16 -14 L-6 4 L0 -20 L6 4 L16 -14 L22 8Z" fill="#D3ECFF" ${OL}/><polygon points="0,-20 4,-12 0,-6 -4,-12" fill="#B79CFF" ${OL} stroke-width="1.5"/></g>`,
  'moon-crown': () => `<g transform="translate(180,28) rotate(-8)"><path d="M8 -18 A16 16 0 1 0 8 12 A12 12 0 1 1 8 -18Z" fill="#FFF3C4" ${OL}/><polygon points="18,-8 21,-2 27,-2 22,2 24,8 18,5 12,8 14,2 9,-2 15,-2" fill="#FFD97A" ${OL} stroke-width="1.6"/></g>`,
  'champion-crown': () => `<g transform="translate(180,26) rotate(-6)"><path d="M-26 12 L-26 -14 L-13 -4 L0 -22 L13 -4 L26 -14 L26 12Z" fill="#FFD97A" ${OL}/><polygon points="0,-22 4,-14 0,-8 -4,-14" fill="#FF7FB2" ${OL} stroke-width="1.5"/><circle cx="-16" cy="0" r="3.6" fill="#8FD0FF" ${OL} stroke-width="1.5"/><circle cx="16" cy="0" r="3.6" fill="#9DE0B0" ${OL} stroke-width="1.5"/><rect x="-26" y="8" width="52" height="9" rx="4.5" fill="url(#rgg)" ${OL} stroke-width="2"/></g>`,
  'bell-collar': () => `<g transform="translate(163,124)"><path d="M-16 -4 Q0 8 16 -6" stroke="#F08A4B" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="0" cy="8" r="7" fill="#FFD97A" ${OL} stroke-width="2"/><circle cx="0" cy="10" r="1.8" fill="${O}"/></g>`,
  'scarf-mint': () => `<g transform="translate(162,122)"><path d="M-18 -6 Q0 10 18 -8 L16 4 Q0 20 -16 6Z" fill="#9DE0B0" ${OL}/><rect x="4" y="6" width="10" height="22" rx="5" fill="#9DE0B0" ${OL} transform="rotate(12 9 6)"/></g>`,
  'rainbow-scarf': () => `<g transform="translate(162,122)"><path d="M-18 -6 Q0 10 18 -8 L16 4 Q0 20 -16 6Z" fill="#FF9EC7" ${OL}/><path d="M-16 -2 Q0 12 16 -4" stroke="#FFD97A" stroke-width="4" fill="none"/><path d="M-15 2 Q0 15 15 0" stroke="#8FD0FF" stroke-width="4" fill="none"/><rect x="4" y="6" width="10" height="24" rx="5" fill="#B79CFF" ${OL} transform="rotate(12 9 6)"/></g>`,
  'daisy-chain': () => `<g transform="translate(162,124)">${[-14, 0, 14].map(x => `<g transform="translate(${x},${Math.abs(x) / 3})">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-5" rx="3.4" ry="5.5" fill="#FFF9F5" ${OL} stroke-width="1.4" transform="rotate(${a})"/>`).join('')}<circle r="3" fill="#FFD97A" ${OL} stroke-width="1.4"/></g>`).join('')}</g>`,
  'pearl-necklace': () => `<g transform="translate(162,124)">${[-16, -8, 0, 8, 16].map(x => `<circle cx="${x}" cy="${4 + Math.abs(x) / 4}" r="4.6" fill="#FFF9F5" ${OL} stroke-width="1.6"/>`).join('')}</g>`,
  'heart-charm': () => `<g transform="translate(162,124)"><path d="M-14 -4 Q0 8 14 -6" stroke="#B79CFF" stroke-width="4" fill="none"/><path d="M0 18 C-9 12 -10 4 -5 2 C-2 1 0 3 0 5 C0 3 2 1 5 2 C10 4 9 12 0 18Z" fill="#FF7FB2" ${OL} stroke-width="2"/></g>`,
  'gem-necklace': () => `<g transform="translate(162,124)"><path d="M-16 -4 Q0 8 16 -6" stroke="#F5B940" stroke-width="4" fill="none"/><polygon points="0,18 -7,8 0,2 7,8" fill="#B79CFF" ${OL} stroke-width="2"/></g>`,
  'bells-royal': () => `<g transform="translate(162,124)"><path d="M-16 -4 Q0 8 16 -6" stroke="#9A7BE8" stroke-width="5" fill="none"/>${[-10, 0, 10].map(x => `<circle cx="${x}" cy="${8 + Math.abs(x) / 5}" r="5" fill="#FFD97A" ${OL} stroke-width="1.6"/>`).join('')}</g>`,
  'fairy-wings': () => `<g transform="translate(104,104)"><path d="M0 10 Q-34 -26 -12 -34 Q4 -38 6 -12 Q10 -40 26 -32 Q42 -22 8 8Z" fill="#D3ECFF" ${OL} opacity=".92"/><circle cx="-10" cy="-20" r="3.5" fill="#fff" opacity=".8"/><circle cx="18" cy="-20" r="3" fill="#fff" opacity=".8"/></g>`,
  'wings-gold': () => `<g transform="translate(104,104)"><path d="M0 10 Q-38 -30 -12 -38 Q6 -42 6 -12 Q12 -44 30 -34 Q48 -22 8 8Z" fill="#FFD97A" ${OL}/><path d="M-8 -22 Q0 -14 6 -22 M12 -26 Q18 -18 24 -26" stroke="#F5B940" stroke-width="3" fill="none"/></g>`,
  'cape-sky': () => `<g transform="translate(112,110)"><path d="M-4 -6 Q-52 40 -30 66 Q0 56 24 64 Q40 30 22 -2 Q8 6 -4 -6Z" fill="#8FD0FF" ${OL} opacity=".95"/><circle cx="-8" cy="30" r="4" fill="#fff" opacity=".7"/></g>`,
  'cape-royal': () => `<g transform="translate(112,110)"><path d="M-4 -6 Q-52 40 -30 66 Q0 56 24 64 Q40 30 22 -2 Q8 6 -4 -6Z" fill="#9A7BE8" ${OL}/><path d="M-24 48 Q0 42 18 48" stroke="#FFD97A" stroke-width="5" fill="none"/><circle cx="0" cy="20" r="4" fill="#FFD97A" ${OL} stroke-width="1.6"/></g>`,
  'star-cape': () => `<g transform="translate(112,110)"><path d="M-4 -6 Q-52 40 -30 66 Q0 56 24 64 Q40 30 22 -2 Q8 6 -4 -6Z" fill="#4A3B52" ${OL}/>${[[-18, 20], [2, 34], [14, 14], [-8, 48]].map(p => `<polygon points="${p[0]},${p[1] - 5} ${p[0] + 1.7},${p[1] - 1.5} ${p[0] + 5},${p[1] - 1} ${p[0] + 2.4},${p[1] + 1.6} ${p[0] + 3},${p[1] + 5} ${p[0]},${p[1] + 3} ${p[0] - 3},${p[1] + 5} ${p[0] - 2.4},${p[1] + 1.6} ${p[0] - 5},${p[1] - 1} ${p[0] - 1.7},${p[1] - 1.5}" fill="#FFD97A"/>`).join('')}</g>`,
  'saddle-plush': () => `<g transform="translate(118,112)"><path d="M-26 0 Q0 -12 26 0 Q28 18 0 20 Q-28 18 -26 0Z" fill="#FF9EC7" ${OL}/><path d="M-24 6 Q0 -4 24 6" stroke="#FFD97A" stroke-width="4" fill="none"/></g>`,
  'sparkle-saddle': () => `<g transform="translate(118,112)"><path d="M-26 0 Q0 -12 26 0 Q28 18 0 20 Q-28 18 -26 0Z" fill="#B79CFF" ${OL}/><path d="M-10 4 Q-8 8 -4 8 M8 2 Q10 6 14 6" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/><polygon points="0,-2 2,3 7,3 3,6 5,11 0,8 -5,11 -3,6 -7,3 -2,3" fill="#FFD97A" ${OL} stroke-width="1.4"/></g>`,
  'tail-ribbon': () => `<g transform="translate(-18,28)"><path d="M0 0 Q-10 -8 -9 2 Q-9 10 0 5 Q9 10 9 2 Q10 -8 0 0Z" fill="#FF7FB2" ${OL} stroke-width="2"/></g>`,
  'comet-trail': () => `<g transform="translate(-26,30)"><path d="M0 0 Q-20 6 -34 -4 M2 8 Q-16 16 -30 10" stroke="#8FD0FF" stroke-width="4" fill="none" opacity=".85"/><polygon points="-34,-4 -30,-2 -30,-7" fill="#FFD97A"/></g>`,
  'horn-star': () => `<g transform="translate(206,10)"><polygon points="0,-8 2.6,-2.4 8,-2 4,1.8 5,7.6 0,4.6 -5,7.6 -4,1.8 -8,-2 -2.6,-2.4" fill="#FFD97A" ${OL} stroke-width="1.8"/></g>`,
  'horn-rainbow': () => `<g transform="translate(185,46) rotate(-32)"><path d="M2 0 Q10 -6 4 -13 M6 -8 Q14 -14 8 -21" stroke="#FF9EC7" stroke-width="3.5" fill="none"/><path d="M8 -14 Q16 -20 10 -27" stroke="#8FD0FF" stroke-width="3.5" fill="none"/></g>`,
  'aurora-mane': () => `<g transform="translate(104,84)"><path d="M0 0 Q-16 -22 6 -30 Q22 -34 22 -14" stroke="#B79CFF" stroke-width="5" fill="none" opacity=".8"/><path d="M8 -2 Q-4 -18 12 -24" stroke="#7FD8D0" stroke-width="4" fill="none" opacity=".8"/></g>`,
  'socks-spotty': () => [100, 162, 88, 150].map((x, i) => `<g transform="translate(${x},${196})"><rect x="-10" y="0" width="20" height="22" rx="7" fill="#FFF9F5" ${OL} stroke-width="2"/><circle cx="-3" cy="8" r="2.4" fill="#FF7FB2"/><circle cx="5" cy="14" r="2.4" fill="#8FD0FF"/></g>`).join(''),
  'socks-rainbow': () => [100, 162, 88, 150].map(x => `<g transform="translate(${x},196)"><rect x="-10" y="0" width="20" height="22" rx="7" fill="#FF9EC7" ${OL} stroke-width="2"/><rect x="-10" y="7" width="20" height="5" fill="#FFD97A"/><rect x="-10" y="14" width="20" height="5" fill="#8FD0FF"/></g>`).join(''),
};

/* ---------- procedural scenery (Tier 3) ---------- */
UA.gen = {};
UA.gen.flower = (x, y, size, petals, cols) => {
  cols = cols || [UA.pick(P().rainbow), '#FFD97A'];
  petals = petals || 5 + UA.rand(3);
  let ps = '';
  for (let i = 0; i < petals; i++) ps += `<ellipse cx="0" cy="${-size * .55}" rx="${size * .3}" ry="${size * .55}" fill="${cols[0]}" stroke="${O}" stroke-width="2" transform="rotate(${i * 360 / petals})"/>`;
  return `<g transform="translate(${x},${y})"><line x1="0" y1="0" x2="0" y2="${size * 1.3}" stroke="#7ACC90" stroke-width="${size * .16}" stroke-linecap="round"/>${ps}<circle r="${size * .34}" fill="${cols[1]}" stroke="${O}" stroke-width="2"/></g>`;
};
UA.gen.cloud = (x, y, s, col = '#FFFFFF', op = .95) =>
  `<g transform="translate(${x},${y}) scale(${s})" opacity="${op}"><ellipse cx="0" cy="0" rx="34" ry="20" fill="${col}"/><ellipse cx="-24" cy="6" rx="22" ry="14" fill="${col}"/><ellipse cx="24" cy="6" rx="22" ry="13" fill="${col}"/></g>`;
UA.gen.tree = (x, y, s, leaf = '#9DE0B0') =>
  `<g transform="translate(${x},${y}) scale(${s})"><rect x="-7" y="8" width="14" height="34" rx="6" fill="#C89A6B" stroke="${O}" stroke-width="2.5"/><circle cx="0" cy="-12" r="30" fill="${leaf}" stroke="${O}" stroke-width="2.5"/><circle cx="-20" cy="2" r="20" fill="${leaf}" stroke="${O}" stroke-width="2.5"/><circle cx="20" cy="2" r="20" fill="${leaf}" stroke="${O}" stroke-width="2.5"/><circle cx="-8" cy="-8" r="4" fill="#FF9EC7" stroke="${O}" stroke-width="1.6"/><circle cx="12" cy="-16" r="4" fill="#FF9EC7" stroke="${O}" stroke-width="1.6"/></g>`;
UA.gen.butterfly = (x, y, s, col) => {
  col = col || UA.pick(['#FF9EC7', '#8FD0FF', '#B79CFF', '#FFD97A']);
  return `<g transform="translate(${x},${y}) scale(${s})" class="amb-butterfly"><ellipse cx="-8" cy="0" rx="9" ry="12" fill="${col}" stroke="${O}" stroke-width="2"/><ellipse cx="8" cy="0" rx="9" ry="12" fill="${col}" stroke="${O}" stroke-width="2"/><rect x="-2" y="-9" width="4" height="18" rx="2" fill="${O}"/></g>`;
};
UA.gen.sparkle = (x, y, s, col = '#FFD97A') =>
  `<path transform="translate(${x},${y}) scale(${s})" d="M0 -8 Q1 -1 8 0 Q1 1 0 8 Q-1 1 -8 0 Q-1 -1 0 -8Z" fill="${col}"/>`;
UA.gen.hills = (w, h, cols) => {
  cols = cols || ['#B9EBC7', '#9DE0B0', '#7ACC90'];
  let out = '';
  cols.forEach((c, i) => {
    const y = h * (.55 + i * .16);
    out += `<path d="M0 ${y + 40} Q ${w * .25} ${y - 60 - UA.rand(30)} ${w * .5} ${y + 10} T ${w} ${y - 20} V ${h} H 0 Z" fill="${c}"/>`;
  });
  return out;
};
UA.gen.rainbow = (x, y, r, arcs, thick = 12) => {
  let out = '';
  const cols = P().rainbow;
  for (let i = 0; i < arcs; i++) {
    const rr = r - i * thick;
    if (rr <= 0) break;
    out += `<path d="M ${x - rr} ${y} A ${rr} ${rr} 0 0 1 ${x + rr} ${y}" fill="none" stroke="${cols[i % cols.length]}" stroke-width="${thick - 2}" stroke-linecap="round"/>`;
  }
  return out;
};

/* ---------- map landmark icons (Tier 1) ---------- */
UA.landmark = (icon, col, col2) => {
  const map = {
    meadow: `<ellipse cx="60" cy="86" rx="52" ry="22" fill="${col}" ${OL}/>${UA.gen.flower(34, 78, 13)}${UA.gen.flower(62, 70, 16)}${UA.gen.flower(88, 80, 12)}
      <text x="60" y="106" text-anchor="middle" font-size="0"> </text>`,
    mountain: `<path d="M14 100 L48 26 L70 62 L84 40 L108 100Z" fill="${col}" ${OL}/><path d="M48 26 L58 46 L48 56 L38 44Z" fill="#FFF9F5" ${OL} stroke-width="2.4"/><path d="M84 40 L92 56 L84 62 L76 54Z" fill="#FFF9F5" ${OL} stroke-width="2.4"/>`,
    cloud: `${UA.gen.cloud(60, 66, 1.5, col2)}${UA.gen.cloud(38, 84, .9, '#fff')}<circle cx="46" cy="60" r="4" fill="${O}"/><circle cx="70" cy="60" r="4" fill="${O}"/><path d="M50 74 Q58 80 66 74" stroke="${O}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    garden: `<path d="M22 96 Q22 40 60 40 Q98 40 98 96" fill="none" stroke="${col}" stroke-width="10"/>${UA.gen.flower(22, 96, 12)}${UA.gen.flower(98, 96, 12)}${UA.gen.flower(60, 38, 14, 6, ['#FF9EC7', '#FFD97A'])}<rect x="30" y="92" width="60" height="10" rx="5" fill="#C89A6B" ${OL} stroke-width="2.4"/>`,
    falls: `<path d="M30 30 H90 V44 Q60 52 30 44Z" fill="#8AA5B8" ${OL}/><path d="M44 44 Q40 78 30 96 H90 Q80 78 76 44 Q60 50 44 44Z" fill="${col}" ${OL}/><path d="M52 50 Q50 74 44 92 M68 50 Q70 74 76 92" stroke="#fff" stroke-width="4" fill="none" opacity=".7"/><ellipse cx="60" cy="98" rx="36" ry="9" fill="#D3F4F1" ${OL} stroke-width="2.4"/>`,
    castle: `<rect x="30" y="46" width="60" height="52" rx="6" fill="#FFF3C4" ${OL}/><rect x="20" y="34" width="18" height="64" rx="5" fill="${col}" ${OL}/><rect x="82" y="34" width="18" height="64" rx="5" fill="${col}" ${OL}/><path d="M20 34 L29 20 L38 34Z" fill="#FF9EC7" ${OL}/><path d="M82 34 L91 20 L100 34Z" fill="#FF9EC7" ${OL}/><path d="M48 46 L60 28 L72 46Z" fill="#FF9EC7" ${OL}/><rect x="52" y="72" width="16" height="26" rx="8" fill="#B79CFF" ${OL}/><circle cx="60" cy="58" r="6" fill="#8FD0FF" ${OL} stroke-width="2.4"/>`,
    stable: `<path d="M18 54 L60 24 L102 54 V98 H18Z" fill="#E8B56D" ${OL}/><path d="M18 54 L60 24 L102 54" fill="none" ${OL} stroke-width="4"/><rect x="44" y="62" width="32" height="36" rx="6" fill="#8A6242" ${OL}/><path d="M44 62 A16 16 0 0 1 76 62" fill="#8A6242" ${OL}/><rect x="24" y="64" width="14" height="14" rx="4" fill="#FFF3C4" ${OL} stroke-width="2.4"/><rect x="82" y="64" width="14" height="14" rx="4" fill="#FFF3C4" ${OL} stroke-width="2.4"/>`,
    kitchen: `<rect x="22" y="52" width="76" height="46" rx="10" fill="#FFD6E8" ${OL}/><rect x="30" y="62" width="24" height="20" rx="5" fill="#FFF9F5" ${OL} stroke-width="2.4"/><circle cx="74" cy="72" r="12" fill="#FFF9F5" ${OL} stroke-width="2.4"/><rect x="34" y="30" width="52" height="24" rx="8" fill="#FF9EC7" ${OL}/><circle cx="46" cy="42" r="4" fill="#FFD97A"/><circle cx="60" cy="40" r="4" fill="#9DE0B0"/><circle cx="74" cy="42" r="4" fill="#8FD0FF"/>`,
    music: `<ellipse cx="60" cy="90" rx="46" ry="16" fill="#D2F5DC" ${OL}/>${UA.gen.flower(36, 80, 13, 6, ['#B79CFF', '#FFD97A'])}${UA.gen.flower(84, 80, 13, 6, ['#8FD0FF', '#FF9EC7'])}<path d="M56 26 V64 M56 26 L76 32 V44 L56 38" fill="none" ${OL} stroke-width="5"/><ellipse cx="50" cy="66" rx="8" ry="6" fill="${O}"/>`,
    mirror: `<ellipse cx="60" cy="56" rx="30" ry="38" fill="#D3ECFF" ${OL}/><ellipse cx="60" cy="56" rx="22" ry="30" fill="#EAF6FF" stroke="#fff" stroke-width="3"/><path d="M48 44 Q60 36 72 48" stroke="#fff" stroke-width="4" fill="none" opacity=".8"/><rect x="52" y="92" width="16" height="10" rx="4" fill="#B79CFF" ${OL}/><ellipse cx="60" cy="104" rx="24" ry="6" fill="#B79CFF" ${OL} stroke-width="2.4"/>`,
    boutique: `<rect x="22" y="50" width="76" height="48" rx="10" fill="#FFF9F5" ${OL}/><path d="M18 50 Q18 32 34 32 H86 Q102 32 102 50 Z" fill="#FF9EC7" ${OL}/><path d="M18 50 H102" stroke="${O}" stroke-width="3"/><path d="M30 32 V50 M46 32 V50 M62 32 V50 M78 32 V50 M94 32 V50" stroke="#FFF9F5" stroke-width="6"/><rect x="52" y="66" width="16" height="32" rx="7" fill="#B79CFF" ${OL}/><circle cx="36" cy="70" r="8" fill="#FFD97A" ${OL} stroke-width="2.4"/>`,
    book: `<path d="M60 34 Q38 24 20 32 V88 Q38 80 60 90 Q82 80 100 88 V32 Q82 24 60 34Z" fill="#FFF3C4" ${OL}/><path d="M60 34 V90" stroke="${O}" stroke-width="3"/><path d="M30 44 Q45 38 54 44 M30 56 Q45 50 54 56 M66 44 Q75 38 90 44 M66 56 Q75 50 90 56" stroke="#B79CFF" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  };
  return `<svg class="zone-art" viewBox="0 0 120 120" aria-hidden="true"><g class="zone-bounce">${map[icon] || map.meadow}</g></svg>`;
};

/* jigsaw scene: one cute composed scene, deterministic by seed */
UA.jigsawScene = (seed) => {
  const r = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor(seed / 233280 * n); };
  const sky = ['#D3ECFF', '#FFE9F4', '#FFF3C4'][r(3)];
  let fl = '';
  for (let i = 0; i < 6; i++) fl += UA.gen.flower(30 + i * 55 + r(20), 250 + r(30), 12 + r(8));
  return `<svg viewBox="0 0 360 300" aria-hidden="true">
    <rect width="360" height="300" fill="${sky}"/>
    ${UA.gen.rainbow(180, 140, 120, 5, 14)}
    ${UA.gen.hills(360, 300)}
    ${UA.gen.cloud(70 + r(40), 60, 1)} ${UA.gen.cloud(280, 40 + r(30), .8)}
    ${fl}
    <g transform="translate(110,120) scale(.55)">${UA.unicornSVG({ body: UA.pick(P().bodies), mane: UA.pick(P().manes), noAnim: true })}</g>
  </svg>`;
};
})();
