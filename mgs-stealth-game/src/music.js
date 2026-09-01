// src/music.js
// PUBLIC API:
//   Game.MUSIC — tunable constants:
//     {
//       MASTER_GAIN: 0.5,   // overall output level, applied once above every track
//       CROSSFADE_S: 1.5,   // seconds a track-to-track crossfade ramp takes
//     }
//
//   ---- PURE SIDE (node-testable, no WebAudio, no THREE, no DOM, no
//   Math.random/Date) ------------------------------------------------------
//
//   Game.musicState(squadPhase, prevTrack) -> track name ("sneak" | "combat" |
//     "evasion" | "caution"). Deterministic mapping:
//       INFILTRATION -> "sneak"
//       ALERT        -> "combat"
//       EVASION      -> "evasion"
//       CAUTION      -> "caution"
//     Any other/unrecognized squadPhase falls back to prevTrack (or "sneak"
//     if prevTrack is null/undefined) rather than throwing — music must never
//     be the thing that crashes on an unexpected phase string.
//
//   Game.createMusicDirector() -> director, { update(phase) -> result }
//     Tracks state internally (a single `prevTrack` closure var) and is pure
//     JS — safe to construct and drive from node tests, no side effects.
//     update(phase) result:
//       { track: string,   // Game.musicState(phase, prevTrack)
//         sting: boolean,  // true exactly on a transition INTO "combat" from
//                          // any other track (one-shot "!" stinger — see
//                          // guardAI.js's broadcastAlert, the gameplay event
//                          // this mirrors) — never true while already combat.
//         changed: boolean,// true iff track !== the previous call's track
//                          // (including the very first call, since there is
//                          // no previous track yet).
//         resolve: boolean,// true exactly on a transition FROM "caution" TO
//                          // "sneak" (i.e. squad.phase CAUTION -> INFILTRATION
//                          // timing out, per guardAI.js's squad.tick contract)
//                          // — a one-shot resolving motif layered over the
//                          // sneak ambient that has just faded back in.
//       }
//     Every field is computed relative to the director's OWN prevTrack, so
//     driving update() with the same phase repeatedly yields sting/resolve
//     false and changed false after the first call.
//
//   ---- SYNTH SIDE (BROWSER ONLY — WebAudio; never call from node) --------
//
//   Game.createMusic({ director? }) -> music, { update(engine) }
//     director: optional Game.createMusicDirector() instance to drive (a
//       fresh one is created if omitted).
//     music.update(engine) — call once per rendered frame (see src/boot.js's
//       frame loop, after hud.render). Per call:
//       1. Lazily constructs the single AudioContext on the FIRST call ever
//          (never at module load — see AUDIO ISOLATION below). Also nudges
//          audioCtx.resume() if the context is suspended (belt-and-braces;
//          the real gesture unlock happens in src/boot.js, see that file's
//          comment on why the very first update() call is made synchronously
//          from inside the Enter-keydown handler).
//       2. director.update(engine.squad.phase) -> result (see pure side).
//       3. result.changed -> CROSSFADE to result.track: the outgoing track's
//          GainNode ramps to 0 and the incoming track's GainNode ramps to 1,
//          both via linearRampToValueAtTime over Game.MUSIC.CROSSFADE_S
//          seconds (~1.5s) -- no hard cuts, ever, between the four
//          continuous beds (sneak/combat/evasion/caution). Each continuous
//          track is built ONCE, lazily, the first time it's needed, and then
//          left running forever (oscillators never stop) -- only its own
//          GainNode's envelope is touched on subsequent crossfades, keeping
//          node count fixed at "at most 4 continuous voice graphs" rather
//          than rebuilding graphs on every switch.
//       4. result.sting -> fires the one-shot "sting" stinger (additive, its
//          own ephemeral gain node straight into master, NOT part of the
//          crossfade machinery -- it layers over whatever bed is playing).
//       5. result.resolve -> fires the one-shot "resolve" descending motif
//          (same additive one-shot treatment, layered over the sneak bed
//          that result.changed will have already started crossfading back
//          in this same call, since CAUTION->INFILTRATION flips track to
//          "sneak" and resolve on the same tick -- see the director contract
//          above).
//       6. engine.gameOver false->true edge (a LOCAL prevGameOver flag here,
//          NOT part of the director/result above -- see DEATH STING + BED
//          DUCK below) -> fires the one-shot "deathSting" additively into
//          masterGain, then ramps every built continuous track's own
//          GainNode to 0 over 1s and leaves it there (never un-ducked; see
//          below for why no undo path is needed).
//     AUDIO ISOLATION (project mandate, see CLAUDE.md): the ENTIRE body of
//     update() runs inside one try/catch. Any throw -- AudioContext missing,
//     a node call failing, anything -- logs a single console.warn (never
//     more than once, even across thousands of subsequent calls) and flips a
//     permanent `broken` flag; every later update() call is then an
//     immediate no-op. Music can never crash the game, and a headless/no-
//     audio-device environment (screenshot.js's Playwright Chromium) degrades
//     silently instead of throwing a page error.
//     No AudioContext is ever constructed at module load time -- only lazily,
//     inside update()'s try block, the first time update() actually runs (by
//     which point src/boot.js guarantees a real user gesture -- Enter -- has
//     already occurred; see that file).
//
//   Procedural synth design per track (oscillators/noise/filters/gain LFOs
//   only -- zero external audio assets):
//     "sneak"   -- two detuned sawtooths (+/-7 cents) through a ~120Hz
//                  lowpass, a slow sine LFO wobbling that cutoff, and a
//                  bandpass-filtered noise bed whose gain is swelled by an
//                  8-second sine LFO (soft filtered-noise swells). Very quiet
//                  overall (small gain values throughout).
//     "sting"   -- one-shot: three detuned sawtooths (a stacked minor-third/
//                  fifth brass voicing) through a lowpass, fast-attack
//                  (~10ms) then ~1.2s exponential decay, plus a separate sine
//                  sub-thump (~50Hz, ~0.3s decay) for weight.
//     "combat"  -- a square bass oscillator through a lowpass, gated by a
//                  square LFO at the 140bpm eighth-note rate (driving pulse,
//                  no per-note scheduling needed -- sample-accurate via
//                  AudioParam modulation instead of setTimeout), a
//                  highpass-filtered noise "hat" gated at double that rate,
//                  and a steady two-oscillator minor-third drone underneath
//                  for tension.
//     "evasion" -- a low sine "kick" gated by a ~1.25Hz LFO (heartbeat-ish,
//                  no melody), plus bandpass-filtered noise swept slowly by a
//                  sine LFO across its center frequency (rising/falling
//                  filter sweeps).
//     "caution" -- four triangle oscillators voicing a minor triad plus one
//                  slightly-detuned doubled root (gentle dissonance/beating),
//                  through a lowpass, with a slow LFO breathing the pad's
//                  overall gain.
//     "resolve" -- one-shot: four sequential sine/triangle notes (a short
//                  descending motif), each its own gain-enveloped voice
//                  scheduled via oscillator start/stop times (sample-
//                  accurate, no setTimeout).
//     "deathSting" -- one-shot (new -- feedback cycle): mirrors "sting"'s own
//                  construction (a stacked minor-third/fifth brassy voicing
//                  of detuned sawtooths through a lowpass, plus a separate
//                  sine sub for weight) but DESCENDING and slower -- each
//                  oscillator's frequency (including the sub) portamento-
//                  glides down an octave via exponentialRampToValueAtTime
//                  over the full ~2s decay, instead of "sting"'s fixed-pitch
//                  hit. A dark, falling "you lost" cadence rather than the
//                  alert sting's sharp brass stab.
//
//   DEATH STING + BED DUCK (new -- feedback cycle, see src/engine.js's
//   gameOver contract): deliberately NOT plumbed through the pure director
//   above (createMusicDirector stays phase-only, unaware gameOver even
//   exists -- see tests/feedback.test.js's own re-pinning assertions that
//   guard against this leaking). Instead, createMusic's own update(engine)
//   keeps a SEPARATE local `prevGameOver` closure flag and edge-detects
//   engine.gameOver directly (the same "read engine.events/engine state,
//   never assume a caller tells you" posture director.update(phase) itself
//   can't take since it never sees engine at all). On the false->true edge:
//   fires playDeathSting once (additive into masterGain, exactly like
//   playSting/playResolve -- unaffected by the duck below since it doesn't
//   route through any per-track gain node), then ramps every currently-BUILT
//   continuous track's own GainNode (tracks[name].gain.gain, the same nodes
//   crossfadeTo already animates) to 0 over 1s and leaves it there -- "the
//   silence IS the feedback" per this cycle's design brief. Never un-ducks:
//   engine.gameOver is a LATCH (see src/engine.js's FROZEN ENGINE note) that
//   never reverts to false on its own, and a retry-after-death goes through
//   src/boot.js's runGame() -> a brand-new Game.createMusic() instance (read,
//   not modified, this cycle -- verified runGame() already does this for
//   every fresh playthrough including a game-over retry), so there is no
//   in-place "undo the duck" path this module needs to handle.
//   The only non-deterministic-looking input anywhere in the synth is
//   audioCtx.currentTime (the sanctioned audio clock -- see CLAUDE.md/file
//   header) plus a small local xorshift PRNG used ONLY to fill noise-texture
//   buffers (audio color, not game logic -- deliberately NOT Math.random, to
//   keep the "no Math.random" discipline even here). No Date, no
//   Math.random, anywhere in this file.
//
// Model/view split: the PURE SIDE (musicState/createMusicDirector) has zero
// WebAudio/DOM and is exercised headless by tests/music.test.js, mirroring
// how src/radar.js and src/hud.js split their own pure model from their
// browser-only view. The SYNTH SIDE (createMusic) is browser-only and
// deliberately untested headless (see tests/music.test.js's own header) --
// screenshot.js exercising it in real (or audio-less headless) Chromium
// without throwing IS the verification for that half.
(function (Game) {
  var MUSIC = {
    MASTER_GAIN: 0.5,
    CROSSFADE_S: 1.5,
  };

  // ==== PURE SIDE =============================================================

  var TRACK_BY_PHASE = {
    INFILTRATION: "sneak",
    ALERT: "combat",
    EVASION: "evasion",
    CAUTION: "caution",
  };

  function musicState(squadPhase, prevTrack) {
    var mapped = TRACK_BY_PHASE[squadPhase];
    if (mapped !== undefined) return mapped;
    return prevTrack !== undefined && prevTrack !== null ? prevTrack : "sneak";
  }

  function createMusicDirector() {
    var prevTrack = null; // no track has ever been reported yet

    function update(phase) {
      var track = musicState(phase, prevTrack);
      var changed = track !== prevTrack;
      var sting = track === "combat" && prevTrack !== "combat";
      var resolve = prevTrack === "caution" && track === "sneak";
      prevTrack = track;
      return { track: track, sting: sting, changed: changed, resolve: resolve };
    }

    return { update: update };
  }

  // ==== SYNTH SIDE (browser only) ==============================================

  // Small deterministic xorshift32 PRNG -- used ONLY to fill noise-texture
  // buffers (audio color). Not Math.random, not Date; a fixed seed always
  // produces the same texture. Never exposed, never part of the contract.
  function fillNoise(data, seed) {
    var s = seed >>> 0 || 1;
    for (var i = 0; i < data.length; i++) {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      data[i] = (s / 4294967296) * 2 - 1;
    }
  }

  function makeNoiseBuffer(ctx, seconds, seed) {
    var length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    fillNoise(buffer.getChannelData(0), seed);
    return buffer;
  }

  // ---- continuous track builders: each connects a permanent voice graph
  // into `dest` (a per-track GainNode the caller owns and crossfades) and
  // starts every oscillator/source immediately. Never stopped -- see file
  // header for why persistent-forever + gain-envelope crossfades keeps node
  // count fixed and modest.

  function buildSneak(ctx, dest) {
    var now = ctx.currentTime;

    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 120;
    filter.Q.value = 0.6;

    var droneGain = ctx.createGain();
    droneGain.gain.value = 0.5;

    var osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.value = 55;
    osc1.detune.value = -7;
    var osc2 = ctx.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.value = 55;
    osc2.detune.value = 7;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(dest);

    // slow LFO wobbling the lowpass cutoff, 100..140Hz
    var lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.06;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 20;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    // soft filtered-noise swells, ~8s period
    var noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = makeNoiseBuffer(ctx, 2, 0x9e3779b1);
    noiseSrc.loop = true;
    var noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 700;
    noiseFilter.Q.value = 0.9;
    var swellGain = ctx.createGain();
    swellGain.gain.value = 0.025;
    var swellLfo = ctx.createOscillator();
    swellLfo.type = "sine";
    swellLfo.frequency.value = 1 / 8;
    var swellLfoGain = ctx.createGain();
    swellLfoGain.gain.value = 0.02;
    swellLfo.connect(swellLfoGain);
    swellLfoGain.connect(swellGain.gain);
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(swellGain);
    swellGain.connect(dest);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);
    swellLfo.start(now);
    noiseSrc.start(now);
  }

  function buildCombat(ctx, dest) {
    var now = ctx.currentTime;
    var pulseHz = (140 / 60) * 2; // 140bpm eighth-note rate, ~4.667Hz

    var bassFilter = ctx.createBiquadFilter();
    bassFilter.type = "lowpass";
    bassFilter.frequency.value = 320;
    bassFilter.Q.value = 1;
    var bassGain = ctx.createGain();
    bassGain.gain.value = 0.5;
    var bassOsc = ctx.createOscillator();
    bassOsc.type = "square";
    bassOsc.frequency.value = 55;
    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(dest);

    // driving 8th-note pulse via a square LFO gating bassGain -- sample
    // accurate, no per-note setTimeout scheduling needed.
    var pulseLfo = ctx.createOscillator();
    pulseLfo.type = "square";
    pulseLfo.frequency.value = pulseHz;
    var pulseLfoGain = ctx.createGain();
    pulseLfoGain.gain.value = 0.5;
    pulseLfo.connect(pulseLfoGain);
    pulseLfoGain.connect(bassGain.gain);

    // percussive filtered-noise hats, double the pulse rate
    var hatSrc = ctx.createBufferSource();
    hatSrc.buffer = makeNoiseBuffer(ctx, 1, 0x85ebca6b);
    hatSrc.loop = true;
    var hatFilter = ctx.createBiquadFilter();
    hatFilter.type = "highpass";
    hatFilter.frequency.value = 5000;
    var hatGain = ctx.createGain();
    hatGain.gain.value = 0.06;
    var hatLfo = ctx.createOscillator();
    hatLfo.type = "square";
    hatLfo.frequency.value = pulseHz * 2;
    var hatLfoGain = ctx.createGain();
    hatLfoGain.gain.value = 0.06;
    hatLfo.connect(hatLfoGain);
    hatLfoGain.connect(hatGain.gain);
    hatSrc.connect(hatFilter);
    hatFilter.connect(hatGain);
    hatGain.connect(dest);

    // tense minor-third drone underneath
    var droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 500;
    var droneGain = ctx.createGain();
    droneGain.gain.value = 0.12;
    var droneOsc1 = ctx.createOscillator();
    droneOsc1.type = "sawtooth";
    droneOsc1.frequency.value = 110;
    var droneOsc2 = ctx.createOscillator();
    droneOsc2.type = "sawtooth";
    droneOsc2.frequency.value = 130.81; // minor third above 110Hz
    droneOsc1.connect(droneFilter);
    droneOsc2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(dest);

    bassOsc.start(now);
    pulseLfo.start(now);
    hatSrc.start(now);
    hatLfo.start(now);
    droneOsc1.start(now);
    droneOsc2.start(now);
  }

  function buildEvasion(ctx, dest) {
    var now = ctx.currentTime;

    // heartbeat-ish kick, no melody
    var kickOsc = ctx.createOscillator();
    kickOsc.type = "sine";
    kickOsc.frequency.value = 58;
    var kickGain = ctx.createGain();
    kickGain.gain.value = 0.4;
    var kickLfo = ctx.createOscillator();
    kickLfo.type = "sine";
    kickLfo.frequency.value = 1.25;
    var kickLfoGain = ctx.createGain();
    kickLfoGain.gain.value = 0.4;
    kickLfo.connect(kickLfoGain);
    kickLfoGain.connect(kickGain.gain);
    kickOsc.connect(kickGain);
    kickGain.connect(dest);

    // rising/falling filter sweeps over a noise bed
    var noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = makeNoiseBuffer(ctx, 2, 0xc2b2ae35);
    noiseSrc.loop = true;
    var sweepFilter = ctx.createBiquadFilter();
    sweepFilter.type = "bandpass";
    sweepFilter.frequency.value = 900;
    sweepFilter.Q.value = 1.2;
    var sweepGain = ctx.createGain();
    sweepGain.gain.value = 0.08;
    var sweepLfo = ctx.createOscillator();
    sweepLfo.type = "sine";
    sweepLfo.frequency.value = 0.12;
    var sweepLfoGain = ctx.createGain();
    sweepLfoGain.gain.value = 750; // keeps sweepFilter.frequency comfortably positive
    sweepLfo.connect(sweepLfoGain);
    sweepLfoGain.connect(sweepFilter.frequency);
    noiseSrc.connect(sweepFilter);
    sweepFilter.connect(sweepGain);
    sweepGain.connect(dest);

    kickOsc.start(now);
    kickLfo.start(now);
    noiseSrc.start(now);
    sweepLfo.start(now);
  }

  function buildCaution(ctx, dest) {
    var now = ctx.currentTime;

    var padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 900;
    var padGain = ctx.createGain();
    padGain.gain.value = 0.3;

    // minor triad (root, minor third, fifth) + a slightly detuned doubled
    // root for gentle dissonance/beating.
    var freqs = [110, 130.81, 164.81, 110.6];
    freqs.forEach(function (f) {
      var o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(padFilter);
      o.start(now);
    });
    padFilter.connect(padGain);
    padGain.connect(dest);

    var swellLfo = ctx.createOscillator();
    swellLfo.type = "sine";
    swellLfo.frequency.value = 0.1;
    var swellLfoGain = ctx.createGain();
    swellLfoGain.gain.value = 0.08;
    swellLfo.connect(swellLfoGain);
    swellLfoGain.connect(padGain.gain);
    swellLfo.start(now);
  }

  // ---- one-shots: ephemeral graphs, additive straight into `dest` (never
  // part of the crossfade machinery), self-contained decay envelopes.

  function playSting(ctx, dest) {
    var now = ctx.currentTime;
    var decay = 1.2;

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.9, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
    gain.connect(dest);

    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2200;
    filter.connect(gain);

    // stacked minor-third + fifth brassy hit
    var freqs = [220, 220 * Math.pow(2, 3 / 12), 220 * Math.pow(2, 7 / 12)];
    freqs.forEach(function (f, i) {
      var o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = (i - 1) * 6;
      o.connect(filter);
      o.start(now);
      o.stop(now + decay + 0.1);
    });

    var subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(0.8, now + 0.005);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    subGain.connect(dest);
    var sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 50;
    sub.connect(subGain);
    sub.start(now);
    sub.stop(now + 0.4);
  }

  function playResolve(ctx, dest) {
    var now = ctx.currentTime;
    var notes = [440, 392, 349.23, 329.63]; // A4 G4 F4 E4, descending
    var noteLen = 0.35;
    notes.forEach(function (freq, i) {
      var start = now + i * noteLen;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteLen);
      gain.connect(dest);
      var osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + noteLen + 0.05);
    });
  }

  // Descending dark sting on gameOver (see file header DEATH STING note) --
  // mirrors playSting's stacked-detuned-saw + sub construction above but
  // DESCENDING (each oscillator glides down an octave via
  // exponentialRampToValueAtTime) and slower (~2s vs sting's ~1.2s).
  function playDeathSting(ctx, dest) {
    var now = ctx.currentTime;
    var dur = 2.0;

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.85, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    gain.connect(dest);

    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    filter.connect(gain);

    // stacked minor-third + fifth voicing, same intervals as playSting's
    // brassy hit, but each oscillator glides DOWN an octave over `dur`.
    var startFreqs = [220, 220 * Math.pow(2, 3 / 12), 220 * Math.pow(2, 7 / 12)];
    startFreqs.forEach(function (f, i) {
      var o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, now);
      o.frequency.exponentialRampToValueAtTime(f / 2, now + dur);
      o.detune.value = (i - 1) * 6;
      o.connect(filter);
      o.start(now);
      o.stop(now + dur + 0.1);
    });

    var subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(0.8, now + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    subGain.connect(dest);
    var sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(55, now);
    sub.frequency.exponentialRampToValueAtTime(27.5, now + dur);
    sub.connect(subGain);
    sub.start(now);
    sub.stop(now + dur + 0.1);
  }

  var CONTINUOUS_BUILDERS = {
    sneak: buildSneak,
    combat: buildCombat,
    evasion: buildEvasion,
    caution: buildCaution,
  };

  function createMusic(opts) {
    opts = opts || {};
    var director = opts.director || createMusicDirector();

    var broken = false;
    var warned = false;
    var audioCtx = null;
    var masterGain = null;
    var tracks = {}; // trackName -> { gain: GainNode } -- built lazily, kept forever
    var currentTrackName = null;
    // DEATH STING + BED DUCK (see file header) -- local, NOT part of the pure
    // director's own state (director stays phase-only). Latches true on the
    // first engine.gameOver === true update() call and never resets (see
    // file header for why no in-place "undo" path is needed).
    var prevGameOver = false;

    function warnOnce(err) {
      if (warned) return;
      warned = true;
      try {
        console.warn(
          "[music] disabled after a WebAudio error -- no-oping forever:",
          err && err.message ? err.message : err
        );
      } catch (e2) {
        // even console.warn is inside the isolation boundary -- never let a
        // logging failure escape.
      }
    }

    function getTrack(name) {
      var t = tracks[name];
      if (!t) {
        var gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.connect(masterGain);
        CONTINUOUS_BUILDERS[name](audioCtx, gain);
        t = { gain: gain };
        tracks[name] = t;
      }
      return t;
    }

    function crossfadeTo(name) {
      var now = audioCtx.currentTime;
      var incoming = getTrack(name).gain;

      if (currentTrackName && currentTrackName !== name && tracks[currentTrackName]) {
        var outgoing = tracks[currentTrackName].gain;
        outgoing.gain.cancelScheduledValues(now);
        outgoing.gain.setValueAtTime(outgoing.gain.value, now);
        outgoing.gain.linearRampToValueAtTime(0, now + MUSIC.CROSSFADE_S);
      }

      incoming.gain.cancelScheduledValues(now);
      incoming.gain.setValueAtTime(incoming.gain.value, now);
      incoming.gain.linearRampToValueAtTime(1, now + MUSIC.CROSSFADE_S);
      currentTrackName = name;
    }

    function update(engine) {
      if (broken) return;
      try {
        if (!audioCtx) {
          var Ctor = window.AudioContext || window.webkitAudioContext;
          audioCtx = new Ctor();
          masterGain = audioCtx.createGain();
          masterGain.gain.value = MUSIC.MASTER_GAIN;
          masterGain.connect(audioCtx.destination);
        }
        if (audioCtx.state === "suspended" && audioCtx.resume) {
          // Fire-and-forget; a rejected resume() just means still no sound
          // this frame, not a crash -- swallow it the same way the rest of
          // this module swallows WebAudio failures.
          audioCtx.resume().catch(function () {});
        }

        var result = director.update(engine.squad.phase);

        if (result.changed) crossfadeTo(result.track);
        if (result.sting) playSting(audioCtx, masterGain);
        if (result.resolve) playResolve(audioCtx, masterGain);

        // DEATH STING + BED DUCK (see file header) -- edge-detected directly
        // off engine.gameOver, deliberately OUTSIDE the pure director above.
        if (engine.gameOver && !prevGameOver) {
          playDeathSting(audioCtx, masterGain);
          var duckNow = audioCtx.currentTime;
          Object.keys(tracks).forEach(function (name) {
            var g = tracks[name].gain.gain;
            g.cancelScheduledValues(duckNow);
            g.setValueAtTime(g.value, duckNow);
            g.linearRampToValueAtTime(0, duckNow + 1.0);
          });
        }
        prevGameOver = engine.gameOver;
      } catch (e) {
        broken = true;
        warnOnce(e);
      }
    }

    return { update: update };
  }

  Game.MUSIC = MUSIC;
  Game.musicState = musicState;
  Game.createMusicDirector = createMusicDirector;
  Game.createMusic = createMusic;
  if (typeof module !== "undefined")
    module.exports = {
      musicState: musicState,
      createMusicDirector: createMusicDirector,
      createMusic: createMusic,
      MUSIC: MUSIC,
    };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
