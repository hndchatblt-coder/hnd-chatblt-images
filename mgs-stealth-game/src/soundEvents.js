// src/soundEvents.js
// PUBLIC API:
//   Game.SOUND — tunable constants:
//     {
//       RADII: { run: 8, walk: 3, crouch: 1, knock: 10, dartImpact: 5,
//                bodyDrop: 6, locker: 4 },   // meters, unattenuated
//       WALL_ATTENUATION: 0.5,   // effective radius multiplier PER wall crossed
//       SHARP: { knock: true, dartImpact: true, bodyDrop: true, locker: true },
//                // sharp -> "strong" stimulus (deliberate/alarming); anything
//                // NOT in this map (movement kinds: run/walk/crouch) is soft
//                // -> "faint".
//       KNOCK_WALL_DIST: 1.2,    // player must be this close to a wall to knock
//     }
//
//   Game.createSoundEvents({ world }) -> soundEvents, where `world` is a
//   Game.createWorld(...) instance (src/world.js). Only world.zone.walls (the
//   plain AABB array) is consumed — see wallsBetween below for why this module
//   does NOT call world.raycast.
//
//     wallsBetween(x1, y1, x2, y2) -> integer
//       Number of DISTINCT wall AABBs the straight segment (x1,y1)->(x2,y2)
//       crosses strictly between its two endpoints.
//       IMPLEMENTATION NOTE (why not world.raycast in a marching loop): the
//       obvious approach — cast, step an epsilon past the hit, cast again,
//       repeat — is a trap here. world.js's segmentVsRect (the slab method)
//       CLAMPS a segment that starts inside a box to t=0 (see world.js
//       comment: "t is clamped to 0 if the segment starts inside the box").
//       So the moment a marching cast lands even slightly inside a wall (which
//       it must, to get past the entry surface), the NEXT cast from that point
//       reports dist ~0 forever — an infinite-loop hazard, not a corner case.
//       Instead this module keeps a LOCAL copy of the slab math (wallEntryT
//       below) that returns the UNCLAMPED entry parameter t for the segment
//       against the INFINITE line through it, so "segment starts inside/past
//       this wall" (t <= 0) is distinguishable from "segment actually enters
//       this wall somewhere in the middle" (0 < t < 1). wallsBetween then just
//       iterates world.zone.walls ONCE and counts entries with 0 < t < 1 — no
//       marching, no epsilon stepping, no iteration cap needed, and each wall
//       is counted at most once (its single entry crossing), which is exactly
//       "how many distinct walls does this line cross".
//
//     effectiveRadius(kind, x1, y1, x2, y2) -> number
//       RADII[kind] * WALL_ATTENUATION ^ wallsBetween(x1, y1, x2, y2). Throws
//       if `kind` is not a key of RADII.
//
//     emitRadius(x, y, radius, sharp, listeners) -> results[]
//       The general emission primitive `emit` (below) delegates to. `radius`
//       is the unattenuated (0-wall) radius in meters; `sharp` (boolean)
//       selects "strong" (true) or "faint" (false) as the stimulus strength
//       delivered to listeners in range. `listeners` is an array of objects
//       shaped like { x, y, hearNoise(x,y,strength), id? } (guards satisfy
//       this — see guardAI.js contract). For each listener: computes
//       effRadius = radius * WALL_ATTENUATION^wallsBetween(x,y,listener.x,listener.y),
//       dist = straight-line distance from (x,y) to the listener. If
//       dist <= effRadius: calls listener.hearNoise(x, y, sharp?"strong":"faint")
//       and marks heard true; otherwise heard false and hearNoise is NOT
//       called. Returns one result object per listener, in listener order:
//         { listenerId, id, dist, strength, heard, effRadius }
//       listenerId is listener.id verbatim (may be undefined if the listener
//       has none); id falls back to the listener's array index when the
//       listener has no .id, so every result is addressable even for
//       anonymous listeners. strength reflects sharp/soft regardless of
//       whether it was actually heard (it's a property of the SOUND, not the
//       outcome) — useful for tests/debug UI wanting to know "how loud would
//       this have been."
//
//     emit(x, y, kind, listeners) -> results[]
//       Same return shape as emitRadius, via RADII[kind] as the base radius
//       and !!SHARP[kind] as sharp. Throws if `kind` is not a key of RADII
//       (same rule as effectiveRadius).
//
// Pure JS, deterministic, no THREE/DOM/Math.random/Date. Local helpers only —
// runs headless in node. Consumes world only via world.zone.walls (read-only);
// does not modify world/player/vision/guardAI/rng.
(function (Game) {
  // ---- local math helpers (no dependency on other modules) -----------------

  function distance(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Local copy of world.js's segmentVsRect slab test, EXCEPT it returns the
  // RAW (unclamped) entry parameter t for the segment's INFINITE line against
  // `rect`, rather than clamping a "starts inside" case to 0. See the
  // wallsBetween contract note above for why that distinction matters here.
  // Returns null if the infinite line never enters rect at all.
  function wallEntryT(x1, y1, x2, y2, rect) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var tmin = -Infinity;
    var tmax = Infinity;

    if (dx === 0) {
      if (x1 < rect.x || x1 > rect.x + rect.w) return null;
    } else {
      var tx1 = (rect.x - x1) / dx;
      var tx2 = (rect.x + rect.w - x1) / dx;
      if (tx1 > tx2) {
        var tmpx = tx1;
        tx1 = tx2;
        tx2 = tmpx;
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
        var tmpy = ty1;
        ty1 = ty2;
        ty2 = tmpy;
      }
      if (ty1 > tmin) tmin = ty1;
      if (ty2 < tmax) tmax = ty2;
      if (tmin > tmax) return null;
    }

    return tmin;
  }

  // ---- constants -------------------------------------------------------------

  var SOUND = {
    RADII: {
      run: 8,
      walk: 3,
      crouch: 1,
      knock: 10,
      dartImpact: 5,
      bodyDrop: 6,
      locker: 4,
    },
    WALL_ATTENUATION: 0.5,
    SHARP: { knock: true, dartImpact: true, bodyDrop: true, locker: true },
    KNOCK_WALL_DIST: 1.2,
  };

  // ---- soundEvents factory ----------------------------------------------------

  function createSoundEvents(deps) {
    var world = deps.world;
    var walls = world.zone.walls;

    function wallsBetween(x1, y1, x2, y2) {
      if (x1 === x2 && y1 === y2) return 0; // degenerate: same point, nothing "between"
      var count = 0;
      for (var i = 0; i < walls.length; i++) {
        var t = wallEntryT(x1, y1, x2, y2, walls[i]);
        if (t !== null && t > 0 && t < 1) count++;
      }
      return count;
    }

    function baseRadiusFor(kind) {
      var base = SOUND.RADII[kind];
      if (base === undefined) throw new Error("soundEvents: unknown sound kind '" + kind + "'");
      return base;
    }

    function effectiveRadiusFromBase(baseRadius, x1, y1, x2, y2) {
      var crossed = wallsBetween(x1, y1, x2, y2);
      return baseRadius * Math.pow(SOUND.WALL_ATTENUATION, crossed);
    }

    function effectiveRadius(kind, x1, y1, x2, y2) {
      return effectiveRadiusFromBase(baseRadiusFor(kind), x1, y1, x2, y2);
    }

    function emitRadius(x, y, radius, sharp, listeners) {
      var strength = sharp ? "strong" : "faint";
      var results = [];
      for (var i = 0; i < listeners.length; i++) {
        var listener = listeners[i];
        var effRadius = effectiveRadiusFromBase(radius, x, y, listener.x, listener.y);
        var dist = distance(x, y, listener.x, listener.y);
        var heard = dist <= effRadius;
        if (heard) listener.hearNoise(x, y, strength);
        results.push({
          listenerId: listener.id,
          id: listener.id !== undefined ? listener.id : i,
          dist: dist,
          strength: strength,
          heard: heard,
          effRadius: effRadius,
        });
      }
      return results;
    }

    function emit(x, y, kind, listeners) {
      return emitRadius(x, y, baseRadiusFor(kind), !!SOUND.SHARP[kind], listeners);
    }

    return {
      wallsBetween: wallsBetween,
      effectiveRadius: effectiveRadius,
      emitRadius: emitRadius,
      emit: emit,
    };
  }

  Game.SOUND = SOUND;
  Game.createSoundEvents = createSoundEvents;
  if (typeof module !== "undefined")
    module.exports = { createSoundEvents: createSoundEvents, SOUND: SOUND };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
