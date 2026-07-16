// test.js — headless test runner. Real assertions, real exit codes.
// Loads src modules directly via require (logic modules are pure JS — no THREE),
// runs the shared Game.selfTests registry plus everything in tests/ (including
// tests/regressions/), then the smoke + perf gates once the engine exists.
const fs = require("fs");
const path = require("path");

// Load logic modules into the shared global.Game namespace, same order as build.
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
  "tests.js",
];
const srcDir = path.join(__dirname, "src");
for (const f of LOGIC_ORDER) {
  const p = path.join(srcDir, f);
  if (fs.existsSync(p)) require(p);
}
const Game = global.Game;

// Collect extra test files: tests/*.js and tests/regressions/*.js. Each file
// receives the Game namespace and pushes onto Game.selfTests.
function loadDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (f.endsWith(".js")) require(p);
    else if (fs.statSync(p).isDirectory()) loadDir(p);
  }
}
loadDir(path.join(__dirname, "tests"));

let pass = 0;
let fail = 0;
for (const t of Game.selfTests) {
  try {
    t.fn();
    pass++;
    console.log(`  ok   ${t.name}`);
  } catch (e) {
    fail++;
    console.error(`  FAIL ${t.name}`);
    console.error(`       ${e && e.stack ? e.stack.split("\n")[0] : e}`);
  }
}

console.log(`\ntest.js: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
