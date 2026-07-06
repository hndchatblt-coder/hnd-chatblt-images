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
import { WORDS, STAGES } from './words.js';
import { AudioManager } from './audio.js';
import { FRIENDS, GOAL_SIZE } from './quests.js';
import { loadProgress, saveProgress, resetProgress } from './progress.js';

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

function makeGlowTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.15, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(255,245,170,0.95)');
  g.addColorStop(0.5, 'rgba(255,225,120,0.45)');
  g.addColorStop(1, 'rgba(255,225,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
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
    this.stars = this.progress.stars;
    // Word order is per-stage: a shuffled run through the current stage's words.
    this.order = [];
    this.orderPos = -1;
    this._orderStage = -1;
    this.tiles = [];
    this.expected = 0;           // next tile index the child should tap
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
    this.glowTex = makeGlowTexture();

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

    // Active-tile highlight (glow behind the next card to tap)
    this.highlight = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, opacity: 0, depthWrite: false }));
    this.highlight.scale.set(3.2, 3.2, 1);
    this.highlight.position.set(0, TILE_Y, -0.5);
    this.highlight.material.opacity = 0; // unused now (kept to avoid churn)

    // Buddy character (unicorn by default; swappable for a collected friend)
    this.unicorn = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeEmojiTexture(FRIENDS[this.progress.buddy] || '🦄', 256), transparent: true }));
    this.unicorn.scale.set(3, 3, 1);
    this.unicorn.position.set(0, 3.3, 0);
    this.scene.add(this.unicorn);

    // Reward picture (hidden until a word is blended)
    this.reward = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeEmojiTexture('⭐', 256), transparent: true, opacity: 0 }));
    this.reward.scale.set(0.01, 0.01, 1);
    this.reward.position.set(0, 1.2, 1);
    this.scene.add(this.reward);

    this.tileGroup = new THREE.Group();
    this.scene.add(this.tileGroup);
  }

  _initDOM() {
    this.el = {
      start: document.getElementById('start-screen'),
      hud: document.getElementById('hud'),
      stars: document.getElementById('star-count'),
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
      settingsBtn: document.getElementById('settings-btn'),
      settingsScreen: document.getElementById('settings-screen'),
      settingsClose: document.getElementById('settings-close'),
      studioList: document.getElementById('studio-list'),
      studioProgress: document.getElementById('studio-progress'),
      tabSounds: document.getElementById('tab-sounds'),
      tabWords: document.getElementById('tab-words'),
      voiceBtn: document.getElementById('voice-btn'),
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
    };
    this.el.stars.textContent = String(this.stars);
    this._renderStage();
    this._renderCollection();
  }

  // The stage (vowel family) she is currently playing.
  get stage() { return STAGES[Math.min(this.progress.stage, STAGES.length - 1)]; }

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
    STAGES.forEach((s, i) => {
      const reached = i <= this.progress.cleared;   // playable now
      const done = i < this.progress.cleared;        // fully completed
      const current = i === this.progress.stage;
      const cell = document.createElement('div');
      cell.className = 'map-cell' + (reached ? '' : ' locked') + (current ? ' current' : '') + (done ? ' done' : '');
      cell.innerHTML = `
        <div class="map-token">${reached ? s.token : '🔒'}</div>
        <div class="map-label">${s.label}</div>
        <div class="map-focus">${s.focus}</div>
        <div class="map-badge">${done ? '✓' : current ? '▶' : ''}</div>`;
      if (reached) cell.addEventListener('click', () => this._selectStage(i));
      this.el.mapGrid.appendChild(cell);
    });
  }

  _openMap() {
    this._renderMap();
    this.el.mapScreen.classList.remove('hidden');
  }

  _closeMap() { this.el.mapScreen.classList.add('hidden'); }

  // Jump to a reached stage from the map and start a fresh word from it.
  _selectStage(i) {
    if (i > this.progress.cleared) return;
    this.progress.stage = i;
    this.progress.stageProgress = 0;
    this.stageJustCompleted = false;
    saveProgress(this.progress);
    this._renderStage();
    this._closeMap();
    this.orderPos = -1;
    this._orderStage = -1; // force a reshuffle for the new stage
    this.nextWord();
  }

  _renderCollection() {
    this.el.collectionCount.textContent = String(this.progress.unlocked);
    this.el.collectionGrid.innerHTML = '';
    FRIENDS.forEach((emoji, i) => {
      const unlocked = i < this.progress.unlocked;
      const cell = document.createElement('div');
      cell.className = 'friend-cell' + (unlocked ? '' : ' locked') + (unlocked && i === this.progress.buddy ? ' buddy' : '');
      cell.textContent = unlocked ? emoji : '❔';
      if (unlocked) cell.addEventListener('click', () => this._setBuddy(i));
      this.el.collectionGrid.appendChild(cell);
    });
  }

  // Wipe stars/friends/stage/buddy and begin again. Recordings are kept.
  _resetProgress() {
    if (!window.confirm('Start over? This clears stars, friends and progress so you begin fresh. (Your recorded sounds are kept.)')) return;
    this.progress = resetProgress();
    this.stars = this.progress.stars;
    this.el.stars.textContent = '0';
    this.unicorn.material.map.dispose();
    this.unicorn.material.map = makeEmojiTexture(FRIENDS[this.progress.buddy] || '🦄', 256);
    this.stageJustCompleted = false;
    this.orderPos = -1;
    this._orderStage = -1;
    this._renderStage();
    this._renderCollection();
    this.el.collectionScreen.classList.add('hidden');
    this.nextWord();
  }

  // Swap the on-screen character for a collected friend.
  _setBuddy(i) {
    if (i >= this.progress.unlocked) return;
    this.progress.buddy = i;
    saveProgress(this.progress);
    this.unicorn.material.map.dispose();
    this.unicorn.material.map = makeEmojiTexture(FRIENDS[i], 256);
    this._renderCollection();
    this._unicornCheer(); // little hop to confirm the swap
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

    // Recording studio (for a grown-up)
    this._studioTab = 'sounds';
    this.el.settingsBtn.addEventListener('click', () => this._openStudio());
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

    // Robot-voice settings
    this.el.voiceBtn.addEventListener('click', () => { this.audio.unlock(); this._openVoice(); });
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
      if (this.progress.stage < STAGES.length - 1) this.progress.stage++;
      this.progress.stageProgress = 0;
      this._orderStage = -1; // new stage -> new word pool
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
    // sees every word in the family before any repeats).
    const stageWords = this.stage.words;
    if (this._orderStage !== this.progress.stage) {
      this.order = shuffle([...stageWords.keys()]);
      this.orderPos = -1;
      this._orderStage = this.progress.stage;
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
    const n = Math.max(6, Math.min(10, 6 + Math.floor(this.stars / 4)));
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
    this.stars++;
    this.progress.stars = this.stars;
    this.el.stars.textContent = String(this.stars);
    this._pop(this.el.stars.parentElement);

    this.progress.stageProgress++;
    this._fillQuestSlot(this.progress.stageProgress - 1);
    const stageDone = this.progress.stageProgress >= GOAL_SIZE;

    let unlockedFriend = null;
    if (stageDone) {
      // Mark this stage cleared so the next one opens on the map.
      this.progress.cleared = Math.max(this.progress.cleared, this.progress.stage + 1);
      if (this.progress.unlocked < FRIENDS.length) {
        unlockedFriend = FRIENDS[this.progress.unlocked];
        this.progress.unlocked++;
        this._renderCollection();
      }
      this.stageJustCompleted = true;
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

  // Stage-complete celebration visuals (the friend was already unlocked in _win).
  _celebrateStage(friend) {
    const s = this.stage;
    this.audio.fanfare();
    this._unicornCheer();
    this._burst([s.token, '✨', '🌈', '⭐', '🎉']);
    this._burst([s.token, '✨', '💖']);
    if (friend) this._pop(this.el.collectionBtn);
    setTimeout(() => this.audio.praise(), 900);
    this._showFriendToast(friend, s.cheer);
  }

  _showFriendToast(friend, cheer) {
    const toast = this.el.friendToast;
    toast.querySelector('.toast-emoji').textContent = friend || '🌟';
    toast.querySelector('.toast-text').textContent = friend ? 'New friend!' : cheer;
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
