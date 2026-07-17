// src/codec.js
// PUBLIC API:
//   Game.CODEC — tunable constants:
//     {
//       FREQ: { COMMANDER: 140.85, MEI: 141.12 },
//       TYPE_CPS: 40,               // per-character text reveal rate, chars/sec
//       MOUTH_FLAP_PERIOD_MS: 180,  // ms per mouth-flap animation frame while typing
//       FACE_GRID: 24,              // NxN procedural face grid (both axes)
//       FACE_SCALE: 8,              // css px per grid cell when upscaled
//     }
//
//   ---- PURE SIDE (node-testable, no DOM/canvas/WebAudio/Date/Math.random) --
//
//   Game.createCodecDirector() -> director, { update(events, state, squadPhase?) -> call|null }
//     events: engine.events for THIS tick (an array; [] / undefined treated
//       as no events). state: { darts: number, ... } — currently only
//       `darts` is read (pass engine.inventory.darts). squadPhase (optional,
//       backward-compatible): engine.squad.phase ("INFILTRATION" | "CAUTION" |
//       "ALERT" | "EVASION"), passed as third argument; undefined = legacy
//       behavior (all calls fire immediately). The director owns ALL
//       one-shot memory internally in closure vars — each of the 4 triggers
//       below fires AT MOST ONCE per director instance (i.e. once per
//       playthrough, since src/boot.js's runGame() creates a fresh director
//       every call — mirrors src/music.js's createMusicDirector prevTrack
//       closure pattern exactly).
//     Triggers, in priority order:
//       1. "missionOpen" — the very FIRST update() call this director
//          instance ever receives (t≈0), unconditionally. COMMANDER mission
//          briefing. Always plays immediately regardless of phase.
//       2. "firstAlert" — events contains a {type:"alert"} entry OR a
//          {type:"phaseChange", to:"ALERT"} entry. COMMANDER: discipline +
//          EVASION tactics reminder. Always plays immediately regardless of
//          phase (it IS about the alert itself).
//       3. "firstBody" — events contains a {type:"cqc"} entry OR a
//          {type:"tranqFired", hit:true} entry (a miss, hit:false/undefined,
//          does NOT qualify). MEI: body-management briefing. DEFERRED if
//          squadPhase is "ALERT" or "EVASION" — queued internally, released
//          when phase changes to "INFILTRATION", "CAUTION", or undefined.
//       4. "lowDarts" — state.darts is a number and <= 3. MEI: ammo
//          discipline + CQC-as-alternative briefing. DEFERRED if squadPhase
//          is "ALERT" or "EVASION" — queued internally, released when phase
//          changes to "INFILTRATION", "CAUTION", or undefined.
//     PRIORITY / QUEUE: update() returns AT MOST ONE call per invocation. If
//     more than one trigger newly qualifies on the SAME update() call (e.g.
//     an engine that somehow reports an alert event on its very first tick),
//     every qualifying call is pushed onto an internal FIFO queue in the
//     priority order above, and update() hands them out one per call on
//     subsequent invocations, in that same order — so a caller that keeps
//     calling update() every tick eventually sees every qualifying call,
//     oldest/highest-priority first, never more than one per call. Once a
//     trigger has fired it can never re-fire (that's the only thing the
//     internal fired-flags do — the queue itself is just a same-tick-
//     collision buffer, since after the first check the flags already
//     prevent duplicate pushes on later calls). Deferred calls maintain
//     one-shot semantics and priority order: a deferred call that never
//     qualifies during the deferral window is released as-is when the window
//     closes, and a deferral window that closes with multiple deferred calls
//     waiting releases them in priority order on consecutive update() calls.
//     Returns `null` when nothing new qualified and the queue is empty.
//     Return shape (JSON-serializable — no functions/undefined anywhere):
//       { id: string,       // "missionOpen" | "firstAlert" | "firstBody" | "lowDarts"
//         freq: number,     // Game.CODEC.FREQ[speaker]
//         speaker: string,  // "COMMANDER" | "MEI"
//         lines: [{ who: string, text: string }, ...] }
//       Every line's `who` equals `speaker` — these are single-speaker radio
//       monologues (the player never talks back over codec this cycle, only
//       listens), matching classic MGS "commander barks orders" call framing.
//       Always >= 4 lines (this cycle's four calls are 6 lines each).
//   DIALOGUE (written by hand, MGS-flavored, terse, no copyrighted names):
//     COMMANDER (140.85) — gruff CO: mission framing, then discipline under
//       fire. MEI (141.12) — logistics/quartermaster: body disposal and
//       ammo conservation, the practical stealth-mechanics tutor voice.
//
//   ---- VIEW SIDE (BROWSER ONLY — canvas 2D + WebAudio; never call from
//   node; deliberately untested headless, same posture as src/music.js's
//   createMusic / src/hud.js's createHud — screenshot.js's "04-codec" scene
//   is what verifies this half actually looks right) -----------------------
//
//   Game.createCodec({ container }) -> codec, {
//     open(call)   — begins showing `call` (a director return value) from
//       its first line, freshly typing out.
//     isOpen()     — true from open() until dismiss() (either explicit, or
//       automatic after advance() past the last line).
//     dismiss()    — force-closes immediately, whatever line it was on
//       (src/boot.js calls this defensively the instant a "gameOver" event
//       is seen, so a mid-call codec never blocks the MISSION FAILED
//       overlay — see that file's own comment).
//     advance()    — Space/Enter, routed here by src/boot.js while
//       isOpen(): if the CURRENT line hasn't finished typing yet, instantly
//       reveals the rest of it (no skipped animation frames, just an
//       immediate full reveal — classic "impatient player mashes the
//       button" behavior); otherwise moves to the next line, resetting its
//       own type-in animation from scratch. Advancing past the last line
//       calls dismiss() internally.
//     render(nowMs) — call once per rendered frame while mounted, same
//       slot src/hud.js/src/radar.js's own render(engine) occupies in
//       src/boot.js's frame loop. Takes a local rAF DOMHighResTimeStamp
//       (the SAME `now` src/boot.js's frame(now) already receives from
//       requestAnimationFrame) rather than reading engine.time, because
//       src/boot.js pauses engine.tick() entirely while the codec is open
//       (see FROZEN INPUT below) — engine.time would not advance at all
//       during a call, so every type-in/mouth-flap animation here is driven
//       off this independent wall-clock timestamp instead. A no-op (clears
//       its own canvas, if anything was left drawn) whenever !isOpen().
//   } — the codec deliberately does NOT touch engine.events itself (the
//   PURE director above is what reads those); the view only ever receives
//   already-decided call objects via open().
//
//   FROZEN INPUT / PAUSE (src/boot.js's job, documented here since this is
//   the module whose existence demands it): while codec.isOpen(), boot.js's
//   frame() must skip the entire engine.tick() accumulator loop (no
//   simulation time passes — guards freeze, the player freezes, nothing in
//   engine.events can fire) AND swallow Space/Enter into codec.advance()
//   instead of buildInput()'s normal one-shot verbs. music.update(engine)
//   is the ONE exception — it keeps running every frame even while the
//   codec is open (engine.squad.phase does not change while frozen, so the
//   ambient bed just keeps playing whatever track it was already on; this
//   is a deliberate choice, not an oversight — a hard mute/unmute on every
//   codec open/close would be a more jarring cut than just letting the
//   frozen-phase bed continue underneath the call, and it keeps this file
//   from having any opinion about src/music.js's internals).
//
//   LOOK: a full-width dark overlay band vertically centered across the
//   screen (classic codec framing) — left portrait (the CALLER: COMMANDER
//   or MEI), right portrait (the LISTENER: a fixed masked "OPERATIVE"
//   portrait, always present, never talks, exists purely so the classic
//   two-portrait codec frame has something on both sides), center column:
//   big monospace frequency readout on top ("140.85"), a name plate below
//   it (the caller's name), and a scrolling text area below THAT which
//   types out the current line's text left-to-right at
//   Game.CODEC.TYPE_CPS (~40 chars/s), plus a small "line i/N" counter and
//   a "SPACE/ENTER" advance hint in the corner. MGS1-flavored palette
//   reused verbatim from src/hud.js (#39ff6a green border, dark translucent
//   #041008cc-family panel fill, monospace everywhere) so the codec reads
//   as part of the same HUD system, not a bolted-on overlay.
//
//   PORTRAITS: procedural pixel-art faces, drawn onto a
//   Game.CODEC.FACE_GRID x FACE_GRID (24x24) offscreen canvas ONCE per
//   (character, mouth-frame) pair and cached forever (2 frames per
//   character: mouth-closed idle, mouth-open talking), then blitted onto
//   the main canvas scaled up with imageSmoothingEnabled = false (crisp
//   hard pixel edges, no blur) — see buildFaceGrid()/getPortraitCanvas()
//   below. Deterministic per character: Game.createRng(hashName(name))
//   seeds ONLY the minor stylistic choices (hairline depth, side-hair
//   length), never the fixed structural rows (eyes/brows/nose/mouth always
//   land on the same grid rows so every face reads as a face, not noise —
//   see the file's own dev note below on how this was sanity-checked).
//   Faces are built with the classic "mirrored-half" sprite trick: every
//   pixel is computed for its column and its mirrored column in the SAME
//   pass (see MIRROR_PAIR below) so left/right symmetry is exact by
//   construction, never approximate. Distinct palettes:
//     COMMANDER — grays/olive, stern: cool grey-olive skin, steel-grey
//       close-cropped hair (short hair cap, minimal sideburns), olive-drab
//       collar.
//     MEI       — warmer palette: warm tan skin, chestnut hair worn longer
//       (fuller cap + long sides), tan/rust jacket collar.
//     OPERATIVE — the listener: a full dark tactical balaclava (the "hair"
//       region covers the ENTIRE head silhouette, mouth included — masked
//       = true below), with only a pale eye-slit visible; never mouth-flaps
//       (this portrait is never the active speaker in any call this cycle).
//   Subtle 2-frame mouth-flap animation plays on the CALLER's portrait only,
//   toggling ~every Game.CODEC.MOUTH_FLAP_PERIOD_MS ms, for exactly as long
//   as their current line is still typing (idle/closed the instant the line
//   finishes, and permanently idle for whichever character isn't currently
//   speaking).
//   DEV NOTE: this face layout (head-oval silhouette, hairline cap + side-
//   hair extent, eyebrow row, eye row + shine pixel, nose-shadow row, mouth
//   row) was prototyped and sanity-checked as plain ASCII art in a throwaway
//   node script before being ported here, per this cycle's design brief —
//   the grid math below (HEAD_TOP/HEAD_BOTTOM/HEAD_CENTER_ROW/etc.) is that
//   same verified layout, just emitting canvas fillRect calls with palette
//   colors instead of ASCII characters.
//
//   PER-CHARACTER BLIP (optional, additive): a tiny WebAudio click plays
//   once per render() call in which the revealed-character count advanced
//   (not literally once per character — if a tab stall reveals several
//   characters in one animation frame, that's still one click, avoiding an
//   audio-node pile-up) — same AUDIO ISOLATION posture as src/music.js's
//   createMusic: the whole thing lives behind a try/catch, any failure
//   flips a permanent `blipBroken` flag and warns via console.warn ONCE,
//   every later attempt is then a silent no-op. This module does NOT reuse
//   src/music.js's AudioContext (that module owns its context privately and
//   exposes no hook to share it) — it lazily constructs its own tiny
//   isolated AudioContext, exactly once, the first time a blip is actually
//   needed.
//
// Model/view split, mirroring src/radar.js / src/hud.js / src/music.js: the
// PURE SIDE (createCodecDirector) has zero DOM/canvas/WebAudio and is
// exercised headless by tests/codec.test.js; the VIEW SIDE (createCodec) is
// browser-only and deliberately untested headless — screenshot.js's new
// "04-codec" scene is what verifies the rendered overlay (and its portraits)
// actually look right (open shots/04-codec.png and look).
(function (Game) {
  var CODEC = {
    FREQ: { COMMANDER: 140.85, MEI: 141.12 },
    TYPE_CPS: 40,
    MOUTH_FLAP_PERIOD_MS: 180,
    FACE_GRID: 24,
    FACE_SCALE: 8,
  };

  // ==== PURE SIDE ============================================================

  // Single-speaker monologue calls -- see file header's DIALOGUE note. Each
  // entry is just the line TEXTS; buildCall() below stamps `who` = speaker
  // onto every one and fills in freq from CODEC.FREQ.
  var CALLS = {
    missionOpen: {
      speaker: "COMMANDER",
      lines: [
        "COMMAND to OPERATIVE, do you copy.",
        "This is your only briefing, so listen close.",
        "Infiltrate the compound. Reach the comms tower roof.",
        "Extraction bird holds position there until you check in.",
        "Avoid kills if you can manage it -- command wants deniability, and you want the rank.",
        "Move quiet. COMMAND out.",
      ],
    },
    firstAlert: {
      speaker: "COMMANDER",
      lines: [
        "COMMANDER here. Your signature just lit up the whole board.",
        "Discipline. Panic is how good operators end up dead.",
        "Break line of sight -- a wall beats a bullet every time.",
        "Lockers, blind corners, anything between you and their eyes.",
        "Once it drops to caution, hold still and let it burn out.",
        "COMMAND out.",
      ],
    },
    firstBody: {
      speaker: "MEI",
      lines: [
        "MEI, logistics. Nice work putting one down quiet.",
        "Sleeping bodies get found, and found bodies get radioed in.",
        "Drag him clear with G -- don't just leave him where he falls.",
        "Nearest locker, stuff him in, shut the door behind you.",
        "His buddies walk a route. Give them nothing to trip over.",
        "MEI out.",
      ],
    },
    lowDarts: {
      speaker: "MEI",
      lines: [
        "MEI again. I'm reading your tranq count, and it isn't pretty.",
        "Down to your last few darts -- start spending guards instead of ammo.",
        "Get in close behind one and take him by hand. No darts needed.",
        "Save what's left for the ones you can't reach quietly.",
        "Resupply isn't coming this trip. Make it count.",
        "MEI out.",
      ],
    },
  };

  function buildCall(id) {
    var def = CALLS[id];
    return {
      id: id,
      freq: CODEC.FREQ[def.speaker],
      speaker: def.speaker,
      lines: def.lines.map(function (text) {
        return { who: def.speaker, text: text };
      }),
    };
  }

  function eventsHasAlert(events) {
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === "alert") return true;
      if (e.type === "phaseChange" && e.to === "ALERT") return true;
    }
    return false;
  }

  function eventsHasBody(events) {
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === "cqc") return true;
      if (e.type === "tranqFired" && e.hit === true) return true;
    }
    return false;
  }

  function createCodecDirector() {
    var firedMissionOpen = false;
    var firedFirstAlert = false;
    var firedFirstBody = false;
    var firedLowDarts = false;
    var queue = []; // same-tick-collision buffer only -- see file header
    var deferredFirstBody = false; // queued for release when phase clears
    var deferredLowDarts = false; // queued for release when phase clears
    var lastPhase = undefined; // tracks phase transitions

    function isPhaseHighTension(phase) {
      // High-tension phases where codec calls should be deferred
      return phase === "ALERT" || phase === "EVASION";
    }

    function update(events, state, squadPhase) {
      events = events || [];
      state = state || {};

      // PHASE TRANSITIONS: check if we're exiting a high-tension phase.
      // If so, release any deferred calls that were queued during the window.
      if (
        lastPhase !== undefined &&
        isPhaseHighTension(lastPhase) &&
        !isPhaseHighTension(squadPhase)
      ) {
        // Exiting high-tension. Release deferred calls in priority order.
        if (deferredFirstBody) {
          deferredFirstBody = false;
          queue.push(buildCall("firstBody"));
        }
        if (deferredLowDarts) {
          deferredLowDarts = false;
          queue.push(buildCall("lowDarts"));
        }
      }
      lastPhase = squadPhase;

      // 1. missionOpen -- unconditional on this director's very first call.
      if (!firedMissionOpen) {
        firedMissionOpen = true;
        queue.push(buildCall("missionOpen"));
      }
      // 2. firstAlert
      if (!firedFirstAlert && eventsHasAlert(events)) {
        firedFirstAlert = true;
        queue.push(buildCall("firstAlert"));
      }
      // 3. firstBody -- DEFERRED if in high-tension phase, otherwise immediate.
      if (!firedFirstBody && eventsHasBody(events)) {
        firedFirstBody = true;
        if (isPhaseHighTension(squadPhase)) {
          deferredFirstBody = true;
        } else {
          queue.push(buildCall("firstBody"));
        }
      }
      // 4. lowDarts -- DEFERRED if in high-tension phase, otherwise immediate.
      if (!firedLowDarts && typeof state.darts === "number" && state.darts <= 3) {
        firedLowDarts = true;
        if (isPhaseHighTension(squadPhase)) {
          deferredLowDarts = true;
        } else {
          queue.push(buildCall("lowDarts"));
        }
      }

      if (queue.length === 0) return null;
      return queue.shift();
    }

    return { update: update };
  }

  // ==== VIEW SIDE (browser only) =============================================

  // ---- procedural portrait faces --------------------------------------------

  function hashName(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) {
      h = (Math.imul(h, 31) + name.charCodeAt(i)) >>> 0;
    }
    return h >>> 0 || 1;
  }

  var G = CODEC.FACE_GRID; // 24
  var CENTER = (G - 1) / 2; // 11.5 -- mirror axis: column c <-> column (G-1-c)
  var HEAD_TOP = 3;
  var HEAD_BOTTOM = 19;
  var HEAD_CENTER_ROW = (HEAD_TOP + HEAD_BOTTOM) / 2; // 11
  var HEAD_RADIUS_ROW = (HEAD_BOTTOM - HEAD_TOP) / 2; // 8
  var HEAD_RADIUS_COL = 7;

  // Palettes -- see file header's PORTRAITS note for the character write-up.
  var PALETTES = {
    COMMANDER: {
      bg: "#0a120c",
      skin: "#b5a184",
      skinShadow: "#8f7d64",
      hair: "#4a4d46",
      brow: "#3a3c36",
      eye: "#141614",
      eyeShine: "#dfe6da",
      mouth: "#5a3f36",
      mouthOpen: "#2b1c18",
      collar: "#565f52",
      collarShade: "#3d443a",
      hairCapRange: [3, 4],
      sideHairRange: [0, 2],
      masked: false,
    },
    MEI: {
      bg: "#160f0a",
      skin: "#e0b48c",
      skinShadow: "#c08f68",
      hair: "#7a3d2c",
      brow: "#4a2a20",
      eye: "#231208",
      eyeShine: "#fff1df",
      mouth: "#a4483c",
      mouthOpen: "#5c1f18",
      collar: "#8a5a3a",
      collarShade: "#684328",
      hairCapRange: [4, 5],
      sideHairRange: [6, 8],
      masked: false,
    },
    OPERATIVE: {
      bg: "#0c1210",
      skin: "#2b2f2c",
      skinShadow: "#20231f",
      hair: "#2b2f2c",
      brow: "#1c1f1c",
      eye: "#dfe6da",
      eyeShine: "#ffffff",
      mouth: "#2b2f2c",
      mouthOpen: "#2b2f2c",
      collar: "#33413a",
      collarShade: "#26302a",
      hairCapRange: [0, 0],
      sideHairRange: [0, 0],
      masked: true,
    },
  };

  // Builds a G x G grid of category letters, mirrored-half technique: every
  // (row, col) is classified together with its mirror (row, G-1-col) in the
  // same halfWidth test, so left/right symmetry is exact. Categories:
  //   '.' bg, 'H' hair/mask, 'S' skin, 's' skin-shadow (nose), 'B' brow,
  //   'E' eye pupil, '*' eye shine, 'M' mouth closed, 'm' mouth open,
  //   'C' collar, 'c' collar-shade.
  function buildFaceGrid(name, palette) {
    var rng = Game.createRng(hashName(name));
    var hairCapRows = rng.int(palette.hairCapRange[0], palette.hairCapRange[1]);
    var sideHairRows = rng.int(palette.sideHairRange[0], palette.sideHairRange[1]);
    var masked = !!palette.masked;

    var grid = [];
    for (var r = 0; r < G; r++) grid.push(new Array(G).fill("."));

    // head silhouette (skin vs. hair)
    for (var r2 = HEAD_TOP; r2 <= HEAD_BOTTOM; r2++) {
      var dy = (r2 - HEAD_CENTER_ROW) / HEAD_RADIUS_ROW;
      if (Math.abs(dy) > 1) continue;
      var halfW = HEAD_RADIUS_COL * Math.sqrt(1 - dy * dy);
      var rowsFromTop = r2 - HEAD_TOP;
      for (var c = 0; c < G; c++) {
        var dx = c - CENTER;
        if (Math.abs(dx) > halfW) continue;
        var isHair;
        if (masked) {
          isHair = true; // full balaclava -- whole silhouette is mask fabric
        } else if (rowsFromTop < hairCapRows) {
          isHair = true; // full-width hairline cap
        } else if (rowsFromTop < hairCapRows + sideHairRows) {
          isHair = Math.abs(dx) > halfW * 0.5; // side hair only
        } else {
          isHair = false;
        }
        grid[r2][c] = isHair ? "H" : "S";
      }
    }

    // eyebrows
    var browRow = HEAD_CENTER_ROW - 3;
    for (var side = -1; side <= 1; side += 2) {
      for (var i = 2; i <= 4; i++) {
        var col = Math.round(CENTER + side * i);
        if (grid[browRow][col] !== ".") grid[browRow][col] = "B";
      }
    }

    // eyes + shine, two rows below brow
    var eyeRow = browRow + 2;
    for (var side2 = -1; side2 <= 1; side2 += 2) {
      var c1 = Math.round(CENTER + side2 * 3);
      var c2 = Math.round(CENTER + side2 * 4);
      grid[eyeRow][c1] = "E";
      grid[eyeRow][c2] = "E";
      grid[eyeRow - 1][c2] = "*";
    }

    // nose shadow
    var noseRow = eyeRow + 3;
    grid[noseRow][Math.round(CENTER - 0.5)] = "s";
    grid[noseRow][Math.round(CENTER + 0.5)] = "s";

    // mouth (skipped entirely for a masked face -- stays mask-colored)
    var mouthRow = noseRow + 2;
    if (!masked) {
      for (var mc = -3; mc <= 3; mc++) {
        var col2 = Math.round(CENTER + mc);
        if (grid[mouthRow][col2] === ".") continue;
        grid[mouthRow][col2] = "M";
      }
    }

    // collar/jacket, trapezoid widening below the head
    for (var r3 = HEAD_BOTTOM + 1; r3 < G; r3++) {
      var grow = (r3 - HEAD_BOTTOM - 1) * 2;
      var halfW2 = HEAD_RADIUS_COL + 1 + grow;
      for (var c3 = 0; c3 < G; c3++) {
        var dx2 = c3 - CENTER;
        if (Math.abs(dx2) > halfW2) continue;
        grid[r3][c3] = Math.abs(dx2) > halfW2 * 0.7 ? "c" : "C";
      }
    }

    // mouth-OPEN variant: computed as a delta on top of the closed grid by
    // the caller (see applyMouthOpen below), not baked in here, so both
    // frames share one silhouette/hair/eye pass.
    return grid;
  }

  // Mutates a copy of `grid` in place to widen the mouth into its "open"
  // shape (used for the talking animation frame); no-op for masked faces
  // (mouth row was never drawn in the first place).
  function applyMouthOpen(grid, masked) {
    if (masked) return grid;
    var noseRow = HEAD_CENTER_ROW - 3 + 2 + 3;
    var mouthRow = noseRow + 2;
    for (var mc = -3; mc <= 3; mc++) {
      var col = Math.round(CENTER + mc);
      if (grid[mouthRow][col] === "M") grid[mouthRow][col] = "m";
    }
    for (var mc2 = -2; mc2 <= 2; mc2++) {
      var col2 = Math.round(CENTER + mc2);
      if (grid[mouthRow + 1][col2] === "S" || grid[mouthRow + 1][col2] === "s") {
        grid[mouthRow + 1][col2] = "m";
      }
    }
    return grid;
  }

  function colorFor(cell, palette) {
    switch (cell) {
      case "H":
        return palette.hair;
      case "S":
        return palette.skin;
      case "s":
        return palette.skinShadow;
      case "B":
        return palette.brow;
      case "E":
        return palette.eye;
      case "*":
        return palette.eyeShine;
      case "M":
        return palette.mouth;
      case "m":
        return palette.mouthOpen;
      case "C":
        return palette.collar;
      case "c":
        return palette.collarShade;
      default:
        return palette.bg;
    }
  }

  function paintPortraitCanvas(name, mouthOpen) {
    var palette = PALETTES[name] || PALETTES.OPERATIVE;
    var grid = buildFaceGrid(name, palette);
    if (mouthOpen) grid = applyMouthOpen(grid, !!palette.masked);

    var canvas = document.createElement("canvas");
    canvas.width = G;
    canvas.height = G;
    var pctx = canvas.getContext("2d");
    for (var r = 0; r < G; r++) {
      for (var c = 0; c < G; c++) {
        pctx.fillStyle = colorFor(grid[r][c], palette);
        pctx.fillRect(c, r, 1, 1);
      }
    }
    return canvas;
  }

  // ---- optional per-character blip (isolated tiny WebAudio context) --------

  function createBlipPlayer() {
    var ctx = null;
    var broken = false;
    var warned = false;

    function warnOnce(err) {
      if (warned) return;
      warned = true;
      try {
        console.warn(
          "[codec] blip disabled after a WebAudio error -- no-oping forever:",
          err && err.message ? err.message : err
        );
      } catch (e2) {
        // even console.warn is inside the isolation boundary
      }
    }

    function play(charCode) {
      if (broken) return;
      try {
        if (!ctx) {
          var Ctor = window.AudioContext || window.webkitAudioContext;
          ctx = new Ctor();
        }
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = "square";
        // Deterministic (not Math.random) tiny pitch variation from the
        // revealed character's own code point -- keeps the "no
        // Math.random/Date in logic-adjacent code" discipline even here.
        osc.frequency.value = 1400 + ((charCode || 0) % 6) * 90;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.05, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      } catch (e) {
        broken = true;
        warnOnce(e);
      }
    }

    return { play: play };
  }

  // ---- main overlay view -----------------------------------------------------

  var PANEL_BG = "rgba(4, 16, 8, 0.88)";
  var BORDER = "#39ff6a";

  function createCodec(opts) {
    opts = opts || {};
    var container = opts.container;

    var canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:60;";
    container.appendChild(canvas);
    var ctx = canvas.getContext("2d");

    var widthCss = 0;
    var heightCss = 0;

    function ensureSize() {
      var w = (typeof window !== "undefined" && window.innerWidth) || widthCss;
      var h = (typeof window !== "undefined" && window.innerHeight) || heightCss;
      if (w === widthCss && h === heightCss) return;
      widthCss = w;
      heightCss = h;
      var dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
      canvas.width = Math.round(widthCss * dpr);
      canvas.height = Math.round(heightCss * dpr);
      canvas.style.width = widthCss + "px";
      canvas.style.height = heightCss + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    var portraitCache = {}; // "name|0"/"name|1" -> canvas, built lazily, cached forever
    function getPortrait(name, mouthOpen) {
      var key = name + "|" + (mouthOpen ? 1 : 0);
      if (!portraitCache[key]) portraitCache[key] = paintPortraitCanvas(name, mouthOpen);
      return portraitCache[key];
    }

    var blip = createBlipPlayer();

    var isOpenFlag = false;
    var currentCall = null;
    var lineIndex = 0;
    var lineStartMs = null; // rAF timestamp the CURRENT line began revealing at
    var forceRevealed = false;
    var lastRevealedCount = 0;

    function open(call) {
      currentCall = call;
      lineIndex = 0;
      lineStartMs = null;
      forceRevealed = false;
      lastRevealedCount = 0;
      isOpenFlag = true;
    }

    function isOpen() {
      return isOpenFlag;
    }

    function dismiss() {
      isOpenFlag = false;
      currentCall = null;
      lineIndex = 0;
      lineStartMs = null;
      forceRevealed = false;
      lastRevealedCount = 0;
    }

    function advance() {
      if (!isOpenFlag || !currentCall) return;
      var line = currentCall.lines[lineIndex];
      if (!forceRevealed && lastRevealedCount < line.text.length) {
        forceRevealed = true; // reveal the rest of THIS line right now
        return;
      }
      lineIndex++;
      forceRevealed = false;
      lineStartMs = null;
      lastRevealedCount = 0;
      if (lineIndex >= currentCall.lines.length) dismiss();
    }

    function drawPanel(x, y, w, h) {
      ctx.fillStyle = PANEL_BG;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    function drawPortraitAt(name, mouthOpen, x, y, size) {
      var portrait = getPortrait(name, mouthOpen);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      drawPanel(x - 4, y - 4, size + 8, size + 8);
      ctx.drawImage(portrait, 0, 0, G, G, x, y, size, size);
      ctx.restore();
    }

    function wrapText(text, maxWidth) {
      var words = text.split(" ");
      var lines = [];
      var cur = "";
      for (var i = 0; i < words.length; i++) {
        var next = cur ? cur + " " + words[i] : words[i];
        if (ctx.measureText(next).width > maxWidth && cur) {
          lines.push(cur);
          cur = words[i];
        } else {
          cur = next;
        }
      }
      if (cur) lines.push(cur);
      return lines;
    }

    function render(nowMs) {
      ensureSize();

      if (!isOpenFlag || !currentCall) {
        ctx.clearRect(0, 0, widthCss, heightCss);
        return;
      }

      var call = currentCall;
      var line = call.lines[lineIndex];

      if (lineStartMs === null) {
        lineStartMs = nowMs;
        lastRevealedCount = 0;
      }
      var elapsedS = Math.max(0, (nowMs - lineStartMs) / 1000);
      var revealed = forceRevealed
        ? line.text.length
        : Math.min(line.text.length, Math.floor(elapsedS * CODEC.TYPE_CPS));
      if (revealed > lastRevealedCount) {
        blip.play(line.text.charCodeAt(revealed - 1));
        lastRevealedCount = revealed;
      }
      var talking = revealed < line.text.length;
      var flapFrame = talking && Math.floor(nowMs / CODEC.MOUTH_FLAP_PERIOD_MS) % 2 === 1;

      ctx.clearRect(0, 0, widthCss, heightCss);

      var bandH = Math.min(260, heightCss * 0.42);
      var bandY = (heightCss - bandH) / 2;
      drawPanel(0, bandY, widthCss, bandH);

      var portraitSize = Math.min(160, bandH - 60);
      var portraitY = bandY + (bandH - portraitSize) / 2;
      var leftX = 36;
      var rightX = widthCss - 36 - portraitSize;

      drawPortraitAt(call.speaker, flapFrame, leftX, portraitY, portraitSize);
      drawPortraitAt("OPERATIVE", false, rightX, portraitY, portraitSize);

      // name plate + frequency, above the speaker's own portrait
      ctx.fillStyle = "#9fffb8";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(call.speaker, leftX, bandY + 14);
      ctx.fillStyle = "#d8ffe4";
      ctx.font = "bold 22px monospace";
      ctx.fillText(call.freq.toFixed(2), leftX, bandY + 32);

      // center text column
      var textX = leftX + portraitSize + 32;
      var textW = rightX - 24 - textX;
      ctx.font = "16px monospace";
      ctx.fillStyle = "#e8fff0";
      var visibleText = line.text.slice(0, revealed);
      var wrapped = wrapText(visibleText, textW);
      var textY = bandY + 28;
      for (var i = 0; i < wrapped.length; i++) {
        ctx.fillText(wrapped[i], textX, textY + i * 22);
      }

      ctx.font = "11px monospace";
      ctx.fillStyle = "rgba(216, 255, 228, 0.65)";
      ctx.fillText(
        "LINE " + (lineIndex + 1) + "/" + call.lines.length,
        textX,
        bandY + bandH - 34
      );
      ctx.fillText("SPACE/ENTER TO CONTINUE", textX, bandY + bandH - 18);

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
    }

    return {
      open: open,
      isOpen: isOpen,
      dismiss: dismiss,
      advance: advance,
      render: render,
    };
  }

  Game.CODEC = CODEC;
  Game.createCodecDirector = createCodecDirector;
  Game.createCodec = createCodec;
  if (typeof module !== "undefined")
    module.exports = {
      CODEC: CODEC,
      createCodecDirector: createCodecDirector,
      createCodec: createCodec,
    };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
