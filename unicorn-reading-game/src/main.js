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
import { WORDS } from './words.js';
import { AudioManager } from './audio.js';
import { QUESTS, FRIENDS, GOAL_SIZE } from './quests.js';
import { loadProgress, saveProgress } from './progress.js';

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
  // letter
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(90,40,100,0.35)';
  ctx.lineWidth = 10;
  ctx.font = '900 210px "Baloo 2", "Comic Sans MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, S / 2, S / 2 + 14);
  ctx.strokeText(letter, S / 2, S / 2 + 14);
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
    this.stars = this.progress.stars;
    this.order = shuffle([...WORDS.keys()]);
    this.orderPos = -1;
    this.tiles = [];
    this.expected = 0;           // next tile index the child should tap
    this.particles = [];
    this.questJustCompleted = false;
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
    this.scene.add(this.highlight);

    // Unicorn
    this.unicorn = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeEmojiTexture('🦄', 256), transparent: true }));
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
      questTitle: document.getElementById('quest-title'),
      questSlots: document.getElementById('quest-slots'),
      collectionBtn: document.getElementById('collection-btn'),
      collectionCount: document.getElementById('collection-count'),
      collectionScreen: document.getElementById('collection-screen'),
      collectionGrid: document.getElementById('collection-grid'),
      collectionClose: document.getElementById('collection-close'),
      friendToast: document.getElementById('friend-toast'),
    };
    this.el.stars.textContent = String(this.stars);
    this._renderQuest();
    this._renderCollection();
  }

  get quest() { return QUESTS[this.progress.questIndex % QUESTS.length]; }

  // Build the quest banner: title + a row of slots, filled to questProgress.
  _renderQuest() {
    const q = this.quest;
    this.el.questTitle.textContent = `${q.token} ${q.title}`;
    this.el.questSlots.innerHTML = '';
    this.slotEls = [];
    for (let i = 0; i < GOAL_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const filled = i < this.progress.questProgress;
      slot.textContent = filled ? q.token : '';
      if (filled) slot.classList.add('filled');
      this.el.questSlots.appendChild(slot);
      this.slotEls.push(slot);
    }
  }

  _renderCollection() {
    this.el.collectionCount.textContent = String(this.progress.unlocked);
    this.el.collectionGrid.innerHTML = '';
    FRIENDS.forEach((emoji, i) => {
      const cell = document.createElement('div');
      cell.className = 'friend-cell' + (i < this.progress.unlocked ? '' : ' locked');
      cell.textContent = i < this.progress.unlocked ? emoji : '❔';
      this.el.collectionGrid.appendChild(cell);
    });
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
      else this._replayTappedSoFar();
    });
    this.el.next.addEventListener('click', () => {
      if (this.state === 'celebrating') this.nextWord();
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
    // If the last word finished a quest, move on to the next quest variation.
    if (this.questJustCompleted) {
      this.questJustCompleted = false;
      this.progress.questIndex = (this.progress.questIndex + 1) % QUESTS.length;
      this.progress.questProgress = 0;
      saveProgress(this.progress);
      this._renderQuest();
    }

    // clear old tiles
    for (const t of this.tiles) {
      t.mesh.material.map.dispose();
      t.mesh.material.dispose();
      this.tileGroup.remove(t.mesh);
    }
    this.tiles = [];
    this.expected = 0;
    this.reward.material.opacity = 0;
    this.reward.scale.set(0.01, 0.01, 1);
    this.el.next.classList.add('disabled');
    this.el.hint.textContent = 'Tap each letter';

    this.orderPos = (this.orderPos + 1) % this.order.length;
    if (this.orderPos === 0) this.order = shuffle(this.order); // reshuffle each loop
    this.current = WORDS[this.order[this.orderPos]];

    const letters = this.current.word.split('');
    letters.forEach((ch, i) => {
      const color = TILE_COLORS[i % TILE_COLORS.length];
      const mat = new THREE.MeshBasicMaterial({ map: makeTileTexture(ch, color), transparent: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.userData.index = i;
      this.tileGroup.add(mesh);
      this.tiles.push({ mesh, letter: ch, tapped: false });
    });
    this._layoutTiles(true);
    this.state = 'playing';
    this._updateHighlight();
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
    this._updateHighlight();
  }

  _updateHighlight() {
    if (this.state !== 'playing' || this.expected >= this.tiles.length) {
      to(this.highlight.material, { opacity: 0 }, 0.2);
      return;
    }
    const t = this.tiles[this.expected];
    this.highlight.position.set(t.homeX, TILE_Y, -0.5);
    this.highlight.scale.set(this.tileSize * 1.6, this.tileSize * 1.6, 1);
    to(this.highlight.material, { opacity: 0.9 }, 0.25);
  }

  // --------------------------------------------------------------------------
  // Interaction
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

    // Replay sound of an already-tapped letter.
    if (this.tiles[idx].tapped && idx !== this.expected) {
      this.audio.playPhoneme(this.tiles[idx].letter);
      this._bounce(this.tiles[idx].mesh);
      return;
    }
    if (idx !== this.expected) {
      // Wrong order: nudge the correct (highlighted) card instead.
      this._bounce(this.tiles[this.expected].mesh, 0.12);
      return;
    }

    // Correct next letter.
    this.tiles[idx].tapped = true;
    this.audio.playPhoneme(this.tiles[idx].letter);
    this._bounce(this.tiles[idx].mesh);
    this.expected++;
    this._updateHighlight();

    if (this.expected >= this.tiles.length) {
      this.el.hint.textContent = 'Blend it!';
      setTimeout(() => this._blend(), 480);
    }
  }

  _replayTappedSoFar() {
    let delay = 0;
    for (const t of this.tiles) {
      if (!t.tapped) break;
      setTimeout(() => this.audio.playPhoneme(t.letter), delay);
      delay += 650;
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
  // Blend + celebrate
  // --------------------------------------------------------------------------
  _blend() {
    this.state = 'celebrating';
    this._updateHighlight();
    this.el.hint.textContent = '';

    // Slide cards together toward the centre so they read as one word.
    const n = this.tiles.length;
    const tight = this.tileSize * 0.96;
    const startX = -((n - 1) * tight) / 2;
    this.tiles.forEach((t, i) => {
      to(t.mesh.position, { x: startX + i * tight, y: TILE_Y }, 0.45, { ease: easeInOutQuad });
    });

    setTimeout(() => {
      this.audio.playWord(this.current.word);
      this._unicornCheer();
      this._showReward();
      this._burst();
      this.audio.praise();

      // Reward: a star + progress on the current quest.
      this.stars++;
      this.progress.stars = this.stars;
      this.el.stars.textContent = String(this.stars);
      this._pop(this.el.stars.parentElement);

      this.progress.questProgress++;
      this._fillQuestSlot(this.progress.questProgress - 1);
      const questDone = this.progress.questProgress >= GOAL_SIZE;
      saveProgress(this.progress);

      if (questDone) {
        setTimeout(() => this._completeQuest(), 700);
        this.el.hint.textContent = '';
      } else {
        this.el.hint.textContent = 'Tap to keep going →';
      }
      this.el.next.classList.remove('disabled');
    }, 520);
  }

  // Animate a flying token from the centre of the screen into a quest slot.
  _fillQuestSlot(i) {
    const slot = this.slotEls[i];
    if (!slot) return;
    const q = this.quest;
    const rect = slot.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'fly-token';
    fly.textContent = q.token;
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
      slot.textContent = q.token;
      slot.classList.add('filled');
      this._pop(slot);
      this.audio.chime();
    }, 620);
  }

  // A whole quest is complete: big celebration + unlock a new friend.
  _completeQuest() {
    const q = this.quest;
    this.audio.fanfare();
    this._unicornCheer();
    this._burst([q.token, '✨', '🌈', '⭐', '🎉']);
    this._burst([q.token, '✨', '💖']);

    // Unlock the next magical friend (if any remain).
    let friend = null;
    if (this.progress.unlocked < FRIENDS.length) {
      friend = FRIENDS[this.progress.unlocked];
      this.progress.unlocked++;
      this._renderCollection();
      this._pop(this.el.collectionBtn);
    }
    saveProgress(this.progress);

    setTimeout(() => this.audio.praise(), 900);
    this._showFriendToast(friend, q.cheer);
    this.questJustCompleted = true;
    this.el.hint.textContent = 'Tap for a new adventure →';
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

    // idle unicorn bob
    if (this.state !== 'celebrating') {
      this.unicorn.position.y = 3.3 + Math.sin(t * 1.6) * 0.12;
      this.unicorn.material.rotation = Math.sin(t * 1.2) * 0.05;
    }
    // highlight pulse
    if (this.highlight.material.opacity > 0.01) {
      const k = 1 + Math.sin(t * 4) * 0.07;
      this.highlight.scale.set(this.tileSize * 1.6 * k, this.tileSize * 1.6 * k, 1);
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

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

window.addEventListener('DOMContentLoaded', () => {
  // Register the service worker for offline play (PWA).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
  new Game();
});
