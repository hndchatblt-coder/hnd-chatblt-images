/* ================= Unicorn Academy — screens, chrome, celebrations =================
   Screen manager + wipe transitions, first-run flow, map hub, activity chrome,
   reward ceremonies, particles, dev panel. UA.ui is the surface the engine calls. */
'use strict';
(() => {
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
const app = $('#app');
UA.ui = {};
UA.fx = {};

/* ---------- static chrome, built once ---------- */
app.appendChild(el(`<div id="wipe"><svg viewBox="0 0 48 48"></svg></div>`));
app.appendChild(el(`<button id="home-btn" class="round-btn" data-testid="home-button" aria-label="Home">${UA.homeSVG()}</button>`));
app.appendChild(el(`<button id="hear-btn" class="round-btn" data-testid="hear-again" aria-label="Hear again">${UA.speakerSVG()}</button>`));
app.appendChild(el(`<div id="hud">
  <div id="gem-counter" data-testid="gem-counter">${UA.gemSVG()}<span id="gem-n">0</span></div>
  <div id="rainbow-meter" data-testid="rainbow-meter"><div></div></div>
</div>`));
app.appendChild(el(`<div id="celebrate-layer"></div>`));

const SCREENS = {};
const screen = (id, extra) => {
  const s = el(`<div class="screen" id="screen-${id}" ${extra || ''}></div>`);
  app.appendChild(s); SCREENS[id] = s; return s;
};
let current = 'start';
SCREENS.start = $('#screen-start');
let transitioning = false;

/* wipe transition: circle grows from origin point, swap, shrink */
UA.go = (id, opts = {}) => {
  if (transitioning || !SCREENS[id]) return;
  transitioning = true;
  UA.audio.sfx.whoosh();
  const w = $('#wipe');
  const pt = opts.from || { x: innerWidth / 2, y: innerHeight / 2 };
  w.style.background = opts.colour || '#FFD6E8';
  w.querySelector('svg').innerHTML = opts.iconSVG || '';
  const R = Math.hypot(Math.max(pt.x, innerWidth - pt.x), Math.max(pt.y, innerHeight - pt.y)) * 1.1;
  w.style.left = (pt.x - R) + 'px'; w.style.top = (pt.y - R) + 'px';
  w.style.width = R * 2 + 'px'; w.style.height = R * 2 + 'px';
  w.style.transition = 'none'; w.style.transform = 'scale(0)';
  w.classList.add('run');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    w.style.transition = 'transform .38s ease-in';
    w.style.transform = 'scale(1)';
    setTimeout(() => {
      SCREENS[current] && SCREENS[current].classList.remove('show');
      if (current === 'start') SCREENS.start.style.display = 'none';  // critical CSS shows it by id
      SCREENS[id].classList.add('show');
      current = id;
      if (opts.onArrive) opts.onArrive();       // scene builds within the wipe
      w.style.transition = 'transform .4s ease-out';
      w.style.transform = 'scale(0)';
      setTimeout(() => { w.classList.remove('run'); transitioning = false; }, 420);
    }, 400);
  }));
};
UA.currentScreen = () => current;
UA.registerScreen = (id, elm) => { SCREENS[id] = elm; };

/* ---------- particles: one reusable DOM particle system ---------- */
UA.fx.burst = (pt, kind, n = 10) => {
  if (!pt || pt.x == null) pt = { x: innerWidth / 2, y: innerHeight / 2 };
  for (let i = 0; i < n; i++) {
    const col = UA.pick(UA.PALETTE.rainbow);
    const html = kind === 'heart' ? UA.heartSVG(col) : kind === 'confetti'
      ? `<div style="width:14px;height:10px;background:${col};border-radius:3px"></div>`
      : UA.sparkleSVG(col);
    const p = el(`<div class="particle" style="width:${16 + UA.rand(14)}px;height:${16 + UA.rand(14)}px">${html}</div>`);
    document.body.appendChild(p);
    const a = Math.random() * Math.PI * 2, v = 60 + UA.rand(kind === 'confetti' ? 260 : 140);
    const dx = Math.cos(a) * v, dy = Math.sin(a) * v - (kind === 'confetti' ? 120 : 40);
    const rot = UA.rand(720) - 360, dur = 700 + UA.rand(500);
    p.animate([
      { transform: `translate(${pt.x}px,${pt.y}px) scale(1) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${pt.x + dx}px,${pt.y + dy + (kind === 'confetti' ? 300 : 60)}px) scale(.4) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: dur, easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => p.remove();
  }
};
UA.fx.firework = (pt) => {
  UA.fx.burst(pt, 'spark', 16);
  UA.fx.burst(pt, 'confetti', 10);
  UA.audio.sfx.sparkleArp();
};

/* ---------- HUD ---------- */
UA.ui.updateHUD = () => {
  $('#gem-n').textContent = UA.S.gems;
  $('#rainbow-meter>div').style.width = (UA.S.meter * 10) + '%';
};
UA.ui.gemFly = (n, fromEl) => {
  const target = $('#gem-counter').getBoundingClientRect();
  const from = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect()
    : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  for (let i = 0; i < Math.min(n, 6); i++) {
    const g = el(`<div class="particle" style="width:34px;height:34px">${UA.gemSVG()}</div>`);
    document.body.appendChild(g);
    g.animate([
      { transform: `translate(${from.left + from.width / 2}px,${from.top}px) scale(1.2)`, opacity: 1 },
      { transform: `translate(${target.left + 20}px,${target.top}px) scale(.7)`, opacity: 1, offset: .85 },
      { transform: `translate(${target.left + 20}px,${target.top}px) scale(.3)`, opacity: 0 },
    ], { duration: 800 + i * 110, easing: 'cubic-bezier(.3,.8,.4,1)' }).onfinish = () => {
      g.remove(); UA.ui.updateHUD(); $('#gem-counter').classList.remove('pop');
      void $('#gem-counter').offsetWidth; $('#gem-counter').classList.add('pop');
    };
  }
  UA.audio.sfx.sparkleArp();
};
UA.ui.quietChrome = (on) => {
  ['#gem-counter', '#rainbow-meter', '#hear-btn'].forEach(s => $(s) && $(s).classList.toggle('chrome-quiet', on));
};

/* ---------- companion: mood + memory ---------- */
UA.companion = {
  mood: 'calm', hits: 0,
  excite () { this.hits++; if (this.hits >= 3) { this.mood = 'excited'; this.hits = 3; } },
  calm () { this.hits = Math.max(0, this.hits - 1); if (this.hits === 0) this.mood = 'calm'; },
  memoryLine () {
    const S = UA.S;
    const lines = [];
    const fav = Object.entries(S.zoneVisits).sort((a, b) => b[1] - a[1])[0];
    if (fav && fav[1] >= 3) lines.push(`I love it when we visit ${UA.zoneById(fav[0]).name} together!`);
    if (S.daysPlayed >= 3) lines.push(`We have played on ${S.daysPlayed} days now. Best friends!`);
    const total = UA.totalStars();
    if (total > 0) lines.push(`You have earned ${total} ${total === 1 ? 'star' : 'stars'} for the kingdom!`);
    return lines.length ? UA.pick(lines) : '';
  },
};

/* =====================================================================
   FIRST-RUN FLOW: create-a-unicorn -> her name -> quest story
===================================================================== */
const sCreate = screen('create');
const sUniName = screen('uniname');
const sKidName = screen('kidname');
const sStory = screen('story');
const sMap = screen('map', 'data-testid="map"');
const sActivity = screen('activity', 'data-testid="activity"');

const buildCreate = () => {
  const P = UA.PALETTE;
  sCreate.innerHTML = `<div class="fr-wrap">
    <div class="fr-title-art" id="create-preview"></div>
    <div class="swatch-row" id="body-row">${P.bodies.map((c, i) =>
      `<button class="swatch" data-testid="unicorn-colour-${i + 1}" style="background:${c}" aria-label="${P.bodyNames[i]}"></button>`).join('')}</div>
    <div class="swatch-row" id="mane-row" style="display:none">${P.manes.map((c, i) =>
      `<button class="swatch" data-testid="mane-colour-${i + 1}" style="background:${c}" aria-label="${P.maneNames[i]}"></button>`).join('')}</div>
  </div>`;
  const preview = () => { $('#create-preview').innerHTML = UA.unicornSVG({
    body: P.bodies[UA.S.uni.body], mane: P.manes[UA.S.uni.mane] }); };
  preview();
  $$('#body-row .swatch').forEach((b, i) => b.addEventListener('pointerdown', () => {
    UA.S.uni.body = i; preview(); UA.audio.sfx.pop();
    $$('#body-row .swatch').forEach(x => x.classList.remove('picked')); b.classList.add('picked');
    if ($('#mane-row').style.display === 'none') {
      $('#mane-row').style.display = '';
      UA.audio.speak('Ooh lovely! Now tap a colour for my mane!');
    }
  }));
  $$('#mane-row .swatch').forEach((b, i) => b.addEventListener('pointerdown', () => {
    UA.S.uni.mane = i; preview(); UA.audio.sfx.chime();
    $$('#mane-row .swatch').forEach(x => x.classList.remove('picked')); b.classList.add('picked');
    UA.save();
    setTimeout(() => { buildUniName(); UA.go('uniname', { colour: '#E9DDFF' }); }, 700);
  }));
};

const buildUniName = () => {
  sUniName.innerHTML = `<div class="fr-wrap">
    <div class="fr-title-art">${UA.unicornSVG({ body: UA.PALETTE.bodies[UA.S.uni.body], mane: UA.PALETTE.manes[UA.S.uni.mane] })}</div>
    <div class="name-row">${UA.UNI_NAMES.map(n =>
      `<button class="big-btn" data-testid="unicorn-name-option" data-name="${n}">${n}</button>`).join('')}</div>
    <button class="round-btn" data-testid="name-done" id="uniname-done" style="width:120px;height:120px">${UA.tickSVG()}</button>
  </div>`;
  UA.audio.speak('What will you call me? Tap a name you like!').then(() =>
    UA.UNI_NAMES.forEach((n, i) => setTimeout(() => current === 'uniname' && UA.audio.speak(n, { interrupt: false }), i * 100)));
  $$('button[data-name]', sUniName).forEach(b => b.addEventListener('pointerdown', () => {
    UA.S.uni.name = b.dataset.name;
    UA.save();
    $$('button[data-name]', sUniName).forEach(x => x.style.opacity = x === b ? '1' : '.45');
    UA.audio.speak(b.dataset.name + '! I love it!');
    UA.audio.sfx.chime();
  }));
  $('#uniname-done').addEventListener('pointerdown', () => {
    if (!UA.S.uni.name) UA.S.uni.name = UA.pick(UA.UNI_NAMES);
    UA.save();
    buildKidName();
    UA.go('kidname', { colour: '#D2F5DC' });
  });
};

/* her name: stealth letter game. Giant tick sits mid-screen (bare tick allowed). */
const buildKidName = (onDone) => {
  sKidName.innerHTML = `<div class="fr-wrap" style="justify-content:flex-start;padding-top:calc(36px + var(--sat))">
    <div class="name-display" id="kid-name-display">&nbsp;</div>
    <button class="round-btn" data-testid="name-done" id="kidname-done"
      style="width:132px;height:132px;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--mint)">${UA.tickSVG()}</button>
    <div class="kbd" data-testid="name-keyboard" id="kid-kbd" style="position:absolute;left:50%;bottom:calc(20px + var(--sab));transform:translateX(-50%);width:min(96vw,940px)">
      ${UA.ALPHABET.map(c => `<button data-ch="${c.toUpperCase()}">${c.toUpperCase()}</button>`).join('')}
      <button class="wide" id="kbd-back" aria-label="Undo">${UA.backspaceSVG()}</button>
    </div>
  </div>`;
  UA.audio.speak('Now, can you tap the letters of YOUR name? Or just tap the green tick!');
  let name = '';
  const disp = $('#kid-name-display');
  $$('#kid-kbd button[data-ch]').forEach(b => b.addEventListener('pointerdown', () => {
    if (name.length >= 10) return;
    name += b.dataset.ch;
    disp.textContent = name;
    UA.audio.speak(b.dataset.ch, { interrupt: true });
    UA.audio.sfx.pop();
  }));
  $('#kbd-back').addEventListener('pointerdown', () => {
    name = name.slice(0, -1); disp.textContent = name || ' ';
    UA.audio.speak('Undo!', { interrupt: true });
  });
  $('#kidname-done').addEventListener('pointerdown', () => {
    UA.S.name = name || 'Superstar';
    UA.save();
    UA.audio.sfx.fanfare();
    UA.audio.speak(name ? `${name}! What a wonderful name!` : 'Hello, Superstar!');
    if (onDone) return onDone();
    buildStory();
    UA.go('story', { colour: '#E9DDFF' });
  });
};
UA.ui.nameKeyboard = buildKidName;   // reused by egg hatching

/* quest story over the faded map (~15s, chunked, tap-skippable) */
const buildStory = () => {
  sStory.innerHTML = `<div class="story-stage">
    <div style="position:absolute;inset:0;filter:saturate(.25) brightness(1.05)">${mapSceneSVG(0)}</div>
    <div style="position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);width:min(46vh,340px)" id="story-uni">
      ${UA.unicornSVG({ body: UA.PALETTE.bodies[UA.S.uni.body], mane: UA.PALETTE.manes[UA.S.uni.mane] })}</div>
    <button class="round-btn" id="story-skip" data-testid="story-skip" aria-label="Skip">${UA.sparkleSVG()}</button>
  </div>`;
  let skipped = false;
  const finish = () => {
    if (skipped) return;
    skipped = true;
    UA.S.created = true;
    UA.save();
    UA.audio.stopSpeech();
    enterMap();
  };
  $('#story-skip').addEventListener('pointerdown', finish);
  const chunks = [
    `Once upon a time, the Rainbow Kingdom was full of colour!`,
    `But oh no... the colours have faded away. Look how pale everything is!`,
    `Only a hero like you can bring them back, ${UA.S.name}!`,
    `Every star you earn paints the kingdom bright again. Let us fly, hero!`,
  ];
  (async () => {
    for (const c of chunks) {
      if (skipped) return;
      await UA.audio.speak(c);
      if (skipped) return;
      $('#story-uni').classList.add('leap');
      setTimeout(() => $('#story-uni') && $('#story-uni').classList.remove('leap'), 850);
    }
    finish();
  })();
};

/* =====================================================================
   MAP HUB
===================================================================== */
/* day/night: 3 gradient presets off the clock */
const skyPreset = () => {
  const h = new Date().getHours();
  if (h >= 19 || h < 6) return { top: '#3E3660', mid: '#5C4A88', low: '#8878B8', night: true };
  if (h >= 16) return { top: '#FFD9B8', mid: '#FFC2D4', low: '#E9DDFF', night: false };
  return { top: '#BFE6FF', mid: '#D3ECFF', low: '#FFF3FA', night: false };
};

/* the world blooms as stars are earned */
const mapSceneSVG = (stars) => {
  const sky = skyPreset();
  const bloom = Math.min(1, stars / 40);
  let flowers = '';
  const nF = 4 + Math.round(bloom * 26);
  for (let i = 0; i < nF; i++)
    flowers += UA.gen.flower(30 + UA.rand(940), 560 + UA.rand(150), 9 + UA.rand(10 + bloom * 8));
  let stars_ = '';
  if (sky.night) for (let i = 0; i < 26; i++)
    stars_ += UA.gen.sparkle(UA.rand(1000), UA.rand(300), .5 + Math.random(), '#FFF3C4');
  let butterflies = '';
  for (let i = 0; i < 1 + Math.round(bloom * 3); i++)
    butterflies += UA.gen.butterfly(120 + UA.rand(760), 380 + UA.rand(160), .8);
  return `<svg viewBox="0 0 1000 760" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%">
    <defs><linearGradient id="mapsky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${sky.top}"/><stop offset=".5" stop-color="${sky.mid}"/><stop offset="1" stop-color="${sky.low}"/></linearGradient></defs>
    <rect width="1000" height="760" fill="url(#mapsky)"/>
    ${stars_}
    <g opacity="${.35 + bloom * .65}">${UA.gen.rainbow(500, 240, 210, 2 + Math.min(4, Math.floor(stars / 8)), 16)}</g>
    ${UA.gen.cloud(160, 110, 1.3, '#fff', .9)} ${UA.gen.cloud(760, 80, 1, '#fff', .85)} ${UA.gen.cloud(520, 160, .8, '#fff', .8)}
    ${UA.gen.hills(1000, 760, sky.night ? ['#4E6E58', '#3E5C48', '#2E4A38'] : undefined)}
    ${UA.gen.tree(80, 500, 1.1)} ${UA.gen.tree(920, 520, 1.3)} ${UA.gen.tree(180, 640, .9)}
    ${flowers} ${butterflies}
  </svg>`;
};

const zoneStarsRow = (z) => {
  const got = UA.zoneStars(UA.S, z.id);
  const max = z.stages.filter(s => UA.STAGES[s] && UA.STAGES[s].stars !== false).length * 3;
  if (!max) return '';
  const show = Math.min(3, Math.ceil(max / 3));
  return `<span class="zone-stars">${[...Array(3)].map((_, i) =>
    UA.starSVG('#FFD97A', got < Math.round(max * (i + 1) / 3))).join('')}</span>`;
};

let beaconTimer = null;
const enterMap = (fromPt) => {
  buildMap();
  UA.go('map', { colour: '#D3ECFF', from: fromPt, onArrive: () => {
    UA.audio.startMusic(0);
    $('#home-btn').classList.remove('show');
    $('#hear-btn').classList.remove('show');
    $('#hud').classList.add('show');
    UA.ui.updateHUD();
    mapWelcome();
  } });
};
UA.enterMap = enterMap;

const buildMap = () => {
  const S = UA.S;
  sMap.innerHTML = `<div class="map-stage">${mapSceneSVG(UA.totalStars())}</div>`;
  const stage = $('.map-stage', sMap);
  // learning zones
  UA.ZONES.forEach(z => {
    const unlocked = UA.zoneUnlocked(z.id);
    const spot = el(`<button class="zone-spot ${unlocked ? '' : 'locked'}" data-testid="zone-${z.id}"
      style="left:${z.x}%;top:${z.y}%;width:min(17vw,150px);height:min(17vw,150px)" aria-label="${z.name}">
      ${UA.landmark(z.icon, z.col, z.col2)}
      ${unlocked ? zoneStarsRow(z) : `<svg class="zone-mist" viewBox="0 0 120 120">
        ${UA.gen.cloud(40, 70, .9, '#E9DDFF', .8)}${UA.gen.cloud(80, 50, .8, '#F3EBFF', .75)}
        ${UA.gen.sparkle(30, 40, 1)}${UA.gen.sparkle(90, 80, .8)}${UA.gen.sparkle(60, 24, .7)}</svg>`}
    </button>`);
    spot.addEventListener('pointerdown', (e) => {
      if (transitioning) return;
      clearTimeout(beaconTimer);
      if (!unlocked) {
        UA.audio.sfx.boop();
        UA.audio.speak(z.lockSay);
        spot.animate([{ transform: 'translate(-50%,-50%)' }, { transform: 'translate(-50%,-50%) rotate(-3deg)' },
          { transform: 'translate(-50%,-50%) rotate(3deg)' }, { transform: 'translate(-50%,-50%)' }], { duration: 400 });
        return;
      }
      S.zoneVisits[z.id] = (S.zoneVisits[z.id] || 0) + 1;
      UA.save();
      openZone(z, { x: e.clientX, y: e.clientY });
    });
    stage.appendChild(spot);
  });
  // the unicorn herself, pettable, trots to the recommended zone (beacon)
  const uni = el(`<button class="map-uni" id="map-uni" aria-label="${S.uni.name}"
    style="left:44%;top:78%;width:min(20vw,170px);border:none;background:none">
    ${UA.unicornSVG({ body: UA.PALETTE.bodies[S.uni.body], mane: UA.PALETTE.manes[S.uni.mane], cosmetics: S.equipped })}</button>`);
  let lastPet = 0;
  uni.addEventListener('pointerdown', (e) => {
    const now = Date.now();
    if (now - lastPet < 200) return;             // debounced
    lastPet = now;
    const rig = uni.querySelector('.uni-rig');
    const rare = UA.rand(14) === 0;
    rig.classList.remove('nuzzle', 'shiver', 'leap');
    void rig.getBoundingClientRect();
    if (rare) {
      rig.classList.add('leap');
      UA.audio.speak(UA.pick(UA.JOKES));
    } else {
      rig.classList.add(UA.pick(['nuzzle', 'shiver']));
      UA.audio.sfx.giggle();
      if (UA.rand(3) === 0) UA.audio.speak(UA.pick(['Hee hee!', 'That tickles!', 'I love you, %NAME%!']).replace('%NAME%', S.name));
    }
    UA.fx.burst({ x: e.clientX, y: e.clientY }, UA.rand(2) ? 'spark' : 'heart', 7);
  });
  stage.appendChild(uni);
  if (UA.world) UA.world.decorateMap(stage);
};

/* beacon: trot toward + sparkle-point at the recommended zone; dismissable */
const recommendZone = () => {
  const open = UA.ZONES.filter(z => UA.zoneUnlocked(z.id) && z.id !== 'crystal-castle');
  open.sort((a, b) => (UA.zoneStars(UA.S, a.id) - UA.zoneStars(UA.S, b.id)) ||
    ((UA.S.zoneVisits[a.id] || 0) - (UA.S.zoneVisits[b.id] || 0)));
  return open[0];
};
const mapWelcome = () => {
  const S = UA.S;
  const hello = S.created && S.sessions > 1
    ? `Welcome back, ${S.name}! ${S.uni.name} missed you!`
    : `This is the Rainbow Kingdom, ${S.name}!`;
  const mem = UA.companion.memoryLine();
  UA.audio.speak(hello + (mem ? ' ' + mem : ''));
  const rec = recommendZone();
  beaconTimer = setTimeout(() => {
    const uni = $('#map-uni'), spot = $(`[data-testid="zone-${rec.id}"]`);
    if (!uni || !spot || current !== 'map') return;
    uni.style.left = Math.max(8, Math.min(84, rec.x + 8)) + '%';
    uni.style.top = Math.min(84, rec.y + 12) + '%';
    uni.querySelector('.uni-rig').classList.add('trot');
    setTimeout(() => {
      if (current !== 'map') return;
      const u = $('#map-uni'); u && u.querySelector('.uni-rig').classList.remove('trot');
      const r = spot.getBoundingClientRect();
      UA.fx.burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'spark', 9);
      UA.audio.speak(`Shall we play in ${rec.name}?`);
    }, 1700);
  }, 2600);
};

const openZone = (z, pt) => {
  UA.go('activity', { colour: z.col, from: pt, onArrive: () => {
    UA.audio.startMusic(z.key);
    UA.engine.start(z.id, null, { hello: z.hello });
  } });
};

/* =====================================================================
   ACTIVITY SCREEN & ENGINE UI SURFACE
===================================================================== */
UA.ui.showActivity = (zone, stage) => {
  sActivity.innerHTML = `
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,${zone.col2} 0%,#FFF9F5 70%)"></div>
    <div style="position:absolute;inset:0;pointer-events:none;border:14px solid ${zone.col};border-radius:0;opacity:.5"></div>
    <div style="position:absolute;right:calc(24px + var(--sar));bottom:calc(20px + var(--sab));width:110px;opacity:.9;pointer-events:none" id="activity-host">
      ${UA.unicornSVG({ body: UA.PALETTE.bodies[UA.S.uni.body], mane: UA.PALETTE.manes[UA.S.uni.mane], cosmetics: UA.S.equipped })}</div>
    <div style="position:absolute;left:calc(26px + var(--sal));top:calc(126px + var(--sat));pointer-events:none;opacity:.9">
      <div style="width:64px;height:64px">${UA.landmark(zone.icon, zone.col, zone.col2)}</div></div>
    <div class="activity-wrap">
      <div class="prompt-area" id="prompt-area"></div>
      <div style="flex:1;width:100%;position:relative;display:flex" id="options-area"></div>
    </div>`;
  $('#home-btn').classList.add('show');
  $('#hear-btn').classList.add('show');
  $('#hud').classList.add('show');
  if (current !== 'activity') SCREENS.activity.classList.add('show');
};

UA.ui.renderQuestion = (q, sparkle) => {
  $('#prompt-area').innerHTML = q.prompt || '';
  const area = $('#options-area');
  area.innerHTML = '';
  const widget = UA.widgets[q.widget || q.stage.widget];
  widget.render(q, area);
  if (sparkle) {
    const first = area.querySelector('.answer');
    area.insertAdjacentHTML('afterbegin',
      `<div class="sparkle-badge" style="position:absolute;top:-8px;left:50%;transform:translateX(-50%)">${UA.sparkleSVG()}</div>`);
  }
  UA.ui.setOptionsQuiet(true);
};
UA.ui.setOptionsQuiet = (quiet) => {
  $$('#options-area .answer').forEach((b, i) => {
    b.classList.toggle('quiet', quiet);
    if (!quiet) { b.classList.add('live'); b.style.animationDelay = (i * 60) + 'ms'; }
  });
};
UA.ui.pulseOptions = () => {
  $$('#options-area .answer').forEach(b => {
    b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
      { duration: 700, easing: 'ease-in-out' });
  });
};
UA.ui.hintFade = (q) => {
  if (q.hintFn) return q.hintFn();
  const wrong = $$('#options-area .answer').filter(b => b.dataset.opt !== String(q.correct));
  UA.shuffle(wrong).slice(0, Math.max(1, wrong.length - 1)).forEach(b => b.classList.add('faded'));
};
UA.ui.revealCorrect = (q) => {
  if (q.revealFn) return q.revealFn();
  const right = $$('#options-area .answer').find(b => b.dataset.opt === String(q.correct));
  if (right) {
    right.classList.add('reveal-glow');
    $$('#options-area .answer').forEach(b => { if (b !== right) b.classList.add('faded'); });
  }
};
UA.ui.feedbackCorrect = (elm, pt) => {
  if (elm && elm.classList) elm.classList.add('correct-glow');
  UA.fx.burst(pt || (elm && elm.getBoundingClientRect ? {
    x: elm.getBoundingClientRect().left + elm.getBoundingClientRect().width / 2,
    y: elm.getBoundingClientRect().top } : null), 'spark', 12);
  const host = $('#activity-host .uni-rig');
  if (host) {
    host.classList.remove('leap', 'crouch');
    host.classList.add('crouch');                     // anticipation ->
    setTimeout(() => { host.classList.remove('crouch'); host.classList.add('leap'); }, 240);
    setTimeout(() => host.classList.remove('leap'), 1100);
  }
  UA.companion.excite();
  UA.ui.quietChrome(false);
};
UA.ui.feedbackWrong = (elm) => {
  if (elm && elm.classList) { elm.classList.add('wrong-wiggle'); setTimeout(() => elm.classList.remove('wrong-wiggle'), 550); }
  UA.companion.calm();
};

/* worked example: the unicorn demonstrates before the first question of a new widget */
UA.ui.workedExample = (widgetName, stage) => new Promise((resolve) => {
  const lines = {
    tap: 'Watch me first! When you hear the question, tap the right card — like this!',
    drag: 'Watch me! I pick a piece up with my hoof, and slide it into its home!',
    tapeach: 'Watch me count! I tap each one, just once: one... two...!',
    tapseq: 'Watch me! I tap them in order, one after the other!',
    flip: 'Watch me! I flip a cloud, then flip another, looking for twins!',
    jigsaw: 'Watch me! I tap a piece, then I tap the spot where it belongs!',
  };
  const demo = el(`<div class="veil" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px">
    <div style="width:220px" class="demo-uni">${UA.unicornSVG({ body: UA.PALETTE.bodies[UA.S.uni.body], mane: UA.PALETTE.manes[UA.S.uni.mane] })}</div>
    <div style="width:130px;height:130px" class="demo-hand">
      <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="26" fill="rgba(255,255,255,.85)" stroke="#5C4A66" stroke-width="4"/><circle cx="50" cy="50" r="10" fill="#FF9EC7"/></svg></div>
  </div>`);
  document.body.appendChild(demo);
  demo.querySelector('.demo-uni .uni-rig').classList.add('nuzzle');
  const hand = demo.querySelector('.demo-hand');
  hand.animate([
    { transform: 'translate(-60px,20px) scale(1)' },
    { transform: 'translate(40px,-10px) scale(1)', offset: .5 },
    { transform: 'translate(40px,-10px) scale(.8)', offset: .65 },
    { transform: 'translate(40px,-10px) scale(1)', offset: .8 },
    { transform: 'translate(-60px,20px) scale(1)' },
  ], { duration: 2600, iterations: 2, easing: 'ease-in-out' });
  let done = false;
  const finish = () => { if (done) return; done = true; demo.remove(); resolve(); };
  demo.addEventListener('pointerdown', finish);       // tap-skippable
  UA.audio.speak(lines[UA.widgets[stage.widget] ? (UA.widgets[stage.widget].demo || 'tap') : 'tap'] || lines.tap)
    .then(() => setTimeout(finish, 2400));
});

/* ---------- round celebration + suggest + rest ---------- */
const celebrate = $('#celebrate-layer');
const showCard = (inner, { skippable = true } = {}) => {
  celebrate.innerHTML = `<div class="veil"></div><div class="ceremony-card">${inner}</div>`;
  celebrate.classList.add('show');
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; celebrate.classList.remove('show'); celebrate.innerHTML = ''; resolve(); };
    if (skippable) celebrate.addEventListener('pointerdown', finish, { once: true });
    celebrate.dataset.finish = '1';
    UA.ui._finishCard = finish;
  });
};

UA.ui.roundCelebration = ({ gems, perfect, rare, onDone }) => {
  if (UA.dev && UA.dev.skipCele) { onDone(); return; }
  UA.audio.sfx.flourish();
  UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 3 }, 'confetti', 22);
  const inner = `
    <div style="width:170px">${UA.unicornSVG({ body: UA.PALETTE.bodies[UA.S.uni.body], mane: UA.PALETTE.manes[UA.S.uni.mane], cls: 'celebrate' })}</div>
    <div class="ceremony-title">${perfect ? 'PERFECT!' : 'Round done!'}</div>
    <div style="display:flex;gap:8px;align-items:center;font-size:40px;font-weight:900;color:var(--plum)">
      <span style="width:44px;height:44px">${UA.gemSVG()}</span> +${gems} ${rare ? '<span style="width:44px;height:44px">' + UA.sparkleSVG() + '</span> rare sticker!' : ''}
    </div>`;
  UA.audio.speak(perfect ? `A perfect round, ${UA.S.name}! Every single one!` : `Round finished! ${gems} gems!`);
  showCard(inner).then(onDone);
  setTimeout(() => UA.ui._finishCard && UA.ui._finishCard(), 3600);
};

UA.ui.suggestElsewhere = () => {
  const rec = recommendZone();
  UA.audio.speak(`You are doing so well! Shall we try ${rec.name} for a change? Or keep going — you choose!`);
  UA.engine.next();
};

UA.ui.restOffer = () => {
  const inner = `
    <div style="width:170px"><div class="uni-rig-holder">${UA.unicornSVG({ body: UA.PALETTE.bodies[UA.S.uni.body], mane: UA.PALETTE.manes[UA.S.uni.mane], cls: 'sad-tilt' })}</div></div>
    <div class="ceremony-title" style="font-size:40px">Yaaawn...</div>
    <div style="display:flex;gap:22px">
      <button class="big-btn" data-testid="keep-playing" style="background:var(--mint)">Keep playing</button>
      <button class="big-btn" data-testid="rest-now" style="background:var(--lav)">
        <svg viewBox="0 0 48 48" width="34" height="34" style="vertical-align:-6px"><path d="M30 6 A18 18 0 1 0 30 42 A14 14 0 1 1 30 6Z" fill="#FFF3C4" stroke="#5C4A66" stroke-width="3" stroke-linejoin="round"/></svg>
        Rest now</button>
    </div>`;
  UA.audio.sfx.yawn();
  celebrate.innerHTML = `<div class="veil"></div><div class="ceremony-card">${inner}</div>`;
  celebrate.classList.add('show');
  UA.audio.speak(`Phew, we have played lots! Shall we rest, ${UA.S.name}? I will keep your stars safe! Or we can keep playing!`);
  $('[data-testid="keep-playing"]', celebrate).addEventListener('pointerdown', () => {
    celebrate.classList.remove('show'); celebrate.innerHTML = '';
    UA.audio.speak('Hooray! More playing!');
  });
  $('[data-testid="rest-now"]', celebrate).addEventListener('pointerdown', () => {
    celebrate.classList.remove('show'); celebrate.innerHTML = '';
    UA.engine.stop();
    enterMap();
    setTimeout(() => {
      UA.audio.speak(`Night night, ${UA.S.name}! Your stars are safe with me!`);
      const uni = $('#map-uni');
      if (uni) uni.querySelector('.uni-rig').classList.add('sad-tilt');
      $('.map-stage') && ($('.map-stage').style.filter = 'brightness(.7)');
    }, 700);
  });
};

/* ---------- star ceremony (each is a true first — full screen, replayable later) ---------- */
UA.ui.starCeremony = (stageId, nth, then) => {
  if (UA.dev && UA.dev.skipCele) { then && then(); return; }
  const stage = UA.STAGES[stageId];
  const first = !UA.S.firsts.includes('star-1');
  const id = 'star-' + stageId + '-' + nth;
  UA.audio.sfx.fanfare();
  UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 3 }, 'confetti', 30);
  UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 2 }, 'spark', 16);
  const line = first
    ? `${UA.S.name}, your VERY FIRST STAR! The kingdom is getting its colour back!`
    : `A new star for ${stage.name}! The kingdom grows brighter, ${UA.S.name}!`;
  if (first) UA.S.firsts.push('star-1');
  UA.memory && UA.memory.keep(id, `${UA.S.name} earned a star in ${stage.name}!`);
  UA.save();
  const inner = `
    <div style="width:120px;height:120px">${UA.starSVG()}</div>
    <div class="ceremony-title">${UA.S.name ? UA.S.name + '!' : 'Superstar!'}</div>
    <div style="font-size:26px;font-weight:800;color:var(--plum);text-align:center">${stage.name} — star ${nth} of 3!</div>
    <div style="width:150px">${UA.unicornSVG({ body: UA.PALETTE.bodies[UA.S.uni.body], mane: UA.PALETTE.manes[UA.S.uni.mane], cls: 'celebrate' })}</div>`;
  UA.audio.speak(line);
  showCard(inner).then(() => then && then());
  setTimeout(() => UA.ui._finishCard && UA.ui._finishCard(), 4600);
};

/* ---------- rainbow-meter party: every tap launches a firework SHE aims ---------- */
UA.ui.meterParty = () => {
  if (UA.dev && UA.dev.skipCele) return;
  const layer = el(`<div class="veil" style="background:rgba(60,40,80,.55);z-index:51;display:flex;align-items:flex-start;justify-content:center">
    <div class="ceremony-title" style="margin-top:12vh;pointer-events:none;color:#fff;text-shadow:0 3px 0 rgba(92,74,102,.6)">TAP TAP TAP!</div>
    <div style="position:absolute;bottom:4vh;left:50%;transform:translateX(-50%);width:200px" id="party-uni">
      ${UA.unicornSVG({ body: UA.PALETTE.bodies[UA.S.uni.body], mane: UA.PALETTE.manes[UA.S.uni.mane], cosmetics: UA.S.equipped })}</div>
  </div>`);
  document.body.appendChild(layer);
  UA.audio.speak(`The rainbow meter is FULL! Tap anywhere — you make the fireworks, ${UA.S.name}!`);
  const dance = () => {
    const u = layer.querySelector('#party-uni .uni-rig');
    if (!u) return;
    u.classList.remove('leap'); void u.getBoundingClientRect(); u.classList.add('leap');
  };
  layer.addEventListener('pointerdown', (e) => { UA.fx.firework({ x: e.clientX, y: e.clientY }); dance(); });
  let closed = false;
  const close = () => { if (closed) return; closed = true; layer.remove(); };
  setTimeout(close, 15000);
  const skip = el(`<button class="round-btn" style="position:absolute;right:24px;top:24px">${UA.tickSVG()}</button>`);
  skip.addEventListener('pointerdown', (e) => { e.stopPropagation(); close(); });
  layer.appendChild(skip);
};

/* ---------- eggs: arrive on the map, tap-tap-tap crack, hatch, NAME the baby ---------- */
UA.ui.eggArrives = (then) => {
  const idx = UA.S.eggsAwarded;                     // 0-based egg being hatched
  const body = UA.BABY_BODIES[idx % UA.BABY_BODIES.length];
  const mane = UA.BABY_MANES[idx % UA.BABY_MANES.length];
  let taps = 0;
  const layer = el(`<div class="veil" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px">
    <div class="ceremony-title" style="color:#fff;text-shadow:0 3px 0 rgba(92,74,102,.6)">An egg!</div>
    <button data-testid="egg" id="egg-btn" style="border:none;background:none;width:220px;cursor:pointer">${UA.eggSVG(body, 0)}</button>
  </div>`);
  document.body.appendChild(layer);
  UA.audio.sfx.fanfare();
  UA.audio.speak(`${UA.S.name}! Your stars magicked up a unicorn egg! Tap it! Tap tap tap!`);
  $('#egg-btn', layer).addEventListener('pointerdown', (e) => {
    taps++;
    UA.audio.sfx.crack();
    UA.fx.burst({ x: e.clientX, y: e.clientY }, 'spark', 6);
    const btn = $('#egg-btn', layer);
    btn.animate([{ transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0)' }], { duration: 200 });
    if (taps < 3) { btn.innerHTML = UA.eggSVG(body, taps); return; }
    // crack! hatch the baby
    UA.fx.burst({ x: e.clientX, y: e.clientY }, 'confetti', 24);
    UA.audio.sfx.fanfare();
    btn.style.pointerEvents = 'none';
    btn.innerHTML = UA.unicornSVG({ body, mane, baby: 1 });
    UA.audio.speak('CRACK! Hello, little one! What shall we name the baby?').then(() => {
      layer.remove();
      nameBaby(body, mane, then);
    });
  });
};
const nameBaby = (body, mane, then) => {
  // reuse the naming widget: spoken list + keyboard (stealth letter practice)
  const layer = el(`<div class="veil" style="display:flex;align-items:center;justify-content:center">
    <div class="ceremony-card" style="max-width:92vw">
      <div style="width:140px">${UA.unicornSVG({ body, mane, baby: 1 })}</div>
      <div class="name-row" id="baby-names">${UA.shuffle(UA.UNI_NAMES.concat(['Clover', 'Sunny'])).slice(0, 4).map(n =>
        `<button class="big-btn" data-testid="unicorn-name-option" data-name="${n}" style="font-size:24px;padding:14px 22px">${n}</button>`).join('')}</div>
      <div class="name-display" id="baby-name-disp" style="min-width:220px;font-size:38px">&nbsp;</div>
      <div class="kbd" style="max-width:700px" id="baby-kbd">
        ${UA.ALPHABET.map(c => `<button data-ch="${c.toUpperCase()}" style="width:62px;height:62px;font-size:30px">${c.toUpperCase()}</button>`).join('')}
      </div>
      <button class="round-btn" data-testid="name-done" id="baby-done">${UA.tickSVG()}</button>
    </div></div>`);
  document.body.appendChild(layer);
  let name = '';
  $$('#baby-names button', layer).forEach(b => b.addEventListener('pointerdown', () => {
    name = b.dataset.name; $('#baby-name-disp', layer).textContent = name;
    UA.audio.speak(name + '!'); UA.audio.sfx.pop();
  }));
  $$('#baby-kbd button', layer).forEach(b => b.addEventListener('pointerdown', () => {
    if (name.length >= 10) return;
    name += b.dataset.ch; $('#baby-name-disp', layer).textContent = name;
    UA.audio.speak(b.dataset.ch, { interrupt: true });
  }));
  $('#baby-done', layer).addEventListener('pointerdown', () => {
    if (!name) name = UA.pick(UA.UNI_NAMES);
    const S = UA.S;
    S.babies.push({ id: 'baby' + S.eggsAwarded, name, body, mane,
      quirk: UA.BABY_QUIRKS[S.eggsAwarded % UA.BABY_QUIRKS.length],
      starsAtHatch: UA.totalStars(), treats: 0, growth: 0 });
    S.eggsAwarded++;
    S.eggPending = false;
    UA.memory && UA.memory.keep('hatch-' + name, `${name} hatched from an egg!`);
    UA.save();
    UA.audio.sfx.fanfare();
    UA.audio.speak(`Welcome to the family, ${name}!`);
    layer.remove();
    UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 2 }, 'heart', 12);
    then && then();
  });
};

/* =====================================================================
   HOME / HEAR-AGAIN / DEV PANEL
===================================================================== */
$('#home-btn').addEventListener('pointerdown', (e) => {
  if (current === 'map') return;
  UA.engine.stop();                                  // cancels cleanly, nothing counted
  celebrate.classList.remove('show'); celebrate.innerHTML = '';
  enterMap({ x: e.clientX, y: e.clientY });
});
$('#hear-btn').addEventListener('pointerdown', () => {
  if (UA.engine.active && UA.engine.q) UA.engine.repeat();
  else if (UA.placeSay) UA.audio.speak(UA.placeSay);
});

/* dev panel — hidden unless ?dev=1 */
UA.dev = null;
if (/[?&]dev=1/.test(location.search)) {
  const panel = el(`<div id="dev-panel" data-testid="dev-panel" class="show">
    <header>UA dev</header>
    <div class="dev-body">
      <div id="dev-state">-</div>
      <div class="dev-row">
        <select id="dev-stage">${Object.keys(UA.STAGES).map(s => `<option>${s}</option>`).join('')}</select>
        <input id="dev-level" type="number" value="1" min="1" style="width:44px">
        <button data-testid="dev-jump" id="dev-jump">jump</button>
      </div>
      <div class="dev-row">
        <button data-testid="dev-bot-correct" id="dev-bot-c">bot✓</button>
        <button data-testid="dev-bot-wrong" id="dev-bot-w">bot✗</button>
        <button id="dev-bot-r">bot?</button>
        <button id="dev-bot-stop">stop</button>
        <select id="dev-speed"><option value="1600">1x</option><option value="700">2x</option><option value="300">5x</option></select>
      </div>
      <div class="dev-row">
        <button data-testid="dev-session-boundary" id="dev-session">+session</button>
        <button data-testid="dev-skip-celebrations" id="dev-skipcele">cele:on</button>
        <button data-testid="dev-tts-mute" id="dev-mute">tts:on</button>
        <button id="dev-gems">+50 gems</button>
        <button id="dev-stars">+3 stars</button>
      </div>
      <div id="dev-log"></div>
    </div>
  </div>`);
  document.body.appendChild(panel);
  panel.querySelector('header').addEventListener('pointerdown', () => panel.classList.toggle('collapsed'));
  const log = [];
  UA.dev = {
    skipCele: false, botTimer: null,
    log (m) {
      log.push(new Date().toISOString().slice(11, 19) + ' ' + m);
      if (log.length > 60) log.shift();
      const d = $('#dev-log'); if (d) d.textContent = log.slice(-14).join('\n');
      this.state();
    },
    state () {
      const E = UA.engine, S = UA.S;
      const d = $('#dev-state');
      if (d) d.textContent = `${current} ${E.stage ? E.stage.id + ' L' + E.levelOf(E.stage.id) : ''} ` +
        `streak:${E.streak} gems:${S.gems} stars:${UA.totalStars()} meter:${S.meter} sess:${S.sessions}`;
    },
  };
  $('#dev-jump').addEventListener('pointerdown', () => {
    const st = $('#dev-stage').value, lv = Math.max(1, +$('#dev-level').value || 1);
    UA.S.levels[st] = Math.min(lv, UA.STAGES[st].levels);
    UA.save();
    UA.engine.stop();
    UA.ui.showActivity(UA.zoneById(UA.STAGES[st].zone), UA.STAGES[st]);
    SCREENS[current] && SCREENS[current].classList.remove('show');
    SCREENS.activity.classList.add('show'); current = 'activity';
    UA.engine.start(UA.STAGES[st].zone, st);
    UA.dev.log('jump ' + st + ' L' + lv);
  });
  const bot = (mode) => {
    clearInterval(UA.dev.botTimer);
    UA.dev.botTimer = setInterval(() => {
      const E = UA.engine;
      if (!E.active || !E.q || E.locked) return;
      const wrongPick = mode === 'w' || (mode === 'r' && UA.rand(2) === 0);
      if (wrongPick) {
        const wrongEl = $$('#options-area .answer').find(b => b.dataset.opt !== String(E.q.correct));
        E.answer('__bot_wrong__', wrongEl || null);
      } else {
        const rightEl = $$('#options-area .answer').find(b => b.dataset.opt === String(E.q.correct));
        E.answer(E.q.correct, rightEl || null, { x: innerWidth / 2, y: innerHeight / 2 });
      }
      UA.dev.state();
    }, +$('#dev-speed').value);
  };
  $('#dev-bot-c').addEventListener('pointerdown', () => bot('c'));
  $('#dev-bot-w').addEventListener('pointerdown', () => bot('w'));
  $('#dev-bot-r').addEventListener('pointerdown', () => bot('r'));
  $('#dev-bot-stop').addEventListener('pointerdown', () => clearInterval(UA.dev.botTimer));
  $('#dev-session').addEventListener('pointerdown', () => { UA.S.sessions++; UA.save(); UA.dev.log('session -> ' + UA.S.sessions); });
  $('#dev-skipcele').addEventListener('pointerdown', (e) => {
    UA.dev.skipCele = !UA.dev.skipCele; e.target.textContent = 'cele:' + (UA.dev.skipCele ? 'off' : 'on');
  });
  $('#dev-mute').addEventListener('pointerdown', (e) => {
    UA.S.settings.voice = UA.S.settings.voice ? 0 : 1;
    UA.audio.setToggles(UA.S.settings); UA.save();
    e.target.textContent = 'tts:' + (UA.S.settings.voice ? 'on' : 'off');
  });
  $('#dev-gems').addEventListener('pointerdown', () => { UA.S.gems += 50; UA.save(); UA.ui.updateHUD(); UA.dev.state(); });
  $('#dev-stars').addEventListener('pointerdown', () => {
    // grant the next unmastered stage 3 stars (dev shortcut for unlock testing)
    const st = Object.keys(UA.STAGES).find(s => UA.STAGES[s].stars !== false && (UA.S.stars[s] || 0) < 3);
    if (st) { UA.S.stars[st] = 3; UA.save(); UA.dev.log('stars: ' + st + ' mastered'); UA.dev.state(); }
  });
}

/* ---------- boot entry from main.js ---------- */
UA.ui.begin = () => {
  UA.pacing.reset();
  if (UA.S.created) { enterMap(); return; }
  buildCreate();
  UA.go('create', { colour: '#FFD6E8', onArrive: () =>
    UA.audio.speak(`Hello! I am your unicorn! Tap a colour to paint me — any colour you like!`) });
};
})();
