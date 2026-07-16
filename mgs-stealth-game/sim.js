// sim.js — headless playtest bot. Runs scripted infiltration scenarios against
// the REAL engine (60s+ of game time at fixed 60Hz) and asserts guard-behavior
// OUTCOMES, e.g.:
//   - "guard reaches INVESTIGATE within 2s of a knock"
//   - "all guards back to PATROL within 90s of lost contact"
//   - "no guard stuck in any state longer than its max timer"
// This catches the bugs an imagined playtest confidently misses.
//
// Scenarios live inline until the engine exists (cycle: GuardAI); each scenario
// is { name, seed, run(Game) } where run throws on a violated assertion.
const fs = require("fs");
const path = require("path");

const LOGIC_ORDER = [
  "rng.js",
  "world.js",
  "player.js",
  "soundEvents.js",
  "vision.js",
  "guardAI.js",
  "items.js",
  "director.js",
  "saveState.js",
  "engine.js",
];
const srcDir = path.join(__dirname, "src");
for (const f of LOGIC_ORDER) {
  const p = path.join(srcDir, f);
  if (fs.existsSync(p)) require(p);
}
const Game = global.Game;

const scenarios = [];

// Scaffold-phase scenario: proves the harness itself runs and the RNG that will
// drive every replay is deterministic over a long horizon. Real infiltration
// scenarios are added by the world/guardAI cycles and are append-only.
scenarios.push({
  name: "harness: 3600-tick deterministic RNG horizon (60s @ 60Hz)",
  seed: 20260716,
  run: function (G) {
    const a = G.createRng(this.seed);
    const b = G.createRng(this.seed);
    for (let tick = 0; tick < 3600; tick++) {
      if (a.next() !== b.next()) {
        throw new Error("replay determinism broken at tick " + tick);
      }
    }
  },
});

let pass = 0;
let fail = 0;
for (const s of scenarios) {
  try {
    s.run(Game);
    pass++;
    console.log(`  ok   ${s.name}`);
  } catch (e) {
    fail++;
    console.error(`  FAIL ${s.name}`);
    console.error(`       ${e && e.stack ? e.stack.split("\n")[0] : e}`);
  }
}

console.log(`\nsim.js: ${pass}/${pass + fail} scenarios passed`);
process.exit(fail === 0 ? 0 : 1);
