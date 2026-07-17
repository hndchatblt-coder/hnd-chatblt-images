// src/boot.js
// PUBLIC API:
//   Game.boot(rootEl)  — browser entry: runs the in-browser self-test suite,
//     renders a blocking overlay on failure, otherwise shows the title screen
//     and starts the loop. No-op headless (node never calls boot).
// Browser-only glue. All game truth lives in the logic modules; boot just wires
// the DOM, self-test gate, and the fixed-timestep loop shell.
//
// ARCHITECTURE RULE: this file must never touch the Three.js API directly.
// It orchestrates — creates the engine, creates the renderer (passing it the
// container element), drives the fixed-timestep accumulator loop, and turns
// keyboard state into engine.tick() input objects. Every Three.js call lives
// in src/render.js.
//
// GAME OVER + RESTART (new — see src/engine.js's GAME OVER / FROZEN ENGINE
// contract): runGame(rootEl, opts?) is the ONE code path that stands up a
// full playthrough — engine, renderer, radar, hud, music, input listeners,
// and the rAF frame loop. The very first playthrough (from the title
// screen), every RETRY after a game over, AND a SAVE-STATE LOAD (see F9
// below) all go through this exact same function; there is no separate
// "restart"/"load" implementation to drift out of sync with "start."
// Each call:
//   - tears down the PREVIOUS instance first (if any): stops its frame loop
//     (a closure `stopped` flag the old frame() checks before scheduling its
//     next requestAnimationFrame) and removes its window keydown/keyup/resize
//     listeners, via a `currentGame.stop()` handle stashed in the module-level
//     `currentGame` var. Without this, a second runGame() call would leave
//     the old game's input listeners AND rAF loop still alive alongside the
//     new one — every keypress double-firing into two engines, both ticking.
//   - clears rootEl's DOM (rootEl.innerHTML = "") — wipes the previous
//     renderer/radar/hud canvases (and the title screen div, and any
//     game-over overlay) in one shot, so a fresh renderer/radar/hud can
//     re-append their own canvases into a clean container.
//   - builds a brand-new renderer/radar/hud/music stack exactly like the
//     original startGame() did, and starts its own frame loop. The ENGINE
//     itself is `opts && opts.engine`, if given — see F9 LOAD below — or a
//     brand-new Game.createEngine() otherwise (the title-screen/retry path,
//     unchanged from before this cycle).
// Each playthrough's frame() checks engine.events for a "gameOver" entry
// once per animation frame, right after draining the tick accumulator (see
// engine.js: a frozen engine leaves its final tick's events sitting in
// engine.events forever, so this check is guarded by a local `gameOverShown`
// flag — react to the FIRST frame that sees it, ignore every frame after).
// On first sight: shows the MISSION FAILED overlay (showGameOver below);
// pressing Enter on it removes the overlay and calls runGame(rootEl) again —
// the retry IS just another call to the one true startup path.
//
// MISSION COMPLETE + RANK SCREEN (new — the final bootstrap feature, see
// src/engine.js's own MISSION STATS / EXTRACTION / RANK contract): frame()
// below scans engine.events for a "missionComplete" entry exactly the same
// way it already scans for "gameOver" — a local `missionCompleteShown` flag
// (same shape as `gameOverShown`) reacts to the FIRST frame that sees it and
// ignores every frame after (engine.missionComplete latches identically to
// engine.gameOver — see src/engine.js's FROZEN ENGINE note — so the event
// keeps sitting in engine.events forever after the completing tick). On
// first sight: force-dismisses an open codec call (same as the gameOver
// path) and shows the RANK SCREEN overlay (showMissionComplete below) with
// that event's own `stats`/`rank` payload (already a frozen-in-time clone,
// see src/engine.js's own note on why — no need to re-read engine.stats
// later). Pressing Enter on it is NOT another runGame() call like a
// game-over retry — a completed mission goes all the way back to the TITLE
// SCREEN (full teardown via this same instance's own `stop()`, then
// showTitle(rootEl, runSelfTests()) again), so the next Enter starts a
// genuinely fresh playthrough rather than resuming anything.
//
// F5 SAVE / F9 LOAD (new — see src/saveState.js's own contract for the full
// capture()/restore() write-up): plain keydown edges, handled directly in
// onKeyDown below (NOT threaded through buildInput()/engine.tick() the way
// knock/fire/cqc/etc. are — saving/loading is a meta-level "which engine is
// running" operation, the same category as the game-over retry above, not a
// per-tick simulation verb).
//   F5 — engine.getState()-style full capture (Game.createSaveState().
//     capture(engine)) of the CURRENTLY RUNNING engine, JSON.stringify'd into
//     localStorage under SAVE_KEY ("shadowloop-save"). Shows a "SAVED" toast
//     (see showToast below). A localStorage failure (file:// origins can deny
//     it entirely — see LOCALSTORAGE ISOLATION below) is swallowed exactly
//     like a WebAudio failure in src/music.js: warn once to console, then
//     silently no-op forever after — saving must never be the thing that
//     crashes the game.
//   F9 — reads SAVE_KEY back out of localStorage; a missing/corrupt entry
//     (never saved this session, or a localStorage read failure) shows a
//     "NO SAVE" toast and does nothing further. Otherwise: JSON.parse's the
//     blob, calls Game.createSaveState().restore(save) to build a BRAND NEW
//     engine at that exact state, and calls runGame(rootEl, { engine:
//     restoredEngine }) — the SAME teardown-then-rebuild path the game-over
//     retry uses (stop the old frame loop/listeners, wipe rootEl, stand up a
//     fresh renderer/radar/hud/music/codec stack), just handed an
//     already-restored engine instead of a fresh Game.createEngine() call.
//     Shows a "LOADED" toast on success. A restore() that throws (e.g. a
//     version-mismatch save from an older build — see saveState.js's VERSION
//     GATE) is treated the same as "no save": a toast, no crash, the CURRENT
//     playthrough keeps running untouched (restore() throwing happens BEFORE
//     runGame() is ever called again, so nothing has been torn down yet).
//     MISSION STATS (new — see src/engine.js's own contract): a successful
//     restore() increments the FRESHLY-RESTORED engine's own
//     engine.stats.savesUsed by 1, right here, BEFORE runGame() hands that
//     engine off to a live frame loop — "F9 loads count against you, MGS-
//     style continues; F5 saves do not" (see engine.js). A plain flat-prop
//     mutation, same legitimacy as e.g. the RATION VERB's own direct
//     player.hp mutation — there is no in-engine "load" concept, so this
//     meta-level counter has to live here, not in engine.tick(). Because
//     engine.stats round-trips through save/restore like every other
//     mission-scoped counter (see saveState.js), this one increment already
//     accounts for every PRIOR load a save blob carries forward; it never
//     double-counts a load that happened before this save was captured.
//
// Q HOLD/TAP DETECTION (new — CQC THROW cycle, see src/engine.js's CQC /
// THROW: Q TAP vs Q HOLD contract for the engine-side half of this): a single
// physical Q key now drives two different one-shot engine verbs
// (input.cqc — the original choke — and input.cqcThrow — the new THROW),
// disambiguated HERE, in the browser, by how long the key was held before it
// came back up:
//   - qDownAt (performance.now(), ms) is stamped on a fresh KeyQ keydown edge
//     (not a repeat) and cleared (null) once resolved, one way or the other.
//   - onKeyUp's KeyQ branch is where the decision is actually made, on
//     RELEASE, per the design's "fire-on-release" choice (recommended over
//     "auto-fire at 0.6s held" — see engine.js contract — because it lets a
//     player who taps-then-immediately-reconsiders still bail into nothing by
//     just... not letting go early, whereas a fixed auto-fire threshold would
//     commit the throw the instant it's crossed, mid-hold, with no way back):
//     held < Q_TAP_MAX_MS (350ms) -> pendingCqc = true (a tap: choke);
//     held >= that -> pendingCqcThrow = true (a hold: throw). Exactly one of
//     the two is ever set for a given press.
//   - Q_THROW_SAFETY_CAP_MS (1500ms): a per-frame check in frame() below (NOT
//     onKeyUp, which might never fire — e.g. the window loses focus mid-hold
//     and the browser never delivers a keyup at all) force-resolves a HELD-TOO-
//     LONG Q press into a throw on its own, so a stuck/lost key edge can never
//     strand the player unable to act. qThrowSafetyFired latches so the
//     eventual (or already-missing) keyup can't ALSO fire a second edge for
//     the same physical press.
// This is pure browser/timing glue — engine.js has no notion of "how long a
// key was held," it only ever sees one clean one-shot edge on whichever of
// input.cqc/input.cqcThrow this resolves to, indistinguishable from any other
// verb's edge.
//
// LOCALSTORAGE ISOLATION (project mandate, see CLAUDE.md's "audio exempt...
// can never crash the game" precedent, applied here to storage): every
// localStorage.getItem/setItem call in this file goes through
// safeStorageGet/safeStorageSet below, each wrapping its single
// try/catch — any throw logs ONE console.warn (never more than once, even
// across many later calls) and flips a permanent module-level `storageBroken`
// flag; every later call is then an immediate no-op returning null/false.
// Same "warn-once no-op forever" shape as src/music.js's own warnOnce.
(function (Game) {
  var SAVE_KEY = "shadowloop-save";

  // ---- localStorage isolation (see file header) --------------------------
  var storageBroken = false;
  var storageWarned = false;

  function warnStorageOnce(err) {
    if (storageWarned) return;
    storageWarned = true;
    try {
      console.warn(
        "[saveState] localStorage unavailable -- save/load disabled for this session:",
        err && err.message ? err.message : err
      );
    } catch (e2) {
      // even console.warn is inside the isolation boundary -- never let a
      // logging failure escape (same posture as src/music.js's warnOnce).
    }
  }

  function safeStorageSet(key, value) {
    if (storageBroken) return false;
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      storageBroken = true;
      warnStorageOnce(e);
      return false;
    }
  }

  function safeStorageGet(key) {
    if (storageBroken) return null;
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      storageBroken = true;
      warnStorageOnce(e);
      return null;
    }
  }

  // Tiny "SAVED"/"LOADED"/"NO SAVE" toast — bottom-right corner, auto-removes
  // itself after 2s. Purely decorative feedback for the F5/F9 verbs above;
  // blocks nothing (no pointer-events handling needed, same posture as the
  // MISSION FAILED overlay below) and never throws (wrapped defensively —
  // a toast failing to render must never take the game down with it).
  function showToast(rootEl, text) {
    try {
      var toast = document.createElement("div");
      toast.style.cssText =
        "position:fixed;right:18px;bottom:18px;background:rgba(0,0,0,0.82);" +
        "color:#9fb;font:13px monospace;letter-spacing:0.15em;padding:10px 16px;" +
        "border:1px solid #5a7;z-index:9998;pointer-events:none";
      toast.textContent = text;
      rootEl.appendChild(toast);
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 2000);
    } catch (e) {
      // never let a toast rendering failure escape.
    }
  }
  function runSelfTests() {
    // Game.selfTests is populated by src/tests.js (same assertions node runs).
    var results = [];
    var tests = Game.selfTests || [];
    for (var i = 0; i < tests.length; i++) {
      try {
        tests[i].fn();
        results.push({ name: tests[i].name, ok: true });
      } catch (e) {
        results.push({ name: tests[i].name, ok: false, error: String(e) });
      }
    }
    return results;
  }

  // Keys the game cares about (both for held-state movement and one-shot
  // toggles/verbs) — preventDefault is applied to all of these so the page
  // never scrolls/does browser default things while playing.
  var GAME_KEYS = {
    KeyW: true, KeyA: true, KeyS: true, KeyD: true,
    ArrowUp: true, ArrowDown: true, ArrowLeft: true, ArrowRight: true,
    ShiftLeft: true, ShiftRight: true,
    KeyC: true, KeyZ: true, KeyE: true, KeyF: true,
    // KeyQ/KeyG: NEW (CQC/body-drag/lockers cycle) — see src/engine.js's CQC
    // VERB / DRAG VERB / LOCKER VERB contract for what each edge does.
    KeyQ: true, KeyG: true,
    // KeyB/KeyR/KeyX: NEW (box/chaff/ration cycle) — see src/engine.js's BOX
    // VERB / RATION VERB / CHAFF VERB contract for what each edge does.
    KeyB: true, KeyR: true, KeyX: true,
    Enter: true,
    // F5/F9: NEW (save/restore cycle) — see file header's F5 SAVE / F9 LOAD
    // note. preventDefault is ESPECIALLY important for F5 here: the browser
    // default is a full page reload, which would blow away the entire
    // playthrough (and this whole GAME_KEYS-gated preventDefault mechanism
    // exists for exactly this class of key).
    F5: true, F9: true,
  };

  // Handle to the currently-running playthrough's teardown, so a second
  // runGame() call (a retry after game over) can cleanly stop the previous
  // one's frame loop/listeners before standing up a fresh one — see the file
  // header's GAME OVER + RESTART note. null before the first playthrough.
  var currentGame = null;

  function runGame(rootEl, opts) {
    if (currentGame) {
      currentGame.stop();
      currentGame = null;
    }
    // Wipes whatever was in rootEl before this call — the title screen div on
    // the very first call, or the previous playthrough's renderer/radar/hud
    // canvases (and any game-over overlay) on a retry. Every DOM element this
    // function creates is appended fresh below.
    rootEl.innerHTML = "";

    // opts.engine (NEW — F9 LOAD, see file header): an already-restored
    // engine (Game.createSaveState().restore(save)) takes the place of a
    // fresh Game.createEngine() call. Both the title screen and the
    // game-over retry path call runGame(rootEl) with no opts, so this is a
    // pure additive branch — everything below treats `engine` identically
    // either way.
    var engine = (opts && opts.engine) || Game.createEngine();
    var renderer = Game.createRenderer({ container: rootEl, zone: engine.zone });
    var radar = Game.createRadar({ container: rootEl });
    var hud = Game.createHud({ container: rootEl });
    var music = Game.createMusic();
    // CODEC (new — see src/codec.js's own contract for the full write-up):
    // codecDirector is the PURE trigger brain (fed engine.events + inventory
    // state once per frame, below); codec is the browser view it drives via
    // codec.open(call). Both are fresh per playthrough, same posture as
    // engine/renderer/radar/hud/music above — a retry after game over gets
    // its own director with its own one-shot trigger memory, so e.g.
    // "missionOpen" fires again on the very next playthrough.
    var codecDirector = Game.createCodecDirector();
    var codec = Game.createCodec({ container: rootEl });

    // AUDIO GESTURE: WebAudio requires a user gesture to construct/resume an
    // AudioContext. runGame() is only ever invoked synchronously from a
    // keydown handler (title screen Enter, see onEnter in showTitle below; or
    // the game-over retry Enter, see showGameOver below) — so calling
    // music.update() once right here, still inside that keydown event's call
    // stack, lazily constructs music's AudioContext (and starts fading in the
    // "sneak" bed) WHILE the gesture is live, instead of waiting for the
    // first requestAnimationFrame callback (which runs async, after the
    // gesture's call stack has already unwound). Every later call from the
    // frame loop below just reuses this same context — see src/music.js's
    // own AUDIO ISOLATION note for the try/catch-forever wrapping that makes
    // this safe even if WebAudio is unavailable/locked.
    music.update(engine);

    // Debug/screenshot hook ONLY — not read by any gameplay code. screenshot.js
    // uses this to teleport the player and inspect guard state for its scenes
    // (codec: NEW — screenshot.js's "04-codec" scene opens a throwaway call
    // directly via this handle rather than fishing for a real trigger mid-
    // playthrough, so it never disturbs the real codecDirector's one-shot
    // trigger memory).
    window.Game._debug = { engine: engine, renderer: renderer, codec: codec };

    // ---- input state -----------------------------------------------------
    var held = {}; // physical key -> boolean, level-triggered (movement/run)
    var stance = "stand"; // toggled edge-triggered by C/Z
    var pendingKnock = false; // set true on an E keydown edge, consumed once
    var pendingFire = false; // set true on an F keydown edge, consumed once
    // pendingCqc/pendingDrag: NEW (CQC/body-drag/lockers cycle) — same
    // one-shot-per-keydown-edge shape as pendingKnock/pendingFire above; the
    // engine itself does its OWN edge-detection on top of this (see
    // src/engine.js's CQC VERB / DRAG VERB contract), so holding Q/G down
    // only ever registers as a single press either way — this is just the
    // DOM-keydown-repeat guard, same as every other verb here.
    var pendingCqc = false; // set true on a Q TAP release, consumed once
    // pendingCqcThrow: NEW (CQC THROW cycle) — the hold-side counterpart to
    // pendingCqc above (see file header Q HOLD/TAP DETECTION). Exactly one of
    // pendingCqc/pendingCqcThrow is ever set for a given Q press.
    var pendingCqcThrow = false; // set true on a Q HOLD release (or safety cap), consumed once
    var pendingDrag = false; // set true on a G keydown edge, consumed once
    // pendingBox/pendingRation/pendingChaff: NEW (box/chaff/ration cycle) —
    // same one-shot-per-keydown-edge shape as pendingCqc/pendingDrag above;
    // the engine itself does its OWN edge-detection on top of this (see
    // src/engine.js's BOX VERB / RATION VERB / CHAFF VERB contract), so
    // holding B/R/X down only ever registers as a single press either way.
    var pendingBox = false; // set true on a B keydown edge, consumed once
    var pendingRation = false; // set true on an R keydown edge, consumed once
    var pendingChaff = false; // set true on an X keydown edge, consumed once

    // Q HOLD/TAP DETECTION (new — CQC THROW cycle, see file header) — real
    // wall-clock (performance.now(), ms) timing, NOT sim time: qDownAt is the
    // timestamp of the current Q press's keydown edge, or null while Q isn't
    // (or is no longer meaningfully) down. qThrowSafetyFired latches once the
    // 1.5s safety cap has force-fired a throw for the CURRENT press, so a
    // late (or entirely missing) keyup can never also fire a second edge.
    var Q_TAP_MAX_MS = 350; // held < this on release -> tap (choke)
    var Q_THROW_SAFETY_CAP_MS = 1500; // held this long WITHOUT a release -> auto-fire the throw
    var qDownAt = null;
    var qThrowSafetyFired = false;

    function onKeyDown(e) {
      // CODEC (new — see src/codec.js's FROZEN INPUT / PAUSE note): while a
      // call is open, Space/Enter drive codec.advance() instead of anything
      // below, and every OTHER key is swallowed outright (not even `held`
      // gets updated) — the engine is frozen this same frame (see frame()
      // below), so there is nothing for a movement/verb key to legitimately
      // do; swallowing here just prevents a verb's one-shot pending flag
      // (knock/fire/cqc/etc.) from silently queuing up during the call and
      // firing as a surprise the instant it's dismissed.
      if (codec.isOpen()) {
        if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
          e.preventDefault();
          codec.advance();
        }
        return;
      }
      if (GAME_KEYS[e.code]) e.preventDefault();
      held[e.code] = true;
      if (e.repeat) return; // toggles/verbs below are edge-triggered only
      if (e.code === "KeyC") {
        stance = stance === "crouch" ? "stand" : "crouch";
      } else if (e.code === "KeyZ") {
        stance = stance === "crawl" ? "stand" : "crawl";
      } else if (e.code === "KeyE") {
        pendingKnock = true;
      } else if (e.code === "KeyF") {
        pendingFire = true;
      } else if (e.code === "KeyQ") {
        // Q HOLD/TAP DETECTION (see file header) — the tap-vs-throw decision
        // is made on RELEASE (onKeyUp) or the safety-cap check in frame()
        // below, NOT here; a fresh keydown edge just starts the clock.
        qDownAt = performance.now();
        qThrowSafetyFired = false;
      } else if (e.code === "KeyG") {
        pendingDrag = true;
      } else if (e.code === "KeyB") {
        pendingBox = true;
      } else if (e.code === "KeyR") {
        pendingRation = true;
      } else if (e.code === "KeyX") {
        pendingChaff = true;
      } else if (e.code === "F5") {
        // F5 SAVE (see file header) — a meta-level action, handled directly
        // here rather than threaded through buildInput()/engine.tick() like
        // every verb above (there is no simulation-tick meaning to "save").
        saveGame();
      } else if (e.code === "F9") {
        // F9 LOAD (see file header) — same meta-level shape as F5.
        loadGame();
      }
    }

    function onKeyUp(e) {
      if (GAME_KEYS[e.code]) e.preventDefault();
      held[e.code] = false;
      // Q HOLD/TAP DETECTION (see file header) — the release IS the decision
      // point for a normal press: held < Q_TAP_MAX_MS -> tap (choke), else a
      // hold (throw). If the 1.5s safety cap already force-fired the throw
      // for this same press (qDownAt already cleared), this release is a
      // no-op — the edge already happened, don't fire a second one.
      if (e.code === "KeyQ" && qDownAt !== null) {
        var heldMs = performance.now() - qDownAt;
        qDownAt = null;
        // CODEC (see onKeyDown's own note above): if a call opened mid-hold,
        // this release must not queue up a surprise verb for the instant the
        // call dismisses — same swallow-it posture as every other verb's
        // onKeyDown gate, applied here since Q resolves on release instead.
        if (!codec.isOpen()) {
          if (heldMs < Q_TAP_MAX_MS) {
            pendingCqc = true;
          } else {
            pendingCqcThrow = true;
          }
        }
      }
    }

    function onResize() {
      renderer.resize();
    }

    // ---- F5 SAVE / F9 LOAD (see file header) ------------------------------
    var saveStateApi = Game.createSaveState();

    function saveGame() {
      var save;
      try {
        save = saveStateApi.capture(engine);
      } catch (e) {
        // Capturing must never crash the game either -- treat exactly like a
        // storage failure (see LOCALSTORAGE ISOLATION note): warn once, no
        // toast (nothing was saved), keep playing.
        warnStorageOnce(e);
        return;
      }
      var ok = safeStorageSet(SAVE_KEY, JSON.stringify(save));
      if (ok) showToast(rootEl, "SAVED");
    }

    function loadGame() {
      var raw = safeStorageGet(SAVE_KEY);
      if (!raw) {
        showToast(rootEl, "NO SAVE");
        return;
      }
      var save;
      var restored;
      try {
        save = JSON.parse(raw);
        restored = saveStateApi.restore(save);
      } catch (e) {
        // A corrupt blob or a version-mismatch save (see saveState.js's
        // VERSION GATE) must never crash the running game -- the CURRENT
        // playthrough is untouched (restore() throwing happens before
        // runGame() is ever called again, so nothing has been torn down).
        showToast(rootEl, "NO SAVE");
        return;
      }
      // MISSION STATS (see file header F9 LOAD note / src/engine.js's own
      // contract) -- this load itself counts as a "continue," on the
      // freshly-restored engine, before it ever ticks again.
      restored.stats.savesUsed++;
      runGame(rootEl, { engine: restored });
      // NOTE: this call above tears down and rebuilds the entire
      // renderer/radar/hud/music/codec/input stack (see runGame's own file
      // header) -- everything after this point in THIS invocation of
      // runGame() (the frame loop below, stop(), etc.) belongs to the now-
      // superseded playthrough; the "LOADED" toast is shown by the FRESH
      // runGame() call's own rootEl, appended after its rootEl.innerHTML =
      // "" wipe, so it survives on screen for the new playthrough to render
      // under.
      showToast(rootEl, "LOADED");
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);

    function buildInput() {
      var moveX = 0;
      var moveY = 0;
      if (held.KeyA || held.ArrowLeft) moveX -= 1;
      if (held.KeyD || held.ArrowRight) moveX += 1;
      if (held.KeyW || held.ArrowUp) moveY -= 1;
      if (held.KeyS || held.ArrowDown) moveY += 1;

      return {
        moveX: moveX,
        moveY: moveY,
        run: !!(held.ShiftLeft || held.ShiftRight),
        stance: stance,
        knock: pendingKnock,
        fire: pendingFire,
        cqc: pendingCqc,
        cqcThrow: pendingCqcThrow,
        drag: pendingDrag,
        box: pendingBox,
        ration: pendingRation,
        chaff: pendingChaff,
      };
    }

    // ---- fixed-timestep accumulator loop -----------------------------------
    var DT = engine.DT;
    var MAX_ACC = 0.25; // caps the catch-up burst after e.g. a suspended tab
    var acc = 0;
    var lastNow = null;
    var stopped = false; // set true by stop(), below — makes frame() a no-op
    var gameOverShown = false; // latches once the overlay has been shown
    var missionCompleteShown = false; // latches once the rank screen has been shown

    function frame(now) {
      if (stopped) return;
      if (lastNow === null) lastNow = now;
      var frameDt = (now - lastNow) / 1000;
      lastNow = now;
      // CODEC PAUSE (see src/codec.js's FROZEN INPUT / PAUSE note): while a
      // call is open, the entire fixed-timestep accumulator loop below is
      // skipped outright — no engine.tick() calls, so no simulation time
      // passes (guards/player/timers all genuinely freeze, not just visually
      // — engine.events can't produce anything new either). `acc` is reset
      // to 0 rather than left to build up, so the instant the call ends
      // there is no catch-up burst of queued ticks (same MAX_ACC-style
      // reasoning as the suspended-tab cap below, just driven by a much more
      // common/expected pause instead of a rare stall).
      if (codec.isOpen()) {
        acc = 0;
      } else {
        // Q HOLD SAFETY CAP (see file header Q HOLD/TAP DETECTION) — a Q
        // press held past Q_THROW_SAFETY_CAP_MS with no keyup delivered yet
        // (e.g. the window/tab lost focus mid-hold, which can swallow the
        // eventual keyup entirely) force-fires the throw here instead,
        // rather than stranding the player unable to act. qThrowSafetyFired
        // latches so the keyup, if it ever does arrive, can't also fire a
        // second edge for this same physical press (see onKeyUp above).
        if (qDownAt !== null && !qThrowSafetyFired && now - qDownAt >= Q_THROW_SAFETY_CAP_MS) {
          qThrowSafetyFired = true;
          pendingCqcThrow = true;
        }

        acc += frameDt;
        if (acc > MAX_ACC) acc = MAX_ACC;

        while (acc >= DT) {
          engine.tick(buildInput());
          pendingKnock = false; // consumed — only true for the tick right after the edge
          pendingFire = false; // consumed — only true for the tick right after the edge
          pendingCqc = false; // consumed — only true for the tick right after the edge
          pendingCqcThrow = false; // consumed — only true for the tick right after the edge
          pendingDrag = false; // consumed — only true for the tick right after the edge
          pendingBox = false; // consumed — only true for the tick right after the edge
          pendingRation = false; // consumed — only true for the tick right after the edge
          pendingChaff = false; // consumed — only true for the tick right after the edge
          acc -= DT;
        }

        // CODEC TRIGGERS (new): fed once per frame, AFTER the tick drain,
        // with this frame's freshest engine.events + inventory.darts — same
        // "read engine.events right after tick()" posture as the GAME OVER
        // scan just below (and the same honest gap: if the accumulator ran
        // MORE than one tick this frame, only the LAST tick's events survive
        // to be read here, since engine.events is overwritten every
        // engine.tick() call — pre-existing, not new to this cycle). Only
        // called while the codec is NOT already open (this whole branch is
        // gated on that above) so a director.update() return value is never
        // silently dropped because there was nowhere to put it — see
        // src/codec.js's own PRIORITY / QUEUE contract for why a same-tick
        // collision still resolves correctly across later frames either way.
        var codecCall = codecDirector.update(engine.events, { darts: engine.inventory.darts });
        if (codecCall) codec.open(codecCall);
      }

      // GAME OVER (see engine.js's GAME OVER / FROZEN ENGINE contract, and
      // this file's header note): engine.events keeps holding the tick that
      // set engine.gameOver forever after (a frozen engine no longer clears
      // it), so gameOverShown is what keeps this from re-showing the overlay
      // every subsequent frame.
      if (!gameOverShown) {
        for (var i = 0; i < engine.events.length; i++) {
          if (engine.events[i].type === "gameOver") {
            gameOverShown = true;
            // CODEC must never block the MISSION FAILED overlay — force-
            // dismiss it if a call happens to be showing (or was just opened
            // above, this very frame) the instant death lands.
            if (codec.isOpen()) codec.dismiss();
            showGameOver(rootEl, function onRetry() {
              runGame(rootEl);
            });
            break;
          }
        }
      }

      // MISSION COMPLETE + RANK SCREEN (see file header) — same latch-once
      // scan shape as gameOver above, checked independently (a frozen
      // engine only ever latches ONE of gameOver/missionComplete, per
      // src/engine.js's own FROZEN CHECK, so these two blocks never both
      // fire for the same playthrough).
      if (!missionCompleteShown) {
        for (var mi = 0; mi < engine.events.length; mi++) {
          if (engine.events[mi].type === "missionComplete") {
            missionCompleteShown = true;
            if (codec.isOpen()) codec.dismiss();
            showMissionComplete(rootEl, engine.events[mi].stats, engine.events[mi].rank, function onDone() {
              // Back to the TITLE SCREEN, not another runGame() call (see
              // file header) — tear this playthrough down completely first
              // (this closure's own `stop()`, the same handle currentGame
              // holds), then wipe rootEl and show a fresh title.
              stop();
              rootEl.innerHTML = "";
              showTitle(rootEl, runSelfTests());
            });
            break;
          }
        }
      }

      renderer.render(engine);
      radar.render(engine);
      hud.render(engine);
      music.update(engine);
      codec.render(now);
      requestAnimationFrame(frame);
    }

    function stop() {
      stopped = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
    }

    currentGame = { stop: stop };

    requestAnimationFrame(frame);
  }

  // MISSION FAILED overlay (see file header's GAME OVER + RESTART note).
  // Dark backdrop, red monospace text, blocks nothing but keyboard focus
  // (this file owns no pointer-interactive elements, so no pointer-events
  // handling is needed). Enter -> removes itself, then hands control back to
  // onRetry (runGame(rootEl) again).
  function showGameOver(rootEl, onRetry) {
    var overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.86);color:#f33;" +
      "display:flex;align-items:center;justify-content:center;" +
      "flex-direction:column;font:16px monospace;letter-spacing:0.2em;" +
      "z-index:9999";
    overlay.innerHTML =
      "<div style='font-size:44px'>MISSION FAILED</div>" +
      "<div style='margin-top:26px;font-size:18px;letter-spacing:0.15em;color:#fff'>" +
      "PRESS ENTER TO RETRY</div>";
    rootEl.appendChild(overlay);

    function onEnter(e) {
      if (e.code !== "Enter") return;
      e.preventDefault();
      window.removeEventListener("keydown", onEnter);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      onRetry();
    }
    window.addEventListener("keydown", onEnter);
  }

  // mm:ss clock formatting for the rank screen's TIME row — a small local
  // copy of src/hud.js's own formatClock (that module isn't in scope this
  // cycle and doesn't export the helper anyway; same one-liner logic, kept
  // here rather than reached for across a module boundary).
  function formatMmSs(seconds) {
    var s = Math.max(0, Math.floor(seconds || 0));
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    return (mm < 10 ? "0" + mm : "" + mm) + ":" + (ss < 10 ? "0" + ss : "" + ss);
  }

  // RANK SCREEN (see file header's MISSION COMPLETE + RANK SCREEN note).
  // Styled like the codec/HUD's own green CRT monospace aesthetic (see
  // src/codec.js/src/hud.js's #39ff6a-family palette) rather than reusing
  // MISSION FAILED's red above — this is a WIN, not a loss. Dark backdrop,
  // blocks nothing but keyboard focus (same posture as showGameOver).
  // `stats`/`rank` are the missionComplete event's own payload verbatim (see
  // src/engine.js's contract — stats is already a frozen-in-time clone).
  // Enter -> removes itself, then hands control to onDone (back to the
  // title screen — see file header for why this is NOT another runGame()
  // call the way a game-over retry is).
  function showMissionComplete(rootEl, stats, rank, onDone) {
    stats = stats || {};
    var overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(2,10,6,0.93);color:#9fffb8;" +
      "display:flex;align-items:center;justify-content:center;" +
      "flex-direction:column;font:16px monospace;letter-spacing:0.2em;" +
      "z-index:9999";

    var rows = [
      ["TIME", formatMmSs(stats.missionTimeS)],
      ["ALERTS", String(stats.alertsTotal || 0)],
      ["KILLS", String(stats.kills || 0)],
      ["DARTS FIRED", String(stats.dartsFired || 0)],
      ["CQC", String(stats.cqcTakedowns || 0)],
      ["RATIONS", String(stats.rationsUsed || 0)],
      ["CONTINUES", String(stats.savesUsed || 0)],
    ];
    var tableHtml = rows
      .map(function (r) {
        return (
          "<div style='display:flex;justify-content:space-between;width:280px;padding:3px 0;font-size:14px'>" +
          "<span style='color:#5a7'>" + r[0] + "</span><span style='color:#dfe'>" + r[1] + "</span></div>"
        );
      })
      .join("");

    var rankColor = rank === "BIG BOSS" ? "#ffd75e" : "#39ff6a";

    overlay.innerHTML =
      "<div style='font-size:34px;color:#39ff6a'>MISSION COMPLETE</div>" +
      "<div style='margin:20px 0;border-top:1px solid #234;border-bottom:1px solid #234;padding:14px 0'>" +
      tableHtml +
      "</div>" +
      "<div id='rankReveal' style='font-size:56px;letter-spacing:0.15em;color:" +
      rankColor +
      ";min-height:64px'></div>" +
      "<div style='margin-top:28px;font-size:18px;letter-spacing:0.15em;color:#fff'>PRESS ENTER FOR TITLE</div>";
    rootEl.appendChild(overlay);

    // Typed-in rank reveal — one character at a time, same "reveal" flavor
    // as src/codec.js's own dialogue type-in, but a fresh self-contained
    // timer (this module must never reach into codec.js's own internals).
    var rankName = rank || "";
    var rankEl = overlay.querySelector("#rankReveal");
    var revealed = 0;
    var typer = setInterval(function () {
      revealed++;
      if (rankEl) rankEl.textContent = rankName.slice(0, revealed);
      if (revealed >= rankName.length) clearInterval(typer);
    }, 90);

    function onEnter(e) {
      if (e.code !== "Enter") return;
      e.preventDefault();
      clearInterval(typer);
      window.removeEventListener("keydown", onEnter);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      onDone();
    }
    window.addEventListener("keydown", onEnter);
  }

  function showTitle(rootEl, results) {
    var title = document.createElement("div");
    title.style.cssText =
      "color:#9fb;background:#000;position:fixed;inset:0;display:flex;" +
      "align-items:center;justify-content:center;flex-direction:column;" +
      "font:16px monospace;letter-spacing:0.3em";
    title.innerHTML =
      "<div style='font-size:42px;margin-bottom:16px'>SHADOW LOOP</div>" +
      "<div>self-test: " + results.length + "/" + results.length + " passed</div>" +
      "<div style='margin-top:28px;font-size:22px;letter-spacing:0.2em'>PRESS ENTER</div>" +
      "<div style='margin-top:14px;color:#5a7;font-size:12px;letter-spacing:0.15em'>" +
      "WASD move &middot; SHIFT run &middot; C crouch &middot; Z crawl &middot; E knock &middot; F tranq &middot; Q choke &middot; hold Q throw &middot; G drag/locker &middot; B box &middot; R ration &middot; X chaff &middot; F5 save &middot; F9 load</div>";
    rootEl.appendChild(title);

    function onEnter(e) {
      if (e.code !== "Enter") return;
      e.preventDefault();
      window.removeEventListener("keydown", onEnter);
      runGame(rootEl);
    }
    window.addEventListener("keydown", onEnter);
  }

  function boot(rootEl) {
    var results = runSelfTests();
    var failures = results.filter(function (r) { return !r.ok; });
    if (failures.length) {
      var pre = document.createElement("pre");
      pre.style.cssText =
        "color:#f33;background:#000;padding:24px;font:14px monospace;" +
        "position:fixed;inset:0;z-index:9999;overflow:auto;margin:0";
      pre.textContent =
        "BOOT SELF-TEST FAILED — start blocked\n\n" +
        failures.map(function (f) { return "FAIL " + f.name + "\n  " + f.error; }).join("\n");
      rootEl.appendChild(pre);
      return;
    }
    showTitle(rootEl, results);
  }

  Game.boot = boot;
  if (typeof module !== "undefined") module.exports = { boot: boot };

  if (typeof window !== "undefined") {
    window.addEventListener("DOMContentLoaded", function () {
      boot(document.getElementById("app"));
    });
  }
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
