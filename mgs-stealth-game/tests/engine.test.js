// tests/engine.test.js — headless assertions for src/engine.js.
// Same registry pattern as tests/world.test.js: push onto the shared
// Game.selfTests list; test.js runs every entry headless, and boot.js runs
// the SAME list in-browser before the title screen — so every test here must
// be environment-portable (no Date.now/Math.random reliance on node-only
// APIs; timing uses the performance.now()-or-hrtime shim, same as the perf
// test below).
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var DT = 1 / 60;
var VALID_STATES = ["PATROL", "SUSPICIOUS", "INVESTIGATE", "ALERT", "EVASION", "CAUTION"];

function scriptedInput(tick) {
  return {
    moveX: Math.sin(tick * 0.037),
    moveY: Math.cos(tick * 0.051),
    run: tick % 7 === 0,
    stance: tick % 200 < 60 ? "crouch" : tick % 200 < 120 ? "crawl" : "stand",
  };
}

// 1. SMOKE — the binding definition of "playable": boot, spawn, 60 ticks of
// movement, zero errors.
Game.selfTests.push({
  name: "engine smoke: boot, spawn, 60 ticks of movement, zero errors",
  fn: function () {
    var engine = Game.createEngine();
    var spawn = engine.zone.playerSpawn;
    assert(engine.player.x === spawn.x && engine.player.y === spawn.y, "player should spawn at zone.playerSpawn");

    for (var i = 0; i < 60; i++) {
      engine.tick({ moveX: 0, moveY: -1, run: false, stance: "stand" });
    }

    assert(engine.tickCount === 60, "expected tickCount 60, got " + engine.tickCount);
    assert(
      Math.abs(engine.time - 60 * DT) < 1e-9,
      "expected time to track tickCount*DT, got " + engine.time
    );
    // +y is down, so moveY:-1 walks north (decreasing y).
    assert(
      engine.player.y < spawn.y,
      "expected player to move north (y decreasing) from spawn.y=" + spawn.y + ", got " + engine.player.y
    );
    engine.guards.forEach(function (g) {
      assert(VALID_STATES.indexOf(g.state) !== -1, "guard " + g.id + " in invalid state: " + g.state);
    });
  },
});

// 2. Determinism: two engines, same seed, same scripted 600-tick input
// sequence -> identical snapshot() JSON at the end.
Game.selfTests.push({
  name: "engine determinism: same seed + same scripted input -> identical final snapshot",
  fn: function () {
    var engineA = Game.createEngine({ seed: 555 });
    var engineB = Game.createEngine({ seed: 555 });

    for (var tick = 0; tick < 600; tick++) {
      var input = scriptedInput(tick);
      engineA.tick(input);
      engineB.tick(input);
    }

    var snapA = JSON.stringify(engineA.snapshot());
    var snapB = JSON.stringify(engineB.snapshot());
    assert(snapA === snapB, "expected identical snapshots for identical seed+input, got:\n" + snapA + "\nvs\n" + snapB);
  },
});

// 3. Different seeds -> traces may differ but both stay valid throughout.
Game.selfTests.push({
  name: "engine different seeds: both traces stay valid (states, in-bounds positions)",
  fn: function () {
    var engineA = Game.createEngine({ seed: 1 });
    var engineB = Game.createEngine({ seed: 2 });
    var bounds = engineA.zone.bounds;

    function checkValid(engine, label) {
      assert(
        engine.player.x >= 0 && engine.player.x <= bounds.w && engine.player.y >= 0 && engine.player.y <= bounds.h,
        label + ": player out of bounds " + JSON.stringify({ x: engine.player.x, y: engine.player.y })
      );
      engine.guards.forEach(function (g) {
        assert(VALID_STATES.indexOf(g.state) !== -1, label + ": guard " + g.id + " invalid state " + g.state);
        assert(
          g.x >= 0 && g.x <= bounds.w && g.y >= 0 && g.y <= bounds.h,
          label + ": guard " + g.id + " out of bounds " + JSON.stringify({ x: g.x, y: g.y })
        );
      });
    }

    for (var tick = 0; tick < 300; tick++) {
      var input = scriptedInput(tick);
      engineA.tick(input);
      engineB.tick(input);
      checkValid(engineA, "seed1");
      checkValid(engineB, "seed2");
    }
  },
});

// 4. Null input ticks work: player stationary, guards patrol.
Game.selfTests.push({
  name: "engine null input: 60 ticks with no arg leaves player stationary, guards patrol",
  fn: function () {
    var engine = Game.createEngine();
    var spawn = engine.zone.playerSpawn;

    for (var i = 0; i < 60; i++) {
      engine.tick();
    }

    assert(engine.tickCount === 60, "expected tickCount 60, got " + engine.tickCount);
    assert(
      engine.player.x === spawn.x && engine.player.y === spawn.y,
      "expected player stationary with no input, got " + JSON.stringify({ x: engine.player.x, y: engine.player.y })
    );
    engine.guards.forEach(function (g) {
      assert(VALID_STATES.indexOf(g.state) !== -1, "guard " + g.id + " in invalid state: " + g.state);
    });
  },
});

// 5. Event emission: teleport the player in front of a guard and hold it
// there until ALERT fires — expect exactly one phaseChange
// INFILTRATION->ALERT and exactly one alert event across the whole run.
Game.selfTests.push({
  name: "engine events: phaseChange INFILTRATION->ALERT and alert fire exactly once",
  fn: function () {
    // Straight, clear east-west corridor (same geometry sim.js's part-A/B
    // scenarios rely on) so the guard's facing stays perfectly stable at 0
    // while it "patrols" toward a target it will never reach in this window.
    var engine = Game.createEngine({
      guardConfigs: [{ id: "evt-g1", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });

    // engine.player.x/y are writable flat props (see src/player.js contract);
    // teleport 2m directly ahead of the guard's facing (close range -> fast fill).
    engine.player.x = 22;
    engine.player.y = 5;

    var phaseChangeToAlertCount = 0;
    var alertEventCount = 0;
    var TOTAL_TICKS = Math.round(6 / DT); // 6s: plenty vs. ~0.8s expected fill time

    for (var tick = 0; tick < TOTAL_TICKS; tick++) {
      engine.tick(); // null input: player must stay put via direct teleport, not movement
      // Re-pin the player's position every tick since a null-input tick is a
      // true no-op on player.x/y anyway (moveX/moveY are 0) — this just
      // guards against any future default-input change breaking the setup.
      engine.player.x = 22;
      engine.player.y = 5;

      engine.events.forEach(function (ev) {
        if (ev.type === "phaseChange" && ev.from === "INFILTRATION" && ev.to === "ALERT") {
          phaseChangeToAlertCount++;
        }
        if (ev.type === "alert") {
          alertEventCount++;
        }
      });
    }

    assert(
      phaseChangeToAlertCount === 1,
      "expected exactly one INFILTRATION->ALERT phaseChange, got " + phaseChangeToAlertCount
    );
    assert(alertEventCount === 1, "expected exactly one alert event, got " + alertEventCount);
    assert(engine.squad.phase === "ALERT", "expected squad to still be ALERT (player never left LOS), got " + engine.squad.phase);
  },
});

// 6. Squad wiring: after ALERT, hide the player far away for long enough and
// the phase ladder advances EVASION -> CAUTION -> INFILTRATION with no
// manual squad calls — the engine owns the loop end to end.
Game.selfTests.push({
  name: "engine squad wiring: ALERT -> EVASION -> CAUTION -> INFILTRATION with no manual squad calls",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "ladder-g1", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });

    engine.player.x = 22;
    engine.player.y = 5;

    // Drive to ALERT first (reuse the same close-range setup as test 5).
    var reachedAlert = false;
    for (var t = 0; t < Math.round(6 / DT) && !reachedAlert; t++) {
      engine.tick();
      engine.player.x = 22;
      engine.player.y = 5;
      if (engine.squad.phase === "ALERT") reachedAlert = true;
    }
    assert(reachedAlert, "setup failed: squad never reached ALERT");

    // Hide the player for good and let the engine's own tick loop run the
    // rest of the ladder — no direct squad.tick()/broadcastAlert() calls here.
    engine.player.x = -1000;
    engine.player.y = -1000;

    var evasionAt = null;
    var cautionAt = null;
    var infiltrationAt = null;
    var TOTAL_TICKS = Math.round(100 / DT); // EVASION_S(30) + CAUTION_S(45) + buffer

    for (var tick = 0; tick < TOTAL_TICKS; tick++) {
      engine.tick();
      engine.player.x = -1000;
      engine.player.y = -1000;
      if (evasionAt === null && engine.squad.phase === "EVASION") evasionAt = tick;
      if (cautionAt === null && engine.squad.phase === "CAUTION") cautionAt = tick;
      if (infiltrationAt === null && engine.squad.phase === "INFILTRATION") infiltrationAt = tick;
    }

    assert(evasionAt !== null, "squad never reached EVASION after losing the player");
    assert(cautionAt !== null && cautionAt > evasionAt, "squad never reached CAUTION after EVASION");
    assert(
      infiltrationAt !== null && infiltrationAt > cautionAt,
      "squad never returned to INFILTRATION after CAUTION"
    );
  },
});

// 7. PERF BUDGET — 10 guards, full tick under 4ms average.
Game.selfTests.push({
  name: "engine perf: 10 guards, full tick under 4ms budget",
  fn: function () {
    var now =
      typeof performance !== "undefined" && performance.now
        ? function () {
            return performance.now();
          }
        : function () {
            var t = process.hrtime.bigint();
            return Number(t) / 1e6;
          };

    var zone = Game.ZONES.loadingDock;
    var probeWorld = Game.createWorld(zone);

    var guardConfigs = [];
    for (var i = 0; i < 10; i++) {
      var base = zone.waypoints[i % zone.waypoints.length];
      var angle = (i / 10) * Math.PI * 2;
      var dist = 1.2;
      var x = base.x + Math.cos(angle) * dist;
      var y = base.y + Math.sin(angle) * dist;
      var tries = 0;
      while (probeWorld.isBlockedCircle(x, y, 0.6) && tries < 30) {
        dist += 0.3;
        x = base.x + Math.cos(angle) * dist;
        y = base.y + Math.sin(angle) * dist;
        tries++;
      }
      assert(!probeWorld.isBlockedCircle(x, y, 0.6), "perf guard " + i + " spawn is blocked: " + JSON.stringify({ x: x, y: y }));
      guardConfigs.push({ id: "perf-g" + i, spawn: { x: x, y: y }, waypoints: zone.waypoints });
    }

    var engine = Game.createEngine({ guardConfigs: guardConfigs });

    var TOTAL_TICKS = 600;
    var start = now();
    for (var tick = 0; tick < TOTAL_TICKS; tick++) {
      engine.tick({
        moveX: Math.sin(tick * 0.04),
        moveY: Math.cos(tick * 0.033),
        run: tick % 5 === 0,
        stance: "stand",
      });
    }
    var elapsed = now() - start;
    var avgMs = elapsed / TOTAL_TICKS;

    assert(avgMs < 4, "expected average tick under 4ms with 10 guards, got " + avgMs.toFixed(3) + "ms");
  },
});
