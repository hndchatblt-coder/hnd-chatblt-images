// tests/guardAI.test.js — headless assertions for src/guardAI.js.
// Same registry pattern as tests/world.test.js / tests/vision.test.js: push
// onto the shared Game.selfTests list; test.js runs every entry and reports
// ok/FAIL with real exit codes.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// Smallest signed angular difference a-b, wrapped to (-PI, PI] — test-local,
// independent of guardAI's own internal helper (nothing here reaches into
// the module's closures).
function angleWrapDiff(a, b) {
  var TWO_PI = Math.PI * 2;
  var r = (a - b) % TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  if (r < -Math.PI) r += TWO_PI;
  return r;
}

function dist(x1, y1, x2, y2) {
  var dx = x2 - x1;
  var dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

var zone = Game.ZONES.loadingDock;
var world = Game.createWorld(zone);
var vision = Game.createVision({ world: world });
var rng = Game.createRng(1);
var DT = 1 / 60;

function farPlayer() {
  // Far outside RANGE (14m) and outside the zone entirely: never seen.
  return {
    x: -1000,
    y: -1000,
    visionProfile: function () {
      return 1.0;
    },
  };
}

// A guard whose single "waypoint" is 1000m out along `facing` from (gx,gy).
// Over the short horizons these tests run, the guard walks a straight line
// in that direction (facing locked, since the target direction never
// changes) and never arrives — isolating detection/FSM behavior from real
// patrol-loop bookkeeping (tests 1 and 2 cover the loop itself).
function straightGuard(gx, gy, facing, id) {
  var farX = gx + Math.cos(facing) * 1000;
  var farY = gy + Math.sin(facing) * 1000;
  return Game.createGuard({
    world: world,
    vision: vision,
    rng: rng,
    spawn: { x: gx, y: gy },
    waypoints: [{ x: farX, y: farY }],
    id: id,
  });
}

// 1. Patrol loop: over a generous horizon, the guard visits every waypoint
// and never leaves PATROL while nothing is ever seen.
//
// NOTE: this uses a custom 4-point loop rather than zone.waypoints directly.
// zone.waypoints's real NW(4,5)->NE(36,5) leg runs straight through the
// guard-hut wall ({x:9,y:3,w:6,h:5} spans y:3-8, squarely on y=5) — a
// pre-existing level-data fact in src/world.js (out of scope here; guardAI
// does no pathfinding per its contract, so a guard sent straight down that
// leg wedges against the hut and never arrives). This loop's 4 points sit on
// verified-clear consecutive lines within the SAME loadingDock world/walls,
// isolating the PATROL loop/visit mechanic under test from that unrelated
// level-geometry issue (worth a BACKLOG item to fix the zone data).
var openLoop = [
  { x: 3, y: 28 },
  { x: 37, y: 28 },
  { x: 37, y: 2.2 },
  { x: 3, y: 2.2 },
];
Game.selfTests.push({
  name: "guardAI: PATROL walks the full waypoint loop and never leaves PATROL when nothing is seen",
  fn: function () {
    var g = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      waypoints: openLoop,
      id: "patrol-loop",
    });
    var player = farPlayer();
    var visited = openLoop.map(function () {
      return false;
    });
    var TICKS = 6000; // 100s @ 60Hz — full loop is ~4700 travel ticks + 4 pauses (~86s)
    for (var i = 0; i < TICKS; i++) {
      g.update(DT, { player: player });
      assert(g.state === "PATROL", "expected state to stay PATROL, got " + g.state + " at tick " + i);
      for (var w = 0; w < openLoop.length; w++) {
        var wp = openLoop[w];
        if (dist(g.x, g.y, wp.x, wp.y) <= Game.GUARD.ARRIVE_DIST) visited[w] = true;
      }
    }
    visited.forEach(function (v, i) {
      assert(v, "waypoint " + i + " (" + JSON.stringify(openLoop[i]) + ") was never visited");
    });
  },
});

// 2. Waypoint pause: the guard dwells ~WAYPOINT_PAUSE seconds at a waypoint
// before advancing, and its facing oscillates (head sweep) during the dwell.
Game.selfTests.push({
  name: "guardAI: dwells ~WAYPOINT_PAUSE at a waypoint with an oscillating facing sweep",
  fn: function () {
    var wp0 = zone.waypoints[0];
    var g = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: wp0.x, y: wp0.y },
      waypoints: zone.waypoints,
      id: "pause",
    });
    var player = farPlayer();
    var startIndex = g.waypointIndex;
    var seenFacings = [];
    var pauseTicks = 0;
    var advanced = false;
    var TICKS = 400; // 6.67s — comfortably more than WAYPOINT_PAUSE (2s)
    for (var i = 0; i < TICKS; i++) {
      g.update(DT, { player: player });
      if (g.waypointIndex !== startIndex) {
        advanced = true;
        break;
      }
      assert(g.state === "PATROL", "expected PATROL throughout the pause, got " + g.state);
      pauseTicks++;
      seenFacings.push(g.facing);
    }
    assert(advanced, "guard never advanced off the starting waypoint within " + TICKS + " ticks");

    var pauseSeconds = pauseTicks / 60;
    assert(
      pauseSeconds >= Game.GUARD.WAYPOINT_PAUSE * 0.9 && pauseSeconds <= Game.GUARD.WAYPOINT_PAUSE * 1.5,
      "expected pause ~" + Game.GUARD.WAYPOINT_PAUSE + "s, measured " + pauseSeconds + "s"
    );

    var minF = Math.min.apply(null, seenFacings);
    var maxF = Math.max.apply(null, seenFacings);
    assert(maxF - minF > 0.1, "expected facing to oscillate during the pause, range was " + (maxF - minF));
  },
});

// 3. A player 3m ahead on the patrol line is sighted: meter climbs and the
// guard reaches SUSPICIOUS quickly, then turns to face the stimulus.
Game.selfTests.push({
  name: "guardAI: sighting a nearby player raises the meter into SUSPICIOUS and turns to face them",
  fn: function () {
    var g = straightGuard(20, 5, 0, "suspicious-detect");
    var player = { x: 23, y: 5, visionProfile: function () { return 1.0; } };

    var ticksToSuspicious = null;
    var MAX_TICKS = 90; // 1.5s ceiling — spec expects SUSPICIOUS within ~0.5s
    for (var i = 0; i < MAX_TICKS && ticksToSuspicious === null; i++) {
      g.update(DT, { player: player });
      if (g.state === "SUSPICIOUS") ticksToSuspicious = i + 1;
    }
    assert(ticksToSuspicious !== null, "guard never reached SUSPICIOUS within 1.5s of first sight");
    var seconds = ticksToSuspicious / 60;
    assert(seconds <= 1.0, "expected SUSPICIOUS well within 1s of first sight, took " + seconds + "s");

    // Give it time to turn and confirm it settles facing the stimulus.
    for (var j = 0; j < 60; j++) g.update(DT, { player: player });
    var expected = Math.atan2(player.y - g.y, player.x - g.x);
    assert(
      Math.abs(angleWrapDiff(g.facing, expected)) < 0.05,
      "expected guard facing to converge on the player, facing=" + g.facing + " expected=" + expected
    );
  },
});

// 4. Continued close-range sighting fills the meter all the way to ALERT,
// which then has no exit (placeholder for part B).
Game.selfTests.push({
  name: "guardAI: continued close-range sighting fills the meter to ALERT (no exit yet)",
  fn: function () {
    var g = straightGuard(20, 5, 0, "alert-fill");
    var player = { x: 22, y: 5, visionProfile: function () { return 1.0; } };

    var reachedAlert = false;
    var TICKS = 240; // 4s ceiling — generous vs the "~1.2s more" spec
    for (var i = 0; i < TICKS; i++) {
      g.update(DT, { player: player });
      if (g.state === "ALERT") {
        reachedAlert = true;
        break;
      }
    }
    assert(reachedAlert, "expected guard to reach ALERT under continuous close-range sighting");
    assert(g.meter === 1, "expected meter pinned at 1 in ALERT, got " + g.meter);

    g.update(DT, { player: player });
    assert(g.state === "ALERT", "ALERT should have no exit in this version");
  },
});

// 5. Losing sight right after entering SUSPICIOUS: the guard returns to
// PATROL once the stare completes, resuming the SAME waypointIndex.
Game.selfTests.push({
  name: "guardAI: losing sight during SUSPICIOUS returns to PATROL at the same waypointIndex",
  fn: function () {
    var g = straightGuard(20, 5, 0, "lose-sight");
    var startIndex = g.waypointIndex;
    var player = { x: 23, y: 5, visionProfile: function () { return 1.0; } };

    var i;
    for (i = 0; i < 90 && g.state !== "SUSPICIOUS"; i++) g.update(DT, { player: player });
    assert(g.state === "SUSPICIOUS", "setup failed: guard never reached SUSPICIOUS");

    // Duck out of sight immediately.
    player.x = -1000;
    player.y = -1000;

    var backToPatrol = false;
    var CEILING = Math.ceil(Game.GUARD.MAX_STATE_S.SUSPICIOUS * 60) + 60;
    for (i = 0; i < CEILING; i++) {
      g.update(DT, { player: player });
      assert(g.state !== "ALERT", "guard should not escalate to ALERT after losing sight");
      if (g.state === "PATROL") {
        backToPatrol = true;
        break;
      }
    }
    assert(backToPatrol, "guard never returned to PATROL after losing sight");
    assert(
      g.waypointIndex === startIndex,
      "expected waypointIndex to be preserved (" + startIndex + "), got " + g.waypointIndex
    );
  },
});

// 6. hearNoise("faint") triggers immediate SUSPICIOUS facing the noise
// origin; with no player ever in sight, it decays back to PATROL.
Game.selfTests.push({
  name: "guardAI: hearNoise('faint') triggers SUSPICIOUS facing the noise, decaying back to PATROL",
  fn: function () {
    var g = straightGuard(5, 5, 0, "faint-noise");
    var player = farPlayer();
    var nx = 5;
    var ny = 10; // due south of the guard

    g.hearNoise(nx, ny, "faint");
    assert(g.state === "SUSPICIOUS", "expected immediate SUSPICIOUS on faint noise, got " + g.state);
    assert(g.stimulus.x === nx && g.stimulus.y === ny, "expected stimulus set to the noise origin");

    for (var i = 0; i < 60; i++) g.update(DT, { player: player });
    var expected = Math.atan2(ny - g.y, nx - g.x);
    assert(
      Math.abs(angleWrapDiff(g.facing, expected)) < 0.1,
      "expected facing to turn toward the noise, facing=" + g.facing + " expected=" + expected
    );

    var backToPatrol = false;
    for (i = 0; i < 300; i++) {
      g.update(DT, { player: player });
      if (g.state === "PATROL") {
        backToPatrol = true;
        break;
      }
    }
    assert(backToPatrol, "guard never decayed back to PATROL after the faint-noise stare completed");
  },
});

// 7. hearNoise("strong") sends the guard straight to INVESTIGATE; it walks
// to the stimulus, searches for ~INVESTIGATE_SEARCH seconds, then returns to
// PATROL.
Game.selfTests.push({
  name: "guardAI: hearNoise('strong') drives INVESTIGATE to arrival, search, then back to PATROL",
  fn: function () {
    var g = straightGuard(5, 5, 0, "strong-noise");
    var player = farPlayer();
    var nx = 8;
    var ny = 5; // 3m away; INVESTIGATE_SPEED 2.0 m/s -> ~1.5s travel

    g.hearNoise(nx, ny, "strong");
    assert(g.state === "INVESTIGATE", "expected immediate INVESTIGATE on strong noise, got " + g.state);

    var minDist = Infinity;
    var backToPatrol = false;
    var TICKS = 900; // 15s: ~1.5s travel + 8s search + buffer
    for (var i = 0; i < TICKS; i++) {
      g.update(DT, { player: player });
      var d = dist(g.x, g.y, nx, ny);
      if (d < minDist) minDist = d;
      if (g.state === "PATROL") {
        backToPatrol = true;
        break;
      }
    }
    assert(minDist <= Game.GUARD.ARRIVE_DIST, "guard never got within ARRIVE_DIST of the stimulus, min dist " + minDist);
    assert(backToPatrol, "guard never returned to PATROL after the investigate search completed");
  },
});

// 8. Full determinism: two guards built from identical seeds/world and fed
// an identical scripted (non-random) player trajectory produce byte-for-byte
// identical (x, y, state) traces over 600 ticks.
Game.selfTests.push({
  name: "guardAI: identical seeds/world/scripted player produce identical (x,y,state) traces",
  fn: function () {
    function scriptedPlayerAt(t) {
      return {
        x: 20 + 6 * Math.cos(t * 0.5),
        y: 15 + 6 * Math.sin(t * 0.5),
        visionProfile: function () {
          return 1.0;
        },
      };
    }
    function makeGuard(seed) {
      var w = Game.createWorld(zone);
      return Game.createGuard({
        world: w,
        vision: Game.createVision({ world: w }),
        rng: Game.createRng(seed),
        waypoints: zone.waypoints,
        id: "det",
      });
    }

    var gA = makeGuard(777);
    var gB = makeGuard(777);
    var TICKS = 600;
    for (var i = 0; i < TICKS; i++) {
      var t = i / 60;
      gA.update(DT, { player: scriptedPlayerAt(t) });
      gB.update(DT, { player: scriptedPlayerAt(t) });
      assert(
        gA.x === gB.x && gA.y === gB.y && gA.state === gB.state,
        "trace diverged at tick " +
          i +
          ": A=" +
          JSON.stringify({ x: gA.x, y: gA.y, state: gA.state }) +
          " B=" +
          JSON.stringify({ x: gB.x, y: gB.y, state: gB.state })
      );
    }
  },
});
