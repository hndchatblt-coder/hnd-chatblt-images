// src/vision.js
// PUBLIC API:
//   Game.VISION — tunable constants:
//     {
//       FOV_DEG: 70,          // full cone angle (degrees)
//       RANGE: 14,            // meters
//       SUSPICIOUS_AT: 0.35,  // meter threshold -> guard FSM SUSPICIOUS
//       ALERT_AT: 1.0,        // meter full -> confirmed sight -> ALERT
//       DARKNESS_MULT: 0.5,   // target inside a darkZone
//       DRAIN_PER_SEC: 0.5,   // meter drain per second when factor === 0
//       FILL_BASE: 1.25,      // fill rate (per second) for a standing target
//                             // at FILL_NEAR_DIST, in light, extraMult 1
//       FILL_NEAR_DIST: 2,    // meters — "close range" reference distance
//       FILL_FAR_SCALE: 0.3,  // proximity scale at RANGE, relative to NEAR
//     }
//
//   FILL FORMULA (proximity-scaled fill rate):
//     proximityScale(dist, range) =
//       1 - ((dist - FILL_NEAR_DIST) / (range - FILL_NEAR_DIST)) * (1 - FILL_FAR_SCALE)
//     factor = FILL_BASE * proximityScale(dist, range) * profile * darkness * extraMult
//   This is a RATE MULTIPLIER (meter units per second), not clamped to 1 — it is
//   fed into tickMeter's meter += factor*dt integration. Tuned so a STANDING
//   target (profile 1.0) in open light (darkness 1) at close range (dist ==
//   FILL_NEAR_DIST == 2m) fills the meter 0 -> 1 in exactly FILL_BASE's
//   reciprocal: 1/1.25 = 0.8s, matching the SPEC "confirmed sight >= 0.8s ->
//   ALERT" threshold. At RANGE (14m) the same target's factor is scaled by
//   FILL_FAR_SCALE (0.3), i.e. ~3.33x slower — inside the required 2.5-4x
//   band. proximityScale is linear in distance and is NOT clamped to [0,1]:
//   targets closer than FILL_NEAR_DIST get a (slightly) faster-than-base fill,
//   which is intentional (nothing hides better than point-blank).
//
//   Game.createVision({ world }) -> vision, where `world` is a
//   Game.createWorld(...) instance (see src/world.js).
//
//   vision.computeSight(viewer, target, opts?) -> { inCone, hasLOS, dist, factor }
//     viewer: { x, y, facing, fovDeg?, range? }
//       facing is radians, same convention as player.facing: 0 = +x, +y down
//       (atan2(dy,dx)); fovDeg/range default to VISION.FOV_DEG/VISION.RANGE.
//     target: { x, y, visionProfile()? } — visionProfile() returns the
//       perception multiplier (stand 1.0, crouch 0.6, crawl 0.3, see
//       src/player.js). A plain { x, y } with no visionProfile() is fine as
//       long as opts.profile is supplied (defaults to 1.0 otherwise).
//     opts: { profile?: number, extraMult?: number }
//       profile overrides target.visionProfile() when provided. extraMult is
//       a hook for future modifiers (cardboard box 0.05, etc.) — default 1,
//       applied multiplicatively.
//     Returns:
//       dist    — straight-line distance from viewer to target (meters).
//       inCone  — dist <= effective range AND the absolute angular difference
//                 between viewer.facing and the direction to the target is
//                 <= fovDeg/2. Angle difference is computed via a wrapped
//                 normalization (result in (-PI, PI]) so a viewer facing PI
//                 seeing a target just across the +/-PI seam works correctly.
//                 The cone edge is INCLUSIVE (<=): a target at exactly
//                 fovDeg/2 off-center counts as seen.
//       hasLOS  — world.raycast(viewer.x, viewer.y, target.x, target.y) is
//                 null (totally clear), OR the reported hit distance is >=
//                 the viewer-target distance (the target sits in front of
//                 whatever wall the ray would eventually hit, e.g. flush
//                 against it) — computed regardless of inCone.
//       factor  — 0 unless inCone && hasLOS; otherwise the FILL FORMULA above,
//                 using darkness = VISION.DARKNESS_MULT if the target's
//                 CENTER lies inside any world.zone.darkZones rect, else 1.
//
//   vision.tickMeter(meter, factor, dt) -> new meter value
//     meter + factor*dt when factor > 0, else meter - DRAIN_PER_SEC*dt.
//     Clamped to [0, 1].
//
//   vision.isInDarkZone(x, y) -> boolean
//     true iff (x,y) lies inside (closed containment) any world.zone.darkZones
//     rect. Exposed standalone for radar/HUD use later.
//
// DESIGN NOTE: vision holds NO internal state. Every call is a pure function
// of its arguments. guardAI (not this module) owns each guard's meter value
// and calls computeSight + tickMeter once per guard per tick; staggering the
// per-tick vision checks across many guards (for perf) is the engine's job,
// not vision's.
//
// Pure logic module: no THREE, no DOM, no browser APIs, no Math.random/Date —
// runs headless in node. No dependency on other modules for math (own local
// helpers below); consumes a world (src/world.js) instance via raycast/
// inRegion/zone only.
(function (Game) {
  // ---- local math helpers (no dependency on other modules) -----------------

  var TWO_PI = Math.PI * 2;

  // Normalizes an angle (radians) to (-PI, PI].
  function normalizeAngle(a) {
    var r = a % TWO_PI;
    if (r > Math.PI) r -= TWO_PI;
    if (r < -Math.PI) r += TWO_PI;
    return r;
  }

  // Smallest signed angular difference a-b, wrapped to (-PI, PI], so callers
  // never trip over the +/-PI seam.
  function angleDiff(a, b) {
    return normalizeAngle(a - b);
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // ---- constants -------------------------------------------------------------

  var VISION = {
    FOV_DEG: 70,
    RANGE: 14,
    SUSPICIOUS_AT: 0.35,
    ALERT_AT: 1.0,
    DARKNESS_MULT: 0.5,
    DRAIN_PER_SEC: 0.5,
    FILL_BASE: 1.25,
    FILL_NEAR_DIST: 2,
    FILL_FAR_SCALE: 0.3,
  };

  // ---- vision factory ---------------------------------------------------------

  function createVision(deps) {
    var world = deps.world;

    function isInDarkZone(x, y) {
      var darkZones = (world.zone && world.zone.darkZones) || [];
      for (var i = 0; i < darkZones.length; i++) {
        if (world.inRegion(x, y, darkZones[i])) return true;
      }
      return false;
    }

    // Linear proximity scale: 1 at FILL_NEAR_DIST, FILL_FAR_SCALE at `range`.
    function proximityScale(dist, range) {
      var near = VISION.FILL_NEAR_DIST;
      var span = range - near;
      if (span <= 0) return 1;
      var t = (dist - near) / span;
      return 1 - t * (1 - VISION.FILL_FAR_SCALE);
    }

    function computeSight(viewer, target, opts) {
      opts = opts || {};

      var fovDeg = viewer.fovDeg !== undefined ? viewer.fovDeg : VISION.FOV_DEG;
      var range = viewer.range !== undefined ? viewer.range : VISION.RANGE;

      var dx = target.x - viewer.x;
      var dy = target.y - viewer.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      var dirToTarget = Math.atan2(dy, dx);
      var diff = angleDiff(viewer.facing, dirToTarget);
      var halfFov = (fovDeg * Math.PI) / 180 / 2;

      var inCone = dist <= range && Math.abs(diff) <= halfFov;

      var hit = world.raycast(viewer.x, viewer.y, target.x, target.y);
      var hasLOS = hit === null || hit.dist >= dist - 1e-9;

      var factor = 0;
      if (inCone && hasLOS) {
        var profile =
          opts.profile !== undefined
            ? opts.profile
            : typeof target.visionProfile === "function"
              ? target.visionProfile()
              : 1.0;
        var extraMult = opts.extraMult !== undefined ? opts.extraMult : 1;
        var darkness = isInDarkZone(target.x, target.y) ? VISION.DARKNESS_MULT : 1;
        var scale = proximityScale(dist, range);
        factor = VISION.FILL_BASE * scale * profile * darkness * extraMult;
      }

      return { inCone: inCone, hasLOS: hasLOS, dist: dist, factor: factor };
    }

    function tickMeter(meter, factor, dt) {
      var next = factor > 0 ? meter + factor * dt : meter - VISION.DRAIN_PER_SEC * dt;
      return clamp(next, 0, 1);
    }

    return {
      computeSight: computeSight,
      tickMeter: tickMeter,
      isInDarkZone: isInDarkZone,
    };
  }

  Game.createVision = createVision;
  Game.VISION = VISION;
  if (typeof module !== "undefined")
    module.exports = { createVision: createVision, VISION: VISION };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
