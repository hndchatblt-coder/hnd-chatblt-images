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
//       waypoints3/waypoints4: [ { x, y }, ... ], // NEW (Comms Tower cycle) — patrol loops
//                                          // #3/#4, same shape/rules as waypoints/
//                                          // waypoints2 above, for a THIRD/FOURTH
//                                          // simultaneous guard. OPTIONAL — only
//                                          // commsTower this cycle needs 4 guards (see
//                                          // its own PATROL INTERLOCK comment below /
//                                          // src/engine.js's ZONE_GUARDS.commsTower).
//                                          // tests/zones.test.js's own generalized
//                                          // loop-clearance test only ever iterates
//                                          // `waypoints`/`waypoints2` (a fixed pair, not
//                                          // a `waypoints*` wildcard scan) — a zone
//                                          // using waypoints3/4 must cover them in its
//                                          // OWN test file (see tests/commsTower.test.js).
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
//       pickups: [ { x, y, item }, ... ], // NEW (Laboratory cycle) — SCHEMA FOR
//                                          // ALL ZONES (optional/empty where a zone has
//                                          // nothing to pick up, e.g. loadingDock). `item`
//                                          // is an opaque string src/items.js's
//                                          // inv.collectPickup(item) understands
//                                          // ("keycardL1"/"keycardL2"/"keycardL3"/"chaff"
//                                          // this cycle). Collection (distance check,
//                                          // event, "already collected" bookkeeping) is
//                                          // engine.js's job (see its PICKUPS step) — this
//                                          // is pure placement data, same "engine mutates,
//                                          // module computes" split as every other item
//                                          // verb in this codebase.
//       doors: [ { x, y, w, h, lock, id }, ... ], // NEW (Laboratory cycle) — SCHEMA FOR
//                                          // ALL ZONES (optional/empty on zones with no
//                                          // doors, e.g. loadingDock/warehouse this cycle).
//                                          // `lock` is "L1" | "L2" | "L3" | null (null =
//                                          // unlocked, auto-opens on mere proximity — see
//                                          // src/engine.js's DOORS step). `id` is an opaque
//                                          // string, unique within the zone, used by
//                                          // world.setDoorOpen(id, open)/isDoorOpen(id) and
//                                          // by engine.js's per-door auto-open/close
//                                          // bookkeeping. A door AABB is otherwise a plain
//                                          // wall-shaped rect — see DYNAMIC BLOCKERS below
//                                          // for exactly how it behaves as one while closed.
//       lasers: [ { x1, y1, x2, y2, periodS, dutyOn }, ... ], // NEW (Laboratory cycle) —
//                                          // SCHEMA FOR ALL ZONES (optional/empty on zones
//                                          // with none). A laser is a TRIPWIRE, not a
//                                          // collision blocker — world.js does not consult
//                                          // this array at all (isBlocked/raycast/moveCircle
//                                          // are unaware lasers exist). It is consumed
//                                          // entirely by src/director.js (see its own
//                                          // contract for the duty-cycle/crossing-test
//                                          // write-up) via engine.js's LASERS step.
//       guardDoor: { x, y },              // NEW (reinforcements/check-ins cycle) — SCHEMA
//                                          // FOR ALL ZONES this cycle ships (one per zone,
//                                          // never optional/absent for any Game.ZONES.*
//                                          // entry). The single perimeter spawn point
//                                          // src/director.js's tickEscalation spawns
//                                          // ALERT reinforcements at (see its own
//                                          // ESCALATION contract) — DATA ONLY here, no
//                                          // collision/behavior of its own, same posture as
//                                          // lockers/cameras above. Placed at a real
//                                          // perimeter door/gap in open floor (this cycle:
//                                          // each zone's own south entrance gap, or
//                                          // loadingDock's one and only exit gap), verified
//                                          // open at r=0.6 (world.isBlockedCircle) same as
//                                          // every waypoint leg — director.js derives a
//                                          // short reinforcement patrol loop from this single
//                                          // point at runtime, so no separate waypoints* data
//                                          // is needed here.
//     }
//
//   DOORS / DYNAMIC BLOCKERS (NEW this cycle — Laboratory zone): a door behaves
//   EXACTLY like a wall AABB — same closed-containment convention as every
//   other isBlocked/isBlockedCircle/raycast check in this file — for as long
//   as it is CLOSED. World now keeps a per-instance, per-door open/closed flag
//   (world.setDoorOpen(id, open) / world.isDoorOpen(id)), defaulting every
//   door to CLOSED at construction (a fresh Game.createWorld(zoneData) call —
//   e.g. on a zone transition — always starts every door shut, v1 semantics,
//   same "discard on transition" rule guards/squad/vision already follow).
//   isBlocked/isBlockedCircle/raycast/moveCircle all consult a DYNAMIC
//   BLOCKERS list — zone.walls plus whichever zone.doors are CURRENTLY
//   CLOSED, recomputed fresh on every call (doors are few — at most a
//   handful per zone — so this is cheap; no caching complexity for a v1
//   feature) — rather than the static `walls` array alone. Once a door is
//   OPEN (world.setDoorOpen(id, true)), it drops out of every one of those
//   checks entirely — a player/guard walks through the gap exactly as if the
//   AABB were never there. engine.js owns WHEN a door opens/closes (keycard
//   proximity, unlocked-on-proximity, auto-close timer — see its own DOORS
//   contract); world.js only owns the mechanical "is this rect currently a
//   blocker" question.
//
//   CLOSED DOORS NOW ATTENUATE SOUND (fixed this cycle — was an HONEST GAP):
//   src/soundEvents.js's wallsBetween/effectiveRadius still iterate
//   `world.zone.walls` directly (see its own file header's IMPLEMENTATION
//   NOTE for why it can't reuse world.raycast in a marching loop), but they
//   now ALSO count every currently-CLOSED door as a crossing, via
//   world.closedDoorRects() below — a live view of the dynamic blockers list
//   above, doors only (walls are static and already covered by zone.walls).
//   soundEvents.js calls it fresh on every wallsBetween/emit (doors change
//   state; a cached snapshot would go stale the instant a door opens), so a
//   knock/gunshot/footstep on one side of a closed door attenuates exactly
//   like it would through an ordinary wall (50% per WALL_ATTENUATION), while
//   an OPEN door contributes nothing — same "drops out entirely" rule the
//   movement/LOS blockers list already followed. See src/soundEvents.js's own
//   contract for the consuming half of this fix.
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
//     setDoorOpen(id, open) / isDoorOpen(id): mutate/read a door's open flag
//       (see DOORS / DYNAMIC BLOCKERS above).
//     closedDoorRects(): { x, y, w, h }[],
//       // NEW (soundEvents door-acoustics fix) — every currently-CLOSED door
//       // as a plain AABB (id/lock stripped), recomputed fresh each call. See
//       // DOORS / DYNAMIC BLOCKERS above; consumed by src/soundEvents.js's
//       // wallsBetween so closed doors attenuate sound like walls.
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
    var doors = zoneData.doors || [];

    // Per-door open/closed flag, PRIVATE to this world instance (see file
    // header DOORS / DYNAMIC BLOCKERS note) — every door starts CLOSED.
    var doorOpen = {};
    for (var di = 0; di < doors.length; di++) doorOpen[doors[di].id] = false;

    // DYNAMIC BLOCKERS (see file header) — zone.walls plus whichever doors
    // are CURRENTLY CLOSED. Recomputed on every call; doors.length is small
    // (a handful per zone at most) so this is cheap. Skips the concat
    // entirely when a zone has no doors at all (every pre-Laboratory zone),
    // so this is a no-op cost change for loadingDock/warehouse.
    function blockers() {
      if (doors.length === 0) return walls;
      var list = walls.slice();
      for (var i = 0; i < doors.length; i++) {
        if (!doorOpen[doors[i].id]) list.push(doors[i]);
      }
      return list;
    }

    function isBlocked(x, y) {
      var list = blockers();
      for (var i = 0; i < list.length; i++) {
        if (rectContainsPoint(list[i], x, y)) return true;
      }
      return false;
    }

    function isBlockedCircle(x, y, r) {
      var list = blockers();
      for (var i = 0; i < list.length; i++) {
        if (circleOverlapsRect(x, y, r, list[i])) return true;
      }
      return false;
    }

    function raycast(x1, y1, x2, y2) {
      var list = blockers();
      var bestT = null;
      for (var i = 0; i < list.length; i++) {
        var t = segmentVsRect(x1, y1, x2, y2, list[i]);
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

    // DOORS (see file header) — world.js's own half is purely mechanical:
    // remember which door ids are open, let blockers() above see it.
    // engine.js decides WHEN to call these (keycard proximity, auto-close
    // timers, etc.) — see its own DOORS contract.
    function setDoorOpen(id, open) {
      doorOpen[id] = !!open;
    }

    function isDoorOpen(id) {
      return !!doorOpen[id];
    }

    // closedDoorRects() (NEW — soundEvents door-acoustics fix): a live view of
    // just the currently-CLOSED doors, as plain {x,y,w,h} AABBs (the `lock`/
    // `id` fields are stripped — callers outside world.js have no business
    // with door identity, only geometry). Recomputed fresh on every call, same
    // "doors are few, no caching complexity" posture as blockers() above — so
    // a caller like soundEvents.js can call this once per emit/wallsBetween
    // and always see the true current door state, never a stale snapshot.
    // Returns [] for any zone with no doors (no-op cost, same as blockers()).
    function closedDoorRects() {
      var list = [];
      for (var i = 0; i < doors.length; i++) {
        if (!doorOpen[doors[i].id]) {
          list.push({ x: doors[i].x, y: doors[i].y, w: doors[i].w, h: doors[i].h });
        }
      }
      return list;
    }

    // getState()/setState() (NEW — save/restore cycle, additive only, no
    // behavior change). This world instance's ONLY mutable state is the
    // per-door open/closed flag map (doorOpen) — everything else
    // (walls/zoneData) is immutable, already restored by rebuilding a fresh
    // world for save.zoneId. getState() shallow-copies doorOpen so a caller
    // mutating the returned snapshot can never reach back into this world's
    // own live map; setState() REPLACES the closure's doorOpen var outright
    // (safe: blockers()/setDoorOpen()/isDoorOpen() above all read/write
    // `doorOpen` by closure reference, not a captured-at-construction copy,
    // so a reassignment here is visible to every one of them immediately).
    function getState() {
      return { doorOpen: Object.assign({}, doorOpen) };
    }

    function setState(state) {
      doorOpen = Object.assign({}, state.doorOpen);
    }

    return {
      isBlocked: isBlocked,
      isBlockedCircle: isBlockedCircle,
      raycast: raycast,
      moveCircle: moveCircle,
      inRegion: inRegion,
      setDoorOpen: setDoorOpen,
      isDoorOpen: isDoorOpen,
      closedDoorRects: closedDoorRects,
      getState: getState,
      setState: setState,
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
    // No pickups, doors, or lasers this cycle (see schema notes above) —
    // those all debut in the Laboratory zone below.
    pickups: [],
    doors: [],
    lasers: [],
    // guardDoor (see schema note above) — this zone's one and only
    // perimeter gap (the north exit, x:18-22,y:0-3), 2m in from the
    // trigger onto open floor, well clear of the NW guard hut (x:9-15,
    // y:3-8) and every other obstacle.
    guardDoor: { x: 20, y: 2 },
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
    // L1 KEYCARD (see schema note above / Laboratory zone below) — the key
    // that unlocks the Laboratory's own L1 door lives out here, one zone
    // early, so a player must actually clear the Warehouse before the
    // Laboratory's west wing opens up. Tucked in the far-west dark zone
    // (x:2-6,y:4-12, see darkZones above) at (4,7) — clear of the crate
    // cluster at (4,10,2,2) and the left perimeter wall (x:0-1).
    pickups: [{ x: 4, y: 7, item: "keycardL1" }],
    doors: [],
    lasers: [],
    // guardDoor (see schema note above) — the south perimeter gap (x:18-22,
    // y:26-29, back to the Loading Dock), 2m in from the trigger onto open
    // floor, clear of both crate clusters and every shelving row.
    guardDoor: { x: 20, y: 27 },
  };
  warehouse.exit = warehouse.exits[0]; // back-compat alias, see schema note above

  // ---- zone data: LABORATORY --------------------------------------------------
  // 40x30m. Keycard-gated linear progression, north from the Warehouse:
  //   south entrance (entrances.fromWarehouse, x:18-22 gap like every other
  //   zone's shared spine column) -> LOBBY (y:17-29, the whole south third)
  //   -> L1 DOOR (a gap in the y:17 dividing wall, x:18-22) -> the shared
  //   MID FLOOR (y:4-17), itself split by a vertical wall at x:24 into a WEST
  //   WING (x:1-24, holds the L2 keycard) and an EAST WING (x:24-39, holds
  //   the L3 keycard + a bonus chaff grenade) -> L2 DOOR (a gap in that x:24
  //   wall, y:9-13) bridges the two wings -> L3 DOOR (a gap in the y:3
  //   dividing wall, x:18-22) leads to the NORTH CORRIDOR (y:0-3) -> an exit
  //   stub toward the (not yet built) Comms Tower — same "engine.js resolves
  //   an unknown `to` by staying put + zoneBlocked" convention the
  //   Warehouse's own Laboratory stub used before this cycle.
  //
  //   Doors (see file header DOORS / DYNAMIC BLOCKERS): doorL1 gates
  //   lobby->mid floor, doorL2 gates west wing->east wing, doorL3 gates mid
  //   floor->north corridor. Every guard's own patrol loop stays entirely
  //   within ONE side of every door (lab-g1 never leaves the lobby, lab-g2
  //   never leaves the west wing) — guards never need to open a door this
  //   cycle, so a locked door a guard can't unlock never strands one (see
  //   src/engine.js's DOORS contract: only the PLAYER's keycards are ever
  //   checked against a lock).
  //
  //   Cameras (3, one per major area) + lasers (2, one guarding each
  //   wing's keycard) are mounted 0.1m clear of the wall they're flush
  //   against, same convention as the Warehouse's pilot installation above.
  //
  //   GEOMETRY NOTE — Wall B deliberately sits at x:24, NOT x:20 (which would
  //   put it flush against the L1 door's own center column, x:18-22): a
  //   player/guard circle (radius 0.4) passing straight through the L1 door
  //   and continuing north at x~20 would clip Wall B's bottom segment's
  //   corner the instant Wall B's edge and Wall A's edge share the same y
  //   (both meeting at y:17) — an authentic pinch point discovered by
  //   scripting sim.js's "lab run" scenario. Wall B is shifted 4m east so the
  //   L1 door's entire approach corridor (x:18-22) is comfortably clear of
  //   any other wall face.
  var laboratory = {
    id: "laboratory",
    name: "LABORATORY",
    bounds: { w: 40, h: 30 },
    walls: [
      // perimeter (6 segments: top split around the north Comms Tower stub,
      // bottom split around the south Warehouse entrance, left, right)
      { x: 0, y: 0, w: 18, h: 1 }, // top-left
      { x: 22, y: 0, w: 18, h: 1 }, // top-right (gap: x 18-22, stub to commsTower)
      { x: 0, y: 29, w: 18, h: 1 }, // bottom-left
      { x: 22, y: 29, w: 18, h: 1 }, // bottom-right (gap: x 18-22, entrance from warehouse)
      { x: 0, y: 0, w: 1, h: 30 }, // left
      { x: 39, y: 0, w: 1, h: 30 }, // right
      // Wall A — lobby / mid-floor divider (y:17), split around the L1 door gap (x:18-22)
      { x: 0, y: 17, w: 18, h: 1 },
      { x: 22, y: 17, w: 18, h: 1 },
      // Wall C — mid-floor / north-corridor divider (y:3), split around the L3 door gap (x:18-22)
      { x: 0, y: 3, w: 18, h: 1 },
      { x: 22, y: 3, w: 18, h: 1 },
      // Wall B — west wing / east wing divider (x:24, y:3-17, see GEOMETRY
      // NOTE above), split around the L2 door gap (y:9-13)
      { x: 24, y: 3, w: 1, h: 6 },
      { x: 24, y: 13, w: 1, h: 4 },
    ],
    doors: [
      { x: 18, y: 17, w: 4, h: 1, lock: "L1", id: "doorL1" },
      { x: 24, y: 9, w: 1, h: 4, lock: "L2", id: "doorL2" },
      { x: 18, y: 3, w: 4, h: 1, lock: "L3", id: "doorL3" },
    ],
    playerSpawn: { x: 20, y: 26 },
    // The only exit this cycle: the Comms Tower stub, north through the
    // L3 door. Unresolvable `to` — engine.js stays put + emits zoneBlocked
    // (see src/engine.js's ZONE TRANSITIONS contract), same documented-stub
    // pattern the Warehouse's own Laboratory exit used before this cycle.
    exits: [{ x: 18, y: 0, w: 4, h: 3, to: "commsTower", entranceKey: "fromLaboratory" }],
    entrances: { fromWarehouse: { x: 20, y: 26 } },
    // Guard 1 (lab-g1): lobby perimeter loop, well clear of the L1 door and
    // every locker/dark zone (none of those are collision — see world.js
    // schema notes — so proximity to them is cosmetic only).
    waypoints: [
      { x: 5, y: 21 },
      { x: 35, y: 21 },
      { x: 35, y: 27 },
      { x: 5, y: 27 },
    ],
    // Guard 2 (lab-g2): west wing loop, entirely on the near side of the L2
    // door — never needs to open it (see file header note above).
    waypoints2: [
      { x: 3, y: 5 },
      { x: 17, y: 5 },
      { x: 17, y: 15 },
      { x: 3, y: 15 },
    ],
    darkZones: [
      { x: 2, y: 20, w: 5, h: 6 }, // lobby, SW corner
      { x: 1, y: 4, w: 4, h: 4 }, // west wing, NW corner
      { x: 34, y: 4, w: 5, h: 4 }, // east wing, NE corner (tucks the L3 keycard in shadow)
    ],
    lockers: [
      { x: 5, y: 24, facing: 0 },
      { x: 34, y: 24, facing: Math.PI },
      { x: 3, y: 15, facing: 0 },
      { x: 36, y: 15, facing: Math.PI },
    ],
    // 3 cameras, one per major area (lobby + both wings), each mounted
    // 0.1m clear of the wall face it's flush against (see file header note).
    cameras: [
      // Lobby — mounted on wall A's south face, facing south (PI/2) into
      // the lobby's main north-south crossing just past the L1 door.
      { x: 20, y: 18.1, facing: Math.PI / 2, sweepDeg: 60, sweepPeriodS: 6, fovDeg: 50, range: 12 },
      // West wing — mounted on wall B's west face, facing west (PI) across
      // the approach to the L2 keycard.
      { x: 23.9, y: 6, facing: Math.PI, sweepDeg: 60, sweepPeriodS: 6, fovDeg: 50, range: 10 },
      // East wing — mounted on wall B's east face, facing east (0) across
      // the approach to the L3 keycard / chaff pickup.
      { x: 25.1, y: 6, facing: 0, sweepDeg: 60, sweepPeriodS: 6, fovDeg: 50, range: 10 },
    ],
    // Keycard/chaff pickups (see schema note above) — L1 lives back in the
    // Warehouse (see above); L2 and L3 plus a bonus chaff grenade live here.
    pickups: [
      { x: 10, y: 6, item: "keycardL2" }, // west wing, north corner
      { x: 34, y: 6, item: "keycardL3" }, // east wing, north corner (in the dark zone)
      { x: 30, y: 14, item: "chaff" }, // east wing, south of the keycard
    ],
    // 2 lasers (see file header / src/director.js's own contract), one per
    // wing, each spanning nearly the full wing width at y:10 — a player
    // walking from the L1-door entry point (south, y~16) to either wing's
    // keycard (north, y~6) must cross one, timing the crossing to the
    // duty-cycle's OFF phase (periodS 4s, dutyOn 0.6 -> 1.6s clear per
    // cycle) rather than just walking straight through.
    lasers: [
      { x1: 2, y1: 10, x2: 18, y2: 10, periodS: 4, dutyOn: 0.6 }, // west wing
      { x1: 26, y1: 10, x2: 38, y2: 10, periodS: 4, dutyOn: 0.6 }, // east wing
    ],
    // guardDoor (see schema note above) — the south entrance gap (x:18-22,
    // y:29, back to the Warehouse), 2m in from the trigger onto the lobby's
    // open floor, clear of both lockers and the SW dark zone.
    guardDoor: { x: 20, y: 27 },
  };
  laboratory.exit = laboratory.exits[0]; // back-compat alias, see schema note above

  // ---- zone data: COMMS TOWER --------------------------------------------------
  // 40x30. The finale zone (pillar: Tension) — heaviest patrol density in the
  // game. South entrance (entrances.fromLaboratory) mirrors the Laboratory's
  // own north exit exactly (x:18-22, same shared spine column every other
  // zone's south entrance has used) -> a SOUTH YARD leads up to an unlocked
  // door (doorCore, no lock) into the CORE STAIRWELL, a hollow 10x10 tower
  // footprint dead center (x:15-25, y:11-21) -> a ring corridor of open floor
  // wraps every side of the core (west/east YARDS flanking it, a NORTH YARD
  // above it) -> a wide north perimeter gap (x:15-25) is the HELIPAD APPROACH,
  // leading to the roof helipad extraction point at the very top of the map
  // (the exit trigger itself, y:0-3) -> exits[0].to is "extraction", a
  // deliberate stub (see KNOWN_STUBS in tests/zones.test.js — win-state lands
  // a future cycle; engine.js's tryZoneTransition already resolves an unknown
  // `to` generically by staying put + emitting zoneBlocked, same mechanism
  // every previous cycle's stub exit used, so no engine.js change was needed
  // to make this safe to ship ahead of the zone it points to).
  //
  // ENTRANCEKEY NOTE: the schema comment above frames entranceKey as indexing
  // the TARGET zone's `entrances` map, meaningless for a stub with no target
  // zone at all — but tests/zones.test.js's own well-formedness check (test
  // #3) asserts every exit's entranceKey is a non-empty string UNCONDITIONALLY
  // (before it ever looks at whether `to` resolves), so `entranceKey: null`
  // would fail that pre-existing assertion. "fromCommsTower" is used here
  // instead, following the exact same forward-looking-name convention the
  // Warehouse's own now-resolved Laboratory stub used before it was built
  // (entranceKey: "fromWarehouse", picked before Laboratory.entrances existed
  // at all) — whichever future cycle builds ZONES.extraction just needs to
  // define entrances.fromCommsTower to make this resolve for real.
  //
  // PATROL INTERLOCK (4 guards — see engine.js's ZONE_GUARDS.commsTower):
  // four independent loops chosen so their reach overlaps at every seam,
  // approximating near-continuous coverage without any one guard's route
  // being redundant with another's:
  //   waypoints  (tower-g1): the OUTER PERIMETER ring (same corners-of-the-
  //     map shape every previous zone's primary loop used) — the widest,
  //     slowest loop, its reach touching every yard's outer edge.
  //   waypoints2 (tower-g2): the CORE RING, a tight loop 2m clear of every
  //     face of the tower core — the only loop that ever comes within sight
  //     of doorCore, so a player badging into or out of the stairwell always
  //     has to clock this guard's position first.
  //   waypoints3 (tower-g3): the EAST YARD, a loop confined to x:29-37 east
  //     of the core, its west edge (x:29) sitting 2m clear of the core ring's
  //     own east edge (x:27) — the two loops run in close parallel along
  //     that seam rather than ever touching, so a player threading between
  //     them has a real but narrow gap, not a free lane.
  //   waypoints4 (tower-g4): the WEST YARD, the exact mirror of waypoints3
  //     (x:3-11), same 2m seam against the core ring's own west edge (x:13).
  // Together: the perimeter ring bounds the whole map, the core ring bounds
  // the tower, and the two yard loops fill the space between them on either
  // flank — the only gaps wide enough to actually stand still in unseen are
  // the 4 dark zones + the timing window on the single north laser, exactly
  // the "dark zones + timing gaps + lockers + tools" route design this cycle
  // calls for (see darkZones/lockers/lasers/pickups below).
  var commsTower = {
    id: "commsTower",
    name: "COMMS TOWER",
    bounds: { w: 40, h: 30 },
    walls: [
      // perimeter (6 segments: top split around the wide helipad-approach
      // gap x:15-25, bottom split around the south entrance gap x:18-22
      // shared with every other zone's spine column, left, right)
      { x: 0, y: 0, w: 15, h: 1 }, // top-left (gap: x 15-25, helipad approach)
      { x: 25, y: 0, w: 15, h: 1 }, // top-right
      { x: 0, y: 29, w: 18, h: 1 }, // bottom-left (gap: x 18-22, entrance from laboratory)
      { x: 22, y: 29, w: 18, h: 1 }, // bottom-right
      { x: 0, y: 0, w: 1, h: 30 }, // left
      { x: 39, y: 0, w: 1, h: 30 }, // right
      // CORE STAIRWELL — a hollow 10x10 footprint (x:15-25, y:11-21) dead
      // center, four wall segments forming its border, split on the south
      // face around doorCore's own gap (x:18-22) — the only way in/out.
      { x: 15, y: 11, w: 10, h: 1 }, // core north face
      { x: 15, y: 20, w: 3, h: 1 }, // core south face, west of doorCore
      { x: 22, y: 20, w: 3, h: 1 }, // core south face, east of doorCore
      { x: 15, y: 11, w: 1, h: 9 }, // core west face
      { x: 24, y: 11, w: 1, h: 9 }, // core east face
      // guard posts (small huts), one per yard, well clear of every
      // waypoint loop below (>=2m clearance on every side at r=0.6)
      { x: 5, y: 12, w: 3, h: 3 }, // west yard guard post
      { x: 32, y: 12, w: 3, h: 3 }, // east yard guard post
      // sandbag lines (low crates) flanking the core door's own south
      // approach, forcing a slight weave rather than a straight walk-up
      { x: 15, y: 24, w: 2, h: 2 }, // south approach, west flank
      { x: 23, y: 24, w: 2, h: 2 }, // south approach, east flank
      // sandbag lines flanking the north helipad approach, same purpose
      { x: 13, y: 5, w: 2, h: 2 }, // north approach, west flank
      { x: 25, y: 5, w: 2, h: 2 }, // north approach, east flank
    ],
    doors: [
      // Unlocked — auto-opens on mere proximity (see src/engine.js's DOORS
      // step) — into the core stairwell. No lock; nothing to badge, this is
      // flavor/structure this cycle, same "data now, mechanics later" posture
      // as the stairwell interior itself (x:16-24, y:12-20, otherwise empty).
      { x: 18, y: 20, w: 4, h: 1, lock: null, id: "doorCore" },
    ],
    playerSpawn: { x: 20, y: 26 },
    // Only exit this cycle: the roof helipad -> extraction stub (see zone
    // header note above). The trigger spans the full x:15-25 helipad-approach
    // gap at the very top of the map.
    exits: [{ x: 15, y: 0, w: 10, h: 3, to: "extraction", entranceKey: "fromCommsTower" }],
    entrances: { fromLaboratory: { x: 20, y: 26 } },
    // tower-g1: outer perimeter ring (see PATROL INTERLOCK above).
    waypoints: [
      { x: 3, y: 2 },
      { x: 37, y: 2 },
      { x: 37, y: 27 },
      { x: 3, y: 27 },
    ],
    // tower-g2: core ring, 2m clear of every face of the tower core.
    waypoints2: [
      { x: 13, y: 9 },
      { x: 27, y: 9 },
      { x: 27, y: 23 },
      { x: 13, y: 23 },
    ],
    // tower-g3: east yard loop.
    waypoints3: [
      { x: 29, y: 5 },
      { x: 37, y: 5 },
      { x: 37, y: 25 },
      { x: 29, y: 25 },
    ],
    // tower-g4: west yard loop (mirror of waypoints3).
    waypoints4: [
      { x: 3, y: 5 },
      { x: 11, y: 5 },
      { x: 11, y: 25 },
      { x: 3, y: 25 },
    ],
    // Generator shadows (>=3 required this cycle; 4 shipped) — one per yard
    // plus the north/south approach bands, each a real route past the
    // nearest camera/laser (see cameras/lasers below).
    darkZones: [
      { x: 2, y: 16, w: 4, h: 6 }, // west yard shadow
      { x: 34, y: 16, w: 4, h: 6 }, // east yard shadow
      { x: 14, y: 23, w: 12, h: 3 }, // south approach shadow, around the sandbag flanks
      { x: 14, y: 2, w: 12, h: 3 }, // north approach shadow, right at the helipad threshold
    ],
    lockers: [
      { x: 3, y: 19, facing: 0 },
      { x: 36, y: 19, facing: Math.PI },
      { x: 20, y: 24.5, facing: Math.PI / 2 },
      { x: 20, y: 3, facing: -Math.PI / 2 },
    ],
    // 2 searchlight-style cameras, WIDE sweep (sweepDeg 100, range 12) per
    // this cycle's design brief — deliberately much wider swing than any
    // earlier zone's 60deg cameras, covering almost the ENTIRE north/south
    // approach corridor rather than one intersection, matching the finale's
    // heavier coverage. Mounted 0.1m clear of the wall/doorway they watch
    // over, same convention as every earlier zone's camera placement.
    cameras: [
      // Mounted on the core's own north face, facing north (-PI/2) up the
      // full helipad approach corridor (the north yard, x:15-25's own gap
      // above it) -- the last thing between the stairwell roof exit and the
      // extraction point.
      { x: 20, y: 10.9, facing: -Math.PI / 2, sweepDeg: 100, sweepPeriodS: 6, fovDeg: 70, range: 12 },
      // Mounted just south of doorCore, facing south (PI/2) down the full
      // south approach corridor from the entrance to the stairwell door --
      // the first thing a player arriving from the Laboratory has to clock.
      { x: 20, y: 21.1, facing: Math.PI / 2, sweepDeg: 100, sweepPeriodS: 6, fovDeg: 70, range: 12 },
    ],
    // 1 laser across the final approach to the helipad -- timed exactly like
    // the Laboratory's own two (periodS 4, dutyOn 0.6 -> 1.6s clear per
    // cycle), spanning the full width of the north yard right at the
    // sandbag-flank line, so a player can't reach the extraction trigger
    // without either timing this beam or working the dark zone beside it.
    lasers: [{ x1: 13, y1: 5, x2: 27, y2: 5, periodS: 4, dutyOn: 0.6 }],
    // Reward-exploration pickups (see this cycle's design brief) -- one
    // ration, one chaff grenade, each tucked in a yard's own dark zone.
    // HONEST GAP: src/items.js's inv.collectPickup(item) (out of scope this
    // cycle -- see the file's own FILES YOU MAY TOUCH constraint) only
    // recognizes "keycardL1"/"keycardL2"/"keycardL3"/"chaff" as of this
    // cycle -- "ration" is not yet a wired-up pickup item, so walking over
    // this one still marks it collected and fires a { type: "pickup" } event
    // (src/engine.js's PICKUPS step never branches on collectPickup's return
    // value) but does NOT actually increment inv.rations yet. Documented
    // here, not hacked around, same posture as every other honest gap in
    // this codebase (e.g. src/world.js's own DOORS DO NOT ATTENUATE SOUND
    // note above) -- a future items.js cycle wiring up "ration" as a real
    // collectPickup case is the natural follow-up (see BACKLOG.md).
    pickups: [
      { x: 4, y: 20, item: "ration" },
      { x: 36, y: 20, item: "chaff" },
    ],
    // guardDoor (see schema note above) — the south entrance gap (x:18-22,
    // y:29, back to the Laboratory), 2m in from the trigger onto open
    // floor, clear of both south-approach sandbag flanks (x:15-17/23-25,
    // y:24-26).
    guardDoor: { x: 20, y: 27 },
  };
  commsTower.exit = commsTower.exits[0]; // back-compat alias, see schema note above

  Game.createWorld = createWorld;
  Game.ZONES = { loadingDock: loadingDock, warehouse: warehouse, laboratory: laboratory, commsTower: commsTower };
  if (typeof module !== "undefined")
    module.exports = { createWorld: createWorld, ZONES: Game.ZONES };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
