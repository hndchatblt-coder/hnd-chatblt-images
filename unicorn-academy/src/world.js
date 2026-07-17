/* ================= Unicorn Academy — living world =================
   Map facilities (toy corners + boutique + memory book), daily gift, garden,
   rare surprise events, silly event days, hide-and-seek babies, and the
   Crystal Castle coronation / Rainbow Royale endgame glue. */
'use strict';
(() => {
const $ = (s, r) => (r || document).querySelector(s);
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
UA.world = {};

/* ---------- facilities strip on the map (always open, never misted) ---------- */
const FACILITIES = [
  { id: 'toy-stable', icon: 'stable', name: 'Stable', open: (pt) => UA.openStable(pt), x: 10, y: 88 },
  { id: 'boutique', icon: 'boutique', name: 'Boutique', open: (pt) => UA.openBoutique(pt), x: 27, y: 92 },
  { id: 'toy-kitchen', icon: 'kitchen', name: 'Kitchen', open: (pt) => UA.openKitchen(pt), x: 62, y: 92 },
  { id: 'toy-music', icon: 'music', name: 'Music', open: (pt) => UA.openMusic(pt), x: 79, y: 88 },
  { id: 'toy-dressup', icon: 'mirror', name: 'Mirror', open: (pt) => UA.openMirror(pt), x: 93, y: 84 },
  { id: 'memory-book', icon: 'book', name: 'Book', open: (pt) => UA.openBook(pt), x: 93, y: 62 },
];

UA.world.decorateMap = (stage) => {
  const S = UA.S;
  const phone = innerWidth < 700;
  // phones get a tidy dock (scattered 11vw spots collapse below touch size there)
  const dock = phone ? el('<div class="fac-dock"></div>') : null;
  FACILITIES.forEach(f => {
    const b = el(phone
      ? `<button data-testid="${f.id}" aria-label="${f.name}">${UA.landmark(f.icon, '#FFD6E8', '#FFF9F5')}</button>`
      : `<button class="zone-spot fac-spot" data-testid="${f.id}"
          style="left:${f.x}%;top:${f.y}%;width:min(11vw,96px);height:min(11vw,96px)" aria-label="${f.name}">
          ${UA.landmark(f.icon, '#FFD6E8', '#FFF9F5')}</button>`);
    b.addEventListener('pointerdown', (e) => f.open({ x: e.clientX, y: e.clientY }));
    (dock || stage).appendChild(b);
  });
  if (dock) stage.appendChild(dock);
  // quiet "for grown-ups" link: deliberately boring, never spoken or hinted
  const pa = el(`<button id="parents-link" aria-label="For grown-ups">For grown-ups</button>`);
  pa.addEventListener('pointerdown', () => UA.openParents());
  stage.appendChild(pa);

  drawGarden(stage);
  dailyGift(stage);
  sillyDay(stage);
  hideAndSeek(stage);
  surprise(stage);
  royaleBadge(stage);
};

/* ---------- garden: seeds visibly grow on the map by the next session ---------- */
const drawGarden = (stage) => {
  UA.S.garden.forEach((g) => {
    const grown = g.day !== UA.todayStr();
    const x = 34 + (g.slot % 8) * 7, y = 78 + (g.slot % 3) * 4;
    const svg = grown
      ? `<svg viewBox="0 0 60 80" style="width:100%">${UA.gen.flower(30, 46, 17 + (g.slot % 3) * 4)}</svg>`
      : `<svg viewBox="0 0 60 80" style="width:100%"><path d="M30 66 Q28 52 30 46 Q38 44 38 36 Q30 36 30 44 Q28 34 20 36 Q22 46 30 46" fill="none" stroke="#4CBB74" stroke-width="4" stroke-linecap="round"/><ellipse cx="30" cy="68" rx="14" ry="5" fill="#B98A5E"/></svg>`;
    stage.appendChild(el(`<div style="position:absolute;left:${x}%;top:${y}%;width:44px;pointer-events:none">${svg}</div>`));
  });
};

/* ---------- daily gift: first launch of the day, on the map ---------- */
const dailyGift = (stage) => {
  const S = UA.S;
  if (S.lastGiftDay === UA.todayStr()) return;
  const giftPos = innerWidth < 700 ? [26, 64] : [44, 60];
  const g = el(`<button class="zone-spot" style="left:${giftPos[0]}%;top:${giftPos[1]}%;width:clamp(72px,12vw,100px);height:clamp(72px,12vw,100px)" aria-label="Present">
    <svg class="zone-art" viewBox="0 0 48 48"><g class="zone-bounce">${UA.giftSVG().replace(/<\/?svg[^>]*>/g, '')}</g></svg></button>`);
  g.addEventListener('pointerdown', (e) => {
    if (S.lastGiftDay === UA.todayStr()) return;      // evaluate once per map load, single claim
    S.lastGiftDay = UA.todayStr();
    const gems = 3 + UA.rand(3);
    S.gems += gems;
    UA.save();
    UA.audio.sfx.fanfare();
    UA.fx.burst({ x: e.clientX, y: e.clientY }, 'confetti', 18);
    UA.ui.gemFly(gems, g);
    UA.audio.speak(`A present! Good morning, ${S.name}! ${gems} gems inside!`);
    g.remove();
  });
  stage.appendChild(g);
};

/* ---------- silly event days (rare, breakfast-table reportable) ---------- */
const sillyDay = (stage) => {
  const S = UA.S;
  const today = UA.todayStr();
  if (S.sillyDay.day !== today) {
    S.sillyDay = { day: today, kind: UA.rand(7) === 0 ? UA.pick(UA.SILLY_DAYS) : '' };
    UA.save();
  }
  const kind = S.sillyDay.kind;
  if (!kind) return;
  if (kind === 'sock-day') {
    const u = $('#map-uni .uni-rig');
    if (u) {
      const wrap = $('#map-uni');
      wrap.innerHTML = UA.unicornSVG({ body: UA.PALETTE.bodies[S.uni.body], mane: UA.PALETTE.manes[S.uni.mane],
        cosmetics: S.equipped.concat(['socks-spotty']) });
      UA.world.pendingSillyLine = 'It is SOCK DAY! Everyone wears socks today. It is the law!';
    }
  } else if (kind === 'upside-down-day') {
    stage.querySelectorAll('.amb-butterfly').forEach(b => b.setAttribute('transform',
      (b.getAttribute('transform') || '') + ' rotate(180)'));
    UA.world.pendingSillyLine = 'It is Upside-Down Day! The butterflies are flying on their heads!';
  } else if (kind === 'echo-day') {
    const n = S.name || 'Superstar';
    UA.world.pendingSillyLine = `It is Echo Day! ${n}! ${n.toLowerCase().split('').join(' ')}! ${n}iddly-${n.slice(0, 2).toLowerCase()}oo!`;
  }
};

/* ---------- hide-and-seek: a hatched baby hides on the map ---------- */
const hideAndSeek = (stage) => {
  const S = UA.S;
  if (!S.babies.length || UA.rand(5) >= 2) return;    // sometimes, not always
  const b = UA.pick(S.babies);
  const spots = [
    { x: 6, y: 51, peek: 'tail' },    // behind the left tree
    { x: 88, y: 46, peek: 'mane' },   // behind the right tree
    { x: 49, y: 20, peek: 'mane' },   // behind the castle
  ];
  const sp = UA.pick(spots);
  const hider = el(`<button class="map-uni" style="left:${sp.x}%;top:${sp.y}%;width:74px;opacity:.96" aria-label="Someone is hiding!">
    <div style="clip-path:inset(0 ${sp.peek === 'tail' ? '58% 0 0' : '0 0 58%'});transform:rotate(${sp.peek === 'tail' ? -18 : 12}deg)">
      ${UA.unicornSVG({ body: b.body, mane: b.mane, baby: 1 })}</div></button>`);
  hider.addEventListener('pointerdown', (e) => {
    hider.querySelector('div').style.clipPath = 'none';
    hider.style.width = '110px';
    UA.audio.sfx.giggle();
    UA.fx.burst({ x: e.clientX, y: e.clientY }, 'heart', 9);
    UA.audio.speak(`You found ${b.name}! ${b.name} was hiding! Hee hee hee!`);
    S.hideSeek = { day: UA.todayStr(), found: (S.hideSeek.found || 0) + 1 };
    UA.save();
    setTimeout(() => hider.remove(), 2400);
  }, { once: true });
  stage.appendChild(hider);
};

/* ---------- rare surprise events: single-use, hard cooldown, unfarmable ---------- */
const surprise = (stage) => {
  const S = UA.S;
  if (UA.rand(6) !== 0) return;                        // rare per map entry
  const today = UA.todayStr();
  const ready = UA.SURPRISES.filter(id => S.surprises[id] !== today);
  if (!ready.length) return;
  const kind = UA.pick(ready);
  const fire = () => { S.surprises[kind] = today; UA.save(); };
  if (kind === 'shooting-star') {
    const star = el(`<button class="map-uni" style="left:-6%;top:12%;width:74px" aria-label="Shooting star">
      <svg viewBox="0 0 100 60"><path d="M10 30 H62" stroke="#FFF3C4" stroke-width="6" stroke-linecap="round"/>
      <polygon points="78,10 84,24 99,25 87,35 91,50 78,41 65,50 69,35 57,25 72,24" fill="#FFD97A" stroke="#5C4A66" stroke-width="3"/></svg></button>`);
    stage.appendChild(star);
    star.animate([{ left: '-6%', top: '10%' }, { left: '86%', top: '30%' }], { duration: 9000, fill: 'forwards' });
    star.style.transition = 'none';
    const timer = setTimeout(() => star.remove(), 9500);
    star.addEventListener('pointerdown', (e) => {
      clearTimeout(timer); fire();
      UA.fx.firework({ x: e.clientX, y: e.clientY });
      UA.reward.gems(3, star);
      UA.audio.speak('A shooting star! Three wish-gems!');
      star.remove();
    }, { once: true });
  } else if (kind === 'glitter-sneeze') {
    setTimeout(() => {
      if (UA.currentScreen() !== 'map') return;
      fire();
      const u = $('#map-uni');
      if (!u) return;
      u.querySelector('.uni-rig').classList.add('shiver');
      UA.audio.speak('Aaah... aaah... AAAH-CHOO!');
      const r = u.getBoundingClientRect();
      UA.fx.burst({ x: r.left + r.width * .8, y: r.top + r.height * .4 }, 'spark', 18);
    }, 6000);
  } else if (kind === 'bunny-peek') {
    const bunny = el(`<button class="map-uni" style="left:83%;top:49%;width:64px" aria-label="A bunny!">
      <span style="display:block;clip-path:inset(0 0 46% 0)">${UA.sprite('rabbit')}</span></button>`);
    stage.appendChild(bunny);
    bunny.addEventListener('pointerdown', (e) => {
      fire();
      bunny.querySelector('span').style.clipPath = 'none';
      UA.audio.sfx.giggle();
      UA.fx.burst({ x: e.clientX, y: e.clientY }, 'heart', 6);
      UA.audio.speak('A little bunny came to visit! Boing boing!');
      setTimeout(() => bunny.remove(), 2200);
    }, { once: true });
    setTimeout(() => bunny.isConnected && bunny.remove(), 12000);
  } else if (kind === 'butterfly-horn') {
    setTimeout(() => {
      if (UA.currentScreen() !== 'map') return;
      fire();
      const u = $('#map-uni');
      if (!u) return;
      const r = u.getBoundingClientRect();
      const bf = el(`<div class="particle" style="width:44px;height:34px"><svg viewBox="0 0 40 30">${UA.gen.butterfly(20, 15, 1)}</svg></div>`);
      document.body.appendChild(bf);
      bf.animate([
        { transform: `translate(${r.left - 120}px,${r.top - 80}px)` },
        { transform: `translate(${r.left + r.width * .78}px,${r.top - 6}px)` },
      ], { duration: 2600, fill: 'forwards', easing: 'ease-in-out' });
      setTimeout(() => {
        UA.audio.speak('Shh... a butterfly landed on my horn! Do not sneeze... do not sneeze...');
        setTimeout(() => bf.remove(), 4200);
      }, 2700);
    }, 5000);
  } else if (kind === 'heart-cloud') {
    setTimeout(() => {
      if (UA.currentScreen() !== 'map') return;
      fire();
      const hc = el(`<div class="particle" style="width:120px;height:90px;opacity:0">
        <svg viewBox="0 0 100 80"><path d="M50 74 C14 50 10 24 28 16 C40 10 50 20 50 28 C50 20 60 10 72 16 C90 24 86 50 50 74Z" fill="#fff" opacity=".95"/></svg></div>`);
      document.body.appendChild(hc);
      hc.animate([
        { transform: 'translate(20vw,16vh)', opacity: 0 },
        { transform: 'translate(24vw,12vh)', opacity: 1, offset: .3 },
        { transform: 'translate(30vw,10vh)', opacity: 1, offset: .8 },
        { transform: 'translate(34vw,8vh)', opacity: 0 },
      ], { duration: 9000, fill: 'forwards' });
      UA.audio.speak('Look up! That cloud is a love heart! It must be for us!');
      setTimeout(() => hc.remove(), 9200);
    }, 4000);
  }
};

/* ---------- Crystal Castle coronation + Rainbow Royale ---------- */
const royaleBadge = (stage) => {
  const S = UA.S;
  if (!S.royale.crowned) return;
  const spot = stage.querySelector('[data-testid="zone-crystal-castle"]');
  if (!spot) return;
  spot.appendChild(el(`<span style="position:absolute;top:-14px;right:-8px;width:44px;height:44px;pointer-events:none">${UA.rainbowGemSVG()}</span>`));
};

UA.world.roundHook = (stageId) => {
  const S = UA.S;
  if (stageId !== 'CC') return;
  // coronation: five royal rounds completed
  if (!S.royale.crowned && (S.rounds.CC || 0) >= 5) {
    S.royale.crowned = true;
    UA.memory.keep('coronation', `${S.name} was crowned Champion of the Rainbow Kingdom!`);
    UA.save();
    UA.engine.stop();
    coronation();
    return true;
  }
  // Rainbow Royale: the daily royal set pays rainbow gems
  if (S.royale.crowned) {
    if (S.royale.day !== UA.todayStr()) { S.royale.day = UA.todayStr(); S.royale.done = 0; }
    S.royale.done++;
    if (S.royale.done === 1) {
      UA.reward.rainbowGems(3);
      UA.audio.speak(`Today's royal challenge is DONE, Champion ${S.name}! Three rainbow gems!`);
      UA.memory.keep('royale-' + UA.todayStr(), `Champion ${S.name} finished the royal challenge!`);
    }
    UA.save();
  }
  return false;
};

const coronation = () => {
  const S = UA.S;
  UA.audio.sfx.fanfare();
  const layer = el(`<div class="veil" style="display:flex;align-items:center;justify-content:center;z-index:51;background:rgba(60,40,90,.6)">
    <div class="ceremony-card">
      <div><svg viewBox="140 0 90 70" style="width:110px;height:80px"><g transform="translate(0,30)">${UA.COSMETICS['crown-gold']()}</g></svg></div>
      <div class="ceremony-title">Queen ${S.name}!</div>
      <div style="font-size:24px;font-weight:800;color:var(--plum);text-align:center;max-width:520px">
        The Rainbow Kingdom has ALL its colours back!</div>
      <div style="width:220px">${UA.unicornSVG({ body: UA.PALETTE.bodies[S.uni.body], mane: UA.PALETTE.manes[S.uni.mane],
        cosmetics: S.equipped.concat(S.owned.includes('crown-gold') ? [] : []), cls: 'celebrate' })}</div>
      <button class="big-btn" style="background:var(--mint)" id="coro-done">Hooray!</button>
    </div></div>`);
  document.body.appendChild(layer);
  for (let i = 0; i < 5; i++) setTimeout(() => UA.fx.firework({ x: 100 + UA.rand(innerWidth - 200), y: 80 + UA.rand(innerHeight / 2) }), i * 700);
  UA.audio.speak(`People of the Rainbow Kingdom! Bow for the hero who painted our world bright again... Queen ${S.name}! ` +
    `From today you are our CHAMPION — and champions get a special royal challenge every single day!`);
  $('#coro-done', layer).addEventListener('pointerdown', () => {
    layer.remove();
    UA.enterMap();
  });
};
})();
