/* ================= Unicorn Academy — places =================
   Sparkle Boutique, the toy corners (stable, kitchen, music meadow, dress-up
   mirror), the Memory Book and the grown-ups' corner. Toy corners are always
   open, never issue questions, never award gems (treats are SPENT here). */
'use strict';
(() => {
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
const P = UA.PALETTE;
const myUni = (extra = {}) => UA.unicornSVG(Object.assign({
  body: P.bodies[UA.S.uni.body], mane: P.manes[UA.S.uni.mane], cosmetics: UA.S.equipped }, extra));
/* item thumbnails zoom onto the accessory region so items are tellable apart */
const ANCHOR_VIEW = { head: '125 0 115 115', neck: '125 85 95 95', back: '45 50 115 115',
  horn: '155 0 85 85', tail: '5 125 95 95', feet: '65 175 130 70' };
const itemThumb = (item) => UA.unicornSVG({ body: P.bodies[UA.S.uni.body], mane: P.manes[UA.S.uni.mane],
  cosmetics: [item.id] }).replace('viewBox="0 0 240 250"', `viewBox="${ANCHOR_VIEW[item.anchor] || '0 0 240 250'}"`);

/* a full-screen place with a themed header band and a home-reachable body */
const placeScreen = (id, title, bg) => {
  let s = $('#screen-' + id);
  if (!s) { s = el(`<div class="screen" id="screen-${id}"></div>`); $('#app').appendChild(s); UA.registerScreen(id, s); }
  s.innerHTML = `<div style="position:absolute;inset:0;background:${bg}"></div>
    <div class="place-title">${title}</div>
    <div class="place-body" id="${id}-body"></div>`;
  return $('#' + id + '-body');
};
const openPlace = (id, colour, pt, build, sayLine) => {
  build();
  UA.go(id, { colour, from: pt, onArrive: () => {
    $('#home-btn').classList.add('show');
    $('#hear-btn').classList.add('show');
    $('#hud').classList.add('show');
    const meter = $('#rainbow-meter');
    if (meter) meter.style.display = 'none';   // the meter is a question-time thing
    UA.placeSay = sayLine;                       // hear-again on places repeats the welcome
    UA.audio.speak(sayLine);
  } });
};

/* ---------- boutique tiers ---------- */
const tierOpen = (t) => t === 0
  || (t === 1 && (UA.zoneUnlocked('word-garden') || UA.zoneUnlocked('puzzle-falls')))
  || (t === 2 && UA.zoneUnlocked('crystal-castle'))
  || (t === 3 && UA.S.royale.crowned);

UA.openBoutique = (pt) => {
  const S = UA.S;
  const build = () => {
    const body = placeScreen('boutique', 'Sparkle Boutique', 'linear-gradient(180deg,#FFE9F4,#FFF9F5 60%)');
    body.dataset.testid = '';
    const preview = el(`<div class="btq-preview"><div id="btq-uni">${myUni()}</div>
      <button class="big-btn" id="btq-keep" style="display:none;background:var(--mint)">Keep it!</button></div>`);
    body.appendChild(preview);
    const shelves = el('<div class="btq-shelves"></div>');
    body.appendChild(shelves);
    let trying = null;
    const refresh = () => {
      $('#btq-uni').innerHTML = UA.unicornSVG({ body: P.bodies[S.uni.body], mane: P.manes[S.uni.mane],
        cosmetics: trying ? S.equipped.filter(i => itemOf(i).anchor !== itemOf(trying).anchor).concat([trying]) : S.equipped });
      const kb = $('#btq-keep');
      kb.style.display = trying ? '' : 'none';
      if (trying) kb.innerHTML = `Keep it! &nbsp; ${itemOf(trying).royale ? UA.rainbowGemSVG() : UA.gemSVG()}<b style="font-size:24px">${itemOf(trying).price}</b>`;
    };
    const itemOf = (id) => UA.BOUTIQUE.find(b => b.id === id);
    const tiers = [['Everyday sparkles', 0], ['Fancy things', 1], ['Royal treasures', 2], ['Champion prizes', 3]];
    tiers.forEach(([name, t]) => {
      const open = tierOpen(t);
      const row = el(`<div class="btq-tier ${open ? '' : 'btq-locked'}"><h3>${name}${open ? '' : ' (still locked!)'}</h3><div class="btq-row"></div></div>`);
      UA.BOUTIQUE.filter(b => b.tier === t).forEach(item => {
        const owned = S.owned.includes(item.id);
        const equipped = S.equipped.includes(item.id);
        const card = el(`<button class="btq-item ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}" data-item="${item.id}">
          <span style="width:82%;height:66%;display:block">${itemThumb(item)}</span>
          <span class="btq-price">${owned ? (equipped ? 'wearing' : 'owned') :
            `${item.royale ? UA.rainbowGemSVG() : UA.gemSVG()} ${item.price}`}</span></button>`);
        card.addEventListener('pointerdown', () => {
          UA.audio.sfx.pop();
          if (!open) { UA.audio.speak('These treasures unlock later in our adventure!'); return; }
          if (owned) {                                    // owned: toggle equip (one per anchor)
            if (equipped) S.equipped = S.equipped.filter(i => i !== item.id);
            else S.equipped = S.equipped.filter(i => itemOf(i).anchor !== item.anchor).concat([item.id]);
            UA.save(); trying = null; build(); refreshTop();
            UA.audio.speak(equipped ? 'Popped it away!' : `Ooh, the ${item.name}! So stylish!`);
            return;
          }
          trying = item.id;                               // two-step: try on FREE first
          UA.audio.speak(`The ${item.name}! Trying it on... tap Keep It if you love it!`);
          refresh();
        });
        row.querySelector('.btq-row') ? null : null;
        $('.btq-row', row).appendChild(card);
      });
      shelves.appendChild(row);
    });
    const refreshTop = () => refresh();
    $('#btq-keep').addEventListener('pointerdown', () => {
      if (!trying) return;
      const item = itemOf(trying);
      const wallet = item.royale ? 'rainbowGems' : 'gems';
      if (S[wallet] < item.price) {
        UA.audio.speak(`We need ${item.price - S[wallet]} more ${item.royale ? 'rainbow gems' : 'gems'}! Let us play and earn them!`);
        UA.audio.sfx.boop();
        return;
      }
      S[wallet] -= item.price;
      S.owned.push(item.id);
      S.equipped = S.equipped.filter(i => itemOf(i).anchor !== item.anchor).concat([item.id]);
      const firstBuy = !S.firsts.includes('first-purchase');
      if (firstBuy) { S.firsts.push('first-purchase'); UA.memory.keep('first-purchase', `First boutique treasure: the ${item.name}!`); }
      UA.save();                                          // save BEFORE ceremony
      trying = null;
      UA.audio.sfx.fanfare();
      UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 3 }, 'confetti', 20);
      UA.ui.updateHUD();
      UA.audio.speak(firstBuy ? `Your very FIRST treasure, ${UA.S.name}! The ${item.name} is yours forever!`
        : `The ${item.name} is yours! Beautiful!`);
      build();
    });
    // treats & seeds: the bottomless sinks
    const sink = el(`<div class="btq-tier"><h3>Treats &amp; seeds</h3><div class="btq-row" id="btq-sink"></div></div>`);
    shelves.appendChild(sink);
    UA.TREATS.forEach(tr => {
      const card = el(`<button class="btq-item"><span style="width:64%;height:60%">${UA.sprite(tr.id)}</span>
        <span class="btq-price">${UA.gemSVG()} ${tr.price}</span></button>`);
      card.addEventListener('pointerdown', () => {
        if (S.gems < tr.price) { UA.audio.sfx.boop(); UA.audio.speak('Not enough gems yet — let us earn some more!'); return; }
        S.gems -= tr.price; UA.save(); UA.ui.updateHUD();
        UA.audio.sfx.munch();
        const u = $('#btq-uni .uni-rig');
        if (u) { u.classList.remove('leap'); void u.getBoundingClientRect(); u.classList.add('leap'); }
        UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 2.6 }, 'heart', 8);
        UA.audio.speak(UA.pick([`Mmmm! ${tr.name}! My favourite!`, `A ${tr.name}! Nom nom nom!`, `${tr.name}! You spoil me, ${S.name}!`]));
      });
      $('#btq-sink').appendChild(card);
    });
    const seed = el(`<button class="btq-item"><span style="width:64%;height:60%">${UA.sprite('flower')}</span>
      <span class="btq-price">${UA.gemSVG()} ${UA.SEED_PRICE}</span></button>`);
    seed.addEventListener('pointerdown', () => {
      if (S.gems < UA.SEED_PRICE) { UA.audio.sfx.boop(); UA.audio.speak('Seeds cost ten gems — nearly there!'); return; }
      S.gems -= UA.SEED_PRICE;
      S.garden.push({ day: UA.todayStr(), slot: S.garden.length % 8 });
      UA.save(); UA.ui.updateHUD();
      UA.audio.sfx.chime();
      UA.audio.speak('A magic seed! I planted it on our map — watch it bloom next time we play!');
    });
    $('#btq-sink').appendChild(seed);
  };
  openPlace('boutique', '#FFD6E8', pt, build, `Welcome to the Sparkle Boutique! Tap something to try it on — trying is always free!`);
};

/* ---------- the unicorn stable ---------- */
const GROWTH_AT = [8, 20];                       // starsSinceHatch + 2*treats thresholds
const growthOf = (b) => {
  const score = (UA.totalStars() - b.starsAtHatch) + b.treats * 2;
  return score >= GROWTH_AT[1] ? 2 : score >= GROWTH_AT[0] ? 1 : 0;
};
UA.openStable = (pt) => {
  const S = UA.S;
  let selected = null;
  const build = () => {
    const body = placeScreen('stable', 'The Unicorn Stable', 'linear-gradient(180deg,#FFE9D2,#F6E3C2 60%)');
    const barn = el(`<div class="stable-barn">
      <svg viewBox="0 0 800 200" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:100%;height:34%">
        <path d="M0 200 V70 L400 -40 L800 70 V200Z" fill="#E8B56D" stroke="#5C4A66" stroke-width="4"/>
        <path d="M0 70 L400 -40 L800 70" fill="none" stroke="#C88A4B" stroke-width="12"/></svg>
      <div class="stable-floor"></div></div>`);
    body.appendChild(barn);
    if (!S.babies.length) {
      barn.appendChild(el(`<div class="stable-nest">
        <svg viewBox="0 0 200 120" style="width:220px"><ellipse cx="100" cy="80" rx="86" ry="30" fill="#C89A6B" stroke="#5C4A66" stroke-width="4"/>
        <ellipse cx="100" cy="70" rx="64" ry="20" fill="#F6E3C2" stroke="#5C4A66" stroke-width="3"/>
        <path d="M40 74 Q70 60 100 72 Q130 58 160 74" stroke="#A8763E" stroke-width="5" fill="none"/></svg>
        <div class="stable-note">A cosy nest, all ready and waiting...</div></div>`));
    }
    S.babies.forEach((b, i) => {
      const g = growthOf(b);
      if (g > b.growth) {                         // growth moment: a small ceremony
        b.growth = g; UA.save();
        UA.memory.keep('grow-' + b.name + g, `${b.name} grew ${g === 1 ? 'into a young unicorn' : 'all the way up'}!`);
        UA.audio.sfx.fanfare();
        UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 2 }, 'confetti', 22);
        UA.audio.speak(`Look! All your love made ${b.name} grow ${g === 1 ? 'bigger' : 'ALL the way up'}!`);
      }
      const size = [90, 130, 170][b.growth];
      const n = S.babies.length;   // spread across the barn, centred when few
      const left = n === 1 ? 40 : 6 + i * (74 / Math.max(1, n - 1));
      const pen = el(`<button class="stable-baby" style="left:${left}%;bottom:${8 + (i % 3) * 14}%;width:${size}px" data-baby="${i}">
        <span class="stable-name">${b.name}</span>
        ${UA.unicornSVG({ body: b.body, mane: b.mane, baby: [1, .55, 0][b.growth] })}</button>`);
      let lastPet = 0;
      pen.addEventListener('pointerdown', (e) => {
        const now = Date.now();
        if (now - lastPet < 200) return;
        lastPet = now;
        selected = i;
        $$('.stable-baby', body).forEach(x => x.classList.remove('picked'));
        pen.classList.add('picked');
        const rig = pen.querySelector('.uni-rig');
        rig.classList.remove('nuzzle', 'shiver', 'leap');
        void rig.getBoundingClientRect();
        // one personality quirk each
        const q = b.quirk;
        if (q === 'sleepy') { rig.classList.add('sad-tilt'); UA.audio.speak(`${b.name}... zzz... oh! You woke ${b.name} up!`); }
        else if (q === 'sneezy') { rig.classList.add('shiver'); UA.audio.sfx.crack(); UA.fx.burst({ x: e.clientX, y: e.clientY }, 'spark', 10); UA.audio.speak(`Aaah... aaah... CHOO! Glitter everywhere!`); }
        else if (q === 'chaser') { rig.classList.add('leap'); UA.audio.speak(`${b.name} wants to chase your finger!`); }
        else { rig.classList.add(UA.pick(['nuzzle', 'leap', 'shiver'])); UA.audio.sfx.giggle(); UA.audio.speak(`${b.name}!`); }
        UA.fx.burst({ x: e.clientX, y: e.clientY }, 'heart', 5);
      });
      barn.appendChild(pen);
      // gentle wandering
      setInterval(() => {
        if (UA.currentScreen() !== 'stable' || !pen.isConnected) return;
        pen.style.left = Math.max(4, Math.min(84, parseFloat(pen.style.left) + (UA.rand(17) - 8))) + '%';
      }, 3800 + i * 700);
    });
    // treat tray: feeding HERE grows babies (this is what the sink is for)
    const tray = el(`<div class="stable-tray"><span class="stable-note">Feed a friend:</span><div class="tray-row"></div></div>`);
    UA.TREATS.slice(0, 4).forEach(tr => {
      const btn = el(`<button class="btq-item" style="width:104px;height:118px"><span style="width:60%;height:56%">${UA.sprite(tr.id)}</span>
        <span class="btq-price">${UA.gemSVG()} ${tr.price}</span></button>`);
      btn.addEventListener('pointerdown', () => {
        if (!S.babies.length) { UA.audio.speak('When a baby unicorn hatches, we can feed them here!'); return; }
        if (selected == null) { UA.audio.speak('Tap a unicorn first, then pick their treat!'); return; }
        if (S.gems < tr.price) { UA.audio.sfx.boop(); UA.audio.speak('Not enough gems — let us earn some more first!'); return; }
        const b = S.babies[selected];
        S.gems -= tr.price;
        b.treats++;
        UA.save(); UA.ui.updateHUD();
        UA.audio.sfx.munch();
        UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 2 }, 'heart', 8);
        UA.audio.speak(UA.pick([`${b.name} LOVES ${tr.name}!`, `Nom nom! ${b.name} is so happy!`, `${b.name} munches the ${tr.name} right up!`]));
        const g = growthOf(b);
        if (g > b.growth) setTimeout(build, 900);   // rebuild triggers the growth ceremony
      });
      $('.tray-row', tray).appendChild(btn);
    });
    body.appendChild(tray);
    if (!S.firsts.includes('barn-warming') && S.babies.length) {
      S.firsts.push('barn-warming'); UA.save();
      UA.audio.sfx.fanfare();
      setTimeout(() => UA.audio.speak('A barn-warming party! This stable is HOME now!'), 2600);
    }
  };
  openPlace('stable', '#FFE0CC', pt, build, S.babies.length
    ? `Welcome to the stable! Your unicorn family lives here. Tap someone to say hello!`
    : `This is the stable! One day, baby unicorns will live here. The nest is all ready!`);
};

/* ---------- unicorn kitchen: secretly vocabulary, openly a comedy machine ---------- */
const FOODS = ['apple', 'banana', 'strawberry', 'cupcake', 'watermelon', 'carrot', 'orange', 'icecream', 'pizza', 'egg', 'milk'];
UA.openKitchen = (pt) => {
  const build = () => {
    const body = placeScreen('kitchen', 'Unicorn Kitchen', 'linear-gradient(180deg,#FFE9F4,#FFF3C4 70%)');
    const layers = [];
    body.innerHTML = `
      <div class="fr-banner">Stack a silly cake!</div>
      <div class="kitchen-uni" id="kitchen-uni">${myUni()}</div>
      <div class="kitchen-cake" id="kitchen-cake"><div class="kitchen-plate"></div><div class="kitchen-hint"></div></div>
      <div class="kitchen-row" id="kitchen-row"></div>
      <button class="big-btn" id="kitchen-feed" style="background:var(--mint)">Feed ${UA.S.uni.name}!</button>`;
    const ingredients = UA.shuffle(FOODS).slice(0, 6).concat(UA.shuffle(['sock', 'fish', 'ball', 'drum']).slice(0, 2));
    UA.shuffle(ingredients).forEach(name => {
      const b = el(`<button class="option-card" style="--card-size:110px">${UA.sprite(name)}</button>`);
      b.addEventListener('pointerdown', () => {
        if (layers.length >= 4) { UA.audio.speak('The cake is TALL enough! Feed me!'); return; }
        layers.push(name);
        UA.audio.sfx.pop();
        UA.audio.speak(name, { interrupt: true });
        $('#kitchen-cake').appendChild(el(`<div class="cake-layer" style="bottom:${18 + (layers.length - 1) * 46}px">${UA.sprite(name)}</div>`));
      });
      $('#kitchen-row').appendChild(b);
    });
    $('#kitchen-feed').addEventListener('pointerdown', () => {
      if (!layers.length) { UA.audio.speak('Stack something yummy on the plate first!'); return; }
      const yuck = layers.filter(l => !FOODS.includes(l));
      const rig = $('#kitchen-uni .uni-rig');
      UA.audio.sfx.munch();
      rig.classList.remove('leap', 'shiver', 'sad-tilt');
      void rig.getBoundingClientRect();
      if (yuck.length) {
        rig.classList.add('shiver');
        UA.audio.speak(UA.pickFresh('kyuck', UA.KITCHEN_YUCK).replace('%ITEMS%', yuck.join(' and ')));
        UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 2.4 }, 'confetti', 14);
      } else {
        rig.classList.add('leap');
        UA.audio.speak(UA.pickFresh('kyum', UA.KITCHEN_YUM).replace('%ITEMS%', layers.join(' and ')).replace('%NAME%', UA.S.name));
        UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 2.4 }, 'heart', 12);
      }
      setTimeout(build, 2200);
    });
  };
  openPlace('kitchen', '#FFF3C4', pt, build, `The kitchen! Stack anything on the plate to make me a cake. ANYTHING. I trust you!`);
};

/* ---------- music meadow: flowers are pentatonic notes ---------- */
UA.openMusic = (pt) => {
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
  let recording = null, recStart = 0;
  const build = () => {
    const body = placeScreen('music', 'Music Meadow', 'linear-gradient(180deg,#D3ECFF,#D2F5DC 60%)');
    body.innerHTML = `<div class="music-row" id="music-row"></div>
      <div style="display:flex;gap:20px;justify-content:center">
        <button class="big-btn" id="music-rec">${UA.gen.butterfly(0, 0, 1.4)} Listen back</button>
      </div>`;
    PENTA.forEach((semi, i) => {
      const f = el(`<button class="music-flower" style="--d:${i * .12}s">${UA.gen ? '' : ''}
        <svg viewBox="0 0 100 120">${UA.gen.flower(50, 70, 26 + (i % 3) * 5, 5 + (i % 3), [P.rainbow[i % 6], '#FFD97A'])}</svg></button>`);
      f.addEventListener('pointerdown', () => {
        UA.audio.note(semi);
        f.classList.remove('music-pop'); void f.getBoundingClientRect(); f.classList.add('music-pop');
        if (recording) recording.push({ semi, t: Date.now() - recStart });
        UA.fx.burst({ x: f.getBoundingClientRect().left + 50, y: f.getBoundingClientRect().top + 30 }, 'spark', 3);
      });
      $('#music-row').appendChild(f);
    });
    recording = []; recStart = Date.now();
    $('#music-rec').addEventListener('pointerdown', () => {
      if (!recording.length) { UA.audio.speak('Tap some flowers first — then the butterfly sings your song back!'); return; }
      UA.audio.speak('Your song!');
      const notes = recording.slice(-24);
      const t0 = notes[0].t;
      notes.forEach(n => setTimeout(() => UA.audio.note(n.semi), 600 + (n.t - t0)));
      recording = []; recStart = Date.now();
    });
  };
  openPlace('music', '#D2F5DC', pt, build, `The music meadow! Every flower sings. Tap them and make a song — the butterfly remembers it!`);
};

/* ---------- dress-up mirror ---------- */
UA.openMirror = (pt) => {
  const S = UA.S;
  const build = () => {
    const body = placeScreen('mirror', 'Dress-up Mirror', 'linear-gradient(180deg,#E9DDFF,#D3ECFF 70%)');
    const poses = ['', 'leap', 'celebrate', 'nuzzle'];
    let pose = 0;
    body.innerHTML = `<div class="mirror-frame"><div id="mirror-uni">${myUni()}</div></div>
      <button class="big-btn" id="mirror-pose" style="background:var(--butter)">Strike a pose!</button>
      <div class="btq-row" id="mirror-items" style="justify-content:center"></div>`;
    const refresh = () => { $('#mirror-uni').innerHTML = myUni({ cls: poses[pose] }); };
    $('#mirror-pose').addEventListener('pointerdown', () => {
      pose = (pose + 1) % poses.length;
      UA.audio.sfx.pop();
      UA.audio.speak(UA.pick(['Ta-daa!', 'So fancy!', 'Ooh la la!', 'Fabulous!']));
      refresh();
    });
    if (!S.owned.length) {
      body.appendChild(el(`<div class="stable-note" style="display:flex;align-items:center;gap:10px">
        <span style="width:30px;height:30px;display:inline-block">${UA.sparkleSVG()}</span>Treasures from the boutique appear here to try on!</div>`));
    }
    S.owned.forEach(id => {
      const item = UA.BOUTIQUE.find(b => b.id === id);
      const card = el(`<button class="btq-item ${S.equipped.includes(id) ? 'equipped' : ''}" style="width:110px;height:110px">
        <span style="width:88%;height:88%;display:block">${itemThumb(item)}</span></button>`);
      card.addEventListener('pointerdown', () => {
        if (S.equipped.includes(id)) S.equipped = S.equipped.filter(i => i !== id);
        else S.equipped = S.equipped.filter(i => UA.BOUTIQUE.find(b => b.id === i).anchor !== item.anchor).concat([id]);
        UA.save();
        UA.audio.sfx.chime();
        build();
      });
      $('#mirror-items').appendChild(card);
    });
  };
  openPlace('mirror', '#E9DDFF', pt, build, `Mirror mirror! Tap your treasures to dress me up, then we strike a pose!`);
};

/* ---------- memory book ---------- */
UA.memory = {
  keep (id, line) {
    if (UA.S.memoryBook.some(k => k.id === id)) return;
    UA.S.memoryBook.push({ id, line, day: UA.todayStr() });
    if (UA.S.memoryBook.length > 60) UA.S.memoryBook.shift();
    UA.save();
  },
};
const PAGE_SIZE = 12;                                       // sticker slots per album page
UA.openBook = (pt, tab) => {
  const build = () => {
    const body = placeScreen('book', 'Memory Book', 'linear-gradient(180deg,#FFF3C4,#FFF9F5 60%)');
    const on = 'background:var(--butter);box-shadow:0 0 0 4px var(--gold),0 8px 0 var(--shadow)';
    const tabs = el(`<div style="display:flex;gap:14px">
      <button class="big-btn" id="tab-mem" style="font-size:22px;padding:12px 22px;${tab !== 'stickers' ? on : ''}">Memories</button>
      <button class="big-btn" id="tab-stk" style="font-size:22px;padding:12px 22px;${tab === 'stickers' ? on : ''}">Stickers</button></div>`);
    body.appendChild(tabs);
    $('#tab-mem', body).addEventListener('pointerdown', () => { tab = 'mem'; build(); });
    $('#tab-stk', body).addEventListener('pointerdown', () => { tab = 'stickers'; build(); UA.audio.speak('Your sticker album! One sticker for every round you finish!'); });
    if (tab === 'stickers') { buildStickers(body); return; }
    if (!UA.S.memoryBook.length) {
      body.appendChild(el(`<div class="stable-note" style="font-size:28px;display:flex;align-items:center;gap:10px">
        <span style="width:34px;height:34px;display:inline-block">${UA.sparkleSVG()}</span>Our adventures will be kept here!</div>`));
      body.appendChild(el(`<div style="width:200px">${myUni()}</div>`));
      return;
    }
    const list = el('<div class="book-list"></div>');
    UA.S.memoryBook.slice().reverse().forEach(k => {
      const row = el(`<button class="book-row"><span style="width:44px;height:44px;flex:none">${UA.sparkleSVG()}</span>
        <span>${k.line}</span></button>`);
      row.addEventListener('pointerdown', () => {           // replayable keepsake
        UA.audio.sfx.fanfare();
        UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 3 }, 'confetti', 18);
        UA.audio.speak(`Remember this? ${k.line}`);
      });
      list.appendChild(row);
    });
    body.appendChild(list);
  };
  openPlace('book', '#FFF3C4', pt, build, `Our memory book! Memories on one page, stickers on the other!`);
};

/* sticker album: a page per zone, silhouette slots for the uncollected */
const STICKER_ART = ['star', 'flower', 'butterfly', 'balloon', 'strawberry', 'shell', 'kite', 'cupcake', 'bee', 'bird', 'gift', 'ball'];
const buildStickers = (body) => {
  UA.ZONES.forEach(z => {
    const got = (UA.S.stickers[z.id] || []);
    const page = got.length ? got.slice(-(got.length % PAGE_SIZE || PAGE_SIZE)) : [];
    const fullPages = Math.floor(got.length / PAGE_SIZE);
    const sect = el(`<div style="width:100%;max-width:760px">
      <h3 style="color:var(--plum);margin:10px 4px">${z.name}${fullPages ? ` — ${fullPages} full page${fullPages > 1 ? 's' : ''}!` : ''}</h3>
      <div class="stk-grid" style="border-color:${z.col}"></div></div>`);
    const grid = $('.stk-grid', sect);
    for (let i = 0; i < PAGE_SIZE; i++) {
      const st = page[i];
      if (st) {
        grid.appendChild(el(`<div class="stk-slot got ${st.rare ? 'rare' : ''}">
          ${UA.sprite(STICKER_ART[(i + fullPages) % STICKER_ART.length])}
          ${st.rare ? `<span class="stk-rare">${UA.sparkleSVG()}</span>` : ''}</div>`));
      } else {
        grid.appendChild(el(`<div class="stk-slot"><span style="opacity:.22;filter:grayscale(1)">${UA.sprite(STICKER_ART[(i + fullPages) % STICKER_ART.length])}</span></div>`));
      }
    }
    body.appendChild(sect);
  });
};
/* page-completion celebration: fired by the engine when a page fills */
UA.stickerPageDone = (zoneId) => {
  const z = UA.zoneById(zoneId);
  UA.audio.sfx.fanfare();
  UA.fx.burst({ x: innerWidth / 2, y: innerHeight / 3 }, 'confetti', 26);
  UA.memory.keep('stkpage-' + zoneId + '-' + (UA.S.stickers[zoneId].length / PAGE_SIZE),
    `A whole sticker page of ${z.name} finished!`);
  UA.audio.speak(`WOW! You filled a whole sticker page for ${z.name}! A brand new page is ready!`);
};

/* ---------- grown-ups' corner: gate + dashboard ---------- */
UA.openParents = () => {
  const S = UA.S;
  const digits = UA.GATE_DIGITS();
  const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  let entered = [];
  const veil = el(`<div class="veil" style="display:flex;align-items:center;justify-content:center;z-index:49">
    <div class="ceremony-card" style="gap:12px">
      <div style="font-size:20px;color:var(--plum);font-weight:700">For grown-ups: tap ${digits.map(d => WORDS[d]).join(', then ')}</div>
      <div class="gate-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="gate-key" data-n="${n}">${n}</button>`).join('')}</div>
      <button class="gate-key" id="gate-cancel" style="width:auto;padding:0 22px">back to the game</button>
    </div></div>`);
  document.body.appendChild(veil);
  $('#gate-cancel', veil).addEventListener('pointerdown', () => veil.remove());
  $$('.gate-key[data-n]', veil).forEach(k => k.addEventListener('pointerdown', () => {
    entered.push(+k.dataset.n);
    if (entered.length < 3) return;
    if (entered.join() === digits.join()) { veil.remove(); showDashboard(); }
    else { entered = []; k.parentElement.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 250 }); }
  }));
  const showDashboard = () => {
    const zones = UA.ZONES.map(z => {
      const rows = z.stages.filter(id => UA.STAGES[id]).map(id => {
        const st = UA.STAGES[id];
        const h = (S.history[id] && S.history[id].answers) || [];
        const acc = h.length ? Math.round(100 * h.reduce((a, b) => a + b, 0) / h.length) : null;
        return `<tr><td>${st.skill}</td><td>L${S.levels[id] || 1}/${st.levels}</td>
          <td>${st.stars === false ? '—' : '★'.repeat(S.stars[id] || 0) + '☆'.repeat(3 - (S.stars[id] || 0))}</td>
          <td>${acc == null ? '—' : acc + '%'}</td></tr>`;
      }).join('');
      return `<h4>${z.name}</h4><table class="dash-table"><tr><th>skill</th><th>level</th><th>stars</th><th>recent accuracy</th></tr>${rows}</table>`;
    }).join('');
    const week = Object.entries(S.weekLog).slice(-7).map(([d, m]) => `${d.slice(5)}: ${Math.round(m)} min`).join(' · ') || 'no time logged yet';
    const review = UA.masteredStages().map(id => UA.STAGES[id].skill).join(', ') || 'none mastered yet';
    const d = el(`<div class="veil" style="z-index:49;overflow:auto;display:block;background:rgba(255,249,245,.98)">
      <div style="max-width:760px;margin:30px auto;padding:0 20px 60px;color:var(--plum);font-size:16px" id="dash">
        <h2>For grown-ups</h2>
        <p><b>${S.name || '—'}</b> · playing ${S.daysPlayed} day(s) · ${UA.totalStars()} stars · ${S.gems} gems ·
          lifetime accuracy ${S.answered ? Math.round(100 * S.correct / S.answered) : 0}% (${S.answered} answers)</p>
        <p><b>This week:</b> ${week}</p>
        <p><b>In review rotation (mastered):</b> ${review}</p>
        ${zones}
        <h4>Sound</h4>
        <label><input type="checkbox" id="tg-voice" ${S.settings.voice ? 'checked' : ''}> voice</label>
        <label><input type="checkbox" id="tg-sfx" ${S.settings.sfx ? 'checked' : ''}> effects</label>
        <label><input type="checkbox" id="tg-music" ${S.settings.music ? 'checked' : ''}> music</label>
        <label>volume <input type="range" id="tg-vol" min="0" max="1" step=".05" value="${S.settings.vol}"></label>
        <h4>Backup</h4>
        <p>Copy this code somewhere safe (Notes, email). Paste it back here on any device to restore
        all progress — iOS can clear website data when storage runs low.</p>
        <textarea id="dash-backup" readonly style="width:100%;height:64px;font-size:11px"></textarea>
        <button id="dash-copy" class="gate-key" style="width:auto;padding:0 18px">copy backup code</button>
        <p style="margin-top:10px">Restore: paste a backup code below, then tap restore.</p>
        <textarea id="dash-restore-in" style="width:100%;height:44px;font-size:11px"></textarea>
        <button id="dash-restore" class="gate-key" style="width:auto;padding:0 18px">restore from code</button>
        <h4>Reset</h4>
        <p>Hold the button for 3 seconds to erase ALL progress. This cannot be undone.</p>
        <button id="dash-reset" class="gate-key" style="width:auto;padding:0 18px;background:#FFB3B3">hold to reset everything</button>
        <p style="margin-top:26px;font-size:13px;opacity:.75">Artwork includes OpenMoji sprites (openmoji.org), CC BY-SA 4.0.<br>
        Tip: for fullscreen, use Add to Home Screen. To lock her in, use Guided Access (triple-click the top button).</p>
        <button id="dash-close" class="gate-key" style="width:auto;padding:0 22px;position:fixed;top:14px;right:14px">close</button>
      </div></div>`);
    document.body.appendChild(d);
    $('#dash-close', d).addEventListener('pointerdown', () => d.remove());
    const upd = () => {
      S.settings = { voice: +$('#tg-voice', d).checked, sfx: +$('#tg-sfx', d).checked,
        music: +$('#tg-music', d).checked, vol: +$('#tg-vol', d).value };
      UA.save();
      UA.audio.setToggles(S.settings);
    };
    ['tg-voice', 'tg-sfx', 'tg-music', 'tg-vol'].forEach(id => $('#' + id, d).addEventListener('change', upd));
    try { $('#dash-backup', d).value = btoa(unescape(encodeURIComponent(JSON.stringify(S)))); } catch (e) {}
    $('#dash-copy', d).addEventListener('pointerdown', () => {
      const ta = $('#dash-backup', d);
      ta.select(); ta.setSelectionRange(0, 999999);
      try { document.execCommand('copy'); } catch (e) {}
      try { navigator.clipboard && navigator.clipboard.writeText(ta.value); } catch (e) {}
      $('#dash-copy', d).textContent = 'copied!';
      setTimeout(() => { const b = $('#dash-copy', d); if (b) b.textContent = 'copy backup code'; }, 1500);
    });
    $('#dash-restore', d).addEventListener('pointerdown', () => {
      try {
        const parsed = JSON.parse(decodeURIComponent(escape(atob($('#dash-restore-in', d).value.trim()))));
        if (!parsed || typeof parsed.v !== 'number') throw new Error('bad');
        UA.S = parsed;
        UA.save();
        location.reload();
      } catch (e) {
        $('#dash-restore', d).textContent = 'that code did not work';
        setTimeout(() => { const b = $('#dash-restore', d); if (b) b.textContent = 'restore from code'; }, 2000);
      }
    });
    let holdT = null;
    const rb = $('#dash-reset', d);
    rb.addEventListener('pointerdown', () => {
      rb.textContent = 'keep holding...';
      holdT = setTimeout(() => {
        UA.resetAll();
        location.reload();
      }, 3000);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => rb.addEventListener(ev, () => {
      clearTimeout(holdT); rb.textContent = 'hold to reset everything';
    }));
  };
};
})();
