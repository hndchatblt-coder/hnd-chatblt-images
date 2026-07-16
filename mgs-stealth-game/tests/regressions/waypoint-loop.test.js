// tests/regressions/waypoint-loop.test.js — regression test for cycle 5: guard
// walks the real loadingDock waypoint loop without wedging.
// Tests that all consecutive waypoint legs are traversable by a real guard
// under live patrol simulation.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function dist(x1, y1, x2, y2) {
  var dx = x2 - x1;
  var dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

Game.selfTests.push({
  name: "regression(cycle5): guard walks the real loadingDock waypoint loop without wedging",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(555);
    var DT = 1 / 60;

    var wp0 = zone.waypoints[0];
    var guard = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: wp0.x, y: wp0.y },
      waypoints: zone.waypoints,
      id: "reg5",
    });

    var player = { x: -1000, y: -1000, visionProfile: function () { return 1; } };

    // Track which waypoints have been visited (within ARRIVE_DIST).
    var visited = zone.waypoints.map(function () {
      return false;
    });

    // Run for 180s of game time (10800 ticks @ 60Hz).
    var TICKS = 10800;
    for (var i = 0; i < TICKS; i++) {
      guard.update(DT, { player: player });

      // Check state remains PATROL throughout.
      assert(
        guard.state === "PATROL",
        "guard entered state " + guard.state + " at tick " + i + " (expected PATROL)"
      );

      // Track waypoint visits.
      for (var w = 0; w < zone.waypoints.length; w++) {
        var wp = zone.waypoints[w];
        if (dist(guard.x, guard.y, wp.x, wp.y) <= Game.GUARD.ARRIVE_DIST) {
          visited[w] = true;
        }
      }
    }

    // Verify all waypoints were visited.
    for (var w = 0; w < visited.length; w++) {
      assert(
        visited[w],
        "waypoint " + w + " (" + zone.waypoints[w].x + "," + zone.waypoints[w].y + ") was never visited in 180s"
      );
    }
  },
});
