// src/guardAI.js
// PUBLIC API:
//   Game.GUARD — tunable constants:
//     {
//       RADIUS: 0.4,
//       PATROL_SPEED: 1.5,        // m/s
//       INVESTIGATE_SPEED: 2.0,   // m/s
//       WAYPOINT_PAUSE: 2.0,      // s dwelling at each waypoint, with head sweep
//       HEAD_SWEEP_DEG: 40,       // +/- facing oscillation while paused at a waypoint
//       SUSPICIOUS_STARE: 3.0,    // s staring at the stimulus before de-escalating
//       INVESTIGATE_SEARCH: 8.0,  // s expanding-arc search once at the stimulus point
//       ARRIVE_DIST: 0.6,         // close enough to a waypoint/stimulus to call it "arrived"
//       MAX_STATE_S: { SUSPICIOUS: 4.0, INVESTIGATE: 30.0 }
//         // hard invariants: a guard's stateTime in SUSPICIOUS/INVESTIGATE must
//         // NEVER exceed these (INVESTIGATE includes travel time to the
//         // stimulus). Enforced by a thrown Error in update() — a guard stuck
//         // past its own state's normal exit condition is a bug, not a state
//         // to silently tolerate. PATROL/ALERT have no ceiling (PATROL loops
//         // forever by design; ALERT has no exit yet, see below).
//     }
//
//   Game.createGuard({ world, vision, rng, spawn, waypoints, id }) -> guard
//     world:     a Game.createWorld(...) instance (src/world.js) — consumed via
//                moveCircle/raycast(indirectly through vision)/inRegion/zone.
//     vision:    a Game.createVision({world}) instance (src/vision.js) —
//                consumed via computeSight/tickMeter.
//     rng:       a Game.createRng(seed) instance (src/rng.js). Stored but not
//                required by this module's own logic (all FSM timing/sweeps
//                are deterministic functions of stateTime, not dice rolls);
//                kept in the signature so future pick()-style choices (e.g.
//                random alternate patrol routes) have it available without an
//                API change.
//     spawn:     { x, y } initial position. Defaults to waypoints[0], or
//                world.zone.playerSpawn if no waypoints are given.
//     waypoints: [{x,y}, ...] patrol loop, walked in array order then wrapped
//                (index 0 follows the last). Defaults to world.zone.waypoints.
//                Consecutive waypoints are assumed to have a clear line (no
//                pathfinding this version — see src/world.js zone layout notes).
//     id:        opaque identifier, stored as guard.id (any value, default null).
//
//   guard — flat, readable state (mutated in place by update()/hearNoise()):
//     id, x, y                — position (meters, world space)
//     facing                  — radians, 0 = +x, +y down (atan2 convention,
//                                same as player.facing / vision viewer.facing)
//     radius                  — GUARD.RADIUS (constant)
//     state                   — "PATROL" | "SUSPICIOUS" | "INVESTIGATE" | "ALERT"
//     meter                   — 0..1 detection meter (vision.tickMeter output)
//     stateTime               — seconds spent in the CURRENT state; reset to 0
//                                whenever the state changes
//     stimulus                — {x,y} | null — the point of interest driving
//                                SUSPICIOUS/INVESTIGATE (last sighting or noise
//                                origin); irrelevant in PATROL/ALERT
//     waypointIndex            — index into `waypoints` of the patrol target
//
//   guard.update(dt, ctx) — ctx = { player }, player satisfying the
//   target/player contract ({x, y, visionProfile()}). Call once per tick
//   (engine uses dt = 1/60). Per tick:
//     1. PERCEPTION (skipped in ALERT — see below): viewer = {x: guard.x,
//        y: guard.y, facing: guard.facing} (guard's own fovDeg/range are not
//        overridden, so vision.js's VISION.FOV_DEG/RANGE defaults apply).
//        sight = vision.computeSight(viewer, ctx.player);
//        guard.meter = vision.tickMeter(guard.meter, sight.factor, dt).
//     2. FSM (see per-state behavior below). Every state re-checks
//        meter >= VISION.ALERT_AT first (except PATROL, whose only exit is
//        SUSPICIOUS at VISION.SUSPICIOUS_AT) so a guard can jump straight to
//        ALERT from SUSPICIOUS/INVESTIGATE the instant sight is confirmed,
//        without waiting for a timer.
//     3. stateTime += dt happens once, up front, before FSM dispatch; entering
//        a new state (any transition) resets stateTime to 0 for that new state.
//     4. INVARIANT: after dispatch, if guard.state is SUSPICIOUS or
//        INVESTIGATE and guard.stateTime > GUARD.MAX_STATE_S[guard.state],
//        this throws an Error. Because normal exits fire strictly before this
//        ceiling (SUSPICIOUS_STARE=3.0 < MAX 4.0; INVESTIGATE's own travel+
//        search time is expected to fit under MAX 30.0), tripping this is
//        proof of an FSM bug, not a slow-but-valid run.
//
//   Per-state behavior:
//     PATROL — walks straight at waypoints[waypointIndex] via world.moveCircle
//       at GUARD.PATROL_SPEED, facing set to the direction of travel each
//       tick. On arrival (dist <= ARRIVE_DIST): stops and dwells
//       GUARD.WAYPOINT_PAUSE seconds, facing oscillating +/-HEAD_SWEEP_DEG
//       around the facing it arrived with (deterministic sine of the time
//       spent paused — no rng). After the dwell, waypointIndex advances
//       (wrapping) and walking resumes. At ANY point (walking or paused): if
//       meter >= VISION.SUSPICIOUS_AT, transitions to SUSPICIOUS with
//       stimulus = a snapshot of ctx.player's current {x,y}.
//     SUSPICIOUS — stops moving; turns facing toward `stimulus` at a finite
//       rate (3 rad/s local constant TURN_RATE — an instant snap is both
//       ugly to watch and untestable) rather than snapping. Holds for
//       GUARD.SUSPICIOUS_STARE seconds unless meter reaches VISION.ALERT_AT
//       first (-> ALERT immediately). At the end of the stare: meter <
//       VISION.SUSPICIOUS_AT -> back to PATROL, resuming the SAME
//       waypointIndex (never touched while SUSPICIOUS/INVESTIGATE); meter
//       still >= VISION.SUSPICIOUS_AT -> INVESTIGATE, walking to `stimulus`
//       (unchanged from what SUSPICIOUS was given).
//     INVESTIGATE — walks to `stimulus` at GUARD.INVESTIGATE_SPEED (same
//       moveCircle steering as PATROL); on arrival (dist <= ARRIVE_DIST),
//       holds position and does an expanding-arc search for
//       GUARD.INVESTIGATE_SEARCH seconds: facing sweeps a sine oscillation
//       around the facing it arrived with, whose amplitude grows linearly
//       from 0 to +/-PI over the search duration (deterministic function of
//       time spent searching — no rng). After the search: back to PATROL
//       (waypointIndex unchanged, so the guard walks from wherever it ends up
//       back into its normal loop). At ANY point: meter >= VISION.ALERT_AT ->
//       ALERT immediately.
//     ALERT — PLACEHOLDER. Part B (a future cycle) replaces this with real
//       pursuit/combat behavior. This version: guard stands completely still,
//       faces ctx.player's current position every tick, meter is pinned at 1
//       (perception step 1 above is skipped entirely — there is nothing left
//       to detect). There is NO EXIT from ALERT in this version; once a guard
//       is ALERT it stays ALERT for the rest of the run. Do not build anything
//       downstream that assumes ALERT ever ends — that assumption breaks the
//       moment part B lands.
//
//   guard.hearNoise(x, y, strength) — external stimulus API. `strength` is
//   "faint" or "strong" (soundEvents.js will call this later; tests/sim call
//   it directly meanwhile):
//     "faint"  — only from PATROL: -> SUSPICIOUS, stimulus = {x,y}.
//     "strong" — from PATROL or SUSPICIOUS: -> INVESTIGATE, stimulus = {x,y}.
//     Any other case (already INVESTIGATE, or ALERT) is ignored — a guard
//     already closing in on (or standing over) something is not distracted by
//     a second noise, and ALERT never reacts to anything but the confirmed
//     target (see ALERT placeholder note above).
//
// Local tuning constants below (TURN_RATE, *_SWEEP_HZ) are NOT part of the
// public Game.GUARD contract — they govern the shape of facing animation only
// (how fast a guard turns, how fast its head sweep oscillates) and carry no
// externally-observable timing guarantee beyond "facing changes over time,
// deterministically, given dt."
//
// Pure logic module: no THREE, no DOM, no browser APIs, no Math.random/Date —
// runs headless in node. No dependency on other modules for math (own local
// helpers below); consumes world (moveCircle) and vision (computeSight/
// tickMeter) instances only, per their published contracts.
(function (Game) {
  // ---- local math helpers (no dependency on other modules) -----------------

  var TWO_PI = Math.PI * 2;
  var DEG2RAD = Math.PI / 180;

  // Normalizes an angle (radians) to (-PI, PI].
  function normalizeAngle(a) {
    var r = a % TWO_PI;
    if (r > Math.PI) r -= TWO_PI;
    if (r < -Math.PI) r += TWO_PI;
    return r;
  }

  // Smallest signed angular difference a-b, wrapped to (-PI, PI].
  function angleDiff(a, b) {
    return normalizeAngle(a - b);
  }

  // Turns `current` toward `target` at a maximum rate of maxRate rad/s over
  // dt seconds; snaps only when the remaining difference is already inside
  // one step. Never overshoots.
  function turnToward(current, target, maxRate, dt) {
    var diff = angleDiff(target, current);
    var maxStep = maxRate * dt;
    if (Math.abs(diff) <= maxStep) return normalizeAngle(target);
    return normalizeAngle(current + (diff < 0 ? -maxStep : maxStep));
  }

  function distance(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---- constants -------------------------------------------------------------

  var GUARD = {
    RADIUS: 0.4,
    PATROL_SPEED: 1.5,
    INVESTIGATE_SPEED: 2.0,
    WAYPOINT_PAUSE: 2.0,
    HEAD_SWEEP_DEG: 40,
    SUSPICIOUS_STARE: 3.0,
    INVESTIGATE_SEARCH: 8.0,
    ARRIVE_DIST: 0.6,
    MAX_STATE_S: { SUSPICIOUS: 4.0, INVESTIGATE: 30.0 },
  };

  // Local-only tuning (not part of the public contract, see file header).
  var TURN_RATE = 3; // rad/s, SUSPICIOUS turning-to-face-stimulus rate
  var PAUSE_SWEEP_HZ = 1.5; // oscillations/sec-ish for the waypoint head sweep
  var SEARCH_SWEEP_HZ = 0.5; // oscillations/sec-ish for the investigate search sweep

  // ---- guard factory ----------------------------------------------------------

  function createGuard(deps) {
    var world = deps.world;
    var vision = deps.vision;
    var rng = deps.rng;
    var waypoints = deps.waypoints || (world.zone && world.zone.waypoints) || [];
    var spawn =
      deps.spawn || waypoints[0] || (world.zone && world.zone.playerSpawn) || { x: 0, y: 0 };

    var initialFacing = 0;
    if (waypoints.length > 0) {
      initialFacing = Math.atan2(waypoints[0].y - spawn.y, waypoints[0].x - spawn.x);
    }

    var guard = {
      id: deps.id !== undefined ? deps.id : null,
      x: spawn.x,
      y: spawn.y,
      facing: initialFacing,
      radius: GUARD.RADIUS,
      state: "PATROL",
      meter: 0,
      stateTime: 0,
      stimulus: null,
      waypointIndex: 0,
    };

    // Internal sub-state, not part of the public contract (flat props listed
    // in the file header are the guard's full observable surface; these back
    // the pause/search animations and are reset by setState()).
    var pausing = false;
    var pauseTime = 0;
    var pauseBaseFacing = 0;
    var searching = false;
    var searchTime = 0;
    var searchBaseFacing = 0;

    function setState(newState, stimulus) {
      guard.state = newState;
      guard.stateTime = 0;
      if (stimulus) guard.stimulus = { x: stimulus.x, y: stimulus.y };
      if (newState === "PATROL") {
        pausing = false;
        pauseTime = 0;
      }
      if (newState === "INVESTIGATE") {
        searching = false;
        searchTime = 0;
      }
    }

    // ---- PATROL ---------------------------------------------------------------

    function tickPatrol(dt, ctx) {
      if (pausing) {
        pauseTime += dt;
        var sweep =
          GUARD.HEAD_SWEEP_DEG * DEG2RAD * Math.sin(pauseTime * PAUSE_SWEEP_HZ * TWO_PI);
        guard.facing = normalizeAngle(pauseBaseFacing + sweep);
        if (pauseTime >= GUARD.WAYPOINT_PAUSE) {
          pausing = false;
          pauseTime = 0;
          waypointIndex_advance();
        }
      } else if (waypoints.length > 0) {
        var wp = waypoints[guard.waypointIndex];
        var d = distance(guard.x, guard.y, wp.x, wp.y);
        if (d <= GUARD.ARRIVE_DIST) {
          pausing = true;
          pauseTime = 0;
          pauseBaseFacing = guard.facing;
        } else {
          var stepLen = Math.min(GUARD.PATROL_SPEED * dt, d);
          var ux = (wp.x - guard.x) / d;
          var uy = (wp.y - guard.y) / d;
          var res = world.moveCircle(guard.x, guard.y, ux * stepLen, uy * stepLen, guard.radius);
          guard.x = res.x;
          guard.y = res.y;
          guard.facing = Math.atan2(wp.y - guard.y, wp.x - guard.x);
        }
      }

      if (guard.meter >= Game.VISION.SUSPICIOUS_AT) {
        setState("SUSPICIOUS", { x: ctx.player.x, y: ctx.player.y });
      }
    }

    function waypointIndex_advance() {
      if (waypoints.length > 0) {
        guard.waypointIndex = (guard.waypointIndex + 1) % waypoints.length;
      }
    }

    // ---- SUSPICIOUS -------------------------------------------------------------

    function tickSuspicious(dt) {
      var stim = guard.stimulus;
      if (stim) {
        var targetAngle = Math.atan2(stim.y - guard.y, stim.x - guard.x);
        guard.facing = turnToward(guard.facing, targetAngle, TURN_RATE, dt);
      }

      if (guard.meter >= Game.VISION.ALERT_AT) {
        setState("ALERT", null);
        return;
      }

      if (guard.stateTime >= GUARD.SUSPICIOUS_STARE) {
        if (guard.meter < Game.VISION.SUSPICIOUS_AT) {
          setState("PATROL", null);
        } else {
          setState("INVESTIGATE", guard.stimulus);
        }
      }
    }

    // ---- INVESTIGATE -------------------------------------------------------------

    function tickInvestigate(dt) {
      if (guard.meter >= Game.VISION.ALERT_AT) {
        setState("ALERT", null);
        return;
      }

      var stim = guard.stimulus || { x: guard.x, y: guard.y };
      var d = distance(guard.x, guard.y, stim.x, stim.y);

      if (d > GUARD.ARRIVE_DIST) {
        var stepLen = Math.min(GUARD.INVESTIGATE_SPEED * dt, d);
        var ux = (stim.x - guard.x) / d;
        var uy = (stim.y - guard.y) / d;
        var res = world.moveCircle(guard.x, guard.y, ux * stepLen, uy * stepLen, guard.radius);
        guard.x = res.x;
        guard.y = res.y;
        guard.facing = Math.atan2(stim.y - guard.y, stim.x - guard.x);
      } else {
        if (!searching) {
          searching = true;
          searchTime = 0;
          searchBaseFacing = guard.facing;
        }
        searchTime += dt;
        var t = Math.min(searchTime / GUARD.INVESTIGATE_SEARCH, 1);
        var amplitude = t * Math.PI;
        var sweep = amplitude * Math.sin(searchTime * SEARCH_SWEEP_HZ * TWO_PI);
        guard.facing = normalizeAngle(searchBaseFacing + sweep);

        if (searchTime >= GUARD.INVESTIGATE_SEARCH) {
          setState("PATROL", null);
        }
      }
    }

    // ---- ALERT (placeholder — see file header) -----------------------------------

    function tickAlert(ctx) {
      guard.facing = Math.atan2(ctx.player.y - guard.y, ctx.player.x - guard.x);
      guard.meter = 1;
    }

    // ---- update / hearNoise -------------------------------------------------------

    function update(dt, ctx) {
      guard.stateTime += dt;

      if (guard.state !== "ALERT") {
        var viewer = { x: guard.x, y: guard.y, facing: guard.facing };
        var sight = vision.computeSight(viewer, ctx.player);
        guard.meter = vision.tickMeter(guard.meter, sight.factor, dt);
      }

      switch (guard.state) {
        case "PATROL":
          tickPatrol(dt, ctx);
          break;
        case "SUSPICIOUS":
          tickSuspicious(dt);
          break;
        case "INVESTIGATE":
          tickInvestigate(dt);
          break;
        case "ALERT":
          tickAlert(ctx);
          break;
      }

      var maxS = GUARD.MAX_STATE_S[guard.state];
      if (maxS !== undefined && guard.stateTime > maxS) {
        throw new Error(
          "guard " +
            guard.id +
            " stuck in " +
            guard.state +
            " for " +
            guard.stateTime.toFixed(2) +
            "s (max " +
            maxS +
            "s) — FSM invariant violated"
        );
      }
    }

    function hearNoise(x, y, strength) {
      if (guard.state === "ALERT") return;
      if (strength === "faint") {
        if (guard.state === "PATROL") setState("SUSPICIOUS", { x: x, y: y });
      } else if (strength === "strong") {
        if (guard.state === "PATROL" || guard.state === "SUSPICIOUS") {
          setState("INVESTIGATE", { x: x, y: y });
        }
      }
    }

    guard.update = update;
    guard.hearNoise = hearNoise;

    // rng is accepted per contract for future pick()-style choices; not used
    // by any logic in this version, but kept alive to avoid an unused-var
    // lint false-positive reading as "forgot to wire it up".
    guard._rng = rng;

    return guard;
  }

  Game.createGuard = createGuard;
  Game.GUARD = GUARD;
  if (typeof module !== "undefined")
    module.exports = { createGuard: createGuard, GUARD: GUARD };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
