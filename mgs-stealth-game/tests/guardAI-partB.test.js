// tests/guardAI-partB.test.js — headless assertions for FSM part B (ALERT/
// EVASION/CAUTION + squad coordination) added to src/guardAI.js. Same
// registry pattern as tests/guardAI.test.js: push onto the shared
// Game.selfTests list; test.js runs every entry and reports ok/FAIL with real
// exit codes. Does NOT touch tests/guardAI.test.js (part-A tests stay as-is).
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

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

function scriptedPlayer(x, y) {
  return {
    x: x,
    y: y,
    visionProfile: function () {
      return 1.0;
    },
  };
}

function farPlayer() {
  return scriptedPlayer(-1000, -1000);
}

// A guard whose single "waypoint" is 1000m out along `facing` — walks a
// stable straight line without arriving during these short tests, isolating
// FSM/perception behavior from patrol-loop bookkeeping (same helper shape as
// tests/guardAI.test.js's straightGuard).
function straightGuard(gx, gy, facing, id, extraDeps) {
  var farX = gx + Math.cos(facing) * 1000;
  var farY = gy + Math.sin(facing) * 1000;
  var deps = {
    world: world,
    vision: vision,
    rng: rng,
    spawn: { x: gx, y: gy },
    waypoints: [{ x: farX, y: farY }],
    id: id,
  };
  if (extraDeps) {
    for (var k in extraDeps) deps[k] = extraDeps[k];
  }
  return Game.createGuard(deps);
}

// Drives a squad-wide tick after every guard's update, exactly as the file
// header documents the future engine will: guards.forEach(update), then
// squad.tick(dt, guards.some(g => g.hasLOS)). Shared by every multi-guard
// test below so the "reference loop" only needs to be written once.
function tickAll(guards, squad, player, dt) {
  for (var i = 0; i < guards.length; i++) {
    guards[i].update(dt, { player: player });
  }
  var anyLOS = guards.some(function (g) {
    return g.hasLOS;
  });
  squad.tick(dt, anyLOS);
}

// 1. Confirmed sight -> guard ALERT, squad.phase ALERT, alertCount 1,
// lastKnown ~= player pos.
Game.selfTests.push({
  name: "guardAI partB: confirmed sight drives guard+squad to ALERT with alertCount 1 and lastKnown set",
  fn: function () {
    var squad = Game.createSquad();
    var g = straightGuard(20, 5, 0, "alert-entry", { squad: squad });
    var player = scriptedPlayer(22, 5); // 2m ahead, close range -> fills fast

    var reachedAlert = false;
    for (var i = 0; i < 240 && !reachedAlert; i++) {
      g.update(DT, { player: player });
      if (g.state === "ALERT") reachedAlert = true;
    }
    assert(reachedAlert, "guard never reached ALERT under continuous close-range sighting");
    assert(squad.phase === "ALERT", "expected squad.phase ALERT, got " + squad.phase);
    assert(squad.alertCount === 1, "expected alertCount 1, got " + squad.alertCount);
    assert(squad.lastKnown !== null, "expected lastKnown to be set");
    assert(
      dist(squad.lastKnown.x, squad.lastKnown.y, player.x, player.y) < 0.01,
      "expected lastKnown ~= player pos, got " + JSON.stringify(squad.lastKnown)
    );

    // Re-broadcasting while already ALERT must not bump alertCount again.
    g.update(DT, { player: player });
    assert(squad.alertCount === 1, "alertCount must not increment on re-broadcast during ALERT");
  },
});

// 2. Radio call: two guards share a squad; only guard A sees the player ->
// guard B leaves PATROL for ALERT and moves toward lastKnown.
Game.selfTests.push({
  name: "guardAI partB: radio call moves an unsighted squadmate from PATROL into ALERT toward lastKnown",
  fn: function () {
    var squad = Game.createSquad();
    var gA = straightGuard(20, 5, 0, "radio-A", { squad: squad });
    // gB spawns far away, facing away from everything -> never itself sees the player.
    var gB = straightGuard(2, 2, Math.PI, "radio-B", { squad: squad });
    var player = scriptedPlayer(22, 5); // only within gA's view

    var aAlertTick = null;
    var TICKS = 300;
    var bStartDistToLastKnown = null;
    for (var i = 0; i < TICKS; i++) {
      gA.update(DT, { player: player });
      if (aAlertTick === null && gA.state === "ALERT") aAlertTick = i;
      gB.update(DT, { player: player });
      squad.tick(DT, gA.hasLOS || gB.hasLOS);

      if (aAlertTick !== null && bStartDistToLastKnown === null && gB.state === "ALERT") {
        bStartDistToLastKnown = dist(gB.x, gB.y, squad.lastKnown.x, squad.lastKnown.y);
      }
      if (bStartDistToLastKnown !== null) break;
    }
    assert(aAlertTick !== null, "guard A never reached ALERT — setup invalid");
    assert(gB.state === "ALERT", "expected radioed-in guard B to be ALERT, got " + gB.state);
    assert(bStartDistToLastKnown !== null, "guard B never joined ALERT");

    // Run further ticks and confirm B is actually closing the distance to lastKnown.
    for (var j = 0; j < 120; j++) {
      gA.update(DT, { player: player });
      gB.update(DT, { player: player });
      squad.tick(DT, gA.hasLOS || gB.hasLOS);
    }
    var laterDist = dist(gB.x, gB.y, squad.lastKnown.x, squad.lastKnown.y);
    assert(
      laterDist < bStartDistToLastKnown,
      "expected guard B to move toward lastKnown: start=" + bStartDistToLastKnown + " later=" + laterDist
    );
  },
});

// 3. ALERT pursuit: player visible and moving — guard closes distance at
// ALERT_SPEED and stops within ARREST_DIST, never overlapping the player.
Game.selfTests.push({
  name: "guardAI partB: ALERT pursuit closes to ARREST_DIST and never overlaps a moving, visible player",
  fn: function () {
    var squad = Game.createSquad();
    var g = straightGuard(20, 5, 0, "pursuit", { squad: squad });
    var px = 23,
      py = 5; // 3m ahead, in plain sight (open floor, same line part-A tests use)

    var reachedAlert = false;
    var minDist = Infinity;
    var TICKS = 900; // 15s
    for (var i = 0; i < TICKS; i++) {
      // Player drifts slowly along y, always within cone/range of the guard's
      // general facing (guard tracks it once ALERT).
      px += 0.01; // ~0.6 m/s drift, well under ALERT_SPEED (3.2 m/s)
      var player = scriptedPlayer(px, py);
      g.update(DT, { player: player });
      if (g.state === "ALERT") reachedAlert = true;
      if (reachedAlert) {
        var d = dist(g.x, g.y, px, py);
        if (d < minDist) minDist = d;
        assert(
          d >= Game.GUARD.ARREST_DIST - 1e-6,
          "guard overlapped ARREST_DIST: dist=" + d + " at tick " + i
        );
      }
    }
    assert(reachedAlert, "guard never reached ALERT");
    assert(
      minDist <= Game.GUARD.ARREST_DIST + 0.2,
      "expected guard to close to ~ARREST_DIST, min dist was " + minDist
    );
  },
});

// 4. Lost contact: player teleports behind a wall -> squad flips to EVASION
// after the tick with no LOS; guards converge on lastKnown.
Game.selfTests.push({
  name: "guardAI partB: losing LOS flips squad ALERT->EVASION and guards converge on lastKnown",
  fn: function () {
    var squad = Game.createSquad();
    var g = straightGuard(20, 5, 0, "lost-contact", { squad: squad });
    var seenSpot = { x: 22, y: 5 };
    var player = scriptedPlayer(seenSpot.x, seenSpot.y);

    var i;
    for (i = 0; i < 240 && g.state !== "ALERT"; i++) {
      g.update(DT, { player: player });
      squad.tick(DT, g.hasLOS);
    }
    assert(g.state === "ALERT", "setup failed: guard never reached ALERT");
    var lastKnownAtLoss = squad.lastKnown;

    // Teleport the player far away (stand-in for "behind a wall" — vision's
    // own wall-LOS behavior is covered in vision.test.js; here we only need
    // hasLOS to go false this tick).
    player.x = -1000;
    player.y = -1000;

    var flippedTick = null;
    for (i = 0; i < 5; i++) {
      g.update(DT, { player: player });
      squad.tick(DT, g.hasLOS);
      if (squad.phase === "EVASION") {
        flippedTick = i;
        break;
      }
    }
    assert(flippedTick !== null, "squad never flipped to EVASION within a few ticks of losing LOS");
    assert(flippedTick === 0, "expected EVASION on the very first no-LOS tick, flipped at tick " + flippedTick);

    // Guard should now be converging on the remembered lastKnown point.
    var startDist = dist(g.x, g.y, lastKnownAtLoss.x, lastKnownAtLoss.y);
    for (i = 0; i < 60; i++) {
      g.update(DT, { player: player });
      squad.tick(DT, g.hasLOS);
    }
    assert(g.state === "EVASION", "expected guard state EVASION, got " + g.state);
    var laterDist = dist(g.x, g.y, lastKnownAtLoss.x, lastKnownAtLoss.y);
    assert(
      laterDist < startDist,
      "expected guard to converge on lastKnown: start=" + startDist + " later=" + laterDist
    );
  },
});

// 5. EVASION sweep staggering: two guards at the same lastKnown sweep
// different arcs (facings differ by a sane margin over the sweep).
Game.selfTests.push({
  name: "guardAI partB: two guards sweeping the same lastKnown point stagger their facing arcs",
  fn: function () {
    var squad = Game.createSquad();
    squad.phase = "EVASION";
    squad.phaseTime = 0;
    squad.lastKnown = { x: 10, y: 10 };

    // Both guards start already AT lastKnown (within ARRIVE_DIST) so they
    // skip the travel leg and sweep immediately.
    var gA = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: 10, y: 10 },
      waypoints: [{ x: 1010, y: 10 }],
      id: "sweep-A",
      squad: squad,
    });
    var gB = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: 10.1, y: 10 },
      waypoints: [{ x: 1010, y: 10 }],
      id: "sweep-B-totally-different-id",
      squad: squad,
    });
    var player = farPlayer();

    var maxFacingDiff = 0;
    var TICKS = 300; // 5s, several sweep cycles at SEARCH_SWEEP_HZ ~0.5Hz
    for (var i = 0; i < TICKS; i++) {
      gA.update(DT, { player: player });
      gB.update(DT, { player: player });
      squad.tick(DT, gA.hasLOS || gB.hasLOS);
      assert(gA.state === "EVASION" && gB.state === "EVASION", "both guards should stay EVASION");
      var diff = Math.abs(angleWrapDiff(gA.facing, gB.facing));
      if (diff > maxFacingDiff) maxFacingDiff = diff;
    }
    assert(
      maxFacingDiff > 0.3,
      "expected staggered sweep facings to diverge by a sane margin, max diff was " + maxFacingDiff
    );
  },
});

// 6. Ladder timing: EVASION -> CAUTION after ~30s no re-sighting; CAUTION ->
// INFILTRATION after ~45s more; guards back to PATROL with normal cone/speed.
Game.selfTests.push({
  name: "guardAI partB: full ladder EVASION->CAUTION->INFILTRATION times out and returns guards to PATROL",
  fn: function () {
    var squad = Game.createSquad();
    squad.phase = "EVASION";
    squad.phaseTime = 0;
    squad.lastKnown = { x: 20, y: 5 };
    var g = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: 20, y: 5 },
      waypoints: zone.waypoints,
      id: "ladder",
      squad: squad,
    });
    var player = farPlayer(); // never re-sighted for the whole run

    var toCautionTick = null;
    var toInfiltrationTick = null;
    var TICKS = Math.round((Game.GUARD.EVASION_S + Game.GUARD.CAUTION_S + 5) / DT);
    for (var i = 0; i < TICKS; i++) {
      g.update(DT, { player: player });
      squad.tick(DT, g.hasLOS);
      if (toCautionTick === null && squad.phase === "CAUTION") toCautionTick = i;
      if (toInfiltrationTick === null && squad.phase === "INFILTRATION") toInfiltrationTick = i;
    }
    assert(toCautionTick !== null, "squad never reached CAUTION");
    var toCautionS = toCautionTick * DT;
    assert(
      Math.abs(toCautionS - Game.GUARD.EVASION_S) < 1.0,
      "expected CAUTION at ~" + Game.GUARD.EVASION_S + "s, got " + toCautionS.toFixed(2) + "s"
    );

    assert(toInfiltrationTick !== null, "squad never returned to INFILTRATION");
    var toInfiltrationS = toInfiltrationTick * DT;
    var expectedInfiltrationS = Game.GUARD.EVASION_S + Game.GUARD.CAUTION_S;
    assert(
      Math.abs(toInfiltrationS - expectedInfiltrationS) < 1.0,
      "expected INFILTRATION at ~" + expectedInfiltrationS + "s, got " + toInfiltrationS.toFixed(2) + "s"
    );

    assert(g.state === "PATROL", "expected guard back in PATROL, got " + g.state);
  },
});

// 7. Re-sighting during CAUTION escalates straight to ALERT (no SUSPICIOUS
// detour) and alertCount increments.
Game.selfTests.push({
  name: "guardAI partB: re-sighting during CAUTION escalates straight to ALERT, skipping SUSPICIOUS",
  fn: function () {
    var squad = Game.createSquad();
    squad.phase = "CAUTION";
    squad.phaseTime = 0;
    squad.lastKnown = { x: 5, y: 5 };
    squad.alertCount = 1; // simulate a prior alert cycle already happened

    var g = straightGuard(5, 5, 0, "caution-resight", { squad: squad });
    var player = scriptedPlayer(7, 5); // 2m ahead, close range

    var sawSuspicious = false;
    var reachedAlert = false;
    for (var i = 0; i < 240 && !reachedAlert; i++) {
      g.update(DT, { player: player });
      if (g.state === "SUSPICIOUS") sawSuspicious = true;
      if (g.state === "ALERT") reachedAlert = true;
    }
    assert(reachedAlert, "guard never escalated to ALERT during CAUTION re-sighting");
    assert(!sawSuspicious, "guard should never pass through SUSPICIOUS while squad is CAUTION");
    assert(squad.phase === "ALERT", "expected squad.phase ALERT, got " + squad.phase);
    assert(squad.alertCount === 2, "expected alertCount to increment to 2, got " + squad.alertCount);
  },
});

// 8. CAUTION cone is wider: a target at 15.5m (inside 14*1.2=16.8, outside
// 14) fills the meter in CAUTION but not in INFILTRATION at identical geometry.
Game.selfTests.push({
  name: "guardAI partB: CAUTION widens the detection cone/range beyond the normal 14m limit",
  fn: function () {
    // y=28 is a verified-clear open-floor line across the whole zone width
    // (same row tests/guardAI.test.js's PATROL-loop test walks straight
    // across), well clear of the guard hut / crate obstacles that sit
    // between y=3 and y=26.
    var gx = 3,
      gy = 28;
    var player = scriptedPlayer(gx + 15.5, gy); // 15.5m ahead: >14, <16.8

    var squadNormal = Game.createSquad(); // stays INFILTRATION
    var gNormal = straightGuard(gx, gy, 0, "cone-normal", { squad: squadNormal });

    var squadCaution = Game.createSquad();
    squadCaution.phase = "CAUTION";
    squadCaution.phaseTime = 0;
    var gCaution = straightGuard(gx, gy, 0, "cone-caution", { squad: squadCaution });

    for (var i = 0; i < 30; i++) {
      gNormal.update(DT, { player: player });
      gCaution.update(DT, { player: player });
    }

    assert(
      gNormal.meter === 0,
      "expected meter to stay 0 at 15.5m under normal 14m range, got " + gNormal.meter
    );
    assert(
      gCaution.meter > 0,
      "expected CAUTION's widened range (16.8m) to pick up a target at 15.5m, meter was " + gCaution.meter
    );
  },
});

// 9. Determinism: identical seeds -> identical 600-tick traces with a
// 2-guard squad.
Game.selfTests.push({
  name: "guardAI partB: identical seeds/squad/scripted player produce identical 2-guard 600-tick traces",
  fn: function () {
    function scriptedPlayerAt(t) {
      return scriptedPlayer(20 + 6 * Math.cos(t * 0.5), 15 + 6 * Math.sin(t * 0.5));
    }
    function makeRun(seed) {
      var w = Game.createWorld(zone);
      var v = Game.createVision({ world: w });
      var squad = Game.createSquad();
      var gA = Game.createGuard({
        world: w,
        vision: v,
        rng: Game.createRng(seed),
        waypoints: zone.waypoints,
        id: "det-A",
        squad: squad,
      });
      var gB = Game.createGuard({
        world: w,
        vision: v,
        rng: Game.createRng(seed + 1),
        spawn: { x: 30, y: 20 },
        waypoints: [{ x: 3, y: 27 }],
        id: "det-B",
        squad: squad,
      });
      return { gA: gA, gB: gB, squad: squad };
    }

    var runA = makeRun(4242);
    var runB = makeRun(4242);
    var TICKS = 600;
    for (var i = 0; i < TICKS; i++) {
      var t = i / 60;
      var player = scriptedPlayerAt(t);
      tickAll([runA.gA, runA.gB], runA.squad, player, DT);
      tickAll([runB.gA, runB.gB], runB.squad, player, DT);

      assert(
        runA.gA.x === runB.gA.x &&
          runA.gA.y === runB.gA.y &&
          runA.gA.state === runB.gA.state &&
          runA.gB.x === runB.gB.x &&
          runA.gB.y === runB.gB.y &&
          runA.gB.state === runB.gB.state &&
          runA.squad.phase === runB.squad.phase,
        "trace diverged at tick " + i
      );
    }
  },
});
