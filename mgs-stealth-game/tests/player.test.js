// tests/player.test.js — headless assertions for src/player.js.
// Same registry pattern as src/tests.js: push onto the shared Game.selfTests
// list; test.js runs every entry and reports ok/FAIL with real exit codes.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var DT = 1 / 60;

function freshWorld() {
  return Game.createWorld(Game.ZONES.loadingDock);
}

function run(player, input, ticks) {
  for (var i = 0; i < ticks; i++) player.update(input, DT);
}

function dist(x1, y1, x2, y2) {
  var dx = x2 - x1;
  var dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// 1. spawns at zone playerSpawn with stand stance.
Game.selfTests.push({
  name: "player: spawns at zone playerSpawn with stand stance",
  fn: function () {
    var world = freshWorld();
    var player = Game.createPlayer({ world: world });
    var spawn = world.zone.playerSpawn;
    assert(player.x === spawn.x, "expected x=" + spawn.x + ", got " + player.x);
    assert(player.y === spawn.y, "expected y=" + spawn.y + ", got " + player.y);
    assert(player.stance === "stand", "expected initial stance 'stand', got " + player.stance);
    assert(player.radius === 0.4, "expected radius 0.4, got " + player.radius);
  },
});

// 2. walking 60 ticks at full input moves ~3.0m (+/-5%).
Game.selfTests.push({
  name: "player: walking 60 ticks at full input moves ~3.0m",
  fn: function () {
    var world = freshWorld();
    var player = Game.createPlayer({ world: world });
    var startX = player.x, startY = player.y;
    run(player, { moveX: 1, moveY: 0, run: false, stance: "stand" }, 60);
    var d = dist(startX, startY, player.x, player.y);
    assert(Math.abs(d - 3.0) <= 3.0 * 0.05, "expected ~3.0m walked, got " + d);
  },
});

// 3. running ~6.0 m/s; crouch ~1.6; crawl ~0.8 (ordering AND magnitudes).
Game.selfTests.push({
  name: "player: run/crouch/crawl speeds match spec and are correctly ordered",
  fn: function () {
    var TICKS = 60;

    var runWorld = freshWorld();
    var runPlayer = Game.createPlayer({ world: runWorld });
    var runStart = { x: runPlayer.x, y: runPlayer.y };
    run(runPlayer, { moveX: 1, moveY: 0, run: true, stance: "stand" }, TICKS);
    var runDist = dist(runStart.x, runStart.y, runPlayer.x, runPlayer.y);

    var crouchWorld = freshWorld();
    var crouchPlayer = Game.createPlayer({ world: crouchWorld });
    var crouchStart = { x: crouchPlayer.x, y: crouchPlayer.y };
    run(crouchPlayer, { moveX: 1, moveY: 0, run: false, stance: "crouch" }, TICKS);
    var crouchDist = dist(crouchStart.x, crouchStart.y, crouchPlayer.x, crouchPlayer.y);

    var crawlWorld = freshWorld();
    var crawlPlayer = Game.createPlayer({ world: crawlWorld });
    var crawlStart = { x: crawlPlayer.x, y: crawlPlayer.y };
    run(crawlPlayer, { moveX: 1, moveY: 0, run: false, stance: "crawl" }, TICKS);
    var crawlDist = dist(crawlStart.x, crawlStart.y, crawlPlayer.x, crawlPlayer.y);

    assert(Math.abs(runDist - 6.0) <= 6.0 * 0.05, "expected ~6.0m running, got " + runDist);
    assert(Math.abs(crouchDist - 1.6) <= 1.6 * 0.05, "expected ~1.6m crouched, got " + crouchDist);
    assert(Math.abs(crawlDist - 0.8) <= 0.8 * 0.05, "expected ~0.8m crawling, got " + crawlDist);

    assert(runDist > crouchDist, "run should cover more distance than crouch");
    assert(crouchDist > crawlDist, "crouch should cover more distance than crawl");
  },
});

// 4. run flag while crouched does NOT give run speed (uses crouch speed).
Game.selfTests.push({
  name: "player: run flag while crouched uses crouch speed, not run speed",
  fn: function () {
    var world = freshWorld();
    var player = Game.createPlayer({ world: world });
    var start = { x: player.x, y: player.y };
    run(player, { moveX: 1, moveY: 0, run: true, stance: "crouch" }, 60);
    var d = dist(start.x, start.y, player.x, player.y);
    assert(Math.abs(d - 1.6) <= 1.6 * 0.05, "expected crouch speed (~1.6m) despite run=true, got " + d);
    assert(player.running === false, "player.running should be false in crouch even with run=true");
  },
});

// 5. diagonal input (1,1) does not exceed the stance speed (normalized).
Game.selfTests.push({
  name: "player: diagonal input is normalized, not faster than axis movement",
  fn: function () {
    var world = freshWorld();
    var player = Game.createPlayer({ world: world });
    var start = { x: player.x, y: player.y };
    // moveX=1, moveY=-1 (up-right, away from the bottom perimeter wall and
    // nearby crate clusters) so the full second of movement stays clear of
    // any wall and isolates normalization from collision.
    run(player, { moveX: 1, moveY: -1, run: false, stance: "stand" }, 60);
    var d = dist(start.x, start.y, player.x, player.y);
    assert(Math.abs(d - 3.0) <= 3.0 * 0.05, "expected ~3.0m (walk speed) on diagonal input, got " + d);
    assert(d <= 3.0 * 1.05, "diagonal input must not exceed the stance speed");
  },
});

// 6. walking into a perimeter wall for 120 ticks: never overlapping, stays
// within zone bounds.
Game.selfTests.push({
  name: "player: walking into a perimeter wall never overlaps and stays in bounds",
  fn: function () {
    var world = freshWorld();
    var player = Game.createPlayer({ world: world });
    var bounds = world.zone.bounds;
    for (var i = 0; i < 120; i++) {
      player.update({ moveX: 0, moveY: 1, run: false, stance: "stand" }, DT);
      assert(
        !world.isBlockedCircle(player.x, player.y, player.radius),
        "tick " + i + ": player overlaps a wall at (" + player.x + "," + player.y + ")"
      );
      assert(player.x >= 0 && player.x <= bounds.w, "tick " + i + ": x out of zone bounds: " + player.x);
      assert(player.y >= 0 && player.y <= bounds.h, "tick " + i + ": y out of zone bounds: " + player.y);
    }
  },
});

// 7. facing: move +x then stop -> facing ~0 retained while idle; move +y ->
// facing ~PI/2.
Game.selfTests.push({
  name: "player: facing tracks last nonzero movement and is retained while idle",
  fn: function () {
    var world = freshWorld();
    var player = Game.createPlayer({ world: world });

    player.update({ moveX: 1, moveY: 0, run: false, stance: "stand" }, DT);
    assert(Math.abs(player.facing - 0) < 1e-6, "expected facing ~0 after +x move, got " + player.facing);

    player.update({ moveX: 0, moveY: 0, run: false, stance: "stand" }, DT);
    assert(Math.abs(player.facing - 0) < 1e-6, "facing should be retained while idle, got " + player.facing);
    assert(player.moving === false, "player.moving should be false with zero input");

    player.update({ moveX: 0, moveY: 1, run: false, stance: "stand" }, DT);
    assert(Math.abs(player.facing - Math.PI / 2) < 1e-6, "expected facing ~PI/2 after +y move, got " + player.facing);
  },
});

// 8. visionProfile and noiseRadius across stance/motion combos, including
// stationary -> 0.
Game.selfTests.push({
  name: "player: visionProfile and noiseRadius match spec tables for every stance/motion combo",
  fn: function () {
    var world = freshWorld();
    var player = Game.createPlayer({ world: world });

    // Stationary: noiseRadius is 0 regardless of stance; visionProfile still
    // reflects the current stance.
    player.update({ moveX: 0, moveY: 0, run: false, stance: "stand" }, DT);
    assert(player.visionProfile() === 1.0, "stand visionProfile should be 1.0");
    assert(player.noiseRadius() === 0, "stationary noiseRadius should be 0 (stand)");

    player.update({ moveX: 0, moveY: 0, run: false, stance: "crouch" }, DT);
    assert(player.visionProfile() === 0.6, "crouch visionProfile should be 0.6");
    assert(player.noiseRadius() === 0, "stationary noiseRadius should be 0 (crouch)");

    player.update({ moveX: 0, moveY: 0, run: false, stance: "crawl" }, DT);
    assert(player.visionProfile() === 0.3, "crawl visionProfile should be 0.3");
    assert(player.noiseRadius() === 0, "stationary noiseRadius should be 0 (crawl)");

    // Walking (stand, no run): noiseRadius 3.
    player.update({ moveX: 1, moveY: 0, run: false, stance: "stand" }, DT);
    assert(player.visionProfile() === 1.0, "stand visionProfile should be 1.0 while walking");
    assert(player.noiseRadius() === 3, "walking noiseRadius should be 3");

    // Running (stand + run): noiseRadius 8.
    player.update({ moveX: 1, moveY: 0, run: true, stance: "stand" }, DT);
    assert(player.visionProfile() === 1.0, "stand visionProfile should be 1.0 while running");
    assert(player.noiseRadius() === 8, "running noiseRadius should be 8");

    // Moving crouched: noiseRadius 1.
    player.update({ moveX: 1, moveY: 0, run: false, stance: "crouch" }, DT);
    assert(player.visionProfile() === 0.6, "crouch visionProfile should be 0.6 while moving");
    assert(player.noiseRadius() === 1, "moving-crouched noiseRadius should be 1");

    // Moving crawling: noiseRadius 0.
    player.update({ moveX: 1, moveY: 0, run: false, stance: "crawl" }, DT);
    assert(player.visionProfile() === 0.3, "crawl visionProfile should be 0.3 while moving");
    assert(player.noiseRadius() === 0, "moving-crawling noiseRadius should be 0");
  },
});
