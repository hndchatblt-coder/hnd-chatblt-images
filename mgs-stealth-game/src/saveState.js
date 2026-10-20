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
//                                 // order never changes — see restore() below. `engine.guards`
//                                 // can (and, mid-ALERT, often does) include director.js's own
//                                 // "reinf-<n>" reinforcement guards ALONGSIDE the ZONE_GUARDS
//                                 // base roster — this array was always captured correctly
//                                 // (engine.guards.map() below doesn't care what spawned a
//                                 // guard); it was restore()'s OWN base-roster-only rebuild
//                                 // that couldn't round-trip one — see restore()'s PER-GUARD
//                                 // RESTORE step below for the cycle-40 audit B1 fix.
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
//                                 // travel here. ALSO — NEW this cycle (audit B2 fix) —
//                                 // reinforcementSeq/alertWasActive/nextSpawnAt, director's
//                                 // own ESCALATION reinforcement bookkeeping; see
//                                 // src/director.js's own SAVE/RESTORE comment for why each
//                                 // one matters (in short: without reinforcementSeq surviving
//                                 // a restore, the next spawn after one would reissue an id
//                                 // already in use by a just-restored reinforcement guard).
//                                 // SAVE_VERSION was bumped 3 -> 4 for exactly this shape
//                                 // change (see restore()'s VERSION GATE below).
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
//                                 // ALSO NEW this cycle (zone persistence, see src/engine.js's
//                                 // own ZONE PERSISTENCE / STASH contract) — `zoneStash` (the
//                                 // FULL { [zoneId]: stashEntry } map every departed-and-not-
//                                 // yet-revisited zone's guards/squad/director/door state lives
//                                 // in) and `zoneReinforcementUsed` (the CURRENT zone's cross-
//                                 // visit reinforcement spend). Both mission-scoped like `stats`
//                                 // above; miss `zoneStash` and a save/restore round-trip
//                                 // forgets every zone ever departed before the save — e.g.
//                                 // tranq a guard, leave, save, restore, return: the guard would
//                                 // come back fresh at spawn instead of still sleeping (see
//                                 // tests/zonePersistence.test.js's own save/restore test).
//                                 // SAVE_VERSION was bumped 1 -> 2 -> 3 for exactly these two
//                                 // shape changes (see restore()'s VERSION GATE below) — an
//                                 // old-format save simply lacks these fields, which
//                                 // src/engine.js's own setState() tolerates defensively (falls
//                                 // back to the freshly-built engine's own zeroed stats/false
//                                 // missionComplete/empty zoneStash/0 zoneReinforcementUsed
//                                 // rather than clobbering them with `undefined`), but the
//                                 // version gate means that fallback should never actually be
//                                 // reachable via a real restore() call in practice.
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
//        SAVE_VERSION is 4 as of this cycle (cycle-40 audit B1/B2 fix) —
//        bumped from 3 because src/director.js's getState() grew three more
//        new fields (`reinforcementSeq`, `alertWasActive`, `nextSpawnAt` —
//        see the `director` field note above and src/director.js's own
//        SAVE/RESTORE comment for the full B2 write-up); on top of the zone
//        persistence cycle's earlier bump (2 -> 3, `zoneStash`/
//        `zoneReinforcementUsed`) and the win-state cycle's before that
//        (1 -> 2, `stats`/`missionComplete`). Note B1 itself (the actual
//        critical "reinforcement save unloadable" bug — see PER-GUARD
//        RESTORE below) is a pure restore()-side logic fix, not a capture()
//        shape change — save.guards already carried every live guard
//        including reinforcements before this cycle, restore() just
//        couldn't rebuild one — so B1 alone would not have required a
//        version bump; it is bundled into this same bump only because B2
//        (a genuine shape change) already forces one this cycle.
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
//          e. PER-GUARD RESTORE (UPDATED — cycle-40 audit B1 fix, THE
//             CRITICAL BUG): for every { id, state } in save.guards, first
//             tries to find the engine.guards[] entry with that SAME id
//             (guard identity, not array position — see the `guards` field
//             note above) among the freshly-built ZONE_GUARDS base roster.
//             A saved id NOT in that roster is no longer an automatic
//             error — director.js can spawn "reinf-<n>" reinforcement
//             guards onto engine.guards mid-ALERT (see its own ESCALATION /
//             REINFORCEMENTS contract), and a save captured while one was
//             alive used to be UNRESTORABLE: this exact case is audit
//             finding B1 — restore() threw "no guard with id reinf-1" and
//             src/boot.js's F9 caught it into a silent "NO SAVE" toast,
//             discarding the player's save outright. Now: any unmatched id
//             that matches /^reinf-\d+$/ is reconstructed via
//             Game.rebuildGuardsFromStash — the SAME deterministic
//             construction path src/engine.js's own zone-revisit STASH
//             mechanism already uses to rebuild a departed zone's
//             reinforcements (see that function's own contract for why it's
//             safe/pure — a function of zone.guardDoor + a freshly built
//             world only), reused here rather than duplicated, per the
//             audit's own root-cause note that these two systems had
//             diverged. guard.setState(state) is applied as part of that
//             call. Any OTHER unmatched id (not in the base roster, NOT a
//             reinforcement-shaped id) still throws a clear Error — a save
//             whose zoneId's ZONE_GUARDS table genuinely changed since the
//             save was made (e.g. a dev/build mismatch), or a corrupted/
//             hand-edited save blob, must still fail loudly rather than
//             silently half-load; see tests/regressions/reinforcement-
//             save.test.js's own corrupt-save test for the pinned proof.
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
  // SAVE_VERSION 2 -> 3 (zone persistence cycle): engine.getState() grew
  // `zoneStash` and `zoneReinforcementUsed` (see this file's own header note
  // on the `engine` field, and src/engine.js's ZONE PERSISTENCE / STASH
  // contract) — another genuine shape change, same rule.
  // SAVE_VERSION 3 -> 4 (cycle-40 audit B1/B2 fix): src/director.js's
  // getState() grew `reinforcementSeq`/`alertWasActive`/`nextSpawnAt` (see
  // this file's own header note on the `director` field, and
  // src/director.js's own SAVE/RESTORE comment) — same rule. Bundled
  // alongside the actual critical fix (B1: restore() can now rebuild a
  // reinforcement guard at all — see PER-GUARD RESTORE below), which is a
  // restore()-side logic change, not a capture() shape change.
  var SAVE_VERSION = 4;

  // REINFORCEMENT ID PATTERN (see PER-GUARD RESTORE below) — the exact
  // shape director.js's spawnReinforcement() mints ("reinf-" + an
  // incrementing 1-based integer, see that file's own SPAWN note). A saved
  // guard id outside the freshly-built ZONE_GUARDS base roster is only ever
  // treated as a legitimate reinforcement if it matches this — anything
  // else still throws (see below).
  var REINFORCEMENT_ID_RE = /^reinf-\d+$/;

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

    // PER-GUARD RESTORE — match by id, not array position (see file header
    // for the full audit B1 write-up). First pass: partition save.guards
    // into base-roster hits (present in the freshly-built engine.guards) vs
    // everything else. `engine.guards` here is still exactly the
    // ZONE_GUARDS base roster createEngine() built above — reinforcements
    // (if any) get appended to it below, AFTER this partition, so this
    // lookup can never accidentally match a reinforcement against itself.
    var baseGuardIds = {};
    for (var bgi = 0; bgi < engine.guards.length; bgi++) {
      baseGuardIds[engine.guards[bgi].id] = true;
    }

    var baseSavedGuards = [];
    var reinforcementSavedGuards = [];
    for (var i = 0; i < save.guards.length; i++) {
      var sg = save.guards[i];
      if (baseGuardIds[sg.id]) {
        baseSavedGuards.push(sg);
      } else if (REINFORCEMENT_ID_RE.test(sg.id)) {
        reinforcementSavedGuards.push(sg);
      } else {
        // Unmatched AND not reinforcement-shaped — a save whose zoneId's
        // ZONE_GUARDS table changed since the save was made (e.g. a dev/
        // build mismatch), or a corrupted/hand-edited blob. Must fail
        // loudly rather than silently drop a guard's state — see file
        // header and tests/regressions/reinforcement-save.test.js's own
        // corrupt-save test.
        throw new Error(
          "saveState.restore: no guard with id " + sg.id + " in rebuilt zone " + save.zoneId
        );
      }
    }

    // Base guards: setState onto the matching already-built engine.guards
    // entry, exactly as before this cycle.
    for (var bi = 0; bi < baseSavedGuards.length; bi++) {
      var savedGuard = baseSavedGuards[bi];
      var target = null;
      for (var j = 0; j < engine.guards.length; j++) {
        if (engine.guards[j].id === savedGuard.id) {
          target = engine.guards[j];
          break;
        }
      }
      // Unreachable in practice: savedGuard.id came straight out of
      // baseGuardIds above, so a match is guaranteed — kept as a defensive
      // throw anyway, same posture as every other "shouldn't happen" guard
      // in this file.
      if (!target) {
        throw new Error(
          "saveState.restore: no guard with id " + savedGuard.id + " in rebuilt zone " + save.zoneId
        );
      }
      target.setState(savedGuard.state);
    }

    // Reinforcements (audit B1 fix): reconstructed via the SAME construction
    // path src/engine.js's own zone-revisit STASH mechanism already uses
    // (Game.rebuildGuardsFromStash — see its own contract for why this is a
    // safe, deterministic reconstruction: a pure function of zone.guardDoor
    // + a freshly built world, same guardDoor-anchored waypoint loop
    // director.js's own spawnReinforcement used originally). It calls
    // guard.setState() internally, so no separate setState pass is needed
    // here. Pushed in save.guards order, which — because director.js only
    // ever appends a newly-spawned reinforcement to the END of the live
    // guards array (see director.js's own ctx.guards note) — already lands
    // in the same relative order the original engine's guards array had
    // them in, base roster first, reinforcements in spawn order: preserving
    // this order matters for byte-identical replay (see THE HARD GATE in
    // tests/regressions/reinforcement-save.test.js), since director.js's
    // own 40s radio check-in schedule is staggered by each guard's ARRAY
    // INDEX (see director.js's PURE-FUNCTION CHECK-IN SCHEDULE note).
    if (reinforcementSavedGuards.length) {
      var rebuiltReinforcements = Game.rebuildGuardsFromStash(
        reinforcementSavedGuards,
        zoneData,
        engine.world,
        engine.vision,
        engine.rng,
        engine.squad
      );
      for (var ri = 0; ri < rebuiltReinforcements.length; ri++) {
        engine.guards.push(rebuiltReinforcements[ri]);
      }
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
