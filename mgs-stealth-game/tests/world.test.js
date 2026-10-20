// tests/world.test.js — headless assertions for src/world.js.
// Same registry pattern as src/tests.js: push onto the shared Game.selfTests
// list; test.js runs every entry and reports ok/FAIL with real exit codes.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var zone = Game.ZONES.loadingDock;
var world = Game.createWorld(zone);

// 1. isBlocked true inside a perimeter wall, false at playerSpawn.
Game.selfTests.push({
  name: "world: isBlocked true in perimeter wall, false at playerSpawn",
  fn: function () {
    assert(world.isBlocked(0.5, 15), "expected left perimeter wall to block (0.5, 15)");
    assert(
      !world.isBlocked(zone.playerSpawn.x, zone.playerSpawn.y),
      "playerSpawn should be open floor"
    );
  },
});

// 2. isBlockedCircle detects overlap when the point is clear but the circle
// clips a wall.
Game.selfTests.push({
  name: "world: isBlockedCircle catches circle clipping a wall the point misses",
  fn: function () {
    // (7.7, 14) is just west of the west container (x:8-14, y:9-20): the point
    // itself is open floor, but a radius-0.5 circle there overlaps the wall.
    assert(!world.isBlocked(7.7, 14), "point should be clear of the container");
    assert(
      world.isBlockedCircle(7.7, 14, 0.5),
      "circle of radius 0.5 at (7.7,14) should clip the west container"
    );
  },
});

// 3. raycast across the zone hits a wall and returns a sensible hit point.
Game.selfTests.push({
  name: "world: raycast hits the west container and reports a sane hit point",
  fn: function () {
    var hit = world.raycast(2, 14, 38, 14);
    assert(hit !== null, "expected a hit against the west container");
    assert(hit.dist > 0, "hit distance should be positive: " + hit.dist);
    assert(
      hit.x >= 2 && hit.x <= 38 && hit.y >= 14 - 1e-6 && hit.y <= 14 + 1e-6,
      "hit point should lie on the segment: " + JSON.stringify(hit)
    );
    // The west container starts at x:8 — that should be the first thing hit.
    assert(Math.abs(hit.x - 8) < 1e-6, "expected first hit at x=8, got " + hit.x);
  },
});

// 4. raycast between two nearby open-floor points returns null.
Game.selfTests.push({
  name: "world: raycast between nearby open-floor points is clear",
  fn: function () {
    var hit = world.raycast(4, 5, 4, 8);
    assert(hit === null, "expected a clear line of sight, got " + JSON.stringify(hit));
  },
});

// 5. raycast from playerSpawn center to exit center is NOT null (layout
// forces routing decisions).
Game.selfTests.push({
  name: "world: playerSpawn to exit has no straight unobstructed line",
  fn: function () {
    var sx = zone.playerSpawn.x;
    var sy = zone.playerSpawn.y;
    var ex = zone.exit.x + zone.exit.w / 2;
    var ey = zone.exit.y + zone.exit.h / 2;
    var hit = world.raycast(sx, sy, ex, ey);
    assert(hit !== null, "expected the center crate stack to block the direct line");
  },
});

// 6. moveCircle into a wall stops/slides: final position never overlaps a wall.
Game.selfTests.push({
  name: "world: moveCircle into a wall stops without overlapping it",
  fn: function () {
    // Open corridor just west of the west container; drive straight into it.
    var start = { x: 6, y: 14 };
    assert(!world.isBlockedCircle(start.x, start.y, 0.5), "start position should be open");
    var res = world.moveCircle(start.x, start.y, 5, 0, 0.5);
    assert(
      !world.isBlockedCircle(res.x, res.y, 0.5),
      "final position should never overlap a wall: " + JSON.stringify(res)
    );
    assert(res.x < 11, "movement into the wall should have been rejected, got x=" + res.x);
  },
});

// 7. moveCircle sliding: moving diagonally into a wall face still makes
// progress along the unblocked axis.
Game.selfTests.push({
  name: "world: moveCircle slides along the free axis when the other is blocked",
  fn: function () {
    var start = { x: 6, y: 14 };
    var res = world.moveCircle(start.x, start.y, 5, 3, 0.5);
    assert(!world.isBlockedCircle(res.x, res.y, 0.5), "final position should be clear");
    assert(res.x === start.x, "x axis (blocked by the container) should not have moved");
    assert(res.y === start.y + 3, "y axis (unblocked) should still have made progress");
  },
});

// 8. Zone data sanity.
Game.selfTests.push({
  name: "world: loadingDock zone data sanity (spawn/waypoints/darkZones open, wall/waypoint counts)",
  fn: function () {
    assert(!world.isBlocked(zone.playerSpawn.x, zone.playerSpawn.y), "playerSpawn must be open");

    assert(zone.waypoints.length >= 4, "expected at least 4 waypoints, got " + zone.waypoints.length);
    zone.waypoints.forEach(function (wp, i) {
      assert(!world.isBlocked(wp.x, wp.y), "waypoint " + i + " should be open floor: " + JSON.stringify(wp));
    });

    assert(zone.darkZones.length >= 1, "expected at least 1 dark zone");
    zone.darkZones.forEach(function (dz, i) {
      var cx = dz.x + dz.w / 2;
      var cy = dz.y + dz.h / 2;
      assert(!world.isBlocked(cx, cy), "darkZone " + i + " center should be open floor: " + JSON.stringify(dz));
    });

    // 5 perimeter segments (top split in two around the exit gap) + interior
    // obstacles; require at least 6 interior walls beyond those 5.
    var PERIMETER_SEGMENTS = 5;
    var interior = zone.walls.length - PERIMETER_SEGMENTS;
    assert(interior >= 6, "expected at least 6 interior walls, got " + interior);
  },
});

// 9. Every consecutive waypoint leg is walkably clear (r=0.6 sampled, raycast also clear).
Game.selfTests.push({
  name: "world: every consecutive waypoint leg is walkably clear (r=0.6 sampled)",
  fn: function () {
    var waypoints = zone.waypoints;
    assert(waypoints.length >= 4, "expected at least 4 waypoints for patrol loop");

    for (var i = 0; i < waypoints.length; i++) {
      var a = waypoints[i];
      var b = waypoints[(i + 1) % waypoints.length];
      var legLabel = "leg " + i + " (" + i + "->" + ((i + 1) % waypoints.length) + ")";

      // Sample every 0.25m along the segment and verify no collision.
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var legLen = Math.sqrt(dx * dx + dy * dy);
      var samples = Math.ceil(legLen / 0.25);

      for (var s = 0; s <= samples; s++) {
        var t = samples > 0 ? s / samples : 0;
        var px = a.x + dx * t;
        var py = a.y + dy * t;
        assert(
          !world.isBlockedCircle(px, py, 0.6),
          legLabel + " blocked at sample (" + px.toFixed(2) + "," + py.toFixed(2) + ")"
        );
      }

      // Also verify raycast is clear.
      var hit = world.raycast(a.x, a.y, b.x, b.y);
      assert(
        hit === null,
        legLabel + " raycast hit at (" + (hit ? hit.x.toFixed(2) : "?") + "," + (hit ? hit.y.toFixed(2) : "?") + ")"
      );
    }
  },
});
