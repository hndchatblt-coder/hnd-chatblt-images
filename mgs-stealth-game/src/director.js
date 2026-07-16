// src/director.js
// PUBLIC API:
//   ZONE SECURITY SYSTEMS + ESCALATION DIRECTION: this module currently owns
//   wall-mounted security CAMERAS (see CAMERA SCHEMA below). It is named
//   "director," not "cameras," because a future cycle is expected to extend
//   it with reinforcement call-ins / guard check-in timers under the same
//   umbrella — a director decides how the FACILITY escalates as a whole,
//   distinct from guardAI.js (how one individual guard perceives/reacts) and
//   squad (the shared alert-phase state machine both guards and cameras
//   report into, owned by src/guardAI.js's Game.createSquad).
//
//   CAMERA SCHEMA (zone data — src/world.js's zone.cameras[], OPTIONAL, absent
//   or empty on zones with no camera coverage, e.g. loadingDock):
//     { x, y, facing, sweepDeg, sweepPeriodS, fovDeg, range }
//       x, y         — world meters, the wall-mounted camera's FIXED position
//                      (never moves — this is a security camera, not a guard).
//       facing       — radians (atan2 convention: 0 = +x, +y down, same as
//                      player.facing/guard.facing), the CENTER of the
//                      camera's sweep, not its current (time-varying) pan
//                      angle.
//       sweepDeg     — full arc, in degrees, the camera pans across, centered
//                      on `facing` (current pan angle swings +/- sweepDeg/2).
//       sweepPeriodS — seconds for one full sinusoidal sweep cycle (pan
//                      angle = facing at t=0, sweeps to +sweepDeg/2 at a
//                      quarter period, back through facing at a half period,
//                      to -sweepDeg/2 at three-quarters, back to facing at a
//                      full period — see tickCameras below).
//       fovDeg, range — the camera's OWN vision cone width/reach, handed to
//                      vision.computeSight as viewer.fovDeg/viewer.range —
//                      same opt-override mechanism guardAI's CAUTION-widened
//                      cone already uses (see src/vision.js's viewer contract
//                      and src/guardAI.js's own CAUTION note).
//
//   Game.createDirector({ world, vision, squad }) -> director
//     world  — a Game.createWorld(zoneData) instance. director reads
//              world.zone.cameras (defaulting to [] when absent/undefined)
//              EXACTLY ONCE, at construction — a fixed roster for this
//              director's lifetime, same "rebuild on zone change" contract
//              guards/squad already have (see src/engine.js's switchZone —
//              a zone transition is expected to construct a FRESH director
//              for the target zone, same as it builds fresh guards/squad,
//              never mutate/reuse an old one).
//     vision — a Game.createVision({ world: <the SAME world above> })
//              instance. Consumed read-only via vision.computeSight and
//              vision.tickMeter — the EXACT SAME two calls guardAI.js makes
//              for its own guards (see src/vision.js's contract for both);
//              a camera is "just another viewer" from vision.js's point of
//              view, sharing the identical fill/drain/darkness/proximity
//              math every guard already uses.
//     squad  — the Game.createSquad() instance shared with this zone's
//              guards. director calls squad.broadcastAlert(x, y) directly
//              on a confirmed camera sighting (see tickCameras below) — the
//              EXACT SAME call a guard makes on ITS OWN confirmed sighting
//              (src/guardAI.js's ALERT escalation). A camera alert is
//              indistinguishable to squad/guards from a guard's own
//              sighting: same phase flip, same alertCount rule, same
//              lastKnown update — see guardAI.js's squad contract.
//
//   director.tickCameras(dt, ctx) -> [ { type, cameraIndex }, ... ]
//     ctx = { time, chaffUntil, player } — a SLIM per-tick context THE ENGINE
//     builds and hands in every tick (director never reaches into a live
//     `engine` instance itself — kept decoupled/unit-testable exactly like
//     guardAI's own ctx.player convention):
//       time       — engine.time (seconds of sim time so far), READ ONLY —
//                    director holds NO clock of its own. The pan-angle
//                    formula below is a pure function of this single value,
//                    so two engines fed identical time sequences (which a
//                    fixed 60Hz tick loop always produces) compute IDENTICAL
//                    camera pan angles and, given identical dt/player
//                    sequences, identical meters — see DETERMINISM below.
//       chaffUntil — engine.chaffUntil (an absolute sim-time deadline; see
//                    src/engine.js's CHAFF VERB / src/items.js's CHAFF_S).
//                    A camera is DISABLED for this tick iff
//                    chaffUntil > time — the EXACT SAME condition
//                    src/radar.js's own chaffActive already checks (not a
//                    second parallel timer — honoring src/items.js's own
//                    "CAMERA HOOK" note that a future camera should gate off
//                    this SAME signal).
//       player     — THE PERCEPTION TARGET, already wrapped by THE ENGINE for
//                    box/locker gating EXACTLY the same way it wraps the
//                    target handed to every guard.update() call this same
//                    tick (see src/engine.js's GUARD PERCEPTION GATE / BOX
//                    PERCEPTION notes: a hidden player becomes the
//                    -9999,-9999 decoy; a boxed player keeps its real x/y
//                    but a visionProfile() discounted to Game.ITEMS.BOX_FACTOR
//                    while stationary, a flat 1.0 the instant it moves).
//                    director is DELIBERATELY IGNORANT of which wrapping (if
//                    any) is in effect — it calls
//                    vision.computeSight(viewer, ctx.player) exactly like
//                    guardAI.js calls vision.computeSight(viewer, ctx.player)
//                    with its own ctx.player, and the ENGINE is the ONLY
//                    place that ever decides what object that is. This is
//                    what "reuse the same wrapped target" means in practice:
//                    ONE wrapping decision per tick, shared by every viewer
//                    (every guard AND every camera) in the zone.
//
//     Per camera i (in world.zone.cameras order):
//       panAngle = camera.facing +
//         sin(2*PI*ctx.time / camera.sweepPeriodS) * (camera.sweepDeg in
//         radians)/2
//       — deterministic given ctx.time; bounded to EXACTLY
//         [facing - sweepDeg/2 (in rad), facing + sweepDeg/2 (in rad)] over a
//         full period, since sin ranges over [-1, 1].
//
//       disabled = ctx.chaffUntil > ctx.time. While disabled: NO perception
//         happens this tick for this camera — the stored meter is FROZEN
//         (neither vision.tickMeter's fill NOR its drain runs; whatever the
//         meter was on the last non-disabled tick is left EXACTLY as-is) and
//         no cameraSuspicious/cameraAlert can fire, no matter where the
//         player stands or moves this tick. cameraStates() still reports the
//         freshly-computed panAngle (the housing keeps "moving" cosmetically
//         even while blind — only its ability to SEE is cut) and
//         disabled: true, for src/render.js/src/radar.js's dark/off styling.
//
//       Otherwise (not disabled): viewer = { x: camera.x, y: camera.y,
//         facing: panAngle, fovDeg: camera.fovDeg, range: camera.range };
//         sight = vision.computeSight(viewer, ctx.player); this camera's
//         meter = vision.tickMeter(<its previous meter>, sight.factor, dt) —
//         IDENTICAL integration shape to guardAI's own per-guard meter (see
//         src/vision.js's tickMeter contract) — just with the camera itself
//         standing in as the viewer instead of a patrolling guard.
//
//         Two escalation checks run against the FRESH meter value, in this
//         order:
//           - SUSPICIOUS (EDGE-TRIGGERED — "once per crossing," never once
//             per tick spent above the line): if meter >= Game.VISION.
//             SUSPICIOUS_AT AND it was BELOW that line on this camera's
//             PREVIOUS non-disabled tick, pushes
//             { type: "cameraSuspicious", cameraIndex: i } onto the returned
//             array. Fires again on a LATER re-crossing (meter drains back
//             below SUSPICIOUS_AT once the player breaks the cone, then
//             refills past it again) — each rising edge is its own event,
//             this is not a one-shot-per-camera-ever latch.
//           - ALERT (LEVEL-TRIGGERED — fires EVERY non-disabled tick the
//             meter reads >= Game.VISION.ALERT_AT, not just on the initial
//             crossing): calls squad.broadcastAlert(ctx.player.x,
//             ctx.player.y) and pushes { type: "cameraAlert",
//             cameraIndex: i } onto the returned array. Deliberately NOT
//             edge-only — a camera with a continuous, unbroken view of the
//             player is a live security feed, not a single tattling ping: it
//             keeps refreshing squad.lastKnown to the player's CURRENT
//             position for as long as it holds sight, the same way a guard's
//             own continuous hasLOS (via engine.js's anyLOS reduction) keeps
//             squad.phase pinned in ALERT. Repeated calls are harmless to
//             squad state beyond that refresh: broadcastAlert is a
//             documented no-op on squad.phase/alertCount once already ALERT
//             (see guardAI.js's squad contract) — it only overwrites
//             lastKnown, never double-counts alertCount. CAMERAS DO NOT
//             SUSTAIN ALERT BY THEMSELVES, though: src/engine.js's own
//             anyLOS (the sole input to squad.tick()'s ALERT -> EVASION
//             timer) is computed ONLY from guards.some(g => g.hasLOS) — see
//             its contract — cameras are DELIBERATELY EXCLUDED from that
//             reduction (see src/engine.js's file header, "cameras
//             contribute to anyLOS? DECISION: no"). So even a camera with
//             an unbroken view will not stop the squad's ALERT phase timer
//             from expiring into EVASION after GUARD.EVASION_S if no GUARD
//             ever gets its own LOS — camera coverage starts the manhunt and
//             keeps intel fresh while it lasts, it does not substitute for a
//             guard's own eyes in sustaining ALERT. This is intentional MGS
//             behavior, not a gap: "the camera spotted you, guards come
//             looking" (see src/engine.js's own note, same wording).
//
//     Returns the array of { type, cameraIndex } objects fired THIS CALL
//     (possibly empty) — director never touches an `events` array itself (it
//     doesn't own one). THE ENGINE is what pushes these onto its own
//     engine.events, exactly as it already does for every other event this
//     codebase's sibling modules report (same "returns facts, engine
//     narrates" split as src/items.js's fireTranq/useRation/useChaff).
//
//   director.cameraStates() -> [ { x, y, panAngle, disabled, meter, fovDeg,
//     range }, ... ], one entry per world.zone.cameras, same order. PURE
//     SNAPSHOT — reads back exactly what the MOST RECENT tickCameras(dt, ctx)
//     call computed (x/y/fovDeg/range are the camera's own static schema
//     fields, copied through unchanged every call; panAngle/disabled/meter
//     are the per-tick state tickCameras just wrote). Calling this before
//     tickCameras has ever run reports each camera at its construction-time
//     default (panAngle === camera.facing, disabled false, meter 0). Used by
//     src/render.js (3D cone fans + housing) and src/radar.js (2D wedge +
//     dot) — see both files' own contracts for how they consume this.
//
// DETERMINISM: no Math.random, no Date.now, no internal clock — every
// camera's pan angle is a pure function of ctx.time; every meter update a
// pure function of dt/ctx.player fed through vision.js's own pure functions.
// Two engines ticked with identical seeds/inputs produce byte-identical
// camera meters tick-for-tick (see tests/cameras.test.js's determinism test)
// — the same guarantee the rest of the engine already provides for
// guards/squad/player.
//
// ---------------------------------------------------------------------------
// LASERS (NEW — Laboratory cycle): a completely separate security system
// from cameras, sharing this module only because "director" means "however
// this facility escalates" (see the top of this file). A laser is a
// TRIPWIRE, not a perception cone — no vision.js involvement at all, no
// meter, no SUSPICIOUS/ALERT ladder of its own: it either catches the player
// mid-crossing or it doesn't.
//
// LASER SCHEMA (zone data — src/world.js's zone.lasers[], OPTIONAL, absent or
// empty on zones with none):
//   { x1, y1, x2, y2, periodS, dutyOn }
//     x1,y1 -> x2,y2 — the beam's fixed endpoints, world meters. Never moves.
//     periodS  — seconds per full on/off duty cycle.
//     dutyOn   — fraction (0..1) of each cycle the beam is ACTIVE (visible/
//                dangerous), starting from t=0 of each cycle.
//
// ACTIVE FORMULA — deterministic, a pure function of ctx.time, same
// "no clock of its own" posture as camera pan angle above:
//   phase  = (ctx.time / periodS) % 1
//   active = phase < dutyOn
//
// director.tickLasers(dt, ctx) -> [ { type: "laserTripped", laserIndex }, ... ]
//   ctx = { time, prevX, prevY, x, y, playerHidden } — ANOTHER slim per-tick
//   context THE ENGINE builds (director never reaches into a live `engine`):
//     time         — engine.time, same role as tickCameras' ctx.time.
//     prevX, prevY — the player's REAL x,y at the START of this tick, i.e.
//                    BEFORE player.update() ran (see src/engine.js's own
//                    LASERS step for exactly where this is captured).
//     x, y         — the player's REAL x,y AFTER player.update() this tick
//                    (and after any locker-exit step, drag-follow, etc. that
//                    already landed earlier in the tick — whatever the
//                    player's settled position is by the time this runs).
//                    REAL, not the box/locker-DECOY-wrapped `perceivedPlayer`
//                    every guard/camera gets fed — see BOXED / HIDDEN below
//                    for why that distinction matters here.
//     playerHidden — engine.playerHidden verbatim. See HIDDEN below.
//
//   Per laser i (in world.zone.lasers order):
//     phase/active computed per the ACTIVE FORMULA above — this ALWAYS runs,
//     regardless of playerHidden, so laserStates()'s `active` flag (used by
//     render/radar to blink the beam) stays live even while the player is
//     tucked in a locker; a laser doesn't care whether anyone is nearby to
//     trip it.
//
//     While active: a CROSSING TEST — does the player's movement segment
//     THIS TICK, (ctx.prevX,ctx.prevY)->(ctx.x,ctx.y), intersect the beam
//     segment (x1,y1)->(x2,y2)? Plain segment-segment intersection (see
//     segIntersect below) — a degenerate zero-length movement segment (the
//     player didn't move, or is frozen — see HIDDEN below) never intersects
//     anything, by construction of that test.
//
//     CROSSING FOUND -> INSTANT squad.broadcastAlert(ctx.x, ctx.y) (the EXACT
//     SAME call a guard's own confirmed sighting or a camera's ALERT-level
//     meter makes — a laser trip is indistinguishable to squad/guards from
//     any other confirmed contact: same phase flip, same alertCount rule,
//     same lastKnown update) and pushes { type: "laserTripped", laserIndex: i
//     } onto the returned array. Unlike cameras' SUSPICIOUS/ALERT two-stage
//     ladder, a laser has exactly one outcome: instant, full alert — there is
//     no meter to fill first (SPEC: it's a tripwire, not a sensor).
//
//   BOXED PLAYER DOES NOT PROTECT (documented, not a gap): tickLasers is
//   handed the player's REAL x/y (see ctx.x/y above), never the box-discount-
//   wrapped `perceivedPlayer` guards/cameras get. A laser beam is a dumb
//   photoelectric tripwire, not a set of eyes to fool with a cardboard
//   disguise — cardboard blocks light exactly as well standing up as lying
//   down, i.e. not at all. Crossing one in a box trips it exactly the same
//   as crossing it bare.
//
//   HIDDEN (locker) DOES protect, but only because there is nothing left TO
//   cross: while engine.playerHidden, src/engine.js's own FROZEN INPUT
//   already zeroes player movement (see its LOCKER VERB contract), so
//   ctx.prevX===ctx.x and ctx.prevY===ctx.y most ticks anyway — a zero-length
//   segment never crosses a beam. ctx.playerHidden is still threaded through
//   and checked EXPLICITLY here (crossing test skipped outright whenever it's
//   true) as belt-and-suspenders for the one edge case where the player
//   isn't perfectly stationary that tick (the single tick a G-press steps
//   the player 1m out of a locker mid-tick — see src/engine.js's LOCKER VERB
//   EXIT step) — a player who was hidden for the ENTIRETY of the movement
//   that produced ctx.x/y should never be judged by a laser for it.
//
//   CHAFF DOES NOT DISABLE LASERS (documented, not a gap): unlike cameras
//   (gated off ctx.chaffUntil > ctx.time, see tickCameras above), tickLasers
//   never receives or checks a chaffUntil value at all. A laser is a passive
//   photoelectric beam, not an optical sensor a bloom of chaff static can
//   blind — there is nothing about a laser's tripwire for chaff to jam.
//
// director.laserStates() -> [ { x1, y1, x2, y2, active, periodS, dutyOn },
//   ... ], one entry per world.zone.lasers, same order. PURE SNAPSHOT (same
//   convention as cameraStates() above) — x1/y1/x2/y2/periodS/dutyOn are the
//   laser's own static schema fields, copied through unchanged; `active` is
//   the most recent tickLasers(dt, ctx) call's computed value (or false,
//   before tickLasers has ever run). Used by src/render.js (bright red beam
//   line, blinking on/off with the duty cycle) and src/radar.js (same, 2D).
//
// LASER DETERMINISM: same guarantee as cameras — `active` is a pure function
// of ctx.time, the crossing test a pure function of ctx.prevX/Y/x/y, no
// Math.random/Date/internal clock anywhere in this section either.
//
// ---------------------------------------------------------------------------
// ESCALATION (NEW — reinforcements + radio check-ins cycle): the two
// guard-escalation features SPEC.md had hedged as "director module —
// pending". Both live here because both are facility-wide decisions no
// single guard/camera/laser can make alone — exactly this file's own
// "director decides how the FACILITY escalates as a whole" charter from the
// top of the file.
//
// Game.createDirector({ world, vision, squad, rng }) -> director — `rng` is
// NEW this cycle (cameras/lasers never needed one): the SAME Game.createRng
// instance engine.js hands every guard (see guardAI.js's own rng contract,
// "single source of randomness for the whole game" rule) — a spawned
// reinforcement guard (see REINFORCEMENTS below) is a REAL Game.createGuard
// whose own ALERT fire-accuracy roll needs a live rng, so director must be
// able to hand it one. Omitting `rng` is only safe for a director that never
// actually spawns a reinforcement (e.g. every pre-existing cameras.test.js
// construction, which never calls tickEscalation at all) — reachable but not
// exercised by anything shipped before this cycle.
//
// GUARDDOOR SCHEMA (zone data — src/world.js's zone.guardDoor, OPTIONAL,
// {x,y}): the single perimeter spawn point reinforcements pour in from for
// THIS zone. Read ONCE at construction (same "fixed for this director's
// lifetime" contract as cameras/lasers above). A zone with no guardDoor
// (defensive only — every zone this cycle ships one) simply never spawns
// reinforcements; REINFORCEMENTS below no-ops rather than throwing.
//
// director.tickEscalation(dt, ctx) -> [ { type, ... }, ... ]
//   ctx = { time, guards } — another slim per-tick context THE ENGINE builds:
//     time   — engine.time, same READ-ONLY role as tickCameras'/tickLasers'
//              own ctx.time (director holds no clock of its own anywhere in
//              this file, and this section is no exception).
//     guards — THE ENGINE's OWN LIVE `guards` ARRAY, the exact same object
//              engine.guards points at (not a copy). REINFORCEMENTS below
//              relies on this: a spawned guard is pushed directly onto
//              ctx.guards, which mutates engine's own array in place — engine
//              never needs to notice/splice anything itself, and anything
//              that reads engine.guards fresh each frame (render.js/radar.js,
//              per this cycle's own investigation — see FILES YOU MAY TOUCH)
//              picks the new guard up for free, zero changes needed there.
//
// ---- RADIO CHECK-INS (SPEC: "missed 40s radio check-ins from patrol
// buddies") ------------------------------------------------------------------
// Every guard checks in on a private, deterministic 40s cycle, STAGGERED by
// its own position in ctx.guards (guard index i's check-ins land at
// i*5s, i*5s+40s, i*5s+80s, ... — 5s-per-index spacing comfortably separates
// up to 8 guards inside one 40s window, well above the heaviest roster this
// game ships, commsTower's 4 + 3 reinforcements = 7). A guard SLEEPING at the
// moment its own check-in lands MISSED it.
//
// PURE-FUNCTION SCHEDULE (deliberate — see DETERMINISM/SAVE-RESTORE note
// below): a guard's check-in boundaries are NOT tracked via a stored
// "next check-in at" timestamp seeded from whenever this director happened to
// first tick. They are recomputed FRESH, every tick, straight from
// (ctx.time, dt, index) — floor((ctx.time - offset)/40) vs the same formula
// one dt earlier; a check-in landed THIS tick iff that quotient just
// increased. Two directors fed the identical ctx.time sequence compute the
// IDENTICAL schedule for a guard at the same array index, independent of
// when either director itself was constructed — see the note below for why
// that independence specifically matters.
//
// ONE MISSED CHECK-IN -> ONE DISPATCH (SPEC: "only one active search per
// missed guard; repeats every 40s while still missing"): on a landed
// check-in for a SLEEPING guard, if no dispatched searcher is already
// mid-INVESTIGATE for it, this picks the NEAREST awake guard whose OWN state
// is exactly "PATROL" (not SUSPICIOUS/INVESTIGATE/CAUTION/ALERT/EVASION —
// only an idle patrol has a free hand) and calls searcher.hearNoise(missing
// guard's CURRENT x/y, "strong") — the EXACT SAME stimulus mechanism a
// gunshot/knock/dart-impact already uses (see src/guardAI.js's hearNoise
// contract), sending an ordinary PATROL guard into its OWN unmodified
// INVESTIGATE state at that position. No new guardAI.js machinery is needed
// for what happens next — INVESTIGATE's existing travel-then-search-then-
// resume loop, and its existing per-tick COLLEAGUE DISCOVERY check (see
// guardAI.js's own contract — runs for PATROL/SUSPICIOUS/INVESTIGATE/
// CAUTION), already implement exactly "find the body -> broadcastAlert -> ALERT
// (if it's lying in the open)" and "search near a HIDDEN body, time out, walk
// away, no alert" (see guardAI's HIDDEN-BODY EXEMPTION) verbatim. This is the
// deliberate design choice named in the task brief: the radio dispatcher
// sends the searcher to the missing guard's CURRENT position (its actual
// body, wherever it is NOW — a locker included) rather than some remembered
// "last assigned patrol post" — which is exactly what makes tranq-and-leave
// risky and stuffing a body away FAST (before its own next 40s check-in
// lands) the actual counter-play, per this cycle's task brief.
//   Pushes { type: "missedCheckIn", guardId, searcherId } the tick a search is
//   actually dispatched (never on a landed check-in for an awake guard, and
//   never on a landed check-in for a still-missing guard whose PREVIOUS
//   searcher is still mid-INVESTIGATE — see ONE ACTIVE SEARCH above). If NO
//   PATROL guard is free at that exact moment, this tick's check-in is
//   silently skipped (no event, no dispatch) — the very NEXT scheduled
//   check-in for that same guard, 40s later, tries again, per SPEC's own
//   "repeats every 40s while still missing."
//
// ---- REINFORCEMENTS (SPEC: "reinforcements spawn at zone door (max +3)") --
// While squad.phase === "ALERT": the first reinforcement spawns 6s after
// THIS alert bout began, then one more every 10s after that, capped at
// REINFORCEMENT_MAX (3) TOTAL per zone visit. "Per zone visit" is enforced
// implicitly, not by a special reset rule: director itself is rebuilt fresh
// on every zone transition (see src/engine.js's switchZone, same "discard the
// departed zone's instance" rule cameras/lasers/guards/squad already follow),
// so this section's own reinforcementCount closure var starts back at 0
// automatically the moment a NEW zone's director is constructed — there is no
// separate "which zone am I in" bookkeeping to get right here.
//
// COUNTER PERSISTS THROUGH PHASE DECAY, ONLY THE SPAWN TIMER RESTARTS: a rising
// edge on squad.phase (anything -> "ALERT") restarts the 6s/10s spawn SCHEDULE
// (nextSpawnAt = ctx.time + 6) but does NOT touch reinforcementCount — a zone
// that went loud once stays reinforced for the rest of that visit even after
// decaying all the way back to INFILTRATION and re-alerting later; only a
// fresh zone (a fresh director) ever un-caps it. This is the literal reading
// of the task brief's "counter resets on zone change, NOT on phase decay" —
// documented here, not just in a commit message.
//
// SPAWN: Game.createGuard({ world, vision, rng, squad, spawn: zone.guardDoor,
// waypoints: <a short loop near the door>, id: "reinf-<n>" }) — squad-joined
// from birth. Deliberately NOT force-set to state "ALERT" by hand here: a
// brand-new guard defaults to state "PATROL", but because squad.phase is
// ALREADY "ALERT" the instant this guard exists, its own VERY FIRST
// guard.update() call (next tick, once engine's guard-update loop reaches it)
// runs the ordinary RADIO CALL / SQUAD-PHASE SYNC step every OTHER guard on
// the squad already goes through (see guardAI.js's own step 1 contract) and
// forces it into ALERT there, via the real setState("ALERT", ...) path —
// fireTimer/nextFireAt included, so it can fire like any other ALERT guard.
// Hand-writing guard.state = "ALERT" here instead would skip that setState
// call and leave nextFireAt stuck at null (this guard could never fire) — see
// guardAI.js's own setState contract for exactly what a transition is
// supposed to reset. "Immediately in ALERT state converging on lastKnown" is
// therefore true from this guard's OWN first live tick onward, the same
// "radioed-in squadmate" latency (zero extra FSM ticks, just the ordinary
// one-tick construction-to-first-update gap) every other synced guard already
// has — not a special case.
// WAYPOINTS: a short loop anchored on zone.guardDoor, derived (not hand-
// authored per zone) by probing a small fixed ring of offsets around the door
// with world.isBlockedCircle(x, y, 0.6) — the SAME r=0.6 clearance every
// other waypoint leg in this game is authored against (see src/world.js's own
// waypoint schema note) — keeping the door point itself plus the first two
// offsets that come back open. A zone whose door has fewer than two clear
// offsets nearby (shouldn't happen for any zone shipped this cycle) just gets
// a shorter loop; guardAI.js's own patrol-loop code tolerates any waypoints
// length >= 1 already (no new guardAI.js change needed for this).
// PERF: the heaviest zone (commsTower, 4 base guards) plus a full +3 is 7
// guards, comfortably under this game's existing 10-guard perf budget (see
// tests/commsTower.test.js's own <4ms/tick gate) — reinforcement bookkeeping
// itself is O(guards) per tick, no different in shape from the check-in loop
// above.
//   Pushes { type: "reinforcement", guardId } the tick a guard actually
//   spawns.
//
// SAVE/RESTORE — HONEST GAP (documented, not hacked around): this section's
// own mutable state (reinforcementCount, the spawn-timer bookkeeping, and the
// check-ins' per-missing-guard searcher tracking) is NOT captured by this
// file's existing getState()/setState() (see SAVE/RESTORE above cameras/
// lasers) — src/saveState.js is out of scope for this cycle's task packet, so
// a save/restore round-trip rebuilds a FRESH director for the restored zone
// (same as it already does for cameras/lasers) that has forgotten this
// section's own history. This is exactly why the check-in SCHEDULE above is
// written as a pure function of (ctx.time, dt, index) rather than a stored
// "next check-in at" seeded from this director's own construction moment: a
// pure schedule means a freshly-rebuilt director (post-restore, or a mid-zone
// re-tick after a save) computes the IDENTICAL check-in boundaries a
// never-restored director would have, with nothing to lose. reinforcement
// scheduling has no equivalent pure-function trick available (it is
// inherently "history since this alert bout began"), so a save/restore taken
// mid-ALERT can, in principle, forget an in-progress spawn countdown or an
// already-spent slice of the +3 budget — same documented-gap posture as
// every other "module X's own state, saveState.js out of scope" note already
// in this codebase (see src/world.js's DOORS DO NOT ATTENUATE SOUND for the
// same pattern).
//
// Pure JS logic — no THREE, no DOM, no Math.random/Date — runs headless in
// node exactly like vision.js/guardAI.js. Consumes world/vision/squad only
// via their own published contracts; never mutates any of them (squad is the
// one exception, via its own published broadcastAlert() method — the same
// thing every guard already does to it).
(function (Game) {
  function createDirector(deps) {
    deps = deps || {};
    var world = deps.world;
    var vision = deps.vision;
    var squad = deps.squad;
    // rng (NEW — see file header ESCALATION section): only consumed to hand
    // to a spawned reinforcement guard's own Game.createGuard call. Optional
    // — a director that never actually spawns one (every camera/laser test
    // predating this cycle) never touches it.
    var rng = deps.rng;

    var cameras = (world && world.zone && world.zone.cameras) || [];
    var lasers = (world && world.zone && world.zone.lasers) || [];
    var guardDoor = (world && world.zone && world.zone.guardDoor) || null;

    // Per-camera mutable state, parallel array to `cameras` (same index).
    // wasSuspicious is the only edge-tracking flag needed — the ALERT check
    // is deliberately LEVEL-triggered (see file header), so it needs no
    // "was already alert" flag to compare against.
    var camStates = cameras.map(function (cam) {
      return {
        panAngle: cam.facing,
        disabled: false,
        meter: 0,
        wasSuspicious: false,
      };
    });

    // Per-laser mutable state, parallel array to `lasers` (same index) — see
    // file header LASERS section. Just the last-computed active flag; a
    // laser has no meter/edge-tracking of its own (see ACTIVE FORMULA note).
    var laserActiveStates = lasers.map(function () {
      return { active: false };
    });

    var TWO_PI = Math.PI * 2;

    function tickCameras(dt, ctx) {
      var fired = [];

      for (var i = 0; i < cameras.length; i++) {
        var cam = cameras[i];
        var st = camStates[i];

        var halfSweepRad = (cam.sweepDeg * Math.PI) / 180 / 2;
        st.panAngle = cam.facing + Math.sin((TWO_PI * ctx.time) / cam.sweepPeriodS) * halfSweepRad;

        var disabled = ctx.chaffUntil > ctx.time;
        st.disabled = disabled;

        // DISABLED (see file header) — the pan keeps moving cosmetically
        // (already updated above), but perception is fully cut: no
        // tickMeter call at all, so the meter is left EXACTLY where it was
        // on the last non-disabled tick (frozen, not drained to 0).
        if (disabled) continue;

        var viewer = { x: cam.x, y: cam.y, facing: st.panAngle, fovDeg: cam.fovDeg, range: cam.range };
        var sight = vision.computeSight(viewer, ctx.player);
        st.meter = vision.tickMeter(st.meter, sight.factor, dt);

        var isSuspicious = st.meter >= Game.VISION.SUSPICIOUS_AT;
        if (isSuspicious && !st.wasSuspicious) {
          fired.push({ type: "cameraSuspicious", cameraIndex: i });
        }
        st.wasSuspicious = isSuspicious;

        if (st.meter >= Game.VISION.ALERT_AT) {
          squad.broadcastAlert(ctx.player.x, ctx.player.y);
          fired.push({ type: "cameraAlert", cameraIndex: i });
        }
      }

      return fired;
    }

    function cameraStates() {
      return cameras.map(function (cam, i) {
        var st = camStates[i];
        return {
          x: cam.x,
          y: cam.y,
          panAngle: st.panAngle,
          disabled: st.disabled,
          meter: st.meter,
          fovDeg: cam.fovDeg,
          range: cam.range,
        };
      });
    }

    // ---- LASERS (see file header LASERS section) ---------------------------

    // Plain segment-segment intersection test (x1,y1)->(x2,y2) vs
    // (x3,y3)->(x4,y4). Returns boolean only — this module never needs the
    // actual intersection point, just "did it cross." Parallel (including
    // collinear/degenerate zero-length) segments return false: a laser beam
    // and the player's movement segment being EXACTLY parallel never
    // resolves to a crossing point, and a zero-length movement segment (the
    // player didn't move this tick) has no meaningful direction to cross
    // anything with — both are the correct "no crossing" answer here, not an
    // edge case to special-case around.
    function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
      var d1x = x2 - x1;
      var d1y = y2 - y1;
      var d2x = x4 - x3;
      var d2y = y4 - y3;
      var denom = d1x * d2y - d1y * d2x;
      if (denom === 0) return false;
      var t = ((x3 - x1) * d2y - (y3 - y1) * d2x) / denom;
      var u = ((x3 - x1) * d1y - (y3 - y1) * d1x) / denom;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }

    function tickLasers(dt, ctx) {
      var fired = [];

      for (var i = 0; i < lasers.length; i++) {
        var laser = lasers[i];
        var st = laserActiveStates[i];

        // ACTIVE FORMULA (see file header) — always computed, regardless of
        // ctx.playerHidden, so laserStates() stays live (blinking) even
        // while the player can't personally trip it this tick.
        var phase = (ctx.time / laser.periodS) % 1;
        st.active = phase < laser.dutyOn;

        if (!st.active) continue;
        // HIDDEN (see file header) — a locker-hidden player can never trip
        // a laser this tick, explicit belt-and-suspenders check beyond the
        // FROZEN INPUT zero-length segment this normally produces anyway.
        if (ctx.playerHidden) continue;

        var crosses = segmentsIntersect(
          ctx.prevX, ctx.prevY, ctx.x, ctx.y,
          laser.x1, laser.y1, laser.x2, laser.y2
        );
        if (crosses) {
          squad.broadcastAlert(ctx.x, ctx.y);
          fired.push({ type: "laserTripped", laserIndex: i });
        }
      }

      return fired;
    }

    function laserStates() {
      return lasers.map(function (laser, i) {
        return {
          x1: laser.x1,
          y1: laser.y1,
          x2: laser.x2,
          y2: laser.y2,
          active: laserActiveStates[i].active,
          periodS: laser.periodS,
          dutyOn: laser.dutyOn,
        };
      });
    }

    // ---- ESCALATION (see file header ESCALATION section) --------------------

    var REINFORCEMENT_MAX = 3;
    var REINFORCEMENT_FIRST_DELAY_S = 6;
    var REINFORCEMENT_INTERVAL_S = 10;
    var CHECKIN_INTERVAL_S = 40;
    var CHECKIN_STAGGER_S = 5;

    // Reinforcement bookkeeping (zone-visit-scoped — see file header: this
    // director instance IS the zone visit, rebuilt fresh by switchZone, so
    // these vars naturally reset to 0/false/null on a real zone change and
    // nowhere else).
    var reinforcementCount = 0;
    var reinforcementSeq = 0;
    var alertWasActive = false; // squad.phase === "ALERT" as of the LAST tickEscalation call
    var nextSpawnAt = null; // absolute ctx.time the NEXT reinforcement is due, or null

    // Check-in dispatch bookkeeping: missingSearchers[guardId] = searcherId,
    // the guard currently (or most recently) sent to investigate that missing
    // guard's position — see ONE MISSED CHECK-IN -> ONE DISPATCH in the file
    // header. NOT the check-in SCHEDULE itself (that's a pure function of
    // time/index — see below), just "who did we already send."
    var missingSearchers = {};

    function distance(x1, y1, x2, y2) {
      var dx = x2 - x1;
      var dy = y2 - y1;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function findGuardById(guardsArr, id) {
      for (var i = 0; i < guardsArr.length; i++) {
        if (guardsArr[i].id === id) return guardsArr[i];
      }
      return null;
    }

    // PURE-FUNCTION CHECK-IN SCHEDULE (see file header DETERMINISM/SAVE-
    // RESTORE note) — true iff a guard at array index `index` has a
    // check-in boundary land on THIS tick, computed purely from
    // (time, dt, index): no stored "next check-in at" to seed/lose.
    function crossedCheckinBoundary(index, time, dt) {
      var offset = (index * CHECKIN_STAGGER_S) % CHECKIN_INTERVAL_S;
      var prevBoundary = Math.floor((time - dt - offset) / CHECKIN_INTERVAL_S);
      var currBoundary = Math.floor((time - offset) / CHECKIN_INTERVAL_S);
      return currBoundary > prevBoundary;
    }

    // Nearest guard (by straight-line distance) whose OWN state is exactly
    // "PATROL" — see file header ONE MISSED CHECK-IN -> ONE DISPATCH — never
    // the missing guard itself (that guard is SLEEPING by construction of the
    // caller, so it would never match state==="PATROL" anyway; excluded
    // explicitly regardless, defensively).
    function nearestPatrolGuard(guardsArr, missingGuard) {
      var best = null;
      var bestDist = Infinity;
      for (var i = 0; i < guardsArr.length; i++) {
        var g = guardsArr[i];
        if (g === missingGuard || g.state !== "PATROL") continue;
        var d = distance(g.x, g.y, missingGuard.x, missingGuard.y);
        if (d < bestDist) {
          bestDist = d;
          best = g;
        }
      }
      return best;
    }

    // REINFORCEMENT WAYPOINTS (see file header WAYPOINTS note) — a small
    // fixed ring of candidate offsets around guardDoor, probed in order with
    // world.isBlockedCircle(x, y, 0.6) (same r=0.6 clearance convention as
    // every other waypoint leg this game ships — see src/world.js's own
    // schema note); the door point itself plus the first two OPEN offsets
    // found become the loop. Computed ONCE at construction (guardDoor/world
    // are both fixed for this director's lifetime) rather than per-spawn —
    // pure function of static zone data, so there is nothing to recompute.
    var REINFORCEMENT_OFFSETS = [
      { dx: 2, dy: 0 },
      { dx: -2, dy: 0 },
      { dx: 0, dy: 2 },
      { dx: 0, dy: -2 },
      { dx: 2, dy: 2 },
      { dx: -2, dy: -2 },
      { dx: 2, dy: -2 },
      { dx: -2, dy: 2 },
      { dx: 3, dy: 0 },
      { dx: -3, dy: 0 },
      { dx: 0, dy: 3 },
      { dx: 0, dy: -3 },
    ];

    function buildReinforcementWaypoints(door) {
      var pts = [{ x: door.x, y: door.y }];
      for (var i = 0; i < REINFORCEMENT_OFFSETS.length && pts.length < 3; i++) {
        var cx = door.x + REINFORCEMENT_OFFSETS[i].dx;
        var cy = door.y + REINFORCEMENT_OFFSETS[i].dy;
        if (!world.isBlockedCircle(cx, cy, 0.6)) {
          pts.push({ x: cx, y: cy });
        }
      }
      return pts;
    }

    var reinforcementWaypoints = guardDoor ? buildReinforcementWaypoints(guardDoor) : null;

    // Spawns one reinforcement guard at guardDoor — see file header SPAWN
    // note for why this deliberately does NOT hand-force guard.state to
    // "ALERT" (the normal radio-call sync on its own first update() call
    // already does that correctly, fireTimer/nextFireAt included).
    function spawnReinforcement() {
      reinforcementSeq++;
      return Game.createGuard({
        world: world,
        vision: vision,
        rng: rng,
        squad: squad,
        spawn: { x: guardDoor.x, y: guardDoor.y },
        waypoints: reinforcementWaypoints,
        id: "reinf-" + reinforcementSeq,
      });
    }

    // director.tickEscalation(dt, ctx) -> [ { type, ... }, ... ] — see file
    // header ESCALATION section for the full write-up. ctx = { time, guards }.
    function tickEscalation(dt, ctx) {
      var fired = [];
      var time = ctx.time;
      var guardsArr = ctx.guards || [];

      // ---- RADIO CHECK-INS (see file header) — runs every tick, regardless
      // of squad.phase; a guard's own SLEEPING state is the only gate.
      for (var gi = 0; gi < guardsArr.length; gi++) {
        var guard = guardsArr[gi];
        if (!crossedCheckinBoundary(gi, time, dt)) continue;

        if (guard.state !== "SLEEPING") {
          // Awake at its own check-in — nothing missing; clear any stale
          // searcher record (harmless if there was none).
          delete missingSearchers[guard.id];
          continue;
        }

        // MISSED CHECK-IN. ONE ACTIVE SEARCH ONLY (see file header): if a
        // previously-dispatched searcher is still mid-INVESTIGATE, this
        // scheduled check-in is a no-op — the NEXT one (40s later) tries
        // again if the guard is still missing then.
        var priorSearcherId = missingSearchers[guard.id];
        var priorSearcher = priorSearcherId ? findGuardById(guardsArr, priorSearcherId) : null;
        if (priorSearcher && priorSearcher.state === "INVESTIGATE") continue;

        var searcher = nearestPatrolGuard(guardsArr, guard);
        if (searcher) {
          // Same stimulus mechanism a gunshot/knock/dart-impact already uses
          // (see guardAI.js's hearNoise contract) — sent at the missing
          // guard's CURRENT position (its body, wherever it is now — a
          // locker included, see file header for why that's the deliberate
          // choice), not any remembered patrol post.
          searcher.hearNoise(guard.x, guard.y, "strong");
          missingSearchers[guard.id] = searcher.id;
          fired.push({ type: "missedCheckIn", guardId: guard.id, searcherId: searcher.id });
        } else {
          delete missingSearchers[guard.id];
        }
      }

      // ---- REINFORCEMENTS (see file header) — only while squad.phase is
      // ALERT; reinforcementCount is zone-visit-scoped (see its own
      // declaration comment above), never reset by a phase decay.
      var isAlert = squad.phase === "ALERT";
      if (isAlert && !alertWasActive) {
        // Rising edge — a fresh alert bout (first ever, or a re-alert after
        // decaying out of ALERT earlier this same zone visit) restarts the
        // 6s/10s spawn SCHEDULE, but never touches reinforcementCount.
        nextSpawnAt = time + REINFORCEMENT_FIRST_DELAY_S;
      }
      alertWasActive = isAlert;

      if (
        isAlert &&
        guardDoor &&
        reinforcementCount < REINFORCEMENT_MAX &&
        nextSpawnAt !== null &&
        time >= nextSpawnAt
      ) {
        var newGuard = spawnReinforcement();
        guardsArr.push(newGuard);
        reinforcementCount++;
        fired.push({ type: "reinforcement", guardId: newGuard.id });
        nextSpawnAt = time + REINFORCEMENT_INTERVAL_S;
      }

      return fired;
    }

    // getState()/setState() (NEW — save/restore cycle, additive only, no
    // behavior change). Captures the per-camera/per-laser MUTABLE state
    // arrays (camStates/laserActiveStates) — the camera/laser SCHEMA itself
    // (x/y/facing/sweepDeg/... from world.zone.cameras/lasers) is immutable
    // zone data, already restored by rebuilding the world/director for
    // save.zoneId, so only the live per-tick numbers need to travel:
    //   cameras: [{ panAngle, disabled, meter, wasSuspicious }, ...] — meter
    //     is what makes a restored camera resume mid-fill/mid-drain exactly
    //     where a live one would; wasSuspicious is the SUSPICIOUS edge-
    //     tracking flag (see tickCameras' file header note) — miss it and a
    //     restored camera already-above-SUSPICIOUS_AT would fire a spurious
    //     re-crossing event on its very next non-disabled tick.
    //   lasers: [{ active }, ...] — the last-computed duty-cycle flag; purely
    //     cosmetic (laserStates()' blink), since tickLasers recomputes it
    //     fresh from ctx.time every tick regardless, but captured anyway so
    //     laserStates() reads correctly on a restored engine even before its
    //     first post-restore tick.
    // Same index order as `cameras`/`lasers` (the world.zone arrays) in both
    // directions — restoring onto a director built from a DIFFERENT zone (a
    // different camera/laser count) is not a supported call shape; callers
    // (src/saveState.js) only ever restore onto a director rebuilt for the
    // SAME zoneId the capture came from.
    function getState() {
      return {
        cameras: camStates.map(function (st) {
          return {
            panAngle: st.panAngle,
            disabled: st.disabled,
            meter: st.meter,
            wasSuspicious: st.wasSuspicious,
          };
        }),
        lasers: laserActiveStates.map(function (st) {
          return { active: st.active };
        }),
      };
    }

    function setState(state) {
      var camsIn = state.cameras || [];
      for (var i = 0; i < camStates.length && i < camsIn.length; i++) {
        camStates[i].panAngle = camsIn[i].panAngle;
        camStates[i].disabled = camsIn[i].disabled;
        camStates[i].meter = camsIn[i].meter;
        camStates[i].wasSuspicious = camsIn[i].wasSuspicious;
      }
      var lasersIn = state.lasers || [];
      for (var j = 0; j < laserActiveStates.length && j < lasersIn.length; j++) {
        laserActiveStates[j].active = lasersIn[j].active;
      }
    }

    return {
      tickCameras: tickCameras,
      cameraStates: cameraStates,
      tickLasers: tickLasers,
      laserStates: laserStates,
      tickEscalation: tickEscalation,
      getState: getState,
      setState: setState,
    };
  }

  Game.createDirector = createDirector;
  if (typeof module !== "undefined") module.exports = { createDirector: createDirector };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
