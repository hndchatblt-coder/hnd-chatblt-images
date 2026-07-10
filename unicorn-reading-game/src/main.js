// Unicorn Reading Game — main scene & gameplay.
//
// Goal: help a child take the step from "sounding out single letters" to
// BLENDING those sounds into a word. Each round shows a CVC word as letter
// cards. The child taps the cards left-to-right, hearing each pure sound, then
// the cards slide together, the whole word is spoken, and a unicorn celebrates
// with the matching picture.
//
// Built with three.js (vendored locally so the installed PWA works offline).

import * as THREE from 'three';
import {
  WORDS, STAGES, ALPHABET, FRIENDS, friendById,
  COSMETICS, cosmeticById, GOAL_SIZE, COIN_REWARDS,
} from './content.js';
import { AudioManager } from './audio.js';
import { loadProgress, saveProgress, resetProgress, bumpItem, itemAccuracy } from './progress.js';
import { unicornCanvas, coinCanvas, COSMETIC_ART, MANES } from './art.js';

// ----------------------------------------------------------------------------
// Tiny tween engine (no dependencies). Animates numeric properties of an
// object (e.g. mesh.position, mesh.scale, material) toward target values.
// ----------------------------------------------------------------------------
const tweens = [];
const easeOutCubic = p => 1 - Math.pow(1 - p, 3);
const easeInOutQuad = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const easeOutBack = p => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

function to(obj, props, duration, opts = {}) {
  tweens.push({
    obj, props, start: {},
    duration: Math.max(0.0001, duration),
    ease: opts.ease || easeOutCubic,
    delay: opts.delay || 0,
    elapsed: 0, captured: false,
    onComplete: opts.onComplete,
  });
}

function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    if (tw.delay > 0) { tw.delay -= dt; if (tw.delay > 0) continue; }
    if (!tw.captured) {
      for (const k in tw.props) tw.start[k] = tw.obj[k];
      tw.captured = true;
    }
    tw.elapsed += dt;
    const p = Math.min(1, tw.elapsed / tw.duration);
    const e = tw.ease(p);
    for (const k in tw.props) tw.obj[k] = tw.start[k] + (tw.props[k] - tw.start[k]) * e;
    if (p >= 1) {
      tweens.splice(i, 1);
      if (tw.onComplete) tw.onComplete();
    }
  }
}

// ----------------------------------------------------------------------------
// Texture helpers (everything is drawn to a canvas — no image assets needed).
// ----------------------------------------------------------------------------
const TILE_COLORS = ['#ff8fd4', '#9d8cff', '#5fc8ff', '#ffd166', '#7ee081', '#ff9e6d'];
const CAPS_KEY = 'unicorn-reading-caps';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeTileTexture(letter, color) {
  const S = 320;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const m = 18;
  // soft shadow
  ctx.fillStyle = 'rgba(80,40,90,0.18)';
  roundRect(ctx, m + 6, m + 12, S - 2 * m, S - 2 * m, 56);
  ctx.fill();
  // card
  ctx.fillStyle = color;
  roundRect(ctx, m, m, S - 2 * m, S - 2 * m, 56);
  ctx.fill();
  // glossy top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundRect(ctx, m + 16, m + 16, S - 2 * m - 32, (S - 2 * m) * 0.42, 44);
  ctx.fill();
  // letter — a bold dark keyline is stroked FIRST, then the white glyph is
  // filled on top, so the letter keeps crisp, high-contrast edges on every card
  // colour (including the pale yellow and green). A soft shadow under the
  // outline lifts the letter off the card.
  const lx = S / 2, ly = S / 2 + 14;
  ctx.font = '900 214px "Baloo 2", "Comic Sans MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.save();
  ctx.shadowColor = 'rgba(50,15,60,0.4)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  ctx.strokeStyle = '#4a1d55';
  ctx.lineWidth = 24;
  ctx.strokeText(letter, lx, ly);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(letter, lx, ly);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function makeEmojiTexture(emoji, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.font = `${Math.floor(size * 0.8)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#ffe1f6');
  g.addColorStop(0.45, '#e9d9ff');
  g.addColorStop(1, '#cfeeff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  return new THREE.CanvasTexture(c);
}

function makeRainbowTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S; c.height = S / 2;
  const ctx = c.getContext('2d');
  const bands = ['#ff6b6b', '#ffa94d', '#ffe066', '#8ce99a', '#74c0fc', '#b197fc'];
  ctx.lineWidth = 26;
  bands.forEach((col, i) => {
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.42 - i * 27, Math.PI, 2 * Math.PI);
    ctx.stroke();
  });
  return new THREE.CanvasTexture(c);
}

function makeCloudTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S * 0.6;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const blobs = [[80, 100, 50], [130, 80, 60], [180, 105, 45], [110, 120, 55]];
  for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  return new THREE.CanvasTexture(c);
}

// ----------------------------------------------------------------------------
// Game
// ----------------------------------------------------------------------------
class Game {
  constructor() {
    this.audio = new AudioManager();
    this.state = 'start';        // 'start' | 'playing' | 'celebrating'
    this.progress = loadProgress();
    this.capsMode = localStorage.getItem(CAPS_KEY) === 'true';
    this.lettersHeard = new Set(this.progress.lettersHeard);
    // Word order is per-stage: a shuffled run through the current stage's words.
    this.order = [];
    this.orderPos = -1;
    this._orderStage = null;
    this.tiles = [];
    this.particles = [];
    this.stageJustCompleted = false;
    this.clock = new THREE.Clock();

    this._initRenderer();
    this._initScene();
    this._initDOM();
    this._bindEvents();
    this._loop();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('scene').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = makeSkyTexture();
    this.camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
    this.camera.position.z = 10;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
  }

  _initScene() {

    // Rainbow (top)
    const rainbow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeRainbowTexture(), transparent: true, opacity: 0.85 }));
    rainbow.scale.set(11, 5.5, 1);
    rainbow.position.set(0, 4.0, -4);
    this.scene.add(rainbow);

    // Clouds
    const cloudTex = makeCloudTexture();
    this.clouds = [];
    for (let i = 0; i < 4; i++) {
      const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.9 }));
      const s = 2 + Math.random() * 1.5;
      cl.scale.set(s, s * 0.6, 1);
      cl.position.set(-7 + Math.random() * 14, 1 + Math.random() * 4, -3);
      cl.userData.speed = 0.2 + Math.random() * 0.3;
      this.scene.add(cl);
      this.clouds.push(cl);
    }

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 8),
      new THREE.MeshBasicMaterial({ color: 0x9be7a0 })
    );
    ground.position.set(0, -8.5, -2);
    this.scene.add(ground);

    // Buddy character — the drawn unicorn (or a collected friend), wearing
    // whatever cosmetics she has equipped from Rosie's shop.
    this.unicorn = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._buddyTexture(), transparent: true }));
    this.unicorn.scale.set(3, 3, 1);
    this.unicorn.position.set(0, 3.3, 0);
    this.scene.add(this.unicorn);

    // Equipped cosmetic overlays, pinned to the buddy in the render loop.
    this.cosHead = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    this.cosHead.scale.set(1.1, 1.1, 1);
    this.scene.add(this.cosHead);
    this.cosBack = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    this.cosBack.scale.set(2.1, 2.1, 1);
    this.scene.add(this.cosBack);
    this._applyEquipped();

    // Reward picture (hidden until a word is blended)
    this.reward = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeEmojiTexture('⭐', 256), transparent: true, opacity: 0 }));
    this.reward.scale.set(0.01, 0.01, 1);
    this.reward.position.set(0, 1.2, 1);
    this.scene.add(this.reward);

    this.tileGroup = new THREE.Group();
    this.scene.add(this.tileGroup);
  }

  // The buddy's texture: the drawn storybook unicorn for the unicorn friend,
  // emoji art for the other collectibles (until they get drawn portraits).
  _buddyTexture() {
    if (this.progress.buddy === 'friend.unicorn') {
      const t = new THREE.CanvasTexture(unicornCanvas('pink'));
      t.anisotropy = 4;
      return t;
    }
    const f = friendById(this.progress.buddy);
    return makeEmojiTexture(f ? f.emoji : '🦄', 256);
  }

  // Show/hide the cosmetic overlay sprites to match what's equipped.
  _applyEquipped() {
    const eq = this.progress.equipped || {};
    for (const [slot, sprite] of [['head', this.cosHead], ['back', this.cosBack]]) {
      const id = eq[slot];
      const draw = id && COSMETIC_ART[id];
      if (draw) {
        if (sprite.material.map) sprite.material.map.dispose();
        const t = new THREE.CanvasTexture(draw());
        t.anisotropy = 4;
        sprite.material.map = t;
        sprite.material.opacity = 1;
      } else {
        sprite.material.opacity = 0;
      }
      sprite.material.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------------
  // The single reward choke-point: every correct action earns coins here.
  // Grants are applied immediately (so racing ahead never loses them) and the
  // HUD pops; celebrations stay the caller's job.
  // ------------------------------------------------------------------------
  _grant(kind) {
    const amount = COIN_REWARDS[kind] || 0;
    if (!amount) return 0;
    this.progress.coins += amount;
    this.progress.starsEarned += amount;
    saveProgress(this.progress);
    this._updateCoinHud();
    return amount;
  }

  _spend(amount) {
    if (this.progress.coins < amount) return false;
    this.progress.coins -= amount;
    saveProgress(this.progress);
    this._updateCoinHud();
    return true;
  }

  _updateCoinHud() {
    this.el.coins.textContent = String(this.progress.coins);
    this._pop(this.el.coins.parentElement);
  }

  // The next friend not yet owned (unlock order = FRIENDS order). Idempotent:
  // owning is set-membership by id, so re-completing a stage can't double-grant.
  _unlockNextFriend() {
    const next = FRIENDS.find(f => !this.progress.friends.includes(f.id));
    if (!next) return null;
    this.progress.friends.push(next.id);
    saveProgress(this.progress);
    this._renderCollection();
    return next;
  }

  _initDOM() {
    this.el = {
      start: document.getElementById('start-screen'),
      hud: document.getElementById('hud'),
      coins: document.getElementById('coin-count'),
      coinIcon: document.getElementById('coin-icon'),
      mute: document.getElementById('mute-btn'),
      replay: document.getElementById('replay-btn'),
      next: document.getElementById('next-btn'),
      hint: document.getElementById('hint'),
      answers: document.getElementById('answers'),
      questTitle: document.getElementById('quest-title'),
      questSlots: document.getElementById('quest-slots'),
      quest: document.getElementById('quest'),
      mapScreen: document.getElementById('map-screen'),
      mapGrid: document.getElementById('map-grid'),
      mapClose: document.getElementById('map-close'),
      collectionBtn: document.getElementById('collection-btn'),
      collectionCount: document.getElementById('collection-count'),
      collectionScreen: document.getElementById('collection-screen'),
      collectionGrid: document.getElementById('collection-grid'),
      collectionClose: document.getElementById('collection-close'),
      resetBtn: document.getElementById('reset-btn'),
      friendToast: document.getElementById('friend-toast'),
      // Rosie's shop
      shopBtn: document.getElementById('shop-btn'),
      shopScreen: document.getElementById('shop-screen'),
      shopClose: document.getElementById('shop-close'),
      shopCoins: document.getElementById('shop-coin-count'),
      shopKeeper: document.getElementById('shop-keeper'),
      shopPreview: document.getElementById('shop-preview'),
      shopGrid: document.getElementById('shop-grid'),
      shopWish: document.getElementById('shop-wish'),
      // Parent corner (press-and-hold gate)
      parentBtn: document.getElementById('parent-btn'),
      parentScreen: document.getElementById('parent-screen'),
      parentClose: document.getElementById('parent-close'),
      parentStudio: document.getElementById('parent-studio'),
      parentVoice: document.getElementById('parent-voice'),
      parentGuide: document.getElementById('parent-guide'),
      settingsScreen: document.getElementById('settings-screen'),
      settingsClose: document.getElementById('settings-close'),
      studioList: document.getElementById('studio-list'),
      studioProgress: document.getElementById('studio-progress'),
      tabSounds: document.getElementById('tab-sounds'),
      tabWords: document.getElementById('tab-words'),
      voiceScreen: document.getElementById('voice-screen'),
      voiceSelect: document.getElementById('voice-select'),
      voiceRate: document.getElementById('voice-rate'),
      voicePitch: document.getElementById('voice-pitch'),
      voiceTry: document.getElementById('voice-try'),
      voiceClose: document.getElementById('voice-close'),
      guideBtn: document.getElementById('guide-btn'),
      backupBtn: document.getElementById('backup-btn'),
      restoreBtn: document.getElementById('restore-btn'),
      restoreFile: document.getElementById('restore-file'),
      guideScreen: document.getElementById('guide-screen'),
      guideProgress: document.getElementById('guide-progress'),
      guideBig: document.getElementById('guide-big'),
      guidePrompt: document.getElementById('guide-prompt'),
      guideMic: document.getElementById('guide-mic'),
      guidePrev: document.getElementById('guide-prev'),
      guidePlay: document.getElementById('guide-play'),
      guideNext: document.getElementById('guide-next'),
      guideDone: document.getElementById('guide-done'),
      capsToggle: document.getElementById('caps-toggle'),
      learnLettersBtn: document.getElementById('learn-letters-btn'),
      mapLettersBtn: document.getElementById('map-letters-btn'),
      lettersScreen: document.getElementById('letters-screen'),
      ltTabExplore: document.getElementById('lt-tab-explore'),
      ltTabMatch: document.getElementById('lt-tab-match'),
      ltNote: document.getElementById('lt-note'),
      ltExplore: document.getElementById('lt-explore'),
      ltGrid: document.getElementById('lt-grid'),
      ltMatch: document.getElementById('lt-match'),
      ltPrompt: document.getElementById('lt-prompt'),
      ltChoices: document.getElementById('lt-choices'),
      ltFeedback: document.getElementById('lt-feedback'),
      ltClose: document.getElementById('lt-close'),
      ltReward: document.querySelector('.lt-reward'),
      ltCoinCount: document.getElementById('lt-coin-count'),
      ltCoinIcon: document.getElementById('lt-coin-icon'),
      ltBuddy: document.getElementById('lt-buddy'),
    };
    // Draw the coin icon into every coin badge (one shared artwork).
    for (const cvs of [this.el.coinIcon, this.el.ltCoinIcon, document.getElementById('shop-coin-icon')]) {
      if (cvs) cvs.getContext('2d').drawImage(coinCanvas(128), 0, 0, cvs.width, cvs.height);
    }
    this.el.coins.textContent = String(this.progress.coins);
    // The start screen greets her with HER buddy, not a generic unicorn.
    const startBuddy = document.getElementById('start-buddy');
    if (startBuddy) {
      if (this.progress.buddy === 'friend.unicorn') {
        const c = unicornCanvas('pink'); c.style.width = c.style.height = '120px';
        startBuddy.replaceChildren(c);
      } else {
        const f = friendById(this.progress.buddy);
        startBuddy.textContent = f ? f.emoji : '🦄';
      }
    }
    this._renderStage();
    this._renderCollection();
  }

  // The stage (vowel family) she is currently playing, by id — never by index.
  get stage() {
    return STAGES.find(s => s.id === this.progress.currentStage) || STAGES[0];
  }

  // Build the goal banner: the stage name (tap to open the map) + a row of
  // tokens to fill, one per word read toward completing the stage.
  _renderStage() {
    const s = this.stage;
    this.el.questTitle.textContent = `${s.token} ${s.label} ▾`;
    this.el.questSlots.innerHTML = '';
    this.slotEls = [];
    for (let i = 0; i < GOAL_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const filled = i < this.progress.stageProgress;
      slot.textContent = filled ? s.token : '';
      if (filled) slot.classList.add('filled');
      this.el.questSlots.appendChild(slot);
      this.slotEls.push(slot);
    }
  }

  // The reading-journey map: every stage shown as done ✓ / playing ▶ / to-come.
  // A stage is reachable once the one before it is cleared.
  _renderMap() {
    this.el.mapGrid.innerHTML = '';
    const cleared = this.progress.clearedStages;
    STAGES.forEach((s, i) => {
      const done = cleared.includes(s.id);
      // A stage opens when the one before it is cleared (the first is open).
      const reached = i === 0 || cleared.includes(STAGES[i - 1].id) || done;
      const current = s.id === this.progress.currentStage;
      const cell = document.createElement('div');
      cell.className = 'map-cell' + (reached ? '' : ' locked') + (current ? ' current' : '') + (done ? ' done' : '');
      cell.innerHTML = `
        <div class="map-token">${reached ? s.token : '🔒'}</div>
        <div class="map-label">${s.label}</div>
        <div class="map-focus">${s.focus}</div>
        <div class="map-badge">${done ? '✓' : current ? '▶' : ''}</div>`;
      if (reached) cell.addEventListener('click', () => this._selectStage(s.id));
      this.el.mapGrid.appendChild(cell);
    });
  }

  _openMap() {
    this._renderMap();
    this.el.mapScreen.classList.remove('hidden');
  }

  _closeMap() { this.el.mapScreen.classList.add('hidden'); }

  // Jump to a reached stage from the map and start a fresh word from it.
  _selectStage(id) {
    const idx = STAGES.findIndex(s => s.id === id);
    if (idx < 0) return;
    const reached = idx === 0 || this.progress.clearedStages.includes(STAGES[idx - 1].id) || this.progress.clearedStages.includes(id);
    if (!reached) return;
    this.progress.currentStage = id;
    this.progress.stageProgress = 0;
    this.stageJustCompleted = false;
    saveProgress(this.progress);
    this._renderStage();
    this._closeMap();
    this.orderPos = -1;
    this._orderStage = null; // force a reshuffle for the new stage
    this.nextWord();
  }

  // --------------------------------------------------------------------------
  // Learn the Letters (alphabet foundation): meet each sound + match cases.
  // A self-contained mode; it never touches the blending game's state.
  // --------------------------------------------------------------------------
  async _openLetters() {
    this.audio.unlock();
    this._closeMap();
    // Which letter sounds have been recorded in the parent's voice? Sound-based
    // rounds only use these, so she never has to act on a wrong robot sound.
    try {
      const keys = await this.audio.recordedKeys();
      this._recordedLetters = new Set(
        ALPHABET.filter(a => keys.has(this.audio.recKey('phoneme', a.letter))).map(a => a.letter)
      );
    } catch (_) { this._recordedLetters = new Set(); }
    this._updateLettersReward();
    this._setLettersTab('explore');
    this.el.lettersScreen.classList.remove('hidden');
  }

  // Keep the letters screen's coins/buddy in sync with the rest of the world
  // so the mode feels part of the same adventure, not a side room.
  _updateLettersReward() {
    this.el.ltCoinCount.textContent = String(this.progress.coins);
    const f = friendById(this.progress.buddy);
    this.el.ltBuddy.textContent = f ? f.emoji : '🦄';
  }

  // A correct letter action earns coins through the same choke-point as the
  // word game — one economy everywhere. The buddy badge cheers with her.
  _letterReward(kind) {
    this._grant(kind);
    this._updateLettersReward();
    this._pop(this.el.ltReward);
    this._pop(this.el.ltBuddy);
  }

  _closeLetters() { this.el.lettersScreen.classList.add('hidden'); }

  _saveLettersHeard() {
    this.progress.lettersHeard = [...this.lettersHeard];
    saveProgress(this.progress);
  }

  _setLettersTab(tab) {
    this._lettersTab = tab;
    const explore = tab === 'explore';
    this.el.ltTabExplore.classList.toggle('active', explore);
    this.el.ltTabMatch.classList.toggle('active', !explore);
    this.el.ltExplore.classList.toggle('hidden', !explore);
    this.el.ltMatch.classList.toggle('hidden', explore);
    if (explore) {
      this._renderLettersExplore();
    } else {
      this.el.ltNote.innerHTML = 'Listen and look — tap the letter that matches!';
      this._lettersNextMatch();
    }
  }

  // Explore: a grid of every letter (both shapes + a picture). Tap to hear the
  // pure sound; a counter fills as she meets each one.
  _renderLettersExplore() {
    this.el.ltGrid.innerHTML = '';
    ALPHABET.forEach((it) => {
      const cell = document.createElement('button');
      cell.className = 'lt-cell' + (this.lettersHeard.has(it.letter) ? ' heard' : '');
      cell.innerHTML = `<span class="lt-pair">${it.letter.toUpperCase()}${it.letter}</span><span class="lt-emoji">${it.emoji}</span>`;
      cell.addEventListener('click', () => this._lettersTapExplore(cell, it));
      this.el.ltGrid.appendChild(cell);
    });
    this._updateLettersNote();
  }

  _updateLettersNote() {
    const n = this.lettersHeard.size;
    this.el.ltNote.innerHTML = `Tap a letter to hear its sound. You've met <b>${n}</b> of ${ALPHABET.length} sounds!`;
  }

  _lettersTapExplore(cell, it) {
    this.audio.playPhoneme(it.letter);
    this._pop(cell);
    if (!this.lettersHeard.has(it.letter)) {
      this.lettersHeard.add(it.letter);
      this._saveLettersHeard();
      cell.classList.add('heard');
      this._updateLettersNote();
      this._letterReward('sound'); // meeting a brand-new sound earns a coin
    }
  }

  // Match game: alternate "find the little/BIG letter" (case) with "which letter
  // says this?" (sound). Correct → chime + praise; wrong → gentle retry.
  _lettersNextMatch() {
    // Only offer a sound round if the target's sound is recorded in your voice —
    // otherwise the robot pronunciation confuses her. With nothing recorded yet,
    // every round is case-matching (which needs no audio and is her real struggle).
    const recorded = this._recordedLetters && this._recordedLetters.size ? this._recordedLetters : null;
    const kind = (recorded && Math.random() < 0.5) ? 'sound' : 'case';
    const pool = kind === 'sound' ? ALPHABET.filter(a => recorded.has(a.letter)) : ALPHABET;
    // The lite learning brain: most of the time, practise her weakest letters
    // (lowest accuracy, unseen first); sometimes roam free so it stays fresh.
    let target;
    if (Math.random() < 0.6) {
      const scored = pool
        .filter(a => a !== this._ltLastTarget)
        .map(a => ({ a, acc: itemAccuracy(this.progress, 'l.' + a.letter) }))
        .sort((x, y) => (x.acc ?? -1) - (y.acc ?? -1)); // never-tried (null) first
      const weakest = scored.slice(0, Math.max(3, scored.length >> 2));
      target = weakest[(Math.random() * weakest.length) | 0]?.a;
    }
    if (!target) {
      do { target = pool[(Math.random() * pool.length) | 0]; }
      while (pool.length > 1 && target === this._ltLastTarget);
    }
    this._ltLastTarget = target;
    this._ltTarget = target;
    this._ltKind = kind;
    this._ltLocked = false;
    this.el.ltFeedback.textContent = '';

    // Distractors: three other random letters.
    const others = shuffle(ALPHABET.filter(a => a !== target)).slice(0, 3);
    const choices = shuffle([target, ...others]);

    // For "case" we show the BIG letter and ask for the small one (or vice
    // versa); choices render in the opposite case. For "sound" choices are lowercase.
    const askBig = Math.random() < 0.5;
    if (kind === 'case') {
      this.el.ltPrompt.innerHTML =
        `<div class="lt-big">${askBig ? target.letter.toUpperCase() : target.letter}</div>` +
        `<div>Find the ${askBig ? 'little' : 'BIG'} letter!</div>`;
    } else {
      this.el.ltPrompt.innerHTML =
        `<button class="lt-say" aria-label="Hear the sound">🔊</button>` +
        `<div>Which letter says this sound?</div>`;
      this.el.ltPrompt.querySelector('.lt-say').addEventListener('click', () => this.audio.playPhoneme(target.letter));
    }

    this.el.ltChoices.innerHTML = '';
    choices.forEach((it) => {
      const btn = document.createElement('button');
      btn.className = 'lt-choice';
      // case: show opposite case to the prompt; sound: show lowercase.
      btn.textContent = kind === 'case'
        ? (askBig ? it.letter : it.letter.toUpperCase())
        : it.letter;
      btn.addEventListener('click', () => this._lettersChoose(btn, it, target, kind));
      this.el.ltChoices.appendChild(btn);
    });

    if (kind === 'sound') setTimeout(() => this.audio.playPhoneme(target.letter), 250);
  }

  _lettersChoose(btn, it, target, kind) {
    if (this._ltLocked) return;
    bumpItem(this.progress, 'l.' + target.letter, it === target);
    if (it === target) {
      this._ltLocked = true;
      btn.classList.add('correct');
      this.audio.chime();
      if (!this.lettersHeard.has(target.letter)) { this.lettersHeard.add(target.letter); }
      this._saveLettersHeard(); // also persists the item stats bumped above
      this.el.ltFeedback.textContent = 'Yes! 🪙';
      this._letterReward('letter');
      setTimeout(() => this.audio.praise(), 200);
      setTimeout(() => { if (!this.el.lettersScreen.classList.contains('hidden')) this._lettersNextMatch(); }, 1100);
    } else {
      btn.classList.add('wrong');
      this.audio.nope();
      setTimeout(() => btn.classList.remove('wrong'), 500);
      this.el.ltFeedback.textContent = 'Try again 👂';
      this.audio.playPhoneme(target.letter); // re-teach the target sound
    }
  }

  _renderCollection() {
    this.el.collectionCount.textContent = String(this.progress.friends.length);
    this.el.collectionGrid.innerHTML = '';
    FRIENDS.forEach((f) => {
      const owned = this.progress.friends.includes(f.id);
      const cell = document.createElement('div');
      cell.className = 'friend-cell' + (owned ? '' : ' locked') + (owned && f.id === this.progress.buddy ? ' buddy' : '');
      cell.textContent = owned ? f.emoji : '❔';
      if (owned) cell.addEventListener('click', () => this._setBuddy(f.id));
      this.el.collectionGrid.appendChild(cell);
    });
  }

  // Wipe coins/friends/stage/buddy and begin again. Recordings are kept.
  // Parent-gated (lives in the parent corner), so a text confirm is fine here.
  _resetProgress() {
    if (!window.confirm('Start over? This clears coins, friends and progress so you begin fresh. (Your recorded sounds are kept.)')) return;
    this.progress = resetProgress();
    this.lettersHeard = new Set();
    this._updateCoinHud();
    this.unicorn.material.map.dispose();
    this.unicorn.material.map = this._buddyTexture();
    this._applyEquipped();
    this.stageJustCompleted = false;
    this.orderPos = -1;
    this._orderStage = null;
    this._renderStage();
    this._renderCollection();
    this.el.collectionScreen.classList.add('hidden');
    this.el.parentScreen.classList.add('hidden');
    this.nextWord();
  }

  // Swap the on-screen character for a collected friend. The collection closes
  // so she SEES the new buddy hop — the confirmation used to play hidden
  // behind the overlay.
  _setBuddy(id) {
    if (!this.progress.friends.includes(id)) return;
    this.progress.buddy = id;
    saveProgress(this.progress);
    this.unicorn.material.map.dispose();
    this.unicorn.material.map = this._buddyTexture();
    this._renderCollection();
    this.el.collectionScreen.classList.add('hidden');
    this._unicornCheer();
    this.audio.chime();
  }

  // --------------------------------------------------------------------------
  // Rosie's shop — spend coins on cosmetics for the buddy. Everything reads
  // visually: green ring = can buy now, dimmed + price = keep saving (tap to
  // wish for it), sparkle badge = already owned (tap to wear / take off).
  // --------------------------------------------------------------------------
  _openShop() {
    this.audio.unlock();
    if (!this._keeperDrawn) {
      const c = unicornCanvas('lavender', { apron: true });
      c.className = 'keeper-art';
      this.el.shopKeeper.replaceChildren(c);
      this._keeperDrawn = true;
    }
    this._renderShop();
    this.el.shopScreen.classList.remove('hidden');
  }

  _closeShop() { this.el.shopScreen.classList.add('hidden'); }

  // Composite preview: her buddy wearing what's equipped, so a purchase shows
  // its effect instantly, inside the shop.
  _renderShopPreview() {
    const S = 300;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    const eq = this.progress.equipped || {};
    const drawCos = (id, dx, dy, ds) => {
      const draw = id && COSMETIC_ART[id];
      if (draw) x.drawImage(draw(), dx, dy, ds, ds);
    };
    drawCos(eq.back, S * 0.18, S * 0.3, S * 0.68);
    if (this.progress.buddy === 'friend.unicorn') {
      x.drawImage(unicornCanvas('pink'), S * 0.08, S * 0.12, S * 0.84, S * 0.84);
    } else {
      const f = friendById(this.progress.buddy);
      x.font = `${S * 0.55}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(f ? f.emoji : '🦄', S / 2, S * 0.58);
    }
    drawCos(eq.head, S * 0.33, S * 0.0, S * 0.36);
    c.className = 'shop-preview-art';
    this.el.shopPreview.replaceChildren(c);
  }

  _renderShop() {
    this.el.shopCoins.textContent = String(this.progress.coins);
    this._renderShopPreview();
    this.el.shopGrid.innerHTML = '';
    COSMETICS.forEach((cos) => {
      const owned = this.progress.cosmetics.includes(cos.id);
      const worn = this.progress.equipped[cos.slot] === cos.id;
      const afford = !owned && this.progress.coins >= cos.price;
      const cell = document.createElement('button');
      cell.className = 'shop-item'
        + (owned ? ' owned' : afford ? ' afford' : ' saving')
        + (worn ? ' worn' : '')
        + (this.progress.wish === cos.id ? ' wished' : '');
      const icon = COSMETIC_ART[cos.id]();
      icon.className = 'shop-icon';
      cell.appendChild(icon);
      const tag = document.createElement('span');
      tag.className = 'shop-tag';
      tag.innerHTML = owned
        ? (worn ? '✓' : '👗')
        : `<span class="shop-coin"></span>${cos.price}`;
      cell.appendChild(tag);
      cell.addEventListener('click', () => this._shopTap(cos, cell));
      this.el.shopGrid.appendChild(cell);
    });
    // Wish meter: the treasure she's saving toward fills as coins grow.
    const wish = this.progress.wish && cosmeticById(this.progress.wish);
    if (wish && !this.progress.cosmetics.includes(wish.id)) {
      const frac = Math.min(1, this.progress.coins / wish.price);
      this.el.shopWish.classList.remove('hidden');
      this.el.shopWish.querySelector('.wish-fill').style.width = `${Math.max(6, frac * 100)}%`;
      const ic = COSMETIC_ART[wish.id](); ic.className = 'wish-icon';
      this.el.shopWish.querySelector('.wish-icon-slot').replaceChildren(ic);
      this.el.shopWish.classList.toggle('ready', frac >= 1);
    } else {
      this.el.shopWish.classList.add('hidden');
    }
  }

  _shopTap(cos, cell) {
    if (this.progress.cosmetics.includes(cos.id)) {
      // Owned: tap to wear / take off.
      const worn = this.progress.equipped[cos.slot] === cos.id;
      if (worn) delete this.progress.equipped[cos.slot];
      else this.progress.equipped[cos.slot] = cos.id;
      saveProgress(this.progress);
      this.audio.chime();
      this._applyEquipped();
      this._renderShop();
      return;
    }
    if (this.progress.coins >= cos.price) {
      // Buy! Coins out, treasure on — celebrate right here.
      this._spend(cos.price);
      this.progress.cosmetics.push(cos.id);
      this.progress.equipped[cos.slot] = cos.id;
      if (this.progress.wish === cos.id) this.progress.wish = null;
      saveProgress(this.progress);
      this.audio.fanfare();
      this._pop(cell);
      this._applyEquipped();
      this._renderShop();
      setTimeout(() => this.audio.praise(), 500);
      return;
    }
    // Can't afford yet: make it her wish — the meter shows her saving toward it.
    this.progress.wish = cos.id;
    saveProgress(this.progress);
    this.audio.chime();
    this._renderShop();
    this._pop(this.el.shopWish);
  }

  _bindEvents() {
    window.addEventListener('resize', () => this._onResize());
    this._onResize();

    const startTap = () => {
      this.audio.unlock();
      this.el.start.classList.add('hidden');
      this.el.hud.classList.remove('hidden');
      this.state = 'playing';
      this.nextWord();
    };
    this.el.start.addEventListener('click', startTap);

    this.renderer.domElement.addEventListener('pointerdown', (e) => this._onPointer(e));

    this.el.mute.addEventListener('click', () => {
      const muted = !this.audio.muted;
      this.audio.setMuted(muted);
      this.el.mute.textContent = muted ? '🔇' : '🔊';
    });
    this.el.replay.addEventListener('click', () => {
      if (this.state === 'celebrating') this.audio.playWord(this.current.word);
      else this._replaySounds();
    });
    this.el.next.addEventListener('click', () => {
      if (this.state === 'celebrating') this.nextWord();
    });

    // Tap the goal banner to open the journey map.
    this.el.quest.addEventListener('click', () => this._openMap());
    this.el.mapClose.addEventListener('click', () => this._closeMap());
    this.el.mapScreen.addEventListener('click', (e) => {
      if (e.target === this.el.mapScreen) this._closeMap();
    });

    // Learn the Letters (alphabet foundation): from the start screen and the map.
    this.el.learnLettersBtn.addEventListener('click', (e) => {
      e.stopPropagation();            // don't let the tap also start the game
      this.audio.unlock();
      this._openLetters();
    });
    this.el.mapLettersBtn.addEventListener('click', () => this._openLetters());
    this.el.ltClose.addEventListener('click', () => this._closeLetters());
    this.el.lettersScreen.addEventListener('click', (e) => {
      if (e.target === this.el.lettersScreen) this._closeLetters();
    });
    this.el.ltTabExplore.addEventListener('click', () => this._setLettersTab('explore'));
    this.el.ltTabMatch.addEventListener('click', () => this._setLettersTab('match'));

    // Rosie's shop
    this.el.shopBtn.addEventListener('click', () => this._openShop());
    this.el.shopClose.addEventListener('click', () => this._closeShop());
    this.el.shopScreen.addEventListener('click', (e) => {
      if (e.target === this.el.shopScreen) this._closeShop();
    });

    this.el.collectionBtn.addEventListener('click', () => {
      this._renderCollection();
      this.el.collectionScreen.classList.remove('hidden');
    });
    this.el.collectionClose.addEventListener('click', () => {
      this.el.collectionScreen.classList.add('hidden');
    });
    this.el.collectionScreen.addEventListener('click', (e) => {
      if (e.target === this.el.collectionScreen) this.el.collectionScreen.classList.add('hidden');
    });
    this.el.resetBtn.addEventListener('click', () => this._resetProgress());

    // Parent corner: opens only after a 1.5s press-and-hold, so little fingers
    // can't wander into mic prompts, voice settings or the reset button.
    let holdTimer = null;
    const holdStart = (e) => {
      e.preventDefault();
      this.el.parentBtn.classList.add('holding');
      holdTimer = setTimeout(() => {
        this.el.parentBtn.classList.remove('holding');
        this.audio.unlock();
        this.el.parentScreen.classList.remove('hidden');
      }, 1500);
    };
    const holdEnd = () => {
      this.el.parentBtn.classList.remove('holding');
      clearTimeout(holdTimer);
    };
    this.el.parentBtn.addEventListener('pointerdown', holdStart);
    this.el.parentBtn.addEventListener('pointerup', holdEnd);
    this.el.parentBtn.addEventListener('pointerleave', holdEnd);
    this.el.parentClose.addEventListener('click', () => this.el.parentScreen.classList.add('hidden'));
    this.el.parentScreen.addEventListener('click', (e) => {
      if (e.target === this.el.parentScreen) this.el.parentScreen.classList.add('hidden');
    });
    this.el.parentStudio.addEventListener('click', () => { this.el.parentScreen.classList.add('hidden'); this._openStudio(); });
    this.el.parentVoice.addEventListener('click', () => { this.el.parentScreen.classList.add('hidden'); this.audio.unlock(); this._openVoice(); });
    this.el.parentGuide.addEventListener('click', () => { this.el.parentScreen.classList.add('hidden'); this._openGuide(); });

    // Recording studio (for a grown-up)
    this._studioTab = 'sounds';
    this.el.settingsClose.addEventListener('click', () => this._closeStudio());
    this.el.settingsScreen.addEventListener('click', (e) => {
      if (e.target === this.el.settingsScreen) this._closeStudio();
    });
    this.el.tabSounds.addEventListener('click', () => this._setStudioTab('sounds'));
    this.el.tabWords.addEventListener('click', () => this._setStudioTab('words'));

    // Backup / restore recordings + progress
    this.el.backupBtn.addEventListener('click', () => this._exportBackup());
    this.el.restoreBtn.addEventListener('click', () => this.el.restoreFile.click());
    this.el.restoreFile.addEventListener('change', (e) => this._importBackup(e.target.files[0]));

    // Guided recording walkthrough
    this.el.guideBtn.addEventListener('click', () => this._openGuide());
    this.el.guideDone.addEventListener('click', () => this._closeGuide());
    this.el.guideMic.addEventListener('click', () => this._guideToggleRecord());
    this.el.guidePlay.addEventListener('click', () => this._guidePlayCurrent());
    this.el.guidePrev.addEventListener('click', () => this._guideStep(-1));
    this.el.guideNext.addEventListener('click', () => this._guideStep(1));

    // Robot-voice settings (reached via the parent corner)
    this.el.voiceClose.addEventListener('click', () => this.el.voiceScreen.classList.add('hidden'));
    this.el.voiceScreen.addEventListener('click', (e) => {
      if (e.target === this.el.voiceScreen) this.el.voiceScreen.classList.add('hidden');
    });
    this.el.voiceSelect.addEventListener('change', () => { this.audio.setVoice(this.el.voiceSelect.value); this.audio.sampleVoice(); });
    this.el.voiceRate.addEventListener('change', () => this.audio.setRate(parseFloat(this.el.voiceRate.value)));
    this.el.voicePitch.addEventListener('change', () => this.audio.setPitch(parseFloat(this.el.voicePitch.value)));
    this.el.voiceTry.addEventListener('click', () => this.audio.sampleVoice());
    this.el.capsToggle.addEventListener('change', () => {
      this.capsMode = this.el.capsToggle.checked;
      localStorage.setItem(CAPS_KEY, String(this.capsMode));
      this._refreshTileTextures();
    });
  }

  _openVoice() {
    const s = this.audio.getVoiceSettings();
    const voices = this.audio.voiceList();
    this.el.voiceSelect.innerHTML = '';
    if (!voices.length) {
      const opt = document.createElement('option');
      opt.textContent = 'Default device voice';
      this.el.voiceSelect.appendChild(opt);
    }
    voices.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      if (v.voiceURI === s.uri) opt.selected = true;
      this.el.voiceSelect.appendChild(opt);
    });
    this.el.voiceRate.value = s.rate;
    this.el.voicePitch.value = s.pitch;
    this.el.capsToggle.checked = this.capsMode;
    this.el.voiceScreen.classList.remove('hidden');
  }

  _refreshTileTextures() {
    this.tiles.forEach((t) => {
      const displayLetter = this.capsMode ? t.letter.toUpperCase() : t.letter;
      const color = TILE_COLORS[t.mesh.userData.index % TILE_COLORS.length];
      t.mesh.material.map.dispose();
      t.mesh.material.map = makeTileTexture(displayLetter, color);
    });
  }

  // Unique letters used across all words, alphabetically (the sounds to record).
  _studioLetters() {
    const set = new Set();
    for (const w of WORDS) for (const ch of w.word) set.add(ch);
    return [...set].sort();
  }

  async _openStudio() {
    this.audio.unlock();
    this._recordedKeys = await this.audio.recordedKeys();
    this._setStudioTab(this._studioTab);
    this.el.settingsScreen.classList.remove('hidden');
  }

  _closeStudio() {
    this._stopRecording(true); // discard any in-progress recording
    this.el.settingsScreen.classList.add('hidden');
  }

  _setStudioTab(tab) {
    this._stopRecording(true);
    this._studioTab = tab;
    this.el.tabSounds.classList.toggle('active', tab === 'sounds');
    this.el.tabWords.classList.toggle('active', tab === 'words');
    this._renderStudio();
  }

  _renderStudio() {
    const kind = this._studioTab === 'sounds' ? 'phoneme' : 'word';
    const items = this._studioTab === 'sounds' ? this._studioLetters() : WORDS.map(w => w.word);
    this.el.studioList.innerHTML = '';
    items.forEach((name) => {
      const recorded = this._recordedKeys.has(this.audio.recKey(kind, name));
      const row = document.createElement('div');
      row.className = 'rec-row' + (recorded ? ' done' : '');
      row.dataset.kind = kind; row.dataset.name = name;
      row.innerHTML = `
        <span class="rec-label"></span>
        <span class="rec-status">${recorded ? '✓' : ''}</span>
        <button class="rec-mic" aria-label="Record">●</button>
        <button class="rec-play" aria-label="Play">▶</button>`;
      row.querySelector('.rec-label').textContent = name;
      row.querySelector('.rec-mic').addEventListener('click', () => this._toggleRecord(row));
      row.querySelector('.rec-play').addEventListener('click', () => {
        if (kind === 'phoneme') this.audio.playPhoneme(name);
        else this.audio.playWord(name);
      });
      this.el.studioList.appendChild(row);
    });
    this._updateStudioProgress();
  }

  _updateStudioProgress() {
    const kind = this._studioTab === 'sounds' ? 'phoneme' : 'word';
    const items = this._studioTab === 'sounds' ? this._studioLetters() : WORDS.map(w => w.word);
    const done = items.filter(n => this._recordedKeys.has(this.audio.recKey(kind, n))).length;
    this.el.studioProgress.textContent = `(${done}/${items.length} recorded)`;
  }

  async _toggleRecord(row) {
    // Tapping the active row stops & saves; tapping another stops the old first.
    if (this._recording) {
      const wasSame = this._recordingRow === row;
      this._stopRecording(false);
      if (wasSame) return;
    }
    let stream;
    try {
      stream = this._micStream || (this._micStream = await navigator.mediaDevices.getUserMedia({ audio: true }));
    } catch (_) {
      alert('To record, please allow microphone access for this page, then try again.');
      return;
    }
    let mr;
    try { mr = new MediaRecorder(stream); } catch (_) {
      alert("Sorry, this browser can't record audio. Try Safari or Chrome.");
      return;
    }
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      row.classList.remove('recording');
      row.querySelector('.rec-mic').textContent = '●';
      if (this._discardRecording || !chunks.length) return;
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      await this.audio.saveRecording(row.dataset.kind, row.dataset.name, blob);
      this._recordedKeys.add(this.audio.recKey(row.dataset.kind, row.dataset.name));
      row.classList.add('done');
      row.querySelector('.rec-status').textContent = '✓';
      this._updateStudioProgress();
    };
    this._mediaRecorder = mr;
    this._recording = true;
    this._recordingRow = row;
    this._discardRecording = false;
    row.classList.add('recording');
    row.querySelector('.rec-mic').textContent = '■';
    mr.start();
  }

  _stopRecording(discard) {
    if (!this._recording) return;
    this._discardRecording = !!discard;
    this._recording = false;
    try { this._mediaRecorder.stop(); } catch (_) {}
    this._recordingRow = null;
  }

  // --------------------------------------------------------------------------
  // Guided recording: walk every sound + word one at a time, big and friendly.
  // --------------------------------------------------------------------------
  async _openGuide() {
    this.audio.unlock();
    this._recordedKeys = await this.audio.recordedKeys();
    const letters = this._studioLetters().map(n => ({ kind: 'phoneme', name: n }));
    const words = WORDS.map(w => ({ kind: 'word', name: w.word }));
    this._guideItems = [...letters, ...words];
    // Start on the first thing not yet recorded.
    const firstTodo = this._guideItems.findIndex(it => !this._recordedKeys.has(this.audio.recKey(it.kind, it.name)));
    this._guideIdx = firstTodo < 0 ? 0 : firstTodo;
    this.el.settingsScreen.classList.add('hidden');
    this.el.guideScreen.classList.remove('hidden');
    this._renderGuide();
  }

  _closeGuide() {
    this._stopRecording(true);
    this.el.guideScreen.classList.add('hidden');
    this._renderStudio(); // reflect any new ticks in the grid
    this.el.settingsScreen.classList.remove('hidden');
  }

  _guideStep(delta) {
    this._stopRecording(true);
    this._guideIdx = (this._guideIdx + delta + this._guideItems.length) % this._guideItems.length;
    this._renderGuide();
  }

  _renderGuide() {
    const it = this._guideItems[this._guideIdx];
    const recorded = this._recordedKeys.has(this.audio.recKey(it.kind, it.name));
    this.el.guideProgress.textContent = `${this._guideIdx + 1} of ${this._guideItems.length} · ${recorded ? '✓ recorded' : 'not yet'}`;
    this.el.guideBig.textContent = it.name;
    this.el.guidePrompt.textContent = it.kind === 'phoneme'
      ? 'Say the SOUND it makes (e.g. “mmm”, not “em”)'
      : 'Say the whole word';
    this.el.guideMic.textContent = '●';
    this.el.guideMic.classList.remove('recording');
    this.el.guideMic.classList.toggle('done', recorded);
  }

  _guidePlayCurrent() {
    const it = this._guideItems[this._guideIdx];
    if (it.kind === 'phoneme') this.audio.playPhoneme(it.name);
    else this.audio.playWord(it.name);
  }

  async _guideToggleRecord() {
    if (this._recording) { this._stopRecording(false); return; }
    const it = this._guideItems[this._guideIdx];
    let stream;
    try {
      stream = this._micStream || (this._micStream = await navigator.mediaDevices.getUserMedia({ audio: true }));
    } catch (_) {
      alert('To record, please allow microphone access for this page, then try again.');
      return;
    }
    let mr;
    try { mr = new MediaRecorder(stream); } catch (_) {
      alert("Sorry, this browser can't record audio. Try Safari or Chrome.");
      return;
    }
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      this.el.guideMic.classList.remove('recording');
      this.el.guideMic.textContent = '●';
      if (this._discardRecording || !chunks.length) return;
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      await this.audio.saveRecording(it.kind, it.name, blob);
      this._recordedKeys.add(this.audio.recKey(it.kind, it.name));
      // Auto-advance to the next item after a short beat.
      setTimeout(() => {
        if (this.el.guideScreen.classList.contains('hidden')) return;
        if (this._guideIdx < this._guideItems.length - 1) { this._guideIdx++; this._renderGuide(); }
        else this._renderGuide();
      }, 350);
    };
    this._mediaRecorder = mr;
    this._recording = true;
    this._discardRecording = false;
    this.el.guideMic.classList.add('recording');
    this.el.guideMic.textContent = '■';
    mr.start();
  }

  // --------------------------------------------------------------------------
  // Backup / restore (recordings + progress) to a file on the device.
  // --------------------------------------------------------------------------
  async _exportBackup() {
    try {
      const recs = await this.audio.allRecordings();
      const recordings = {};
      for (const r of recs) recordings[r.key] = await blobToDataURL(r.blob);
      const data = {
        app: 'unicorn-reading', version: 1,
        progress: localStorage.getItem('unicorn-reading-progress-v1'),
        voice: localStorage.getItem('unicorn-reading-voice'),
        recordings,
      };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'unicorn-reading-backup.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (_) {
      alert('Sorry, the backup could not be created.');
    }
  }

  async _importBackup(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'unicorn-reading') throw new Error('not a backup');
      if (data.progress) localStorage.setItem('unicorn-reading-progress-v1', data.progress);
      if (data.voice) localStorage.setItem('unicorn-reading-voice', data.voice);
      for (const [key, dataURL] of Object.entries(data.recordings || {})) {
        await this.audio.putRecording(key, dataURLToBlob(dataURL));
      }
      this.el.restoreFile.value = '';
      alert('Restored! Your recordings and progress are back.');
      location.reload();
    } catch (_) {
      alert("That file couldn't be read as a Unicorn Reading backup.");
    }
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    const base = 6; // half-extent of the smaller axis -> 12 units always visible
    let halfW, halfH;
    if (aspect >= 1) { halfH = base; halfW = base * aspect; }
    else { halfW = base; halfH = base / aspect; }
    this.camera.left = -halfW; this.camera.right = halfW;
    this.camera.top = halfH; this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    if (this.tiles.length) this._layoutTiles();
  }

  // --------------------------------------------------------------------------
  // Word lifecycle
  // --------------------------------------------------------------------------
  nextWord() {
    // Cancel any pending celebration visuals from the word we're leaving.
    clearTimeout(this._winTimer);
    clearTimeout(this._winTimer2);
    clearTimeout(this._answersHideTimer);

    // If the last word completed the stage, advance to the next stage on the map.
    if (this.stageJustCompleted) {
      this.stageJustCompleted = false;
      const idx = STAGES.findIndex(s => s.id === this.progress.currentStage);
      if (idx >= 0 && idx < STAGES.length - 1) this.progress.currentStage = STAGES[idx + 1].id;
      this.progress.stageProgress = 0;
      this._orderStage = null; // new stage -> new word pool
      saveProgress(this.progress);
      this._renderStage();
    }

    // clear old tiles
    for (const t of this.tiles) {
      t.mesh.material.map.dispose();
      t.mesh.material.dispose();
      this.tileGroup.remove(t.mesh);
    }
    this.tiles = [];
    this.reward.material.opacity = 0;
    this.reward.scale.set(0.01, 0.01, 1);
    this.el.next.classList.add('disabled');
    this.el.hint.textContent = 'Sound it out, then tap the picture 👇';

    // Draw the next word from the CURRENT stage's words (a shuffled run so she
    // sees every word in the family before any repeats). The lite learning
    // brain leads each run with her two weakest words in the family.
    const stageWords = this.stage.words;
    if (this._orderStage !== this.progress.currentStage) {
      this.order = shuffle([...stageWords.keys()]);
      const acc = (i) => itemAccuracy(this.progress, 'w.' + stageWords[i].word) ?? -1; // unseen first
      const weakFirst = [...this.order].sort((a, b) => acc(a) - acc(b)).slice(0, 2);
      this.order = [...weakFirst, ...this.order.filter(i => !weakFirst.includes(i))];
      this.orderPos = -1;
      this._orderStage = this.progress.currentStage;
    }
    this.orderPos = (this.orderPos + 1) % this.order.length;
    if (this.orderPos === 0) this.order = shuffle(this.order); // reshuffle each loop
    this.current = stageWords[this.order[this.orderPos]];

    const letters = this.current.word.split('');
    letters.forEach((ch, i) => {
      const color = TILE_COLORS[i % TILE_COLORS.length];
      const displayLetter = this.capsMode ? ch.toUpperCase() : ch;
      const mat = new THREE.MeshBasicMaterial({ map: makeTileTexture(displayLetter, color), transparent: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.userData.index = i;
      this.tileGroup.add(mesh);
      this.tiles.push({ mesh, letter: ch });
    });
    this._layoutTiles(true);
    this._renderAnswers();
    this.state = 'playing';
  }

  // Picture choices: the correct one + distractors, shuffled. The number of
  // choices grows with experience — gentle at first (6), up to 10 — and the
  // grid stays two rows so the layout never shifts under the word.
  _renderAnswers() {
    // Adaptive challenge: more picture choices as lifetime earnings grow
    // (2 coins per word ≈ the old 1 star, so /8 keeps the original pacing).
    const n = Math.max(6, Math.min(10, 6 + Math.floor(this.progress.starsEarned / 8)));
    const cols = Math.ceil(n / 2);
    const correct = this.current.emoji;
    // Prefer distractors from the SAME stage (same-vowel discrimination is the
    // real skill), then top up from the rest of the words as choices grow.
    const inStage = this.stage.words.map(w => w.emoji).filter(e => e !== correct);
    const rest = WORDS.map(w => w.emoji).filter(e => e !== correct && !inStage.includes(e));
    const pool = [...shuffle(inStage), ...shuffle(rest)];
    const choices = shuffle([correct, ...pool.slice(0, n - 1)]);
    clearTimeout(this._answersHideTimer); // don't let a previous win hide these
    this.el.answers.classList.remove('hidden');
    this.el.answers.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    this.el.answers.innerHTML = '';
    choices.forEach((emoji) => {
      const btn = document.createElement('button');
      btn.className = 'answer';
      btn.textContent = emoji;
      btn.addEventListener('click', () => this._chooseAnswer(btn, emoji === correct));
      this.el.answers.appendChild(btn);
    });
  }

  _chooseAnswer(btn, isCorrect) {
    if (this.state !== 'playing') return;
    bumpItem(this.progress, 'w.' + this.current.word, isCorrect); // learning stats
    if (isCorrect) {
      btn.classList.add('correct');
      this._win();
    } else {
      // A wrong guess isn't punished — it nudges her back to the sounds so she
      // decodes the word rather than guessing pictures at random.
      btn.classList.add('wrong');
      this.audio.nope();
      setTimeout(() => btn.classList.remove('wrong'), 500);
      this.el.hint.textContent = 'Listen again… 👂';
      clearTimeout(this._rehintTimer);
      this._rehintTimer = setTimeout(() => { if (this.state === 'playing') this.el.hint.textContent = 'Sound it out, then tap the picture 👇'; }, 2600);
      this._replaySounds();
    }
  }

  _layoutTiles(animateIn = false) {
    const n = this.tiles.length;
    const camW = (this.camera.right - this.camera.left);
    const tile = Math.min(2.0, (camW * 0.82) / (n + (n - 1) * 0.28));
    const gap = tile * 0.28;
    const total = n * tile + (n - 1) * gap;
    const startX = -total / 2 + tile / 2;
    this.tileSize = tile;
    this.tiles.forEach((t, i) => {
      const x = startX + i * (tile + gap);
      t.homeX = x;
      t.mesh.scale.set(tile, tile, 1);
      if (animateIn) {
        t.mesh.position.set(x, TILE_Y - 8, 0);
        to(t.mesh.position, { x, y: TILE_Y }, 0.5, { ease: easeOutBack, delay: i * 0.08 });
      } else if (this.state !== 'celebrating') {
        t.mesh.position.set(x, TILE_Y, 0);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Interaction — tap any letter, any time, to hear its sound (no order).
  // --------------------------------------------------------------------------
  _onPointer(e) {
    if (this.state === 'celebrating') { this.nextWord(); return; }
    if (this.state !== 'playing') return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.tiles.map(t => t.mesh));
    if (!hits.length) return;
    const idx = hits[0].object.userData.index;
    this.audio.playPhoneme(this.tiles[idx].letter);
    this._bounce(this.tiles[idx].mesh);
  }

  // Play each letter sound in order (the 🔁 button helps her blend).
  // Sequential await so a long sound is never cancelled by the next one;
  // a token bails out if a new replay (or a new word) starts mid-sequence.
  async _replaySounds() {
    const token = (this._replayToken = (this._replayToken || 0) + 1);
    const word = this.current;
    for (const t of this.tiles) {
      if (this._replayToken !== token || this.current !== word) return;
      t.mesh && this._bounce(t.mesh, 0.12);
      await this.audio.playPhoneme(t.letter);
      await new Promise(r => setTimeout(r, 220));
    }
  }

  _bounce(mesh, scaleBoost = 0.22) {
    const base = this.tileSize;
    to(mesh.scale, { x: base * (1 + scaleBoost), y: base * (1 + scaleBoost) }, 0.12, {
      onComplete: () => to(mesh.scale, { x: base, y: base }, 0.18, { ease: easeOutBack }),
    });
    to(mesh.position, { y: TILE_Y + 0.35 }, 0.12, {
      onComplete: () => to(mesh.position, { y: TILE_Y }, 0.2, { ease: easeOutBack }),
    });
  }

  // --------------------------------------------------------------------------
  // Win (correct picture chosen) + celebrate
  // --------------------------------------------------------------------------
  _win() {
    if (this.state !== 'playing') return;
    this.state = 'celebrating';
    clearTimeout(this._answersHideTimer);
    this._answersHideTimer = setTimeout(() => this.el.answers.classList.add('hidden'), 300);

    // Slide cards together toward the centre so they read as one word.
    const n = this.tiles.length;
    const tight = this.tileSize * 0.96;
    const startX = -((n - 1) * tight) / 2;
    this.tiles.forEach((t, i) => {
      to(t.mesh.position, { x: startX + i * tight, y: TILE_Y }, 0.45, { ease: easeInOutQuad });
    });

    // --- Grant rewards IMMEDIATELY so advancing fast never loses them ---
    this._grant('word'); // coins for the read word, through the one choke-point

    this.progress.stageProgress++;
    this._fillQuestSlot(this.progress.stageProgress - 1);
    const stageDone = this.progress.stageProgress >= GOAL_SIZE;

    let unlockedFriend = null;
    if (stageDone) {
      // Mark this stage cleared (by id, idempotently) so the next one opens.
      if (!this.progress.clearedStages.includes(this.stage.id)) {
        this.progress.clearedStages.push(this.stage.id);
      }
      this._grant('stageBonus');
      unlockedFriend = this._unlockNextFriend();
      this.stageJustCompleted = true;
      // Show the new friend NOW — racing ahead should never skip the one
      // moment that explains why her collection grew.
      if (unlockedFriend) this._showFriendToast(unlockedFriend.emoji, 'New friend!');
    }
    saveProgress(this.progress);
    this.el.next.classList.remove('disabled');
    this.el.hint.textContent = stageDone ? 'Tap for a new adventure →' : 'Tap to keep going →';

    // --- Deferred VISUALS (cancelled if she advances quickly) ---
    this._winTimer = setTimeout(async () => {
      this._unicornCheer();
      this._showReward();
      this._burst();
      const word = this.current;
      // Speak the word FULLY before cheering — each TTS call cancels the
      // previous one, so firing these together cut the word off mid-say.
      await this.audio.playWord(word.word);
      if (this.current !== word) return; // she already moved on
      this.audio.praise();
      if (stageDone) this._winTimer2 = setTimeout(() => this._celebrateStage(unlockedFriend), 700);
    }, 520);
  }

  // Animate a flying token from the centre of the screen into a goal slot.
  _fillQuestSlot(i) {
    const slot = this.slotEls[i];
    if (!slot) return;
    const s = this.stage;
    const rect = slot.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'fly-token';
    fly.textContent = s.token;
    fly.style.left = (window.innerWidth / 2) + 'px';
    fly.style.top = (window.innerHeight * 0.45) + 'px';
    document.body.appendChild(fly);
    // next frame: glide to the slot
    requestAnimationFrame(() => {
      fly.style.left = (rect.left + rect.width / 2) + 'px';
      fly.style.top = (rect.top + rect.height / 2) + 'px';
      fly.style.transform = 'translate(-50%, -50%) scale(0.7)';
      fly.style.opacity = '0.9';
    });
    setTimeout(() => {
      fly.remove();
      slot.textContent = s.token;
      slot.classList.add('filled');
      this._pop(slot);
      this.audio.chime();
    }, 620);
  }

  // Stage-complete celebration visuals (rewards + toast already granted in _win).
  _celebrateStage(friend) {
    const s = this.stage;
    this.audio.fanfare();
    this._unicornCheer();
    this._burst([s.token, '✨', '🌈', '⭐', '🎉']);
    this._burst([s.token, '✨', '💖']);
    if (friend) this._pop(this.el.collectionBtn);
    else this._showFriendToast(null, s.cheer); // stage cheer when no friend left to unlock
    setTimeout(() => this.audio.praise(), 900);
  }

  _showFriendToast(friendEmoji, cheer) {
    const toast = this.el.friendToast;
    toast.querySelector('.toast-emoji').textContent = friendEmoji || '🌟';
    toast.querySelector('.toast-text').textContent = friendEmoji ? 'New friend!' : cheer;
    toast.classList.remove('hidden');
    this._pop(toast);
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
  }

  _showReward() {
    this.reward.material.map.dispose();
    this.reward.material.map = makeEmojiTexture(this.current.emoji, 256);
    this.reward.material.opacity = 1;
    this.reward.scale.set(0.01, 0.01, 1);
    to(this.reward.scale, { x: 3.2, y: 3.2 }, 0.6, { ease: easeOutBack });
    to(this.reward.position, { y: 1.4 }, 0.6, { ease: easeOutBack });
  }

  _unicornCheer() {
    const y0 = 3.3;
    to(this.unicorn.position, { y: y0 + 1.1 }, 0.28, {
      ease: easeOutCubic,
      onComplete: () => to(this.unicorn.position, { y: y0 }, 0.4, { ease: easeOutBack }),
    });
    to(this.unicorn.scale, { x: 3.4, y: 3.4 }, 0.28, {
      onComplete: () => to(this.unicorn.scale, { x: 3, y: 3 }, 0.4, { ease: easeOutBack }),
    });
  }

  _burst(emojis = ['✨', '⭐', '💖', '🌈', '🦄']) {
    const texCache = (this._burstTex ||= {});
    for (let i = 0; i < 22; i++) {
      const em = emojis[(Math.random() * emojis.length) | 0];
      const tex = texCache[em] || (texCache[em] = makeEmojiTexture(em, 128));
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      const s = 0.5 + Math.random() * 0.8;
      sp.scale.set(s, s, 1);
      sp.position.set(0, 1.4, 2);
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 4;
      sp.userData.vx = Math.cos(ang) * spd;
      sp.userData.vy = Math.sin(ang) * spd + 3;
      sp.userData.life = 1.2 + Math.random() * 0.6;
      sp.userData.age = 0;
      this.scene.add(sp);
      this.particles.push(sp);
    }
  }

  _pop(domEl) {
    if (!domEl) return;
    domEl.classList.remove('pop');
    void domEl.offsetWidth; // restart animation
    domEl.classList.add('pop');
  }

  // --------------------------------------------------------------------------
  // Loop
  // --------------------------------------------------------------------------
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    updateTweens(dt);

    // idle buddy bob
    if (this.state !== 'celebrating') {
      this.unicorn.position.y = 3.3 + Math.sin(t * 1.6) * 0.12;
      this.unicorn.material.rotation = Math.sin(t * 1.2) * 0.05;
    }
    // equipped cosmetics ride along with the buddy (hat on head, wings behind)
    const u = this.unicorn.position;
    const buddyScale = this.unicorn.scale.x / 3;
    this.cosHead.position.set(u.x, u.y + 1.32 * buddyScale, u.z + 0.2);
    this.cosHead.scale.set(1.1 * buddyScale, 1.1 * buddyScale, 1);
    this.cosHead.material.rotation = this.unicorn.material.rotation;
    this.cosBack.position.set(u.x, u.y + 0.15 * buddyScale, u.z - 0.2);
    this.cosBack.scale.set(2.1 * buddyScale, 2.1 * buddyScale, 1);
    this.cosBack.material.rotation = this.unicorn.material.rotation;
    // drifting clouds
    for (const cl of this.clouds) {
      cl.position.x += cl.userData.speed * dt;
      if (cl.position.x > 8) cl.position.x = -8;
    }
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.userData.age += dt;
      p.userData.vy -= 6 * dt; // gravity
      p.position.x += p.userData.vx * dt;
      p.position.y += p.userData.vy * dt;
      p.material.rotation += dt * 3;
      const lifeLeft = 1 - p.userData.age / p.userData.life;
      p.material.opacity = Math.max(0, lifeLeft);
      if (p.userData.age >= p.userData.life) {
        this.scene.remove(p);
        p.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

const TILE_Y = -1.4;

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataURL) {
  const [head, b64] = dataURL.split(',');
  const mime = (head.match(/:(.*?);/) || [, 'audio/webm'])[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

window.addEventListener('DOMContentLoaded', () => {
  // Register the service worker for offline play (PWA). Skip it on shared CDN
  // hosts (jsDelivr / githack) used for quick testing, where an offline cache
  // would just serve stale files between updates.
  const onCDN = /jsdelivr|githack|statically/i.test(location.hostname);
  if ('serviceWorker' in navigator && !onCDN) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
  new Game();
});
