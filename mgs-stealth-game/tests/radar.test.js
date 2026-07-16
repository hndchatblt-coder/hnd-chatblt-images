// tests/radar.test.js -- headless assertions for src/radar.js's pure MODEL
// half (Game.radarModel). The canvas/view half (Game.createRadar) is
// BROWSER ONLY by design (see src/radar.js's file header) and is deliberately
// NOT exercised here -- screenshot.js is what verifies the rendered canvas
// actually looks right (open shots/02-ingame-patrol.png and
// shots/03-alert.png and look).
//
// loader unified cycle 30 — see test.js LOGIC_ORDER

const Game = global.Game;
const DT = 1 / 60;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  var keysA = Object.keys(a);
  var keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (var i = 0; i < keysA.length; i++) {
    var k = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// Recursively asserts a value tree contains no function and no `undefined`
// property anywhere. JSON.stringify silently DROPS both, so a naive
// round-trip-equality check alone could miss a leaked function/undefined --
// this walks the ORIGINAL model, before it ever touches JSON.
function assertNoFunctionsOrUndefined(value, path) {
  path = path || "root";
  if (value === undefined) throw new Error("found undefined at " + path);
  if (typeof value === "function") throw new Error("found a function at " + path);
  if (value === null || typeof value !== "object") return;
  Object.keys(value).forEach(function (k) {
    assertNoFunctionsOrUndefined(value[k], path + "." + k);
  });
}

function freshEngine() {
  return Game.createEngine();
}

// Ticks `engine`, each tick re-teleporting the player to a fixed distance
// directly in front of guards[0]'s CURRENT facing (recomputed live every
// tick, since a patrolling/sweeping guard's facing keeps changing) -- close
// enough (2m, inside VISION.FILL_NEAR_DIST) and dead-center in its cone so
// the meter fills to ALERT_AT quickly. Mirrors screenshot.js's scene
// "03-alert" setup. Returns the tick index ALERT was reached at, or null.
function driveToAlert(engine, maxTicks) {
  for (var i = 0; i < maxTicks; i++) {
    var g = engine.guards[0];
    var ahead = 2;
    engine.player.x = g.x + Math.cos(g.facing) * ahead;
    engine.player.y = g.y + Math.sin(g.facing) * ahead;
    engine.tick();
    if (engine.squad.phase === "ALERT") return i;
  }
  return null;
}

// Ticks `engine` with the player hidden far off in open space (no guard can
// possibly retain LOS) until `predicate(engine)` is true or maxTicks elapse.
// Returns the tick index it became true at, or null.
function tickHiddenUntil(engine, predicate, maxTicks) {
  for (var i = 0; i < maxTicks; i++) {
    engine.player.x = -1000;
    engine.player.y = -1000;
    engine.tick();
    if (predicate(engine)) return i;
  }
  return null;
}

// ---- 1. INFILTRATION baseline ---------------------------------------------

Game.selfTests.push({
  name: "radar: INFILTRATION model reflects live engine state (not jammed, guards present, base FOV/range)",
  fn: function () {
    var engine = freshEngine();
    var model = Game.radarModel(engine);

    assert(model.jammed === false, "expected jammed false at boot (squad.phase INFILTRATION)");

    assert(
      model.zone.w === engine.zone.bounds.w && model.zone.h === engine.zone.bounds.h,
      "zone dims should mirror engine.zone.bounds"
    );
    assert(model.walls.length === engine.zone.walls.length, "wall count mismatch");
    assert(
      model.walls[0].x === engine.zone.walls[0].x &&
        model.walls[0].y === engine.zone.walls[0].y &&
        model.walls[0].w === engine.zone.walls[0].w &&
        model.walls[0].h === engine.zone.walls[0].h,
      "wall[0] data mismatch"
    );
    assert(model.darkZones.length === engine.zone.darkZones.length, "darkZone count mismatch");
    assert(
      model.exit.x === engine.zone.exit.x &&
        model.exit.y === engine.zone.exit.y &&
        model.exit.w === engine.zone.exit.w &&
        model.exit.h === engine.zone.exit.h,
      "exit mismatch"
    );

    assert(model.player.x === engine.player.x && model.player.y === engine.player.y, "player position mismatch");
    assert(model.player.facing === engine.player.facing, "player facing mismatch");
    assert(model.player.stance === engine.player.stance, "player stance mismatch");

    assert(
      model.guards.length === engine.guards.length,
      "expected one radar guard entry per engine guard, got " + model.guards.length + " vs " + engine.guards.length
    );
    model.guards.forEach(function (g, i) {
      var eg = engine.guards[i];
      assert(
        g.id === eg.id && g.x === eg.x && g.y === eg.y && g.facing === eg.facing && g.state === eg.state,
        "guard fields mismatch for " + eg.id
      );
      assert(g.fovDeg === Game.VISION.FOV_DEG, "expected base FOV_DEG outside CAUTION, got " + g.fovDeg);
      assert(g.range === Game.VISION.RANGE, "expected base RANGE outside CAUTION, got " + g.range);
    });
  },
});

// ---- 2. ALERT jams the radar -----------------------------------------------

Game.selfTests.push({
  name: "radar: ALERT jams the radar -- guards array empty, jammed true",
  fn: function () {
    var engine = freshEngine();
    var reachedAt = driveToAlert(engine, Math.round(10 / DT));
    assert(reachedAt !== null, "setup failed: squad never reached ALERT within 10s");

    var model = Game.radarModel(engine);
    assert(model.jammed === true, "expected jammed true during ALERT");
    assert(model.guards.length === 0, "expected guards array EMPTY during ALERT (no leaking positions)");
  },
});

// ---- 3. EVASION keeps the radar jammed -------------------------------------

Game.selfTests.push({
  name: "radar: EVASION (contact lost after ALERT) keeps the radar jammed",
  fn: function () {
    var engine = freshEngine();
    var reachedAlertAt = driveToAlert(engine, Math.round(10 / DT));
    assert(reachedAlertAt !== null, "setup failed: squad never reached ALERT within 10s");

    var reachedEvasionAt = tickHiddenUntil(
      engine,
      function (e) {
        return e.squad.phase === "EVASION";
      },
      60
    );
    assert(reachedEvasionAt !== null, "setup failed: squad never reached EVASION after losing contact");

    var model = Game.radarModel(engine);
    assert(model.jammed === true, "expected jammed true during EVASION");
    assert(model.guards.length === 0, "expected guards array EMPTY during EVASION");
  },
});

// ---- 4. CAUTION un-jams and widens fovDeg/range ----------------------------

Game.selfTests.push({
  name: "radar: CAUTION un-jams the radar and widens every guard's fovDeg/range by the CAUTION multipliers",
  fn: function () {
    var engine = freshEngine();
    var reachedAlertAt = driveToAlert(engine, Math.round(10 / DT));
    assert(reachedAlertAt !== null, "setup failed: squad never reached ALERT within 10s");

    var reachedEvasionAt = tickHiddenUntil(
      engine,
      function (e) {
        return e.squad.phase === "EVASION";
      },
      60
    );
    assert(reachedEvasionAt !== null, "setup failed: squad never reached EVASION");

    var maxToCaution = Math.round(Game.GUARD.EVASION_S / DT) + 120; // EVASION_S plus a 2s buffer
    var reachedCautionAt = tickHiddenUntil(
      engine,
      function (e) {
        return e.squad.phase === "CAUTION";
      },
      maxToCaution
    );
    assert(reachedCautionAt !== null, "setup failed: squad never reached CAUTION within EVASION_S + buffer");

    var model = Game.radarModel(engine);
    assert(model.jammed === false, "expected jammed false during CAUTION");
    assert(
      model.guards.length === engine.guards.length,
      "expected guards visible again during CAUTION"
    );

    var expectedFov = Game.VISION.FOV_DEG * Game.GUARD.CAUTION_FOV_MULT;
    var expectedRange = Game.VISION.RANGE * Game.GUARD.CAUTION_RANGE_MULT;
    model.guards.forEach(function (g) {
      assert(
        Math.abs(g.fovDeg - expectedFov) < 1e-9,
        "expected CAUTION-widened fovDeg " + expectedFov + " (70*1.3), got " + g.fovDeg
      );
      assert(
        Math.abs(g.range - expectedRange) < 1e-9,
        "expected CAUTION-widened range " + expectedRange + " (14*1.2), got " + g.range
      );
    });
  },
});

// ---- 5. CAUTION times out back to INFILTRATION -----------------------------

Game.selfTests.push({
  name: "radar: CAUTION timing out back to INFILTRATION restores base fovDeg/range",
  fn: function () {
    var engine = freshEngine();
    var reachedAlertAt = driveToAlert(engine, Math.round(10 / DT));
    assert(reachedAlertAt !== null, "setup failed: squad never reached ALERT within 10s");

    var reachedEvasionAt = tickHiddenUntil(
      engine,
      function (e) {
        return e.squad.phase === "EVASION";
      },
      60
    );
    assert(reachedEvasionAt !== null, "setup failed: squad never reached EVASION");

    var maxToCaution = Math.round(Game.GUARD.EVASION_S / DT) + 120;
    var reachedCautionAt = tickHiddenUntil(
      engine,
      function (e) {
        return e.squad.phase === "CAUTION";
      },
      maxToCaution
    );
    assert(reachedCautionAt !== null, "setup failed: squad never reached CAUTION");

    var maxToInfiltration = Math.round(Game.GUARD.CAUTION_S / DT) + 120; // CAUTION_S plus a 2s buffer
    var reachedInfiltrationAt = tickHiddenUntil(
      engine,
      function (e) {
        return e.squad.phase === "INFILTRATION";
      },
      maxToInfiltration
    );
    assert(
      reachedInfiltrationAt !== null,
      "setup failed: squad never returned to INFILTRATION within CAUTION_S + buffer"
    );

    var model = Game.radarModel(engine);
    assert(model.jammed === false, "expected jammed false back in INFILTRATION");
    model.guards.forEach(function (g) {
      assert(g.fovDeg === Game.VISION.FOV_DEG, "expected base fovDeg restored, got " + g.fovDeg);
      assert(g.range === Game.VISION.RANGE, "expected base range restored, got " + g.range);
    });
  },
});

// ---- 6. JSON-serializability -----------------------------------------------

Game.selfTests.push({
  name: "radar: model is JSON-serializable, with no functions/undefined anywhere in the tree",
  fn: function () {
    var engine = freshEngine();
    // Tick a handful of times with real movement input so player/guard
    // fields are non-default before snapshotting, not just t=0 spawn state.
    for (var i = 0; i < 30; i++) {
      engine.tick({ moveX: 0.3, moveY: -0.4, run: false, stance: "crouch" });
    }

    var model = Game.radarModel(engine);
    assertNoFunctionsOrUndefined(model);

    var roundTripped = JSON.parse(JSON.stringify(model));
    assert(deepEqual(model, roundTripped), "model must deep-equal its own JSON round-trip");
  },
});

if (typeof module !== "undefined") module.exports = {};
