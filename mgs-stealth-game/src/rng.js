// src/rng.js
// PUBLIC API:
//   Game.createRng(seed: number) -> {
//     next(): float in [0,1),
//     int(min, max): inclusive integer,
//     pick(array): element,
//     seed: number  (the seed it was created with)
//   }
// Single source of randomness for the whole game. Same seed => identical
// sequence => reproducible tests and replays (seed + input log = identical run).
(function (Game) {
  function createRng(seed) {
    let s = seed >>> 0;
    function next() {
      // mulberry32
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    }
    function pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    }
    return { next: next, int: int, pick: pick, seed: seed };
  }
  Game.createRng = createRng;
  if (typeof module !== "undefined") module.exports = { createRng: createRng };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
