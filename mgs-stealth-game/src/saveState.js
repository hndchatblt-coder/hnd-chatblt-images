// src/saveState.js
// PUBLIC API:
//   Game.createSaveState() -> { capture(engine), restore(save) }
//
//   THE POINT OF THIS MODULE (read this before touching anything else): a
//   save is only correct if RESUMING it is INDISTINGUISHABLE from never
//   having saved at all. Concretely — for any engine A, any tick count N,
//   any further scripted input log L of length M:
//     A.tick() x N; var save = capture(A); A.tick(L[0..M));
//     var B = restore(save); B.tick(L[0..M));
//     JSON.stringify(A.snapshot()) === JSON.stringify(B.snapshot())
//   must hold BYTE-IDENTICAL, no matter what state the sim was in at the
//   moment of the save (mid-patrol, mid-alert, a guard mid-sleep, a door
//   mid-auto-close-timer, a chaff pop mid-countdown, ...). See
//   tests/saveState.test.js's "REPLAY GATE" tests for the enforced proof.
//   Every module's getState()/setState() pair this function calls into was
//   written (and iterated on against exactly that gate) to make this true —
//   if a future module gains a new closure var, it MUST be added to that
//   module's own getState()/setState(), or this guarantee silently breaks.
//
//   capture(engine) -> plain JSON-safe object (safe to JSON.stringify /
//   JSON.parse / localStorage — only primitives/plain objects/arrays, no
//   functions, no circular refs, no `undefined` fields — same "cheap,
//   pluggable into a future save module" posture engine.snapshot() already
//   documents, except THIS object round-trips back into a fully live engine,
//   where snapshot() is read-only debug/test output). Shape:
//     {
//       version: 1,               // SAVE_VERSION — see restore()'s version gate below.
//       zoneId: string,           // engine.zone.id — which Game.ZONES entry to rebuild against.
//       tickCount: number,        // mirrors engine.tickCount (also inside `engine` below;
//       time: number,             // kept at the top level too for at-a-glance inspection/
//                                 // debugging of a raw save blob without digging into `engine`).
//       rng: {...},               // engine.rng.getState() verbatim (src/rng.js) — the ENTIRE
//                                 // future random sequence hangs off this one value; the
//                                 // constructor `seed` restore() passes to createEngine() is
//                                 // throwaway (immediately overwritten by this).
//       player: { x, y, facing, stance, hp, alive },
//                                 // player.js has NO getState/setState (out of scope this
//                                 // cycle — see file header note below) because it has NO
//                                 // hidden closure state at all: every one of these is a
//                                 // plain flat prop on the player object itself (see
//                                 // src/player.js's own file header) — engine.player.x = ...
//                                 // is exactly as legitimate a restore as a method call would
//                                 // be. player.moving/player.running are DELIBERATELY
//                                 // EXCLUDED: both are fully recomputed from THIS TICK's
//                                 // input at the top of player.update(), with no dependency
//                                 // on their own previous value (see src/player.js's update()
//                                 // — moving/running are `var moving = v.mag > 0` /
//                                 // `moving && runRequested`, pure functions of the CURRENT
//                                 // input, not carried state) — restoring a save always lands
//                                 // between ticks, never mid-update(), so whatever stale
//                                 // moving/running a live engine happened to be sitting on at
//                                 // save time is irrelevant: the very next tick() call
//                                 // overwrites both from scratch before anything reads them.
//       inventory: {...},        // engine.inventory.getState() verbatim (src/items.js) —
//                                 // darts/rations/chaff/boxOn/keycards/hasBox/weapon.
//       guards: [ { id, state: {...} }, ... ],
//                                 // one entry per engine.guards, SAME ORDER — `state` is that
//                                 // guard's own guard.getState() (src/guardAI.js) verbatim,
//                                 // the full FSM internals (see that module's own getState()
//                                 // doc comment for the exhaustive list — every closure var
//                                 // that once broke the replay gate before this cycle found
//                                 // it, see this module's own header note above). `id` is
//                                 // carried alongside (not just array position) so restore()
//                                 // can match guards by IDENTITY rather than assuming array
//                                 // order never changes — see restore() below.
//       squad: {...},             // engine.squad.getState() verbatim (src/guardAI.js) —
//                                 // phase/phaseTime/lastKnown/alertCount. Every guard in
//                                 // `guards` above shares this ONE squad instance (see
//                                 // src/engine.js's construction — createGuard({squad:squad})
//                                 // for every guard on the roster), so it is captured ONCE
//                                 // here, not per-guard.
//       director: {...},         // engine.director.getState() verbatim (src/director.js) —
//                                 // per-camera {panAngle, disabled, meter, wasSuspicious} and
//                                 // per-laser {active}. Camera/laser SCHEMA (position, sweep,
//                                 // fov, range, endpoints, period, duty) is immutable zone
//                                 // data, already restored for free by rebuilding the world/
//                                 // director for `zoneId` — only the live per-tick numbers
//                                 // travel here.
//       world: {...},             // engine.world.getState() verbatim (src/world.js) — the
//                                 // per-door open/closed flag map. THE OTHER HALF OF DOORS
//                                 // (the per-door auto-close timestamp, doorLastNear) lives on
//                                 // engine, not world — see `engine` below; both halves are
//                                 // needed to resume a door's auto-close countdown correctly.
//       engine: {...},            // engine.getState() verbatim (src/engine.js) — tickCount,
//                                 // time, gameOver, dragging, playerHidden, chaffUntil, every
//                                 // one-shot verb's edge-tracker (prevKnock/prevFire/prevCqc/
//                                 // prevDrag/prevBox/prevRation/prevChaff), which locker (by
//                                 // index) the player is hidden in, collectedPickups (mission-
//                                 // scoped, so a pickup already taken never reappears after a
//                                 // restore), doorLastNear (see world note above), the
//                                 // zoneBlocked edge-tracker (inBlockedExitRegion), and — NEW
//                                 // this cycle (win-state, see src/engine.js's own MISSION
//                                 // STATS / EXTRACTION / RANK contract) — `stats` (the mission-
//                                 // wide alertsTotal/dartsFired/cqcTakedowns/kills/rationsUsed/
//                                 // chaffUsed/savesUsed/knocksMade/missionTimeS counters) and
//                                 // `missionComplete` (the extraction-terminal freeze latch,
//                                 // identical FROZEN ENGINE semantics to `gameOver` above). Both
//                                 // are mission-scoped like collectedPickups — miss `stats` and
//                                 // a mid-mission save/restore would silently reset every
//                                 // counter back toward zero the moment the run finally
//                                 // completes; miss `missionComplete` and a save captured after
//                                 // a (theoretical) extraction would restore into a live,
//                                 // ticking engine instead of the frozen one it was saved as.
//                                 // SAVE_VERSION was bumped 1 -> 2 for exactly this shape
//                                 // change (see restore()'s VERSION GATE below) — an old-format
//                                 // save simply lacks these two fields, which src/engine.js's
//                                 // own setState() tolerates defensively (falls back to the
//                                 // freshly-built engine's own zeroed stats/false
//                                 // missionComplete rather than clobbering them with
//                                 // `undefined`), but the version gate means that fallback
//                                 // should never actually be reachable via a real restore()
//                                 // call in practice.
//     }
//   CODEC IS DELIBERATELY EXCLUDED — v1 (documented, not a gap): codecDirector's
//   one-shot trigger memory (src/codec.js) is UI/narrative bookkeeping ("has
//   the mission-briefing call already played this playthrough"), not
//   simulation state that engine.tick()'s determinism gate cares about — the
//   REPLAY GATE this module exists to satisfy is about engine.snapshot()
//   equality, and codec has no footprint there at all (it lives entirely in
//   src/boot.js's browser-only runGame() closure, fed engine.events after the
//   fact — see that module's own contract). A future cycle that wants "codec
//   one-shots replay correctly across a save/load" would give codecDirector
//   its own getState()/setState() and thread it through here; v1 saves a
//   sim, not a cutscene log.
//
//   restore(save) -> a BRAND NEW engine (Game.createEngine() instance),
//   reconstructed to the EXACT state `save` captured, ready for
//   engine.tick(...) to continue the run:
//     1. VERSION GATE: if save.version !== SAVE_VERSION, throws a clear
//        Error immediately — a save from an incompatible format (a future
//        cycle that changes what any getState()/setState() captures MUST
//        bump SAVE_VERSION) must never be silently half-applied into a
//        corrupt engine; see tests/saveState.test.js's version-mismatch test.
//        SAVE_VERSION is 2 as of this cycle (win-state) — bumped from 1
//        because engine.getState() grew two new fields (`stats`,
//        `missionComplete`, see the `engine` field note above); a save
//        captured by an older build simply won't have them.
//     2. Looks up zoneData = Game.ZONES[save.zoneId] — throws a clear Error
//        if that zone no longer exists (defensive; every zone this cycle
//        ships is a fixed module-level Game.ZONES entry, so this should never
//        actually trip in practice).
//     3. engine = Game.createEngine({ zoneData: zoneData, seed: 1 }) — the
//        seed argument is COMPLETELY IRRELEVANT (any value works identically)
//        because engine.rng.setState(save.rng) below immediately overwrites
//        the generator's live cursor; createEngine's own default guard/
//        world/vision/squad/director/inventory construction is what gives
//        this fresh engine the correct STRUCTURE (guard roster/ids per
//        src/engine.js's ZONE_GUARDS table, camera/laser schema per the
//        zone data) before every getState/setState pair below overwrites
//        its CONTENTS to match `save`.
//     4. Restores, in this order (order matters only where one step reads a
//        closure var another step sets — see inline comments):
//          a. engine.rng.setState(save.rng)
//          b. player.x/y/facing/stance/hp/alive — direct flat-prop
//             assignment (see player note above; no player.js method exists
//             or is needed).
//          c. engine.inventory.setState(save.inventory)
//          d. engine.squad.setState(save.squad) — the ONE shared squad
//             instance every restored guard already points to (guards were
//             just built by createEngine() with `squad: squad`, the SAME
//             squad createEngine constructed) — restoring it here is
//             immediately visible to every guard.squad reference with no
//             separate re-wiring step.
//          e. PER-GUARD RESTORE: for every { id, state } in save.guards,
//             finds the engine.guards[] entry with that SAME id (guard
//             identity, not array position — see the `guards` field note
//             above) and calls guard.setState(state) on it. Throws a clear
//             Error if any saved guard id has no match in the freshly built
//             roster (a save whose zoneId's ZONE_GUARDS table changed since
//             the save was made, e.g. a dev/build mismatch — not a supported
//             restore, but must fail loudly rather than silently drop a
//             guard's state).
//          f. engine.director.setState(save.director)
//          g. engine.world.setState(save.world)
//          h. engine.setState(save.engine) — restores tickCount/time/
//             gameOver/dragging/playerHidden/chaffUntil/every edge-tracker/
//             hiddenLockerIndex/collectedPickups/doorLastNear/
//             inBlockedExitRegion. Reads `zone.lockers` (via engine's own
//             closure) to resolve hiddenLockerIndex back into a locker
//             object reference — safe because zoneData (step 2) is the
//             SAME fixed Game.ZONES.* object the original capture()'s
//             engine was built from (see src/engine.js's own note: Game.
//             ZONES entries are module-level constants, never cloned).
//     5. Returns the fully-restored engine.
//
// Pure JS logic — no THREE, no DOM, no browser APIs, no Math.random/Date —
// runs headless in node exactly like every other logic module. Consumes
// Game.ZONES/Game.createEngine and every module's own getState()/setState()
// pair via their published contracts; never reaches into any module's
// private closure state directly (if a field isn't exposed via getState(),
// this module doesn't know it exists).
(function (Game) {
  // SAVE_VERSION 1 -> 2 (win-state cycle): engine.getState() grew `stats`
  // and `missionComplete` (see this file's own header note on the `engine`
  // field, and src/engine.js's MISSION STATS / EXTRACTION / RANK contract) —
  // a genuine shape change to what capture()/restore() round-trip, so per
  // this module's own VERSION GATE rule the version bumps.
  var SAVE_VERSION = 2;

  function capture(engine) {
    var player = engine.player;

    return {
      version: SAVE_VERSION,
      zoneId: engine.zone.id,
      tickCount: engine.tickCount,
      time: engine.time,
      rng: engine.rng.getState(),
      player: {
        x: player.x,
        y: player.y,
        facing: player.facing,
        stance: player.stance,
        hp: player.hp,
        alive: player.alive,
      },
      inventory: engine.inventory.getState(),
      guards: engine.guards.map(function (g) {
        return { id: g.id, state: g.getState() };
      }),
      squad: engine.squad.getState(),
      director: engine.director.getState(),
      world: engine.world.getState(),
      engine: engine.getState(),
    };
  }

  function restore(save) {
    if (!save || save.version !== SAVE_VERSION) {
      throw new Error(
        "saveState.restore: unsupported save version " +
          (save && save.version) +
          " (expected " +
          SAVE_VERSION +
          ")"
      );
    }

    var zoneData = Game.ZONES[save.zoneId];
    if (!zoneData) {
      throw new Error("saveState.restore: unknown zoneId " + save.zoneId);
    }

    // seed is irrelevant — engine.rng.setState() below immediately overwrites
    // the live cursor (see file header). createEngine()'s own defaults give
    // this fresh engine the correct STRUCTURE (guard roster, camera/laser
    // schema, door list) for `zoneId` before every step below overwrites its
    // CONTENTS to match `save`.
    var engine = Game.createEngine({ zoneData: zoneData, seed: 1 });

    engine.rng.setState(save.rng);

    engine.player.x = save.player.x;
    engine.player.y = save.player.y;
    engine.player.facing = save.player.facing;
    engine.player.stance = save.player.stance;
    engine.player.hp = save.player.hp;
    engine.player.alive = save.player.alive;

    engine.inventory.setState(save.inventory);

    // Shared squad instance — every guard on engine.guards already points at
    // this SAME object (see src/engine.js's construction), so restoring it
    // here is immediately visible everywhere, no re-wiring needed.
    engine.squad.setState(save.squad);

    // PER-GUARD RESTORE — match by id, not array position (see file header).
    for (var i = 0; i < save.guards.length; i++) {
      var savedGuard = save.guards[i];
      var target = null;
      for (var j = 0; j < engine.guards.length; j++) {
        if (engine.guards[j].id === savedGuard.id) {
          target = engine.guards[j];
          break;
        }
      }
      if (!target) {
        throw new Error(
          "saveState.restore: no guard with id " + savedGuard.id + " in rebuilt zone " + save.zoneId
        );
      }
      target.setState(savedGuard.state);
    }

    engine.director.setState(save.director);
    engine.world.setState(save.world);
    engine.setState(save.engine);

    return engine;
  }

  Game.createSaveState = function () {
    return { capture: capture, restore: restore };
  };

  if (typeof module !== "undefined") {
    module.exports = { createSaveState: Game.createSaveState };
  }
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
