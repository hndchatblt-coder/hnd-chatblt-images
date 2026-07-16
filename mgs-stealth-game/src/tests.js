// src/tests.js
// PUBLIC API:
//   Game.selfTests: Array<{ name: string, fn: () => void }>
//     Shared assertion registry. node test.js runs these headless; boot.js runs
//     the SAME list in-browser before the title screen and blocks start on
//     failure. Register with Game.selfTests.push({name, fn}). fn throws on fail.
// Append-only in spirit: tests here are never weakened to pass (ratchet rule 2).
(function (Game) {
  Game.selfTests = Game.selfTests || [];

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || "assertion failed");
  }

  Game.selfTests.push({
    name: "rng: same seed gives identical sequence",
    fn: function () {
      var a = Game.createRng(1234);
      var b = Game.createRng(1234);
      for (var i = 0; i < 100; i++) {
        assert(a.next() === b.next(), "diverged at draw " + i);
      }
    },
  });

  Game.selfTests.push({
    name: "rng: different seeds diverge",
    fn: function () {
      var a = Game.createRng(1);
      var b = Game.createRng(2);
      var same = true;
      for (var i = 0; i < 10; i++) if (a.next() !== b.next()) same = false;
      assert(!same, "seeds 1 and 2 produced identical first 10 draws");
    },
  });

  Game.selfTests.push({
    name: "rng: int(min,max) stays in inclusive bounds",
    fn: function () {
      var r = Game.createRng(42);
      var sawMin = false, sawMax = false;
      for (var i = 0; i < 1000; i++) {
        var v = r.int(3, 7);
        assert(v >= 3 && v <= 7, "out of bounds: " + v);
        if (v === 3) sawMin = true;
        if (v === 7) sawMax = true;
      }
      assert(sawMin && sawMax, "bounds never hit in 1000 draws");
    },
  });

  if (typeof module !== "undefined") module.exports = { selfTests: Game.selfTests };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
