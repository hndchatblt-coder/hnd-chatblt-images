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
    KeyC: true, KeyZ: true, KeyE: true,
    Enter: true,
  };

  function startGame(rootEl, titleEl) {
    rootEl.removeChild(titleEl);

    var engine = Game.createEngine();
    var renderer = Game.createRenderer({ container: rootEl, zone: engine.zone });
    var radar = Game.createRadar({ container: rootEl });
    var hud = Game.createHud({ container: rootEl });

    // Debug/screenshot hook ONLY — not read by any gameplay code. screenshot.js
    // uses this to teleport the player and inspect guard state for its scenes.
    window.Game._debug = { engine: engine, renderer: renderer };

    // ---- input state -----------------------------------------------------
    var held = {}; // physical key -> boolean, level-triggered (movement/run)
    var stance = "stand"; // toggled edge-triggered by C/Z
    var pendingKnock = false; // set true on an E keydown edge, consumed once

    function onKeyDown(e) {
      if (GAME_KEYS[e.code]) e.preventDefault();
      held[e.code] = true;
      if (e.repeat) return; // toggles/verbs below are edge-triggered only
      if (e.code === "KeyC") {
        stance = stance === "crouch" ? "stand" : "crouch";
      } else if (e.code === "KeyZ") {
        stance = stance === "crawl" ? "stand" : "crawl";
      } else if (e.code === "KeyE") {
        pendingKnock = true;
      }
    }

    function onKeyUp(e) {
      if (GAME_KEYS[e.code]) e.preventDefault();
      held[e.code] = false;
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", function () {
      renderer.resize();
    });

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
      };
    }

    // ---- fixed-timestep accumulator loop -----------------------------------
    var DT = engine.DT;
    var MAX_ACC = 0.25; // caps the catch-up burst after e.g. a suspended tab
    var acc = 0;
    var lastNow = null;

    function frame(now) {
      if (lastNow === null) lastNow = now;
      var frameDt = (now - lastNow) / 1000;
      lastNow = now;
      acc += frameDt;
      if (acc > MAX_ACC) acc = MAX_ACC;

      while (acc >= DT) {
        engine.tick(buildInput());
        pendingKnock = false; // consumed — only true for the tick right after the edge
        acc -= DT;
      }

      renderer.render(engine);
      radar.render(engine);
      hud.render(engine);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
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
      "WASD move &middot; SHIFT run &middot; C crouch &middot; Z crawl &middot; E knock</div>";
    rootEl.appendChild(title);

    function onEnter(e) {
      if (e.code !== "Enter") return;
      e.preventDefault();
      window.removeEventListener("keydown", onEnter);
      startGame(rootEl, title);
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
