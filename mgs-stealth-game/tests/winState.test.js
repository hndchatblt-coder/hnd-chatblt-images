// tests/winState.test.js — headless assertions for the WIN STATE / RANK
// SCREEN, the final bootstrap feature: engine.stats (src/engine.js), the
// "extraction" terminal (src/engine.js's tryZoneTransition/completeMission),
// Game.computeRank's pure rank table, and stats/missionComplete surviving a
// save/restore round-trip (src/saveState.js). Same registry pattern as every
// other tests/*.js file: push onto the shared Game.selfTests list; test.js
// runs every entry and reports ok/FAIL with real exit codes.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var DT = 1 / 60;

// ---------------------------------------------------------------------------
// RANK TABLE — Game.computeRank(stats), a pure function (see src/engine.js's
// own MISSION STATS / EXTRACTION / RANK contract for the documented table).
// ---------------------------------------------------------------------------

// 1. BIG BOSS requires BOTH zero alerts AND zero kills -- either alone isn't
// enough.
Game.selfTests.push({
  name: "rank table: BIG BOSS requires zero alerts AND zero kills",
  fn: function () {
    assert(
      Game.computeRank({ alertsTotal: 0, kills: 0, missionTimeS: 0 }) === "BIG BOSS",
      "expected 0 alerts / 0 kills to be BIG BOSS"
    );
    assert(
      Game.computeRank({ alertsTotal: 1, kills: 0, missionTimeS: 0 }) !== "BIG BOSS",
      "expected 1 alert to forfeit BIG BOSS"
    );
    assert(
      Game.computeRank({ alertsTotal: 0, kills: 1, missionTimeS: 0 }) !== "BIG BOSS",
      "expected 1 kill (even with 0 alerts) to forfeit BIG BOSS"
    );
  },
});

// 2. The alert-count ladder (kills 0, well under FOX's 15-minute cap) hits
// every documented threshold boundary: FOX <=1, HOUND <=2, DOBERMAN <=4,
// JACKAL <=6, ELEPHANT above that.
Game.selfTests.push({
  name: "rank table: alert-count ladder resolves at each documented threshold (kills 0)",
  fn: function () {
    var cases = [
      [1, "FOX"],
      [2, "HOUND"],
      [3, "DOBERMAN"],
      [4, "DOBERMAN"],
      [5, "JACKAL"],
      [6, "JACKAL"],
      [7, "ELEPHANT"],
    ];
    cases.forEach(function (c) {
      var alerts = c[0];
      var expected = c[1];
      var got = Game.computeRank({ alertsTotal: alerts, kills: 0, missionTimeS: 0 });
      assert(got === expected, "expected " + alerts + " alert(s) -> " + expected + ", got " + got);
    });
  },
});

// 3. FOX ALSO requires missionTimeS < 15 minutes (900s) -- a clean-but-slow
// run falls through to HOUND instead of failing outright.
Game.selfTests.push({
  name: "rank table: FOX additionally requires missionTimeS < 900s, else falls to HOUND",
  fn: function () {
    assert(
      Game.computeRank({ alertsTotal: 1, kills: 0, missionTimeS: 899 }) === "FOX",
      "expected 1 alert under 900s to be FOX"
    );
    assert(
      Game.computeRank({ alertsTotal: 1, kills: 0, missionTimeS: 900 }) === "HOUND",
      "expected 1 alert at exactly 900s (not < 900) to fall to HOUND"
    );
    assert(
      Game.computeRank({ alertsTotal: 1, kills: 0, missionTimeS: 5000 }) === "HOUND",
      "expected 1 alert well over 900s to fall to HOUND"
    );
  },
});

// 4. KILLS CAP: any kill forfeits BIG BOSS and FOX outright and caps the
// achievable rank at HOUND, laddering down from there exactly like the
// kills-0 table above (future-proofing -- stats.kills is always 0 this
// cycle, no lethal weapon exists, see src/engine.js's own note).
Game.selfTests.push({
  name: "rank table: kills > 0 caps the achievable rank at HOUND regardless of alerts or time",
  fn: function () {
    assert(
      Game.computeRank({ alertsTotal: 0, kills: 1, missionTimeS: 1 }) === "HOUND",
      "expected 0 alerts + 1 kill + tiny time to be capped at HOUND, not BIG BOSS/FOX"
    );
    assert(
      Game.computeRank({ alertsTotal: 2, kills: 1, missionTimeS: 0 }) === "HOUND",
      "expected 2 alerts + 1 kill to be HOUND"
    );
    assert(
      Game.computeRank({ alertsTotal: 3, kills: 1, missionTimeS: 0 }) === "DOBERMAN",
      "expected 3 alerts + 1 kill to be DOBERMAN"
    );
    assert(
      Game.computeRank({ alertsTotal: 5, kills: 2, missionTimeS: 0 }) === "JACKAL",
      "expected 5 alerts + kills to be JACKAL"
    );
    assert(
      Game.computeRank({ alertsTotal: 7, kills: 1, missionTimeS: 0 }) === "ELEPHANT",
      "expected 7 alerts + a kill to be ELEPHANT"
    );
  },
});

// ---------------------------------------------------------------------------
// engine.stats accumulation
// ---------------------------------------------------------------------------

// 5. Driving one knock, one dart, one CQC takedown, one ration, and one
// chaff pop each increments their own counter exactly once -- and kills
// (which nothing in this codebase can ever increment) stays 0.
Game.selfTests.push({
  name: "engine.stats accumulate: knock/dart/cqc/ration/chaff each increment their own counter exactly once",
  fn: function () {
    var engine = Game.createEngine({
      seed: 9001,
      // Stationary, facing due east (spawn === the single waypoint's
      // direction) -- same "tg-cqc" convention as tests/cqc.test.js.
      guardConfigs: [{ id: "tg-cqc", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });

    assert(
      engine.stats.knocksMade === 0 &&
        engine.stats.dartsFired === 0 &&
        engine.stats.cqcTakedowns === 0 &&
        engine.stats.rationsUsed === 0 &&
        engine.stats.chaffUsed === 0 &&
        engine.stats.kills === 0 &&
        engine.stats.alertsTotal === 0,
      "expected every stat to start at 0"
    );

    // KNOCK -- (14.6,15) is 0.6m from the west container's east edge, well
    // within KNOCK_WALL_DIST (same coordinates as
    // tests/soundEvents.test.js's own knock-verb test).
    engine.player.x = 14.6;
    engine.player.y = 15;
    engine.tick({ moveX: 0, moveY: 0, knock: true });
    assert(engine.stats.knocksMade === 1, "expected knocksMade 1 after one knock, got " + engine.stats.knocksMade);
    var knockEvents = engine.events.filter(function (e) { return e.type === "knock"; });
    assert(knockEvents.length === 1, "expected exactly one knock event");

    // DART -- open south corridor facing due north, guaranteed miss with no
    // guard anywhere near the ray (same coordinates as tests/tranq.test.js's
    // own "a miss travels to the wall" test).
    engine.player.x = 20;
    engine.player.y = 27;
    engine.player.facing = -Math.PI / 2;
    engine.tick({ moveX: 0, moveY: 0, fire: true });
    assert(engine.stats.dartsFired === 1, "expected dartsFired 1 after one shot, got " + engine.stats.dartsFired);
    var tranqEvents = engine.events.filter(function (e) { return e.type === "tranqFired"; });
    assert(tranqEvents.length === 1 && tranqEvents[0].hit === false, "expected exactly one missed tranqFired event");

    // CQC -- 1.2m due WEST of tg-cqc, directly behind its east-facing cone
    // (same coordinates as tests/cqc.test.js's own "takedown from behind" test).
    engine.player.x = 18.8;
    engine.player.y = 5;
    engine.player.facing = 0;
    assert(engine.squad.phase === "INFILTRATION", "setup: squad should still be INFILTRATION before the CQC");
    engine.tick({ moveX: 0, moveY: 0, cqc: true });
    assert(engine.stats.cqcTakedowns === 1, "expected cqcTakedowns 1 after one takedown, got " + engine.stats.cqcTakedowns);
    var cqcEvents = engine.events.filter(function (e) { return e.type === "cqc"; });
    assert(cqcEvents.length === 1, "expected exactly one cqc event");
    assert(engine.guards[0].state === "SLEEPING", "expected tg-cqc asleep after the takedown");

    // RATION -- damage the player directly (a legitimate flat-prop mutation,
    // same as combat.test.js's own healing-reset convention) so useRation()
    // actually has something to heal.
    engine.player.hp = 0.5;
    engine.tick({ moveX: 0, moveY: 0, ration: true });
    assert(engine.stats.rationsUsed === 1, "expected rationsUsed 1 after one ration, got " + engine.stats.rationsUsed);
    assert(engine.player.hp > 0.5, "expected the ration to have actually healed the player");

    // CHAFF
    engine.tick({ moveX: 0, moveY: 0, chaff: true });
    assert(engine.stats.chaffUsed === 1, "expected chaffUsed 1 after one chaff pop, got " + engine.stats.chaffUsed);
    assert(engine.chaffUntil > engine.time, "expected the chaff pop to have actually armed chaffUntil");

    // kills is NEVER incremented -- no lethal weapon exists in this codebase.
    assert(engine.stats.kills === 0, "expected kills to remain 0 -- no lethal weapon exists");
    // None of the above should have cost an alert.
    assert(engine.stats.alertsTotal === 0, "expected alertsTotal to remain 0 -- none of the above should alert anyone");
  },
});

// 6. alertsTotal accumulates ACROSS zones: squad.alertCount is per-squad and
// gets rebuilt fresh by every switchZone (see src/engine.js's ZONE
// TRANSITIONS), so a real alert in loadingDock, a forced stand-down, a real
// zone crossing, and a SECOND real alert in warehouse must add up to
// engine.stats.alertsTotal === 2, not reset to 1 by the crossing.
Game.selfTests.push({
  name: "engine.stats.alertsTotal accumulates across zone transitions (alert in dock + alert in warehouse -> 2)",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var engine = Game.createEngine({
      seed: 4002,
      zoneData: dock,
      // Same "alert-g1" convention as tests/zones.test.js's own "no
      // transition during ALERT" test -- a stationary guard whose only
      // waypoint is 1000m further along its own facing (it will never
      // actually walk there within this test's short window).
      guardConfigs: [{ id: "alert-g1", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });

    engine.player.x = 22;
    engine.player.y = 5;
    var reachedAlert = false;
    var MAX_SETUP_TICKS = Math.round(6 / DT);
    for (var t = 0; t < MAX_SETUP_TICKS && !reachedAlert; t++) {
      engine.tick();
      engine.player.x = 22;
      engine.player.y = 5;
      if (engine.squad.phase === "ALERT") reachedAlert = true;
    }
    assert(reachedAlert, "setup failed: squad never reached ALERT in loadingDock");
    assert(engine.stats.alertsTotal === 1, "expected alertsTotal 1 after the dock alert, got " + engine.stats.alertsTotal);

    // Stand down (bypassing the real EVASION/CAUTION decay timers -- same
    // direct squad.phase mutation convention already used elsewhere, e.g.
    // tests/guardAI-partB.test.js/tests/combat.test.js) and cross into the
    // warehouse. The exit trigger (x:18-22,y:0-3) sits well outside
    // alert-g1's own east-facing cone (the guard is due south of it, facing
    // due east), so this crossing tick cannot itself trigger a SECOND dock
    // alert regardless of the forced phase.
    engine.squad.phase = "INFILTRATION";
    engine.player.x = dock.exit.x + dock.exit.w / 2;
    engine.player.y = dock.exit.y + dock.exit.h / 2;
    engine.tick({ moveX: 0, moveY: 0 });
    assert(engine.zone.id === "warehouse", "expected to have crossed into the warehouse, got " + engine.zone.id);
    assert(engine.stats.alertsTotal === 1, "expected alertsTotal to still read 1 immediately after the crossing (fresh squad, no new alert yet)");

    // A REAL second alert, against the warehouse's own default guard roster
    // (w1, engine.guards[0] post-transition) -- read its facing directly
    // (same technique as tests/combat.test.js's firefightEngine) rather than
    // assuming a value.
    var w1 = engine.guards[0];
    var ahead = 4;
    engine.player.x = w1.x + Math.cos(w1.facing) * ahead;
    engine.player.y = w1.y + Math.sin(w1.facing) * ahead;
    reachedAlert = false;
    for (t = 0; t < MAX_SETUP_TICKS && !reachedAlert; t++) {
      engine.tick();
      if (engine.squad.phase === "ALERT") reachedAlert = true;
    }
    assert(reachedAlert, "setup failed: squad never reached ALERT in the warehouse");
    assert(engine.stats.alertsTotal === 2, "expected alertsTotal 2 after the warehouse alert, got " + engine.stats.alertsTotal);
  },
});

// ---------------------------------------------------------------------------
// EXTRACTION / MISSION COMPLETE
// ---------------------------------------------------------------------------

// 7. Extraction requires squad.phase === INFILTRATION -- the same gate every
// ordinary zone-changing exit already requires. Standing in the trigger
// during CAUTION produces no missionComplete; forcing INFILTRATION on the
// very next tick (same position, unchanged) then DOES complete it -- a
// negative control immediately followed by a positive one, proving the gate
// itself (not some other unrelated setup mistake) is what's being tested.
Game.selfTests.push({
  name: "extraction requires INFILTRATION: standing in the region during CAUTION produces no missionComplete",
  fn: function () {
    var tower = Game.ZONES.commsTower;
    var engine = Game.createEngine({ seed: 5003, zoneData: tower });
    var northExit = tower.exits[0];
    assert(northExit.to === "extraction", "setup: expected commsTower.exits[0] to be the extraction terminal");

    engine.player.x = northExit.x + northExit.w / 2;
    engine.player.y = northExit.y + northExit.h / 2;
    engine.player.stance = "crawl"; // see tests/zones.test.js's own note on this trigger sitting in camera0's facing line

    engine.squad.phase = "CAUTION";
    engine.tick({ moveX: 0, moveY: 0 });
    assert(engine.missionComplete === false, "expected no missionComplete while squad.phase is CAUTION");
    var completeDuringCaution = engine.events.filter(function (e) { return e.type === "missionComplete"; });
    assert(completeDuringCaution.length === 0, "expected zero missionComplete events during CAUTION");

    // Positive control: same position, INFILTRATION now -> completes.
    engine.player.x = northExit.x + northExit.w / 2;
    engine.player.y = northExit.y + northExit.h / 2;
    engine.squad.phase = "INFILTRATION";
    engine.tick({ moveX: 0, moveY: 0 });
    assert(engine.missionComplete === true, "expected missionComplete once squad.phase is INFILTRATION at the same trigger");
  },
});

// 8. Reaching the extraction region sets missionComplete exactly once,
// freezes the engine (same FROZEN ENGINE contract as gameOver), and both the
// missionComplete event and engine.snapshot() carry the stats/rank.
Game.selfTests.push({
  name: "reaching the extraction region -> missionComplete once, engine frozen, snapshot carries it",
  fn: function () {
    var tower = Game.ZONES.commsTower;
    var engine = Game.createEngine({ seed: 6004, zoneData: tower });

    // Manufacture one dart-fired stat before extracting, so this test also
    // proves the event/snapshot stats aren't just a hardcoded zero-state.
    engine.player.x = 20;
    engine.player.y = 26;
    engine.player.facing = 0;
    engine.tick({ moveX: 0, moveY: 0, fire: true });
    assert(engine.stats.dartsFired === 1, "setup failed: expected one dart fired before extracting");
    assert(engine.squad.phase === "INFILTRATION", "setup failed: expected still INFILTRATION after the dart");

    var northExit = tower.exits[0];
    engine.player.x = northExit.x + northExit.w / 2;
    engine.player.y = northExit.y + northExit.h / 2;
    engine.player.stance = "crawl";

    assert(engine.missionComplete === false, "expected fresh engine.missionComplete false");
    engine.tick({ moveX: 0, moveY: 0 });

    assert(engine.missionComplete === true, "expected engine.missionComplete true after reaching extraction");
    var completeEvents = engine.events.filter(function (e) { return e.type === "missionComplete"; });
    assert(completeEvents.length === 1, "expected exactly one missionComplete event, got " + completeEvents.length);

    var ev = completeEvents[0];
    assert(ev.stats.dartsFired === 1, "expected the missionComplete event's stats to carry dartsFired 1, got " + JSON.stringify(ev.stats));
    assert(ev.stats.alertsTotal === 0, "expected zero alerts on this clean run");
    assert(ev.rank === Game.computeRank(ev.stats), "expected the event's rank to match Game.computeRank(ev.stats)");

    var snap = engine.snapshot();
    assert(snap.missionComplete === true, "expected snapshot().missionComplete true");
    assert(snap.stats.dartsFired === 1, "expected snapshot().stats.dartsFired 1, got " + JSON.stringify(snap.stats));

    // FROZEN ENGINE -- further ticks (even with real movement input) are
    // total no-ops, same contract as gameOver.
    var frozenTickCount = engine.tickCount;
    var frozenEventsLength = engine.events.length;
    for (var i = 0; i < 30; i++) {
      engine.tick({ moveX: 1, moveY: 1 });
    }
    assert(engine.tickCount === frozenTickCount, "expected tickCount to freeze");
    assert(engine.events.length === frozenEventsLength, "expected engine.events to stay exactly as the completing tick left it");
  },
});

// ---------------------------------------------------------------------------
// SAVE / RESTORE
// ---------------------------------------------------------------------------

// 9. stats survive a save/restore round-trip mid-run, and correctly diverge
// afterward -- the restored engine is a genuinely independent copy, not a
// shared reference back into the original.
Game.selfTests.push({
  name: "engine.stats survive a save/restore round-trip, then diverge correctly with new events",
  fn: function () {
    // Default guard roster (NOT a custom guardConfigs override) -- restore()
    // rebuilds the engine's guards from src/engine.js's own ZONE_GUARDS
    // table (see its file header) and matches saved guards by id; a save
    // captured from a bespoke roster that table doesn't know about is
    // correctly rejected by restore() (see src/saveState.js's PER-GUARD
    // RESTORE note), so this test sticks to the zone's real default guard.
    var engine = Game.createEngine({ seed: 7005 });

    // One knock and one ration before the save.
    engine.player.x = 14.6;
    engine.player.y = 15;
    engine.tick({ moveX: 0, moveY: 0, knock: true });
    engine.player.hp = 0.5;
    engine.tick({ moveX: 0, moveY: 0, ration: true });
    assert(engine.stats.knocksMade === 1 && engine.stats.rationsUsed === 1, "setup failed: expected 1 knock + 1 ration before the save");

    var saveState = Game.createSaveState();
    var save = saveState.capture(engine);
    var reparsed = JSON.parse(JSON.stringify(save)); // prove it's plain-data safe, same convention as tests/saveState.test.js
    var restored = saveState.restore(reparsed);

    assert(
      JSON.stringify(restored.stats) === JSON.stringify(engine.stats),
      "expected restored.stats to equal the original's stats immediately after restore:\n" +
        JSON.stringify(restored.stats) +
        "\nvs\n" +
        JSON.stringify(engine.stats)
    );

    // Diverge: one more KNOCK on the original, one more DART (miss) on the
    // restored copy -- their stats must diverge from here, proving genuine
    // independence rather than a shared reference.
    engine.player.x = 14.6;
    engine.player.y = 15;
    engine.tick({ moveX: 0, moveY: 0, knock: true });
    assert(engine.stats.knocksMade === 2, "expected the original's knocksMade to reach 2");
    assert(restored.stats.knocksMade === 1, "expected the restored copy's knocksMade to stay at 1 (unaffected by the original's later tick)");

    restored.player.x = 20;
    restored.player.y = 27;
    restored.player.facing = -Math.PI / 2;
    restored.tick({ moveX: 0, moveY: 0, fire: true });
    assert(restored.stats.dartsFired === 1, "expected the restored copy's dartsFired to reach 1");
    assert(engine.stats.dartsFired === 0, "expected the original's dartsFired to stay at 0 (unaffected by the restored copy's later tick)");
  },
});

// ---------------------------------------------------------------------------
// missionTimeS sanity
// ---------------------------------------------------------------------------

// 10. missionTimeS mirrors engine.time (tickCount * DT) every tick, and is
// NOT reset by a real zone transition (same "mission-scoped, not
// zone-scoped" posture as inventory/chaffUntil).
Game.selfTests.push({
  name: "engine.stats.missionTimeS is sane: 600 ticks reads ~10s, unaffected by a real zone transition",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var engine = Game.createEngine({ seed: 8006, zoneData: dock });

    for (var i = 0; i < 600; i++) {
      engine.tick({ moveX: 0, moveY: 0 });
    }
    assert(
      Math.abs(engine.stats.missionTimeS - 10) < 1e-9,
      "expected missionTimeS ~10s after 600 ticks, got " + engine.stats.missionTimeS
    );

    // A real zone crossing must not reset it.
    engine.player.x = dock.exit.x + dock.exit.w / 2;
    engine.player.y = dock.exit.y + dock.exit.h / 2;
    engine.player.stance = "crouch";
    engine.tick({ moveX: 0, moveY: 0, stance: "crouch" });
    assert(engine.zone.id === "warehouse", "setup failed: expected to have crossed into the warehouse");
    assert(
      Math.abs(engine.stats.missionTimeS - engine.time) < 1e-9,
      "expected missionTimeS to keep mirroring engine.time immediately after the crossing"
    );
    assert(engine.stats.missionTimeS > 10, "expected missionTimeS to keep accumulating across the crossing, not reset to 0");
  },
});
