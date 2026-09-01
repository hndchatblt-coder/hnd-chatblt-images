// tests/saveState.test.js — headless assertions for src/saveState.js's
// capture()/restore() cycle. Same registry pattern as every other tests/*.js
// file: push onto the shared Game.selfTests list; test.js runs every entry
// headless, and boot.js runs the SAME list in-browser before the title
// screen — so every test here must be environment-portable (no Date.now/
// Math.random reliance, deterministic seeds/scripted input only).
//
// THE REPLAY GATE (tests 2/3 below) is the actual point of this whole
// module: a save is only correct if resuming it is byte-identical to never
// having saved at all. See src/saveState.js's own file header for the full
// write-up of what that means and why every module's getState()/setState()
// pair was iterated against exactly this proof.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var DT = 1 / 60;

function scriptedInput(tick) {
  return {
    moveX: Math.sin(tick * 0.037),
    moveY: Math.cos(tick * 0.051),
    run: tick % 7 === 0,
    stance: tick % 200 < 60 ? "crouch" : tick % 200 < 120 ? "crawl" : "stand",
  };
}

// A busier scripted log than scriptedInput() above — also presses knock/cqc
// on scattered edges, so the REPLAY GATE exercises the edge-triggered verb
// bookkeeping (prevKnock/prevCqc/etc — see src/engine.js's getState() note)
// as well as plain movement.
function mixedInput(tick) {
  return {
    moveX: Math.sin(tick * 0.021),
    moveY: Math.cos(tick * 0.013),
    run: tick % 11 === 0,
    stance: tick % 150 < 50 ? "crouch" : tick % 150 < 90 ? "crawl" : "stand",
    knock: tick % 97 === 0,
    cqc: tick % 133 === 0,
  };
}

// ---- 1. Basic round-trip: capture -> JSON -> restore -> identical snapshot,
// no ticking at all (proves the save itself is JSON-safe AND that restore()
// alone, with zero further simulation, reconstructs an equivalent engine).

Game.selfTests.push({
  name: "saveState: capture -> JSON round-trip -> restore -> snapshot() equals original immediately",
  fn: function () {
    var engine = Game.createEngine({ seed: 42 });
    for (var i = 0; i < 90; i++) engine.tick(scriptedInput(i));

    var saveState = Game.createSaveState();
    var save = saveState.capture(engine);

    // JSON round-trip: prove the captured object is plain-data safe (no
    // functions, no NaN/Infinity, no circular refs) by actually serializing
    // and re-parsing it, same as src/boot.js's localStorage save will do.
    var reparsed = JSON.parse(JSON.stringify(save));

    var restored = saveState.restore(reparsed);

    var beforeSnap = JSON.stringify(engine.snapshot());
    var afterSnap = JSON.stringify(restored.snapshot());
    assert(
      beforeSnap === afterSnap,
      "expected restored engine's snapshot to equal the original's immediately after restore:\n" +
        beforeSnap +
        "\nvs\n" +
        afterSnap
    );
  },
});

// ---- 2. THE REPLAY GATE (calm): 300 ticks of ordinary patrol-adjacent
// input, save, then 300 MORE ticks of scripted input on both the original
// (still-ticking) engine and a freshly restored one -> identical final
// snapshots.

Game.selfTests.push({
  name: "saveState REPLAY GATE (calm): save mid-patrol, 300 more ticks vs restore+same ticks -> identical snapshot",
  fn: function () {
    var engineA = Game.createEngine({ seed: 777 });
    for (var t = 0; t < 300; t++) engineA.tick(scriptedInput(t));

    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engineA)));

    for (t = 300; t < 600; t++) engineA.tick(scriptedInput(t));

    var engineB = saveState.restore(save);
    for (t = 300; t < 600; t++) engineB.tick(scriptedInput(t));

    var snapA = JSON.stringify(engineA.snapshot());
    var snapB = JSON.stringify(engineB.snapshot());
    assert(
      snapA === snapB,
      "calm replay gate diverged:\nA=" + snapA + "\nB=" + snapB
    );
  },
});

// ---- 3. THE REPLAY GATE (chaos): drive to ALERT, tranq a guard, open a
// keyed door (Laboratory), pop chaff, save MID-EVASION, then 600 ticks of
// busier mixed input on both sides -> identical snapshots. This is the test
// that finds every missed closure var (see src/guardAI.js's getState()
// comment for the full list this once caught: pausing/pauseTime/
// pauseBaseFacing, searching/searchTime/searchBaseFacing, sweeping/
// sweepTime/sweepBaseFacing/sweepOffset, fireTimer/nextFireAt, sleepTime/
// staggerActive/staggerElapsed/bodySpotTimers, lockerFacing).

Game.selfTests.push({
  name: "saveState REPLAY GATE (chaos): ALERT + tranq + door + chaff, save mid-EVASION, 600 mixed ticks -> identical snapshot",
  fn: function () {
    var lab = Game.ZONES.laboratory;
    var engineA = Game.createEngine({ zoneData: lab, seed: 99 });

    var g1 = engineA.guards[0];

    // Drive guard g1 into ALERT by parking the player 1m in front of it,
    // every tick, until its meter confirms sight.
    engineA.player.x = g1.x + 1;
    engineA.player.y = g1.y;
    engineA.player.facing = Math.atan2(g1.y - engineA.player.y, g1.x - engineA.player.x);

    var reachedAlert = false;
    for (var i = 0; i < 400 && !reachedAlert; i++) {
      engineA.tick();
      engineA.player.x = g1.x + 1;
      engineA.player.y = g1.y;
      if (engineA.squad.phase === "ALERT") reachedAlert = true;
    }
    assert(reachedAlert, "setup failed: squad never reached ALERT");

    // TRANQ a guard (headshot rule: squad is ALERT, so this staggers rather
    // than instantly sleeping it — exercises staggerActive/staggerElapsed).
    engineA.player.facing = Math.atan2(g1.y - engineA.player.y, g1.x - engineA.player.x);
    engineA.tick({ fire: true });

    // OPEN A DOOR: grant the L1 keycard directly (flat mutable prop, see
    // src/items.js contract) and walk up to doorL1 (center ~(20, 17.5)).
    engineA.inventory.keycards.L1 = true;
    engineA.player.x = 20;
    engineA.player.y = 17.4;
    engineA.tick();
    assert(engineA.world.isDoorOpen("doorL1"), "setup failed: doorL1 never opened");

    // POP CHAFF.
    engineA.tick({ chaff: true });
    assert(engineA.chaffUntil > engineA.time, "setup failed: chaff never armed");

    // Break contact (run far away) so the squad decays into EVASION.
    var reachedEvasion = false;
    for (i = 0; i < 200 && !reachedEvasion; i++) {
      engineA.tick({ moveX: -1, moveY: 0 });
      if (engineA.squad.phase === "EVASION") reachedEvasion = true;
    }
    assert(reachedEvasion, "setup failed: squad never decayed into EVASION");

    // SAVE mid-evasion, mid-chaff-jam, mid-stagger-or-post-tranq, door ajar.
    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engineA)));
    assert(save.squad.phase === "EVASION", "expected to capture mid-EVASION, got " + save.squad.phase);

    for (var t = 0; t < 600; t++) engineA.tick(mixedInput(t));

    var engineB = saveState.restore(save);
    for (t = 0; t < 600; t++) engineB.tick(mixedInput(t));

    var snapA = JSON.stringify(engineA.snapshot());
    var snapB = JSON.stringify(engineB.snapshot());
    assert(
      snapA === snapB,
      "chaos replay gate diverged:\nA=" + snapA + "\nB=" + snapB
    );
  },
});

// ---- 4. Save in the Warehouse (zone 2) restores to the Warehouse with the
// correct guard roster (ids/positions/states) and camera coverage.

Game.selfTests.push({
  name: "saveState: save in warehouse restores to warehouse with correct guards/cameras",
  fn: function () {
    var engine = Game.createEngine({ zoneData: Game.ZONES.warehouse, seed: 3 });
    for (var i = 0; i < 90; i++) engine.tick(scriptedInput(i));

    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engine)));
    assert(save.zoneId === "warehouse", "expected zoneId 'warehouse', got " + save.zoneId);

    var restored = saveState.restore(save);
    assert(restored.zone.id === "warehouse", "expected restored engine in warehouse, got " + restored.zone.id);

    assert(
      restored.guards.length === engine.guards.length,
      "expected " + engine.guards.length + " guards, got " + restored.guards.length
    );
    for (i = 0; i < engine.guards.length; i++) {
      var orig = engine.guards[i];
      var rg = restored.guards[i];
      assert(rg.id === orig.id, "guard " + i + " id mismatch: " + rg.id + " vs " + orig.id);
      assert(rg.x === orig.x && rg.y === orig.y, "guard " + rg.id + " position mismatch");
      assert(rg.state === orig.state, "guard " + rg.id + " state mismatch: " + rg.state + " vs " + orig.state);
    }

    var origCams = engine.director.cameraStates();
    var restCams = restored.director.cameraStates();
    assert(origCams.length > 0, "expected the warehouse to have camera coverage for this test to mean anything");
    assert(
      restCams.length === origCams.length,
      "expected " + origCams.length + " cameras, got " + restCams.length
    );
    for (i = 0; i < origCams.length; i++) {
      assert(
        JSON.stringify(restCams[i]) === JSON.stringify(origCams[i]),
        "camera " + i + " state mismatch: " + JSON.stringify(restCams[i]) + " vs " + JSON.stringify(origCams[i])
      );
    }
  },
});

// ---- 5. A sleeping guard restored 20s into its 60s sleep wakes ~40s after
// restore (the REMAINING time, not a fresh 60s window).

Game.selfTests.push({
  name: "saveState: a sleeping guard saved 20s in wakes ~40s after restore (remaining SLEEP_S)",
  fn: function () {
    var engine = Game.createEngine({ zoneData: Game.ZONES.loadingDock, seed: 5 });
    engine.player.x = -1000;
    engine.player.y = -1000;
    engine.guards[0].tranq(true); // headshot -> instantly SLEEPING
    assert(engine.guards[0].state === "SLEEPING", "setup failed: guard never slept");

    var TICKS_20S = Math.round(20 / DT);
    for (var i = 0; i < TICKS_20S; i++) {
      engine.tick();
      engine.player.x = -1000;
      engine.player.y = -1000;
    }
    assert(engine.guards[0].state === "SLEEPING", "setup failed: guard woke too early");

    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engine)));
    var restored = saveState.restore(save);
    assert(restored.guards[0].state === "SLEEPING", "expected restored guard still SLEEPING");

    var wokeAtTick = null;
    var MAX = Math.round(60 / DT);
    for (i = 0; i < MAX && wokeAtTick === null; i++) {
      restored.tick();
      restored.player.x = -1000;
      restored.player.y = -1000;
      if (restored.guards[0].state === "INVESTIGATE") wokeAtTick = i;
    }

    assert(wokeAtTick !== null, "restored guard never woke into INVESTIGATE");
    var wokeAfterS = wokeAtTick * DT;
    var expectedS = Game.GUARD.SLEEP_S - 20; // 40s remaining
    assert(
      Math.abs(wokeAtTick - Math.round(expectedS / DT)) <= 2,
      "expected wake ~" + expectedS + "s after restore, got " + wokeAfterS.toFixed(3) + "s"
    );
  },
});

// ---- 6. Chaff popped, saved partway through its jam window, expires at the
// correct REMAINING time after restore (verified via a camera's `disabled`
// flag, which gates directly off chaffUntil > time — see src/director.js).

Game.selfTests.push({
  name: "saveState: chaff popped then saved mid-jam expires at the correct remaining time after restore",
  fn: function () {
    var engine = Game.createEngine({ zoneData: Game.ZONES.warehouse, seed: 5 });
    engine.tick({ chaff: true });
    assert(engine.chaffUntil > engine.time, "setup failed: chaff never armed");
    assert(engine.director.cameraStates()[0].disabled === true, "setup failed: camera should be jammed");

    var TICKS_5S = Math.round(5 / DT);
    for (var i = 0; i < TICKS_5S; i++) engine.tick();
    assert(engine.director.cameraStates()[0].disabled === true, "setup failed: chaff expired before save");

    var remainingS = engine.chaffUntil - engine.time;

    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engine)));
    var restored = saveState.restore(save);
    assert(
      Math.abs(restored.chaffUntil - restored.time - remainingS) < 1e-9,
      "expected restored engine's remaining chaff time to match captured value"
    );
    assert(restored.director.cameraStates()[0].disabled === true, "expected restored camera still jammed");

    var flippedAtTick = null;
    var MAX = Math.round(15 / DT);
    for (i = 0; i < MAX && flippedAtTick === null; i++) {
      restored.tick();
      if (restored.director.cameraStates()[0].disabled === false) flippedAtTick = i;
    }

    assert(flippedAtTick !== null, "restored camera never un-jammed");
    var flippedAfterS = flippedAtTick * DT;
    assert(
      Math.abs(flippedAtTick - Math.round(remainingS / DT)) <= 2,
      "expected chaff to expire ~" + remainingS.toFixed(3) + "s after restore, got " + flippedAfterS.toFixed(3) + "s"
    );
  },
});

// ---- 7. Version tag: restore() rejects a save with the wrong version.

Game.selfTests.push({
  name: "saveState: restore() throws a clear error on a version mismatch",
  fn: function () {
    var engine = Game.createEngine({ seed: 1 });
    var saveState = Game.createSaveState();
    var save = saveState.capture(engine);
    save.version = save.version + 1000; // deliberately wrong

    var threw = false;
    var message = "";
    try {
      saveState.restore(save);
    } catch (e) {
      threw = true;
      message = String(e && e.message || e);
    }
    assert(threw, "expected restore() to throw on a version mismatch");
    assert(
      /version/i.test(message),
      "expected a clear version-mismatch error message, got: " + message
    );
  },
});

// ---- 8. Door auto-close timer resumes from its REMAINING time, not a fresh
// DOOR_AUTO_CLOSE_S window, and not instantly closed either.

Game.selfTests.push({
  name: "saveState: an open door's auto-close timer resumes at the correct remaining time after restore",
  fn: function () {
    var lab = Game.ZONES.laboratory;
    var engine = Game.createEngine({ zoneData: lab, seed: 5 });
    engine.inventory.keycards.L1 = true;

    // Walk up to doorL1 (AABB x:18,y:17,w:4,h:1 -> center (20, 17.5)) to badge
    // it open, then step away so the DOOR_AUTO_CLOSE_S countdown starts.
    engine.player.x = 20;
    engine.player.y = 17.4;
    engine.tick();
    assert(engine.world.isDoorOpen("doorL1"), "setup failed: doorL1 never opened");

    engine.player.x = 5;
    engine.player.y = 25;
    var TICKS_1_5S = Math.round(1.5 / DT);
    for (var i = 0; i < TICKS_1_5S; i++) engine.tick();
    assert(engine.world.isDoorOpen("doorL1"), "setup failed: door closed before the save (auto-close is 3s)");

    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engine)));
    var restored = saveState.restore(save);
    assert(restored.world.isDoorOpen("doorL1"), "expected restored door still open");

    var closedAtTick = null;
    var MAX = Math.round(5 / DT);
    for (i = 0; i < MAX && closedAtTick === null; i++) {
      restored.tick();
      restored.player.x = 5;
      restored.player.y = 25;
      if (!restored.world.isDoorOpen("doorL1")) closedAtTick = i;
    }

    assert(closedAtTick !== null, "restored door never auto-closed");
    var closedAfterS = closedAtTick * DT;
    var expectedS = 1.5; // 3s auto-close minus the 1.5s already elapsed before save
    assert(
      Math.abs(closedAtTick - Math.round(expectedS / DT)) <= 2,
      "expected door to auto-close ~" + expectedS + "s after restore, got " + closedAfterS.toFixed(3) + "s"
    );
  },
});

// ---- 9. Mission-scoped pickup state survives a restore: an already-
// collected keycard never respawns/re-collects after restore.

Game.selfTests.push({
  name: "saveState: an already-collected pickup stays collected after restore (never re-grants)",
  fn: function () {
    var engine = Game.createEngine({ zoneData: Game.ZONES.warehouse, seed: 5 });
    var pickup = Game.ZONES.warehouse.pickups[0]; // { x: 4, y: 7, item: "keycardL1" }

    engine.player.x = pickup.x;
    engine.player.y = pickup.y;
    engine.tick();
    assert(engine.inventory.keycards.L1 === true, "setup failed: keycard never collected");

    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engine)));
    var restored = saveState.restore(save);
    assert(restored.inventory.keycards.L1 === true, "expected restored inventory to keep the collected keycard");

    // Walking over the same spot again on the restored engine must NOT
    // re-collect it (collectedPickups must have survived the restore) or
    // push a second `pickup` event.
    restored.player.x = pickup.x;
    restored.player.y = pickup.y;
    restored.tick();
    var pickupEvents = restored.events.filter(function (e) {
      return e.type === "pickup";
    });
    assert(pickupEvents.length === 0, "expected no re-collection pickup event, got " + JSON.stringify(pickupEvents));
  },
});
