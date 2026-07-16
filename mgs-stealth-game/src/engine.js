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
//       soundEvents, zone — the wired instances/data above (zone === zoneData,
//       the plain-object level data; soundEvents is the
//       Game.createSoundEvents({world}) instance — see src/soundEvents.js
//       contract; director is the Game.createDirector({...}) instance above —
//       see src/director.js contract).
//     DT        — 1/60 (constant fixed timestep, seconds). Every tick() call
//                 advances the simulation by exactly this much regardless of
//                 wall-clock time — the engine has NO notion of real time; the
//                 caller (render loop, test, sim) decides when/how often to
//                 call tick().
//     tickCount — integer, number of tick() calls so far (starts at 0).
//     time      — tickCount * DT, seconds of simulated time elapsed.
//     dragging  — NEW (CQC/locker cycle): guardId | null. The id of the
//                 guard currently being dragged (see DRAG VERB below), or
//                 null when nothing is in tow. Reset to null on a zone
//                 transition (see switchZone).
//     playerHidden — NEW (CQC/locker cycle): boolean, true while the player
//                 is tucked inside a locker (see LOCKER VERB below). Reset to
//                 false on a zone transition (see switchZone).
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
//     expecting the event to eventually disappear.
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
//       0. FROZEN CHECK (new — see GAME OVER / FROZEN ENGINE above): if
//          engine.gameOver is already true, return IMMEDIATELY — before
//          clearing engine.events, before touching player/guards/squad/
//          tickCount/time. Every other step below only runs on a tick where
//          this check passes (i.e. every tick up to and including the one
//          that FIRST sets engine.gameOver).
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
//       7. ZONE TRANSITIONS (new — after squad.tick, using its just-updated
//          phase; see squad.phase design rule below): if the player is
//          standing inside ANY of zone.exits[] (world.inRegion(player.x,
//          player.y, exits[i])) AND squad.phase === "INFILTRATION" this tick:
//            - if Game.ZONES[exits[i].to] exists: switch zones. A fresh
//              world/soundEvents/vision/squad/guards stack is built for the
//              target zone (guards from ZONE_GUARDS[target.id], same table
//              opts.guardConfigs defaults from — see file header above; the
//              DEPARTED zone's guards/squad are discarded, not persisted —
//              v1 semantics, see design note below). The player object itself
//              is also rebuilt (Game.createPlayer only takes its world at
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

    var guards = buildGuards(guardConfigs, world, vision, rng, squad);

    // DIRECTOR (see src/director.js contract) — owns this zone's wall-mounted
    // security cameras (zone.cameras, empty-safe: a zone with no cameras just
    // gets a director with an empty roster, no special-casing needed here).
    // Built fresh for every zone, same "rebuild on transition" rule as
    // world/vision/squad/guards (see switchZone below).
    var director = Game.createDirector({ world: world, vision: vision, squad: squad });

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

    // ZONE TRANSITIONS (see file header, tick() step 6). Rebuilds the entire
    // world/soundEvents/vision/squad/guards stack for `targetZone`, and a
    // fresh player positioned at targetZone.entrances[entranceKey] (falling
    // back to targetZone.playerSpawn if that entrance is somehow missing —
    // defensive only, every shipped zone defines the entrances its own exits
    // point at). rng is deliberately NOT rebuilt — the single seeded stream
    // continues across the switch. Reassigns every closure var AND the
    // matching `engine.*` prop so both tick()/snapshot() (which close over
    // the vars directly) and external readers (engine.player, etc.) see the
    // new zone immediately.
    function switchZone(targetZone, entranceKey) {
      var fromId = zone.id;

      var newWorld = Game.createWorld(targetZone);
      var newSoundEvents = Game.createSoundEvents({ world: newWorld });
      var newVision = Game.createVision({ world: newWorld });
      var newSquad = Game.createSquad();
      var newGuards = buildGuards(guardConfigsForZone(targetZone), newWorld, newVision, rng, newSquad);
      // DIRECTOR (see src/director.js contract) — rebuilt fresh for the
      // target zone's own camera roster, same "discard the departed zone's
      // instance, never carry it across" rule as world/vision/squad/guards
      // above (a departed zone's cameras belong to a world that no longer
      // exists).
      var newDirector = Game.createDirector({ world: newWorld, vision: newVision, squad: newSquad });

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

      // DOORS (see file header, Laboratory cycle) — ZONE-SCOPED, discarded
      // alongside the departed zone's own world/guards/squad (see
      // doorLastNear's own declaration comment above). collectedPickups is
      // deliberately NOT touched here — it's mission-scoped, keyed by zone
      // id, so a different zone's pickups are unaffected and the SAME
      // zone's pickups (on a later re-entry) correctly stay collected.
      doorLastNear = {};

      // ZONE-SCOPED drag/locker state (see file header CQC VERB / DRAG VERB /
      // LOCKER VERB) — a dragged guard belongs to the departing zone's now-
      // discarded roster, and a hidden-in-a-locker player has no locker to
      // return to in the new zone, so both reset on every transition, same
      // v1 semantics as the guard roster itself not persisting.
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
      // stops the sim cold: no event clearing, no state mutation whatsoever.
      if (engine.gameOver) return;

      engine.events = [];

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
        guards[i].update(DT, { player: perceivedPlayer, onGuardFire: onGuardFire, sleepingGuards: sleepingGuards });
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
      var anyLOS = guards.some(function (g) {
        return g.hasLOS;
      });

      squad.tick(DT, anyLOS);

      if (squad.phase !== phaseBefore) {
        engine.events.push({ type: "phaseChange", from: phaseBefore, to: squad.phase });
      }
      if (squad.alertCount > alertCountBefore) {
        var lk = squad.lastKnown || { x: 0, y: 0 };
        engine.events.push({ type: "alert", x: lk.x, y: lk.y });
      }

      // ---- ZONE TRANSITIONS (see file header, tick() step 6) — after
      // squad.tick, using the phase it just settled into this tick.
      tryZoneTransition();

      engine.tickCount++;
      engine.time = engine.tickCount * DT;
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
      };
    }

    engine.tick = tick;
    engine.snapshot = snapshot;

    return engine;
  }

  Game.createEngine = createEngine;
  if (typeof module !== "undefined") module.exports = { createEngine: createEngine };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
