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
//       WEDGE_WINDOW_S: 2.0,      // s — rolling progress window for WEDGE GIVE-UP
//                                 // (see below): if travel-to-stimulus movement makes
//                                 // less than WEDGE_MIN_PROGRESS of net displacement
//                                 // over this many seconds while still farther than
//                                 // ARRIVE_DIST from its target, it's declared wedged.
//                                 // Internally tracked in TICKS (see GUARD contract's
//                                 // own note on the engine's fixed 60Hz timestep), not
//                                 // accumulated dt-seconds, so detection is a pure,
//                                 // deterministic function of tick count.
//       WEDGE_MIN_PROGRESS: 0.3,  // m — the minimum net displacement over
//                                 // WEDGE_WINDOW_S that counts as "still making
//                                 // progress" toward a travel target.
//       EVASION_S: 30,            // squad phase timer: EVASION -> CAUTION
//       CAUTION_S: 45,            // squad phase timer: CAUTION -> INFILTRATION
//       ALERT_SPEED: 3.2,         // m/s, ALERT pursuit of the player/lastKnown
//       ARREST_DIST: 2.0,         // m, ALERT pursuit stops here (no overlap w/ player)
//       CAUTION_FOV_MULT: 1.3,    // widened cone angle multiplier while squad is CAUTION
//       CAUTION_RANGE_MULT: 1.2,  // widened cone range multiplier while squad is CAUTION
//       CAUTION_SPEED: 2.0,       // m/s, patrol speed while squad is CAUTION
//       FIRE_RANGE: 10,           // m — max distance ALERT will fire from
//       FIRE_INTERVAL_S: 1.5,     // s between shots, per guard, once firing
//       FIRE_DAMAGE: 0.15,        // hp fraction a HIT shot deals (applied by
//                                 // the engine, not this module — see below)
//       FIRE_FIRST_DELAY_S: 0.6,  // s grace period after ENTERING ALERT
//                                 // before the first shot — gives the player
//                                 // a beat to react/break LOS before combat
//                                 // starts, rather than an instant shot the
//                                 // moment the meter tips over ALERT_AT.
//       MAX_STATE_S: { SUSPICIOUS: 4.0, INVESTIGATE: 30.0, ALERT: Infinity,
//                      SLEEPING: SLEEP_S + 5 }
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
//         // SLEEPING gets a real ceiling (SLEEP_S + 5s margin, not Infinity
//         // and not absent) because unlike EVASION/CAUTION it has NO other
//         // timer driving it out — a bug in the wake-up check (see SLEEPING
//         // below) would otherwise strand a guard asleep forever with nothing
//         // to catch it.
//       SLEEP_S: 60,             // s a headshot/staggered guard stays SLEEPING
//                                // before waking into INVESTIGATE
//       STAGGER_SLEEP_S: 3,      // s a NON-headshot dart hit (squad already
//                                // ALERT) keeps the guard acting before it
//                                // finally goes down
//       BODY_SPOT_RANGE: 10,     // m — range clamp for an awake guard's sight
//                                // check against a SLEEPING colleague's body
//       BODY_SPOT_CONFIRM_S: 0.5,// s of accumulated visibility on a sleeping
//                                // colleague's body before an awake guard
//                                // calls it in (broadcastAlert at the body)
//       LOCKER_CHECK_RANGE: 6,   // m — see EVASION LOCKER CHECK below: a zone
//                                // locker must be within this range of the
//                                // guard's SWEEP-START position (where its
//                                // converge-on-lastKnown leg ends, normally
//                                // or via WEDGE GIVE-UP) to be eligible for a
//                                // check at all. DESIGN.md pillar 4
//                                // (Consequence: recoverable chaos) —
//                                // hiding far from your last-known position
//                                // is the reward for actually breaking LOS
//                                // and putting distance in first, not a
//                                // guaranteed-safe panic button next to
//                                // wherever you were last seen.
//       LOCKER_CHECK_PAUSE: 1.2, // s a guard holds, facing the locker it
//                                // walked to, before asking the engine
//                                // what's inside (see ctx.checkLocker below)
//     }
//
//   WEDGE GIVE-UP (cycle 32 — see GUARD.WEDGE_WINDOW_S/WEDGE_MIN_PROGRESS
//   above): guards move by direct-line-plus-slide (world.moveCircle), with NO
//   pathfinding. A stimulus (or lastKnown point) tucked behind geometry — a
//   noise/body on the far side of warehouse shelving, say — can leave a guard
//   pushing straight into an obstruction forever, never reaching
//   GUARD.ARRIVE_DIST. Left unhandled, that guard's stateTime just keeps
//   climbing until it trips GUARD.MAX_STATE_S — the invariant did its job
//   (caught a real defect), but the FSM must never actually deserve it: a
//   guard has to give up gracefully well before that ceiling, every time.
//   Applies to every travel-to-stimulus movement in this file — INVESTIGATE's
//   walk to `stimulus`, EVASION's converge-then-sweep toward squad.lastKnown,
//   and ALERT's no-LOS converge-on-lastKnown branch (its hasLOS branch chases
//   the LIVE, visible player, not a fixed point, so it is not in scope here).
//   Each of those keeps its own GUARD.WEDGE_WINDOW_S-ticks rolling-progress
//   tracker (reset whenever that travel starts fresh — state entry, or, for
//   ALERT, whenever hasLOS is regained): if the guard's net displacement
//   since the tracker was last reset/checked is under GUARD.WEDGE_MIN_PROGRESS
//   (0.3m) AND it is still farther than GUARD.ARRIVE_DIST from its target,
//   that travel is declared wedged. The give-up behavior differs by state,
//   matching what each state already does on a NORMAL arrival:
//     - INVESTIGATE: skips straight to the search phase, AT THE CURRENT
//       (stuck) position — the guard peers around whatever it ran into,
//       exactly like a normal arrival's search, just short of the stimulus —
//       then resumes CAUTION/PATROL exactly as a completed search always has.
//     - EVASION: begins its coordinated sweep right where it got stuck,
//       instead of continuing to push toward squad.lastKnown.
//     - ALERT (no-LOS branch only): simply holds position (this branch has no
//       search/sweep phase of its own to fall into) until hasLOS returns or
//       squad.tick() moves the squad on to EVASION.
//   Tick-counted, not wall-clock: the window is a fixed count of update()
//   calls (GUARD.WEDGE_WINDOW_S seconds' worth at the engine's fixed 60Hz
//   timestep), never an accumulated dt-seconds float — so detection is a
//   pure function of how many ticks have run, immune to any dt jitter, and
//   reproduces identically given the same input log (rng.js's determinism
//   rule). GUARD.MAX_STATE_S is UNCHANGED by any of this — it remains the
//   backstop invariant, just one the FSM should now never actually reach via
//   this path.
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
//       checkedLockers — NEW (locker-check cycle) — { [lockerIndex]: true }, a
//                    shared record of which of this zone's zone.lockers[]
//                    entries have already been checked (found empty, found a
//                    body, or found the player) THIS EVASION EPISODE — see
//                    EVASION LOCKER CHECK, under EVASION below, for the full
//                    write-up. A guard reserves an index here (via
//                    markLockerChecked, below) the INSTANT it commits to
//                    walking toward that locker, not when the check actually
//                    resolves — so a squadmate evaluating its own eligible
//                    lockers later the SAME tick already sees it excluded
//                    (see markLockerChecked). Reset to {} every time
//                    squad.tick() transitions ALERT -> EVASION (a fresh
//                    EVASION episode gets a fresh, empty dedup set) — see
//                    tick() below.
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
//       markLockerChecked(lockerIndex) — NEW (locker-check cycle) — called by
//         a guard the instant it commits to walking toward a given
//         zone.lockers[] index during an EVASION sweep (see EVASION LOCKER
//         CHECK below); sets squad.checkedLockers[lockerIndex] = true. No
//         other consequence — purely the shared dedup bookkeeping described
//         under checkedLockers above.
//       tick(dt, anyGuardHasLOS) — THE ENGINE (or, meanwhile, whatever test/
//         sim harness drives the guard loop) calls this ONCE PER TICK, AFTER
//         every guard on the squad has had update() called for that tick,
//         passing whether ANY of those guards currently has confirmed LOS on
//         the player (see guard.hasLOS below — anyGuardHasLOS is typically
//         `guards.some(g => g.hasLOS)`). Handles the timer-driven half of the
//         ladder:
//           ALERT, no LOS this tick     -> EVASION (phaseTime reset to 0,
//                                          checkedLockers reset to {} — see
//                                          checkedLockers above/EVASION LOCKER
//                                          CHECK below: a fresh EVASION
//                                          episode gets a fresh dedup set)
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
//   rng:       a Game.createRng(seed) instance (src/rng.js). All FSM
//              timing/sweeps remain deterministic functions of stateTime, not
//              dice rolls — the one consumer of rng.next() in this module is
//              ALERT's fire-accuracy roll (see the ALERT/COMBAT section
//              below). engine.js hands every guard on a squad the SAME rng
//              instance (rng.js's own "single source of randomness for the
//              whole game" rule) — multiple guards' fire rolls draw from one
//              shared sequence, consumed in whatever order their update()
//              calls happen to fire a shot that tick (array order), which is
//              still fully deterministic given a fixed seed and input log.
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
//                                "ALERT" | "EVASION" | "CAUTION" | "SLEEPING"
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
//     hidden                  — boolean, NEW (CQC/locker cycle): true only
//                                while this guard's body has been STUFFED
//                                INTO A LOCKER by the player (see
//                                guard.stuffInLocker below) — false at every
//                                other time, including while merely
//                                SLEEPING-but-not-stuffed or being DRAGGED
//                                (dragging is an ENGINE-side position
//                                override, see src/engine.js's DRAG VERB —
//                                it never touches this flag). A hidden body
//                                is EXEMPT from COLLEAGUE DISCOVERY (see
//                                below) — tucked out of sight, not just
//                                lying in the open. Defaults false.
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
//   guard.update(dt, ctx) — ctx = { player, onGuardFire?, sleepingGuards?,
//   checkLocker? }, player satisfying the target/player contract ({x, y,
//   visionProfile(), moving, stance} — the last two are read only by ALERT's
//   fire-accuracy roll, see below).
//   checkLocker(lockerIndex, guardId) is an OPTIONAL callback — see EVASION
//   LOCKER CHECK, under EVASION below, for the full write-up: this guard
//   calls it (never any other state) once it has walked to and paused at an
//   eligible nearby locker during an EVASION sweep, and reads back one of
//   "player" | "body" | "empty". Engine owns every consequence of a
//   non-"empty" result (playerHidden/positioning/broadcastAlert/events — see
//   src/engine.js's own contract); this module only reads the return value
//   to decide whether to jump to ALERT or resume its sweep. Omitting it
//   (every pre-locker-check test/sim call) is silently fine: no hook means
//   every eligible locker resolves as "empty" (see EVASION LOCKER CHECK).
//   onGuardFire(guard, hit) is an OPTIONAL callback: this module calls it the
//   instant this guard fires a shot (see ALERT below), passing itself and the
//   boolean hit/miss outcome — it does NOT apply any damage itself ("engine
//   owns consequences", per the file's combat design). Omitting onGuardFire
//   (e.g. every part-A/part-B test, sim.js scenario predating combat) is
//   silently fine: a fired shot with no callback simply produces no
//   observable side effect outside this guard's own internal fire-timer
//   bookkeeping.
//   sleepingGuards is an OPTIONAL array of currently-SLEEPING guards' public
//   position, [{ id, x, y }, ...] — the engine (or a test/sim harness, see
//   the colleague-discovery scenarios in tests/tranq.test.js) is expected to
//   pass every guard on the roster with state === "SLEEPING" here, EVERY
//   tick, for EVERY (awake) guard's update() call — see COLLEAGUE DISCOVERY
//   below for what this guard does with it. Omitting it (every pre-tranq
//   test/sim call) is silently fine: no list means nothing to spot, a no-op.
//   Call once per tick (engine uses dt = 1/60). Per tick:
//     0. stateTime += dt, up front (unchanged from part A).
//     0.5. SLEEPING SHORT-CIRCUIT (new — see SLEEPING below): if guard.state
//        is "SLEEPING", none of steps 1-5 below run at all this tick — no
//        radio-call sync, no perception, no FSM dispatch, no colleague
//        discovery, no combat. Only the SLEEPING per-state behavior (sleep
//        timer + wake check) and this guard's own SLEEPING MAX_STATE_S
//        invariant run, then (for a lone-squad guard) squad.tick(dt, false)
//        exactly as step 5 would, and update() returns. A radio call
//        (squad.phase flipping to ALERT/EVASION/CAUTION) does NOT wake a
//        sleeping guard early — they are unconscious, not merely distracted —
//        so this short-circuit runs BEFORE step 1's sync, not after it.
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
//     2.5. COLLEAGUE DISCOVERY (new — see SLEEPING/COLLEAGUE DISCOVERY below):
//        runs only while guard.state (post-sync) is PATROL, SUSPICIOUS,
//        INVESTIGATE, or CAUTION — never ALERT/EVASION (those states already
//        have the player's live contact as their sole focus, per the file
//        header's existing hearNoise note on ALERT/EVASION ignoring
//        anything but their own confirmed target). Checks this guard's sight
//        against every entry in ctx.sleepingGuards; a confirmed body-spot
//        calls squad.broadcastAlert AT THE BODY and jumps this guard straight
//        to ALERT, same shape as a confirmed player sighting.
//     3. FSM dispatch on (possibly just-synced, possibly just-alerted-by-
//        colleague-discovery) guard.state — see per-state behavior below.
//     4. INVARIANT: after dispatch, if guard.state is SUSPICIOUS or
//        INVESTIGATE and guard.stateTime > GUARD.MAX_STATE_S[guard.state],
//        throws an Error (ALERT's ceiling is Infinity, so it never trips;
//        EVASION/CAUTION aren't in the map at all, per the GUARD.MAX_STATE_S
//        note above).
//     5. If this guard owns a private squad-of-one (no `squad` dep given),
//        it calls squad.tick(dt, guard.hasLOS) on itself here, once, as the
//        very last thing update() does (see squad contract above for why
//        that's safe only in the lone-guard case).
//     6. STAGGERED DART CHECK (new — see guard.tranq/SLEEPING below): if a
//        non-headshot dart previously staggered this guard, its private
//        stagger clock advances by dt here, AFTER everything above (this
//        guard fully perceives/moves/dispatches/fires as normal this tick —
//        "keeps acting" per the dart's own contract). Once the clock reaches
//        GUARD.STAGGER_SLEEP_S (3s), this guard is forced into SLEEPING
//        immediately, overriding whatever state steps 1-5 just left it in.
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
//       the state<->phase mapping above) it's identical to part A. (c) NEW
//       (cycle 32) — the walk to `stimulus` is subject to WEDGE GIVE-UP (see
//       above): a stimulus with no clear direct-line-plus-slide path leaves
//       the guard searching from wherever it got stuck instead of stateTime
//       climbing toward GUARD.MAX_STATE_S.INVESTIGATE.
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
//           player continuously — this is also what a fire attempt (below)
//           relies on to guarantee "facing toward the player" for free.
//         - if this guard does NOT currently hasLOS: it calls
//           squad.loseContact() (see squad contract — a documented no-op on
//           squad state) and instead converges on squad.lastKnown (the
//           shared last-known point, no ARREST_DIST braking — it's just a
//           location, not the player), at GUARD.ALERT_SPEED, closing all the
//           way to it. NEW (cycle 32) — this branch (only; the hasLOS branch
//           above chases a live, visible player and is out of scope) is
//           subject to WEDGE GIVE-UP (see above): if lastKnown turns out to
//           have no clear direct-line-plus-slide path, the guard simply holds
//           its current position (ALERT has no search/sweep phase of its own
//           to fall into) rather than pushing into the obstruction for as
//           long as squad.phase stays ALERT.
//       guard.meter is pinned at 1 throughout (perception's fill/drain math
//       doesn't run — see step 2 above); ALERT has NO stateTime ceiling
//       (GUARD.MAX_STATE_S.ALERT === Infinity) — it persists for exactly as
//       long as squad.phase says ALERT, which is governed by squad.tick(),
//       not by this guard alone (see EVASION below for how it ends).
//       COMBAT (fire behavior — exclusive to ALERT; EVASION/CAUTION never
//       fire, by definition they have no confirmed LOS to fire on): each
//       guard keeps a private fire-timer, reset to 0 the instant it
//       (re-)enters ALERT (via setState — so re-broadcasting while ALREADY
//       ALERT does not reset it, per broadcastAlert's own no-op-if-already-
//       ALERT rule, but an EVASION -> ALERT re-engagement DOES, since that's
//       a fresh setState("ALERT", ...) call — a freshly re-acquired contact
//       earns a fresh grace period). The timer advances by dt every ALERT
//       tick regardless of hasLOS (a per-guard clock, not a LOS-gated one).
//       The first shot is eligible once the timer reaches
//       GUARD.FIRE_FIRST_DELAY_S (0.6s — a beat for the player to react
//       before combat starts); every shot after a successful one is eligible
//       GUARD.FIRE_INTERVAL_S (1.5s) later. An eligible tick actually fires
//       only if guard.hasLOS is true AND the straight-line distance to
//       ctx.player is <= GUARD.FIRE_RANGE (10m) — an eligible tick that fails
//       this check is NOT consumed (the interval is not advanced), so the
//       guard keeps re-checking every subsequent tick and fires the instant
//       LOS/range is regained, rather than waiting out a fresh interval.
//       "Facing must be toward the player to fire" needs no separate check:
//       tickAlert always sets guard.facing = atan2(target - guard) at the end
//       of its pursuit step above, with target === the player's live
//       position whenever hasLOS is true — exactly the condition gating a
//       fire attempt — so facing is toward the player by construction on
//       every tick a shot is even considered. On a firing tick: rolls hit
//       chance — base 0.75, halved (x0.5) if ctx.player.moving is true, and
//       halved again (a further x0.5, i.e. x0.25 combined) if
//       ctx.player.stance is "crouch" or "crawl" — via this guard's own
//       rng.next() < chance, then calls ctx.onGuardFire(guard, hit) if the
//       caller provided it (see ctx's contract above) — this module never
//       applies damage itself, only reports the outcome ("engine owns
//       consequences").
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
//       re-sighting. NEW (cycle 32) — the converge-on-lastKnown leg above is
//       subject to WEDGE GIVE-UP (see above): a lastKnown with no clear
//       direct-line-plus-slide path starts the coordinated sweep right where
//       the guard got stuck instead of pushing at it for the rest of EVASION.
//
//     EVASION LOCKER CHECK (new — locker-check cycle; DESIGN.md pillar 4,
//     Consequence: recoverable chaos — being made mid-chase escalates into a
//     tense, winnable scramble, not an automatic loss the moment you duck
//     into the first locker you see, NOR a guaranteed-safe panic button
//     regardless of where you hide). The counter to hiding in a locker
//     mid-chase: the instant a guard's coordinated sweep BEGINS (the same
//     tick `sweeping` first flips true — whether via a normal arrival at
//     squad.lastKnown or via the converge leg's own WEDGE GIVE-UP above;
//     EVASION's meter-based reacquisition check at the top of this state
//     runs first and can short-circuit straight to ALERT before any of this
//     ever applies), the guard looks for the NEAREST world.zone.lockers[]
//     entry within GUARD.LOCKER_CHECK_RANGE (6m) of the position its sweep
//     is starting from that is NOT already in squad.checkedLockers (see
//     checkedLockers/markLockerChecked in the squad contract above). None
//     eligible: the guard does its ordinary oscillating sweep, unchanged.
//     One eligible: squad.markLockerChecked(that index) is called
//     IMMEDIATELY (synchronously, before this guard has taken a single step
//     toward it), and this guard's own oscillating sweep is SUSPENDED in
//     favor of walking to the locker (INVESTIGATE-style travel, including
//     its own WEDGE GIVE-UP tracker — a locker tucked behind geometry gives
//     up and does the check from wherever the guard got stuck, same "peer
//     around whatever it ran into" shape as INVESTIGATE's own give-up
//     above), then holding GUARD.LOCKER_CHECK_PAUSE (1.2s) facing it. AT
//     MOST ONE locker check per guard per EVASION episode — reserving the
//     index above (a per-guard latch, separate from the shared
//     checkedLockers set) means this guard will never attempt a second one
//     even if its post-check sweep later drifts near another unchecked
//     locker — and the shared checkedLockers set means a squadmate sweeping
//     in from elsewhere never re-checks the SAME locker this same episode.
//     Once the pause completes, this guard calls ctx.checkLocker(lockerIndex,
//     guard.id) (see guard.update's own ctx contract above) and reads back
//     one of three outcomes — ENGINE OWNS EVERY CONSEQUENCE of a non-"empty"
//     result, this module only reacts, and NOT symmetrically — only a
//     "player" result gets the immediate-ALERT treatment, for a reason
//     rooted in squad.tick()'s own no-LOS decay (see below):
//       "player" — the locker held the hidden player (the engine has already
//         un-hidden them, positioned them 1m outside the locker, and called
//         squad.broadcastAlert at that spot — see src/engine.js's own
//         contract). This guard SNAPS its own facing toward the fresh
//         squad.lastKnown (the player's real position) and immediately calls
//         setState("ALERT", null) — the same "broadcast + setState, don't
//         wait for next tick's radio-call sync" shape as every other
//         EVASION/CAUTION escalation path in this file. The facing-snap
//         matters specifically here: this guard was facing the LOCKER for
//         the whole pause, and perception (src/engine.js's own step 2) reads
//         a guard's facing as of the START of a tick — an unadjusted facing
//         would cost this guard a full extra tick before its own hasLOS
//         could read true again, which is exactly long enough for
//         squad.tick()'s own no-LOS decay (ALERT with no guard LOS this
//         tick -> EVASION, see squad contract above) to flash the phase
//         back to EVASION before genuine contact ever registered. With the
//         snap, this guard's hasLOS reads true the very next tick (the
//         player is right there), so squad.tick()'s own anyGuardHasLOS
//         check holds ALERT for real from then on — ordinary pursuit/combat
//         takes it from here, no special-casing needed beyond this one tick.
//       "body" — the locker held a stuffed colleague (still hidden — see
//         src/engine.js's own contract for why the body stays put). This
//         guard does NOT setState("ALERT") — there is no live target here to
//         actually pursue, only engine's own broadcastAlert (a real,
//         if momentary, squad-level event that src/engine.js's own contract
//         deliberately does NOT bridge into a lasting ALERT, the same
//         "camera/colleague alert with no guard LOS flashes through and
//         settles back into EVASION" shape used elsewhere in this file's
//         squad-phase machinery). This guard instead resumes its coordinated
//         sweep, exactly like the "empty" case below — and critically,
//         because this guard's OWN state never actually leaves EVASION for
//         a body (or empty) result, `sweeping` never gets reset back to
//         false, so this guard can never re-select and re-check the SAME
//         (already-resolved) locker again later this same episode, even if
//         the squad-level flash-through-ALERT momentarily clears
//         squad.checkedLockers in the meantime (see checkedLockers above —
//         a fresh EVASION ENTRY resets it, but this guard's own state never
//         re-enters EVASION here, since it never left).
//       "empty" — nothing there. This guard resumes its coordinated sweep
//         (oscillating around whatever facing it ended up holding, exactly
//         like a normal EVASION sweep start) rather than returning to the
//         converge leg — the check itself, successful or not, is what "the
//         sweep" now includes at a nearby locker, not a detour away from it.
//     Omitting ctx.checkLocker (see guard.update's own ctx contract above)
//     makes every eligible locker resolve as "empty" — a guard still walks
//     over and pauses (the animation/timing is unconditional), it just never
//     finds anything, which is exactly what every pre-locker-check test/sim
//     call already assumes happens near an (uninhabited, as far as they're
//     concerned) locker.
//     GUARDS DO NOT CHECK LOCKERS IN CAUTION/PATROL — only EVASION does. The
//     existing 40s radio check-in system (src/director.js's own ESCALATION
//     contract) already covers a missing/stuffed colleague being noticed
//     during ordinary patrol; EVASION's locker check is specifically about
//     hunting down the player who just broke contact mid-chase, not a second
//     body-sweep mechanism layered on top of the one director.js already
//     owns.
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
//     SLEEPING — entered ONLY via guard.tranq() or guard.cqc() (see below),
//       never through the normal FSM dispatch/radio-call sync (a SLEEPING
//       guard's update() short-circuits at step 0.5, before step 1's sync
//       even runs — see above — so a squad-wide ALERT does not wake it).
//       While SLEEPING: guard.meter is pinned at 0 (perception doesn't run at
//       all — a sleeping guard notices nothing, including the player standing
//       right in front of it), guard.hasLOS is forced false, no movement, no
//       firing (its x/y ARE still externally mutable, though — see
//       src/engine.js's DRAG VERB, which repositions a dragged SLEEPING
//       guard's x/y directly every tick without going through this guard's
//       own update() at all). A private sleep clock advances by dt every
//       tick; once it reaches GUARD.SLEEP_S (60s) the guard wakes into
//       INVESTIGATE with stimulus = its OWN current position (it just
//       groggily "notices something's off" where it's lying, not any stale
//       player-sighting info) — from there it's the ordinary INVESTIGATE
//       search-then-resume machinery already documented above (searches
//       GUARD.INVESTIGATE_SEARCH seconds, then resumes CAUTION or PATROL
//       depending on squad.phase AT THAT MOMENT, same live-checked rule as
//       every other INVESTIGATE exit).
//       WAKING INSIDE A LOCKER (new — CQC/locker cycle): if guard.hidden is
//       true at the moment the sleep clock expires (i.e. this guard was
//       guard.stuffInLocker()'d and never manually let out — see that method
//       above), the guard first steps 1m out of the locker along the
//       REMEMBERED locker facing (via world.moveCircle, same collision-safe
//       primitive every other guard movement in this file uses) before its
//       INVESTIGATE stimulus is set to that stepped-out position — a groggy
//       guard visibly exits the locker rather than materializing next to it.
//       guard.hidden is cleared back to false at the same moment (it is, by
//       definition, no longer stuffed anywhere once it's standing outside).
//       A guard that was merely SLEEPING in the open (never stuffed —
//       guard.hidden already false) wakes exactly as before, no stepping.
//
//   guard.tranq(headshot) — external stimulus API, called by the ENGINE (see
//   src/items.js/src/engine.js) the instant a fired dart HITS this guard.
//   `headshot` (boolean) is computed by the CALLER, not this guard (see
//   src/items.js's HEADSHOT RULE: true when this guard's squad.phase was NOT
//   ALERT at the moment of the hit — an unaware target):
//     - Already SLEEPING: no-op (a second dart can't re-sleep a sleeping
//       guard; items.js's own hit test already excludes SLEEPING guards from
//       being hit at all, so this is a defensive no-op, not a reachable path
//       in practice).
//     - headshot === true: this guard is forced into SLEEPING IMMEDIATELY,
//       this same tick, overriding whatever state/FSM step it was mid-way
//       through — an unaware target drops instantly, no matter what.
//     - headshot === false: this guard is NOT put to sleep immediately —
//       instead its private stagger clock starts (see update() step 6 above)
//       and it keeps fully acting (perceiving, moving, dispatching, and — if
//       ALERT — still firing) for GUARD.STAGGER_SLEEP_S (3s) before finally
//       collapsing into SLEEPING on whatever tick that clock expires. This is
//       the "tranq an alert, hostile guard" case: the dart still works, but
//       an already-fighting guard doesn't just vanish mid-firefight — it
//       staggers first, exactly like the real games' tranq animation delay.
//
//   guard.cqc() — external stimulus API (new — CQC/locker cycle), called by
//   the ENGINE the instant a CQC takedown connects (see src/engine.js's CQC
//   VERB — conditions like distance/behind-check/squad.phase are ALL decided
//   by the engine before calling this; this method is the same one-shot
//   "make it SLEEPING" effect as a headshot, nothing more). v1 semantics:
//   CHOKE === SLEEP — reuses enterSleep() verbatim (same GUARD.SLEEP_S timer,
//   same wake-into-INVESTIGATE path below). A lethal/throw variant (permanent
//   removal, a body that never wakes) is explicitly NOT this cycle's job —
//   tracked as a future BACKLOG item, not hacked in here. No-op (like
//   tranq()) if this guard is already SLEEPING — a second takedown on a body
//   that's already down does nothing.
//
//   guard.stuffInLocker(locker) — external stimulus API (new — CQC/locker
//   cycle), called by the ENGINE when the player STUFFS an already-dragged,
//   SLEEPING body into a locker (see src/engine.js's LOCKER VERB). `locker`
//   is a plain { x, y, facing } from zone.lockers (src/world.js) — read-only,
//   never mutated. No-op if this guard is not currently SLEEPING (a stuffed
//   body is, by definition, one someone already knocked out and dragged
//   there — same defensive shape as tranq()/cqc() above). On success:
//   guard.x/guard.y are set to the locker's position, guard.hidden = true
//   (see the hidden flat-prop note above and COLLEAGUE DISCOVERY below for
//   what this exempts), and the locker's `facing` is privately remembered so
//   this guard knows which way to step back OUT of the locker when it wakes
//   (see SLEEPING's wake behavior below) — a groggy guard doesn't just
//   materialize in the open, it visibly exits the locker it was stuffed in.
//
//   COLLEAGUE DISCOVERY (new — see update() step 2.5 above) — the flip side
//   of guard.tranq(): an awake guard (state PATROL/SUSPICIOUS/INVESTIGATE/
//   CAUTION only — never ALERT/EVASION, see step 2.5) checks its OWN sight
//   (this.vision.computeSight, reused verbatim — same function every other
//   perception check in this file uses) against every body in
//   ctx.sleepingGuards, with { profile: 0.6 } (a body on the floor is a
//   smaller/harder-to-spot silhouette than a standing target — see
//   src/vision.js's opts.profile hook) and viewer.range forced to
//   GUARD.BODY_SPOT_RANGE (10m, tighter than the normal 14m cone — you have
//   to be reasonably close to notice a colleague isn't where they should
//   be). A body currently in-cone-and-in-LOS accumulates visibility time
//   (per sleeping-guard-id, so spotting two different bodies in the same
//   patrol doesn't cross-contaminate each other's timers); losing sight of a
//   given body resets THAT body's timer to 0 (no partial credit carried
//   across separate glances). Once a body's accumulated time reaches
//   GUARD.BODY_SPOT_CONFIRM_S (0.5s), this guard calls
//   squad.broadcastAlert(body.x, body.y) — a body-found ALERT, per SPEC.md's
//   "guards also notice sleeping/dead colleagues" — and this guard itself
//   jumps straight to ALERT, exactly like a confirmed player sighting (see
//   SUSPICIOUS/INVESTIGATE above for the shape of that same
//   broadcastAlert+setState("ALERT") pair). Every other guard on the squad
//   joins ALERT the next tick via the normal step 1 radio-call sync, same as
//   any other alert — colleague discovery is just a different TRIGGER for
//   the exact same squad-wide broadcastAlert machinery, not a parallel path.
//   HIDDEN-BODY EXEMPTION (new — CQC/locker cycle): any ctx.sleepingGuards
//   entry with .hidden === true (i.e. its guard.hidden flag, mirrored into
//   the snapshot by src/engine.js the same way id/x/y already are) is skipped
//   entirely by this check — a body stuffed into a locker is, per SPEC.md's
//   stealth-toolkit design, no longer something a patrolling colleague can
//   stumble across. This does NOT reset that body's bodySpotTimers entry
//   (there is simply no entry to reset — the loop `continue`s before ever
//   touching it), so a body un-hidden later (waking up and stepping out, see
//   SLEEPING below) resumes normal spottability with a clean timer, same as
//   any body this guard hasn't glanced at yet.
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
//     Any other case (already INVESTIGATE, ALERT, EVASION, or SLEEPING) is
//     ignored — a guard already closing in on (or standing over) something
//     isn't distracted by a second noise, ALERT/EVASION never react to
//     anything but the confirmed target (their own meter, checked every
//     tick, is what escalates them — see ALERT/EVASION above), and a
//     SLEEPING guard is unconscious (see SLEEPING above — this is the same
//     "nothing wakes them but their own sleep timer" rule applied to noise
//     instead of a squad radio call).
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
    WEDGE_WINDOW_S: 2.0,
    WEDGE_MIN_PROGRESS: 0.3,
    EVASION_S: 30,
    CAUTION_S: 45,
    ALERT_SPEED: 3.2,
    ARREST_DIST: 2.0,
    CAUTION_FOV_MULT: 1.3,
    CAUTION_RANGE_MULT: 1.2,
    CAUTION_SPEED: 2.0,
    FIRE_RANGE: 10,
    FIRE_INTERVAL_S: 1.5,
    FIRE_DAMAGE: 0.15,
    FIRE_FIRST_DELAY_S: 0.6,
    SLEEP_S: 60,
    STAGGER_SLEEP_S: 3,
    BODY_SPOT_RANGE: 10,
    BODY_SPOT_CONFIRM_S: 0.5,
    LOCKER_CHECK_RANGE: 6,
    LOCKER_CHECK_PAUSE: 1.2,
    MAX_STATE_S: { SUSPICIOUS: 4.0, INVESTIGATE: 30.0, ALERT: Infinity, SLEEPING: 0 },
  };
  // SLEEPING's ceiling is SLEEP_S + a 5s margin (see file header) — computed
  // here since GUARD.SLEEP_S isn't available yet inside the literal above.
  GUARD.MAX_STATE_S.SLEEPING = GUARD.SLEEP_S + 5;

  // Local-only tuning (not part of the public contract, see file header).
  var TURN_RATE = 3; // rad/s, SUSPICIOUS turning-to-face-stimulus rate
  var PAUSE_SWEEP_HZ = 1.5; // oscillations/sec-ish for the waypoint head sweep
  var SEARCH_SWEEP_HZ = 0.5; // oscillations/sec-ish for the investigate/evasion sweep
  var EVASION_SWEEP_AMPLITUDE = Math.PI / 2; // +/-90 degrees

  // Tick-counted window size for WEDGE GIVE-UP (see file header) — the engine
  // runs a fixed 60Hz timestep (per CLAUDE.md), so GUARD.WEDGE_WINDOW_S
  // seconds' worth of ticks is a fixed integer computed once here, not an
  // accumulated dt-seconds float (that's the whole point — see file header's
  // "tick-counted, not wall-clock" note).
  var WEDGE_WINDOW_TICKS = Math.round(GUARD.WEDGE_WINDOW_S * 60);

  // ---- WEDGE DETECTION (cycle 32 — see file header WEDGE GIVE-UP contract) --
  // A small reusable tracker, one instance per travel-to-stimulus movement
  // (INVESTIGATE's walk, EVASION's converge, ALERT's no-LOS converge). reset()
  // re-anchors the window at a given position (call whenever that travel
  // starts fresh); check() is meant to be called once per active-travel tick
  // with the guard's CURRENT position and its current straight-line distance
  // to the target, and returns true the tick a window CLOSES with
  // insufficient net progress while the guard is still short of arrival
  // (false every other tick, including every tick before a window closes).
  function createWedgeTracker() {
    var ticks = 0;
    var originX = 0;
    var originY = 0;

    function reset(x, y) {
      ticks = 0;
      originX = x;
      originY = y;
    }

    function check(x, y, distToTarget) {
      ticks++;
      if (ticks < WEDGE_WINDOW_TICKS) return false;
      var progressed = distance(x, y, originX, originY) >= GUARD.WEDGE_MIN_PROGRESS;
      ticks = 0;
      originX = x;
      originY = y;
      return !progressed && distToTarget > GUARD.ARRIVE_DIST;
    }

    // getState()/setState() (save/restore cycle) — this tracker's entire
    // mutable surface is the 3 closure vars above; a restored guard that
    // dropped these could diverge from a live one mid-window (see
    // guard.getState/applySaveState below for why every sub-machine's private
    // state has to round-trip exactly).
    function getState() {
      return { ticks: ticks, originX: originX, originY: originY };
    }

    function setState(s) {
      ticks = s.ticks;
      originX = s.originX;
      originY = s.originY;
    }

    return { reset: reset, check: check, getState: getState, setState: setState };
  }

  // ---- squad factory -----------------------------------------------------

  function createSquad() {
    var squad = {
      phase: "INFILTRATION",
      phaseTime: 0,
      lastKnown: null,
      alertCount: 0,
      // NEW (locker-check cycle) — see file header checkedLockers note above:
      // { [lockerIndex]: true } for every zone.lockers[] entry already
      // checked THIS EVASION EPISODE, shared across every guard on the squad.
      checkedLockers: {},
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

    // NEW (locker-check cycle) — see file header checkedLockers/EVASION
    // LOCKER CHECK notes above. Pure bookkeeping, no other consequence.
    function markLockerChecked(lockerIndex) {
      squad.checkedLockers[lockerIndex] = true;
    }

    function tick(dt, anyGuardHasLOS) {
      squad.phaseTime += dt;
      switch (squad.phase) {
        case "ALERT":
          if (!anyGuardHasLOS) {
            squad.phase = "EVASION";
            squad.phaseTime = 0;
            // NEW (locker-check cycle) — a fresh EVASION episode gets a
            // fresh, empty dedup set (see checkedLockers/EVASION LOCKER
            // CHECK in the file header above).
            squad.checkedLockers = {};
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

    // getState()/setState() (NEW — save/restore cycle, additive only, no
    // behavior change): squad's full mutable surface is its five flat props
    // (see file header) — no private closure state at all, unlike guard
    // below. getState() deep-copies lastKnown (a nested {x,y} object, or
    // null) and checkedLockers (a plain {index: true} map, new — locker-check
    // cycle) so a caller mutating the returned snapshot can never reach back
    // into this squad's own live state.
    function getState() {
      return {
        phase: squad.phase,
        phaseTime: squad.phaseTime,
        lastKnown: squad.lastKnown ? { x: squad.lastKnown.x, y: squad.lastKnown.y } : null,
        alertCount: squad.alertCount,
        checkedLockers: Object.assign({}, squad.checkedLockers),
      };
    }

    function setState(state) {
      squad.phase = state.phase;
      squad.phaseTime = state.phaseTime;
      squad.lastKnown = state.lastKnown ? { x: state.lastKnown.x, y: state.lastKnown.y } : null;
      squad.alertCount = state.alertCount;
      // Falls back to {} for a save captured before the locker-check cycle
      // (same defensive posture as engine.js's own stats/zoneStash fallback
      // in its setState — an old-format save simply won't have this field).
      squad.checkedLockers = Object.assign({}, state.checkedLockers || {});
    }

    squad.broadcastAlert = broadcastAlert;
    squad.updateSighting = updateSighting;
    squad.loseContact = loseContact;
    squad.markLockerChecked = markLockerChecked;
    squad.tick = tick;
    squad.getState = getState;
    squad.setState = setState;
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
      hidden: false,
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

    // WEDGE DETECTION trackers (cycle 32 — see file header WEDGE GIVE-UP
    // contract and createWedgeTracker above). One per travel-to-stimulus
    // movement this guard can perform; not part of the public contract.
    var investigateWedge = createWedgeTracker();
    var evasionWedge = createWedgeTracker();
    var alertWedge = createWedgeTracker();
    // NEW (locker-check cycle) — a dedicated tracker for the EVASION LOCKER
    // CHECK's own walk-to-locker leg (see file header); same WEDGE GIVE-UP
    // shape as every other travel-to-stimulus movement above.
    var lockerCheckWedge = createWedgeTracker();

    // EVASION LOCKER CHECK state (new — locker-check cycle, see file header).
    // lockerCheckDone latches true the instant this guard reserves a locker
    // to check (not when the check resolves) — the "at most one per guard
    // per EVASION episode" rule — and is reset to false only when a fresh
    // EVASION is entered (see setState below). lockerChecking/
    // lockerCheckPhase/lockerCheckIndex/lockerCheckPauseTime back the walk/
    // pause sub-machine itself (tickLockerCheck below); none of this is part
    // of the public contract, same status as sweeping/searchTime/etc. above.
    var lockerCheckDone = false;
    var lockerChecking = false;
    var lockerCheckPhase = null; // "walk" | "pause"
    var lockerCheckIndex = null;
    var lockerCheckPauseTime = 0;

    // Combat fire-timer (ALERT only — see file header COMBAT note). fireTimer
    // is a private per-guard clock, seconds since this ALERT engagement
    // began; nextFireAt is the next fireTimer value an attempt is eligible.
    // null nextFireAt means "not currently eligible for any state" (every
    // non-ALERT state), so tickAlert's own check is the only reader.
    var fireTimer = 0;
    var nextFireAt = null;

    // SLEEPING / dart state (new — see guard.tranq / SLEEPING in the file
    // header). sleepTime is seconds elapsed while SLEEPING (wakes at
    // GUARD.SLEEP_S). staggerActive/staggerElapsed track a non-headshot dart
    // hit's grace period before it finally puts the guard down (see update()
    // step 6). bodySpotTimers accumulates, per sleeping-colleague id, how
    // long THIS guard has had continuous sight of that body (see COLLEAGUE
    // DISCOVERY in the file header) — none of this is part of the public
    // contract, all internal bookkeeping.
    var sleepTime = 0;
    var staggerActive = false;
    var staggerElapsed = 0;
    var bodySpotTimers = {};

    // CQC / LOCKER state (new — see guard.cqc()/guard.stuffInLocker() in the
    // file header). lockerFacing is the remembered facing of whatever locker
    // this guard was last stuffed into — null whenever guard.hidden is false
    // (not part of the public contract; internal bookkeeping only, same
    // status as sleepTime/staggerActive above).
    var lockerFacing = null;

    function setState(newState, stimulus) {
      guard.state = newState;
      guard.stateTime = 0;
      if (stimulus) guard.stimulus = { x: stimulus.x, y: stimulus.y };
      // Every state transition resets the fire-timer; ALERT alone re-arms it
      // with a fresh FIRE_FIRST_DELAY_S grace period (see file header — this
      // is what makes an EVASION->ALERT re-engagement earn a fresh beat
      // instead of resuming a stale cadence, while re-broadcasting during an
      // ALREADY-ALERT state never reaches setState at all, per
      // broadcastAlert's own no-op-if-already-ALERT rule, so an ongoing
      // engagement's cadence is untouched).
      fireTimer = 0;
      nextFireAt = newState === "ALERT" ? GUARD.FIRE_FIRST_DELAY_S : null;
      if (newState === "PATROL" || newState === "CAUTION") {
        pausing = false;
        pauseTime = 0;
      }
      if (newState === "INVESTIGATE") {
        searching = false;
        searchTime = 0;
        // WEDGE GIVE-UP (see file header) — a fresh INVESTIGATE always earns
        // a fresh wedge-detection window, anchored at wherever this guard is
        // starting its walk from.
        investigateWedge.reset(guard.x, guard.y);
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
        // WEDGE GIVE-UP (see file header) — same reasoning as INVESTIGATE
        // above: a fresh EVASION converge earns a fresh window.
        evasionWedge.reset(guard.x, guard.y);
        // EVASION LOCKER CHECK (new — locker-check cycle, see file header) —
        // a fresh EVASION episode gets a fresh per-guard check slot, and any
        // leftover walk/pause sub-state from a previous episode is cleared
        // defensively (it should already be idle by the time a guard leaves
        // EVASION in practice, since the only exits are a fresh alert or
        // squad.tick's own 30s timer, neither of which happens mid-check).
        lockerCheckDone = false;
        lockerChecking = false;
        lockerCheckPhase = null;
        lockerCheckIndex = null;
        lockerCheckPauseTime = 0;
      }
      if (newState === "ALERT") {
        // WEDGE GIVE-UP (see file header) — anchors the no-LOS convergence
        // tracker at ALERT's own entry; tickAlert also re-anchors it every
        // tick hasLOS holds, so it only ever accumulates across a genuinely
        // continuous no-LOS stretch (see tickAlert below).
        alertWedge.reset(guard.x, guard.y);
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

      // WEDGE GIVE-UP (see file header) — a direct-line-plus-slide guard
      // chasing a stimulus tucked behind geometry can push into an
      // obstruction forever without ever reaching ARRIVE_DIST. If travel is
      // making no real progress over a rolling GUARD.WEDGE_WINDOW_S window,
      // give up on arriving and start searching right here instead.
      if (!searching && d > GUARD.ARRIVE_DIST && investigateWedge.check(guard.x, guard.y, d)) {
        searching = true;
        searchTime = 0;
        searchBaseFacing = guard.facing;
      }

      if (!searching && d > GUARD.ARRIVE_DIST) {
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
      fireTimer += dt;

      var target;
      if (guard.hasLOS) {
        squad.updateSighting(ctx.player.x, ctx.player.y);
        target = { x: ctx.player.x, y: ctx.player.y };
        // WEDGE GIVE-UP (see file header) — this branch chases the LIVE,
        // visible player, not a fixed point, so it's out of scope for wedge
        // detection; keep the no-LOS tracker re-anchored here so it only
        // ever accumulates across a genuinely continuous no-LOS stretch.
        alertWedge.reset(guard.x, guard.y);
      } else {
        squad.loseContact();
        target = squad.lastKnown || { x: guard.x, y: guard.y };
      }

      var d = distance(guard.x, guard.y, target.x, target.y);

      // WEDGE GIVE-UP (see file header) — only the no-LOS convergence-on-
      // lastKnown branch is a fixed-point travel that can wedge; if it's
      // making no real progress over a rolling GUARD.WEDGE_WINDOW_S window,
      // give up and hold position (ALERT has no search/sweep phase to fall
      // into) rather than pushing into the obstruction for as long as
      // squad.phase stays ALERT.
      var wedged = !guard.hasLOS && d > GUARD.ARRIVE_DIST && alertWedge.check(guard.x, guard.y, d);

      var stepLen;
      if (wedged) {
        stepLen = 0;
      } else if (guard.hasLOS) {
        stepLen = Math.min(GUARD.ALERT_SPEED * dt, Math.max(0, d - GUARD.ARREST_DIST));
      } else {
        stepLen = Math.min(GUARD.ALERT_SPEED * dt, d);
      }

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

      // COMBAT (see file header) — fire on the player. Only an ELIGIBLE tick
      // (fireTimer past nextFireAt) that also has LOS + is in range actually
      // fires; an eligible-but-blocked tick leaves nextFireAt untouched so
      // the guard fires the instant conditions are met, rather than waiting
      // out a full extra interval.
      if (nextFireAt !== null && fireTimer >= nextFireAt) {
        var distToPlayer = distance(guard.x, guard.y, ctx.player.x, ctx.player.y);
        if (guard.hasLOS && distToPlayer <= GUARD.FIRE_RANGE) {
          var chance = 0.75;
          if (ctx.player.moving) chance *= 0.5;
          if (ctx.player.stance === "crouch" || ctx.player.stance === "crawl") chance *= 0.5;
          var hit = rng.next() < chance;
          if (ctx.onGuardFire) ctx.onGuardFire(guard, hit);
          nextFireAt = fireTimer + GUARD.FIRE_INTERVAL_S;
        }
      }
    }

    // ---- EVASION (coordinated sweep — see file header) --------------------------

    // Finds the nearest world.zone.lockers[] index within
    // GUARD.LOCKER_CHECK_RANGE of this guard's CURRENT position that isn't
    // already in squad.checkedLockers, or null if none qualify (see EVASION
    // LOCKER CHECK in the file header). Read-only — reserving the result is
    // the caller's job (startEvasionSweep below), not this helper's.
    function findNearestUncheckedLocker() {
      var lockers = (world.zone && world.zone.lockers) || [];
      var bestIdx = null;
      var bestDist = Infinity;
      for (var i = 0; i < lockers.length; i++) {
        if (squad.checkedLockers && squad.checkedLockers[i]) continue;
        var d = distance(guard.x, guard.y, lockers[i].x, lockers[i].y);
        if (d <= GUARD.LOCKER_CHECK_RANGE && d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      return bestIdx;
    }

    // Begins the coordinated sweep (unchanged shape from before the
    // locker-check cycle) AND, the first time it's called this EVASION
    // episode (lockerCheckDone still false), tries to hand off to the
    // EVASION LOCKER CHECK sub-machine instead (see file header) — reserving
    // the chosen locker in squad.checkedLockers synchronously, right here,
    // before this guard has taken a single step toward it. Callers must
    // check `lockerChecking` afterward and dispatch to tickLockerCheck this
    // same tick if it came back true, rather than falling through to the
    // ordinary oscillating-sweep code.
    function startEvasionSweep() {
      sweeping = true;
      sweepTime = 0;
      sweepBaseFacing = guard.facing;

      if (!lockerCheckDone) {
        var idx = findNearestUncheckedLocker();
        if (idx !== null) {
          lockerCheckDone = true;
          lockerChecking = true;
          lockerCheckPhase = "walk";
          lockerCheckIndex = idx;
          lockerCheckPauseTime = 0;
          lockerCheckWedge.reset(guard.x, guard.y);
          squad.markLockerChecked(idx);
          sweeping = false; // suspended in favor of the locker-check walk
        }
      }
    }

    // Drives the EVASION LOCKER CHECK's own walk-to-locker / pause-and-ask
    // sub-machine (see file header) while lockerChecking is true. Owns dt
    // entirely for this guard this tick, same as tickInvestigate/tickAlert's
    // own travel legs — tickEvasion never runs its normal converge/sweep
    // logic in the same tick this is called.
    function tickLockerCheck(dt, ctx) {
      var lockers = (world.zone && world.zone.lockers) || [];
      var locker = lockers[lockerCheckIndex];
      if (!locker) {
        // Defensive: an invalid index can never actually resolve. Abort
        // cleanly rather than stranding this guard in a check that can
        // never finish — fall back to an ordinary sweep right here.
        lockerChecking = false;
        lockerCheckIndex = null;
        sweeping = true;
        sweepTime = 0;
        sweepBaseFacing = guard.facing;
        return;
      }

      if (lockerCheckPhase === "walk") {
        var d = distance(guard.x, guard.y, locker.x, locker.y);

        // WEDGE GIVE-UP (see file header) — INVESTIGATE-style: geometry
        // between the sweep-start position and the locker can wedge this
        // travel exactly like any other in this file. On a wedge, skip
        // straight to the pause+check step from wherever the guard got
        // stuck, matching INVESTIGATE's own "peer around whatever it ran
        // into" give-up shape.
        if (d > GUARD.ARRIVE_DIST && lockerCheckWedge.check(guard.x, guard.y, d)) {
          lockerCheckPhase = "pause";
          lockerCheckPauseTime = 0;
          return;
        }

        if (d > GUARD.ARRIVE_DIST) {
          var stepLen = Math.min(GUARD.ALERT_SPEED * dt, d);
          var ux = (locker.x - guard.x) / d;
          var uy = (locker.y - guard.y) / d;
          var res = world.moveCircle(guard.x, guard.y, ux * stepLen, uy * stepLen, guard.radius);
          guard.x = res.x;
          guard.y = res.y;
          guard.facing = Math.atan2(locker.y - guard.y, locker.x - guard.x);
        } else {
          guard.facing = Math.atan2(locker.y - guard.y, locker.x - guard.x);
          lockerCheckPhase = "pause";
          lockerCheckPauseTime = 0;
        }
        return;
      }

      // lockerCheckPhase === "pause" — hold, facing the locker, for
      // GUARD.LOCKER_CHECK_PAUSE seconds before actually asking the engine.
      guard.facing = Math.atan2(locker.y - guard.y, locker.x - guard.x);
      lockerCheckPauseTime += dt;
      if (lockerCheckPauseTime < GUARD.LOCKER_CHECK_PAUSE) return;

      var result = ctx.checkLocker ? ctx.checkLocker(lockerCheckIndex, guard.id) : "empty";
      lockerChecking = false;
      lockerCheckIndex = null;
      lockerCheckPauseTime = 0;

      if (result === "player") {
        // Engine already called squad.broadcastAlert (see file header — it
        // owns every consequence of a "player" result), so squad.lastKnown
        // is now the player's own fresh, real position. SNAP this guard's
        // facing toward it BEFORE setState("ALERT") — without this, the
        // guard would still be facing the LOCKER (wherever it paused) for
        // the remainder of THIS tick, and perception runs from a guard's
        // facing as of the START of a tick, so an unadjusted facing would
        // cost a full extra tick before this guard's own hasLOS could ever
        // read true again — long enough for squad.tick()'s own no-LOS decay
        // to flash ALERT back to EVASION before genuine contact ever had a
        // chance to register. Mirrors every other EVASION escalation path
        // in this file: setState() the instant a broadcast fires, rather
        // than waiting for next tick's radio-call sync to catch this guard
        // up — a genuine, continuing, physically-present target earns
        // immediate real pursuit, not a delayed one.
        if (squad.lastKnown) {
          guard.facing = Math.atan2(squad.lastKnown.y - guard.y, squad.lastKnown.x - guard.x);
        }
        setState("ALERT", null);
      } else {
        // "body" or "empty" — see file header EVASION LOCKER CHECK: a body
        // find is engine's own broadcastAlert (a real, if momentary, squad-
        // level event — see src/engine.js's own contract for why it is
        // deliberately NOT bridged into a lasting ALERT the way "player" is,
        // same "camera alert with no guard LOS" flash-through-and-settle
        // shape as CAMERAS DO NOT CONTRIBUTE TO anyLOS already documents),
        // but there is no live target for THIS guard to actually pursue —
        // resume the coordinated sweep right here exactly as an empty find
        // does. Critically, this guard's OWN state never leaves EVASION for
        // either outcome, so `sweeping` never gets reset back to false and
        // this guard can never re-select (and re-check) the SAME locker
        // again later this same episode, even if a squad-level flash back
        // through ALERT clears squad.checkedLockers in the meantime.
        sweeping = true;
        sweepTime = 0;
        sweepBaseFacing = guard.facing;
      }
    }

    function tickEvasion(dt, ctx) {
      if (guard.meter >= Game.VISION.SUSPICIOUS_AT) {
        squad.broadcastAlert(ctx.player.x, ctx.player.y);
        setState("ALERT", null);
        return;
      }

      // EVASION LOCKER CHECK (see file header) takes over entirely while
      // in progress — it owns this tick's dt instead of the normal
      // converge/sweep dispatch below.
      if (lockerChecking) {
        tickLockerCheck(dt, ctx);
        return;
      }

      var target = squad.lastKnown || { x: guard.x, y: guard.y };
      var d = distance(guard.x, guard.y, target.x, target.y);

      // WEDGE GIVE-UP (see file header) — a direct-line-plus-slide guard
      // converging on lastKnown can push into an obstruction forever without
      // ever reaching ARRIVE_DIST. If travel is making no real progress over
      // a rolling GUARD.WEDGE_WINDOW_S window, give up and begin the
      // coordinated sweep right here instead.
      if (!sweeping && d > GUARD.ARRIVE_DIST && evasionWedge.check(guard.x, guard.y, d)) {
        startEvasionSweep();
        if (lockerChecking) {
          tickLockerCheck(dt, ctx);
          return;
        }
      }

      if (!sweeping && d > GUARD.ARRIVE_DIST) {
        var stepLen = Math.min(GUARD.ALERT_SPEED * dt, d);
        var ux = (target.x - guard.x) / d;
        var uy = (target.y - guard.y) / d;
        var res = world.moveCircle(guard.x, guard.y, ux * stepLen, uy * stepLen, guard.radius);
        guard.x = res.x;
        guard.y = res.y;
        guard.facing = Math.atan2(target.y - guard.y, target.x - guard.x);
      } else {
        if (!sweeping) {
          startEvasionSweep();
          if (lockerChecking) {
            tickLockerCheck(dt, ctx);
            return;
          }
        }
        sweepTime += dt;
        var sweep =
          EVASION_SWEEP_AMPLITUDE * Math.sin(sweepTime * SEARCH_SWEEP_HZ * TWO_PI + sweepOffset);
        guard.facing = normalizeAngle(sweepBaseFacing + sweep);
      }
    }

    // ---- SLEEPING (see file header) ---------------------------------------------

    // Forces this guard into SLEEPING right now, overriding whatever state it
    // was in — used both by a headshot (guard.tranq(true), immediate) and by
    // a stagger clock expiring (guard.tranq(false)'s 3s grace period, see
    // update() step 6). setState resets stateTime/fireTimer as usual; sleep-
    // specific bookkeeping (sleepTime, meter, hasLOS) is reset here.
    function enterSleep() {
      setState("SLEEPING", null);
      sleepTime = 0;
      guard.meter = 0;
      guard.hasLOS = false;
      // Defensive invariant (see guard.tranq/cqc's own no-op-if-already-
      // SLEEPING guard): this only ever runs from a non-SLEEPING state, and
      // waking (tickSleeping below) always clears hidden/lockerFacing before
      // a guard can be put down again — so these are already false/null here
      // in practice. Reset explicitly anyway so "freshly asleep => never
      // hidden until explicitly stuffed" holds even if that invariant ever
      // drifts.
      guard.hidden = false;
      lockerFacing = null;
    }

    // Per-tick SLEEPING behavior (see update() step 0.5 and file header):
    // perception/movement/firing are all frozen; only the wake-up clock runs.
    function tickSleeping(dt) {
      guard.meter = 0;
      guard.hasLOS = false;
      sleepTime += dt;
      if (sleepTime >= GUARD.SLEEP_S) {
        sleepTime = 0;
        // WAKING INSIDE A LOCKER (see file header) — step 1m out along the
        // remembered locker facing, collision-safe via world.moveCircle,
        // BEFORE the INVESTIGATE stimulus is captured, so the guard
        // "notices something's off" at the spot it just stepped out to, not
        // at the locker's own position.
        if (guard.hidden) {
          var facing = lockerFacing !== null ? lockerFacing : guard.facing;
          var res = world.moveCircle(
            guard.x,
            guard.y,
            Math.cos(facing) * 1,
            Math.sin(facing) * 1,
            guard.radius
          );
          guard.x = res.x;
          guard.y = res.y;
          guard.hidden = false;
          lockerFacing = null;
        }
        setState("INVESTIGATE", { x: guard.x, y: guard.y });
      }
    }

    // COLLEAGUE DISCOVERY (see update() step 2.5 and file header) — checks
    // this guard's own sight against every SLEEPING colleague's body,
    // escalating to ALERT the instant one is confirmed. Only called while
    // guard.state is PATROL/SUSPICIOUS/INVESTIGATE/CAUTION (enforced by the
    // caller, update(), not re-checked here).
    function checkColleagueDiscovery(dt, ctx) {
      var sleeping = ctx.sleepingGuards;
      if (!sleeping || sleeping.length === 0) return;

      var viewer = {
        x: guard.x,
        y: guard.y,
        facing: guard.facing,
        range: GUARD.BODY_SPOT_RANGE,
      };

      for (var i = 0; i < sleeping.length; i++) {
        var body = sleeping[i];
        if (body.id === guard.id) continue; // can't spot yourself
        if (body.hidden) continue; // HIDDEN-BODY EXEMPTION -- see file header

        var key = String(body.id);
        var sight = vision.computeSight(viewer, body, { profile: 0.6 });
        if (sight.inCone && sight.hasLOS) {
          bodySpotTimers[key] = (bodySpotTimers[key] || 0) + dt;
          if (bodySpotTimers[key] >= GUARD.BODY_SPOT_CONFIRM_S) {
            squad.broadcastAlert(body.x, body.y);
            setState("ALERT", null);
            return; // this guard is now ALERT; stop checking other bodies this tick
          }
        } else {
          bodySpotTimers[key] = 0;
        }
      }
    }

    // ---- update / hearNoise -------------------------------------------------------

    function update(dt, ctx) {
      guard.stateTime += dt;

      // 0.5. SLEEPING short-circuit (see file header) — none of the normal
      // radio-call sync / perception / FSM dispatch / colleague discovery /
      // combat steps run at all; only the sleep timer + this state's own
      // MAX_STATE_S ceiling do, then (lone-squad only) squad.tick.
      if (guard.state === "SLEEPING") {
        tickSleeping(dt);
        var maxSleep = GUARD.MAX_STATE_S.SLEEPING;
        if (maxSleep !== undefined && guard.stateTime > maxSleep) {
          throw new Error(
            "guard " +
              guard.id +
              " stuck in SLEEPING for " +
              guard.stateTime.toFixed(2) +
              "s (max " +
              maxSleep +
              "s) — FSM invariant violated"
          );
        }
        if (ownSquad) {
          squad.tick(dt, false);
        }
        return;
      }

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

      // 2.5. Colleague discovery (see file header) — only while this guard
      // is PATROL/SUSPICIOUS/INVESTIGATE/CAUTION (never ALERT/EVASION, which
      // are already fully committed to the player's live contact). May jump
      // this guard straight to ALERT (see checkColleagueDiscovery) before the
      // FSM dispatch below ever runs, exactly like a colleague's radio call.
      if (
        guard.state === "PATROL" ||
        guard.state === "SUSPICIOUS" ||
        guard.state === "INVESTIGATE" ||
        guard.state === "CAUTION"
      ) {
        checkColleagueDiscovery(dt, ctx);
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

      // 6. Staggered dart check (see file header, guard.tranq/SLEEPING) —
      // runs AFTER everything above, so a staggered guard fully perceives/
      // moves/dispatches/fires as normal this tick right up until its clock
      // expires, at which point it's forced into SLEEPING, overriding
      // whatever step 1-5 just left it in.
      if (staggerActive) {
        staggerElapsed += dt;
        if (staggerElapsed >= GUARD.STAGGER_SLEEP_S) {
          staggerActive = false;
          enterSleep();
        }
      }
    }

    function hearNoise(x, y, strength) {
      if (guard.state === "ALERT" || guard.state === "EVASION" || guard.state === "SLEEPING") return;
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

    // guard.tranq(headshot) — see file header. External stimulus API called
    // by the engine (or a test/sim harness) the instant a fired dart hits
    // this guard.
    function tranq(headshot) {
      if (guard.state === "SLEEPING") return; // already asleep, no-op
      if (headshot) {
        enterSleep();
      } else {
        staggerActive = true;
        staggerElapsed = 0;
      }
    }

    // guard.cqc() — see file header. v1: choke === sleep, reuses enterSleep()
    // verbatim (same no-op-if-already-SLEEPING guard as tranq() above).
    function cqc() {
      if (guard.state === "SLEEPING") return;
      enterSleep();
    }

    // guard.stuffInLocker(locker) — see file header. No-op unless this guard
    // is currently SLEEPING (same defensive shape as tranq()/cqc()).
    function stuffInLocker(locker) {
      if (guard.state !== "SLEEPING") return;
      guard.x = locker.x;
      guard.y = locker.y;
      guard.hidden = true;
      lockerFacing = locker.facing;
    }

    // getState()/setState() (NEW — save/restore cycle, additive only, no
    // behavior change to update()/hearNoise()/tranq()/cqc()/stuffInLocker()).
    // getState() captures guard's ENTIRE mutable surface: both the flat,
    // externally-readable props listed in the file header (x/y/facing/state/
    // meter/stateTime/stimulus/waypointIndex/hasLOS/hidden — id/radius are
    // immutable for this guard's lifetime, so they're omitted; guard.squad is
    // a shared, externally-wired reference, not this guard's own state, so
    // restoring it is the CALLER's job, not this method's) AND every private
    // closure variable backing the pause/search/sweep/fire/sleep/stagger/
    // locker machinery documented throughout this file (pausing/pauseTime/
    // pauseBaseFacing, searching/searchTime/searchBaseFacing, sweeping/
    // sweepTime/sweepBaseFacing/sweepOffset, fireTimer/nextFireAt, sleepTime/
    // staggerActive/staggerElapsed/bodySpotTimers, lockerFacing, and — NEW,
    // locker-check cycle — lockerCheckDone/lockerChecking/lockerCheckPhase/
    // lockerCheckIndex/lockerCheckPauseTime/lockerCheckWedge, see EVASION
    // LOCKER CHECK above) — miss ANY one of these and a restored guard can
    // diverge from a live one the next time that particular sub-machine's
    // timer/flag matters (a mid-pause head-sweep, a mid-search arc, a
    // mid-EVASION coordinated sweep, an in-flight fire cadence, a
    // partially-elapsed sleep/stagger clock, a remembered locker-exit
    // facing, or a guard mid-walk/pause at a locker it's already reserved)
    // — see src/saveState.js's REPLAY GATE tests for exactly this failure
    // mode. bodySpotTimers is a plain {id: seconds} map — shallow-copied so
    // a caller mutating the returned snapshot's map can never reach back
    // into this guard's own live one.
    // NAMED getSaveState/applySaveState (NOT getState/setState) INTERNALLY —
    // this factory already declares a local function literally named
    // setState(newState, stimulus) (the FSM transition helper used
    // throughout PATROL/SUSPICIOUS/.../enterSleep/tranq/cqc above). A SECOND
    // local function declaration also named `setState` in this same scope
    // would hoist over/replace that first one (function declarations in the
    // same scope don't overload — the later one wins outright), silently
    // breaking every FSM transition in this file the instant this method was
    // added (caught by tests/*.tranq*/engine* going red — every FSM
    // transition started receiving a save-state OBJECT where it expected
    // (newState, stimulus) args). Distinct internal names sidestep the
    // collision entirely; guard.getState/guard.setState (the EXTERNAL,
    // public method names the save/restore contract requires) are just
    // assigned to point at these below.
    function getSaveState() {
      return {
        x: guard.x,
        y: guard.y,
        facing: guard.facing,
        state: guard.state,
        meter: guard.meter,
        stateTime: guard.stateTime,
        stimulus: guard.stimulus ? { x: guard.stimulus.x, y: guard.stimulus.y } : null,
        waypointIndex: guard.waypointIndex,
        hasLOS: guard.hasLOS,
        hidden: guard.hidden,
        pausing: pausing,
        pauseTime: pauseTime,
        pauseBaseFacing: pauseBaseFacing,
        searching: searching,
        searchTime: searchTime,
        searchBaseFacing: searchBaseFacing,
        sweeping: sweeping,
        sweepTime: sweepTime,
        sweepBaseFacing: sweepBaseFacing,
        sweepOffset: sweepOffset,
        fireTimer: fireTimer,
        nextFireAt: nextFireAt,
        sleepTime: sleepTime,
        staggerActive: staggerActive,
        staggerElapsed: staggerElapsed,
        bodySpotTimers: Object.assign({}, bodySpotTimers),
        lockerFacing: lockerFacing,
        investigateWedge: investigateWedge.getState(),
        evasionWedge: evasionWedge.getState(),
        alertWedge: alertWedge.getState(),
        // EVASION LOCKER CHECK state (new — locker-check cycle, see file
        // header) — miss ANY of these and a restored guard mid-check (or
        // one that had already latched lockerCheckDone this episode) could
        // re-check a locker, double-reserve one, or lose its place mid-walk/
        // pause, the same "replay gate" failure mode every other sub-machine
        // here already guards against.
        lockerCheckDone: lockerCheckDone,
        lockerChecking: lockerChecking,
        lockerCheckPhase: lockerCheckPhase,
        lockerCheckIndex: lockerCheckIndex,
        lockerCheckPauseTime: lockerCheckPauseTime,
        lockerCheckWedge: lockerCheckWedge.getState(),
      };
    }

    // applySaveState(s) — the mirror of getSaveState() above: overwrites
    // every flat prop AND every private closure var it captured. Deliberately
    // does NOT touch guard.id/guard.radius (immutable) or guard.squad (a
    // shared, externally-wired reference — see getSaveState's own note); the
    // caller (src/saveState.js) is responsible for having wired this guard to
    // the correct squad instance BEFORE calling guard.setState.
    function applySaveState(s) {
      guard.x = s.x;
      guard.y = s.y;
      guard.facing = s.facing;
      guard.state = s.state;
      guard.meter = s.meter;
      guard.stateTime = s.stateTime;
      guard.stimulus = s.stimulus ? { x: s.stimulus.x, y: s.stimulus.y } : null;
      guard.waypointIndex = s.waypointIndex;
      guard.hasLOS = s.hasLOS;
      guard.hidden = s.hidden;
      pausing = s.pausing;
      pauseTime = s.pauseTime;
      pauseBaseFacing = s.pauseBaseFacing;
      searching = s.searching;
      searchTime = s.searchTime;
      searchBaseFacing = s.searchBaseFacing;
      sweeping = s.sweeping;
      sweepTime = s.sweepTime;
      sweepBaseFacing = s.sweepBaseFacing;
      sweepOffset = s.sweepOffset;
      fireTimer = s.fireTimer;
      nextFireAt = s.nextFireAt;
      sleepTime = s.sleepTime;
      staggerActive = s.staggerActive;
      staggerElapsed = s.staggerElapsed;
      bodySpotTimers = Object.assign({}, s.bodySpotTimers);
      lockerFacing = s.lockerFacing;
      investigateWedge.setState(s.investigateWedge);
      evasionWedge.setState(s.evasionWedge);
      alertWedge.setState(s.alertWedge);
      // EVASION LOCKER CHECK state (new — locker-check cycle) — falls back
      // to the same "fresh, idle" defaults a brand-new EVASION entry would
      // have for a save captured before this cycle (same defensive posture
      // as engine.js's own stats/zoneStash fallback in its setState).
      lockerCheckDone = s.lockerCheckDone || false;
      lockerChecking = s.lockerChecking || false;
      lockerCheckPhase = s.lockerCheckPhase !== undefined ? s.lockerCheckPhase : null;
      lockerCheckIndex = s.lockerCheckIndex !== undefined ? s.lockerCheckIndex : null;
      lockerCheckPauseTime = s.lockerCheckPauseTime || 0;
      if (s.lockerCheckWedge) lockerCheckWedge.setState(s.lockerCheckWedge);
    }

    guard.update = update;
    guard.hearNoise = hearNoise;
    guard.tranq = tranq;
    guard.cqc = cqc;
    guard.stuffInLocker = stuffInLocker;
    guard.getState = getSaveState;
    guard.setState = applySaveState;

    // rng now backs ALERT's fire-accuracy roll (see tickAlert/COMBAT above);
    // kept alive on the guard too in case future callers want it directly.
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
