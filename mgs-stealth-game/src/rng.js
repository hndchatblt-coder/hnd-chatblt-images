// src/rng.js
// PUBLIC API:
//   Game.createRng(seed: number) -> {
//     next(): float in [0,1),
//     int(min, max): inclusive integer,
//     pick(array): element,
//     seed: number,  (the seed it was created with)
//     getState(): { s: number }  (NEW — save/restore cycle, see below),
//     setState(state: { s: number }): void  (NEW — see below),
//   }
// Single source of randomness for the whole game. Same seed => identical
// sequence => reproducible tests and replays (seed + input log = identical run).
//
// getState()/setState() (NEW — additive, no behavior change to next/int/pick):
// the mulberry32 generator's ENTIRE mutable state is the single internal
// counter `s` (seeded from `seed` at construction, then advanced by every
// next() call) — getState() returns a plain JSON-safe { s } snapshot of it;
// setState({s}) overwrites it, after which next()/int()/pick() continue
// exactly as if this rng instance had been advanced to that point from its
// original seed (the counter, not the constructor's `seed` value, is what
// setState() restores — `seed`/the closure var it was read from stays
// whatever this instance was originally constructed with, same as before;
// only the live cursor moves). This is what src/saveState.js's capture/
// restore cycle uses to make a restored engine's rng draw the EXACT SAME
// future sequence a live engine would have drawn from that point on.
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
    function getState() {
      return { s: s };
    }
    function setState(state) {
      s = state.s >>> 0;
    }
    return { next: next, int: int, pick: pick, seed: seed, getState: getState, setState: setState };
  }
  Game.createRng = createRng;
  if (typeof module !== "undefined") module.exports = { createRng: createRng };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
