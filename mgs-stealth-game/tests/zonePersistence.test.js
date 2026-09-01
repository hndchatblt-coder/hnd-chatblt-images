// tests/zonePersistence.test.js — headless assertions for src/engine.js's
// per-zone state persistence (ZONE PERSISTENCE / STASH — see that file's own
// contract, right after the ZONE TRANSITIONS section): a departed zone's
// guards/squad/director/doors are now STASHED and RESTORED on re-entry
// rather than discarded (the old v1 semantics). Same registry pattern as
// every other tests/*.test.js file: push onto the shared Game.selfTests
// list; test.js runs every entry and reports ok/FAIL with real exit codes.
//
// Zones used: loadingDock <-> warehouse is the only bidirectional pair this
// game ships (laboratory/commsTower are one-way, linear-progression zones —
// see src/world.js's own zone comments), so every real round-trip test below
// uses that pair. Test 9 (door persistence) needs a door, and neither
// loadingDock nor warehouse ships one, so it temporarily registers two tiny
// throwaway zones into Game.ZONES (fresh ids, never colliding with a real
// zone) for the duration of a single test, removing them in a `finally` —
// see that test's own comment for why this is safe.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var DT = 1 / 60;

function farPlayer() {
  return {
    x: -9999,
    y: -9999,
    facing: 0,
    visionProfile: function () {
      return 1.0;
    },
  };
}

function findGuard(engine, id) {
  for (var i = 0; i < engine.guards.length; i++) {
    if (engine.guards[i].id === id) return engine.guards[i];
  }
  return null;
}

function crossExit(engine, exit) {
  engine.player.x = exit.x + exit.w / 2;
  engine.player.y = exit.y + exit.h / 2;
  engine.player.stance = "crawl"; // minimize detection risk during the crossing tick itself
  engine.tick({ moveX: 0, moveY: 0, stance: "crawl" });
}

// ---------------------------------------------------------------------------
// 1. Tranq the dock guard, exit to warehouse, return: guard STILL SLEEPING
//    with plausible remaining time (frozen while away).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "zonePersistence: tranq'd dock guard stays SLEEPING with frozen remaining sleep time across a round trip",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var warehouse = Game.ZONES.warehouse;
    var engine = Game.createEngine({ seed: 9001, zoneData: dock });

    var g1 = findGuard(engine, "g1");
    assert(g1, "setup: expected default guard g1 in loadingDock");
    g1.tranq(true); // headshot -> instantly SLEEPING, sleepTime = 0
    assert(g1.state === "SLEEPING", "setup: expected g1 asleep immediately after a headshot");

    // Let 5s pass in the dock before departing, so "remaining" is a genuinely
    // partial (not full) value at exit time.
    var PRE_DEPART_TICKS = Math.round(5 / DT);
    for (var i = 0; i < PRE_DEPART_TICKS; i++) engine.tick();
    assert(engine.guards[0].state === "SLEEPING", "setup: expected g1 still asleep before departure");
    var remainingAtExit = Game.GUARD.SLEEP_S - engine.guards[0].getState().sleepTime;
    assert(remainingAtExit > 0 && remainingAtExit < Game.GUARD.SLEEP_S, "setup: expected a genuinely partial remaining sleep time, got " + remainingAtExit);

    // Cross out to the warehouse, then straight back.
    crossExit(engine, dock.exit);
    assert(engine.zone.id === "warehouse", "setup: expected to have crossed into the warehouse, got " + engine.zone.id);

    var southExit = warehouse.exits[0];
    assert(southExit.to === "loadingDock", "setup: expected warehouse.exits[0] to lead back to loadingDock");
    crossExit(engine, southExit);
    assert(engine.zone.id === "loadingDock", "expected to be back in loadingDock, got " + engine.zone.id);

    var g1Again = findGuard(engine, "g1");
    assert(g1Again, "expected guard g1 to exist again after re-entering loadingDock");
    assert(g1Again.state === "SLEEPING", "expected g1 STILL SLEEPING after the round trip, got " + g1Again.state);

    var remainingAfterReturn = Game.GUARD.SLEEP_S - g1Again.getState().sleepTime;
    var TOLERANCE_S = 2 * DT;
    assert(
      Math.abs(remainingAfterReturn - remainingAtExit) <= TOLERANCE_S,
      "expected remaining sleep time frozen at ~" + remainingAtExit.toFixed(4) + "s, got " + remainingAfterReturn.toFixed(4) + "s"
    );
  },
});

// ---------------------------------------------------------------------------
// 2. Sleeping guard's wake clock resumes on re-entry: 30s spent away must NOT
//    subtract 30s from the remaining sleep time.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "zonePersistence: a sleeping guard's wake clock stays frozen while the zone is unvisited (30s away costs it nothing)",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var warehouse = Game.ZONES.warehouse;
    var engine = Game.createEngine({ seed: 9002, zoneData: dock });

    var g1 = findGuard(engine, "g1");
    g1.tranq(true);
    assert(g1.state === "SLEEPING", "setup: expected g1 asleep");

    var PRE_DEPART_TICKS = Math.round(10 / DT);
    for (var i = 0; i < PRE_DEPART_TICKS; i++) engine.tick();
    var remainingAtExit = Game.GUARD.SLEEP_S - engine.guards[0].getState().sleepTime; // ~50s

    crossExit(engine, dock.exit);
    assert(engine.zone.id === "warehouse", "setup: expected the warehouse");

    // Spend 30s actually simulating the warehouse -- parked off-map so w1/w2's
    // own patrol loops (which pass close to the entrance point) never spot a
    // stationary player and drag squad.phase out of INFILTRATION, which would
    // block the return crossing this test needs (this test is about the
    // sleep clock, not about surviving the warehouse guards).
    engine.player.x = -1000;
    engine.player.y = -1000;
    var AWAY_TICKS = Math.round(30 / DT);
    for (var t = 0; t < AWAY_TICKS; t++) engine.tick();

    var southExit = warehouse.exits[0];
    crossExit(engine, southExit);
    assert(engine.zone.id === "loadingDock", "expected back in loadingDock");

    var g1Again = findGuard(engine, "g1");
    assert(g1Again.state === "SLEEPING", "expected g1 still SLEEPING right after the return, got " + g1Again.state);
    var remainingRightAfterReturn = Game.GUARD.SLEEP_S - g1Again.getState().sleepTime;
    assert(
      Math.abs(remainingRightAfterReturn - remainingAtExit) <= 2 * DT,
      "expected the 30s spent away to cost the sleep clock nothing, remaining was ~" +
        remainingAtExit.toFixed(2) + "s at exit, ~" + remainingRightAfterReturn.toFixed(2) + "s right after return"
    );

    // Now confirm the wake actually happens ~remainingAtExit later (NOT 30s
    // sooner, i.e. not at ~remainingAtExit - 30).
    var wokeAtTick = null;
    var MAX_WAIT_TICKS = Math.round((remainingAtExit + 3) / DT);
    for (var w = 0; w < MAX_WAIT_TICKS && wokeAtTick === null; w++) {
      engine.tick();
      var g = findGuard(engine, "g1");
      if (g.state !== "SLEEPING") wokeAtTick = w;
    }
    assert(wokeAtTick !== null, "g1 never woke up within the expected window");
    var wokeAfterS = wokeAtTick * DT;
    assert(
      Math.abs(wokeAfterS - remainingAtExit) < 0.5,
      "expected g1 to wake ~" + remainingAtExit.toFixed(2) + "s after the return, got " + wokeAfterS.toFixed(2) + "s " +
        "(a 30s-sooner bug would read ~" + (remainingAtExit - 30).toFixed(2) + "s here)"
    );
  },
});

// ---------------------------------------------------------------------------
// 3. Post-CAUTION widened-cone decay never leaks: a fully-decayed zone
//    re-enters as INFILTRATION with the guard mid-patrol at its stashed
//    position, not reset to spawn/waypoint 0.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "zonePersistence: a decayed CAUTION zone re-enters as INFILTRATION with the guard mid-patrol, not at spawn",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var warehouse = Game.ZONES.warehouse;
    var engine = Game.createEngine({ seed: 9003, zoneData: dock });

    var spawn = dock.waypoints[0];
    var g1 = findGuard(engine, "g1");
    assert(
      Math.abs(g1.x - spawn.x) < 0.01 && Math.abs(g1.y - spawn.y) < 0.01,
      "setup: expected g1 to start exactly at waypoints[0]"
    );

    // Keep the player far away and out of every guard's cone the whole time
    // (this test is about the CAUTION->INFILTRATION decay/persistence, not
    // about surviving detection).
    engine.player.x = -1000;
    engine.player.y = -1000;

    // Force CAUTION directly (same "assign squad.phase by hand" precedent
    // tests/escalation.test.js / tests/feedback.test.js already use) --
    // guardAI's own RADIO CALL / SQUAD-PHASE SYNC step forces g1 into
    // "CAUTION" (widened-cone patrol) on its very next update() regardless
    // of how squad.phase got there.
    engine.squad.phase = "CAUTION";
    engine.squad.phaseTime = 0;
    engine.player.x = -1000;
    engine.player.y = -1000;
    engine.tick();
    assert(engine.guards[0].state === "CAUTION", "setup: expected g1 synced into CAUTION, got " + engine.guards[0].state);

    // Let it patrol (at CAUTION_SPEED, wider cone) for a few seconds so its
    // position visibly moves away from spawn.
    var CAUTION_WALK_TICKS = Math.round(3 / DT);
    for (var i = 0; i < CAUTION_WALK_TICKS; i++) {
      engine.player.x = -1000;
      engine.player.y = -1000;
      engine.tick();
    }
    var movedX = engine.guards[0].x;
    var movedY = engine.guards[0].y;
    assert(
      Math.abs(movedX - spawn.x) > 0.3 || Math.abs(movedY - spawn.y) > 0.3,
      "setup: expected g1 to have visibly moved during CAUTION, still near spawn (" + movedX.toFixed(2) + "," + movedY.toFixed(2) + ")"
    );

    // Force the CAUTION->INFILTRATION decay (same direct-assignment
    // precedent) -- two ticks: one for squad.tick() to actually flip the
    // phase, one more for guardAI's own sync step to react to the NEW phase
    // and force the guard back to PATROL (see src/engine.js's own STATE <->
    // SQUAD.PHASE MAPPING / RADIO CALL SYNC note on why this takes a tick to
    // propagate).
    engine.squad.phaseTime = Game.GUARD.CAUTION_S;
    engine.player.x = -1000;
    engine.player.y = -1000;
    engine.tick();
    assert(engine.squad.phase === "INFILTRATION", "expected squad to have decayed to INFILTRATION, got " + engine.squad.phase);
    engine.player.x = -1000;
    engine.player.y = -1000;
    engine.tick();
    assert(engine.guards[0].state === "PATROL", "expected g1 synced back to PATROL, got " + engine.guards[0].state);

    var preExitX = engine.guards[0].x;
    var preExitY = engine.guards[0].y;

    // Cross out and back.
    crossExit(engine, dock.exit);
    assert(engine.zone.id === "warehouse", "expected warehouse");
    crossExit(engine, warehouse.exits[0]);
    assert(engine.zone.id === "loadingDock", "expected loadingDock again");

    var g1Again = findGuard(engine, "g1");
    assert(g1Again.state === "PATROL", "expected g1 to re-enter as PATROL (no leaked CAUTION), got " + g1Again.state);
    assert(engine.squad.phase === "INFILTRATION", "expected the restored squad to read INFILTRATION, got " + engine.squad.phase);
    assert(
      Math.abs(g1Again.x - spawn.x) > 0.3 || Math.abs(g1Again.y - spawn.y) > 0.3,
      "expected g1 to re-enter at its stashed mid-patrol position, not spawn -- got (" + g1Again.x.toFixed(2) + "," + g1Again.y.toFixed(2) + ")"
    );
    assert(
      Math.abs(g1Again.x - preExitX) < 0.05 && Math.abs(g1Again.y - preExitY) < 0.05,
      "expected g1's position to match exactly what it was at the moment of departure"
    );
  },
});

// ---------------------------------------------------------------------------
// 4. Guard positions persist: note the dock guard's position mid-patrol at
//    exit, return, he's there (not back at waypoint 0).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "zonePersistence: guard position mid-patrol persists across a round trip (not reset to waypoint 0)",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var warehouse = Game.ZONES.warehouse;
    var engine = Game.createEngine({ seed: 9004, zoneData: dock });

    engine.player.x = -1000;
    engine.player.y = -1000;
    var WALK_TICKS = Math.round(4 / DT);
    for (var i = 0; i < WALK_TICKS; i++) {
      engine.player.x = -1000;
      engine.player.y = -1000;
      engine.tick();
    }

    var spawn = dock.waypoints[0];
    var midX = engine.guards[0].x;
    var midY = engine.guards[0].y;
    assert(
      Math.abs(midX - spawn.x) > 0.3 || Math.abs(midY - spawn.y) > 0.3,
      "setup: expected g1 to have walked away from waypoint 0 by now"
    );

    crossExit(engine, dock.exit);
    assert(engine.zone.id === "warehouse", "expected warehouse");
    crossExit(engine, warehouse.exits[0]);
    assert(engine.zone.id === "loadingDock", "expected loadingDock again");

    var g1Again = findGuard(engine, "g1");
    assert(
      Math.abs(g1Again.x - spawn.x) > 0.3 || Math.abs(g1Again.y - spawn.y) > 0.3,
      "expected g1 to still be away from waypoint 0 after the round trip, got (" + g1Again.x.toFixed(2) + "," + g1Again.y.toFixed(2) + ")"
    );
    assert(
      Math.abs(g1Again.x - midX) < 0.05 && Math.abs(g1Again.y - midY) < 0.05,
      "expected g1's exact mid-patrol position to persist, expected (" + midX.toFixed(2) + "," + midY.toFixed(2) +
        ") got (" + g1Again.x.toFixed(2) + "," + g1Again.y.toFixed(2) + ")"
    );
  },
});

// ---------------------------------------------------------------------------
// 5. Reinforcement persistence: 2 reinforcements spawn and survive a round
//    trip (4 guards total); the +3 budget stays spent -- a fresh ALERT after
//    re-entry spawns only 1 more, never a 3rd/4th.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "zonePersistence: reinforcements + the zone-lifetime +3 budget both survive a round trip",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var warehouse = Game.ZONES.warehouse;
    var engine = Game.createEngine({ seed: 9005, zoneData: warehouse });
    assert(engine.guards.length === 2, "setup: expected 2 base warehouse guards, got " + engine.guards.length);

    // Park the player off-map so converging reinforcements never gain real
    // LOS and open fire (same precedent as tests/escalation.test.js's own
    // perf test) -- this test is about spawn/persistence counts, not combat.
    engine.player.x = -1000;
    engine.player.y = -1000;
    engine.squad.phase = "ALERT";
    engine.squad.lastKnown = { x: 20, y: 15 };

    // Hold ALERT open for ~20s: reinforcements spawn at +6s and +16s (see
    // src/director.js's own REINFORCEMENT_FIRST_DELAY_S/INTERVAL_S, mirrored
    // as literal seconds here exactly like tests/escalation.test.js already
    // does), so 20s captures exactly 2 without reaching the 3rd (+26s).
    var HOLD_TICKS = Math.round(20 / DT);
    for (var i = 0; i < HOLD_TICKS; i++) {
      if (engine.squad.phase !== "ALERT") engine.squad.phase = "ALERT";
      engine.tick();
    }
    assert(engine.guards.length === 4, "setup: expected 2 base + 2 reinforcements = 4 guards, got " + engine.guards.length);

    // Force the ladder down to INFILTRATION (direct-assignment precedent,
    // see test 3 above) -- two ticks for the phase flip + guard resync.
    engine.squad.phase = "INFILTRATION";
    engine.squad.phaseTime = 0;
    engine.squad.lastKnown = null;
    engine.tick();
    engine.tick();
    assert(engine.squad.phase === "INFILTRATION", "expected INFILTRATION before departing, got " + engine.squad.phase);
    assert(engine.guards.length === 4, "expected still 4 guards heading into the exit crossing");

    // Cross out to loadingDock and straight back.
    crossExit(engine, warehouse.exits[0]);
    assert(engine.zone.id === "loadingDock", "expected loadingDock");
    crossExit(engine, dock.exit);
    assert(engine.zone.id === "warehouse", "expected warehouse again");

    assert(engine.guards.length === 4, "expected 4 guards (2 original + 2 reinforcements) after the round trip, got " + engine.guards.length);
    var reinfIds = engine.guards
      .map(function (g) { return g.id; })
      .filter(function (id) { return id.indexOf("reinf-") === 0; });
    assert(reinfIds.length === 2, "expected exactly 2 reinforcement guards restored, got " + JSON.stringify(reinfIds));

    // A NEW alert after re-entry: only 1 more reinforcement should ever
    // spawn (2 already spent + 1 new = 3, the zone-lifetime cap), even
    // across a window long enough for all 3 of director's OWN per-visit
    // schedule slots (+6s/+16s/+26s) to fire if the cross-visit cap weren't
    // being enforced.
    engine.player.x = -1000;
    engine.player.y = -1000;
    engine.squad.phase = "ALERT";
    engine.squad.lastKnown = { x: 20, y: 15 };
    var reinforcementEvents = 0;
    var SECOND_BOUT_TICKS = Math.round(35 / DT);
    for (var t = 0; t < SECOND_BOUT_TICKS; t++) {
      if (engine.squad.phase !== "ALERT") engine.squad.phase = "ALERT";
      engine.tick();
      for (var e = 0; e < engine.events.length; e++) {
        if (engine.events[e].type === "reinforcement") reinforcementEvents++;
      }
    }
    assert(reinforcementEvents === 1, "expected exactly 1 more reinforcement (2/3 already spent), got " + reinforcementEvents);
    assert(engine.guards.length === 5, "expected 5 guards total (2 base + 2 old + 1 new reinforcement), got " + engine.guards.length);
  },
});

// ---------------------------------------------------------------------------
// 6. Collected pickups don't respawn on re-entry (L1 keycard, warehouse).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "zonePersistence: a collected pickup (L1 keycard) never respawns on re-entry",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var warehouse = Game.ZONES.warehouse;
    var engine = Game.createEngine({ seed: 9006, zoneData: dock });

    crossExit(engine, dock.exit);
    assert(engine.zone.id === "warehouse", "expected warehouse");
    assert(engine.inventory.keycards.L1 === false, "setup: expected no L1 keycard yet");

    var pickup = warehouse.pickups[0];
    assert(pickup.item === "keycardL1", "setup: expected warehouse.pickups[0] to be keycardL1");
    engine.player.x = pickup.x;
    engine.player.y = pickup.y;
    engine.tick({ moveX: 0, moveY: 0 });

    var pickupEvents = engine.events.filter(function (e) { return e.type === "pickup"; });
    assert(pickupEvents.length === 1, "expected exactly one pickup event, got " + pickupEvents.length);
    assert(engine.inventory.keycards.L1 === true, "expected the L1 keycard collected");

    // Leave and come back.
    crossExit(engine, warehouse.exits[0]);
    assert(engine.zone.id === "loadingDock", "expected loadingDock");
    crossExit(engine, dock.exit);
    assert(engine.zone.id === "warehouse", "expected warehouse again");

    assert(engine.inventory.keycards.L1 === true, "expected the L1 keycard to STAY collected across the round trip");

    // Standing right on top of it again must not re-grant/re-fire pickup.
    engine.player.x = pickup.x;
    engine.player.y = pickup.y;
    engine.tick({ moveX: 0, moveY: 0 });
    var secondPickupEvents = engine.events.filter(function (e) { return e.type === "pickup"; });
    assert(secondPickupEvents.length === 0, "expected NO second pickup event -- the item must not respawn, got " + JSON.stringify(secondPickupEvents));
  },
});

// ---------------------------------------------------------------------------
// 7. Determinism across repeated crossings (the hard gate): identical seed +
//    scripted input log crossing dock<->warehouse 3 times with a tranq
//    mid-way -> byte-identical snapshots on two independent engines.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "zonePersistence: determinism holds across repeated zone crossings with a tranq mid-script (same seed -> identical snapshots)",
  fn: function () {
    var SEED = 9007;

    function buildScript() {
      var dock = Game.ZONES.loadingDock;
      var warehouse = Game.ZONES.warehouse;
      var steps = [];

      // A small scripted log: idle a bit, cross dock->warehouse, idle +
      // tranq w1, cross back, idle, cross out again, idle, cross back once
      // more. Every step is a plain function(engine) so it's trivially
      // replayable identically against two independent engines. Every idle
      // block parks the player off-map first (same "no incidental
      // detection" precedent as this file's other multi-second idle waits
      // in the warehouse) -- this test is about STASH DETERMINISM, not about
      // surviving w1/w2's patrols, and a stray real alert would make the two
      // engines' snapshots diverge for reasons unrelated to what's under
      // test here.
      steps.push(function (e) {
        for (var i = 0; i < 60; i++) e.tick({ moveX: 0, moveY: 0 });
      });
      steps.push(function (e) {
        e.player.x = dock.exit.x + dock.exit.w / 2;
        e.player.y = dock.exit.y + dock.exit.h / 2;
        e.player.stance = "crawl";
        e.tick({ moveX: 0, moveY: 0, stance: "crawl" });
      });
      steps.push(function (e) {
        e.player.x = -1000;
        e.player.y = -1000;
        for (var i = 0; i < 30; i++) e.tick({ moveX: 0, moveY: 0 });
        var w1 = e.guards[0];
        w1.tranq(true);
      });
      steps.push(function (e) {
        e.player.x = -1000;
        e.player.y = -1000;
        for (var i = 0; i < 45; i++) e.tick({ moveX: 0, moveY: 0 });
      });
      steps.push(function (e) {
        var southExit = warehouse.exits[0];
        e.player.x = southExit.x + southExit.w / 2;
        e.player.y = southExit.y + southExit.h / 2;
        e.player.stance = "crawl";
        e.tick({ moveX: 0, moveY: 0, stance: "crawl" });
      });
      steps.push(function (e) {
        for (var i = 0; i < 90; i++) e.tick({ moveX: 0, moveY: 0 });
      });
      steps.push(function (e) {
        e.player.x = dock.exit.x + dock.exit.w / 2;
        e.player.y = dock.exit.y + dock.exit.h / 2;
        e.player.stance = "crawl";
        e.tick({ moveX: 0, moveY: 0, stance: "crawl" });
      });
      steps.push(function (e) {
        e.player.x = -1000;
        e.player.y = -1000;
        for (var i = 0; i < 60; i++) e.tick({ moveX: 0, moveY: 0 });
      });
      steps.push(function (e) {
        var southExit = warehouse.exits[0];
        e.player.x = southExit.x + southExit.w / 2;
        e.player.y = southExit.y + southExit.h / 2;
        e.player.stance = "crawl";
        e.tick({ moveX: 0, moveY: 0, stance: "crawl" });
      });
      steps.push(function (e) {
        for (var i = 0; i < 60; i++) e.tick({ moveX: 0, moveY: 0 });
      });
      return steps;
    }

    var engineA = Game.createEngine({ seed: SEED, zoneData: Game.ZONES.loadingDock });
    var engineB = Game.createEngine({ seed: SEED, zoneData: Game.ZONES.loadingDock });

    var scriptA = buildScript();
    var scriptB = buildScript();
    assert(scriptA.length === scriptB.length, "sanity: identical script length");

    for (var i = 0; i < scriptA.length; i++) {
      scriptA[i](engineA);
      scriptB[i](engineB);
    }

    // The script crosses dock->warehouse->dock->warehouse->dock (4 crossings,
    // an even number), so it ends back in loadingDock, not the warehouse.
    assert(engineA.zone.id === "loadingDock", "sanity: expected engineA to have ended in loadingDock, got " + engineA.zone.id);
    assert(engineB.zone.id === "loadingDock", "sanity: expected engineB to have ended in loadingDock, got " + engineB.zone.id);
    assert(engineA.tickCount === engineB.tickCount, "sanity: expected identical tickCount");

    var snapA = JSON.stringify(engineA.snapshot());
    var snapB = JSON.stringify(engineB.snapshot());
    assert(snapA === snapB, "expected byte-identical snapshots for two engines given the identical seed + input log, diverged");
  },
});

// ---------------------------------------------------------------------------
// 8. Save/restore carries the stash: tranq the dock guard, go to warehouse,
//    F5-capture, restore, return to dock -> guard still sleeping with the
//    correct remaining time.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "zonePersistence: a save/restore round-trip carries the zone stash (tranq dock guard survives capture+restore+return)",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var warehouse = Game.ZONES.warehouse;
    var engine = Game.createEngine({ seed: 9008, zoneData: dock });

    var g1 = findGuard(engine, "g1");
    g1.tranq(true);
    var PRE_DEPART_TICKS = Math.round(8 / DT);
    for (var i = 0; i < PRE_DEPART_TICKS; i++) engine.tick();
    var remainingAtExit = Game.GUARD.SLEEP_S - engine.guards[0].getState().sleepTime;

    crossExit(engine, dock.exit);
    assert(engine.zone.id === "warehouse", "setup: expected warehouse");

    // F5 -- capture, then restore into a brand new engine instance.
    var saveState = Game.createSaveState();
    var save = saveState.capture(engine);
    assert(save.zoneId === "warehouse", "sanity: expected the save's zoneId to be warehouse, got " + save.zoneId);

    var restored = saveState.restore(save);
    assert(restored.zone.id === "warehouse", "expected the restored engine to be in the warehouse, got " + restored.zone.id);

    // Return to the dock on the RESTORED engine.
    crossExit(restored, warehouse.exits[0]);
    assert(restored.zone.id === "loadingDock", "expected the restored engine back in loadingDock, got " + restored.zone.id);

    var g1Restored = findGuard(restored, "g1");
    assert(g1Restored, "expected g1 to exist again on the restored engine after re-entering loadingDock");
    assert(g1Restored.state === "SLEEPING", "expected g1 still SLEEPING on the restored engine, got " + g1Restored.state);

    var remainingAfterRestore = Game.GUARD.SLEEP_S - g1Restored.getState().sleepTime;
    assert(
      Math.abs(remainingAfterRestore - remainingAtExit) <= 2 * DT,
      "expected the save/restore round trip to preserve the frozen remaining sleep time ~" +
        remainingAtExit.toFixed(4) + "s, got " + remainingAfterRestore.toFixed(4) + "s"
    );
  },
});

// ---------------------------------------------------------------------------
// 9. (bonus) Door open-flag + auto-close timer persist across a round trip.
//    Neither loadingDock nor warehouse ships a door (see world.js's own zone
//    comments), so this test temporarily registers two tiny throwaway zones
//    into Game.ZONES (ids "zpDoorA"/"zpDoorB", guaranteed not to collide
//    with any real zone) for the DURATION OF THIS TEST ONLY, deregistering
//    them in a `finally` so no other test (in this file or any other) ever
//    observes them -- test.js runs each test's fn() to full completion,
//    including the finally, before moving to the next one.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "zonePersistence: an open door's auto-close countdown persists (frozen) across a round trip",
  fn: function () {
    var zoneA = {
      id: "zpDoorA",
      name: "ZP DOOR TEST A",
      bounds: { w: 40, h: 30 },
      walls: [
        { x: 0, y: 0, w: 40, h: 1 },
        { x: 0, y: 29, w: 40, h: 1 },
        { x: 0, y: 0, w: 1, h: 30 },
        { x: 39, y: 0, w: 1, h: 30 },
      ],
      doors: [{ x: 18, y: 14, w: 4, h: 1, lock: null, id: "zpDoor" }],
      playerSpawn: { x: 20, y: 20 },
      exits: [{ x: 18, y: 0, w: 4, h: 3, to: "zpDoorB", entranceKey: "fromA" }],
      entrances: { fromB: { x: 20, y: 20 } },
      waypoints: [
        { x: 5, y: 5 },
        { x: 35, y: 5 },
        { x: 35, y: 25 },
        { x: 5, y: 25 },
      ],
      darkZones: [],
      lockers: [],
      cameras: [],
      pickups: [],
      lasers: [],
    };
    zoneA.exit = zoneA.exits[0];

    var zoneB = {
      id: "zpDoorB",
      name: "ZP DOOR TEST B",
      bounds: { w: 40, h: 30 },
      walls: [
        { x: 0, y: 0, w: 40, h: 1 },
        { x: 0, y: 29, w: 40, h: 1 },
        { x: 0, y: 0, w: 1, h: 30 },
        { x: 39, y: 0, w: 1, h: 30 },
      ],
      doors: [],
      playerSpawn: { x: 20, y: 15 },
      exits: [{ x: 18, y: 26, w: 4, h: 3, to: "zpDoorA", entranceKey: "fromB" }],
      entrances: { fromA: { x: 20, y: 4 } },
      waypoints: [
        { x: 5, y: 5 },
        { x: 35, y: 5 },
        { x: 35, y: 25 },
        { x: 5, y: 25 },
      ],
      darkZones: [],
      lockers: [],
      cameras: [],
      pickups: [],
      lasers: [],
    };
    zoneB.exit = zoneB.exits[0];

    assert(!Game.ZONES.zpDoorA && !Game.ZONES.zpDoorB, "sanity: throwaway zone ids must not already exist");

    try {
      Game.ZONES.zpDoorA = zoneA;
      Game.ZONES.zpDoorB = zoneB;

      var engine = Game.createEngine({ seed: 9009, zoneData: zoneA, guardConfigs: [] });
      assert(engine.world.isDoorOpen("zpDoor") === false, "setup: expected the door to start closed");

      // Walk up to the door to open it (unlocked -- opens on proximity).
      engine.player.x = 20;
      engine.player.y = 14.5;
      engine.tick({ moveX: 0, moveY: 0 });
      assert(engine.world.isDoorOpen("zpDoor") === true, "setup: expected the door to have opened on proximity");

      // Step away immediately and hold there for ~2.0s of the door's 3s
      // auto-close budget (DOOR_AUTO_CLOSE_S), leaving ~1.0s remaining --
      // deliberately a LARGE, easy-to-distinguish remainder rather than a
      // near-zero one, so "resumed at ~1s remaining" (expected) reads
      // nothing like "reset to a fresh 3s" (~3s) or "expired while away"
      // (~0s) once we measure how long the door takes to close after return.
      engine.player.x = 2;
      engine.player.y = 2;
      var HOLD_AWAY_TICKS = Math.round(2.0 / DT);
      for (var i = 0; i < HOLD_AWAY_TICKS; i++) engine.tick({ moveX: 0, moveY: 0 });
      assert(engine.world.isDoorOpen("zpDoor") === true, "setup: expected the door still open just before departure (~1s of its 3s budget left)");

      engine.player.x = zoneA.exit.x + zoneA.exit.w / 2;
      engine.player.y = zoneA.exit.y + zoneA.exit.h / 2;
      engine.tick({ moveX: 0, moveY: 0 });
      assert(engine.zone.id === "zpDoorB", "expected to have crossed into zpDoorB, got " + engine.zone.id);

      // Spend a while in zpDoorB -- the door in zpDoorA must NOT advance its
      // countdown while nobody is there to see it (frozen time, see file
      // header) and must NOT have silently auto-closed by the time we
      // return, even though real (global) engine.time keeps climbing well
      // past the door's own 3s budget during this stretch. Parked off-map
      // (zpDoorB gets its own default single guard patrolling near the
      // entrance point, same "no incidental detection" precedent as this
      // file's other multi-second idle waits) -- this test is about the
      // door's countdown, not about surviving zpDoorB's guard.
      engine.player.x = -1000;
      engine.player.y = -1000;
      var AWAY_TICKS = Math.round(5 / DT);
      for (var t = 0; t < AWAY_TICKS; t++) engine.tick({ moveX: 0, moveY: 0 });

      engine.player.x = zoneB.exit.x + zoneB.exit.w / 2;
      engine.player.y = zoneB.exit.y + zoneB.exit.h / 2;
      engine.tick({ moveX: 0, moveY: 0 });
      assert(engine.zone.id === "zpDoorA", "expected to be back in zpDoorA, got " + engine.zone.id);

      assert(
        engine.world.isDoorOpen("zpDoor") === true,
        "expected the door to STILL read open right after re-entry (its ~1s-remaining countdown must not have silently elapsed while away)"
      );

      // Confirm the countdown actually RESUMES from ~1s remaining rather
      // than restarting a fresh 3s window: keep the player away from the
      // door and time how long it takes to auto-close.
      var closedAtTick = null;
      var MAX_TICKS = Math.round(2.5 / DT);
      for (var w = 0; w < MAX_TICKS && closedAtTick === null; w++) {
        engine.player.x = 2; // keep the player away from the door this whole time
        engine.player.y = 2;
        engine.tick({ moveX: 0, moveY: 0 });
        if (!engine.world.isDoorOpen("zpDoor")) closedAtTick = w;
      }
      assert(closedAtTick !== null, "expected the door to eventually auto-close after re-entry, within 2.5s");
      var closedAfterS = (closedAtTick + 1) * DT;
      assert(
        closedAfterS > 0.5 && closedAfterS < 2.0,
        "expected the door to close ~1s after re-entry (countdown RESUMED from where it was frozen, not reset to a fresh 3s and not already expired), got " +
          closedAfterS.toFixed(2) + "s"
      );
    } finally {
      delete Game.ZONES.zpDoorA;
      delete Game.ZONES.zpDoorB;
    }
  },
});
