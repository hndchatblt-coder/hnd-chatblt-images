// tests/hud.test.js -- headless assertions for src/hud.js's pure MODEL half
// (Game.hudModel). The canvas/view half (Game.createHud) is BROWSER ONLY by
// design (see src/hud.js's file header) and is deliberately NOT exercised
// here -- screenshot.js is what verifies the rendered canvas actually looks
// right (open shots/02-ingame-patrol.png and shots/03-alert.png and look).
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

// Recursively asserts every number in the tree is finite (not NaN/Infinity).
function assertAllFinite(value, path) {
  path = path || "root";
  if (typeof value === "number") {
    if (!isFinite(value)) throw new Error("found non-finite number at " + path + ": " + value);
    return;
  }
  if (value === null || typeof value !== "object") return;
  Object.keys(value).forEach(function (k) {
    assertAllFinite(value[k], path + "." + k);
  });
}

function freshEngine() {
  return Game.createEngine();
}

// Ticks `engine`, each tick re-teleporting the player to a fixed distance
// directly in front of guards[0]'s CURRENT facing (recomputed live every
// tick, since a patrolling/sweeping guard's facing keeps changing) -- close
// enough (2m, inside VISION.FILL_NEAR_DIST) and dead-center in its cone so
// the meter fills to ALERT_AT quickly. Mirrors tests/radar.test.js's
// driveToAlert helper exactly. Returns the tick index ALERT was reached at,
// or null.
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
// Returns the tick index it became true at, or null. Mirrors
// tests/radar.test.js's tickHiddenUntil helper exactly.
function tickHiddenUntil(engine, predicate, maxTicks) {
  for (var i = 0; i < maxTicks; i++) {
    engine.player.x = -1000;
    engine.player.y = -1000;
    engine.tick();
    if (predicate(engine)) return i;
  }
  return null;
}

// ---- 1. Fresh engine baseline ----------------------------------------------

// NOTE (tranq cycle): this test originally asserted model.weapon was still
// the pre-items placeholder ({name:"---", ammo:null}) on a fresh engine.
// That premise is now factually wrong -- Game.createEngine() wires up a real
// Game.createInventory() (see src/items.js / src/engine.js), and src/hud.js's
// own contract now requires hudModel.weapon = {name:"TRANQ", ammo: darts}
// whenever engine.inventory exists (see its file header). Per CLAUDE.md's
// ratchet rule ("a wrong test is replaced by a stricter one"), the weapon
// assertion below is updated to the new real shape; every other assertion in
// this test (life/phase/zoneName/item placeholder/maxDetection) is untouched.
Game.selfTests.push({
  name: "hud: fresh engine model -- life 1.0, INFILTRATION, zone name, real weapon, item placeholder, no detection",
  fn: function () {
    var engine = freshEngine();
    var model = Game.hudModel(engine);

    assert(model.life === 1.0, "expected life 1.0 (no player.hp yet), got " + model.life);
    assert(model.phase === "INFILTRATION", "expected phase INFILTRATION, got " + model.phase);
    assert(model.phaseRemaining === null, "expected phaseRemaining null in INFILTRATION");
    assert(model.alertCount === 0, "expected alertCount 0 at boot, got " + model.alertCount);
    assert(model.zoneName === "LOADING DOCK", "expected zoneName 'LOADING DOCK', got " + model.zoneName);
    assert(model.time === engine.time, "expected time to mirror engine.time");

    assert(
      model.weapon.name === "TRANQ" && model.weapon.ammo === Game.ITEMS.STARTING_DARTS,
      "expected real weapon shape {TRANQ, " + Game.ITEMS.STARTING_DARTS + "}, got " + JSON.stringify(model.weapon)
    );
    // NOTE (box/chaff/ration cycle): this assertion originally read
    // model.item.name === "---" && model.item.count === null (the item
    // placeholder). That premise is now factually wrong -- Game.createEngine()
    // wires up a real Game.createInventory() with a starting ration count
    // (see src/items.js), and src/hud.js's own contract now requires
    // hudModel.item = {name:"RATION", count: rations} whenever
    // engine.inventory exists (see its file header). Per CLAUDE.md's ratchet
    // rule 2 ("a wrong test is replaced by a stricter one"), this assertion
    // is replaced with the stricter real shape below, driven off
    // Game.ITEMS.STARTING_RATIONS rather than a hardcoded 3 so it can't drift
    // from the tunable; every other assertion in this test is untouched.
    assert(
      model.item.name === "RATION" && model.item.count === Game.ITEMS.STARTING_RATIONS,
      "expected real item shape {RATION, " + Game.ITEMS.STARTING_RATIONS + "}, got " + JSON.stringify(model.item)
    );

    assert(model.maxDetection === 0, "expected maxDetection 0 at boot, got " + model.maxDetection);
  },
});

// ---- 2. Drive to ALERT -----------------------------------------------------

Game.selfTests.push({
  name: "hud: driving to ALERT reflects phase ALERT, alertCount 1, maxDetection pinned at 1",
  fn: function () {
    var engine = freshEngine();
    var reachedAt = driveToAlert(engine, Math.round(10 / DT));
    assert(reachedAt !== null, "setup failed: squad never reached ALERT within 10s");

    var model = Game.hudModel(engine);
    assert(model.phase === "ALERT", "expected phase ALERT, got " + model.phase);
    assert(model.alertCount === 1, "expected alertCount 1 after first alert, got " + model.alertCount);
    assert(model.phaseRemaining === null, "expected phaseRemaining null during ALERT (no timer)");
    assert(
      model.maxDetection === 1,
      "expected maxDetection pinned at 1 during ALERT (guard meter pinned), got " + model.maxDetection
    );
  },
});

// ---- 3. EVASION countdown ---------------------------------------------------

Game.selfTests.push({
  name: "hud: EVASION phaseRemaining tracks EVASION_S - phaseTime and decreases across ticks",
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

    var modelA = Game.hudModel(engine);
    assert(modelA.phase === "EVASION", "expected phase EVASION, got " + modelA.phase);
    assert(
      Math.abs(modelA.phaseRemaining - (Game.GUARD.EVASION_S - engine.squad.phaseTime)) < 1e-9,
      "expected phaseRemaining EVASION_S - phaseTime, got " + modelA.phaseRemaining
    );

    // Tick further (still hidden) and confirm the countdown actually
    // decreases, not just matches the formula once.
    for (var i = 0; i < 30; i++) {
      engine.player.x = -1000;
      engine.player.y = -1000;
      engine.tick();
      if (engine.squad.phase !== "EVASION") break; // don't run past EVASION's own window
    }
    if (engine.squad.phase === "EVASION") {
      var modelB = Game.hudModel(engine);
      assert(
        modelB.phaseRemaining < modelA.phaseRemaining,
        "expected phaseRemaining to decrease across ticks, got " +
          modelA.phaseRemaining +
          " -> " +
          modelB.phaseRemaining
      );
      assert(
        Math.abs(modelB.phaseRemaining - (Game.GUARD.EVASION_S - engine.squad.phaseTime)) < 1e-9,
        "expected phaseRemaining formula to still hold after further ticks"
      );
    }
  },
});

// ---- 4. CAUTION countdown, then back to INFILTRATION -----------------------

Game.selfTests.push({
  name: "hud: CAUTION phaseRemaining tracks CAUTION_S window; INFILTRATION restores phaseRemaining null",
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

    var cautionModel = Game.hudModel(engine);
    assert(cautionModel.phase === "CAUTION", "expected phase CAUTION, got " + cautionModel.phase);
    assert(
      Math.abs(cautionModel.phaseRemaining - (Game.GUARD.CAUTION_S - engine.squad.phaseTime)) < 1e-9,
      "expected phaseRemaining CAUTION_S - phaseTime, got " + cautionModel.phaseRemaining
    );

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

    var infiltrationModel = Game.hudModel(engine);
    assert(
      infiltrationModel.phase === "INFILTRATION",
      "expected phase INFILTRATION, got " + infiltrationModel.phase
    );
    assert(
      infiltrationModel.phaseRemaining === null,
      "expected phaseRemaining null back in INFILTRATION, got " + infiltrationModel.phaseRemaining
    );
  },
});

// ---- 5. JSON-serializability + all-finite ----------------------------------

Game.selfTests.push({
  name: "hud: model is JSON-serializable, no functions/undefined, all numbers finite",
  fn: function () {
    var engine = freshEngine();
    // Tick a handful of times with real movement input so time/player-derived
    // fields are non-default before snapshotting, not just t=0 spawn state.
    for (var i = 0; i < 30; i++) {
      engine.tick({ moveX: 0.3, moveY: -0.4, run: false, stance: "crouch" });
    }

    var model = Game.hudModel(engine);
    assertNoFunctionsOrUndefined(model);
    assertAllFinite(model);

    var roundTripped = JSON.parse(JSON.stringify(model));
    assert(deepEqual(model, roundTripped), "model must deep-equal its own JSON round-trip");
  },
});

if (typeof module !== "undefined") module.exports = {};
