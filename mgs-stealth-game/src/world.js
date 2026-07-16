// src/world.js
// PUBLIC API:
//   Game.ZONES.loadingDock / Game.ZONES.warehouse — facility zones, plain-object
//   level data (SCHEMA — both zones conform to this shape; fields added this
//   cycle are marked NEW):
//     {
//       id, name,
//       bounds: { w, h },                 // meters, origin top-left, +x right, +y down
//       walls: [ { x, y, w, h }, ... ],    // AABBs: perimeter + interior obstacles
//       playerSpawn: { x, y },             // default spawn if this zone is booted directly
//       exit: { x, y, w, h },              // BACK-COMPAT ALIAS: always === exits[0].
//                                          // hud/radar/render/existing scenarios read
//                                          // zone.exit directly — kept working verbatim.
//       exits: [ { x, y, w, h, to, entranceKey }, ... ], // NEW — replaces the old
//                                          // single `exit` prop as the source of truth.
//                                          // `to` is a Game.ZONES key (or a not-yet-built
//                                          // zone id, e.g. "laboratory" — a deliberate stub;
//                                          // engine.js handles an unresolvable `to` by
//                                          // staying put + emitting `zoneBlocked`, never by
//                                          // throwing). `entranceKey` indexes the TARGET
//                                          // zone's `entrances` map (below) to find where the
//                                          // player appears after crossing.
//       entrances: { [fromZoneId]: { x, y }, ... }, // NEW — spawn points keyed by the
//                                          // zone the player is arriving FROM, e.g.
//                                          // warehouse.entrances.fromLoadingDock. Looked up
//                                          // via the crossed exit's `entranceKey`, not the
//                                          // literal source zone id, so a zone can expose
//                                          // more than one path in from the same neighbor.
//       waypoints: [ { x, y }, ... ],       // patrol loop #1, open floor
//       waypoints2: [ { x, y }, ... ],       // NEW — patrol loop #2 (a second guard's
//                                          // route, e.g. a cross-aisle sweep); OPTIONAL —
//                                          // only zones with a second patrolling guard
//                                          // define it (see warehouse below). Same shape/
//                                          // rules as `waypoints`: closed loop, every leg
//                                          // must be walkable at r=0.6 (see world.test.js).
//       darkZones: [ { x, y, w, h }, ... ], // shadowed regions (vision uses these)
//       lockers: [ { x, y, facing }, ... ], // NEW — data only this cycle (no collision/
//                                          // interaction yet; the future items cycle makes
//                                          // these functional hiding spots). `facing`
//                                          // radians, same atan2 convention as
//                                          // player.facing/guard.facing (0 = +x).
//       cameras: [ { x, y, facing, sweepDeg, sweepPeriodS, fovDeg, range }, ... ], // NEW —
//                                          // wall-mounted security cameras, consumed by
//                                          // src/director.js (see its own contract for the
//                                          // full field-by-field breakdown). OPTIONAL/empty
//                                          // on zones with no camera coverage (loadingDock
//                                          // ships zero — see below); this cycle's pilot
//                                          // installation is 2 cameras in the warehouse,
//                                          // each mounted flush against a shelving-row wall
//                                          // face, covering one of the two aisle
//                                          // intersections along the y:14-16 cross-aisle
//                                          // band that NEITHER patrolling guard's route ever
//                                          // touches (w1 sticks to the outer perimeter ring,
//                                          // w2 to the narrow x:17-22 center-aisle spine —
//                                          // see waypoints/waypoints2 below) — the exact
//                                          // "aisle intersection the guards don't watch"
//                                          // the director/render/radar cycle's brief called
//                                          // for. Each camera's range (10m) deliberately
//                                          // falls short of covering the FULL length of its
//                                          // aisle and each is confined to a narrow 50deg
//                                          // FOV panning across only 60deg total, so a
//                                          // crouched player has a real route past on the
//                                          // far side of each camera's reach (see the
//                                          // per-camera comments below for the specific
//                                          // uncovered stretch).
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
    // exits/entrances: the only path out of the Loading Dock is north into the
    // Warehouse through the perimeter gap at x:18-22. entrances.fromWarehouse
    // sits just south of that gap (y:4, one meter clear of the y:0-3 trigger
    // AABB) so a player crossing back in from the Warehouse doesn't spawn
    // standing on top of the trigger and immediately re-cross.
    exits: [{ x: 18, y: 0, w: 4, h: 3, to: "warehouse", entranceKey: "fromLoadingDock" }],
    entrances: { fromWarehouse: { x: 20, y: 4 } },
    waypoints: [
      { x: 3, y: 2 }, // NW corner (above all obstacles for clear north leg)
      { x: 37, y: 2 }, // NE corner
      { x: 37, y: 27 }, // SE corner (south of crate clusters, north of perimeter)
      { x: 3, y: 27 }, // SW corner
    ],
    darkZones: [
      { x: 2, y: 9, w: 5, h: 11 }, // shadow west of the container, along the left flank
      { x: 23, y: 13, w: 3, h: 5 }, // shadow between the crate stack and the east container
    ],
    // Data only this cycle (see schema note above) — placed in the west dark
    // zone, plausible near-term hiding spots for the future items cycle.
    lockers: [
      { x: 2, y: 9, facing: 0 },
      { x: 2, y: 20, facing: 0 },
    ],
    // No camera coverage this cycle (see schema note above) — the pilot
    // installation lives in the warehouse; the loading dock stays
    // guard-only until a future cycle expands coverage.
    cameras: [],
  };
  loadingDock.exit = loadingDock.exits[0]; // back-compat alias, see schema note above

  // ---- zone data: WAREHOUSE --------------------------------------------------
  // 40x30m, industrial interior. Perimeter is the same 4-conceptual-wall
  // pattern as the Loading Dock, but BOTH the top and bottom walls are split
  // around a 4m gap at x:18-22: south leads back to the Loading Dock, north is
  // a stub toward the (not yet built) Laboratory zone — engine.js resolves
  // unknown `to` targets by staying put and emitting `zoneBlocked` rather than
  // throwing, so this stub is safe to ship ahead of the zone it points to.
  // That shared x:18-22 column is kept deliberately free of shelving, so it
  // reads as the main north-south spine connecting both exits; three shelving
  // rows (six long thin AABBs, each split top/bottom around a shared y:14-16
  // gap so the aisles are still crossable) sit on either side of that spine,
  // forming four aisles west-to-east: the far-west aisle (x:1-8), between rows
  // 1/2 (x:9.5-14), the wide center aisle (x:15.5-28, containing the spine),
  // and the far-east aisle (x:29.5-39). Crate clusters give cover/patrol
  // targets inside the aisles; two dark zones sit at aisle ends (unlit
  // shelving corners), well clear of every wall.
  var warehouse = {
    id: "warehouse",
    name: "WAREHOUSE",
    bounds: { w: 40, h: 30 },
    walls: [
      // perimeter (6 segments: top split around the north stub, bottom split
      // around the south exit, left, right)
      { x: 0, y: 0, w: 18, h: 1 }, // top-left
      { x: 22, y: 0, w: 18, h: 1 }, // top-right (gap: x 18-22, stub to laboratory)
      { x: 0, y: 29, w: 18, h: 1 }, // bottom-left
      { x: 22, y: 29, w: 18, h: 1 }, // bottom-right (gap: x 18-22, exit to loadingDock)
      { x: 0, y: 0, w: 1, h: 30 }, // left
      { x: 39, y: 0, w: 1, h: 30 }, // right
      // shelving row 1 (x 8-9.5), split around the y:14-16 cross-aisle gap
      { x: 8, y: 4, w: 1.5, h: 10 },
      { x: 8, y: 16, w: 1.5, h: 10 },
      // shelving row 2 (x 14-15.5), same gap
      { x: 14, y: 4, w: 1.5, h: 10 },
      { x: 14, y: 16, w: 1.5, h: 10 },
      // shelving row 3 (x 28-29.5), same gap
      { x: 28, y: 4, w: 1.5, h: 10 },
      { x: 28, y: 16, w: 1.5, h: 10 },
      // crate clusters, one per aisle
      { x: 4, y: 10, w: 2, h: 2 }, // far-west aisle, north
      { x: 11, y: 20, w: 2, h: 2 }, // row1/row2 aisle, south
      { x: 24, y: 9, w: 2, h: 2 }, // center aisle, north (east side, clear of the spine)
      { x: 33, y: 19, w: 2, h: 2 }, // far-east aisle, south
    ],
    // Booting directly into the Warehouse (e.g. a headless test with no
    // transition) spawns at the same spot a player arrives at via the south
    // exit from the Loading Dock.
    playerSpawn: { x: 20, y: 25 },
    exits: [
      // South: back to the Loading Dock. Trigger sits against the bottom
      // perimeter gap (y:26-29); entrances.fromLoadingDock (below) is 1m
      // clear north of it so arriving players don't stand on the trigger.
      { x: 18, y: 26, w: 4, h: 3, to: "loadingDock", entranceKey: "fromWarehouse" },
      // North: stub toward the Laboratory. Not yet a real zone — see file
      // header note above. entranceKey names the entry the Laboratory would
      // expose for arrivals FROM the Warehouse, once it exists.
      { x: 18, y: 0, w: 4, h: 3, to: "laboratory", entranceKey: "fromWarehouse" },
    ],
    entrances: { fromLoadingDock: { x: 20, y: 25 } },
    // Primary loop: the same clear perimeter-corridor shape as loadingDock's
    // waypoints (y~2 north / y~27 south bands sit above/below every shelving
    // row, and x~3 / x~37 columns run clear down each flank) — guard w1 walks
    // the outer ring.
    waypoints: [
      { x: 3, y: 2 },
      { x: 37, y: 2 },
      { x: 37, y: 27 },
      { x: 3, y: 27 },
    ],
    // Second loop: guard w2's cross-aisle sweep, a rectangle confined to the
    // wide center aisle (x:15.5-28) — clear of every shelving row and both
    // crate clusters that flank it, giving a patrol that reads as genuinely
    // different ground from the perimeter loop above.
    waypoints2: [
      { x: 17, y: 5 },
      { x: 22, y: 5 },
      { x: 22, y: 25 },
      { x: 17, y: 25 },
    ],
    darkZones: [
      { x: 2, y: 4, w: 4, h: 8 }, // far-west aisle, unlit north corner
      { x: 31, y: 20, w: 6, h: 6 }, // far-east aisle, unlit south corner
    ],
    // Data only this cycle (see schema note above) — tucked along shelving
    // ends and aisle margins, clear of every wall/crate.
    lockers: [
      { x: 2, y: 6, facing: 0 },
      { x: 11, y: 6, facing: Math.PI },
      { x: 30, y: 22, facing: 0 },
      { x: 37, y: 22, facing: Math.PI },
      { x: 2, y: 24, facing: 0 },
    ],
    // PILOT CAMERA INSTALLATION (see schema note above) — 2 cameras, both
    // wall-mounted flush against a shelving-row face (0.1m clearance so they
    // sit on open floor, not inside the wall AABB — isBlocked/isBlockedCircle
    // treat wall containment as closed, so exactly-on-the-face would itself
    // register as blocked), both aimed across the y:14-16 cross-aisle band
    // that runs the FULL width of the map (every shelving row leaves the
    // same 2m gap there) and that neither w1 (outer perimeter ring, y~2/
    // y~27/x~3/x~37) nor w2 (confined to the narrow x:17-22 center-aisle
    // spine) ever watches, outside w2's own narrow slice of it.
    cameras: [
      // Camera 0 — mounted on shelving row 2's west face (that block spans
      // x:14-15.5), facing WEST (PI) into the row1/row2 aisle (x:9.5-14),
      // watching the row1/row2 <-> cross-aisle intersection. Range (10m)
      // reaches the near/mid aisle but falls ~3m short of the aisle's south
      // end (y~26) and the crate cluster there — a crouched player hugging
      // the south stretch of that aisle passes outside this camera's reach
      // entirely.
      { x: 13.9, y: 13.5, facing: Math.PI, sweepDeg: 60, sweepPeriodS: 6, fovDeg: 50, range: 10 },
      // Camera 1 — mounted on shelving row 3's east face (that block spans
      // x:28-29.5), facing EAST (0) into the far-east aisle (x:29.5-39),
      // watching the row3 <-> cross-aisle intersection. Sits right beside
      // the far-east darkZone (x:31-37, y:20-26, see darkZones above): a
      // crouched player who ducks south into that shadow is both outside
      // this camera's narrow 60deg total swing (it only pans east-ish) and
      // gets vision.js's DARKNESS_MULT halving on top — a genuine route past
      // it, not just a nominal one.
      { x: 29.6, y: 13.5, facing: 0, sweepDeg: 60, sweepPeriodS: 6, fovDeg: 50, range: 10 },
    ],
  };
  warehouse.exit = warehouse.exits[0]; // back-compat alias, see schema note above

  Game.createWorld = createWorld;
  Game.ZONES = { loadingDock: loadingDock, warehouse: warehouse };
  if (typeof module !== "undefined")
    module.exports = { createWorld: createWorld, ZONES: Game.ZONES };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
