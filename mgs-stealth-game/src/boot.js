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
// contract): runGame(rootEl) is the ONE code path that stands up a full
// playthrough — engine, renderer, radar, hud, music, input listeners, and the
// rAF frame loop. Both the very first playthrough (from the title screen) and
// every RETRY after a game over go through this exact same function; there is
// no separate "restart" implementation to drift out of sync with "start."
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
//   - builds a brand-new engine/renderer/radar/hud/music stack exactly like
//     the original startGame() did, and starts its own frame loop.
// Each playthrough's frame() checks engine.events for a "gameOver" entry
// once per animation frame, right after draining the tick accumulator (see
// engine.js: a frozen engine leaves its final tick's events sitting in
// engine.events forever, so this check is guarded by a local `gameOverShown`
// flag — react to the FIRST frame that sees it, ignore every frame after).
// On first sight: shows the MISSION FAILED overlay (showGameOver below);
// pressing Enter on it removes the overlay and calls runGame(rootEl) again —
// the retry IS just another call to the one true startup path.
(function (Game) {
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
  };

  // Handle to the currently-running playthrough's teardown, so a second
  // runGame() call (a retry after game over) can cleanly stop the previous
  // one's frame loop/listeners before standing up a fresh one — see the file
  // header's GAME OVER + RESTART note. null before the first playthrough.
  var currentGame = null;

  function runGame(rootEl) {
    if (currentGame) {
      currentGame.stop();
      currentGame = null;
    }
    // Wipes whatever was in rootEl before this call — the title screen div on
    // the very first call, or the previous playthrough's renderer/radar/hud
    // canvases (and any game-over overlay) on a retry. Every DOM element this
    // function creates is appended fresh below.
    rootEl.innerHTML = "";

    var engine = Game.createEngine();
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
    var pendingCqc = false; // set true on a Q keydown edge, consumed once
    var pendingDrag = false; // set true on a G keydown edge, consumed once
    // pendingBox/pendingRation/pendingChaff: NEW (box/chaff/ration cycle) —
    // same one-shot-per-keydown-edge shape as pendingCqc/pendingDrag above;
    // the engine itself does its OWN edge-detection on top of this (see
    // src/engine.js's BOX VERB / RATION VERB / CHAFF VERB contract), so
    // holding B/R/X down only ever registers as a single press either way.
    var pendingBox = false; // set true on a B keydown edge, consumed once
    var pendingRation = false; // set true on an R keydown edge, consumed once
    var pendingChaff = false; // set true on an X keydown edge, consumed once

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
        pendingCqc = true;
      } else if (e.code === "KeyG") {
        pendingDrag = true;
      } else if (e.code === "KeyB") {
        pendingBox = true;
      } else if (e.code === "KeyR") {
        pendingRation = true;
      } else if (e.code === "KeyX") {
        pendingChaff = true;
      }
    }

    function onKeyUp(e) {
      if (GAME_KEYS[e.code]) e.preventDefault();
      held[e.code] = false;
    }

    function onResize() {
      renderer.resize();
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
        acc += frameDt;
        if (acc > MAX_ACC) acc = MAX_ACC;

        while (acc >= DT) {
          engine.tick(buildInput());
          pendingKnock = false; // consumed — only true for the tick right after the edge
          pendingFire = false; // consumed — only true for the tick right after the edge
          pendingCqc = false; // consumed — only true for the tick right after the edge
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
      "WASD move &middot; SHIFT run &middot; C crouch &middot; Z crawl &middot; E knock &middot; F tranq &middot; Q cqc &middot; G drag/locker &middot; B box &middot; R ration &middot; X chaff</div>";
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
