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
//
//   engine — flat, readable props (mutated in place by tick()):
//     world, player, guards (array), squad, vision, rng, soundEvents, zone —
//       the wired instances/data above (zone === zoneData, the plain-object
//       level data; soundEvents is the Game.createSoundEvents({world})
//       instance — see src/soundEvents.js contract).
//     DT        — 1/60 (constant fixed timestep, seconds). Every tick() call
//                 advances the simulation by exactly this much regardless of
//                 wall-clock time — the engine has NO notion of real time; the
//                 caller (render loop, test, sim) decides when/how often to
//                 call tick().
//     tickCount — integer, number of tick() calls so far (starts at 0).
//     time      — tickCount * DT, seconds of simulated time elapsed.
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
//                 More event types (item pickups, damage, ...) will be
//                 appended by later modules — treat `type` as an open set and
//                 always branch on it, never assume this is the full list.
//
//   engine.tick(input?) — advances the simulation by exactly ONE fixed step
//     (DT seconds). THIS IS THE ONLY SANCTIONED TICK LOOP: render/boot must
//     drive the game by calling engine.tick() on a fixed-timestep accumulator
//     (never by calling player.update/guard.update/squad.tick directly), and
//     every test/sim harness that wants engine-level behavior should call it
//     the same way. Canonical per-tick order (do not reorder):
//       1. player.update(input, DT). `input` may be null/undefined, meaning
//          "no movement": it is normalized to
//          { moveX: 0, moveY: 0, run: false, stance: player.stance } so a
//          missing/omitted stance holds whatever the player was already in
//          (player.update's own "retain stance if omitted" rule handles this
//          once moveX/moveY/run are defaulted — see src/player.js contract).
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
//       3. Each guard, in array order: guard.update(DT, { player: player }).
//          VISION STAGGERING (deferred — see below): every guard currently
//          computes sight EVERY tick; there is no per-guard skip.
//       4. squad.tick(DT, anyLOS) exactly once, where
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
//          guard's hasLOS.
//       5. Event collection: engine.events is cleared at the TOP of tick(),
//          before step 1, and squad.phase/alertCount are snapshotted at that
//          same moment (BEFORE step 2) — a guard's own broadcastAlert() call
//          (fired from inside guard.update() the instant its meter confirms
//          sight; see guardAI.js's SUSPICIOUS/INVESTIGATE/EVASION/CAUTION
//          notes) can flip squad.phase/alertCount immediately, well before
//          squad.tick() runs in step 4, so a snapshot taken any later would
//          miss exactly that transition. After step 4, the snapshot is
//          compared against the live squad.phase/alertCount: phaseChange
//          when phase differs; alert when alertCount increased, using the
//          NEW squad.lastKnown for x/y since an alertCount bump only happens
//          alongside a broadcastAlert() call that just set lastKnown (see
//          guardAI.js's squad contract). The "knock"/"noiseHeard" events from
//          step 2 are pushed directly at emission time (step 2), not diffed
//          from a snapshot — they're edge-triggered facts about that step,
//          not state to compare before/after.
//       6. ZONE TRANSITIONS (new — after squad.tick, using its just-updated
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
//              swap a live player's world), but its stance and facing are
//              copied onto the new instance and its position is set to
//              target.entrances[exits[i].entranceKey] — so from the outside
//              (engine.player.stance/facing/x/y) this reads as "the same
//              player, teleported to the new zone's entrance." engine.zone/
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
//       7. tickCount++ and time = tickCount * DT.
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
//         player: { x, y, stance, facing },
//         guards: [ { id, x, y, state, meter, facing }, ... ],  // same order as engine.guards
//         squad: { phase, phaseTime, lastKnown, alertCount },
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
    };
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

    // Edge-trigger state for the knock verb (see file header, tick() step
    // 2b) — private to this engine instance, not exposed on `engine` since
    // it's an implementation detail of the input, not simulation truth.
    var prevKnock = false;

    // Edge-trigger state for zoneBlocked (see file header, tick() step 6):
    // true while the player is standing inside an exit trigger whose `to`
    // doesn't resolve to a built zone, so the event fires once on entry, not
    // once per tick spent standing there. Reset whenever a zone switch
    // actually happens (fresh zone, fresh region state).
    var inBlockedExitRegion = false;

    var guards = buildGuards(guardConfigs, world, vision, rng, squad);

    var engine = {
      world: world,
      player: player,
      guards: guards,
      squad: squad,
      vision: vision,
      rng: rng,
      soundEvents: soundEvents,
      zone: zone,
      DT: DT,
      tickCount: 0,
      time: 0,
      events: [],
    };

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

      var entrance = (targetZone.entrances && targetZone.entrances[entranceKey]) || targetZone.playerSpawn;
      var newPlayer = Game.createPlayer({ world: newWorld });
      newPlayer.x = entrance.x;
      newPlayer.y = entrance.y;
      newPlayer.stance = player.stance;
      newPlayer.facing = player.facing;

      zone = targetZone;
      world = newWorld;
      soundEvents = newSoundEvents;
      vision = newVision;
      squad = newSquad;
      guards = newGuards;
      player = newPlayer;
      inBlockedExitRegion = false;

      engine.zone = zone;
      engine.world = world;
      engine.soundEvents = soundEvents;
      engine.vision = vision;
      engine.squad = squad;
      engine.guards = guards;
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
      engine.events = [];

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
      player.update(normalized, DT);

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
      // ---- END NOISE STEP ---------------------------------------------------

      for (var i = 0; i < guards.length; i++) {
        guards[i].update(DT, { player: player });
      }

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
