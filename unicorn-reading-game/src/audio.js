// Audio manager for the Unicorn Reading Game.
//
// Strategy (decided with the project owner):
//   1. PREFER recorded audio files — pure phoneme sounds and whole-word
//      recordings give the best phonics experience. Drop files into
//      /audio/phonemes/<letter>.mp3 and /audio/words/<word>.mp3.
//      (See /audio/README.md for how to record your own voice.)
//   2. FALL BACK to the browser's built-in speech synthesis when a recording
//      is missing, so the game is fully playable before any audio is recorded.
//
// Which recordings exist is read from /audio/manifest.json (shipped empty, so
// there are no failed requests out of the box). If that file is missing, the
// manager auto-detects files on demand instead — handy for quick "just drop the
// file in" testing (at the cost of a harmless 404 in the dev console).
//
// Mobile browsers block audio until the first user gesture, so call
// `audio.unlock()` from a tap/click handler before playing anything.

import { PHONEME_HINTS } from './words.js';

const MANIFEST_URL = './audio/manifest.json';
const PHONEME_DIR = './audio/phonemes/';
const WORD_DIR = './audio/words/';
const EXT = '.mp3';

export class AudioManager {
  constructor() {
    this.unlocked = false;
    this.muted = false;
    this.hasManifest = false;
    this.manifest = { phonemes: [], words: [], cheer: false };
    this.ready = this._loadManifest();
    // Cache of whether a given URL exists (true/false). Avoids re-requesting.
    this._exists = new Map();
    // Cache of preloaded HTMLAudioElements by URL.
    this._cache = new Map();
    this._tts = ('speechSynthesis' in window) ? window.speechSynthesis : null;
    this._voice = null;
    if (this._tts) {
      const pickVoice = () => {
        const voices = this._tts.getVoices();
        // Prefer an English voice; a "child"/female voice if available.
        this._voice =
          voices.find(v => /en[-_]?(GB|AU)/i.test(v.lang)) ||
          voices.find(v => /^en/i.test(v.lang)) ||
          voices[0] || null;
      };
      pickVoice();
      this._tts.onvoiceschanged = pickVoice;
    }
  }

  // Must be called from within a user-gesture handler on mobile.
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    // Nudge speech synthesis awake with a silent utterance.
    if (this._tts) {
      try {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        this._tts.speak(u);
      } catch (_) { /* ignore */ }
    }
  }

  setMuted(m) { this.muted = m; }

  async _loadManifest() {
    try {
      const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (!res.ok) return; // no manifest -> auto-detect mode
      const data = await res.json();
      this.manifest = {
        phonemes: new Set((data.phonemes || []).map(s => String(s).toLowerCase())),
        words: new Set((data.words || []).map(s => String(s).toLowerCase())),
        cheer: !!data.cheer,
      };
      this.hasManifest = true;
    } catch (_) {
      // no/invalid manifest -> auto-detect mode
    }
  }

  // Resolve a recording URL if it exists, else null. Uses the manifest when
  // present (no network probing); otherwise HEAD-probes once and caches.
  async _resolve(kind, name) {
    const n = name.toLowerCase();
    const url = (kind === 'phoneme' ? PHONEME_DIR : WORD_DIR) + n + EXT;
    if (this.hasManifest) {
      if (kind === 'cheer') return this.manifest.cheer ? WORD_DIR + 'cheer' + EXT : null;
      const set = kind === 'phoneme' ? this.manifest.phonemes : this.manifest.words;
      return set.has(n) ? url : null;
    }
    // Auto-detect mode.
    const probe = kind === 'cheer' ? WORD_DIR + 'cheer' + EXT : url;
    return (await this._urlExists(probe)) ? probe : null;
  }

  async _urlExists(url) {
    if (this._exists.has(url)) return this._exists.get(url);
    let ok = false;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      ok = res.ok;
    } catch (_) {
      ok = false;
    }
    this._exists.set(url, ok);
    return ok;
  }

  _getAudio(url) {
    if (this._cache.has(url)) return this._cache.get(url);
    const a = new Audio(url);
    a.preload = 'auto';
    this._cache.set(url, a);
    return a;
  }

  _playFile(url) {
    return new Promise((resolve, reject) => {
      const a = this._getAudio(url);
      a.currentTime = 0;
      a.onended = () => resolve();
      a.onerror = () => reject(new Error('audio error: ' + url));
      const p = a.play();
      if (p && p.catch) p.catch(reject);
    });
  }

  _speak(text, { rate = 0.85, pitch = 1.25 } = {}) {
    return new Promise((resolve) => {
      if (!this._tts) { resolve(); return; }
      this._tts.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this._voice) u.voice = this._voice;
      u.rate = rate;
      u.pitch = pitch;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      this._tts.speak(u);
    });
  }

  // Play the pure sound of a single letter (for blending).
  async playPhoneme(letter) {
    if (this.muted) return;
    await this.ready;
    const l = letter.toLowerCase();
    const url = await this._resolve('phoneme', l);
    if (url) {
      try { await this._playFile(url); return; } catch (_) { /* fall through */ }
    }
    // Fallback: speak a phoneme hint slowly. Stretch vowels/continuants.
    const hint = PHONEME_HINTS[l] || l;
    await this._speak(hint, { rate: 0.7, pitch: 1.2 });
  }

  // Play the whole blended word.
  async playWord(word) {
    if (this.muted) return;
    await this.ready;
    const url = await this._resolve('word', word);
    if (url) {
      try { await this._playFile(url); return; } catch (_) { /* fall through */ }
    }
    await this._speak(word, { rate: 0.8, pitch: 1.15 });
  }

  // Short spoken praise on success.
  async praise() {
    if (this.muted) return;
    await this.ready;
    const cheers = ['Yay!', 'You did it!', 'Great reading!', 'Woohoo!', 'Magic!'];
    const url = await this._resolve('cheer', 'cheer');
    if (url) {
      try { await this._playFile(url); return; } catch (_) { /* fall through */ }
    }
    await this._speak(cheers[Math.floor(Math.random() * cheers.length)], { rate: 0.95, pitch: 1.4 });
  }
}
