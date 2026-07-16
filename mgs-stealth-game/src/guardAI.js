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
//       EVASION_S: 30,            // squad phase timer: EVASION -> CAUTION
//       CAUTION_S: 45,            // squad phase timer: CAUTION -> INFILTRATION
//       ALERT_SPEED: 3.2,         // m/s, ALERT pursuit of the player/lastKnown
//       ARREST_DIST: 2.0,         // m, ALERT pursuit stops here (no overlap w/ player)
//       CAUTION_FOV_MULT: 1.3,    // widened cone angle multiplier while squad is CAUTION
//       CAUTION_RANGE_MULT: 1.2,  // widened cone range multiplier while squad is CAUTION
//       CAUTION_SPEED: 2.0,       // m/s, patrol speed while squad is CAUTION
//       MAX_STATE_S: { SUSPICIOUS: 4.0, INVESTIGATE: 30.0, ALERT: Infinity }
//         // hard invariants: a guard's stateTime in SUSPICIOUS/INVESTIGATE must
//         // NEVER exceed these (INVESTIGATE includes travel time to the
//         // stimulus). Enforced by a thrown Error in update() — a guard stuck
//         // past its own state's normal exit condition is a bug, not a state
//         // to silently tolerate. PATROL has no ceiling (loops forever by
//         // design). ALERT is explicitly Infinity: it persists for as long as
//         // the squad has contact (see squad.phase below) — that is NOT a bug,
//         // so it must never trip this invariant. EVASION/CAUTION are
//         // deliberately ABSENT from this map: they have no per-guard state
//         // ceiling here because they are bounded by the SQUAD's own phase
//         // timers (GUARD.EVASION_S / GUARD.CAUTION_S, enforced in
//         // squad.tick()), not by guard.update()'s own invariant check.
//     }
//
//   Game.createSquad() -> squad
//     The single source of truth for a zone's alert phase, shared by every
//     guard patrolling that zone (radar/HUD/music read it later; this cycle
//     only wires guardAI to it). Flat, mutable props:
//       phase      — "INFILTRATION" | "ALERT" | "EVASION" | "CAUTION"
//       phaseTime  — seconds spent in the CURRENT phase; reset to 0 on every
//                    phase transition (mirrors guard.stateTime's convention).
//       lastKnown  — {x,y} | null — the last confirmed/updated sighting of
//                    the player; null only while INFILTRATION and no ALERT
//                    has ever fired (reset to null when CAUTION times out
//                    back to INFILTRATION).
//       alertCount — total number of INFILTRATION/CAUTION -> ALERT
//                    transitions this run (a coarse "how many times did the
//                    player get made" counter). Re-broadcasting while already
//                    ALERT, and EVASION -> ALERT (a contact regained mid-chase,
//                    not a fresh incident), do NOT increment it — only a
//                    transition INTO alert FROM a cooled-down phase
//                    (INFILTRATION or CAUTION) counts as a new alert.
//     Methods:
//       broadcastAlert(x, y) — any guard confirming sight calls this.
//         phase -> ALERT (from any phase), lastKnown = {x,y}, phaseTime reset
//         to 0 IFF this is an actual phase change (i.e. not already ALERT);
//         alertCount++ only when the prior phase was INFILTRATION or CAUTION
//         (see alertCount note above).
//       updateSighting(x, y) — refresh lastKnown while any guard has live
//         LOS, without touching phase/phaseTime/alertCount. Called by a guard
//         in ALERT that currently sees the player.
//       loseContact() — guard-side signal, callable any time a guard
//         personally loses LOS. Intentionally a NO-OP on squad state: the
//         actual ALERT -> EVASION transition is the job of tick() below,
//         which runs once per tick after ALL guards on the squad have
//         updated and therefore is the only thing that can safely know
//         whether ANY guard still has LOS this tick. A single guard's own
//         loseContact() call cannot decide that (a squadmate may still see
//         the player this very tick) — it exists as an honest, named place
//         for guard code (and future callers, e.g. per-guard combat/chatter
//         hooks) to report "I personally lost them," without racing
//         squad-wide state.
//       tick(dt, anyGuardHasLOS) — THE ENGINE (or, meanwhile, whatever test/
//         sim harness drives the guard loop) calls this ONCE PER TICK, AFTER
//         every guard on the squad has had update() called for that tick,
//         passing whether ANY of those guards currently has confirmed LOS on
//         the player (see guard.hasLOS below — anyGuardHasLOS is typically
//         `guards.some(g => g.hasLOS)`). Handles the timer-driven half of the
//         ladder:
//           ALERT, no LOS this tick     -> EVASION (phaseTime reset to 0)
//           EVASION, phaseTime >= 30s   -> CAUTION (phaseTime reset to 0)
//           CAUTION, phaseTime >= 45s   -> INFILTRATION (phaseTime reset to 0,
//                                          lastKnown cleared to null)
//         A fresh sighting during EVASION/CAUTION does NOT go through tick()
//         at all — a guard calls broadcastAlert() directly the instant its
//         own meter re-confirms the player (see guard behavior below), which
//         jumps straight back to ALERT regardless of what tick() would have
//         done that same tick.
//     For a guard created WITHOUT an explicit `squad` dep (see createGuard
//     below), the guard owns a private, internal squad-of-one and calls
//     tick() on it itself, once, at the end of its own update() — safe
//     specifically BECAUSE with exactly one guard on the squad, that guard's
//     own hasLOS for the tick IS the full anyGuardHasLOS aggregate. Multi-
//     guard squads must never let a guard call tick() itself (double-ticks
//     phaseTime and races on partial information) — the external driver loop
//     owns that call, per the contract above. This is exactly the wiring the
//     future engine module will do; see sim.js's "full alert ladder" scenario
//     for the reference loop.
//
//   Game.createGuard({ world, vision, rng, spawn, waypoints, id, squad }) -> guard
//     world, vision, rng, spawn, waypoints, id — unchanged from part A (see
//       below).
//     squad: optional Game.createSquad() instance shared across every guard
//       in the same zone/encounter. Omit it and the guard creates and owns a
//       private squad-of-one internally (see squad contract above) — this is
//       what keeps every part-A test (none of which pass `squad`) passing
//       unchanged: a lone guard's ALERT/EVASION/CAUTION ladder still runs,
//       it's just invisible to anything that doesn't ask for guard.squad.
//     Exposes guard.squad (the squad instance in use, own or shared) so
//     callers that only hold a guard reference can still inspect/pass around
//     the shared phase state.
//
//   world:     a Game.createWorld(...) instance (src/world.js) — consumed via
//              moveCircle/raycast(indirectly through vision)/inRegion/zone.
//   vision:    a Game.createVision({world}) instance (src/vision.js) —
//              consumed via computeSight/tickMeter.
//   rng:       a Game.createRng(seed) instance (src/rng.js). Stored but not
//              required by this module's own logic (all FSM timing/sweeps
//              are deterministic functions of stateTime, not dice rolls);
//              kept in the signature so future pick()-style choices (e.g.
//              random alternate patrol routes) have it available without an
//              API change.
//   spawn:     { x, y } initial position. Defaults to waypoints[0], or
//              world.zone.playerSpawn if no waypoints are given.
//   waypoints: [{x,y}, ...] patrol loop, walked in array order then wrapped
//              (index 0 follows the last). Defaults to world.zone.waypoints.
//              Consecutive waypoints are assumed to have a clear line (no
//              pathfinding this version — see src/world.js zone layout notes).
//   id:        opaque identifier, stored as guard.id (any value, default
//              null). Also hashed (see EVASION below) to derive this guard's
//              deterministic sweep offset — two guards with distinct ids
//              sweep out of phase with each other without any rng or
//              squad-index bookkeeping.
//
//   guard — flat, readable state (mutated in place by update()/hearNoise()):
//     id, x, y                — position (meters, world space)
//     facing                  — radians, 0 = +x, +y down (atan2 convention,
//                                same as player.facing / vision viewer.facing)
//     radius                  — GUARD.RADIUS (constant)
//     state                   — "PATROL" | "SUSPICIOUS" | "INVESTIGATE" |
//                                "ALERT" | "EVASION" | "CAUTION"
//     meter                   — 0..1 detection meter (vision.tickMeter
//                                output); pinned at 1 while state is ALERT
//                                (perception's fill/drain math is skipped
//                                entirely in ALERT — the detection question
//                                is already settled, see ALERT below).
//     stateTime               — seconds spent in the CURRENT state; reset to
//                                0 whenever the state changes
//     stimulus                — {x,y} | null — the point of interest driving
//                                SUSPICIOUS/INVESTIGATE (last sighting or
//                                noise origin); untouched (and irrelevant) in
//                                PATROL/ALERT/EVASION/CAUTION
//     waypointIndex           — index into `waypoints` of the patrol target
//                                (shared between PATROL and CAUTION — see
//                                CAUTION below — so returning to either from
//                                the other resumes the SAME loop position)
//     hasLOS                  — boolean, NEW in part B: true iff THIS guard,
//                                this tick, has the player both in-cone and
//                                unobstructed (vision.computeSight's inCone
//                                && hasLOS). Computed every tick regardless
//                                of state. This is what an external multi-
//                                guard driver reduces over every guard on a
//                                squad (`guards.some(g => g.hasLOS)`) to get
//                                the anyGuardHasLOS argument squad.tick()
//                                needs — see squad.tick() above.
//     squad                   — the Game.createSquad() instance this guard
//                                reports into (own private one, or the shared
//                                one passed to createGuard()). See squad
//                                contract above.
//
//   STATE <-> SQUAD.PHASE MAPPING (the invariant referenced throughout): the
//   relationship is guard.state => squad.phase, NOT the reverse.
//     guard.state === "ALERT"   implies squad.phase === "ALERT"   (always).
//     guard.state === "EVASION" implies squad.phase === "EVASION" (always).
//     guard.state === "CAUTION" implies squad.phase === "CAUTION" (always).
//   The reverse does not hold for CAUTION: squad.phase === "CAUTION" allows
//   guard.state to be "CAUTION" (the default: widened-cone patrol) OR
//   "INVESTIGATE" (a guard mid-response to a strong noise heard while on
//   CAUTION patrol — see hearNoise below — is not yanked back into CAUTION
//   early; it finishes its investigation, then reads squad.phase LIVE at
//   that moment to decide whether to resume CAUTION patrol or, if the
//   squad's CAUTION timer has since expired, ordinary PATROL). squad.phase
//   ALERT/EVASION have no such carve-out: every guard on the squad is forced
//   into the matching state the very next tick regardless of what it was
//   doing (that forcing IS the "radio call" — see ALERT below).
//
//   guard.update(dt, ctx) — ctx = { player }, player satisfying the
//   target/player contract ({x, y, visionProfile()}). Call once per tick
//   (engine uses dt = 1/60). Per tick:
//     0. stateTime += dt, up front (unchanged from part A).
//     1. RADIO CALL / SQUAD-PHASE SYNC (new in part B, runs before
//        perception): if squad.phase is ALERT/EVASION/CAUTION and this
//        guard's own state doesn't already match (subject to the CAUTION/
//        INVESTIGATE carve-out above), force it to match, effective THIS
//        tick (so a freshly-radioed-in guard starts moving immediately
//        rather than losing a tick). If squad.phase has returned to
//        INFILTRATION and this guard is stale in CAUTION/EVASION, force it
//        back to PATROL. This is how guards who never personally saw the
//        player still join the chase the instant a squadmate confirms sight.
//     2. PERCEPTION: viewer = {x: guard.x, y: guard.y, facing: guard.facing},
//        with fovDeg/range overridden to VISION.FOV_DEG*CAUTION_FOV_MULT /
//        VISION.RANGE*CAUTION_RANGE_MULT whenever squad.phase === "CAUTION"
//        (regardless of this guard's own state — including the INVESTIGATE
//        carve-out case above: the whole squad is extra alert while CAUTION
//        holds). sight = vision.computeSight(viewer, ctx.player).
//        guard.hasLOS = sight.inCone && sight.hasLOS (always computed).
//        guard.meter: pinned at 1 if state is ALERT, else
//        vision.tickMeter(guard.meter, sight.factor, dt) as before.
//     3. FSM dispatch on (possibly just-synced) guard.state — see per-state
//        behavior below.
//     4. INVARIANT: after dispatch, if guard.state is SUSPICIOUS or
//        INVESTIGATE and guard.stateTime > GUARD.MAX_STATE_S[guard.state],
//        throws an Error (ALERT's ceiling is Infinity, so it never trips;
//        EVASION/CAUTION aren't in the map at all, per the GUARD.MAX_STATE_S
//        note above).
//     5. If this guard owns a private squad-of-one (no `squad` dep given),
//        it calls squad.tick(dt, guard.hasLOS) on itself here, once, as the
//        very last thing update() does (see squad contract above for why
//        that's safe only in the lone-guard case).
//
//   Per-state behavior:
//     PATROL — unchanged from part A: walks the waypoint loop at
//       GUARD.PATROL_SPEED, pauses GUARD.WAYPOINT_PAUSE seconds at each with
//       a head sweep, and — this only runs while squad.phase is
//       INFILTRATION, since the sync step above forces any other phase's
//       state before PATROL's own dispatch ever sees the wheel — escalates
//       to SUSPICIOUS the instant meter >= VISION.SUSPICIOUS_AT.
//     SUSPICIOUS — unchanged from part A (turns to face `stimulus`, holds
//       GUARD.SUSPICIOUS_STARE seconds, de-escalates to PATROL or advances to
//       INVESTIGATE at the end), EXCEPT: reaching VISION.ALERT_AT now also
//       calls squad.broadcastAlert(ctx.player.x, ctx.player.y) — every path
//       into ALERT goes through a broadcast, not just this one, see below.
//     INVESTIGATE — walks to `stimulus` and searches, same shape as part A,
//       with two part-B additions: (a) reaching VISION.ALERT_AT still
//       escalates straight to ALERT (with a broadcast) UNLESS squad.phase is
//       CAUTION, in which case the escalation threshold is the lower
//       VISION.SUSPICIOUS_AT instead — a guard investigating a noise while
//       the whole squad is already jumpy doesn't need a fully-confirmed
//       sight to call it in, matching the CAUTION escalation rule described
//       under CAUTION below; (b) travel/search speed is GUARD.CAUTION_SPEED
//       instead of GUARD.INVESTIGATE_SPEED, and completing the search
//       returns to state "CAUTION" instead of "PATROL" — in BOTH cases only
//       when squad.phase reads as "CAUTION" AT THAT MOMENT (checked live,
//       every tick / at completion — not latched at entry — so a squad
//       timer expiring mid-investigation is honored immediately/at
//       completion rather than stale). Otherwise (squad.phase
//       INFILTRATION — the only other phase INVESTIGATE can run under, see
//       the state<->phase mapping above) it's identical to part A.
//     ALERT — real pursuit (replaces the part-A placeholder). On entry (via
//       broadcastAlert, called from any of SUSPICIOUS/INVESTIGATE/EVASION/
//       CAUTION the instant this guard's own meter confirms sight): squad
//       phase is now ALERT and every guard on the squad — including ones
//       that never personally saw anything — is forced into state ALERT the
//       next tick (the "radio call", step 1 above). While ALERT:
//         - if this guard currently hasLOS: squad.updateSighting(player.x,
//           player.y) (keeping the shared lastKnown fresh), and it moves
//           toward the player's LIVE position at GUARD.ALERT_SPEED, but
//           never closer than GUARD.ARREST_DIST (the per-tick step is capped
//           to `max(0, dist - ARREST_DIST)` so it can slow to a stop right at
//           the line and — because it re-reads the player's current position
//           every tick — track a moving player while holding that gap; it
//           NEVER overlaps the player by construction). Facing tracks the
//           player continuously. This is where combat lands once the items
//           cycle adds a damage system — for now, reaching ARREST_DIST is
//           the end state: hold position, face them.
//         - if this guard does NOT currently hasLOS: it calls
//           squad.loseContact() (see squad contract — a documented no-op on
//           squad state) and instead converges on squad.lastKnown (the
//           shared last-known point, no ARREST_DIST braking — it's just a
//           location, not the player), at GUARD.ALERT_SPEED, closing all the
//           way to it.
//       guard.meter is pinned at 1 throughout (perception's fill/drain math
//       doesn't run — see step 2 above); ALERT has NO stateTime ceiling
//       (GUARD.MAX_STATE_S.ALERT === Infinity) — it persists for exactly as
//       long as squad.phase says ALERT, which is governed by squad.tick(),
//       not by this guard alone (see EVASION below for how it ends).
//     EVASION — entered only via the radio-call sync (step 1) when
//       squad.phase becomes EVASION (squad.tick() flips ALERT -> EVASION the
//       tick NO guard on the squad has LOS) — never entered directly by a
//       guard's own FSM. While EVASION: converges on squad.lastKnown at
//       GUARD.ALERT_SPEED (no separate "hunting speed" constant is defined
//       for part B, so pursuit speed is reused here — guards rushing the
//       last-known point are just as urgent as an active chase); once within
//       GUARD.ARRIVE_DIST, holds position and does a COORDINATED sweep: each
//       guard's facing oscillates +/-90 degrees around the facing it arrived
//       with, but the oscillation's PHASE is offset by a value derived
//       deterministically from guard.id (a simple string hash mapped to
//       [0, 2*PI) — no rng, no squad-index bookkeeping needed), so two
//       guards converging on the same point look different directions at any
//       given moment instead of mirroring each other. Meanwhile sighting
//       still runs (normal, un-widened vision math — NOT the CAUTION cone),
//       but SUSPICIOUS is skipped entirely: the instant meter reaches the
//       LOWER VISION.SUSPICIOUS_AT threshold (not the usual VISION.ALERT_AT),
//       the guard calls squad.broadcastAlert(player.x, player.y) and jumps
//       straight to ALERT — guards actively hunting don't need to "stare and
//       confirm" the way a routine patrol does. squad.tick() advances
//       squad.phase EVASION -> CAUTION after GUARD.EVASION_S (30s) of no
//       re-sighting.
//     CAUTION — entered only via the radio-call sync (step 1) when
//       squad.phase becomes CAUTION (squad.tick() advances EVASION ->
//       CAUTION after GUARD.EVASION_S). Resumes the waypoint patrol loop —
//       literally the same walk/pause/head-sweep logic as PATROL, sharing
//       waypointIndex so switching between the two never loses the guard's
//       place in the loop — but at GUARD.CAUTION_SPEED (2.0 m/s, brisker
//       than PATROL_SPEED's 1.5: still wary, moving with purpose) and with
//       the WIDENED cone from step 2 (CAUTION_FOV_MULT/CAUTION_RANGE_MULT).
//       Same low-threshold escalation rule as EVASION: meter >=
//       VISION.SUSPICIOUS_AT calls squad.broadcastAlert and jumps straight
//       to ALERT (no SUSPICIOUS detour). A strong noise heard while CAUTION
//       sends the guard to INVESTIGATE (see hearNoise below and the
//       INVESTIGATE note above for how it resumes CAUTION vs PATROL).
//       squad.tick() advances squad.phase CAUTION -> INFILTRATION after
//       GUARD.CAUTION_S (45s) of no re-sighting, at which point this guard's
//       NEXT tick sync (step 1) forces it back to state PATROL at
//       PATROL_SPEED with the normal (un-widened) cone.
//
//   guard.hearNoise(x, y, strength) — external stimulus API. `strength` is
//   "faint" or "strong" (soundEvents.js will call this later; tests/sim call
//   it directly meanwhile):
//     "faint"  — only from PATROL: -> SUSPICIOUS, stimulus = {x,y}.
//     "strong" — from PATROL or SUSPICIOUS: -> INVESTIGATE, stimulus = {x,y},
//                at GUARD.INVESTIGATE_SPEED (squad.phase is necessarily
//                INFILTRATION here, per the state<->phase mapping above).
//                NEW in part B — from CAUTION: -> INVESTIGATE, stimulus =
//                {x,y}, but this time squad.phase is CAUTION, so
//                INVESTIGATE's own live squad.phase check (see INVESTIGATE
//                above) makes it travel/search at GUARD.CAUTION_SPEED and
//                return to CAUTION (not PATROL) afterward, PROVIDED the
//                squad's CAUTION timer hasn't expired in the meantime —a
//                noise is not a confirmed contact, so it doesn't reset the
//                squad's cooldown clock or change squad.phase at all.
//     Any other case (already INVESTIGATE, ALERT, or EVASION) is ignored — a
//     guard already closing in on (or standing over) something isn't
//     distracted by a second noise, and ALERT/EVASION never react to
//     anything but the confirmed target (their own meter, checked every
//     tick, is what escalates them — see ALERT/EVASION above).
//
// Local tuning constants below (TURN_RATE, *_SWEEP_HZ) are NOT part of the
// public Game.GUARD contract — they govern the shape of facing animation only
// (how fast a guard turns, how fast its head sweep/search/evasion-sweep
// oscillates) and carry no externally-observable timing guarantee beyond
// "facing changes over time, deterministically, given dt." The EVASION sweep
// PHASE OFFSET (derived from guard.id) is likewise a local implementation
// detail of how "staggered" is achieved, not a contract guarantee of any
// particular offset value — only that distinct ids produce distinct offsets.
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

  // Deterministic string hash -> [0, 1). FNV-1a variant; no rng, no
  // Math.random — purely a function of the id's characters, so identical ids
  // always yield identical offsets (and, in practice, distinct ids yield
  // well-spread distinct offsets). Used only to derive EVASION's sweep phase
  // offset (see file header) — never exposed, never part of the contract.
  function hashToUnit(value) {
    var s = value === null || value === undefined ? "" : String(value);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
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
    EVASION_S: 30,
    CAUTION_S: 45,
    ALERT_SPEED: 3.2,
    ARREST_DIST: 2.0,
    CAUTION_FOV_MULT: 1.3,
    CAUTION_RANGE_MULT: 1.2,
    CAUTION_SPEED: 2.0,
    MAX_STATE_S: { SUSPICIOUS: 4.0, INVESTIGATE: 30.0, ALERT: Infinity },
  };

  // Local-only tuning (not part of the public contract, see file header).
  var TURN_RATE = 3; // rad/s, SUSPICIOUS turning-to-face-stimulus rate
  var PAUSE_SWEEP_HZ = 1.5; // oscillations/sec-ish for the waypoint head sweep
  var SEARCH_SWEEP_HZ = 0.5; // oscillations/sec-ish for the investigate/evasion sweep
  var EVASION_SWEEP_AMPLITUDE = Math.PI / 2; // +/-90 degrees

  // ---- squad factory -----------------------------------------------------

  function createSquad() {
    var squad = {
      phase: "INFILTRATION",
      phaseTime: 0,
      lastKnown: null,
      alertCount: 0,
    };

    function broadcastAlert(x, y) {
      if (squad.phase !== "ALERT") {
        if (squad.phase === "INFILTRATION" || squad.phase === "CAUTION") {
          squad.alertCount++;
        }
        squad.phase = "ALERT";
        squad.phaseTime = 0;
      }
      squad.lastKnown = { x: x, y: y };
    }

    function updateSighting(x, y) {
      squad.lastKnown = { x: x, y: y };
    }

    // See file header — intentionally a no-op on squad state. The real
    // ALERT -> EVASION transition happens in tick(), which alone has the
    // full-squad picture needed to know whether ANY guard still has LOS.
    function loseContact() {}

    function tick(dt, anyGuardHasLOS) {
      squad.phaseTime += dt;
      switch (squad.phase) {
        case "ALERT":
          if (!anyGuardHasLOS) {
            squad.phase = "EVASION";
            squad.phaseTime = 0;
          }
          break;
        case "EVASION":
          if (squad.phaseTime >= GUARD.EVASION_S) {
            squad.phase = "CAUTION";
            squad.phaseTime = 0;
          }
          break;
        case "CAUTION":
          if (squad.phaseTime >= GUARD.CAUTION_S) {
            squad.phase = "INFILTRATION";
            squad.phaseTime = 0;
            squad.lastKnown = null;
          }
          break;
        default:
          break; // INFILTRATION: nothing to do, broadcastAlert is the only exit.
      }
    }

    squad.broadcastAlert = broadcastAlert;
    squad.updateSighting = updateSighting;
    squad.loseContact = loseContact;
    squad.tick = tick;
    return squad;
  }

  // ---- guard factory ----------------------------------------------------------

  function createGuard(deps) {
    var world = deps.world;
    var vision = deps.vision;
    var rng = deps.rng;
    var waypoints = deps.waypoints || (world.zone && world.zone.waypoints) || [];
    var spawn =
      deps.spawn || waypoints[0] || (world.zone && world.zone.playerSpawn) || { x: 0, y: 0 };

    // Own a private squad-of-one when the caller doesn't share one — see the
    // squad contract in the file header for why the lone-guard case can
    // safely self-drive squad.tick() while a shared squad must not be.
    var ownSquad = !deps.squad;
    var squad = deps.squad || createSquad();

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
      hasLOS: false,
      squad: squad,
    };

    // Internal sub-state, not part of the public contract (flat props listed
    // in the file header are the guard's full observable surface; these back
    // the pause/search/sweep animations and are reset by setState()).
    var pausing = false;
    var pauseTime = 0;
    var pauseBaseFacing = 0;
    var searching = false;
    var searchTime = 0;
    var searchBaseFacing = 0;
    var sweeping = false;
    var sweepTime = 0;
    var sweepBaseFacing = 0;
    var sweepOffset = hashToUnit(guard.id) * TWO_PI;

    function setState(newState, stimulus) {
      guard.state = newState;
      guard.stateTime = 0;
      if (stimulus) guard.stimulus = { x: stimulus.x, y: stimulus.y };
      if (newState === "PATROL" || newState === "CAUTION") {
        pausing = false;
        pauseTime = 0;
      }
      if (newState === "INVESTIGATE") {
        searching = false;
        searchTime = 0;
      }
      if (newState === "EVASION") {
        sweeping = false;
        sweepTime = 0;
        // ALERT pins meter at 1 as a placeholder "detection settled" value
        // (see ALERT contract note) rather than tracking a real fill/decay
        // level. Carrying that stale 1.0 into EVASION would instantly trip
        // EVASION's much lower SUSPICIOUS_AT escalation threshold on the very
        // tick contact is lost, bouncing straight back to ALERT. Reset it so
        // EVASION starts from a clean, real meter that only rises on an
        // actual fresh sighting.
        guard.meter = 0;
      }
    }

    // ---- PATROL / CAUTION (shared waypoint-loop movement) ----------------------
    // Identical walk/pause/head-sweep machinery, parameterized only by speed;
    // the two callers (PATROL and CAUTION dispatch below) differ solely in
    // speed and in what a SUSPICIOUS_AT-or-above meter does next.

    function tickPatrolLike(dt, speed) {
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
          var stepLen = Math.min(speed * dt, d);
          var ux = (wp.x - guard.x) / d;
          var uy = (wp.y - guard.y) / d;
          var res = world.moveCircle(guard.x, guard.y, ux * stepLen, uy * stepLen, guard.radius);
          guard.x = res.x;
          guard.y = res.y;
          guard.facing = Math.atan2(wp.y - guard.y, wp.x - guard.x);
        }
      }
    }

    function waypointIndex_advance() {
      if (waypoints.length > 0) {
        guard.waypointIndex = (guard.waypointIndex + 1) % waypoints.length;
      }
    }

    // ---- SUSPICIOUS -------------------------------------------------------------

    function tickSuspicious(dt, ctx) {
      var stim = guard.stimulus;
      if (stim) {
        var targetAngle = Math.atan2(stim.y - guard.y, stim.x - guard.x);
        guard.facing = turnToward(guard.facing, targetAngle, TURN_RATE, dt);
      }

      if (guard.meter >= Game.VISION.ALERT_AT) {
        squad.broadcastAlert(ctx.player.x, ctx.player.y);
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

    function tickInvestigate(dt, ctx) {
      var caution = squad.phase === "CAUTION";
      var alertThreshold = caution ? Game.VISION.SUSPICIOUS_AT : Game.VISION.ALERT_AT;
      if (guard.meter >= alertThreshold) {
        squad.broadcastAlert(ctx.player.x, ctx.player.y);
        setState("ALERT", null);
        return;
      }

      var speed = caution ? GUARD.CAUTION_SPEED : GUARD.INVESTIGATE_SPEED;
      var stim = guard.stimulus || { x: guard.x, y: guard.y };
      var d = distance(guard.x, guard.y, stim.x, stim.y);

      if (d > GUARD.ARRIVE_DIST) {
        var stepLen = Math.min(speed * dt, d);
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
          // Read squad.phase LIVE at completion (not latched at entry) — see
          // file header: a squad timer that expired mid-search is honored
          // immediately.
          setState(squad.phase === "CAUTION" ? "CAUTION" : "PATROL", null);
        }
      }
    }

    // ---- ALERT (real pursuit — see file header) ---------------------------------

    function tickAlert(dt, ctx) {
      var target;
      if (guard.hasLOS) {
        squad.updateSighting(ctx.player.x, ctx.player.y);
        target = { x: ctx.player.x, y: ctx.player.y };
      } else {
        squad.loseContact();
        target = squad.lastKnown || { x: guard.x, y: guard.y };
      }

      var d = distance(guard.x, guard.y, target.x, target.y);
      var stepLen = guard.hasLOS
        ? Math.min(GUARD.ALERT_SPEED * dt, Math.max(0, d - GUARD.ARREST_DIST))
        : Math.min(GUARD.ALERT_SPEED * dt, d);

      if (stepLen > 0) {
        var ux = (target.x - guard.x) / d;
        var uy = (target.y - guard.y) / d;
        var res = world.moveCircle(guard.x, guard.y, ux * stepLen, uy * stepLen, guard.radius);
        guard.x = res.x;
        guard.y = res.y;
      }
      // Face the target every tick, even when holding at ARREST_DIST or when
      // d rounds to 0 (atan2(0,0) is a harmless 0, no NaN risk here since
      // target/guard positions are always finite).
      guard.facing = Math.atan2(target.y - guard.y, target.x - guard.x);
    }

    // ---- EVASION (coordinated sweep — see file header) --------------------------

    function tickEvasion(dt, ctx) {
      if (guard.meter >= Game.VISION.SUSPICIOUS_AT) {
        squad.broadcastAlert(ctx.player.x, ctx.player.y);
        setState("ALERT", null);
        return;
      }

      var target = squad.lastKnown || { x: guard.x, y: guard.y };
      var d = distance(guard.x, guard.y, target.x, target.y);

      if (d > GUARD.ARRIVE_DIST) {
        sweeping = false; // reset so the sweep starts fresh once arrived
        var stepLen = Math.min(GUARD.ALERT_SPEED * dt, d);
        var ux = (target.x - guard.x) / d;
        var uy = (target.y - guard.y) / d;
        var res = world.moveCircle(guard.x, guard.y, ux * stepLen, uy * stepLen, guard.radius);
        guard.x = res.x;
        guard.y = res.y;
        guard.facing = Math.atan2(target.y - guard.y, target.x - guard.x);
      } else {
        if (!sweeping) {
          sweeping = true;
          sweepTime = 0;
          sweepBaseFacing = guard.facing;
        }
        sweepTime += dt;
        var sweep =
          EVASION_SWEEP_AMPLITUDE * Math.sin(sweepTime * SEARCH_SWEEP_HZ * TWO_PI + sweepOffset);
        guard.facing = normalizeAngle(sweepBaseFacing + sweep);
      }
    }

    // ---- update / hearNoise -------------------------------------------------------

    function update(dt, ctx) {
      guard.stateTime += dt;

      // 1. Radio call / squad-phase sync (see file header) — forces this
      // guard's state to match a squad-wide ALERT/EVASION/CAUTION phase,
      // with the CAUTION+INVESTIGATE carve-out for a noise-driven interrupt.
      var phase = squad.phase;
      if (phase === "ALERT" && guard.state !== "ALERT") {
        setState("ALERT", null);
      } else if (phase === "EVASION" && guard.state !== "EVASION") {
        setState("EVASION", null);
      } else if (
        phase === "CAUTION" &&
        guard.state !== "CAUTION" &&
        guard.state !== "INVESTIGATE"
      ) {
        setState("CAUTION", null);
      } else if (phase === "INFILTRATION" && (guard.state === "CAUTION" || guard.state === "EVASION")) {
        setState("PATROL", null);
      }

      // 2. Perception — widened cone while the squad is CAUTION, regardless
      // of this particular guard's own state (see file header).
      var caution = squad.phase === "CAUTION";
      var viewer = {
        x: guard.x,
        y: guard.y,
        facing: guard.facing,
        fovDeg: caution ? Game.VISION.FOV_DEG * GUARD.CAUTION_FOV_MULT : undefined,
        range: caution ? Game.VISION.RANGE * GUARD.CAUTION_RANGE_MULT : undefined,
      };
      var sight = vision.computeSight(viewer, ctx.player);
      guard.hasLOS = sight.inCone && sight.hasLOS;

      if (guard.state === "ALERT") {
        guard.meter = 1;
      } else {
        guard.meter = vision.tickMeter(guard.meter, sight.factor, dt);
      }

      // 3. FSM dispatch.
      switch (guard.state) {
        case "PATROL":
          tickPatrolLike(dt, GUARD.PATROL_SPEED);
          if (guard.meter >= Game.VISION.SUSPICIOUS_AT) {
            setState("SUSPICIOUS", { x: ctx.player.x, y: ctx.player.y });
          }
          break;
        case "SUSPICIOUS":
          tickSuspicious(dt, ctx);
          break;
        case "INVESTIGATE":
          tickInvestigate(dt, ctx);
          break;
        case "ALERT":
          tickAlert(dt, ctx);
          break;
        case "EVASION":
          tickEvasion(dt, ctx);
          break;
        case "CAUTION":
          tickPatrolLike(dt, GUARD.CAUTION_SPEED);
          if (guard.meter >= Game.VISION.SUSPICIOUS_AT) {
            squad.broadcastAlert(ctx.player.x, ctx.player.y);
            setState("ALERT", null);
          }
          break;
      }

      // 4. Stuck-state invariant (unchanged shape from part A; see
      // GUARD.MAX_STATE_S note in the file header for why EVASION/CAUTION
      // are absent from the map and ALERT is Infinity).
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

      // 5. Lone-guard self-driven squad tick — see squad contract in the
      // file header for why this is only safe when this guard IS the whole
      // squad.
      if (ownSquad) {
        squad.tick(dt, guard.hasLOS);
      }
    }

    function hearNoise(x, y, strength) {
      if (guard.state === "ALERT" || guard.state === "EVASION") return;
      if (strength === "faint") {
        if (guard.state === "PATROL") setState("SUSPICIOUS", { x: x, y: y });
      } else if (strength === "strong") {
        if (
          guard.state === "PATROL" ||
          guard.state === "SUSPICIOUS" ||
          guard.state === "CAUTION"
        ) {
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
  Game.createSquad = createSquad;
  Game.GUARD = GUARD;
  if (typeof module !== "undefined")
    module.exports = { createGuard: createGuard, createSquad: createSquad, GUARD: GUARD };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
