// tests/lockerChecks.test.js — headless assertions for the EVASION LOCKER
// CHECK feature: the counter to hiding in a locker mid-chase (src/guardAI.js's
// EVASION sweep now checks a nearby locker via the new ctx.checkLocker hook;
// src/engine.js owns every consequence — see both modules' own contract
// blocks, "EVASION LOCKER CHECK", for the full write-up). Same registry
// pattern as every other tests/*.js file: push onto the shared Game.selfTests
// list; test.js runs every entry and reports ok/FAIL with real exit codes.
// Uses full Game.createEngine() instances throughout (rather than the bare
// guard/world/vision harness some other test files use) since the feature's
// interesting behavior lives at the engine/guard boundary (ctx.checkLocker,
// playerHidden, squad.broadcastAlert) — same posture as tests/cqc.test.js's
// locker tests (9-11).
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var DT = 1 / 60;

function dist(x1, y1, x2, y2) {
  var dx = x2 - x1;
  var dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// Runs `engine` for up to maxTicks ticks (calling engine.tick() with no
// input every tick), collecting every event of the given `type` seen across
// the whole run (engine.events only ever holds the MOST RECENT tick's
// events — see src/engine.js's own contract — so this is the standard way
// every test in this suite accumulates events across a multi-tick run).
// Returns the array of matching events (in chronological order).
function tickCollecting(engine, maxTicks, type) {
  var found = [];
  for (var i = 0; i < maxTicks; i++) {
    engine.tick();
    for (var j = 0; j < engine.events.length; j++) {
      if (engine.events[j].type === type) found.push(engine.events[j]);
    }
  }
  return found;
}

// ---- 1. Player hides in a locker near lastKnown during EVASION -- a
// sweeping guard checks it -- lockerDiscovery "player", playerHidden false,
// squad back to ALERT, player positioned outside the locker. ----------------

Game.selfTests.push({
  name: "lockerChecks: a sweeping guard finds the hidden player in a nearby locker -- lockerDiscovery + re-ALERT + player ejected",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var locker0 = zone.lockers[0]; // {x:2, y:9, facing:0}

    var engine = Game.createEngine({
      zoneData: zone,
      guardConfigs: [{ id: "g-find-player", spawn: { x: 4, y: 3 }, waypoints: [{ x: 1004, y: 3 }] }],
    });

    // HIDE the player in locker0 (same G-near-a-locker mechanism as
    // tests/cqc.test.js's own locker tests).
    engine.player.x = locker0.x;
    engine.player.y = locker0.y;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(engine.playerHidden === true, "setup failed: player never hid");

    // Force a fresh EVASION episode with lastKnown 2m from locker0 (well
    // inside GUARD.LOCKER_CHECK_RANGE=6) on a clear, unobstructed line from
    // the guard's spawn (x=4 column, no obstacle between y=3 and y=9) so it
    // converges normally rather than wedging.
    engine.squad.phase = "EVASION";
    engine.squad.phaseTime = 0;
    engine.squad.lastKnown = { x: 4, y: 9 };

    var discoveries = tickCollecting(engine, 600, "lockerDiscovery");
    assert(discoveries.length >= 1, "expected at least one lockerDiscovery event within 600 ticks");
    var found = discoveries[0];
    assert(found.found === "player", "expected found:'player', got " + JSON.stringify(found));
    assert(found.lockerIndex === 0, "expected lockerIndex 0, got " + found.lockerIndex);
    assert(found.guardId === "g-find-player", "expected guardId 'g-find-player', got " + found.guardId);

    assert(engine.playerHidden === false, "expected playerHidden false after discovery, got " + engine.playerHidden);
    assert(engine.squad.phase === "ALERT", "expected squad back to ALERT, got " + engine.squad.phase);

    // Positioned ~1m outside the locker (along its own facing, 0 -> +x).
    var d = dist(engine.player.x, engine.player.y, locker0.x, locker0.y);
    assert(d > 0.5 && d < 1.5, "expected the player ejected ~1m from the locker, got " + d + "m");
    assert(engine.player.x > locker0.x, "expected the player ejected east (locker.facing=0), got x=" + engine.player.x);
  },
});

// ---- 2. Player hides FAR from lastKnown (a different corner, >6m from the
// guard's only sweep position) -- EVASION expires normally, no discovery
// ever fires, squad decays to CAUTION, player stays safe. -------------------

Game.selfTests.push({
  name: "lockerChecks: hiding far from lastKnown (out of LOCKER_CHECK_RANGE) is genuinely safe -- EVASION times out to CAUTION untouched",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var locker0 = zone.lockers[0]; // {x:2, y:9}

    var engine = Game.createEngine({
      zoneData: zone,
      guardConfigs: [{ id: "g-far", spawn: { x: 30, y: 2 }, waypoints: [{ x: 1030, y: 2 }] }],
    });

    engine.player.x = locker0.x;
    engine.player.y = locker0.y;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(engine.playerHidden === true, "setup failed: player never hid");

    // Force EVASION with lastKnown in the far NE corner -- a clear line from
    // the guard's spawn (both sit on the open y=2 corridor), and both of
    // this zone's lockers (x=2 column) are ~35m+ away, nowhere near
    // GUARD.LOCKER_CHECK_RANGE (6m).
    engine.squad.phase = "EVASION";
    engine.squad.phaseTime = 0;
    engine.squad.lastKnown = { x: 37, y: 2 };

    var discoveries = [];
    var reachedCaution = false;
    var TICKS = Math.round((Game.GUARD.EVASION_S + 3) / DT);
    for (var i = 0; i < TICKS; i++) {
      engine.tick();
      for (var j = 0; j < engine.events.length; j++) {
        if (engine.events[j].type === "lockerDiscovery") discoveries.push(engine.events[j]);
      }
      if (engine.squad.phase === "CAUTION") reachedCaution = true;
      assert(engine.playerHidden === true, "player should stay hidden/safe the whole time, tick " + i);
    }

    assert(discoveries.length === 0, "expected ZERO lockerDiscovery events, got " + JSON.stringify(discoveries));
    assert(reachedCaution, "expected squad to decay EVASION -> CAUTION on schedule");
    assert(engine.playerHidden === true, "expected the player to remain safely hidden throughout");
  },
});

// ---- 3. Stuffed body in a near locker -- found -- broadcastAlert fires at
// the locker (a momentary, unbridged flash through ALERT -- see both
// modules' own EVASION LOCKER CHECK contracts for why "body" deliberately
// does NOT get "player"'s lasting-ALERT treatment: there is no live target
// to actually chase), body stays hidden-flagged, event "body", the finding
// guard resumes its sweep (never itself leaves EVASION), and the episode
// never re-checks the same, already-resolved locker again. ------------------

Game.selfTests.push({
  name: "lockerChecks: a sweeping guard finds a stuffed colleague -- lockerDiscovery 'body', body stays hidden, no re-check loop",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var locker0 = zone.lockers[0];

    var engine = Game.createEngine({
      zoneData: zone,
      guardConfigs: [
        { id: "sleeper-lc", spawn: { x: 25, y: 25 }, waypoints: [{ x: 1025, y: 25 }] },
        { id: "hunter-lc", spawn: { x: 4, y: 3 }, waypoints: [{ x: 1004, y: 3 }] },
      ],
    });

    var sleeper = engine.guards[0];
    var hunter = engine.guards[1];
    sleeper.tranq(true); // headshot -> instantly SLEEPING
    sleeper.stuffInLocker(locker0);
    assert(sleeper.hidden === true, "setup failed: sleeper should be hidden after stuffInLocker");

    engine.player.x = -1000;
    engine.player.y = -1000;

    engine.squad.phase = "EVASION";
    engine.squad.phaseTime = 0;
    engine.squad.lastKnown = { x: 4, y: 9 };

    var discoveries = [];
    var discoveredTick = null;
    var hunterStateAtDiscovery = null;
    var sleeperHiddenAtDiscovery = null;
    var sleeperPosAtDiscovery = null;
    // Run past a full EVASION_S ladder window -- broadcastAlert's own
    // phaseTime reset means the body find restarts the 30s clock (an
    // honest, if momentary, "guards get a fresh lead" side effect), so give
    // this a generous margin past 2x EVASION_S to also prove the episode
    // truly settles rather than looping. NOTE: this window is longer than
    // GUARD.SLEEP_S (60s) so the sleeper WILL eventually wake and step out
    // on its own, unrelated to this feature -- every "stays hidden" style
    // assertion below is checked right at the moment of discovery, not
    // after the full run.
    var TICKS = Math.round((2 * Game.GUARD.EVASION_S + 5) / DT);
    for (var i = 0; i < TICKS; i++) {
      engine.tick();
      for (var j = 0; j < engine.events.length; j++) {
        if (engine.events[j].type === "lockerDiscovery") {
          discoveries.push(engine.events[j]);
          if (discoveredTick === null) {
            discoveredTick = i;
            // Capture state RIGHT as the discovery resolves -- checking any
            // of this later (after the ladder/sleep-timer have had time to
            // move things on their own) would conflate this feature's own
            // behavior with unrelated later mechanics (the ladder advancing
            // to CAUTION, or the sleeper's own SLEEP_S wake-up).
            hunterStateAtDiscovery = hunter.state;
            sleeperHiddenAtDiscovery = sleeper.hidden;
            sleeperPosAtDiscovery = { x: sleeper.x, y: sleeper.y };
          }
        }
      }
    }

    assert(discoveries.length === 1, "expected EXACTLY one lockerDiscovery ever (no re-check loop), got " + JSON.stringify(discoveries));
    var found = discoveries[0];
    assert(found.found === "body", "expected found:'body', got " + JSON.stringify(found));
    assert(found.lockerIndex === 0, "expected lockerIndex 0, got " + found.lockerIndex);
    assert(found.guardId === "hunter-lc", "expected guardId 'hunter-lc', got " + found.guardId);

    // The finding guard's own state never actually leaves EVASION for a
    // body result (see both modules' contracts) -- it resumes its sweep,
    // exactly like an empty find. Checked at the moment of discovery, not
    // after the ladder has had a chance to advance it on to CAUTION later.
    assert(
      hunterStateAtDiscovery === "EVASION",
      "expected the finding guard to remain EVASION at the moment of discovery (never itself detours to ALERT), got " + hunterStateAtDiscovery
    );
    assert(sleeperHiddenAtDiscovery === true, "expected the body to STAY hidden-flagged at the moment of discovery (simplest honest semantics)");
    assert(
      sleeperPosAtDiscovery.x === locker0.x && sleeperPosAtDiscovery.y === locker0.y,
      "expected the body to physically stay in the locker at the moment of discovery"
    );

    // The ladder still eventually settles into CAUTION -- proving this
    // wasn't secretly stuck relooping on the same locker forever.
    assert(
      engine.squad.phase === "CAUTION" || engine.squad.phase === "INFILTRATION",
      "expected the ladder to have moved on past EVASION by now, got " + engine.squad.phase
    );
  },
});

// ---- 4. Empty near locker -- checked -- "empty" event, guard resumes
// sweep, EVASION timing unaffected (ladder still decays on schedule). -------

Game.selfTests.push({
  name: "lockerChecks: an empty near locker is checked and resolves 'empty' -- guard resumes EVASION sweep, ladder timing untouched",
  fn: function () {
    var zone = Game.ZONES.loadingDock;

    var engine = Game.createEngine({
      zoneData: zone,
      guardConfigs: [{ id: "g-empty", spawn: { x: 4, y: 3 }, waypoints: [{ x: 1004, y: 3 }] }],
    });

    engine.player.x = -1000; // nobody in the locker, nobody stuffed
    engine.player.y = -1000;

    engine.squad.phase = "EVASION";
    engine.squad.phaseTime = 0;
    engine.squad.lastKnown = { x: 4, y: 9 };

    var discoveries = [];
    var emptyTick = null;
    var TICKS = Math.round((Game.GUARD.EVASION_S + 3) / DT);
    var reachedCautionTick = null;
    for (var i = 0; i < TICKS; i++) {
      engine.tick();
      for (var j = 0; j < engine.events.length; j++) {
        if (engine.events[j].type === "lockerDiscovery") {
          discoveries.push(engine.events[j]);
          if (emptyTick === null) emptyTick = i;
        }
      }
      if (reachedCautionTick === null && engine.squad.phase === "CAUTION") reachedCautionTick = i;
    }

    assert(discoveries.length === 1, "expected exactly one lockerDiscovery event, got " + JSON.stringify(discoveries));
    assert(discoveries[0].found === "empty", "expected found:'empty', got " + JSON.stringify(discoveries[0]));
    assert(emptyTick !== null, "expected to record the tick the empty check resolved");

    // The check (walk + GUARD.LOCKER_CHECK_PAUSE) happened well before the
    // full 30s ladder timer, proving the guard resumed its sweep afterward
    // instead of getting stuck.
    assert(emptyTick < Math.round(Game.GUARD.EVASION_S / DT), "expected the empty check to resolve before the ladder timer expired");

    // EVASION -> CAUTION still happens at ~GUARD.EVASION_S regardless of the
    // locker check's own travel/pause time -- squad.phaseTime is a pure
    // dt-accumulator, untouched by whatever a guard's own FSM sub-state does.
    assert(reachedCautionTick !== null, "expected squad to still reach CAUTION on schedule");
    assert(
      Math.abs(reachedCautionTick - Math.round(Game.GUARD.EVASION_S / DT)) <= 2,
      "expected CAUTION at ~" + Game.GUARD.EVASION_S + "s regardless of the locker check, got tick " + reachedCautionTick
    );
  },
});

// ---- 5. One-per-guard: two near lockers, one guard -- only the nearest is
// checked this episode; the guard never attempts a second check. -----------

Game.selfTests.push({
  name: "lockerChecks: one-per-guard-per-episode -- with two eligible lockers, only the nearest gets checked",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    // lockers[0] = (2,9), lockers[1] = (2,20) -- 11m apart. A sweep-start
    // point at (2, 14.4) sits 5.4m from locker0 and 5.6m from locker1 --
    // BOTH within GUARD.LOCKER_CHECK_RANGE (6m), locker0 unambiguously
    // nearer (no float tie).
    var engine = Game.createEngine({
      zoneData: zone,
      guardConfigs: [{ id: "g-one-per-guard", spawn: { x: 2, y: 3 }, waypoints: [{ x: 1002, y: 3 }] }],
    });

    engine.player.x = -1000;
    engine.player.y = -1000;

    engine.squad.phase = "EVASION";
    engine.squad.phaseTime = 0;
    engine.squad.lastKnown = { x: 2, y: 14.4 };

    var discoveries = tickCollecting(engine, 900, "lockerDiscovery");
    assert(discoveries.length === 1, "expected exactly one lockerDiscovery this episode, got " + JSON.stringify(discoveries));
    assert(discoveries[0].lockerIndex === 0, "expected the NEAREST locker (index 0) to be the one checked, got " + discoveries[0].lockerIndex);

    assert(engine.squad.checkedLockers[0] === true, "expected checkedLockers[0] marked true");
    assert(!engine.squad.checkedLockers[1], "expected checkedLockers[1] to remain unset -- the second locker was never checked");

    // Run well past the ladder timer to be sure a second check never
    // eventually fires from this same guard/episode.
    var more = tickCollecting(engine, 600, "lockerDiscovery");
    assert(more.length === 0, "expected no further lockerDiscovery events later in the same episode");
  },
});

// ---- 6. Squad dedup: two guards + one near locker -- exactly one
// lockerDiscovery event (the second guard's own reservation attempt sees it
// already checked, even within the SAME tick). ------------------------------

Game.selfTests.push({
  name: "lockerChecks: squad-level dedup -- two guards converging on the same locker produce exactly one lockerDiscovery",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var locker0 = zone.lockers[0]; // (2,9)

    var engine = Game.createEngine({
      zoneData: zone,
      guardConfigs: [
        // Both spawned already within GUARD.ARRIVE_DIST (0.6m) of the forced
        // lastKnown below, so BOTH begin their coordinated sweep on the very
        // FIRST EVASION tick -- the same-tick race this test is for.
        { id: "dup-A", spawn: { x: 2.5, y: 9 }, waypoints: [{ x: 1002.5, y: 9 }] },
        { id: "dup-B", spawn: { x: 2.5, y: 9.3 }, waypoints: [{ x: 1002.5, y: 9.3 }] },
      ],
    });

    engine.player.x = -1000;
    engine.player.y = -1000;

    engine.squad.phase = "EVASION";
    engine.squad.phaseTime = 0;
    engine.squad.lastKnown = { x: 2.5, y: 9 };

    var discoveries = tickCollecting(engine, 400, "lockerDiscovery");
    assert(discoveries.length === 1, "expected exactly one lockerDiscovery event, got " + JSON.stringify(discoveries));
    assert(discoveries[0].lockerIndex === 0, "expected locker index 0 checked, got " + discoveries[0].lockerIndex);
    assert(engine.squad.checkedLockers[0] === true, "expected checkedLockers[0] marked true");
  },
});

// ---- 7. No checks outside EVASION -- a hidden player passed within range by
// PATROL, then CAUTION, guards over 60s never triggers a single check. -----

Game.selfTests.push({
  name: "lockerChecks: guards never check lockers outside EVASION (PATROL/CAUTION passersby, 60s, zero checks)",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var locker0 = zone.lockers[0]; // (2,9)

    var engine = Game.createEngine({
      zoneData: zone,
      // Spawned exactly on top of the locker with a tiny waypoint loop right
      // there -- as close/proximate as a guard can ever get, every tick.
      guardConfigs: [{ id: "g-patrol-passerby", spawn: { x: 2, y: 9 }, waypoints: [{ x: 2, y: 9 }, { x: 2, y: 9.5 }] }],
    });

    engine.player.x = locker0.x;
    engine.player.y = locker0.y;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true }); // HIDE
    assert(engine.playerHidden === true, "setup failed: player never hid");

    var discoveries = [];

    // First 30s: squad.phase stays INFILTRATION (guard PATROLs the tiny loop
    // right on top of the locker).
    var HALF = Math.round(30 / DT);
    for (var i = 0; i < HALF; i++) {
      engine.tick();
      for (var j = 0; j < engine.events.length; j++) {
        if (engine.events[j].type === "lockerDiscovery") discoveries.push(engine.events[j]);
      }
    }
    assert(engine.squad.phase === "INFILTRATION", "setup failed: squad should still be INFILTRATION (PATROL leg)");
    assert(engine.guards[0].state === "PATROL", "setup failed: guard should still be PATROL");

    // Second 30s: force CAUTION (widened cone, brisker patrol -- same
    // waypoint loop) -- still never EVASION, still never a check.
    engine.squad.phase = "CAUTION";
    engine.squad.phaseTime = 0;
    for (i = 0; i < HALF; i++) {
      engine.tick();
      for (j = 0; j < engine.events.length; j++) {
        if (engine.events[j].type === "lockerDiscovery") discoveries.push(engine.events[j]);
      }
    }
    assert(engine.guards[0].state === "CAUTION", "expected the guard synced into CAUTION");

    assert(discoveries.length === 0, "expected ZERO lockerDiscovery events across 60s of PATROL/CAUTION proximity, got " + JSON.stringify(discoveries));
    assert(engine.playerHidden === true, "expected the hidden player to remain undiscovered throughout");
  },
});

// ---- 8. Determinism: identical seeds/scripts -> identical event streams. --

Game.selfTests.push({
  name: "lockerChecks: determinism -- identical seed/setup produces an identical lockerDiscovery event stream",
  fn: function () {
    function runScenario() {
      var zone = Game.ZONES.loadingDock;
      var locker0 = zone.lockers[0];
      var engine = Game.createEngine({
        zoneData: zone,
        seed: 42,
        guardConfigs: [{ id: "g-determinism", spawn: { x: 4, y: 3 }, waypoints: [{ x: 1004, y: 3 }] }],
      });
      engine.player.x = locker0.x;
      engine.player.y = locker0.y;
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });

      engine.squad.phase = "EVASION";
      engine.squad.phaseTime = 0;
      engine.squad.lastKnown = { x: 4, y: 9 };

      var allEvents = [];
      var TICKS = 400;
      for (var i = 0; i < TICKS; i++) {
        engine.tick();
        allEvents = allEvents.concat(engine.events);
      }
      return allEvents;
    }

    var eventsA = runScenario();
    var eventsB = runScenario();

    var discoveriesA = eventsA.filter(function (e) { return e.type === "lockerDiscovery"; });
    assert(discoveriesA.length >= 1, "expected the scenario to actually produce a lockerDiscovery to make this test meaningful");

    assert(
      JSON.stringify(eventsA) === JSON.stringify(eventsB),
      "expected byte-identical event streams across two identically-seeded/scripted runs:\nA=" +
        JSON.stringify(eventsA) +
        "\nB=" +
        JSON.stringify(eventsB)
    );
  },
});

// ---- 9. Save/restore mid-locker-check (walk or pause, in progress) round-
// trips exactly -- extends src/guardAI.js's REPLAY GATE coverage to this new
// per-guard/per-squad state (see tests/saveState.test.js's own chaos gate,
// which this test's scenario deliberately resembles). -----------------------

Game.selfTests.push({
  name: "lockerChecks: save/restore captured mid-locker-check (walk/pause in progress) round-trips identically",
  fn: function () {
    var zone = Game.ZONES.loadingDock;

    // NOTE: deliberately uses the DEFAULT guardConfigs (no override) --
    // saveState.js's restore() rebuilds a fresh engine via createEngine()'s
    // own ZONE_GUARDS default table (id "g1", spawn zone.waypoints[0]) and
    // then matches saved guards back onto it BY ID (see src/saveState.js's
    // own PER-GUARD RESTORE note) -- a custom guardConfigs id here would
    // have no matching guard in the rebuilt roster and throw.
    var engineA = Game.createEngine({ zoneData: zone, seed: 11 });

    engineA.player.x = -1000;
    engineA.player.y = -1000;

    engineA.squad.phase = "EVASION";
    engineA.squad.phaseTime = 0;
    // zone.waypoints[0] is (3,2) -- a clear, unobstructed line down to (4,9)
    // (same corridor test 1 uses), 2m from locker0 (2,9).
    engineA.squad.lastKnown = { x: 4, y: 9 };

    // Tick until the guard is actively mid-check (lockerChecking true) --
    // capture as early as the WALK leg where possible, but accept the PAUSE
    // leg too; either exercises the new save-state fields.
    var midCheck = false;
    for (var i = 0; i < 400 && !midCheck; i++) {
      engineA.tick();
      var gs = engineA.guards[0].getState();
      if (gs.lockerChecking === true) midCheck = true;
    }
    assert(midCheck, "setup failed: guard never entered a mid-locker-check state within 400 ticks");

    var preSaveState = JSON.stringify(engineA.guards[0].getState());

    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engineA)));
    var engineB = saveState.restore(save);

    // The restored guard's own save-state must match exactly, right after
    // restore, before either engine ticks again.
    assert(
      JSON.stringify(engineB.guards[0].getState()) === preSaveState,
      "expected the restored guard's getState() to match the captured one exactly"
    );

    var REMAINING = 400;
    for (var t = 0; t < REMAINING; t++) {
      engineA.tick();
      engineB.tick();
    }

    var snapA = JSON.stringify(engineA.snapshot());
    var snapB = JSON.stringify(engineB.snapshot());
    assert(snapA === snapB, "post-restore snapshots diverged:\nA=" + snapA + "\nB=" + snapB);

    var guardStateA = JSON.stringify(engineA.guards[0].getState());
    var guardStateB = JSON.stringify(engineB.guards[0].getState());
    assert(guardStateA === guardStateB, "post-restore guard save-states diverged:\nA=" + guardStateA + "\nB=" + guardStateB);
  },
});

if (typeof module !== "undefined") module.exports = {};
