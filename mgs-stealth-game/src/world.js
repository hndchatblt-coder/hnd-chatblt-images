// src/world.js
// PUBLIC API:
//   Game.ZONES.loadingDock — first facility zone, plain-object level data:
//     {
//       id, name,
//       bounds: { w, h },                 // meters, origin top-left, +x right, +y down
//       walls: [ { x, y, w, h }, ... ],    // AABBs: perimeter + interior obstacles
//       playerSpawn: { x, y },
//       exit: { x, y, w, h },              // trigger AABB leading to the next zone
//       waypoints: [ { x, y }, ... ],       // patrol loop, open floor
//       darkZones: [ { x, y, w, h }, ... ], // shadowed regions (vision uses these)
//     }
//   Game.createWorld(zoneData) -> {
//     isBlocked(x, y): boolean,
//       // true iff (x,y) lies inside (or exactly on the edge of) any wall AABB.
//       // Containment is CLOSED on all four sides: wx <= x <= wx+w && wy <= y <= wy+h.
//     isBlockedCircle(x, y, r): boolean,
//       // true iff a circle of radius r centered at (x,y) overlaps (or exactly
//       // touches) any wall AABB (closed containment, same convention as above).
//     raycast(x1, y1, x2, y2): { x, y, dist } | null,
//       // exact segment-vs-AABB (slab method) test against every wall; returns
//       // the FIRST intersection point (smallest t along the segment, t in
//       // [0,1]) and its distance from (x1,y1), or null if the segment is clear.
//     moveCircle(x, y, dx, dy, r): { x, y },
//       // attempts to move a circle of radius r by (dx, dy); resolves per axis
//       // (x first, then y) — a blocked axis is simply not applied, so a circle
//       // sliding along a wall still makes progress on its free axis and a
//       // circle driven into a corner stops cleanly on both. Never returns a
//       // position where isBlockedCircle(result.x, result.y, r) is true,
//       // provided the input position was itself not overlapping a wall.
//     inRegion(x, y, region): boolean,
//       // point-in-{x,y,w,h} test (closed containment), used for exit/darkZone
//       // checks.
//     zone: the zoneData object this world was created from.
//   }
// Pure data + geometry. No THREE, no DOM, no browser APIs — runs headless in
// node (vision cones, radar, and guardAI pathing all build on this module).
(function (Game) {
  // ---- local math helpers (no dependency on other modules) ----------------

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function rectContainsPoint(rect, x, y) {
    return (
      x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
    );
  }

  function circleOverlapsRect(cx, cy, r, rect) {
    var nearestX = clamp(cx, rect.x, rect.x + rect.w);
    var nearestY = clamp(cy, rect.y, rect.y + rect.h);
    var dx = cx - nearestX;
    var dy = cy - nearestY;
    return dx * dx + dy * dy <= r * r;
  }

  // Exact segment-vs-AABB intersection via the slab method. Returns the
  // smallest t in [0,1] at which the segment (x1,y1)->(x2,y2) enters `rect`,
  // or null if it never does. t is clamped to 0 if the segment starts inside
  // the box (so "first hit" degenerates to the start point rather than a
  // negative t).
  function segmentVsRect(x1, y1, x2, y2, rect) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var tmin = 0;
    var tmax = 1;

    if (dx === 0) {
      if (x1 < rect.x || x1 > rect.x + rect.w) return null;
    } else {
      var tx1 = (rect.x - x1) / dx;
      var tx2 = (rect.x + rect.w - x1) / dx;
      if (tx1 > tx2) {
        var tmp = tx1;
        tx1 = tx2;
        tx2 = tmp;
      }
      if (tx1 > tmin) tmin = tx1;
      if (tx2 < tmax) tmax = tx2;
      if (tmin > tmax) return null;
    }

    if (dy === 0) {
      if (y1 < rect.y || y1 > rect.y + rect.h) return null;
    } else {
      var ty1 = (rect.y - y1) / dy;
      var ty2 = (rect.y + rect.h - y1) / dy;
      if (ty1 > ty2) {
        var tmp2 = ty1;
        ty1 = ty2;
        ty2 = tmp2;
      }
      if (ty1 > tmin) tmin = ty1;
      if (ty2 < tmax) tmax = ty2;
      if (tmin > tmax) return null;
    }

    if (tmax < 0 || tmin > 1) return null;
    return Math.max(tmin, 0);
  }

  // ---- world factory --------------------------------------------------------

  function createWorld(zoneData) {
    var walls = zoneData.walls;

    function isBlocked(x, y) {
      for (var i = 0; i < walls.length; i++) {
        if (rectContainsPoint(walls[i], x, y)) return true;
      }
      return false;
    }

    function isBlockedCircle(x, y, r) {
      for (var i = 0; i < walls.length; i++) {
        if (circleOverlapsRect(x, y, r, walls[i])) return true;
      }
      return false;
    }

    function raycast(x1, y1, x2, y2) {
      var bestT = null;
      for (var i = 0; i < walls.length; i++) {
        var t = segmentVsRect(x1, y1, x2, y2, walls[i]);
        if (t !== null && (bestT === null || t < bestT)) bestT = t;
      }
      if (bestT === null) return null;
      var hx = x1 + (x2 - x1) * bestT;
      var hy = y1 + (y2 - y1) * bestT;
      var fullDx = x2 - x1;
      var fullDy = y2 - y1;
      var fullLen = Math.sqrt(fullDx * fullDx + fullDy * fullDy);
      return { x: hx, y: hy, dist: bestT * fullLen };
    }

    function moveCircle(x, y, dx, dy, r) {
      var nx = x + dx;
      if (!isBlockedCircle(nx, y, r)) x = nx;
      var ny = y + dy;
      if (!isBlockedCircle(x, ny, r)) y = ny;
      return { x: x, y: y };
    }

    function inRegion(x, y, region) {
      return rectContainsPoint(region, x, y);
    }

    return {
      isBlocked: isBlocked,
      isBlockedCircle: isBlockedCircle,
      raycast: raycast,
      moveCircle: moveCircle,
      inRegion: inRegion,
      zone: zoneData,
    };
  }

  // ---- zone data: LOADING DOCK ----------------------------------------------
  // 40x30m. Perimeter is 4 conceptual walls (top/bottom/left/right, thickness 1);
  // the top wall is split into two AABBs (walls[0], walls[1]) to leave a 4m gap
  // at x:18-22 — the exit into the Warehouse — so the array holds 5 perimeter
  // segments (walls[0..4]) followed by 8 interior obstacles (walls[5..12]).
  //
  // Layout: a center crate stack sits directly between playerSpawn and the exit,
  // so the straight shot north is blocked and the player must route around it.
  // Two shipping containers flank the center, each leaving a corridor to the
  // outer walls (left flank / right flank) plus 4m gaps on either side of the
  // center stack (center weave) — three plausible routes north. A guard hut in
  // the NW gives a patrolling guard somewhere to be; small crate clusters in the
  // south give the player near-spawn cover.
  var loadingDock = {
    id: "loadingDock",
    name: "LOADING DOCK",
    bounds: { w: 40, h: 30 },
    walls: [
      // perimeter (5 segments: top split around the exit gap, bottom, left, right)
      { x: 0, y: 0, w: 18, h: 1 }, // top-left
      { x: 22, y: 0, w: 18, h: 1 }, // top-right (gap: x 18-22)
      { x: 0, y: 29, w: 40, h: 1 }, // bottom
      { x: 0, y: 0, w: 1, h: 30 }, // left
      { x: 39, y: 0, w: 1, h: 30 }, // right
      // interior obstacles (8)
      { x: 8, y: 9, w: 6, h: 11 }, // shipping container, west
      { x: 26, y: 9, w: 6, h: 11 }, // shipping container, east
      { x: 17, y: 13, w: 6, h: 5 }, // center crate stack (blocks the direct line)
      { x: 9, y: 3, w: 6, h: 5 }, // guard hut, NW
      { x: 4, y: 21, w: 3, h: 3 }, // small crates, SW
      { x: 33, y: 21, w: 3, h: 3 }, // small crates, SE
      { x: 12, y: 23, w: 3, h: 3 }, // small crates, S center-left
      { x: 25, y: 23, w: 3, h: 3 }, // small crates, S center-right
    ],
    playerSpawn: { x: 20, y: 27 },
    exit: { x: 18, y: 0, w: 4, h: 3 },
    waypoints: [
      { x: 4, y: 5 }, // NW corner
      { x: 36, y: 5 }, // NE corner
      { x: 35, y: 26 }, // SE corner
      { x: 5, y: 26 }, // SW corner
    ],
    darkZones: [
      { x: 2, y: 9, w: 5, h: 11 }, // shadow west of the container, along the left flank
      { x: 23, y: 13, w: 3, h: 5 }, // shadow between the crate stack and the east container
    ],
  };

  Game.createWorld = createWorld;
  Game.ZONES = { loadingDock: loadingDock };
  if (typeof module !== "undefined")
    module.exports = { createWorld: createWorld, ZONES: Game.ZONES };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
