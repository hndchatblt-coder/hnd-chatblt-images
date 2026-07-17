/* ================= Unicorn Academy — audio system =================
   Speech (Web Speech API) + procedural music/SFX (WebAudio). One mix bus:
   master -> destination; musicGain + sfxGain -> master. Narration ducks
   musicGain via setTargetAtTime. Everything is a safe no-op before init(). */
'use strict';
window.UA = window.UA || {};
UA.audio = UA.audio || {};

(() => {
/* ---------- state ---------- */
let ctx = null, master = null, musicGain = null, sfxGain = null;
let ducking = false;
const toggles = { voice: 1, sfx: 1, music: 1, vol: 1 };

let voice = null, hasVoices = false;
let voiceReadyResolve;
UA.audio.voiceReady = new Promise((res) => { voiceReadyResolve = res; });

let speakGen = 0;
let activeSession = null;   // current music session (see startMusic)
let currentMusicOffset = null;
let noiseBuf = null;
const returnCbs = [];

const rnd = (n) => (UA.rand ? UA.rand(n) : Math.floor(Math.random() * n));

/* ---------- voice selection ----------
   Poll getVoices() every 150ms up to 2s AND listen for voiceschanged;
   settle exactly once; console.info the result either way. */
function pickVoice(list) {
  const find = (pred) => list.find(pred);
  return find((v) => v.lang === 'en-AU') || find((v) => /^en-au$/i.test(v.lang || '')) ||
    find((v) => v.lang === 'en-GB') || find((v) => /^en-gb$/i.test(v.lang || '')) ||
    find((v) => v.lang === 'en-US') || find((v) => /^en-us$/i.test(v.lang || '')) ||
    find((v) => /^en/i.test(v.lang || '')) || null;
}
function initVoices() {
  const synth = window.speechSynthesis;
  if (!synth) { console.info('UA voice: no voices available'); voiceReadyResolve(); return; }
  let settled = false;
  const settle = (list) => {
    if (settled) return;
    settled = true;
    hasVoices = list.length > 0;
    voice = hasVoices ? pickVoice(list) : null;
    UA.audio.voice = voice;
    console.info('UA voice: ' + (voice ? voice.name + ' (' + voice.lang + ')' : 'no voices available'));
    try { synth.removeEventListener('voiceschanged', onChanged); } catch (e) {}
    clearInterval(poll);
    voiceReadyResolve();
  };
  const onChanged = () => { const l = synth.getVoices() || []; if (l.length) settle(l); };
  try { synth.addEventListener('voiceschanged', onChanged); } catch (e) {}
  let elapsed = 0;
  const poll = setInterval(() => {
    elapsed += 150;
    const l = synth.getVoices() || [];
    if (l.length) settle(l);
    else if (elapsed >= 2000) settle(l);
  }, 150);
  const first = synth.getVoices() || [];
  if (first.length) settle(first);
}
initVoices();

/* ---------- init (call once inside the first user gesture) ---------- */
UA.audio.init = function () {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = toggles.vol; master.connect(ctx.destination);
        musicGain = ctx.createGain(); musicGain.gain.value = 1; musicGain.connect(master);
        sfxGain = ctx.createGain(); sfxGain.gain.value = 1; sfxGain.connect(master);
      }
    } catch (e) { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  try {
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u); // fires inside this gesture to unlock TTS on iOS
    }
  } catch (e) {}
};

/* ---------- mix bus: ducking ---------- */
function applyMusicGain(immediate) {
  if (!musicGain || !ctx) return;
  const target = toggles.music ? (ducking ? 0.35 : 1) : 0;
  const now = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(musicGain.gain.value, now);
  if (immediate) musicGain.gain.setValueAtTime(target, now);
  else musicGain.gain.setTargetAtTime(target, now, ducking ? 0.15 : 0.5);
}
UA.audio.duck = function (on) { ducking = !!on; applyMusicGain(false); };

/* ---------- speak: the one speak-helper ---------- */
function chunkText(text) {
  text = (text || '').toString().trim();
  if (!text) return [''];
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const chunks = []; let cur = '';
  const flush = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; };
  sentences.forEach((raw) => {
    let s = raw.trim(); if (!s) return;
    while (s.length > 180) {
      let cut = s.lastIndexOf(' ', 180); if (cut < 40) cut = 180;
      const piece = s.slice(0, cut).trim();
      if (cur && (cur + ' ' + piece).trim().length > 180) flush();
      cur = cur ? cur + ' ' + piece : piece; flush();
      s = s.slice(cut).trim();
    }
    if (cur && (cur + ' ' + s).trim().length > 180) flush();
    cur = cur ? cur + ' ' + s : s;
  });
  flush();
  return chunks.length ? chunks : [text];
}
function silentPath(text) {
  const words = (text || '').toString().trim().split(/\s+/).filter(Boolean).length || 1;
  const ms = Math.max(600, words * 55);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function speakChunks(chunks, idx, gen, pitch, rate, resolve) {
  if (gen !== speakGen) { resolve(); return; } // superseded — newer chain owns ducking now
  if (idx >= chunks.length) { UA.audio.duck(false); resolve(); return; }
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(chunks[idx]);
  u.pitch = pitch; u.rate = rate;
  if (voice) u.voice = voice;
  let done = false;
  const advance = () => { if (done) return; done = true; clearTimeout(safety); speakChunks(chunks, idx + 1, gen, pitch, rate, resolve); };
  u.onend = advance; u.onerror = advance;
  const safety = setTimeout(advance, 12000);
  try { synth.speak(u); } catch (e) { advance(); }
}
UA.audio.speak = function (text, opts) {
  opts = opts || {};
  const pitch = opts.pitch != null ? opts.pitch : 1.1;
  const rate = opts.rate != null ? opts.rate : 0.9;
  const interrupt = opts.interrupt !== false;
  if (interrupt) {
    speakGen++;
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
  }
  const gen = speakGen;
  if (!toggles.voice || !window.speechSynthesis || !hasVoices) return silentPath(text);
  return new Promise((resolve) => {
    const chunks = chunkText(text);
    const begin = () => {
      if (gen !== speakGen) { resolve(); return; } // cancelled again during the 100ms gap
      UA.audio.duck(true);
      speakChunks(chunks, 0, gen, pitch, rate, resolve);
    };
    if (interrupt) setTimeout(begin, 100); else begin(); // iOS swallows speak() right after cancel()
  });
};
UA.audio.speakSound = function (key) {
  const snd = UA.soundOf ? UA.soundOf(key) : null;
  return UA.audio.speak(snd ? snd.say : String(key), { rate: 0.8 });
};
UA.audio.stopSpeech = function () {
  speakGen++;
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
  UA.audio.duck(false);
};

/* ---------- toggles ---------- */
UA.audio.setToggles = function (t) {
  t = t || {};
  if (t.voice != null) toggles.voice = t.voice ? 1 : 0;
  if (t.sfx != null) toggles.sfx = t.sfx ? 1 : 0;
  if (t.music != null) { toggles.music = t.music ? 1 : 0; applyMusicGain(true); }
  if (t.vol != null) {
    toggles.vol = t.vol;
    if (master && ctx) { const now = ctx.currentTime; master.gain.cancelScheduledValues(now); master.gain.setTargetAtTime(t.vol, now, 0.1); }
  }
};

/* ---------- music: pentatonic ambient bed, lookahead scheduler ---------- */
function playToneInto(bus, freq, time, dur, type, peak) {
  if (!ctx) return null;
  const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, time);
  const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, time);
  env.gain.linearRampToValueAtTime(peak, time + dur * 0.25);   // soft attack
  env.gain.setTargetAtTime(0.0001, time + dur * 0.25, dur * 0.35); // soft release
  osc.connect(env); env.connect(bus);
  osc.start(time); osc.stop(time + dur + 1);
  osc.onended = () => { try { osc.disconnect(); env.disconnect(); } catch (e) {} };
  return osc;
}
function scheduleSession(s) {
  const lookahead = ctx.currentTime + 0.6;
  while (s.nextMelody < lookahead) {
    const step = rnd(3) - 1; // -1, 0, 1 random walk
    s.melodyIdx = Math.max(0, Math.min(s.scale.length - 1, s.melodyIdx + step));
    const freq = s.base * Math.pow(2, s.scale[s.melodyIdx] / 12);
    playToneInto(s.gain, freq, s.nextMelody, 2.5, 'triangle', 0.09);
    s.nextMelody += 1.2 + Math.random() * 0.8;
  }
  while (s.nextBass < lookahead) {
    playToneInto(s.gain, s.base / 2, s.nextBass, 3.2, 'sine', 0.11);
    s.nextBass += 4 + Math.random() * 0.6;
  }
}
function createMusicSession(offset) {
  const gain = ctx.createGain(); gain.gain.value = 0.0001; gain.connect(musicGain);
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.12 + Math.random() * 0.06;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.05;
  lfo.connect(lfoGain); lfoGain.connect(gain.gain); lfo.start();
  const s = {
    gain, lfo, lfoGain, offset, base: 220 * Math.pow(2, offset / 12),
    scale: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21], melodyIdx: 4,
    nextMelody: ctx.currentTime + 0.1, nextBass: ctx.currentTime + 0.5, timer: null,
  };
  s.timer = setInterval(() => scheduleSession(s), 200);
  scheduleSession(s);
  return s;
}
function stopMusicSession(s) {
  if (s.timer) clearInterval(s.timer);
  try { s.lfo.stop(); } catch (e) {}
  setTimeout(() => { try { s.gain.disconnect(); s.lfoGain.disconnect(); } catch (e) {} }, 200);
}
UA.audio.startMusic = function (zoneKeyOffset) {
  if (!ctx) return;
  const offset = zoneKeyOffset || 0;
  if (currentMusicOffset === offset && activeSession) return; // idempotent
  currentMusicOffset = offset;
  const prev = activeSession;
  const session = createMusicSession(offset);
  activeSession = session;
  const now = ctx.currentTime;
  session.gain.gain.setValueAtTime(0.0001, now);
  session.gain.gain.linearRampToValueAtTime(1, now + 1); // ~1s crossfade in
  if (prev) {
    const t = ctx.currentTime;
    prev.gain.gain.cancelScheduledValues(t);
    prev.gain.gain.setValueAtTime(prev.gain.gain.value, t);
    prev.gain.gain.linearRampToValueAtTime(0.0001, t + 1); // ~1s crossfade out
    setTimeout(() => stopMusicSession(prev), 1100);
  }
};
UA.audio.stopMusic = function () {
  if (!activeSession) return;
  const s = activeSession; activeSession = null; currentMusicOffset = null;
  if (ctx) {
    const t = ctx.currentTime;
    s.gain.gain.cancelScheduledValues(t);
    s.gain.gain.setValueAtTime(s.gain.gain.value, t);
    s.gain.gain.linearRampToValueAtTime(0.0001, t + 0.8);
  }
  setTimeout(() => stopMusicSession(s), 900);
};

/* ---------- SFX: one feedback grammar, synthesised, never harsh ---------- */
function getNoiseBuffer() {
  if (!ctx) return null;
  if (noiseBuf) return noiseBuf;
  const len = ctx.sampleRate; // 1s, reused for every noise-based effect
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function tone(freq, startOffset, dur, type, peak) {
  if (!ctx) return;
  const t = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
  const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.015);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env); env.connect(sfxGain);
  osc.start(t); osc.stop(t + dur + 0.05);
}
function noiseBurst(startOffset, dur, filterType, filterFreq, peak) {
  if (!ctx) return;
  const buf = getNoiseBuffer(); if (!buf) return;
  const t = ctx.currentTime + startOffset;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const filt = ctx.createBiquadFilter(); filt.type = filterType; filt.frequency.setValueAtTime(filterFreq, t);
  const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt); filt.connect(env); env.connect(sfxGain);
  src.start(t); src.stop(t + dur + 0.05);
  return filt;
}
function fxChime() { tone(1318.5, 0, 0.25, 'sine', 0.22); tone(1318.5, 0, 0.25, 'triangle', 0.12); tone(1568.0, 0.09, 0.32, 'sine', 0.24); tone(1568.0, 0.09, 0.32, 'triangle', 0.13); }
function fxBoop() { tone(180, 0, 0.35, 'sine', 0.18); }
function fxFlourish() { [0, 2, 4, 7, 9].forEach((d, i) => tone(440 * Math.pow(2, d / 12), i * 0.09, 0.35, 'triangle', 0.16)); }
function fxFanfare() {
  [0, 4, 7, 12, 7, 12, 16, 19].forEach((d, i) => tone(440 * Math.pow(2, d / 12), i * 0.13, 0.4, 'triangle', 0.18));
  [0, 4, 7].forEach((d) => tone(220 * Math.pow(2, d / 12), 0, 0.5, 'sine', 0.12));
  [0, 4, 7, 12].forEach((d) => tone(440 * Math.pow(2, d / 12), 8 * 0.13, 0.6, 'sine', 0.14));
}
function fxSparkleArp() {
  [0, 2, 4, 7, 9, 12].forEach((d, i) => {
    const f = 1760 * Math.pow(2, d / 12);
    tone(f, i * 0.045, 0.2, 'sine', 0.12); tone(f * 1.01, i * 0.045, 0.2, 'triangle', 0.06);
  });
}
function fxPop() { tone(900, 0, 0.06, 'square', 0.07); }
function fxWhoosh() {
  const f = noiseBurst(0, 0.3, 'bandpass', 300, 0.22);
  if (f) { const t = ctx.currentTime; f.Q.value = 0.8; f.frequency.exponentialRampToValueAtTime(3000, t + 0.3); }
}
function fxGiggle() { [0, 0.09, 0.18].forEach((off, i) => tone(500 + i * 90, off, 0.12, 'sine', 0.18)); }
function fxYawn() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(420, t); osc.frequency.exponentialRampToValueAtTime(160, t + 1.1);
  const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(0.2, t + 0.15); env.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  osc.connect(env); env.connect(sfxGain); osc.start(t); osc.stop(t + 1.25);
}
function fxCrack() { noiseBurst(0, 0.12, 'highpass', 1200, 0.3); tone(90, 0.02, 0.15, 'sine', 0.3); }
function fxMunch() { [0, 0.22].forEach((off) => tone(140, off, 0.14, 'sine', 0.22)); }
function guarded(fn) { return () => { if (!ctx || !toggles.sfx) return; try { fn(); } catch (e) {} }; }
UA.audio.sfx = {
  chime: guarded(fxChime), boop: guarded(fxBoop), flourish: guarded(fxFlourish), fanfare: guarded(fxFanfare),
  sparkleArp: guarded(fxSparkleArp), pop: guarded(fxPop), whoosh: guarded(fxWhoosh), giggle: guarded(fxGiggle),
  yawn: guarded(fxYawn), crack: guarded(fxCrack), munch: guarded(fxMunch),
};

/* ---------- garnish + return-from-background ---------- */
UA.audio.vibrate = function (pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) {} };
UA.audio.onReturn = function (cb) { if (typeof cb === 'function') returnCbs.push(cb); };
function handleReturn() {
  try { window.speechSynthesis && window.speechSynthesis.resume(); } catch (e) {}
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} // zombie utterances after lock
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  returnCbs.forEach((cb) => { try { cb(); } catch (e) {} });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) handleReturn(); });
window.addEventListener('pageshow', handleReturn);
})();
