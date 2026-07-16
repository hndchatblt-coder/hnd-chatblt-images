// src/engine.js
// PUBLIC API:
//   Game.createEngine(opts?) -> engine, where opts = { zoneData?, seed?, guardConfigs? }
//     zoneData     — a Game.ZONES.* zone (src/world.js). Default Game.ZONES.loadingDock.
//     seed         — RNG seed (src/rng.js). Default 1.
//     guardConfigs — [{ id, spawn, waypoints }, ...] passed straight through to
//                    Game.createGuard (src/guardAI.js) for each guard, sharing
//                    one squad. Default (opts.guardConfigs omitted): looked up
//                    from an internal per-zone table, ZONE_GUARDS, keyed by
//                    zoneData.id —
//                      loadingDock: [{ id: "g1", spawn: zone.waypoints[0],
//                                      waypoints: zone.waypoints }]
//                      warehouse:   [{ id: "w1", spawn: zone.waypoints[0],
//                                      waypoints: zone.waypoints },
//                                    { id: "w2", spawn: zone.waypoints2[0],
//                                      waypoints: zone.waypoints2 }]
//                    Any zone.id not in ZONE_GUARDS (e.g. a custom zoneData
//                    passed straight into a test) falls back to the single-
//                    guard-on-`waypoints` default above. This same table is
//                    what re-populates guards on a zone TRANSITION (see below)
//                    — it is not just an opts default.
//
//   Construction wires up the full module stack in dependency order:
//     rng         = Game.createRng(seed)
//     world       = Game.createWorld(zoneData)
//     soundEvents = Game.createSoundEvents({ world: world })
//     vision      = Game.createVision({ world: world })
//     squad       = Game.createSquad()
//     player      = Game.createPlayer({ world: world })
//     guards      = guardConfigs.map(cfg => Game.createGuard({
//                world: world, vision: vision, rng: rng, squad: squad,
//                spawn: cfg.spawn, waypoints: cfg.waypoints, id: cfg.id,
//              }))
//     director    = Game.createDirector({ world: world, vision: vision, squad: squad })
//              — NEW (see src/director.js's own contract for the full
//              write-up). Owns this zone's wall-mounted security cameras
//              (zone.cameras, empty-safe — a zone with no camera data just
//              gets a director with an empty roster); rebuilt fresh on every
//              zone transition exactly like world/vision/squad/guards above
//              (see switchZone below).
//
//   engine — flat, readable props (mutated in place by tick()):
//     world, player, guards (array), squad, vision, director, rng,
//       soundEvents, inventory, zone — the wired instances/data above (zone === zoneData,
//       the plain-object level data; soundEvents is the
//       Game.createSoundEvents({world}) instance — see src/soundEvents.js
//       contract; director is the Game.createDirector({...}) instance above —
//       see src/director.js contract; inventory is the Game.createInventory()
//       instance — see src/items.js contract).
//     DT        — 1/60 (constant fixed timestep, seconds). Every tick() call
//                 advances the simulation by exactly this much regardless of
//                 wall-clock time — the engine has NO notion of real time; the
//                 caller (render loop, test, sim) decides when/how often to
//                 call tick().
//     tickCount — integer, number of tick() calls so far (starts at 0).
//     time      — tickCount * DT, seconds of simulated time elapsed.
//     gameOver  — boolean, true when player.hp reached 0 (latched — never
//                 reverts to false once set, see GAME OVER below). tick() is
//                 a no-op while gameOver is true, so simulation is frozen.
//     dragging  — NEW (CQC/locker cycle): guardId | null. The id of the
//                 guard currently being dragged (see DRAG VERB below), or
//                 null when nothing is in tow. Reset to null on a zone
//                 transition (see switchZone).
//     playerHidden — NEW (CQC/locker cycle): boolean, true while the player
//                 is tucked inside a locker (see LOCKER VERB below). Reset to
//                 false on a zone transition (see switchZone).
//     chaffUntil — CHAFF VERB: absolute sim-time deadline (compared against
//                 engine.time, never a countdown counter), 0 meaning "never
//                 thrown yet". Mission-scoped, NOT reset by switchZone.
//     stats     — MISSION STATS (new — win-state cycle): mission-scoped stats
//                 object with fields alertsTotal, dartsFired, cqcTakedowns,
//                 kills, rationsUsed, chaffUsed, savesUsed, knocksMade,
//                 missionTimeS. Mission-scoped, NOT reset by switchZone.
//     missionComplete — EXTRACTION / RANK (new — win-state cycle): boolean,
//                 true when player has extracted from Comms Tower roof
//                 (mission victory). Mission-scoped, NOT reset by switchZone.
//     events    — array of event objects emitted by the MOST RECENT tick()
//                 only; cleared at the start of every tick() (i.e. it is NOT
//                 a running log — read it right after calling tick() if you
//                 want that tick's events). Current shapes:
//                   { type: "phaseChange", from, to } — squad.phase changed
//                     this tick (from/to are phase strings).
//                   { type: "alert", x, y } — squad.alertCount increased this
//                     tick (a NEW incident, per squad.broadcastAlert's
//                     alertCount rule — see guardAI.js contract); x,y are
//                     squad.lastKnown at the moment the alert fired.
//                   { type: "knock", x, y } — input.knock had a false->true
//                     edge THIS tick AND the player was adjacent to a wall
//                     (see KNOCK VERB below); x,y are the player's position
//                     at the moment of the knock. Fires at most once per
//                     edge, regardless of whether any guard heard it.
//                   { type: "tranqFired", hit, headshot, guardId, impact } —
//                     input.fire had a false->true edge THIS tick AND the
//                     inventory had a dart to spend (see FIRE VERB below).
//                     hit/headshot/guardId mirror inventory.fireTranq()'s
//                     return (headshot/guardId are undefined on a miss);
//                     impact is { x, y }, the dart's final resting point —
//                     included (beyond items.js's own return shape) because
//                     src/render.js's dart-tracer effect needs somewhere to
//                     read it from (see FIRE VERB below and render.js's own
//                     contract for how it consumes this same-tick event).
//                     Does NOT fire if the inventory was already empty (no
//                     dart spent, nothing to report).
//                   { type: "noiseHeard", guardId, x, y, strength } — one per
//                     guard that heard ANY sound this tick (movement noise
//                     and/or a knock), per soundEvents.emit/emitRadius's
//                     return value (see src/soundEvents.js contract); x,y are
//                     the sound's ORIGIN (not the guard's position), strength
//                     is "faint" or "strong". If a guard hears more than one
//                     sound in the same tick, one event is pushed per sound.
//                   { type: "zoneChange", from, to } — the player crossed a
//                     resolvable zone.exits[] trigger this tick while
//                     squad.phase was INFILTRATION (see ZONE TRANSITIONS
//                     below); from/to are zone id strings.
//                   { type: "zoneBlocked", to } — the player stood in a
//                     zone.exits[] trigger whose `to` does not resolve to a
//                     built Game.ZONES entry (e.g. the warehouse's laboratory
//                     stub). Edge-triggered like "knock": fires once when the
//                     player ENTERS the trigger region, not once per tick
//                     spent standing in it (see ZONE TRANSITIONS below).
//                   { type: "guardFire", guardId, hit } — a guard in ALERT
//                     took a shot this tick (see COMBAT below); hit is the
//                     boolean outcome of guardAI.js's own accuracy roll.
//                     Fired regardless of hit/miss — a miss is still an
//                     observable shot (muzzle flash/sound cue material for a
//                     future render/audio hookup).
//                   { type: "playerHit", hp } — a guardFire this tick was a
//                     HIT and player.damage() was applied; hp is
//                     player.hp AFTER the damage (so consecutive playerHit
//                     events across a firefight read as a strictly
//                     decreasing sequence while the player survives).
//                   { type: "cqc", guardId } — a CQC takedown connected this
//                     tick (see CQC VERB above); the named guard is now
//                     SLEEPING.
//                   { type: "cqcMiss" } — a CQC edge fired but conditions
//                     weren't met, AND some guard was within 2.5m of the
//                     player (see CQC VERB above for the exact eligibility
//                     rule and the reason for the 2.5m feedback-without-spam
//                     gate).
//                   { type: "busy" } — a fire edge occurred while
//                     engine.dragging was set (see DRAG VERB above); no dart
//                     spent, no tranqFired.
//                   { type: "gameOver" } — player.hp reached 0 this tick (see
//                     GAME OVER below). Fires exactly once, the tick hp hits
//                     0; never again afterward (engine.gameOver latches, and
//                     a latched engine stops ticking altogether — see below).
//                   { type: "cameraSuspicious", cameraIndex } — one of
//                     director.tickCameras' cameras crossed
//                     Game.VISION.SUSPICIOUS_AT from below THIS tick (see
//                     src/director.js contract) — edge-triggered, fires again
//                     on a later re-crossing, never spams every tick spent
//                     above the line.
//                   { type: "cameraAlert", cameraIndex } — one of
//                     director.tickCameras' cameras reads >= Game.VISION.
//                     ALERT_AT THIS tick (see src/director.js contract) —
//                     LEVEL-triggered (fires every such tick, not just the
//                     first), same tick director itself already called
//                     squad.broadcastAlert.
//                   { type: "pickup", item } — the player walked within 0.7m
//                     of a zone.pickups[] entry this tick and it was
//                     collected (see PICKUPS below); item is that entry's
//                     opaque item string ("keycardL1"/"keycardL2"/
//                     "keycardL3"/"chaff" this cycle).
//                   { type: "doorOpen", id } — a zone.doors[] entry
//                     transitioned closed->open this tick, either an
//                     unlocked door on mere proximity or a locked one the
//                     player just badged through (see DOORS below); id is
//                     that door's own id.
//                   { type: "doorClose", id } — a zone.doors[] entry
//                     transitioned open->closed this tick (nobody within
//                     DOOR_PROXIMITY_DIST for DOOR_AUTO_CLOSE_S seconds — see
//                     DOORS below). Not required reading for any test this
//                     cycle asks for, but harmless/additive, same "open set"
//                     posture as every event here.
//                   { type: "laserTripped", laserIndex } — the player's
//                     movement this tick crossed an ACTIVE zone.lasers[]
//                     beam while not engine.playerHidden (see LASERS below /
//                     src/director.js's own laser contract); this is the
//                     SAME tick director.tickLasers already called
//                     squad.broadcastAlert.
//                   { type: "reinforcement", guardId } — director.tickEscalation
//                     spawned a fresh ALERT-reinforcement guard at
//                     zone.guardDoor this tick (see src/director.js's own
//                     ESCALATION contract for the 6s/10s/max-3 timing and the
//                     zone-visit-scoped cap). guardId is the new guard's own
//                     id ("reinf-<n>"); the guard itself is already present
//                     in engine.guards by the time this event is read.
//                   { type: "missedCheckIn", guardId, searcherId } —
//                     director.tickEscalation found `guardId` SLEEPING at its
//                     own scheduled 40s radio check-in this tick and
//                     dispatched `searcherId` (an awake PATROL guard) to
//                     investigate the missing guard's CURRENT position (see
//                     src/director.js's own ESCALATION contract for why
//                     "current position, not last patrol post" is the
//                     deliberate choice, and for the "one active search per
//                     missed guard, repeats every 40s while still missing"
//                     rule). Does NOT by itself mean an alert is coming —
//                     the searcher's own ordinary INVESTIGATE/COLLEAGUE
//                     DISCOVERY machinery (src/guardAI.js) decides that, same
//                     as any other body-spot.
//                   { type: "lockerDiscovery", found, lockerIndex, guardId } —
//                     see EVASION LOCKER CHECK below: a guard's own
//                     ctx.checkLocker(lockerIndex, guardId) call (from
//                     src/guardAI.js's EVASION sweep — see its own contract)
//                     resolved this tick. found is "player" | "body" |
//                     "empty" (mirrors engine.checkLocker's own return
//                     value); lockerIndex/guardId identify which
//                     zone.lockers[] entry and which guard. Fires exactly
//                     once per resolved check, regardless of outcome.
//                 More event types will be appended by later modules — treat
//                 `type` as an open set and always branch on it, never
//                 assume this is the full list.
//
//   CQC VERB — Q key, input.cqc (boolean), EDGE-TRIGGERED exactly like knock/
//   fire (private prevCqc closure state, false->true only): on that edge,
//   this module (not guardAI.js) decides eligibility by finding the
//   NEAREST guard to the player satisfying ALL of:
//     - distance(player, guard) <= 1.4m,
//     - guard.state !== "SLEEPING" (an awake target — you can't CQC a body
//       that's already down),
//     - the guard is BEHIND: the absolute angular difference between
//       guard.facing and the guard->player direction is > 100 degrees, and
//     - squad.phase !== "ALERT" (can't grab someone actively shooting at
//       you — see the file's own "no zone-changing mid-alert"-style design
//       preference for gating stealth verbs behind squad state).
//   A qualifying guard: calls guard.cqc() (see src/guardAI.js contract — v1
//   is CHOKE === SLEEP, same enterSleep() path/timer as a headshot dart),
//   pushes { type: "cqc", guardId }, and emits a SOFT ("faint") thud at the
//   guard's own position: soundEvents.emitRadius(guard.x, guard.y, 3, false,
//   guards) — deliberately NOT one of soundEvents.js's named RADII kinds (no
//   "cqc" entry exists there), since 3m/faint is specific to this one verb;
//   any listener that heard it pushes the usual
//   { type: "noiseHeard", guardId, x, y, strength: "faint" }. No qualifying
//   guard: pushes { type: "cqcMiss" } ONLY if some guard (any state, any
//   angle) was within 2.5m of the player — feedback that the button press
//   registered without spamming an event on every empty-handed Q press
//   halfway across the zone. CQC is also silently inert (no cqc, no
//   cqcMiss) while engine.playerHidden or engine.dragging — see LOCKER
//   VERB / DRAG VERB below; both hands are full/occupied in either state,
//   an intentional, documented restriction beyond the three conditions
//   above.
//
//   DRAG VERB / LOCKER VERB — G key, input.drag (boolean), EDGE-TRIGGERED
//   exactly like knock/fire/cqc (private prevDrag closure state). Unlike
//   every other verb, a single G edge means a DIFFERENT thing depending on
//   engine.playerHidden/engine.dragging/proximity-to-a-locker — see
//   handleDragKey()'s own inline comments for the exact priority order (this
//   header gives the shape; the code is the source of truth for edge cases):
//     1. engine.playerHidden === true: this press always means EXIT the
//        locker, regardless of anything else (see LOCKER below).
//     2. Else, if the player is within LOCKER_INTERACT_DIST (1.0m) of ANY
//        zone.lockers[] entry (nearest one wins): LOCKER context —
//          - engine.dragging set (a body in tow): STUFF that guard into the
//            locker (guard.stuffInLocker(locker) — see guardAI.js contract),
//            clear engine.dragging.
//          - engine.dragging not set: HIDE the player — engine.playerHidden
//            = true, remembering the locker (private, for the exit step).
//     3. Else (no locker in range): DRAG context —
//          - engine.dragging set: RELEASE (engine.dragging = null; the
//            guard is left exactly where its last drag-follow tick put it —
//            see below).
//          - engine.dragging not set: ATTACH to the NEAREST SLEEPING,
//            not-already-hidden guard within DRAG_ATTACH_DIST (1.2m), if
//            any (engine.dragging = that guard's id). A guard already
//            guard.hidden (mid-locker-stuff — should never actually be
//            reachable via the player, since a hidden body's position IS
//            the locker's, but excluded defensively) is not a valid attach
//            target.
//   DRAG FOLLOW (every tick engine.dragging is set, AFTER player.update so
//   it uses this tick's fresh position/facing): the dragged guard's x/y are
//   set directly to 0.9m behind the player along the player's OWN facing
//   (guard.x = player.x - cos(player.facing)*0.9, same for y) — a plain
//   position overwrite, not a guard.update()-mediated move (the guard is
//   SLEEPING throughout a drag; its own update() still runs every tick per
//   the normal guard loop below, short-circuiting at guardAI.js's SLEEPING
//   step 0.5 exactly as it would if nobody were dragging it — see
//   guardAI.js's own note on x/y being externally mutable while SLEEPING).
//   HONEST GAP: GUARD.SLEEP_S is 60s, so a sufficiently long drag (a real
//   playthrough is very unlikely to hold a drag that long, but nothing
//   PREVENTS it) can let the dragged guard's own sleep clock expire mid-drag
//   — it would wake into INVESTIGATE at whatever position this tick's drag-
//   follow last wrote, while engine.dragging remains set and continues
//   overwriting that now-awake guard's position every subsequent tick. This
//   is not handled specially this cycle (same "documented, not hacked in"
//   posture as engine.js's own VISION STAGGERING gap below) — a future cycle
//   could auto-release the drag the instant the dragged guard's state
//   leaves SLEEPING.
//   DRAG SPEED CAP: player.js has no speed-cap hook (see its own contract —
//   speed is a pure function of stance/run), so rather than modify it, this
//   module scales the ALREADY-normalized input.moveX/moveY by 0.55 whenever
//   engine.dragging is set, BEFORE calling player.update() — the player
//   still walks/runs/crouches through its own normal state machine, just
//   covering 55% of the distance per tick it otherwise would.
//   NO FIRING WHILE DRAGGING: a fire edge (see FIRE VERB below) that occurs
//   while engine.dragging is set does not call inventory.fireTranq() at all
//   — it pushes { type: "busy" } instead (both hands are full) and still
//   consumes the edge (no event spam if the key is held).
//   LOCKER — HIDE / EXIT: entering sets engine.playerHidden = true (frozen
//   input while hidden — see FROZEN INPUT below) and remembers the locker
//   privately; the matching EXIT (priority 1 above) steps the player 1m out
//   along the LOCKER's own `facing` (via world.moveCircle, collision-safe)
//   and restores normal input immediately, same tick. GUARD PERCEPTION GATE
//   (this is the "least invasive" approach flagged as a design choice — see
//   BACKLOG-adjacent notes in this cycle's design brief): rather than
//   threading a visibility flag through guardAI.js/vision.js, this module
//   simply hands every guard.update() call a DECOY player object (same
//   shape as the real player — x, y, facing, visionProfile(), moving,
//   stance — but parked at x=-9999,y=-9999, permanently out of any zone's
//   vision RANGE) instead of the real `player`, for as long as
//   engine.playerHidden is true. guardAI.js/vision.js are completely
//   unaware this ever happens — from their side it's an ordinary target
//   that's simply always out of range, which is exactly "invisible to guard
//   vision" without a single line of change to either module. This also
//   means a guard cannot fire on a hidden player (hasLOS on the decoy is
//   always false) as a natural side effect, not a separately-coded rule.
//   FROZEN INPUT while playerHidden: input.moveX/moveY/run are zeroed (so
//   player.moving/noiseRadius() both read false/0 — a hidden player is
//   silent and stationary) and the fire/cqc verbs are skipped entirely for
//   that tick (checked AFTER this same tick's G-edge processing, so a G
//   press that JUST exited the locker this tick restores full control
//   immediately, same "acts immediately" convention as every other edge verb
//   in this file). Only the G key itself (the exit path) ever reads while
//   hidden.
//   ZONE-SCOPED: engine.dragging/engine.playerHidden (and the private
//   remembered locker) are reset on every switchZone() call, same v1
//   semantics as the guard roster itself being discarded rather than
//   carried across a transition — a dragged guard belongs to the departing
//   zone's roster and a hidden-in-a-locker player has no locker to return to
//   in the new zone.
//
//   EVASION LOCKER CHECK (new — locker-check cycle; the counter to hiding in
//   a locker mid-chase, see src/guardAI.js's own EVASION LOCKER CHECK
//   contract for the guard-side walk/pause behavior this backs. DESIGN.md
//   pillar 4, Consequence: recoverable chaos — a sweeping guard checking a
//   NEARBY locker is exactly that kind of tense, winnable scramble, not an
//   instant failure the moment you duck out of sight, while a locker far
//   from the guard's own sweep stays genuinely safe — the skill expression
//   is breaking LOS and putting distance in BEFORE hiding, not the hide
//   itself). checkLocker(lockerIndex, guardId) is handed to every
//   guard.update() call this tick (alongside player/onGuardFire/
//   sleepingGuards — see the GUARD PERCEPTION GATE / BOX PERCEPTION note
//   below for how `player` itself gets wrapped); a guard (see
//   src/guardAI.js's own contract — only ever during an EVASION sweep) calls
//   it once it has walked to and paused at an eligible nearby locker. This
//   module — not guardAI.js — owns every consequence of a non-"empty"
//   result:
//     - engine.playerHidden is true AND this zone's OWN hiddenLocker
//       (the {x,y,facing} locker the player is actually tucked into, private
//       to this module — see LOCKER VERB above) is the SAME locker object as
//       zone.lockers[lockerIndex]: PLAYER FOUND. The player is thrown out
//       exactly like a normal G-key EXIT LOCKER (world.moveCircle, 1m along
//       the locker's own facing, collision-safe), engine.playerHidden is
//       cleared (so every guard's own perception sees the REAL, now-visible
//       player starting next tick — no separate "reveal" mechanism, it's the
//       same GUARD PERCEPTION GATE wrapper simply no longer substituting a
//       decoy), squad.broadcastAlert(player.x, player.y) is called AT THAT
//       SPOT, and { type: "lockerDiscovery", found: "player", lockerIndex,
//       guardId } is pushed. Returns "player".
//     - Otherwise, some guards[i] has .hidden === true AND sits exactly at
//       this locker's own {x,y} (see src/guardAI.js's stuffInLocker contract
//       — a stuffed guard's position IS the locker's position, by
//       construction, so an exact coordinate match is a safe, cheap test):
//       BODY FOUND. squad.broadcastAlert(locker.x, locker.y) is called; the
//       body itself STAYS in the locker (hidden flag untouched) — it was
//       found and an alert raised, but nobody actually un-stuffs it (the
//       simplest honest semantics: this cycle has no "drag a body back out
//       of a locker" verb, so there is nothing else TO do with it). Pushes
//       { type: "lockerDiscovery", found: "body", lockerIndex, guardId }.
//       Returns "body".
//     - Neither: EMPTY. Pushes { type: "lockerDiscovery", found: "empty",
//       lockerIndex, guardId } and returns "empty" — guardAI.js resumes the
//       guard's ordinary coordinated sweep from here (see its own contract).
//   REGAINED-CONTACT BRIDGE FOR squad.tick()'s OWN LOS GATE — "player" ONLY,
//   deliberately NOT "body" (see below for why the two differ): a "player"
//   discovery calls squad.broadcastAlert DURING the guard-update loop
//   (before squad.tick() runs later this same tick), but the perception step
//   that already ran this tick (for every guard, including the one that just
//   found the locker) used the DECOY player from BEFORE playerHidden was
//   cleared — so no guard's own hasLOS is true this tick as a side effect of
//   the discovery, same as a director-reported camera alert (see CAMERAS DO
//   NOT CONTRIBUTE TO anyLOS below). Left alone, squad.tick(DT, anyLOS=false)
//   would immediately decay the phase it just set back to EVASION before
//   tick() even returns — exactly the camera behavior, but WRONG for a
//   genuinely visible, adjacent, continuing target: src/guardAI.js's own
//   contract already snaps the finding guard's facing toward squad.lastKnown
//   and setState("ALERT")s it immediately, so that guard's OWN hasLOS reads
//   true starting the VERY NEXT tick (real, continuing contact) — but THIS
//   tick, the tick discovery happens on, still needs a bridge, or the phase
//   would flash to ALERT and revert to EVASION before that next tick ever
//   arrives. So: this tick's anyLOS computation (see below, same spot the
//   CAMERAS note lives) is `guards.some(hasLOS) || lockerContactThisTick` —
//   a private per-tick flag, reset false at the top of every tick(), set
//   true by checkLocker() ONLY on a "player" result.
//   "body" is DIFFERENT ON PURPOSE: there is no live target behind a stuffed
//   colleague, so nothing will EVER make any guard's hasLOS genuinely true
//   afterward — bridging it here would only buy one extra tick before the
//   inevitable decay, at real cost: src/guardAI.js's own contract, for
//   exactly this reason, does NOT setState("ALERT") a guard on a "body"
//   result (it resumes its sweep, exactly like "empty"), so this guard's own
//   state never actually leaves EVASION for a body find. A "body" discovery
//   is therefore squad.broadcastAlert's plain, unbridged shape — the SAME
//   "flash to ALERT, decay back to EVASION before tick() even returns" shape
//   CAMERAS DO NOT CONTRIBUTE TO anyLOS already documents for a camera alert
//   with no guard LOS. Bridging "body" too would not change what any guard
//   actually does (still no setState, still resumes its sweep) — it would
//   only let squad.phase sit at ALERT for one real tick, during which the
//   NEXT tick's radio-call sync (src/guardAI.js's own step 1) would force
//   EVERY guard on the squad into ALERT and then, the tick after, back into
//   a FRESH EVASION re-entry the moment the bridge's one extra tick runs out
//   — and a fresh EVASION re-entry resets squad.checkedLockers (see
//   src/guardAI.js's own checkedLockers contract), which would let THIS
//   SAME, already-resolved locker become eligible again and re-trigger an
//   identical check, forever, never letting squad.phaseTime accumulate
//   toward GUARD.EVASION_S at all. Leaving "body" unbridged sidesteps that
//   failure mode entirely by never forcing any guard through state churn in
//   the first place. This is engine's own call ("engine owns consequences"),
//   not a guardAI.js/vision.js change.
//
//   FIRE VERB — tranq pistol (new this cycle): input.fire (boolean) is
//   EDGE-TRIGGERED exactly like input.knock (see KNOCK VERB below) — engine
//   tracks the previous tick's input.fire internally and only acts on a
//   false->true transition. On that edge: calls engine.inventory.fireTranq
//   (engine) (see src/items.js contract — reads player/world/guards, spends
//   a dart, returns { fired, hit, guardId?, headshot?, impact }). If
//   !result.fired (inventory was already empty), nothing else happens — no
//   event, no noise, per items.js's own contract. Otherwise:
//     1. Pushes { type: "tranqFired", hit, headshot, guardId, impact } (see
//        the tranqFired event shape above).
//     2. Emits dart-impact NOISE at the impact point — a SHARP ("strong")
//        stimulus regardless of hit/miss, same convention as the knock verb
//        and guard-fire's own gunshot noise: soundEvents.emit(impact.x,
//        impact.y, "dartImpact", guards) (SOUND.RADII.dartImpact = 5m
//        unattenuated, SOUND.SHARP.dartImpact = true — both already defined
//        in src/soundEvents.js). Any listener that heard it pushes
//        { type: "noiseHeard", guardId, x, y, strength: "strong" }, same
//        shape/x-y-is-the-sound's-origin convention as every other noiseHeard
//        push in this file. This is what lets a miss (or even a hit) pull an
//        uninvolved third guard elsewhere in the zone into INVESTIGATE — the
//        SAME hearNoise("strong") pathway a knock or gunshot uses.
//     3. If result.hit: finds the hit guard in the CURRENT guards array by
//        result.guardId and calls guard.tranq(result.headshot) on it (see
//        src/guardAI.js's guard.tranq contract for the headshot-vs-stagger
//        behavior). items.js itself never calls guard.tranq or emits noise
//        — see its own ENGINE-AGNOSTIC note — this is the engine doing both,
//        exactly like it turns guardAI's onGuardFire callback into
//        damage/events below.
//   Runs in the same NOISE STEP position as the knock verb (step 2, after
//   player.update, before any guard.update), so a dart fired this tick is
//   already reflected in guard.state (the hit guard's SLEEPING/staggering,
//   any bystander's hearNoise-driven INVESTIGATE) by the time step 3's
//   guard.update() runs this same tick.
//
//   BOX VERB — cardboard box (new this cycle): B key, input.box (boolean),
//   EDGE-TRIGGERED exactly like drag/cqc (private prevBox closure state,
//   false->true only) — but unlike every other edge verb, this one is a
//   TOGGLE of engine.inventory.boxOn rather than a one-shot action. On that
//   edge: if engine.dragging or engine.playerHidden is set, the press is
//   silently swallowed (no toggle — see src/items.js's BOX / DRAG / LOCKER
//   INTERACTION MATRIX: you can't pull the box on mid-drag or while hidden
//   in a locker). Otherwise: inventory.boxOn = !inventory.boxOn. This is
//   processed in the same CQC/DRAG/LOCKER block as those verbs, BEFORE
//   player.update, so a same-tick toggle is reflected in this tick's speed
//   cap / vision-wrap below.
//   THE OTHER HALF OF THE MATRIX (see items.js): a dragEdge is only acted
//   on (handleDragKey() called) while !inventory.boxOn — G is entirely dead
//   while boxed, covering both its attach/hide AND release/exit branches in
//   one gate (there is no live "boxed + dragging/hidden" state to carve
//   exceptions out of, since neither can start while the other holds).
//   BOX SPEED CAP: identical mechanism/rationale to DRAG SPEED CAP above —
//   player.js has no speed-cap hook, so this module scales the
//   ALREADY-normalized input.moveX/moveY by BOX_SPEED_MULT (0.55) whenever
//   inventory.boxOn is true, before player.update() ever sees it. Mutually
//   exclusive with the drag cap (boxOn and dragging can never both hold —
//   see above), so this is a plain else-if, not a stacking multiplier.
//   BOX PERCEPTION — "visible but discounted" (the box is NOT the same
//   mechanism as the LOCKER's GUARD PERCEPTION GATE above: a hidden player
//   is swapped for a decoy at an impossible position, out of every guard's
//   range entirely; a boxed player's REAL x/y/facing/stance are still
//   handed to every guard.update() call — a guard can walk right up and
//   look at the box, it just doesn't read as a person unless it moves).
//   guardAI.js calls vision.computeSight(viewer, ctx.player) with NO third
//   `opts` argument (see its own contract) — so vision.js's opts.extraMult
//   hook (designed with exactly this box in mind, per its own file header)
//   is UNREACHABLE from here without editing guardAI.js, which is out of
//   scope for this module. The only lever this module actually has on
//   guardAI's per-tick sight computation is ctx.player.visionProfile()
//   itself (target.visionProfile() is what vision.computeSight falls back
//   to for `profile` when the caller passes no opts.profile — see
//   src/vision.js contract), so — same "wrap ctx.player" technique the
//   LOCKER decoy above already uses, just with the REAL x/y instead of an
//   impossible one — whenever inventory.boxOn is true, every guard.update()
//   call this tick gets a player object whose visionProfile() is OVERRIDDEN
//   to ignore player.stance entirely and return a flat constant instead:
//     Game.ITEMS.BOX_FACTOR (0.05) if !player.moving (stationary — the box
//       reads as a near-invisible inert prop; SUSPICIOUS_AT (0.35) would
//       take ~7s of continuous point-blank (2m) sight to reach at this
//       factor, and proportionally longer at range — see src/vision.js's
//       FILL FORMULA),
//     1.0 if player.moving (SPEC: "blown if seen moving" — a moving box is
//       exactly as visible as a standing, undisguised player; no partial
//       credit for still wearing the box while walking around in it).
//   player.moving/facing/stance/x/y on this wrapper are the REAL player's,
//   unchanged (only visionProfile() is swapped) — so guardAI's OWN combat-
//   accuracy read of ctx.player.moving/ctx.player.stance (see its ALERT/
//   COMBAT contract) and squad.updateSighting(ctx.player.x, ctx.player.y)
//   are completely unaffected by boxing; only the SIGHT FACTOR computation
//   is discounted. This wrapper only applies while !engine.playerHidden
//   (hidden already fully replaces ctx.player with the locker decoy above —
//   the two states can never overlap per the interaction matrix anyway, so
//   this is a defensive ordering, not a real runtime branch point).
//   RENDER/HUD: src/render.js swaps the player's mesh for a larger, nose-
//   less cardboard-brown box while boxOn (see its own file header); hudModel
//   status is additive "BOX" (see src/hud.js contract) alongside DRAGGING/
//   HIDDEN. Neither affects the perception math above — cosmetic only.
//
//   RATION VERB (new this cycle): R key, input.ration (boolean), EDGE-
//   TRIGGERED exactly like knock/fire (private prevRation closure state).
//   On that edge: calls inventory.useRation(player) (see src/items.js
//   contract — a pure "would this help" calculator that never touches
//   player.hp itself). If !result.used (no rations left, or hp already at
//   1), nothing else happens — no event, same "empty inventory is silent"
//   convention as the fire verb. Otherwise: this module (not items.js) is
//   what actually applies the heal — player.hp = Math.min(1, player.hp +
//   result.healAmount) — then pushes { type: "ration", hp: player.hp } (hp
//   read AFTER the heal, same "report the post-mutation value" convention
//   as playerHit above). RATION HOOK NOTE: src/engine.js's own file header
//   used to flag this exact hp-restoration arithmetic as "expected to live
//   on src/player.js, not engine.js" (a future-cycle aspiration written
//   before player.js was off-limits for this cycle's task packet) — since
//   player.js cannot be touched this cycle, the plain
//   `player.hp = Math.min(1, player.hp + amount)` mutation is done directly
//   here instead, exactly mirroring player.damage()'s own clamp shape but
//   in the opposite direction. A future cycle with player.js in scope could
//   still move this into a real player.heal() method with no change to this
//   verb's own event/edge behavior. No noise, no speed cap, no interaction
//   with box/drag/locker — eating a ration is always available.
//
//   CHAFF VERB (new this cycle): X key, input.chaff (boolean), EDGE-
//   TRIGGERED exactly like knock/fire/ration (private prevChaff closure
//   state). On that edge: calls inventory.useChaff() (see src/items.js
//   contract). If !result.used (no chaff grenades left), nothing else
//   happens. Otherwise:
//     1. engine.chaffUntil = engine.time + Game.ITEMS.CHAFF_S (15) — an
//        absolute sim-time deadline, not a countdown counter, same
//        "compare against engine.time" convention as every other
//        deterministic timer in this codebase (no setTimeout, no Date).
//        Mission-scoped like darts/rations/chaff itself — NOT reset by
//        switchZone (a thrown chaff grenade's jam outlasts a door).
//     2. Pushes { type: "chaff" }.
//     3. Emits a SHARP ("strong") pop at the player's OWN position: it's a
//        bang, not a stealth tool — soundEvents.emitRadius(player.x,
//        player.y, 4, true, guards) (4m unattenuated; not one of
//        soundEvents.js's named RADII kinds, same "bespoke one-off radius"
//        precedent as the CQC thud's emitRadius(...,3,...) call above).
//        Any listener that heard it pushes the usual { type: "noiseHeard",
//        ..., strength: "strong" }. THE TRADEOFF IS THE POINT: jamming the
//        radar/blinding cameras costs you a guard converging on where you
//        just stood (INVESTIGATE), exactly the same hearNoise("strong")
//        pathway a knock or dart impact uses — documented here, not hacked
//        around, because a chaff pop that was silent would make it strictly
//        better than a knock with no downside.
//   RADAR: src/radar.js's radarModel ORs a live engine.chaffUntil > engine.
//   time signal into its existing phase-based `jammed` check (see its own
//   CHAFF HOOK comment, written for exactly this) and exposes which kind of
//   jam is live so the view can render chaff static differently (a bluish
//   tint + "CHAFF" label) from a phase-driven ALERT/EVASION blackout (red
//   "ALERT" label) — see src/radar.js contract. CAMERA HOOK — FULFILLED this
//   cycle (was an honest gap in earlier cycles: "whenever a camera entity
//   exists, it is expected to gate its own perception off this same
//   engine.chaffUntil > engine.time signal, not a second parallel timer").
//   src/director.js's cameras now do exactly that — see its own tickCameras
//   contract's `disabled` check, and DIRECTOR / CAMERAS below for where this
//   file hands chaffUntil in every tick.
//   Runs in the same NOISE STEP position as fire/knock (step 2), same
//   same-tick-visible-to-guards rationale as the fire verb above.
//
//   MISSION STATS / EXTRACTION / RANK (new — win-state cycle, the final
//   bootstrap feature): engine.stats is a flat, mutable, mission-scoped
//   object (persists across zone transitions AND save/restore — NOT reset by
//   switchZone, same posture as engine.inventory/engine.chaffUntil above):
//     {
//       alertsTotal:   number, // total broadcastAlert incidents across the
//                              // WHOLE mission, every zone. squad.alertCount
//                              // (see guardAI.js contract) is PER-SQUAD and
//                              // a fresh squad is built by switchZone on
//                              // every zone transition (see file header
//                              // above) — a straight per-zone read would
//                              // silently reset to 0 crossing a door. This
//                              // module accumulates its OWN mission-wide
//                              // total instead, incrementing it in the exact
//                              // same place tick() already detects a NEW
//                              // alert (squad.alertCount > alertCountBefore,
//                              // see step 6 below) — one alertsTotal++ per
//                              // "alert" event pushed, in every zone.
//       dartsFired:    number, // incremented once per tranqFired event (see
//                              // FIRE VERB above) — every dart actually
//                              // spent, hit or miss.
//       cqcTakedowns:  number, // incremented once per successful cqc event
//                              // (see CQC VERB above) — NOT incremented on a
//                              // cqcMiss.
//       kills:         0,      // ALWAYS 0 this cycle — no lethal weapon
//                              // exists anywhere in this codebase (tranq is
//                              // non-lethal, CQC chokes rather than kills).
//                              // Kept as a real field (never incremented,
//                              // never removed) purely so the RANK TABLE
//                              // below — and any future lethal-weapon cycle
//                              // — has somewhere to read/write a kill count
//                              // without a schema change.
//       rationsUsed:   number, // incremented once per successful ration
//                              // event (see RATION VERB above).
//       chaffUsed:     number, // incremented once per successful chaff event
//                              // (see CHAFF VERB above).
//       savesUsed:     number, // F9 LOADS count against you, MGS-style
//                              // "continues"; F5 SAVES do not (saving isn't
//                              // a failure, reloading to undo one is). This
//                              // module never increments this itself — there
//                              // is no in-engine "load" concept, saving/
//                              // loading is entirely src/boot.js's meta-level
//                              // concern (see its own F5 SAVE / F9 LOAD
//                              // contract) — boot.js's loadGame() increments
//                              // the FRESHLY-RESTORED engine's
//                              // engine.stats.savesUsed directly (a plain
//                              // flat-prop mutation, same legitimacy as e.g.
//                              // the RATION VERB's own direct player.hp
//                              // mutation above) the instant
//                              // saveState.restore() hands it a live engine,
//                              // BEFORE that engine ever ticks again. Because
//                              // engine.stats round-trips through
//                              // getState()/setState() (see below) like
//                              // every other mission-scoped counter, a save
//                              // captured mid-mission already carries
//                              // forward every PRIOR load's count — this one
//                              // increment only ever accounts for the load
//                              // happening RIGHT NOW.
//       knocksMade:    number, // incremented once per knock event (see KNOCK
//                              // VERB, tick() step 2b) — wall-adjacency gate
//                              // already means only REAL knocks reach here.
//       missionTimeS:  number, // mirrors engine.time verbatim, refreshed at
//                              // the end of every tick() call (step 8 below)
//                              // — engine.time (tickCount * DT) is NEVER
//                              // reset by switchZone (see ZONE TRANSITIONS:
//                              // rng is the only other thing switchZone
//                              // deliberately leaves untouched — tickCount/
//                              // time simply aren't in the list of vars it
//                              // reassigns at all), so this already
//                              // accumulates seamlessly across every zone
//                              // crossing with zero extra bookkeeping; it is
//                              // a redundant flat copy of engine.time, kept
//                              // on `stats` so a save/restore round-trip and
//                              // the missionComplete event's stats snapshot
//                              // both carry it as one bundle instead of
//                              // needing a second field threaded everywhere
//                              // engine.stats already goes.
//     }
//   engine.missionComplete — boolean, false until the player successfully
//     extracts (see EXTRACTION below); FROZEN ENGINE semantics IDENTICAL to
//     engine.gameOver (see GAME OVER below) — checked in the SAME step-0
//     frozen-check at the top of tick() (`if (engine.gameOver ||
//     engine.missionComplete) return;`), so once true, every subsequent
//     tick() call is a no-op and engine.events keeps holding the tick that
//     set it forever after, same "callers must track their own reaction
//     locally" contract gameOver already documents.
//
//   EXTRACTION (new): src/world.js's commsTower zone has exactly one exit,
//   the roof helipad approach, whose `to` is the literal string
//   "extraction" — a deliberate, PERMANENT TERMINAL, not a placeholder for a
//   Game.ZONES entry some future cycle builds (contrast with an ordinary
//   unresolved stub like the Warehouse's former "laboratory" pointer before
//   Laboratory was built — see tests/zones.test.js's own KNOWN_STUBS note).
//   tryZoneTransition() (see ZONE TRANSITIONS, tick() step 7) checks
//   `matched.to === "extraction"` BEFORE it ever consults Game.ZONES for that
//   exit — so this never falls into the generic zoneBlocked branch, and
//   Game.ZONES.extraction is expected to never exist, ever. Gated by the
//   EXACT SAME `squad.phase === "INFILTRATION"` condition every ordinary
//   zone-changing exit already requires (tryZoneTransition's very first
//   line) — "you can't extract mid-alert," the identical DESIGN RULE this
//   file already documents for crossing any other zone boundary. On a match:
//   calls completeMission(), which
//     1. Sets engine.stats.missionTimeS = engine.time + DT (see missionTimeS
//        above — engine.time itself isn't bumped by this tick's own DT until
//        step 8, further down this same tick(), so the mission's ACTUAL
//        final duration — including the tick the player physically reached
//        the trigger — is engine.time-as-read-right-now plus one more DT;
//        step 8 will independently arrive at the identical number moments
//        later this same tick, so this is a same-tick anticipation, not a
//        divergent calculation).
//     2. Computes rank = Game.computeRank(engine.stats) (see RANK TABLE
//        below).
//     3. Sets engine.missionComplete = true.
//     4. Pushes { type: "missionComplete", stats: <shallow clone of
//        engine.stats>, rank: rank } — a CLONE, not the live engine.stats
//        object, so a caller holding onto this event's stats field is
//        holding a frozen-in-time snapshot rather than a reference that
//        could (harmlessly, since the engine is about to freeze regardless,
//        but needlessly confusingly) keep changing shape.
//
//   RANK TABLE — Game.computeRank(stats) -> string, a PURE function (no
//   engine/closure state, callable directly by tests without a live engine)
//   exported alongside Game.createEngine, evaluated top-down:
//     - BIG BOSS  — stats.alertsTotal === 0 && stats.kills === 0. The
//       perfect, unseen, bloodless run.
//     - KILLS CAP (future-proofing — stats.kills is ALWAYS 0 this cycle, see
//       `kills` above, so this branch is dead code today, but the table is
//       written now so a future lethal-weapon cycle needs zero rank-formula
//       changes): stats.kills > 0 forfeits BIG BOSS and FOX outright and caps
//       the achievable rank at HOUND regardless of how few alerts there were
//       — MGS convention that a body count, even a clean one otherwise,
//       costs you the very top ranks. Same alertsTotal thresholds as the
//       ladder below, just starting from HOUND instead of FOX.
//     - FOX       — alertsTotal <= 1 AND missionTimeS < 900 (15 minutes).
//       Both conditions required; failing EITHER (too many alerts, or clean
//       but slow) falls through to the next rung rather than failing the
//       whole rank outright.
//     - HOUND     — alertsTotal <= 2.
//     - DOBERMAN  — alertsTotal <= 4.
//     - JACKAL    — alertsTotal <= 6.
//     - ELEPHANT  — else (alertsTotal >= 7, or anything not caught above).
//
//   COMBAT — guard fire / player damage / game over (new this cycle):
//     Step 3 (guard update loop) below passes each guard.update() a THIRD ctx
//     field beyond `player`: onGuardFire(guard, hit), guardAI.js's hook for
//     "this guard just fired" (see its own ALERT/COMBAT contract — it never
//     applies damage itself, only reports the outcome). This callback, per
//     shot:
//       1. Pushes { type: "guardFire", guardId: guard.id, hit: hit }.
//       2. Emits gunshot NOISE — a genuinely loud, SHARP stimulus regardless
//          of hit/miss: soundEvents.emitRadius(guard.x, guard.y, 10, true,
//          guards) (10m unattenuated radius, matching GUARD.FIRE_RANGE; sharp
//          -> "strong", same semantics as the knock verb — see soundEvents.js
//          contract). Listeners = every guard on the CURRENT guards array,
//          same convention as the movement-noise/knock steps in step 2 below
//          (this necessarily includes the shooter itself as a listener — its
//          own hearNoise() is a harmless no-op while ALERT/EVASION, per
//          guardAI.js's hearNoise contract, so no special-casing is needed to
//          exclude it). Any listener that heard it pushes the same
//          { type: "noiseHeard", guardId, x, y, strength: "strong" } shape
//          step 2 uses, x/y being the GUNSHOT's origin (the firing guard's
//          position at the moment of the shot). This is what lets an
//          uninvolved squadmate elsewhere in the zone converge on a firefight
//          it didn't personally see — "gunshot -> ALERT" support fire, using
//          the SAME hearNoise("strong") pathway a knock uses (a guard already
//          ALERT/EVASION ignores it per hearNoise's contract; a PATROL/
//          SUSPICIOUS/CAUTION guard investigates it exactly like any other
//          strong stimulus, escalating to ALERT itself only through its OWN
//          confirmed sighting later, same as ever).
//       3. If hit: calls player.damage(Game.GUARD.FIRE_DAMAGE), then pushes
//          { type: "playerHit", hp: player.hp } (hp read AFTER damage()).
//     GAME OVER: after the guard update loop (so it sees any damage a shot
//     just applied this same tick) — if player.hp has reached 0 and
//     engine.gameOver isn't already true: sets engine.gameOver = true and
//     pushes { type: "gameOver" }. Deliberately generic (checks
//     player.alive, not "was this tick's damage source a guardFire") so ANY
//     future damage source (traps, a boss, ...) drives game over through the
//     same single check rather than needing its own copy of this logic.
//     FROZEN ENGINE: once engine.gameOver is true, tick() returns
//     IMMEDIATELY as its very first statement on every SUBSEQUENT call — no
//     event clearing, no player/guard/squad update, no tickCount/time
//     advance. The tick that actually set gameOver still runs to completion
//     as normal (its own tickCount++ happens, its gameOver event is visible
//     via engine.events same as any other tick) — only calls AFTER that one
//     are no-ops. This means engine.events is left holding that final tick's
//     events forever after (not re-cleared to [] by the frozen no-op calls)
//     — callers polling engine.events every frame (see src/boot.js) must
//     track "have I already reacted to gameOver" themselves rather than
//     expecting the event to eventually disappear. engine.missionComplete
//     (new — see MISSION STATS / EXTRACTION / RANK above) is a SECOND,
//     independent latch with IDENTICAL freeze semantics, checked in the same
//     step-0 condition — a successful extraction is exactly as terminal to
//     the sim as dying is, just the opposite ending.
//     RATION HOOK (not this cycle — see items/director TODOs elsewhere): hp
//     restoration, when it arrives, is expected to be a plain
//     player.hp = Math.min(1, player.hp + amount) (or an equivalent
//     player.heal(amount) method) — the inverse shape of player.damage(),
//     living on src/player.js, NOT engine.js; this module's own job stays
//     "turn a damage/heal call into an event + a gameOver check", not owning
//     the hp arithmetic itself.
//
//   engine.tick(input?) — advances the simulation by exactly ONE fixed step
//     (DT seconds). THIS IS THE ONLY SANCTIONED TICK LOOP: render/boot must
//     drive the game by calling engine.tick() on a fixed-timestep accumulator
//     (never by calling player.update/guard.update/squad.tick directly), and
//     every test/sim harness that wants engine-level behavior should call it
//     the same way. Canonical per-tick order (do not reorder):
//       0. FROZEN CHECK (see GAME OVER / FROZEN ENGINE above): if
//          engine.gameOver OR engine.missionComplete is already true, return
//          IMMEDIATELY — before clearing engine.events, before touching
//          player/guards/squad/tickCount/time. Every other step below only
//          runs on a tick where this check passes (i.e. every tick up to and
//          including the one that FIRST sets engine.gameOver or
//          engine.missionComplete).
//       1. player.update(input, DT). `input` may be null/undefined, meaning
//          "no movement": it is normalized to
//          { moveX: 0, moveY: 0, run: false, stance: player.stance } so a
//          missing/omitted stance holds whatever the player was already in
//          (player.update's own "retain stance if omitted" rule handles this
//          once moveX/moveY/run are defaulted — see src/player.js contract).
//       1.5. PICKUPS (new — Laboratory cycle, see src/items.js's
//          inv.collectPickup contract): for every zone.pickups[] entry not
//          already collected (a private per-engine, per-zone-index Set —
//          see collectedPickups below — NOT reset by switchZone, so leaving
//          and re-entering the same zone never respawns something already
//          picked up), if dist(player, pickup) < 0.7: mark it collected,
//          call inventory.collectPickup(pickup.item), and push { type:
//          "pickup", item: pickup.item }. Runs right after player.update so
//          this tick's fresh position is what's tested; before the NOISE
//          STEP/DOORS below since neither depends on it.
//       1.6. DOORS (new — Laboratory cycle, see src/world.js's DOORS /
//          DYNAMIC BLOCKERS contract): for every zone.doors[] entry, in
//          order:
//            - CLOSED + lock === null: opens the instant player OR any guard
//              is within DOOR_PROXIMITY_DIST (1.5m) of the door's center —
//              push { type: "doorOpen", id }.
//            - CLOSED + locked (lock is "L1"/"L2"/"L3"): opens ONLY when the
//              PLAYER (never a guard — see file header design note, guards
//              never carry keys) is within DOOR_KEYED_OPEN_DIST (1.2m) AND
//              inventory.keycards[lock] is true — push { type: "doorOpen",
//              id }. A locked door with no key nearby, or a guard alone
//              nearby, simply stays shut.
//            - OPEN: tracks the last tick anyone (player or ANY guard) was
//              within DOOR_PROXIMITY_DIST in a private per-door timestamp
//              (doorLastNear — reset alongside collectedPickups on
//              switchZone); once DOOR_AUTO_CLOSE_S (3s) have elapsed with
//              nobody that close, closes it and pushes { type: "doorClose",
//              id }. A door that just opened this same tick counts as
//              "someone was near" at that same moment, so it can never
//              immediately re-close on the very next tick before anyone's
//              actually stepped away.
//          Runs after PICKUPS, using this tick's fresh player position and
//          the PREVIOUS tick's guard positions (guards update in step 3,
//          below) — an acceptable one-tick lag since, by design, no guard's
//          own patrol loop ever needs a door to open (see src/world.js's
//          Laboratory zone comments) — this proximity check existing for
//          guards at all is purely for the "close after 3s of nobody nearby"
//          rule to correctly NOT fire while a guard happens to be patrolling
//          right past an open door.
//       2. NOISE STEP (new — soundEvents), AFTER player.update, BEFORE any
//          guard updates, so a sound made THIS tick can already be reflected
//          in guard.state by the time step 3's guard.update() runs (matching
//          sim.js's existing "hearNoise() then update()" convention for
//          guardAI — see guardAI.js's hearNoise contract):
//            a. MOVEMENT NOISE: if player.noiseRadius() > 0 (i.e. the player
//               is actually moving this tick — see src/player.js contract),
//               call soundEvents.emitRadius(player.x, player.y,
//               player.noiseRadius(), false, guards) every such tick. This is
//               a SOFT ("faint") sound; guard.hearNoise("faint") only does
//               anything from PATROL (-> SUSPICIOUS), so repeated faint hits
//               while a guard is already SUSPICIOUS/INVESTIGATE/etc. are
//               harmless no-ops (see guardAI.js's hearNoise contract) — no
//               extra bookkeeping needed here to avoid "re-triggering."
//            b. KNOCK VERB: input.knock (boolean) is EDGE-TRIGGERED — engine
//               tracks the previous tick's input.knock internally (private
//               closure state, not an engine prop) and only acts on a
//               false->true transition, exactly once per press (holding
//               input.knock true across many ticks fires nothing further
//               until it goes false and back to true). On that edge: if
//               world.isBlockedCircle(player.x, player.y,
//               Game.SOUND.KNOCK_WALL_DIST) (the player is adjacent to a
//               wall), call soundEvents.emit(player.x, player.y, "knock",
//               guards) — a SHARP ("strong") sound — and push
//               { type: "knock", x: player.x, y: player.y } onto
//               engine.events. If the player is NOT adjacent to a wall on
//               that edge, nothing is emitted and no event fires (knocking
//               on thin air is silent).
//            For every listener that heard EITHER sound this tick (per the
//            `heard` flag in soundEvents' returned results — see
//            src/soundEvents.js contract), push
//            { type: "noiseHeard", guardId: guard.id, x, y, strength } onto
//            engine.events (x,y are the SOUND's origin, i.e. the (x,y) passed
//            to emit/emitRadius above, not the guard's own position).
//            c. FIRE VERB (new — see FIRE VERB above for the full write-up):
//               input.fire is EDGE-TRIGGERED exactly like input.knock, same
//               private-closure-state shape. On that edge, calls
//               inventory.fireTranq(engine); if it fired, pushes tranqFired,
//               emits dartImpact noise (pushing noiseHeard for anyone who
//               heard it, same loop shape as (a)/(b) above), and — on a hit —
//               calls the hit guard's guard.tranq(headshot).
//       3. Each guard, in array order: guard.update(DT, { player: player,
//          onGuardFire: onGuardFire, sleepingGuards: sleepingGuards }) —
//          onGuardFire is the COMBAT hook described above; a guard in ALERT
//          within range/LOS/cadence may call it synchronously from inside
//          this update() call, which is how a guardFire/playerHit event and a
//          player.damage() call land within the SAME tick the shot was
//          taken. sleepingGuards (new — see src/guardAI.js's COLLEAGUE
//          DISCOVERY contract) is computed ONCE per tick, before this loop
//          starts, as every CURRENT guard whose state === "SLEEPING" mapped
//          to { id, x, y } — the same snapshot is handed to every guard's
//          update() call this tick (a guard tranq'd earlier THIS SAME tick,
//          via the fire verb above, is already reflected here since the fire
//          verb runs in step 2, before this loop).
//          VISION STAGGERING (deferred — see below): every guard currently
//          computes sight EVERY tick; there is no per-guard skip.
//       3.5. DIRECTOR / CAMERAS (new — see src/director.js contract):
//          director.tickCameras(DT, { time: engine.time, chaffUntil: engine.
//          chaffUntil, player: perceivedPlayer }) — AFTER every guard's own
//          update() (step 3), BEFORE squad.tick() (step 5), reusing the
//          EXACT SAME perceivedPlayer wrapper step 3 just used (one wrapping
//          decision per tick, shared by every viewer — see GUARD PERCEPTION
//          GATE / BOX PERCEPTION above). Returns a list of { type,
//          cameraIndex } facts (cameraSuspicious/cameraAlert — see the
//          events list above); this file pushes each straight onto
//          engine.events (director owns no events array of its own — same
//          "returns facts, engine narrates" split as items.js's own
//          fireTranq/useRation/useChaff). A camera reaching ALERT_AT calls
//          squad.broadcastAlert INSIDE tickCameras, before this step
//          returns — see DESIGN RULE below for why this does NOT feed
//          anyLOS (step 5).
//       3.6. LASERS (new — Laboratory cycle, see src/director.js's own laser
//          contract): director.tickLasers(DT, { time: engine.time, prevX,
//          prevY, x: player.x, y: player.y, playerHidden: engine.playerHidden
//          }) — prevX/prevY are the player's REAL position CAPTURED AT THE
//          VERY TOP of this tick() call, before ANY of this tick's movement
//          (CQC/drag/locker-exit teleport, then player.update) — so the
//          crossing test sees the player's FULL movement segment for the
//          tick, not just player.update's own contribution. Uses the
//          player's REAL x/y (never the box/locker-wrapped perceivedPlayer
//          step 3/3.5 use) — see src/director.js's BOXED PLAYER DOES NOT
//          PROTECT note for why. Returns a list of { type: "laserTripped",
//          laserIndex } facts; pushed straight onto engine.events, same
//          "returns facts, engine narrates" split as director's own cameras.
//          A trip calls squad.broadcastAlert INSIDE tickLasers (same as a
//          camera's ALERT crossing) — same DESIGN RULE as cameras below:
//          lasers do NOT feed anyLOS (step 5) either, for the identical
//          reason (a tripwire calls it in, guards still have to physically
//          find you).
//       4. GAME OVER CHECK (new — see GAME OVER above): if !player.alive and
//          engine.gameOver is not already true, set engine.gameOver = true
//          and push { type: "gameOver" }. Runs right after the guard loop so
//          it sees any damage a shot just applied this very tick; checks
//          player.alive generically (not "did a guardFire happen"), so any
//          future damage source drives game over through this one check.
//       5. squad.tick(DT, anyLOS) exactly once, where
//          anyLOS = guards.some(function (g) { return g.hasLOS; }) — read
//          directly off each guard's own guard.hasLOS (set every tick by
//          guard.update's perception step, see guardAI.js contract: "guard.
//          hasLOS ... This is what an external multi-guard driver reduces
//          over every guard on a squad (guards.some(g => g.hasLOS)) to get
//          the anyGuardHasLOS argument squad.tick() needs"). No separate
//          vision.computeSight call is made here — that would double-tick
//          each guard's meter (computeSight itself is pure/stateless, but
//          calling it again here would be redundant work reading the exact
//          same viewer/target this same tick; the sanctioned source of truth
//          for "did this guard have LOS this tick" is guard.hasLOS, already
//          computed once by guard.update per its own contract). This is
//          exactly the reference wiring documented in guardAI.js's file
//          header and exercised by sim.js's "full alert ladder" scenario:
//          update every guard first, THEN squad.tick with the OR of every
//          guard's hasLOS. DESIGN RULE — cameras deliberately DO NOT feed
//          into anyLOS: a camera reaching ALERT_AT (step 3.5 above) calls
//          squad.broadcastAlert and flips the squad into ALERT same as a
//          guard's own confirmed sighting, but anyLOS here is computed ONLY
//          from the guards array — so with no guard itself confirming
//          sight, squad.tick() still decays ALERT -> EVASION after
//          GUARD.EVASION_S on schedule, exactly as if a guard's own LOS had
//          been broken. This is correct MGS behavior, not a gap: a camera
//          spots you and calls it in, then the GUARDS have to actually come
//          find you — a camera is a tripwire, not a second pair of guard
//          eyes that can independently sustain ALERT forever.
//       6. Event collection: engine.events is cleared at the TOP of tick(),
//          right after the frozen check (step 0), before step 1, and
//          squad.phase/alertCount are snapshotted at that same moment
//          (BEFORE step 2) — a guard's own broadcastAlert() call (fired from
//          inside guard.update() the instant its meter confirms sight; see
//          guardAI.js's SUSPICIOUS/INVESTIGATE/EVASION/CAUTION notes) can
//          flip squad.phase/alertCount immediately, well before squad.tick()
//          runs in step 5, so a snapshot taken any later would miss exactly
//          that transition. After step 5, the snapshot is compared against
//          the live squad.phase/alertCount: phaseChange when phase differs;
//          alert when alertCount increased, using the NEW squad.lastKnown for
//          x/y since an alertCount bump only happens alongside a
//          broadcastAlert() call that just set lastKnown (see guardAI.js's
//          squad contract). The "knock"/"noiseHeard" (step 2) and
//          "guardFire"/"playerHit"/"gameOver" (steps 3-4) events are pushed
//          directly at emission time, not diffed from a snapshot — they're
//          edge-triggered facts about those steps, not state to compare
//          before/after.
//       7. ZONE TRANSITIONS (after squad.tick, using its just-updated phase;
//          see squad.phase design rule below): if the player is standing
//          inside ANY of zone.exits[] (world.inRegion(player.x, player.y,
//          exits[i])) AND squad.phase === "INFILTRATION" this tick:
//            - if exits[i].to === "extraction" (new — see MISSION STATS /
//              EXTRACTION / RANK above): completeMission() — checked BEFORE
//              the Game.ZONES lookup below, so this never falls into the
//              zoneBlocked branch. Terminal; no zone switch happens.
//            - else if Game.ZONES[exits[i].to] exists: switch zones. A fresh
//              world/soundEvents/vision/squad/guards stack is built for the
//              target zone (guards from ZONE_GUARDS[target.id], same table
//              opts.guardConfigs defaults from — see file header above, UNLESS
//              a stash exists for the target zone id, in which case guards/
//              squad/director/doors are instead RESTORED from it — see the
//              ZONE PERSISTENCE / STASH section below; this REPLACES the old
//              v1 "departed zone's guards/squad are discarded" semantics).
//              The DEPARTING zone's own full state is itself stashed first
//              (also documented below) so a LATER re-entry can restore it.
//              The player object itself is also rebuilt (Game.createPlayer
//              only takes its world at
//              construction, see src/player.js contract — there is no hook to
//              swap a live player's world), but its stance, facing, hp, and
//              alive are copied onto the new instance (hp/alive copied so a
//              zone transition never doubles as a free heal — a fresh
//              Game.createPlayer defaults to full hp) and its position is set
//              to target.entrances[exits[i].entranceKey] — so from the
//              outside (engine.player.stance/facing/x/y/hp) this reads as
//              "the same player, teleported to the new zone's entrance."
//              engine.zone/
//              world/player/guards/squad/vision/soundEvents are all
//              reassigned to the new instances; rng is NOT rebuilt (the one
//              seeded stream continues across zones, which is what makes the
//              cross-transition determinism test possible). Pushes
//              { type: "zoneChange", from: <old zone.id>, to: <new zone.id> }.
//              At most one switch per tick (the first matching exit wins).
//            - else (unresolvable `to`, e.g. the warehouse's laboratory
//              stub): no switch; pushes { type: "zoneBlocked", to } but only
//              on the region-ENTRY edge (private closure state tracks
//              whether the player was already inside a blocked-exit region
//              last tick this was evaluated, same edge-trigger shape as the
//              knock verb in step 2) — standing in the trigger for 200 ticks
//              fires it once, not 200 times.
//          DESIGN RULE — no zone-changing mid-alert: gating the entire check
//          on squad.phase === "INFILTRATION" means a player cannot cross (or
//          get blocked-from-crossing) an exit while ALERT/EVASION/CAUTION;
//          they must lose the squad's attention first. This also means the
//          blocked-region edge tracker simply isn't updated on non-
//          INFILTRATION ticks — if the player is standing in a blocked region
//          when ALERT interrupts, then the squad stands down while they're
//          still standing there, no second zoneBlocked fires (it reads as one
//          continuous, uninterrupted "entry").
//
//   ZONE PERSISTENCE / STASH (NEW — per-zone state persistence cycle,
//   REPLACES v1's "departed zone forgets everything" semantics): every zone
//   this engine has ever DEPARTED gets its full live state captured into a
//   private zoneStash map ({ [zoneId]: stashEntry }, mission-scoped, never
//   cleared) the instant switchZone() runs, BEFORE the departing zone's own
//   world/guards/squad/director are replaced — see stashZone()'s own doc
//   comment (just above switchZone in the source) for the exact shape. On a
//   LATER re-entry to that same zone id, switchZone() checks the stash: a hit
//   rebuilds guards (base AND any reinforcements — rebuildGuardsFromStash()),
//   a squad, and a director from the stashed data (each restored via that
//   module's own published getState()/setState() pair — the SAME mechanism
//   src/saveState.js already uses for a save/restore round-trip, just
//   triggered by a zone crossing instead of a save file) instead of building
//   fresh ones from ZONE_GUARDS; a miss (a zone never departed before) falls
//   back to the original v1-shaped construction, unchanged.
//
//   DECISIONS (worth reading before touching any of this):
//
//   - FROZEN TIME OFF-SCREEN: a departed zone's guards/squad/director do not
//     simulate at all while the player is elsewhere — nothing ticks them,
//     nothing ages them. A guard tranq'd with 50s of GUARD.SLEEP_S left when
//     the player walks away still has ~50s left the moment the player walks
//     back, no matter how long (in real mission time) the player spent in
//     other zones — sleepTime is just a frozen number inside the stashed
//     guard.getState() blob until rebuildGuardsFromStash()/guard.setState()
//     thaws it back onto a live guard. Same freeze applies to a partially-
//     decayed CAUTION widened-cone state, an in-flight INVESTIGATE search
//     arc, a door's auto-close countdown (see doors below), etc. — literally
//     every closure var guard.getState()/squad.getState()/director.getState()
//     capture. This is a deliberate simplification (a real facility's guards
//     wouldn't literally freeze) traded for a MUCH simpler, fully
//     deterministic model with no "simulate N absent zones in the
//     background" engine — see DETERMINISM below for why that tradeoff
//     matters here specifically.
//
//   - INFILTRATION-ONLY EXIT GATE STILL HOLDS, UNCHANGED (tryZoneTransition's
//     own `if (squad.phase !== "INFILTRATION") return;` above is untouched by
//     this cycle) — which means every stash is captured at a moment
//     squad.phase reads exactly "INFILTRATION" (phaseTime/alertCount can
//     still be any accumulated value, and ARE captured — see DETERMINISM
//     below — but phase itself is always this one value). guard.state,
//     however, is NOT similarly constrained: guardAI.js's own RADIO CALL /
//     SQUAD-PHASE SYNC step forces every non-SLEEPING guard's state to track
//     squad.phase (ALERT/EVASION/CAUTION -> matching state; back to
//     INFILTRATION -> forced to PATROL) the SAME tick squad.phase changes —
//     so by the time squad.phase reads INFILTRATION (a precondition for
//     ANY switchZone call), every awake guard has ALREADY been synced back
//     to PATROL that same tick. A SLEEPING guard is the one exception (its
//     own short-circuit skips the sync step entirely — see guardAI.js's
//     SLEEPING contract), so a stash can and does hold a mix of PATROL and
//     SLEEPING guards, but never a lingering CAUTION/ALERT/EVASION one. A
//     guard can still be SUSPICIOUS/INVESTIGATE at stash time, though (those
//     are a guard's own independent reaction to a faint/strong stimulus,
//     not gated on squad.phase at all) — restored exactly as-is, same as
//     every other state, via the same generic guard.setState() call.
//
//   - REINFORCEMENT COUNTER IS ZONE-LIFETIME, NOT PER-VISIT: reinforcement
//     guards are REAL Game.createGuard instances (see src/director.js's own
//     ESCALATION contract) that now persist in the stash exactly like any
//     other guard — a zone re-entered with 2 of its +3 reinforcements already
//     spawned comes back with those SAME 2 guards present, not a clean
//     roster. Old semantics ("reinforcementCount is zone-VISIT-scoped,
//     director itself IS the visit, a fresh director naturally resets it")
//     stop being the right mental model once a visit can end and resume:
//     RECONSIDERED here as ZONE-LIFETIME instead — a zone that spent its +3
//     across one ALERT stays spent for the rest of the mission, even across
//     any number of departures/re-entries. Enforced by engine.js itself via
//     the private zoneReinforcementUsed var (seeded from the stash on every
//     switchZone, written back into the stash on the next departure) — see
//     that var's own declaration comment and the ESCALATION event-processing
//     step (tick(), just after director.tickEscalation()) for the actual
//     cap check. director.js's OWN reinforcementCount is deliberately left
//     alone (out of scope for this cycle, and it doesn't need to change): it
//     remains a fresh per-VISIT ceiling of 3, which is always >= the TRUE
//     remaining cross-visit budget, so it never blocks a spawn engine's own
//     stricter check would still allow — engine.js is simply the one place
//     that also enforces the tighter, correct number, silently discarding
//     (splicing back out of the live guards array, suppressing the event)
//     any spawn director allowed that the true budget had already used up.
//
//   - PICKUPS DO NOT RESPAWN, VERIFIED NOT CHANGED: collectedPickups was
//     ALREADY mission-scoped (keyed by "<zoneId>#<index>", never reset by
//     switchZone) before this cycle — investigated per this cycle's own task
//     brief, confirmed correct under BOTH the old discard-on-exit semantics
//     and this cycle's persistence, so it is untouched. See
//     tests/zonePersistence.test.js's own pickup test for the verification.
//
//   - CHECK-IN SCHEDULING NEEDS NO STASHING (a documented non-gap): the radio
//     check-in boundary a guard lands on is a PURE function of (global,
//     never-reset engine.time, dt, that guard's roster index) — see
//     src/director.js's own PURE-FUNCTION CHECK-IN SCHEDULE note — with no
//     stored "next check-in at" to seed or lose, so it keeps computing
//     correctly across any number of zone departures/re-entries with zero
//     help from this stash. The one piece of check-in bookkeeping that ISN'T
//     pure — missingSearchers, "who's already been dispatched to search whom"
//     — is NOT captured (director.js doesn't expose it, and director.js is
//     out of scope for this cycle's task packet; see director.js's own
//     SAVE/RESTORE — HONEST GAP note for the identical precedent this
//     mirrors). Losing it is benign: at worst a re-entered zone's very next
//     missed check-in redispatches a searcher that (per the OLD, forgotten
//     bookkeeping) might already have one in flight — never a crash, never a
//     spurious alert, just possibly one redundant dispatch.
//
//   - RNG STAYS SHARED, RE-ENTRY DOES NOT REWIND IT: unchanged from before
//     this cycle — the single seeded Game.createRng stream keeps advancing
//     across every zone transition, departure or re-entry alike (see
//     switchZone's own "rng is NOT rebuilt" note). A re-entered zone's guards
//     therefore do NOT replay the same rng draws they got on a previous
//     visit — they continue drawing from wherever the shared cursor now sits,
//     which has moved forward by however many draws happened in every OTHER
//     zone visited in between. This means a run that crosses zones repeatedly
//     diverges from what a naive "v1 discard, always-fresh guards" baseline
//     would have produced at the same tickCount — that divergence is
//     EXPECTED and correct, not a determinism bug: determinism (below) only
//     ever promises same-seed + same-input-log -> identical output, never
//     "matches what an older engine version would have done."
//
//   - DETERMINISM (the hard gate): same seed + an identical scripted input
//     log (including one that crosses zones back and forth any number of
//     times) must produce byte-identical engine.snapshot() output at every
//     corresponding tick, for any two engine instances. This holds because
//     every piece of the stash is itself either a plain deterministic value
//     (zoneReinforcementUsed, a door's open flag/elapsed-near duration) or
//     produced by a module's own getState(), and rebuildGuardsFromStash's
//     reinforcement-waypoint reconstruction is a PURE function of
//     (zone.guardDoor, a freshly built world) — see
//     buildReinforcementWaypointsForZone's own comment for why it
//     reproduces the exact same points director.js originally used. See
//     tests/zonePersistence.test.js's own determinism test (two engines,
//     identical seed + scripted crossing/tranq log, asserting
//     JSON.stringify(engine.snapshot()) equality at the end).
//
//   - SAVE/RESTORE CARRIES THE STASH: the whole zoneStash map (plus
//     zoneReinforcementUsed) rides along inside engine.getState()/setState()
//     (see those functions' own doc comments) and therefore inside
//     src/saveState.js's capture()/restore() for free — SAVE_VERSION was
//     bumped there for exactly this shape change; see that file's own
//     comment.
//
//       8. tickCount++ and time = tickCount * DT.
//
//   VISION STAGGERING — deferred: with N guards, the ideal perf optimization
//   is for guard i to refresh its expensive computeSight only on ticks where
//   tickCount % N === i, holding the last factor between refreshes so the
//   detection meter still integrates every tick. THIS IS NOT IMPLEMENTED.
//   guardAI.update() calls vision.computeSight itself, internally, as an
//   unconditional part of its own per-tick perception step (see guardAI.js
//   step 2) — there is no hook for the engine to skip or substitute that call
//   without modifying guardAI.js, which is out of scope for this module (its
//   contract is fixed and consumed read-only). So today every guard computes
//   full sight every tick, always. This is an honest gap, not a silent one:
//   the perf test in tests/engine.test.js ("engine perf: 10 guards, full tick
//   under 4ms budget") measures the CURRENT unstaggered cost and asserts it
//   still holds the <4ms/tick budget without staggering. If a future zone
//   with many more guards blows that budget, staggering (or a guardAI API
//   change to support it) is the next thing to build — tracked here, not
//   hacked in.
//
//   engine.snapshot() -> JSON-safe plain object (cheap: only primitives/plain
//     objects/arrays, no functions, no circular refs — safe to
//     JSON.stringify or hand to a future saveState module):
//       {
//         tickCount: number,
//         zoneId: string,      // NEW — engine.zone.id at the moment of the snapshot
//         player: { x, y, stance, facing, hp, alive },  // hp/alive NEW — see
//                              // GAME OVER above, mirror player.hp/alive verbatim
//         guards: [ { id, x, y, state, meter, facing }, ... ],  // same order as engine.guards
//                              // — state already covers "is this guard
//                              // asleep" (state === "SLEEPING"), so no
//                              // separate sleeping flag is added here.
//         squad: { phase, phaseTime, lastKnown, alertCount },
//         gameOver: boolean,   // NEW — engine.gameOver verbatim; see GAME OVER above
//         darts: number,       // NEW — engine.inventory.darts verbatim
//         cameras: [ { x, y, panAngle, disabled, meter, fovDeg, range }, ... ],
//                              // NEW — director.cameraStates() verbatim (see
//                              // src/director.js contract); [] on a zone
//                              // with no camera coverage.
//         lasers: [ { x1, y1, x2, y2, active, periodS, dutyOn }, ... ],
//                              // NEW (Laboratory cycle) — director.laserStates()
//                              // verbatim (see src/director.js contract); []
//                              // on a zone with no lasers.
//         doors: [ { id, open }, ... ],
//                              // NEW (Laboratory cycle) — one entry per
//                              // zone.doors, same order, world.isDoorOpen(id)
//                              // read fresh at snapshot time; [] on a zone
//                              // with no doors.
//         keycards: { L1, L2, L3 }, // NEW (Laboratory cycle) —
//                              // engine.inventory.keycards verbatim.
//         missionComplete: boolean, // NEW (win-state cycle) — engine.
//                              // missionComplete verbatim; see MISSION
//                              // STATS / EXTRACTION / RANK above.
//         stats: {...},        // NEW (win-state cycle) — a shallow clone of
//                              // engine.stats (same shape documented above).
//       }
//
// Pure JS logic — no THREE, no DOM, no Date/Math.random/performance.now used
// IN THIS FILE (perf timing, where needed, is the caller's job — see the
// portable-timing note in tests/engine.test.js). Runs headless in node.
// Consumes rng/world/vision/guardAI/player only via their published
// contracts; does not modify any of them.
(function (Game) {
  var DT = 1 / 60;

  function normalizeInput(input, player) {
    input = input || {};
    return {
      moveX: input.moveX || 0,
      moveY: input.moveY || 0,
      run: !!input.run,
      stance: input.stance !== undefined ? input.stance : player.stance,
      // knock: NOT part of player.js's own input contract (player.update
      // ignores unknown fields, see src/player.js) — carried here purely for
      // the engine's own edge-triggered knock-verb handling (see tick()
      // step 2b in the file header). Defaults to false, same as run.
      knock: !!input.knock,
      // fire: same shape/rationale as knock, but for the tranq pistol (see
      // FIRE VERB in the file header / tick() step 2c). Defaults to false.
      fire: !!input.fire,
      // cqc/drag: same edge-triggered shape as knock/fire, but for the CQC
      // takedown and the context-dependent drag/locker verb (see CQC VERB /
      // DRAG VERB / LOCKER VERB in the file header). Defaults to false.
      cqc: !!input.cqc,
      drag: !!input.drag,
      // box/ration/chaff: same edge-triggered shape as knock/fire/cqc/drag,
      // but for the cardboard box toggle and the ration/chaff consumables
      // (see BOX VERB / RATION VERB / CHAFF VERB in the file header).
      // Defaults to false.
      box: !!input.box,
      ration: !!input.ration,
      chaff: !!input.chaff,
    };
  }

  // ---- CQC / DRAG / LOCKER local helpers (no dependency on other modules) --

  function dist2d(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  var TWO_PI_E = Math.PI * 2;

  // Smallest ABSOLUTE angular difference between two facings (radians),
  // wrapped correctly across the +/-PI seam. Used only by the CQC "is the
  // player behind this guard" check (see CQC VERB in the file header).
  function absAngleDiff(a, b) {
    var d = (a - b) % TWO_PI_E;
    if (d > Math.PI) d -= TWO_PI_E;
    if (d < -Math.PI) d += TWO_PI_E;
    return Math.abs(d);
  }

  var CQC_RANGE = 1.4;
  var CQC_MISS_FEEDBACK_RANGE = 2.5;
  var CQC_BEHIND_DEG = 100;
  var CQC_NOISE_RADIUS = 3;
  var DRAG_ATTACH_DIST = 1.2;
  var DRAG_FOLLOW_DIST = 0.9;
  var DRAG_SPEED_MULT = 0.55;
  var LOCKER_INTERACT_DIST = 1.0;
  var LOCKER_STEP_DIST = 1.0;
  // BOX SPEED CAP (see file header BOX VERB) — identical value/rationale to
  // DRAG_SPEED_MULT above, kept as its own named constant since the two are
  // mutually exclusive gates, not the same one reused.
  var BOX_SPEED_MULT = 0.55;
  // CHAFF pop noise radius (see file header CHAFF VERB) — a bespoke one-off
  // radius, same precedent as CQC_NOISE_RADIUS above (not one of
  // soundEvents.js's named RADII kinds).
  var CHAFF_NOISE_RADIUS = 4;
  // PICKUP collection distance (see file header PICKUPS step / Laboratory
  // cycle) — "walk over it" per src/world.js's schema note.
  var PICKUP_DIST = 0.7;
  // DOOR distances/timer (see file header DOORS step) — DOOR_KEYED_OPEN_DIST
  // is deliberately tighter than DOOR_PROXIMITY_DIST: an unlocked door
  // shrugs open for anyone in the general vicinity, but badging through a
  // locked one takes actually walking up to it.
  var DOOR_KEYED_OPEN_DIST = 1.2;
  var DOOR_PROXIMITY_DIST = 1.5;
  var DOOR_AUTO_CLOSE_S = 3;
  // Decoy position handed to every guard.update() call while
  // engine.playerHidden is true (see LOCKER VERB / GUARD PERCEPTION GATE in
  // the file header) — far enough outside any zone's VISION.RANGE (14m, even
  // CAUTION-widened) that inCone always fails regardless of guard position.
  var HIDDEN_DECOY_POS = -9999;

  // RANK TABLE (see file header MISSION STATS / EXTRACTION / RANK) — a PURE
  // function, no engine/closure state, exported below as Game.computeRank so
  // tests can exercise every threshold directly without spinning up a live
  // engine.
  var FOX_TIME_CAP_S = 15 * 60;

  function computeRank(stats) {
    var alerts = stats.alertsTotal;
    var kills = stats.kills || 0;

    if (alerts === 0 && kills === 0) return "BIG BOSS";

    // KILLS CAP — see file header: stats.kills is always 0 this cycle (no
    // lethal weapon exists), so this branch is dead code today, but the
    // table already does the right thing the day a lethal option ships.
    if (kills > 0) {
      if (alerts <= 2) return "HOUND";
      if (alerts <= 4) return "DOBERMAN";
      if (alerts <= 6) return "JACKAL";
      return "ELEPHANT";
    }

    if (alerts <= 1 && stats.missionTimeS < FOX_TIME_CAP_S) return "FOX";
    if (alerts <= 2) return "HOUND";
    if (alerts <= 4) return "DOBERMAN";
    if (alerts <= 6) return "JACKAL";
    return "ELEPHANT";
  }

  function defaultGuardConfigs(zone) {
    return [{ id: "g1", spawn: zone.waypoints[0], waypoints: zone.waypoints }];
  }

  // ZONE TRANSITIONS — per-zone guard tables (see file header, opts.guardConfigs
  // and tick() step 6): keyed by zone.id, used both as the opts.guardConfigs
  // default at construction AND to repopulate guards whenever a zone
  // transition rebuilds the stack for a target zone. A zone.id with no entry
  // here (e.g. a bespoke zoneData a test hands in directly) falls back to
  // defaultGuardConfigs' single-guard-on-`waypoints` shape.
  var ZONE_GUARDS = {
    loadingDock: function (zone) {
      return [{ id: "g1", spawn: zone.waypoints[0], waypoints: zone.waypoints }];
    },
    warehouse: function (zone) {
      return [
        { id: "w1", spawn: zone.waypoints[0], waypoints: zone.waypoints },
        { id: "w2", spawn: zone.waypoints2[0], waypoints: zone.waypoints2 },
      ];
    },
    // Laboratory (new — see src/world.js's zone comments): lab-g1 patrols
    // the lobby only, lab-g2 the west wing only — neither loop ever crosses
    // a door (see world.js's own design note: guards never need doors).
    laboratory: function (zone) {
      return [
        { id: "lab-g1", spawn: zone.waypoints[0], waypoints: zone.waypoints },
        { id: "lab-g2", spawn: zone.waypoints2[0], waypoints: zone.waypoints2 },
      ];
    },
    // Comms Tower (new — the finale zone, see src/world.js's own PATROL
    // INTERLOCK comment for the full route design): 4 guards, one per loop —
    // tower-g1 the outer perimeter ring, tower-g2 the tight core ring around
    // the tower stairwell, tower-g3/tower-g4 the east/west yard loops. This
    // is the heaviest guard roster shipped so far (previous zones topped out
    // at 2) — see tests/commsTower.test.js's own perf-budget test for the
    // <4ms/tick confirmation with all 4 plus 2 cameras + 1 laser live.
    commsTower: function (zone) {
      return [
        { id: "tower-g1", spawn: zone.waypoints[0], waypoints: zone.waypoints },
        { id: "tower-g2", spawn: zone.waypoints2[0], waypoints: zone.waypoints2 },
        { id: "tower-g3", spawn: zone.waypoints3[0], waypoints: zone.waypoints3 },
        { id: "tower-g4", spawn: zone.waypoints4[0], waypoints: zone.waypoints4 },
      ];
    },
  };

  function guardConfigsForZone(zone) {
    var builder = ZONE_GUARDS[zone.id];
    return builder ? builder(zone) : defaultGuardConfigs(zone);
  }

  function buildGuards(guardConfigs, world, vision, rng, squad) {
    return guardConfigs.map(function (cfg) {
      return Game.createGuard({
        world: world,
        vision: vision,
        rng: rng,
        squad: squad,
        spawn: cfg.spawn,
        waypoints: cfg.waypoints,
        id: cfg.id,
      });
    });
  }

  // ---- ZONE PERSISTENCE (NEW — per-zone state stash cycle, see file header
  // ZONE TRANSITIONS / STASH section) ------------------------------------------
  // ZONE_REINFORCEMENT_CAP mirrors src/director.js's own REINFORCEMENT_MAX
  // (3) — duplicated, not imported, because director.js is out of scope for
  // this cycle's task packet (see file header STASH note on the reinforcement
  // counter). This is the TRUE, zone-LIFETIME cap engine.js itself enforces
  // across visits (see zoneReinforcementUsed below); director's own internal
  // counter is a fresh per-VISIT ceiling that is always >= what's actually
  // left, so it never falsely blocks a spawn this cap would still allow.
  var ZONE_REINFORCEMENT_CAP = 3;

  // REINFORCEMENT WAYPOINTS — duplicated from src/director.js's own private
  // buildReinforcementWaypoints/REINFORCEMENT_OFFSETS (see that file's
  // REINFORCEMENTS section) for exactly the same out-of-scope reason above.
  // This is a PURE function of (zone.guardDoor, world) using only world.js's
  // published isBlockedCircle — given the SAME zone + a freshly built world
  // (switchZone always builds a fresh Game.createWorld(targetZone) before
  // this ever runs), it reproduces the IDENTICAL offsets director's own
  // spawnReinforcement used when the guard being restored was first spawned,
  // so a rebuilt reinforcement guard's waypointIndex (restored verbatim by
  // guard.setState(), see rebuildGuardsFromStash below) points at the same
  // physical points, not an incompatible array. Kept in sync deliberately —
  // a future cycle that changes director.js's own offsets must mirror the
  // change here (both files' own comments cross-reference this fact).
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

  function buildReinforcementWaypointsForZone(zone, world) {
    var door = zone.guardDoor;
    if (!door) return [{ x: 0, y: 0 }];
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

  // rebuildGuardsFromStash(stashedGuards, targetZone, newWorld, newVision,
  // rng, newSquad) -> [guard, ...] — reconstructs the FULL roster a stashed
  // zone had at departure (base guards AND any reinforcements — see file
  // header), same order as stashedGuards, then applies each one's own
  // guard.getState()/setState() round-trip (identical mechanism
  // src/saveState.js already relies on for a save/restore cycle — this is
  // just that same per-guard contract, triggered by a zone re-entry instead
  // of a save file). A stashed id matching this zone's own ZONE_GUARDS table
  // is a base guard (rebuilt with its authored spawn/waypoints); anything
  // else is assumed a reinforcement (rebuilt with the SAME deterministic
  // guardDoor-anchored loop above — see buildReinforcementWaypointsForZone).
  function rebuildGuardsFromStash(stashedGuards, targetZone, newWorld, newVision, rng, newSquad) {
    var baseConfigs = guardConfigsForZone(targetZone);
    var configById = {};
    for (var i = 0; i < baseConfigs.length; i++) configById[baseConfigs[i].id] = baseConfigs[i];

    var reinfWaypoints = null; // lazily built only if a reinforcement is actually present
    var door = targetZone.guardDoor || { x: 0, y: 0 };

    return stashedGuards.map(function (sg) {
      var cfg = configById[sg.id];
      var newGuard;
      if (cfg) {
        newGuard = Game.createGuard({
          world: newWorld,
          vision: newVision,
          rng: rng,
          squad: newSquad,
          spawn: cfg.spawn,
          waypoints: cfg.waypoints,
          id: cfg.id,
        });
      } else {
        if (!reinfWaypoints) reinfWaypoints = buildReinforcementWaypointsForZone(targetZone, newWorld);
        newGuard = Game.createGuard({
          world: newWorld,
          vision: newVision,
          rng: rng,
          squad: newSquad,
          spawn: { x: door.x, y: door.y },
          waypoints: reinfWaypoints,
          id: sg.id,
        });
      }
      newGuard.setState(sg.state);
      return newGuard;
    });
  }

  function createEngine(opts) {
    opts = opts || {};
    var zone = opts.zoneData || Game.ZONES.loadingDock;
    var seed = opts.seed !== undefined ? opts.seed : 1;
    var guardConfigs = opts.guardConfigs || guardConfigsForZone(zone);

    var rng = Game.createRng(seed);
    var world = Game.createWorld(zone);
    var soundEvents = Game.createSoundEvents({ world: world });
    var vision = Game.createVision({ world: world });
    var squad = Game.createSquad();
    var player = Game.createPlayer({ world: world });

    // Inventory (see src/items.js contract) — NOT rebuilt on a zone
    // transition (see FIRE VERB / switchZone below): darts are mission-
    // scoped, not zone-scoped, so this var is never reassigned by
    // switchZone the way world/player/squad/etc. are.
    var inventory = Game.createInventory();

    // Edge-trigger state for the knock verb (see file header, tick() step
    // 2b) — private to this engine instance, not exposed on `engine` since
    // it's an implementation detail of the input, not simulation truth.
    var prevKnock = false;

    // Edge-trigger state for the fire verb (see file header, tick() step
    // 2c) — same shape/rationale as prevKnock above.
    var prevFire = false;

    // Edge-trigger state for the CQC / drag-and-locker verbs (see file
    // header CQC VERB / DRAG VERB / LOCKER VERB) — same shape/rationale as
    // prevKnock/prevFire above.
    var prevCqc = false;
    var prevDrag = false;

    // Edge-trigger state for the box toggle / ration / chaff verbs (see
    // file header BOX VERB / RATION VERB / CHAFF VERB) — same shape/
    // rationale as prevKnock/prevFire/prevCqc/prevDrag above.
    var prevBox = false;
    var prevRation = false;
    var prevChaff = false;

    // The locker (a plain {x,y,facing} from zone.lockers) the player is
    // CURRENTLY hidden in, or null — private mirror of engine.playerHidden
    // that remembers WHICH locker so the exit step (see LOCKER VERB) knows
    // which facing to step out along. Reset alongside playerHidden on a zone
    // transition (see switchZone).
    var hiddenLocker = null;

    // NEW (locker-check cycle) — see file header EVASION LOCKER CHECK's own
    // "REGAINED-CONTACT BRIDGE" note: true for the remainder of THIS tick
    // only, the instant checkLocker() below resolves a "player" or "body"
    // discovery; reset false at the top of every tick(). Not part of any
    // save/restore round-trip — purely a same-tick signal feeding this
    // tick's own anyLOS computation (see CAMERAS DO NOT CONTRIBUTE below),
    // never read again once that tick's squad.tick() call has run.
    var lockerContactThisTick = false;

    // PICKUPS (see file header, tick() step 1.5, Laboratory cycle) — which
    // zone.pickups[] indices have already been collected, keyed by
    // "<zone.id>#<index>" so revisiting the SAME zone later in the same
    // mission never re-offers something already picked up, while a
    // DIFFERENT zone's pickups (a fresh key namespace) are unaffected.
    // Mission-scoped like inventory itself — NOT reset by switchZone.
    var collectedPickups = {};

    // DOORS (see file header, tick() step 1.6, Laboratory cycle) — per-door
    // "last tick someone was near" timestamp (engine.time), keyed by
    // door.id. ZONE-SCOPED (reset in switchZone, alongside the world/guards/
    // squad stack itself) — a door belongs to the zone whose world instance
    // owns its open/closed flag (see src/world.js's DOORS contract), and a
    // fresh world always starts every door closed anyway.
    var doorLastNear = {};

    // Edge-trigger state for zoneBlocked (see file header, tick() step 6):
    // true while the player is standing inside an exit trigger whose `to`
    // doesn't resolve to a built zone, so the event fires once on entry, not
    // once per tick spent standing there. Reset whenever a zone switch
    // actually happens (fresh zone, fresh region state).
    var inBlockedExitRegion = false;

    // ZONE STASH (NEW — per-zone state persistence cycle, see file header
    // ZONE TRANSITIONS / STASH section): { [zoneId]: stashEntry }, one entry
    // per zone this engine has ever DEPARTED at least once (a zone visited
    // only via direct construction, never departed, has no entry — see
    // switchZone below). MISSION-scoped (never cleared), keyed by zone id so
    // each zone's own history is independent. Written at the top of every
    // switchZone() call (stashing the DEPARTING zone) and consulted when
    // switchZone() builds the TARGET zone's stack — see stashZone()/
    // switchZone() below for the full read/write contract. Plain JSON-safe
    // data only (every field comes from some module's own getState(), or a
    // plain number/boolean) — safe to carry through src/saveState.js's
    // capture()/restore() verbatim via engine.getState()/setState() below.
    var zoneStash = {};

    // Cumulative reinforcements ever spawned in the CURRENT zone, across
    // EVERY visit (not just this one) — see file header STASH section's
    // reinforcement-counter DECISION. Seeded from zoneStash[zone.id] on
    // every switchZone (0 for a zone with no stash yet); persisted back into
    // the stash the next time this zone is departed. Enforced by engine
    // itself in the ESCALATION event-processing step below (see tick()) —
    // director's own per-visit REINFORCEMENT_MAX is always a looser (or
    // equal) ceiling, so it never blocks a spawn this cap would still allow,
    // but it also never remembers a PRIOR visit's spend, so engine is the
    // one true enforcement point across zone re-entries.
    var zoneReinforcementUsed = 0;

    var guards = buildGuards(guardConfigs, world, vision, rng, squad);

    // DIRECTOR (see src/director.js contract) — owns this zone's wall-mounted
    // security cameras (zone.cameras, empty-safe: a zone with no cameras just
    // gets a director with an empty roster, no special-casing needed here).
    // Built fresh for every zone, same "rebuild on transition" rule as
    // world/vision/squad/guards (see switchZone below). `rng` (NEW — see
    // src/director.js's own ESCALATION contract) is the SAME shared rng
    // instance every guard gets — a spawned reinforcement guard needs one for
    // its own ALERT fire-accuracy roll, same "single source of randomness"
    // rule as everywhere else in this file.
    var director = Game.createDirector({ world: world, vision: vision, squad: squad, rng: rng });

    var engine = {
      world: world,
      player: player,
      guards: guards,
      squad: squad,
      vision: vision,
      director: director,
      rng: rng,
      soundEvents: soundEvents,
      inventory: inventory,
      zone: zone,
      DT: DT,
      tickCount: 0,
      time: 0,
      events: [],
      gameOver: false,
      dragging: null,
      playerHidden: false,
      // CHAFF VERB (see file header) — absolute sim-time deadline (compared
      // against engine.time, never a countdown counter), 0 meaning "never
      // thrown yet" (engine.time also starts at 0, so 0 > 0 is false — no
      // spurious jam at boot). Mission-scoped like inventory.darts/rations/
      // chaff — NOT reset by switchZone.
      chaffUntil: 0,
      // MISSION STATS / EXTRACTION / RANK (new — win-state cycle, see file
      // header) — mission-scoped like inventory/chaffUntil above, NOT reset
      // by switchZone.
      stats: {
        alertsTotal: 0,
        dartsFired: 0,
        cqcTakedowns: 0,
        kills: 0,
        rationsUsed: 0,
        chaffUsed: 0,
        savesUsed: 0,
        knocksMade: 0,
        missionTimeS: 0,
      },
      missionComplete: false,
    };

    // ---- CQC / DRAG / LOCKER helpers (see file header) ------------------------
    // These close over `zone`/`world`/`player`/`guards` directly (not local
    // copies), same convention as switchZone/tryZoneTransition below, so they
    // stay correct across a zone transition's reassignment of those vars.

    function findGuardById(id) {
      for (var i = 0; i < guards.length; i++) {
        if (guards[i].id === id) return guards[i];
      }
      return null;
    }

    // Nearest zone.lockers[] entry within maxDist of the player, or null.
    function nearestLocker(maxDist) {
      var lockers = zone.lockers || [];
      var best = null;
      var bestDist = Infinity;
      for (var i = 0; i < lockers.length; i++) {
        var d = dist2d(player.x, player.y, lockers[i].x, lockers[i].y);
        if (d <= maxDist && d < bestDist) {
          bestDist = d;
          best = lockers[i];
        }
      }
      return best;
    }

    // checkLocker(lockerIndex, guardId) — see file header EVASION LOCKER
    // CHECK. Handed to every guard.update() call as ctx.checkLocker (see
    // src/guardAI.js's own contract); this module owns every consequence of
    // a non-"empty" result. Returns "player" | "body" | "empty".
    function checkLocker(lockerIndex, guardId) {
      var lockers = zone.lockers || [];
      var locker = lockers[lockerIndex];
      if (!locker) return "empty"; // defensive: an invalid index is just empty

      if (engine.playerHidden && hiddenLocker === locker) {
        // PLAYER FOUND — same step-out primitive as the player's own G-key
        // EXIT LOCKER path (see LOCKER VERB above): 1m along the locker's
        // own facing, collision-safe via world.moveCircle.
        var stepped = world.moveCircle(
          locker.x,
          locker.y,
          Math.cos(locker.facing) * LOCKER_STEP_DIST,
          Math.sin(locker.facing) * LOCKER_STEP_DIST,
          player.radius
        );
        player.x = stepped.x;
        player.y = stepped.y;
        player.facing = locker.facing;
        engine.playerHidden = false;
        hiddenLocker = null;
        squad.broadcastAlert(player.x, player.y);
        lockerContactThisTick = true;
        engine.events.push({
          type: "lockerDiscovery",
          found: "player",
          lockerIndex: lockerIndex,
          guardId: guardId,
        });
        return "player";
      }

      // BODY FOUND — a stuffed colleague's position IS the locker's own
      // {x,y}, by construction (see src/guardAI.js's stuffInLocker
      // contract), so an exact coordinate match is a safe, cheap test.
      // Deliberately does NOT set lockerContactThisTick (see file header's
      // REGAINED-CONTACT BRIDGE note for why "body" stays unbridged, unlike
      // "player") — this is squad.broadcastAlert's plain, unbridged shape.
      for (var i = 0; i < guards.length; i++) {
        var g = guards[i];
        if (g.hidden && g.x === locker.x && g.y === locker.y) {
          squad.broadcastAlert(locker.x, locker.y);
          engine.events.push({
            type: "lockerDiscovery",
            found: "body",
            lockerIndex: lockerIndex,
            guardId: guardId,
          });
          return "body";
        }
      }

      engine.events.push({
        type: "lockerDiscovery",
        found: "empty",
        lockerIndex: lockerIndex,
        guardId: guardId,
      });
      return "empty";
    }

    // Nearest SLEEPING, not-already-hidden guard within maxDist of the
    // player, or null (see DRAG VERB — a hidden/stuffed body is not a valid
    // attach target).
    function nearestSleepingGuard(maxDist) {
      var best = null;
      var bestDist = Infinity;
      for (var i = 0; i < guards.length; i++) {
        var g = guards[i];
        if (g.state !== "SLEEPING" || g.hidden) continue;
        var d = dist2d(player.x, player.y, g.x, g.y);
        if (d <= maxDist && d < bestDist) {
          bestDist = d;
          best = g;
        }
      }
      return best;
    }

    // Handles one G-key edge — see file header DRAG VERB / LOCKER VERB for
    // the full priority write-up. Mutates engine.dragging/engine.playerHidden/
    // hiddenLocker/player.x/y/facing/guard state as needed; pushes no events
    // of its own (the drag/locker verbs are silent by design — the visible
    // feedback is the state change itself, mirrored into hud/render).
    function handleDragKey() {
      if (engine.playerHidden) {
        // EXIT LOCKER — always wins while hidden, regardless of anything
        // else (see file header priority list, step 1).
        var exitFacing = hiddenLocker ? hiddenLocker.facing : player.facing;
        var stepped = world.moveCircle(
          player.x,
          player.y,
          Math.cos(exitFacing) * LOCKER_STEP_DIST,
          Math.sin(exitFacing) * LOCKER_STEP_DIST,
          player.radius
        );
        player.x = stepped.x;
        player.y = stepped.y;
        player.facing = exitFacing;
        engine.playerHidden = false;
        hiddenLocker = null;
        return;
      }

      var lockerHere = nearestLocker(LOCKER_INTERACT_DIST);

      if (engine.dragging) {
        if (lockerHere) {
          // STUFF the dragged body into the locker.
          var dragged = findGuardById(engine.dragging);
          if (dragged) dragged.stuffInLocker(lockerHere);
          engine.dragging = null;
        } else {
          // RELEASE — guard is left wherever the last drag-follow tick put it.
          engine.dragging = null;
        }
        return;
      }

      if (lockerHere) {
        // HIDE the player.
        engine.playerHidden = true;
        hiddenLocker = lockerHere;
        return;
      }

      var sleeper = nearestSleepingGuard(DRAG_ATTACH_DIST);
      if (sleeper) {
        engine.dragging = sleeper.id;
      }
    }

    // CQC — see file header CQC VERB. Called only on a cqc edge, and only
    // while not playerHidden/dragging (both hands full otherwise — see file
    // header). Pushes its own cqc/cqcMiss/noiseHeard events directly.
    function tryCqc() {
      var bestGuard = null;
      var bestDist = Infinity;
      var anyWithinMissRange = false;

      for (var i = 0; i < guards.length; i++) {
        var g = guards[i];
        var d = dist2d(player.x, player.y, g.x, g.y);
        if (d <= CQC_MISS_FEEDBACK_RANGE) anyWithinMissRange = true;

        if (d > CQC_RANGE) continue;
        if (g.state === "SLEEPING") continue;
        if (squad.phase === "ALERT") continue;
        var dirToPlayer = Math.atan2(player.y - g.y, player.x - g.x);
        var behindDeg = (absAngleDiff(g.facing, dirToPlayer) * 180) / Math.PI;
        if (behindDeg <= CQC_BEHIND_DEG) continue;

        if (d < bestDist) {
          bestDist = d;
          bestGuard = g;
        }
      }

      if (bestGuard) {
        bestGuard.cqc();
        engine.events.push({ type: "cqc", guardId: bestGuard.id });
        engine.stats.cqcTakedowns++;
        var thudResults = soundEvents.emitRadius(bestGuard.x, bestGuard.y, CQC_NOISE_RADIUS, false, guards);
        for (var ti = 0; ti < thudResults.length; ti++) {
          if (thudResults[ti].heard) {
            engine.events.push({
              type: "noiseHeard",
              guardId: thudResults[ti].listenerId,
              x: bestGuard.x,
              y: bestGuard.y,
              strength: thudResults[ti].strength,
            });
          }
        }
      } else if (anyWithinMissRange) {
        engine.events.push({ type: "cqcMiss" });
      }
    }

    // COMBAT (see file header) — passed as ctx.onGuardFire to every
    // guard.update() call in the tick() guard loop below. References the
    // OUTER `player`/`guards`/`soundEvents`/`engine` closure vars directly
    // (not local copies), so it stays correct across a zone transition's
    // reassignment of those vars (see switchZone below) without needing to be
    // rebuilt itself.
    function onGuardFire(guard, hit) {
      engine.events.push({ type: "guardFire", guardId: guard.id, hit: hit });

      var noiseResults = soundEvents.emitRadius(guard.x, guard.y, 10, true, guards);
      for (var ni = 0; ni < noiseResults.length; ni++) {
        if (noiseResults[ni].heard) {
          engine.events.push({
            type: "noiseHeard",
            guardId: noiseResults[ni].listenerId,
            x: guard.x,
            y: guard.y,
            strength: noiseResults[ni].strength,
          });
        }
      }

      if (hit) {
        player.damage(Game.GUARD.FIRE_DAMAGE);
        engine.events.push({ type: "playerHit", hp: player.hp });
      }
    }

    // STASH THE DEPARTING ZONE (NEW — per-zone state persistence cycle, see
    // file header ZONE TRANSITIONS / STASH section). Captures everything the
    // v1 "discard the departed zone" comment used to just throw away:
    //   guards  — every guard.getState() (base AND any live reinforcements —
    //             the live `guards` array already contains both, see
    //             src/director.js's own note on ctx.guards being engine's
    //             live array), keyed by id so rebuildGuardsFromStash can
    //             match identity later exactly like src/saveState.js already
    //             does for a save/restore round-trip.
    //   squad   — squad.getState() (phase/phaseTime/lastKnown/alertCount). In
    //             practice phase reads "INFILTRATION" every single time this
    //             runs (see DESIGN RULE below — tryZoneTransition only ever
    //             calls switchZone while squad.phase IS "INFILTRATION"), but
    //             phaseTime/alertCount can still be arbitrary nonzero values,
    //             and capturing the full shape is what makes a restored
    //             snapshot byte-identical to a live one (the DETERMINISM
    //             hard gate — see file header).
    //   director — director.getState() (camera meters/disabled/wasSuspicious,
    //             laser active flags). REINFORCEMENT/CHECK-IN bookkeeping
    //             (reinforcementCount, the spawn-timer, missingSearchers) is
    //             NOT in this shape — director.js doesn't expose it (see that
    //             file's own SAVE/RESTORE — HONEST GAP note) and director.js
    //             is out of scope for this cycle's task packet. The
    //             reinforcement COUNT half of that gap is covered separately,
    //             for real, by zoneReinforcementUsed below (engine's own
    //             cross-visit enforcement, not director's per-visit one) —
    //             only the check-in dispatch tracking (missingSearchers)
    //             stays a genuine gap, and it's a benign one: the check-in
    //             SCHEDULE itself is a pure function of (global engine.time,
    //             guard index) with no memory to lose (see director.js's own
    //             PURE-FUNCTION CHECK-IN SCHEDULE note), so it keeps working
    //             correctly, memorylessly, across any number of zone visits;
    //             only "was a searcher already dispatched for guard X"
    //             forgets, which at worst redispatches a search that was
    //             already in flight — never a crash, never a false alert.
    //   doors   — { [doorId]: { open, elapsedNear } } — open flag from
    //             world.isDoorOpen(id); elapsedNear is engine.time MINUS
    //             doorLastNear[id] (seconds since a door open enough to still
    //             be auto-closing was last stood near), NOT the raw absolute
    //             timestamp — engine.time keeps climbing mission-wide while
    //             this zone sits dormant (see FROZEN TIME note below), so an
    //             elapsed DURATION is what correctly resumes the 3s
    //             auto-close countdown on re-entry rather than replaying a
    //             stale absolute instant against a much-later clock.
    //   reinforcementBudgetUsed — zoneReinforcementUsed's current value (see
    //             its own declaration comment above).
    // collectedPickups is deliberately NOT part of this shape — it's already
    // mission-scoped (keyed by "<zoneId>#<index>", never reset by switchZone,
    // see its own declaration comment) and was ALREADY correct before this
    // cycle: a picked-up item never respawns whether the old discard-on-exit
    // semantics or this cycle's persistence is in effect. Verified, not
    // touched — see tests/zonePersistence.test.js's own pickup test.
    function stashZone(zoneIdToStash) {
      var doorsStashed = {};
      var doorList = zone.doors || [];
      for (var i = 0; i < doorList.length; i++) {
        var d = doorList[i];
        var isOpen = world.isDoorOpen(d.id);
        var lastNear = doorLastNear[d.id];
        var elapsedNear = isOpen && lastNear !== undefined ? Math.max(0, engine.time - lastNear) : 0;
        doorsStashed[d.id] = { open: isOpen, elapsedNear: elapsedNear };
      }

      zoneStash[zoneIdToStash] = {
        guards: guards.map(function (g) {
          return { id: g.id, state: g.getState() };
        }),
        squad: squad.getState(),
        director: director.getState(),
        doors: doorsStashed,
        reinforcementBudgetUsed: zoneReinforcementUsed,
      };
    }

    // ZONE TRANSITIONS (see file header, tick() step 6). Rebuilds the entire
    // world/soundEvents/vision/squad/guards stack for `targetZone`, and a
    // fresh player positioned at targetZone.entrances[entranceKey] (falling
    // back to targetZone.playerSpawn if that entrance is somehow missing —
    // defensive only, every shipped zone defines the entrances its own exits
    // point at). rng is deliberately NOT rebuilt — the single seeded stream
    // continues across the switch (see file header RNG note — re-entry does
    // NOT rewind it). Reassigns every closure var AND the matching
    // `engine.*` prop so both tick()/snapshot() (which close over the vars
    // directly) and external readers (engine.player, etc.) see the new zone
    // immediately.
    //
    // PERSISTENCE (NEW — see file header): first stashes the DEPARTING zone
    // (stashZone above), then checks zoneStash[targetZone.id] — a zone never
    // departed before (including the very first zone this engine ever booted
    // into) has no entry, and falls back to the ORIGINAL v1-shaped
    // construction (fresh squad/guards/director from ZONE_GUARDS, exactly as
    // before this cycle). A zone WITH a stash instead: rebuilds guards via
    // rebuildGuardsFromStash (base + any reinforcements, each guard.setState()
    // restored verbatim), a fresh squad immediately setState()'d from the
    // stash, a fresh director immediately setState()'d from the stash
    // (camera/laser live numbers only — see stashZone's own note on the
    // reinforcement/check-in gap), reopens any door that was left open (with
    // its auto-close countdown resumed via the elapsed-duration trick), and
    // seeds zoneReinforcementUsed from the stash so the +3 cap holds across
    // the whole zone's LIFETIME, not just this one visit (see file header).
    function switchZone(targetZone, entranceKey) {
      var fromId = zone.id;

      stashZone(fromId);

      var newWorld = Game.createWorld(targetZone);
      var newSoundEvents = Game.createSoundEvents({ world: newWorld });
      var newVision = Game.createVision({ world: newWorld });

      var stash = zoneStash[targetZone.id];

      var newSquad, newGuards, newDirector, newReinforcementUsed;
      var newDoorLastNear = {};

      if (stash) {
        newSquad = Game.createSquad();
        newSquad.setState(stash.squad);

        newGuards = rebuildGuardsFromStash(stash.guards, targetZone, newWorld, newVision, rng, newSquad);

        newDirector = Game.createDirector({ world: newWorld, vision: newVision, squad: newSquad, rng: rng });
        newDirector.setState(stash.director);

        // DOORS — reopen anything that was open when this zone was last
        // departed, and resume its auto-close countdown from where it was
        // frozen (see stashZone's own elapsedNear note): doorLastNear[id] is
        // set to engine.time MINUS the elapsed duration, so the very next
        // tick's `engine.time - doorLastNear[id] >= DOOR_AUTO_CLOSE_S` check
        // continues counting from exactly where it left off rather than
        // resetting to a fresh 3s or, worse, reading as already-expired
        // against the new (much later) global clock.
        var targetDoors = targetZone.doors || [];
        for (var di = 0; di < targetDoors.length; di++) {
          var dId = targetDoors[di].id;
          var dStash = stash.doors[dId];
          if (dStash && dStash.open) {
            newWorld.setDoorOpen(dId, true);
            newDoorLastNear[dId] = engine.time - dStash.elapsedNear;
          }
        }

        newReinforcementUsed = stash.reinforcementBudgetUsed || 0;
      } else {
        newSquad = Game.createSquad();
        newGuards = buildGuards(guardConfigsForZone(targetZone), newWorld, newVision, rng, newSquad);
        // DIRECTOR (see src/director.js contract) — rebuilt fresh for the
        // target zone's own camera roster, same "discard the departed zone's
        // instance, never carry it across" rule as world/vision/squad/guards
        // above (a departed zone's cameras belong to a world that no longer
        // exists).
        newDirector = Game.createDirector({ world: newWorld, vision: newVision, squad: newSquad, rng: rng });
        newReinforcementUsed = 0;
      }

      var entrance = (targetZone.entrances && targetZone.entrances[entranceKey]) || targetZone.playerSpawn;
      var newPlayer = Game.createPlayer({ world: newWorld });
      newPlayer.x = entrance.x;
      newPlayer.y = entrance.y;
      newPlayer.stance = player.stance;
      newPlayer.facing = player.facing;
      // hp/alive carry across the switch too (a fresh Game.createPlayer
      // defaults to full hp — copying these over is what keeps "walked
      // through a door" from doubling as a free heal; see src/player.js hp
      // contract). A dead player can't be standing in an exit trigger in the
      // first place (tryZoneTransition only runs while squad.phase is
      // INFILTRATION, and player.update ignores input once !alive, but
      // neither of those actually forbids this path on paper) — copied
      // defensively regardless.
      newPlayer.hp = player.hp;
      newPlayer.alive = player.alive;

      zone = targetZone;
      world = newWorld;
      soundEvents = newSoundEvents;
      vision = newVision;
      squad = newSquad;
      guards = newGuards;
      director = newDirector;
      player = newPlayer;
      inBlockedExitRegion = false;
      zoneReinforcementUsed = newReinforcementUsed;

      // DOORS (see file header, Laboratory cycle) — ZONE-SCOPED, discarded
      // alongside the departed zone's own world/guards/squad (see
      // doorLastNear's own declaration comment above), but NOW (see
      // PERSISTENCE above) seeded from the stash rather than always starting
      // empty, so a re-entered zone's auto-close timers resume correctly.
      // collectedPickups is deliberately NOT touched here — it's
      // mission-scoped, keyed by zone id, so a different zone's pickups are
      // unaffected and the SAME zone's pickups (on a later re-entry)
      // correctly stay collected.
      doorLastNear = newDoorLastNear;

      // ZONE-SCOPED drag/locker state (see file header CQC VERB / DRAG VERB /
      // LOCKER VERB) — a dragged guard belongs to the departing zone's now-
      // discarded roster, and a hidden-in-a-locker player has no locker to
      // return to in the new zone, so both reset on every transition, same
      // v1 semantics as before this cycle (persistence covers the ZONE's own
      // guards/squad/director/doors, not the player's own drag/locker verbs).
      engine.dragging = null;
      engine.playerHidden = false;
      hiddenLocker = null;

      engine.zone = zone;
      engine.world = world;
      engine.soundEvents = soundEvents;
      engine.vision = vision;
      engine.squad = squad;
      engine.guards = guards;
      engine.director = director;
      engine.player = player;

      engine.events.push({ type: "zoneChange", from: fromId, to: zone.id });
    }

    // EXTRACTION / MISSION COMPLETE (see file header MISSION STATS /
    // EXTRACTION / RANK) — called by tryZoneTransition() below the instant
    // the player is standing in an exit region whose `to` is the literal
    // "extraction" terminal, while squad.phase === "INFILTRATION" (the same
    // gate every ordinary zone crossing already requires). Defensive
    // `if (engine.missionComplete) return;` guard: unreachable in practice
    // (a frozen engine's tick() never calls tryZoneTransition again), kept
    // for the same reason the GAME OVER check above is written generically
    // rather than assuming its own single call site.
    function completeMission() {
      if (engine.missionComplete) return;

      // engine.time itself isn't bumped by THIS tick's own DT until step 8,
      // further down this same tick() call (this runs from inside step 7) —
      // see file header note on missionTimeS for why + DT here and the
      // step-8 mirror converge on the identical number moments later.
      engine.stats.missionTimeS = engine.time + DT;

      var rank = computeRank(engine.stats);
      engine.missionComplete = true;
      engine.events.push({
        type: "missionComplete",
        stats: Object.assign({}, engine.stats),
        rank: rank,
      });
    }

    // Checks zone.exits[] for the player standing in a trigger region and
    // acts per the DESIGN RULE in the file header: only while
    // squad.phase === "INFILTRATION". At most one switch per tick (first
    // matching exit wins); an unresolvable `to` pushes zoneBlocked on the
    // region-entry edge only (see inBlockedExitRegion above).
    function tryZoneTransition() {
      if (squad.phase !== "INFILTRATION") return;

      var exits = zone.exits || [];
      var matched = null;
      for (var i = 0; i < exits.length; i++) {
        if (world.inRegion(player.x, player.y, exits[i])) {
          matched = exits[i];
          break;
        }
      }

      if (!matched) {
        inBlockedExitRegion = false;
        return;
      }

      // EXTRACTION (see file header, MISSION STATS / EXTRACTION / RANK) —
      // checked BEFORE the Game.ZONES lookup below: "extraction" is a
      // documented PERMANENT TERMINAL, not a placeholder some future cycle
      // resolves into a real zone, so it must never fall into the generic
      // zoneBlocked branch below.
      if (matched.to === "extraction") {
        completeMission();
        return;
      }

      var targetZone = Game.ZONES[matched.to];
      if (targetZone) {
        switchZone(targetZone, matched.entranceKey);
        return;
      }

      if (!inBlockedExitRegion) {
        engine.events.push({ type: "zoneBlocked", to: matched.to });
      }
      inBlockedExitRegion = true;
    }

    function tick(input) {
      // FROZEN CHECK (see file header, tick() step 0) — a latched gameOver
      // OR missionComplete stops the sim cold: no event clearing, no state
      // mutation whatsoever.
      if (engine.gameOver || engine.missionComplete) return;

      engine.events = [];
      // NEW (locker-check cycle) — see file header EVASION LOCKER CHECK's
      // "REGAINED-CONTACT BRIDGE" note: reset every tick, set true by
      // checkLocker() below on a "player"/"body" result, read once by this
      // same tick's anyLOS computation further down.
      lockerContactThisTick = false;

      // LASERS (see file header, tick() step 3.6, Laboratory cycle) — the
      // player's REAL position at the very start of this tick, before ANY
      // movement (CQC/drag/locker-exit teleport, then player.update) — see
      // src/director.js's own laser contract for why the crossing test wants
      // the FULL tick's movement segment, not just player.update's slice.
      var playerPrevX = player.x;
      var playerPrevY = player.y;

      // Captured BEFORE guards update: a guard's own broadcastAlert() call
      // (fired from inside guard.update(), e.g. SUSPICIOUS/INVESTIGATE/
      // EVASION/CAUTION confirming sight — see guardAI.js contract) can flip
      // squad.phase/alertCount immediately, well before squad.tick() ever
      // runs this tick. Diffing against a snapshot taken after the guard loop
      // would miss exactly that transition, so the "before" snapshot must
      // predate step 2 entirely.
      var phaseBefore = squad.phase;
      var alertCountBefore = squad.alertCount;

      var normalized = normalizeInput(input, player);

      // ---- CQC / DRAG / LOCKER VERBS (new — see file header) — processed
      // BEFORE player.update so (a) a G-edge that exits a locker THIS tick
      // restores full movement/perception immediately (same tick), and
      // (b) the FROZEN INPUT / DRAG SPEED CAP adjustments below land in
      // `normalized` before it's ever handed to player.update.
      var dragEdge = normalized.drag && !prevDrag;
      prevDrag = normalized.drag;
      // BOX / DRAG / LOCKER INTERACTION MATRIX (see file header BOX VERB /
      // src/items.js's own matrix note): G is entirely dead while boxed —
      // handleDragKey() covers attach/hide AND release/exit in one call, so
      // gating the call itself here is enough to block every branch.
      if (dragEdge && !inventory.boxOn) {
        handleDragKey();
      }

      var cqcEdge = normalized.cqc && !prevCqc;
      prevCqc = normalized.cqc;
      if (cqcEdge && !engine.playerHidden && !engine.dragging && !inventory.boxOn) {
        tryCqc();
      } else if (cqcEdge && (engine.dragging || inventory.boxOn)) {
        // NO CQC WHILE DRAGGING or BOXED — both hands are full in either case.
        engine.events.push({ type: "busy" });
      }

      // BOX VERB (see file header) — B is a TOGGLE, not a one-shot action,
      // and (per the interaction matrix) only takes effect while neither
      // dragging nor hidden holds (either from before this tick, or just
      // set by the dragEdge processing immediately above this same tick).
      var boxEdge = normalized.box && !prevBox;
      prevBox = normalized.box;
      if (boxEdge && inventory.hasBox && !engine.dragging && !engine.playerHidden) {
        inventory.boxOn = !inventory.boxOn;
      }

      // FROZEN INPUT while hidden (see file header LOCKER VERB) — movement
      // is zeroed so player.moving/noiseRadius() both read false/0; fire/cqc
      // are gated at their own call sites below via engine.playerHidden.
      if (engine.playerHidden) {
        normalized.moveX = 0;
        normalized.moveY = 0;
        normalized.run = false;
      }

      // DRAG SPEED CAP (see file header DRAG VERB) — player.js has no
      // speed-cap hook, so the ALREADY-normalized input vector is scaled
      // here, before player.update ever sees it. BOX SPEED CAP is the same
      // mechanism for inventory.boxOn (see file header BOX VERB) — a plain
      // else-if, since dragging and boxOn can never both hold (see the
      // interaction matrix above).
      if (engine.dragging) {
        normalized.moveX *= DRAG_SPEED_MULT;
        normalized.moveY *= DRAG_SPEED_MULT;
      } else if (inventory.boxOn) {
        normalized.moveX *= BOX_SPEED_MULT;
        normalized.moveY *= BOX_SPEED_MULT;
      }

      player.update(normalized, DT);

      // DRAG FOLLOW (see file header DRAG VERB) — AFTER player.update so it
      // uses this tick's fresh position/facing. Route the target position through
      // world.moveCircle to prevent clipping into walls; the body slides along
      // them instead.
      if (engine.dragging) {
        var draggedGuard = findGuardById(engine.dragging);
        if (draggedGuard) {
          var targetX = player.x - Math.cos(player.facing) * DRAG_FOLLOW_DIST;
          var targetY = player.y - Math.sin(player.facing) * DRAG_FOLLOW_DIST;
          var res = world.moveCircle(draggedGuard.x, draggedGuard.y, targetX - draggedGuard.x, targetY - draggedGuard.y, draggedGuard.radius || 0.4);
          draggedGuard.x = res.x;
          draggedGuard.y = res.y;
        } else {
          // Defensive only (see file header's zone-scoped reset — this
          // shouldn't be reachable mid-zone): the dragged guard vanished
          // out from under us, so drop the dangling reference.
          engine.dragging = null;
        }
      }

      // ---- PICKUPS (see file header, tick() step 1.5, Laboratory cycle) --
      var pickups = zone.pickups || [];
      for (var pi = 0; pi < pickups.length; pi++) {
        var pickupKey = zone.id + "#" + pi;
        if (collectedPickups[pickupKey]) continue;
        var pickup = pickups[pi];
        if (dist2d(player.x, player.y, pickup.x, pickup.y) < PICKUP_DIST) {
          collectedPickups[pickupKey] = true;
          inventory.collectPickup(pickup.item);
          engine.events.push({ type: "pickup", item: pickup.item });
        }
      }

      // ---- DOORS (see file header, tick() step 1.6, Laboratory cycle) ----
      var doors = zone.doors || [];
      for (var doi = 0; doi < doors.length; doi++) {
        var door = doors[doi];
        var doorCx = door.x + door.w / 2;
        var doorCy = door.y + door.h / 2;
        var playerDoorDist = dist2d(player.x, player.y, doorCx, doorCy);

        var someoneNear = playerDoorDist <= DOOR_PROXIMITY_DIST;
        if (!someoneNear) {
          for (var dgi = 0; dgi < guards.length; dgi++) {
            if (dist2d(guards[dgi].x, guards[dgi].y, doorCx, doorCy) <= DOOR_PROXIMITY_DIST) {
              someoneNear = true;
              break;
            }
          }
        }

        if (!world.isDoorOpen(door.id)) {
          var shouldOpen = false;
          if (!door.lock) {
            shouldOpen = someoneNear;
          } else if (playerDoorDist <= DOOR_KEYED_OPEN_DIST && inventory.keycards[door.lock]) {
            shouldOpen = true;
          }
          if (shouldOpen) {
            world.setDoorOpen(door.id, true);
            doorLastNear[door.id] = engine.time;
            engine.events.push({ type: "doorOpen", id: door.id });
          }
        } else {
          if (someoneNear) {
            doorLastNear[door.id] = engine.time;
          } else if (engine.time - (doorLastNear[door.id] !== undefined ? doorLastNear[door.id] : engine.time) >= DOOR_AUTO_CLOSE_S) {
            world.setDoorOpen(door.id, false);
            engine.events.push({ type: "doorClose", id: door.id });
          }
        }
      }

      // ---- NOISE STEP (see file header, tick() step 2) — AFTER
      // player.update, BEFORE any guard.update, so a sound made this tick is
      // already reflected in guard.state by the time guards update below.
      var moveNoiseRadius = player.noiseRadius();
      if (moveNoiseRadius > 0) {
        var moveResults = soundEvents.emitRadius(player.x, player.y, moveNoiseRadius, false, guards);
        for (var mi = 0; mi < moveResults.length; mi++) {
          if (moveResults[mi].heard) {
            engine.events.push({
              type: "noiseHeard",
              guardId: moveResults[mi].listenerId,
              x: player.x,
              y: player.y,
              strength: moveResults[mi].strength,
            });
          }
        }
      }

      // Knock verb: edge-triggered (false->true only), and only actually
      // emits a sound when the player is adjacent to a wall (see file header
      // and Game.SOUND.KNOCK_WALL_DIST in src/soundEvents.js).
      var knockPressed = normalized.knock && !prevKnock;
      prevKnock = normalized.knock;
      if (knockPressed && world.isBlockedCircle(player.x, player.y, Game.SOUND.KNOCK_WALL_DIST)) {
        engine.events.push({ type: "knock", x: player.x, y: player.y });
        engine.stats.knocksMade++;
        var knockResults = soundEvents.emit(player.x, player.y, "knock", guards);
        for (var ki = 0; ki < knockResults.length; ki++) {
          if (knockResults[ki].heard) {
            engine.events.push({
              type: "noiseHeard",
              guardId: knockResults[ki].listenerId,
              x: player.x,
              y: player.y,
              strength: knockResults[ki].strength,
            });
          }
        }
      }
      // Fire verb: edge-triggered (false->true only), same shape as knock
      // above (see file header FIRE VERB / tick() step 2c). Unlike knock,
      // firing has no wall-adjacency gate — inventory.fireTranq() itself
      // decides hit/miss/impact from the player's position/facing.
      var fireEdge = normalized.fire && !prevFire;
      prevFire = normalized.fire;
      if (fireEdge && engine.playerHidden) {
        // Frozen input while hidden (see file header LOCKER VERB) — the
        // button press is silently swallowed, same as movement.
      } else if (fireEdge && (engine.dragging || inventory.boxOn)) {
        // NO FIRING WHILE DRAGGING or BOXED (see file header DRAG VERB / BOX
        // VERB) — both hands are full in either case; the edge is consumed
        // (no repeat spam while held) but no dart is spent.
        engine.events.push({ type: "busy" });
      } else if (fireEdge) {
        var fireResult = inventory.fireTranq(engine);
        if (fireResult.fired) {
          engine.events.push({
            type: "tranqFired",
            hit: fireResult.hit,
            headshot: fireResult.headshot,
            guardId: fireResult.guardId,
            impact: fireResult.impact,
          });
          engine.stats.dartsFired++;

          var dartResults = soundEvents.emit(fireResult.impact.x, fireResult.impact.y, "dartImpact", guards);
          for (var di = 0; di < dartResults.length; di++) {
            if (dartResults[di].heard) {
              engine.events.push({
                type: "noiseHeard",
                guardId: dartResults[di].listenerId,
                x: fireResult.impact.x,
                y: fireResult.impact.y,
                strength: dartResults[di].strength,
              });
            }
          }

          if (fireResult.hit) {
            for (var hgi = 0; hgi < guards.length; hgi++) {
              if (guards[hgi].id === fireResult.guardId) {
                guards[hgi].tranq(fireResult.headshot);
                break;
              }
            }
          }
        }
      }

      // Ration verb: edge-triggered (false->true only), same shape as knock/
      // fire above (see file header RATION VERB). No wall-adjacency gate, no
      // noise, no interaction with box/drag/locker — always available.
      var rationEdge = normalized.ration && !prevRation;
      prevRation = normalized.ration;
      if (rationEdge) {
        var rationResult = inventory.useRation(player);
        if (rationResult.used) {
          player.hp = Math.min(1, player.hp + rationResult.healAmount);
          engine.events.push({ type: "ration", hp: player.hp });
          engine.stats.rationsUsed++;
        }
      }

      // Chaff verb: edge-triggered (false->true only), same shape as knock/
      // fire above (see file header CHAFF VERB). The pop is a SHARP noise at
      // the player's OWN position — same noiseHeard fan-out loop shape as
      // the knock/fire verbs above.
      var chaffEdge = normalized.chaff && !prevChaff;
      prevChaff = normalized.chaff;
      if (chaffEdge) {
        var chaffResult = inventory.useChaff();
        if (chaffResult.used) {
          engine.chaffUntil = engine.time + Game.ITEMS.CHAFF_S;
          engine.events.push({ type: "chaff" });
          engine.stats.chaffUsed++;

          var chaffResults = soundEvents.emitRadius(player.x, player.y, CHAFF_NOISE_RADIUS, true, guards);
          for (var chi = 0; chi < chaffResults.length; chi++) {
            if (chaffResults[chi].heard) {
              engine.events.push({
                type: "noiseHeard",
                guardId: chaffResults[chi].listenerId,
                x: player.x,
                y: player.y,
                strength: chaffResults[chi].strength,
              });
            }
          }
        }
      }
      // ---- END NOISE STEP ---------------------------------------------------

      // sleepingGuards snapshot (see file header, tick() step 3) — computed
      // once per tick, from the CURRENT guards array (already reflecting any
      // guard.tranq()/guard.cqc() call above just made this same tick, and
      // any guard.stuffInLocker() a same-tick G-edge just made), and handed
      // unchanged to every guard's update() call below. `hidden` (new — see
      // guardAI.js's HIDDEN-BODY EXEMPTION) mirrors guard.hidden verbatim so
      // checkColleagueDiscovery can skip stuffed bodies.
      var sleepingGuards = [];
      for (var sgi = 0; sgi < guards.length; sgi++) {
        if (guards[sgi].state === "SLEEPING") {
          sleepingGuards.push({
            id: guards[sgi].id,
            x: guards[sgi].x,
            y: guards[sgi].y,
            hidden: !!guards[sgi].hidden,
          });
        }
      }

      // GUARD PERCEPTION GATE while playerHidden (see file header LOCKER
      // VERB) — every guard.update() call this tick gets a DECOY player
      // object, permanently out of vision range, instead of the real
      // `player`. guardAI.js/vision.js are unaware this substitution ever
      // happens; onGuardFire/damage (below) still close over the REAL
      // `player`, unaffected by this local var.
      //
      // BOX PERCEPTION (see file header BOX VERB) — a DIFFERENT wrap: while
      // inventory.boxOn, guards still get the player's REAL x/y/facing/
      // stance/moving (the box is visible, just discounted), only
      // visionProfile() is overridden to ignore stance entirely and return
      // a flat Game.ITEMS.BOX_FACTOR (0.05) while stationary, or a flat 1.0
      // the instant player.moving is true ("blown if seen moving" — no
      // partial credit). Mutually exclusive with playerHidden (see the
      // interaction matrix), so this is a plain else-if, not a second
      // wrapper stacked on top of the decoy.
      var perceivedPlayer;
      if (engine.playerHidden) {
        perceivedPlayer = {
          x: HIDDEN_DECOY_POS,
          y: HIDDEN_DECOY_POS,
          facing: player.facing,
          visionProfile: player.visionProfile,
          moving: false,
          stance: player.stance,
        };
      } else if (inventory.boxOn) {
        perceivedPlayer = {
          x: player.x,
          y: player.y,
          facing: player.facing,
          stance: player.stance,
          moving: player.moving,
          visionProfile: function () {
            return player.moving ? 1.0 : Game.ITEMS.BOX_FACTOR;
          },
        };
      } else {
        perceivedPlayer = player;
      }

      for (var i = 0; i < guards.length; i++) {
        guards[i].update(DT, {
          player: perceivedPlayer,
          onGuardFire: onGuardFire,
          sleepingGuards: sleepingGuards,
          checkLocker: checkLocker,
        });
      }

      // DIRECTOR / CAMERAS (see src/director.js contract) — runs AFTER every
      // guard's own update() this tick, BEFORE squad.tick(), same slot the
      // file header's own step ordering calls for. Reuses the EXACT SAME
      // `perceivedPlayer` wrapper the guard loop just used above (see GUARD
      // PERCEPTION GATE / BOX PERCEPTION notes) — one wrapping decision per
      // tick, shared by every viewer in the zone, guard or camera; director
      // itself never knows a wrapping happened. cameraAlerts is director's
      // own returned list of { type, cameraIndex } facts (cameraSuspicious/
      // cameraAlert) — director never touches engine.events itself (it has
      // no such array), so THIS is where they actually get pushed, same
      // "returns facts, engine narrates" split as items.js's fireTranq/
      // useRation/useChaff.
      var cameraAlerts = director.tickCameras(DT, {
        time: engine.time,
        chaffUntil: engine.chaffUntil,
        player: perceivedPlayer,
      });
      for (var cai = 0; cai < cameraAlerts.length; cai++) {
        engine.events.push(cameraAlerts[cai]);
      }

      // LASERS (see file header, tick() step 3.6, Laboratory cycle / see
      // src/director.js's own laser contract) — REAL player position
      // (playerPrevX/Y captured at the very top of this tick, player.x/y is
      // this tick's settled position), never the box/locker-wrapped
      // perceivedPlayer the guard loop/cameras just used above.
      var laserTrips = director.tickLasers(DT, {
        time: engine.time,
        prevX: playerPrevX,
        prevY: playerPrevY,
        x: player.x,
        y: player.y,
        playerHidden: engine.playerHidden,
      });
      for (var lti = 0; lti < laserTrips.length; lti++) {
        engine.events.push(laserTrips[lti]);
      }

      // ESCALATION (see src/director.js's own ESCALATION contract) —
      // reinforcements + radio check-ins, runs every tick regardless of
      // squad.phase (check-ins) or gated on squad.phase === "ALERT"
      // (reinforcements) — director itself decides which. ctx.guards is
      // THE LIVE `guards` ARRAY (not a copy): a spawned reinforcement guard
      // is pushed directly onto it by director.tickEscalation, so
      // engine.guards (same reference, reassigned only by switchZone) picks
      // it up with no further action needed here — see director.js's own
      // ctx.guards note for why this is deliberately not a return-and-push
      // shape like cameraAlerts/laserTrips above.
      var escalationEvents = director.tickEscalation(DT, {
        time: engine.time,
        guards: guards,
      });
      for (var esi = 0; esi < escalationEvents.length; esi++) {
        var esEvent = escalationEvents[esi];
        // ZONE-LIFETIME REINFORCEMENT CAP (NEW — see zoneReinforcementUsed's
        // own declaration comment / file header STASH section): director's
        // own REINFORCEMENT_MAX only ever ceilings THIS visit (a fresh
        // director rebuilt on re-entry starts that counter back at 0 — see
        // src/director.js's own ESCALATION contract), so a zone that already
        // spent some of its +3 budget across an EARLIER visit would
        // otherwise get topped back up to +3 MORE this visit. Engine is the
        // one place that remembers the true cross-visit spend
        // (zoneReinforcementUsed, seeded from the stash by switchZone above)
        // — if director just spawned one anyway (its own looser per-visit
        // gate allowed it), and the TRUE budget is already exhausted, this
        // undoes the spawn: the guard director just pushed onto the live
        // `guards` array (see ctx.guards note above) is spliced back out
        // BEFORE anything else this tick ever sees it (this runs before the
        // guard-update loop's NEXT tick, and before squad.tick()/snapshot()
        // later THIS tick), and the event itself is suppressed — as far as
        // the rest of the simulation is concerned, it never happened.
        if (esEvent.type === "reinforcement") {
          if (zoneReinforcementUsed >= ZONE_REINFORCEMENT_CAP) {
            for (var gi2 = guards.length - 1; gi2 >= 0; gi2--) {
              if (guards[gi2].id === esEvent.guardId) {
                guards.splice(gi2, 1);
                break;
              }
            }
            continue;
          }
          zoneReinforcementUsed++;
        }
        engine.events.push(esEvent);
      }

      // GAME OVER CHECK (see file header, tick() step 4) — generic on
      // player.alive, not "did a guardFire just happen," so any future
      // damage source drives game over through this one check.
      if (!engine.gameOver && !player.alive) {
        engine.gameOver = true;
        engine.events.push({ type: "gameOver" });
      }

      // CAMERAS DO NOT CONTRIBUTE TO anyLOS (see src/director.js contract's
      // ALERT note and this file's own DESIGN RULE below): squad.tick()'s
      // ALERT -> EVASION timer is driven ONLY by whether any GUARD currently
      // has LOS — a camera alert starts the manhunt (see director.tickCameras
      // above) but, with no guard confirming sight, the squad still decays
      // ALERT -> EVASION on schedule next tick, exactly as if a guard's own
      // sighting had been broken. Guards then converge on squad.lastKnown
      // (the camera-reported position) during EVASION — "the camera spotted
      // you, guards come looking," not "the camera IS a guard."
      //
      // A "PLAYER" LOCKER DISCOVERY DOES CONTRIBUTE (see file header EVASION
      // LOCKER CHECK's "REGAINED-CONTACT BRIDGE" note — the opposite
      // carve-out from cameras, for the opposite reason, and deliberately
      // NOT extended to a "body" find — see that same note for why): a
      // "player" find this tick means genuine, adjacent contact that just
      // hasn't been reflected in any guard's own hasLOS yet (this tick's
      // perception already ran against the stale decoy/no-op before the
      // discovery cleared it) — so it counts here, keeping the phase
      // settled at ALERT for this one tick instead of flashing through it
      // and decaying back to EVASION before this tick even returns (from
      // the NEXT tick on, the finding guard's own facing-snap — see
      // src/guardAI.js's contract — gives it genuine hasLOS, so the bridge
      // is only ever needed for this single tick).
      var anyLOS =
        guards.some(function (g) {
          return g.hasLOS;
        }) || lockerContactThisTick;

      squad.tick(DT, anyLOS);

      if (squad.phase !== phaseBefore) {
        engine.events.push({ type: "phaseChange", from: phaseBefore, to: squad.phase });
      }
      if (squad.alertCount > alertCountBefore) {
        var lk = squad.lastKnown || { x: 0, y: 0 };
        engine.events.push({ type: "alert", x: lk.x, y: lk.y });
        // MISSION STATS (see file header) — squad.alertCount is PER-SQUAD
        // and gets rebuilt fresh by every switchZone (see ZONE TRANSITIONS
        // above), so this module accumulates its OWN mission-wide total
        // here, the exact same place a NEW alert is already detected.
        engine.stats.alertsTotal++;
      }

      // ---- ZONE TRANSITIONS (see file header, tick() step 6) — after
      // squad.tick, using the phase it just settled into this tick.
      tryZoneTransition();

      engine.tickCount++;
      engine.time = engine.tickCount * DT;
      // MISSION STATS (see file header) — engine.time is never reset by
      // switchZone, so mirroring it here every tick is all missionTimeS
      // needs to accumulate seamlessly across every zone crossing.
      engine.stats.missionTimeS = engine.time;
    }

    function snapshot() {
      return {
        tickCount: engine.tickCount,
        zoneId: zone.id,
        player: {
          x: player.x,
          y: player.y,
          stance: player.stance,
          facing: player.facing,
          hp: player.hp,
          alive: player.alive,
        },
        guards: guards.map(function (g) {
          return { id: g.id, x: g.x, y: g.y, state: g.state, meter: g.meter, facing: g.facing };
        }),
        squad: {
          phase: squad.phase,
          phaseTime: squad.phaseTime,
          lastKnown: squad.lastKnown,
          alertCount: squad.alertCount,
        },
        gameOver: engine.gameOver,
        darts: inventory.darts,
        // NEW — camera meters (see src/director.js's cameraStates contract).
        // Empty array on a zone with no camera coverage (e.g. loadingDock).
        cameras: director.cameraStates(),
        // NEW (Laboratory cycle) — laser active/duty state (see
        // src/director.js's laserStates contract). Empty array on a zone
        // with no lasers.
        lasers: director.laserStates(),
        // NEW (Laboratory cycle) — one entry per zone.doors, world.isDoorOpen(id)
        // read fresh at snapshot time. Empty array on a zone with no doors.
        doors: (zone.doors || []).map(function (d) {
          return { id: d.id, open: world.isDoorOpen(d.id) };
        }),
        // NEW (Laboratory cycle) — engine.inventory.keycards verbatim.
        keycards: {
          L1: inventory.keycards.L1,
          L2: inventory.keycards.L2,
          L3: inventory.keycards.L3,
        },
        // NEW (win-state cycle) — see MISSION STATS / EXTRACTION / RANK
        // above. `stats` is a shallow clone, same "safe to JSON.stringify,
        // never a live reference" posture as every other snapshot() field.
        missionComplete: engine.missionComplete,
        stats: Object.assign({}, engine.stats),
      };
    }

    // getState()/setState() (NEW — save/restore cycle, additive only, no
    // behavior change to tick()/snapshot()). Captures every piece of THIS
    // module's OWN mutable state that isn't already a flat `engine.*` prop
    // (dragging/playerHidden/chaffUntil/gameOver/tickCount/time ARE already
    // flat props — included here too, for convenience, so a caller can
    // restore the engine's own state with one engine.setState(s) call rather
    // than also having to poke those props directly) PLUS every private
    // edge-tracker/bookkeeping closure var documented throughout this file
    // that is NOT part of any other module's own getState()/setState()
    // (world/player/guards/squad/vision/director/rng/inventory each own
    // their OWN state — see src/saveState.js for how those are captured
    // separately):
    //   prevKnock/prevFire/prevCqc/prevDrag/prevBox/prevRation/prevChaff —
    //     edge-trigger memory for every one-shot verb (see file header). Miss
    //     ANY of these and a restored engine can double-fire (or swallow) the
    //     very next tick's edge for whichever verb's key was HELD DOWN at
    //     the moment of the save (a `true` input carried across a save/
    //     restore boundary with a stale `false` prev-state reads as a FRESH
    //     false->true edge that never actually happened).
    //   hiddenLockerIndex — hiddenLocker (the {x,y,facing} locker object the
    //     player is currently tucked into, or null) is a REFERENCE into this
    //     zone's OWN zone.lockers array (see nearestLocker() above) — since
    //     Game.ZONES.* entries are fixed module-level objects (never cloned
    //     per createWorld() call, see src/world.js), that array is the same
    //     object/index sequence every time this exact zone is loaded, so the
    //     reference survives a save/restore round-trip as a plain array
    //     index (-1 meaning "not hidden") rather than needing to serialize
    //     the locker object itself.
    //   collectedPickups — mission-scoped (NOT zone-scoped, see its own
    //     declaration comment above) map of "<zoneId>#<index>" -> true; a
    //     restored engine that forgets an already-collected pickup would let
    //     the player collect it a second time.
    //   doorLastNear — zone-scoped map of door.id -> the last engine.time
    //     anyone was within DOOR_PROXIMITY_DIST of it; needed so a restored
    //     engine's auto-close timer resumes counting from the correct
    //     remaining time rather than restarting a fresh DOOR_AUTO_CLOSE_S
    //     window (or closing immediately) the instant someone steps away.
    //   inBlockedExitRegion — the zoneBlocked edge-tracker (see
    //     tryZoneTransition above); miss it and a restored engine standing in
    //     a blocked-exit trigger re-fires zoneBlocked on its very next tick
    //     even though the "entry edge" already happened before the save.
    //   stats/missionComplete (new — win-state cycle) — see MISSION STATS /
    //     EXTRACTION / RANK above. Both are mission-scoped like
    //     collectedPickups; miss `stats` and a restored engine loses every
    //     counter accumulated before the save (a mid-mission save/restore
    //     would silently reset alertsTotal/dartsFired/etc. back toward zero
    //     the moment the run finally completes); miss `missionComplete` and
    //     a save captured AFTER a (theoretical) extraction would restore into
    //     a live, ticking engine instead of the frozen one it was saved as.
    //   zoneStash (NEW — per-zone state persistence cycle, see file header
    //     ZONE TRANSITIONS / STASH section) — the FULL { [zoneId]: stashEntry
    //     } map (see stashZone's own contract above), JSON-round-tripped via
    //     JSON.parse(JSON.stringify(...)) rather than Object.assign's shallow
    //     copy: unlike collectedPickups/doorLastNear (flat maps of
    //     primitives), a stash entry nests guard-state arrays/squad/director
    //     objects several levels deep, and a shallow copy would leave THOSE
    //     inner objects aliased to this engine's own live zoneStash — safe in
    //     practice (nothing mutates a stash entry in place once written; a
    //     later departure from the same zone always REPLACES the whole
    //     entry, never edits it — see stashZone), but a full deep clone here
    //     costs nothing (getState()/setState() only run at save/restore
    //     time, never per-tick) and matches this module's own "cheap,
    //     JSON-safe, no aliasing surprises" posture for everything else in
    //     this shape. Miss this field and a save/restore round-trip would
    //     forget every zone ever departed before the save — e.g. test 8's
    //     "tranq dock guard, go to warehouse, F5-capture, restore, return to
    //     dock" scenario would come back to a guard reset to spawn instead of
    //     still sleeping.
    function getState() {
      var lockerIndex = -1;
      if (hiddenLocker) {
        var lockers = zone.lockers || [];
        lockerIndex = lockers.indexOf(hiddenLocker);
      }
      return {
        tickCount: engine.tickCount,
        time: engine.time,
        gameOver: engine.gameOver,
        dragging: engine.dragging,
        playerHidden: engine.playerHidden,
        chaffUntil: engine.chaffUntil,
        prevKnock: prevKnock,
        prevFire: prevFire,
        prevCqc: prevCqc,
        prevDrag: prevDrag,
        prevBox: prevBox,
        prevRation: prevRation,
        prevChaff: prevChaff,
        hiddenLockerIndex: lockerIndex,
        collectedPickups: Object.assign({}, collectedPickups),
        doorLastNear: Object.assign({}, doorLastNear),
        inBlockedExitRegion: inBlockedExitRegion,
        // MISSION STATS / EXTRACTION / RANK (new — win-state cycle, see file
        // header) — mission-scoped like collectedPickups above.
        stats: Object.assign({}, engine.stats),
        missionComplete: engine.missionComplete,
        // ZONE STASH (new — per-zone state persistence cycle, see this
        // function's own file header note above) — deep-cloned, not aliased.
        zoneStash: JSON.parse(JSON.stringify(zoneStash)),
        zoneReinforcementUsed: zoneReinforcementUsed,
      };
    }

    function setState(state) {
      engine.tickCount = state.tickCount;
      engine.time = state.time;
      engine.gameOver = state.gameOver;
      engine.dragging = state.dragging;
      engine.playerHidden = state.playerHidden;
      engine.chaffUntil = state.chaffUntil;
      // MISSION STATS / EXTRACTION / RANK (new — win-state cycle) — a save
      // captured from a build before this cycle simply won't have `stats` on
      // it; falling back to the fresh engine's own zeroed defaults (rather
      // than clobbering them with `undefined`) keeps an old-format restore
      // from crashing outright, though SAVE_VERSION was bumped for exactly
      // this shape change (see src/saveState.js) so this fallback should
      // never actually be exercised by a version-gated restore() call.
      engine.stats = state.stats ? Object.assign({}, state.stats) : engine.stats;
      engine.missionComplete = !!state.missionComplete;
      prevKnock = state.prevKnock;
      prevFire = state.prevFire;
      prevCqc = state.prevCqc;
      prevDrag = state.prevDrag;
      prevBox = state.prevBox;
      prevRation = state.prevRation;
      prevChaff = state.prevChaff;
      var lockers = zone.lockers || [];
      hiddenLocker =
        state.hiddenLockerIndex !== undefined && state.hiddenLockerIndex >= 0
          ? lockers[state.hiddenLockerIndex] || null
          : null;
      collectedPickups = Object.assign({}, state.collectedPickups);
      doorLastNear = Object.assign({}, state.doorLastNear);
      inBlockedExitRegion = state.inBlockedExitRegion;
      // ZONE STASH (new — per-zone state persistence cycle) — a save
      // captured from a build before this cycle simply won't have this field
      // (falls back to {}/0, same defensive posture as `stats` above; SAVE_
      // VERSION was bumped in src/saveState.js for exactly this shape change
      // so this fallback should never actually be exercised by a
      // version-gated restore() call in practice).
      zoneStash = state.zoneStash ? JSON.parse(JSON.stringify(state.zoneStash)) : {};
      zoneReinforcementUsed = state.zoneReinforcementUsed || 0;
    }

    engine.tick = tick;
    engine.snapshot = snapshot;
    engine.getState = getState;
    engine.setState = setState;

    return engine;
  }

  Game.createEngine = createEngine;
  // RANK TABLE (see file header MISSION STATS / EXTRACTION / RANK) — a pure
  // function, exported alongside createEngine so tests can exercise every
  // threshold directly without a live engine.
  Game.computeRank = computeRank;
  if (typeof module !== "undefined")
    module.exports = { createEngine: createEngine, computeRank: computeRank };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
