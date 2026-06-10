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
const REC_DB = 'unicorn-reading';     // IndexedDB holding the grown-up's recordings
const REC_STORE = 'recordings';
const VOICE_KEY = 'unicorn-reading-voice'; // tweakable fallback-voice settings

// Sounds that can be held/stretched (vowels + continuant consonants). These get
// spoken slowly and drawn-out so they're clear for blending. Everything else is
// a short "stop" sound (b, c, d, g, ...) spoken briskly to keep the trailing
// "uh" as small as text-to-speech allows.
const CONTINUANTS = new Set(['a', 'e', 'i', 'o', 'u', 'f', 'l', 'm', 'n', 'r', 's', 'v', 'z']);

const wait = (ms) => new Promise(r => setTimeout(r, ms));

export class AudioManager {
  constructor() {
    this.unlocked = false;
    this.muted = false;
    this.hasManifest = false;
    this.manifest = { phonemes: [], words: [], cheer: false };
    this.ready = this._loadManifest();
    this._ctx = null;
    // Cache of whether a given URL exists (true/false). Avoids re-requesting.
    this._exists = new Map();
    // Cache of preloaded HTMLAudioElements by URL.
    this._cache = new Map();
    this._tts = ('speechSynthesis' in window) ? window.speechSynthesis : null;
    this._voice = null;
    // Tweakable fallback-voice settings (used for sounds not yet recorded).
    this._voiceURI = null;
    this._userRate = 1;    // speed multiplier
    this._userPitch = 1.1; // 0..2
    try {
      const s = JSON.parse(localStorage.getItem(VOICE_KEY) || '{}');
      if (s.uri) this._voiceURI = s.uri;
      if (s.rate) this._userRate = s.rate;
      if (s.pitch) this._userPitch = s.pitch;
    } catch (_) {}
    if (this._tts) {
      this._pickVoice();
      this._tts.onvoiceschanged = () => this._pickVoice();
    }
    // Grown-up's recordings, stored in IndexedDB and used in preference to TTS.
    this._recCache = new Map(); // key -> object URL
    this._dbPromise = null;
  }

  // English voices, best-sounding first (for the settings picker).
  voiceList() {
    if (!this._tts) return [];
    return this._tts.getVoices()
      .filter(v => /^en/i.test(v.lang))
      .sort((a, b) => this._scoreVoice(b) - this._scoreVoice(a));
  }

  getVoiceSettings() {
    return { uri: this._voice ? this._voice.voiceURI : null, rate: this._userRate, pitch: this._userPitch };
  }

  _saveVoiceSettings() {
    try {
      localStorage.setItem(VOICE_KEY, JSON.stringify({
        uri: this._voice ? this._voice.voiceURI : null,
        rate: this._userRate, pitch: this._userPitch,
      }));
    } catch (_) {}
  }

  setVoice(uri) {
    const v = this._tts && this._tts.getVoices().find(x => x.voiceURI === uri);
    if (!v) return;
    this._voice = v; this._voiceURI = uri; this._saveVoiceSettings();
  }
  setRate(r) { this._userRate = r; this._saveVoiceSettings(); }
  setPitch(p) { this._userPitch = p; this._saveVoiceSettings(); }

  // Audition the current fallback voice/settings.
  async sampleVoice() {
    for (const l of ['a', 'c', 't']) { await this._speakPhoneme(l); await wait(160); }
    await wait(150);
    await this._speak('cat', { rate: 0.85 });
  }

  // Pick the saved voice if available, else the best English one.
  _pickVoice() {
    if (!this._tts) return;
    const voices = this._tts.getVoices();
    let chosen = this._voiceURI ? voices.find(v => v.voiceURI === this._voiceURI) : null;
    if (!chosen) {
      chosen = voices.filter(v => /^en/i.test(v.lang)).sort((a, b) => this._scoreVoice(b) - this._scoreVoice(a))[0];
    }
    this._voice = chosen || voices[0] || null;
  }

  _scoreVoice(v) {
    let s = 0;
    const lang = (v.lang || '').replace('_', '-');
    if (/^en-AU/i.test(lang)) s += 50;
    else if (/^en-GB/i.test(lang)) s += 40;
    else if (/^en-(IE|NZ|ZA)/i.test(lang)) s += 28;
    else if (/^en-US/i.test(lang)) s += 22;
    else s += 10;
    const name = (v.name || '').toLowerCase();
    if (/(enhanced|premium|natural|neural|siri)/.test(name)) s += 22;
    if (/(female|samantha|karen|catherine|serena|fiona|moira|tessa|amelia|google uk english female|google australian)/.test(name)) s += 16;
    if (/compact/.test(name)) s -= 12;
    if (v.localService) s += 8;
    return s;
  }

  // --- Grown-up voice recordings (IndexedDB) ---
  _openDB() {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(REC_DB, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(REC_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._dbPromise;
  }

  _tx(mode, run) {
    return this._openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(REC_STORE, mode);
      const r = run(tx.objectStore(REC_STORE));
      tx.oncomplete = () => resolve(r && r.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  recKey(kind, name) { return kind + ':' + String(name).toLowerCase(); }

  async saveRecording(kind, name, blob) {
    const key = this.recKey(kind, name);
    await this._tx('readwrite', s => s.put(blob, key));
    const old = this._recCache.get(key);
    if (old) URL.revokeObjectURL(old);
    this._recCache.delete(key);
  }

  async deleteRecording(kind, name) {
    const key = this.recKey(kind, name);
    await this._tx('readwrite', s => s.delete(key));
    const old = this._recCache.get(key);
    if (old) URL.revokeObjectURL(old);
    this._recCache.delete(key);
  }

  async recordingURL(kind, name) {
    const key = this.recKey(kind, name);
    if (this._recCache.has(key)) return this._recCache.get(key);
    let blob = null;
    try { blob = await this._tx('readonly', s => s.get(key)); } catch (_) { blob = null; }
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this._recCache.set(key, url);
    return url;
  }

  async recordedKeys() {
    try { return new Set(await this._tx('readonly', s => s.getAllKeys())); }
    catch (_) { return new Set(); }
  }

  // Every recording as { key, blob } — for exporting a backup.
  async allRecordings() {
    try {
      const db = await this._openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(REC_STORE, 'readonly');
        const store = tx.objectStore(REC_STORE);
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();
        tx.oncomplete = () => resolve((keysReq.result || []).map((k, i) => ({ key: k, blob: valsReq.result[i] })));
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) { return []; }
  }

  // Write a recording under an exact key — for importing a backup.
  async putRecording(key, blob) {
    await this._tx('readwrite', s => s.put(blob, key));
    const old = this._recCache.get(key);
    if (old) URL.revokeObjectURL(old);
    this._recCache.delete(key);
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
    // Prepare the WebAudio context for reward sounds (created within a gesture).
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { this._ctx = new AC(); if (this._ctx.state === 'suspended') this._ctx.resume(); }
    } catch (_) { this._ctx = null; }
  }

  setMuted(m) { this.muted = m; }

  // --- Synthesised reward sounds (no audio files needed) ---
  _beep(freq, start, dur, { type = 'sine', gain = 0.18 } = {}) {
    if (!this._ctx) return;
    const t0 = this._ctx.currentTime + start;
    const osc = this._ctx.createOscillator();
    const g = this._ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this._ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Bright little "ping" when a token is collected.
  chime() {
    if (this.muted || !this._ctx) return;
    this._beep(880, 0, 0.16, { type: 'triangle', gain: 0.16 });
    this._beep(1320, 0.07, 0.18, { type: 'triangle', gain: 0.13 });
  }

  // Gentle "not quite" sound for a wrong picture (never harsh).
  nope() {
    if (this.muted || !this._ctx) return;
    this._beep(330, 0, 0.13, { type: 'sine', gain: 0.1 });
    this._beep(247, 0.1, 0.18, { type: 'sine', gain: 0.1 });
  }

  // Happy ascending fanfare when a whole quest is completed.
  fanfare() {
    if (this.muted || !this._ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => this._beep(f, i * 0.12, 0.5, { type: 'triangle', gain: 0.16 }));
    this._beep(1318.5, notes.length * 0.12, 0.6, { type: 'triangle', gain: 0.12 }); // E6 sparkle
  }

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

  _speak(text, { rate = 0.85, pitch } = {}) {
    return new Promise((resolve) => {
      if (!this._tts) { resolve(); return; }
      this._tts.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this._voice) { u.voice = this._voice; u.lang = this._voice.lang; }
      u.rate = Math.max(0.1, Math.min(2, rate * this._userRate));
      u.pitch = Math.max(0, Math.min(2, pitch != null ? pitch : this._userPitch));
      u.onend = () => resolve();
      u.onerror = () => resolve();
      this._tts.speak(u);
    });
  }

  // Speak a single letter SOUND via TTS, tuned for phonics blending.
  _speakPhoneme(letter) {
    const l = letter.toLowerCase();
    const hint = PHONEME_HINTS[l] || l;
    const stretchy = CONTINUANTS.has(l);
    // Continuants: slow & held. Stops: brisk to minimise the trailing schwa.
    return this._speak(hint, { rate: stretchy ? 0.5 : 0.9 });
  }

  // Try a grown-up's recording first, then a bundled file. Returns true if a
  // recording/file is the source for this sound. IMPORTANT: if a recording
  // exists we ALWAYS report true (and never speak with the robot), so a saved
  // voice is never randomly replaced by text-to-speech — even if a single
  // playback gets interrupted (e.g. rapid taps).
  async _playRecordedOrFile(kind, name) {
    const rec = await this.recordingURL(kind, name);
    if (rec) {
      try { await this._playFile(rec); } catch (_) { /* keep using her voice; just skip this blip */ }
      return true;
    }
    const url = await this._resolve(kind, name);
    if (url) {
      try { await this._playFile(url); return true; } catch (_) { /* fall through to TTS */ }
    }
    return false;
  }

  // Play the pure sound of a single letter (for blending).
  async playPhoneme(letter) {
    if (this.muted) return;
    await this.ready;
    const l = letter.toLowerCase();
    if (await this._playRecordedOrFile('phoneme', l)) return;
    await this._speakPhoneme(l);
  }

  // Play the whole blended word.
  async playWord(word) {
    if (this.muted) return;
    await this.ready;
    if (await this._playRecordedOrFile('word', word)) return;
    await this._speak(word, { rate: 0.85 });
  }

  // Short spoken praise on success.
  async praise() {
    if (this.muted) return;
    await this.ready;
    if (await this._playRecordedOrFile('cheer', 'cheer')) return;
    const cheers = ['Yay!', 'You did it!', 'Great reading!', 'Woohoo!', 'Magic!'];
    await this._speak(cheers[Math.floor(Math.random() * cheers.length)], { rate: 0.95, pitch: 1.25 });
  }
}
