// src/boot.js
// PUBLIC API:
//   Game.boot(rootEl)  — browser entry: runs the in-browser self-test suite,
//     renders a blocking overlay on failure, otherwise shows the title screen
//     and starts the loop. No-op headless (node never calls boot).
// Browser-only glue. All game truth lives in the logic modules; boot just wires
// the DOM, self-test gate, and the fixed-timestep loop shell.
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
    // Title screen placeholder — replaced when render module lands (cycle 1+).
    var title = document.createElement("div");
    title.style.cssText =
      "color:#9fb;background:#000;position:fixed;inset:0;display:flex;" +
      "align-items:center;justify-content:center;flex-direction:column;" +
      "font:16px monospace;letter-spacing:0.3em";
    title.innerHTML =
      "<div style='font-size:42px;margin-bottom:16px'>SHADOW LOOP</div>" +
      "<div>self-test: " + results.length + "/" + results.length + " passed</div>" +
      "<div style='margin-top:24px;color:#575'>v0.0 — nothing to play yet</div>";
    rootEl.appendChild(title);
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
