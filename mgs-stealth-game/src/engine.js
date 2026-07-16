// src/engine.js
// PUBLIC API:
//   Game.createEngine(opts?) -> engine, where opts = { zoneData?, seed?, guardConfigs? }
//     zoneData     — a Game.ZONES.* zone (src/world.js). Default Game.ZONES.loadingDock.
//     seed         — RNG seed (src/rng.js). Default 1.
//     guardConfigs — [{ id, spawn, waypoints }, ...] passed straight through to
//                    Game.createGuard (src/guardAI.js) for each guard, sharing
//                    one squad. Default: a single guard,
//                    [{ id: "g1", spawn: zone.waypoints[0], waypoints: zone.waypoints }].
//
//   Construction wires up the full module stack in dependency order:
//     rng    = Game.createRng(seed)
//     world  = Game.createWorld(zoneData)
//     vision = Game.createVision({ world: world })
//     squad  = Game.createSquad()
//     player = Game.createPlayer({ world: world })
//     guards = guardConfigs.map(cfg => Game.createGuard({
//                world: world, vision: vision, rng: rng, squad: squad,
//                spawn: cfg.spawn, waypoints: cfg.waypoints, id: cfg.id,
//              }))
//
//   engine — flat, readable props (mutated in place by tick()):
//     world, player, guards (array), squad, vision, rng, zone — the wired
//       instances/data above (zone === zoneData, the plain-object level data).
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
//                 More event types (item pickups, noise, damage, ...) will be
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
//       2. Each guard, in array order: guard.update(DT, { player: player }).
//          VISION STAGGERING (deferred — see below): every guard currently
//          computes sight EVERY tick; there is no per-guard skip.
//       3. squad.tick(DT, anyLOS) exactly once, where
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
//       4. Event collection: engine.events is cleared at the TOP of tick(),
//          before step 1, and squad.phase/alertCount are snapshotted at that
//          same moment (BEFORE step 2) — a guard's own broadcastAlert() call
//          (fired from inside guard.update() the instant its meter confirms
//          sight; see guardAI.js's SUSPICIOUS/INVESTIGATE/EVASION/CAUTION
//          notes) can flip squad.phase/alertCount immediately, well before
//          squad.tick() runs in step 3, so a snapshot taken any later would
//          miss exactly that transition. After step 3, the snapshot is
//          compared against the live squad.phase/alertCount: phaseChange
//          when phase differs; alert when alertCount increased, using the
//          NEW squad.lastKnown for x/y since an alertCount bump only happens
//          alongside a broadcastAlert() call that just set lastKnown (see
//          guardAI.js's squad contract).
//       5. tickCount++ and time = tickCount * DT.
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
    };
  }

  function defaultGuardConfigs(zone) {
    return [{ id: "g1", spawn: zone.waypoints[0], waypoints: zone.waypoints }];
  }

  function createEngine(opts) {
    opts = opts || {};
    var zone = opts.zoneData || Game.ZONES.loadingDock;
    var seed = opts.seed !== undefined ? opts.seed : 1;
    var guardConfigs = opts.guardConfigs || defaultGuardConfigs(zone);

    var rng = Game.createRng(seed);
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var squad = Game.createSquad();
    var player = Game.createPlayer({ world: world });

    var guards = guardConfigs.map(function (cfg) {
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

    var engine = {
      world: world,
      player: player,
      guards: guards,
      squad: squad,
      vision: vision,
      rng: rng,
      zone: zone,
      DT: DT,
      tickCount: 0,
      time: 0,
      events: [],
    };

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

      engine.tickCount++;
      engine.time = engine.tickCount * DT;
    }

    function snapshot() {
      return {
        tickCount: engine.tickCount,
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
