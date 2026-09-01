// tests/cqc.test.js — headless assertions for CQC takedowns, body-dragging,
// and lockers: the CQC/DRAG/LOCKER verbs wired into src/engine.js, the new
// guard.cqc()/guard.stuffInLocker()/guard.hidden surface in src/guardAI.js,
// and the additive hudModel.status field in src/hud.js. Same registry
// pattern as every other tests/*.js file: push onto the shared
// Game.selfTests list; test.js runs every entry and reports ok/FAIL with
// real exit codes. Follows tests/tranq.test.js's own conventions (real
// engines, the same teleport-a-guard/teleport-the-player tricks, and the
// same guard-level harness for scenarios too fiddly to script through a
// full engine).
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

function farPlayer() {
  return { x: -1000, y: -1000, visionProfile: function () { return 1.0; } };
}

// ---- 1. CQC from behind sleeps the guard + emits a faint thud noise -------

Game.selfTests.push({
  name: "cqc: a takedown from behind sleeps the guard immediately and emits a faint thud a bystander hears",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [
        { id: "tg-cqc", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }, // facing due east (0)
        { id: "bystander-cqc", spawn: { x: 22, y: 6 }, waypoints: [{ x: 1022, y: 6 }] },
      ],
    });
    // 1.2m due WEST of the guard -- directly behind its east-facing cone.
    engine.player.x = 18.8;
    engine.player.y = 5;
    engine.player.facing = 0;

    assert(engine.squad.phase === "INFILTRATION", "setup: squad should still be INFILTRATION");

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqc: true });

    var cqcEvents = engine.events.filter(function (e) { return e.type === "cqc"; });
    assert(cqcEvents.length === 1, "expected exactly one cqc event, got " + JSON.stringify(engine.events));
    assert(cqcEvents[0].guardId === "tg-cqc", "expected guardId 'tg-cqc', got " + cqcEvents[0].guardId);
    assert(engine.guards[0].state === "SLEEPING", "expected the CQC'd guard to be SLEEPING immediately, got " + engine.guards[0].state);

    var heardFaint = engine.events.some(function (e) {
      return e.type === "noiseHeard" && e.guardId === "bystander-cqc" && e.strength === "faint";
    });
    assert(heardFaint, "expected the bystander to have heard the CQC thud as a faint noise, got " + JSON.stringify(engine.events));
  },
});

// ---- 2. CQC from the front fails: cqcMiss, guard stays awake --------------

Game.selfTests.push({
  name: "cqc: attempting a takedown from the front (not behind) misses -- cqcMiss, guard stays awake",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "tg-front", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    // 1.2m due EAST of the guard -- squarely in front of its east-facing cone.
    engine.player.x = 21.2;
    engine.player.y = 5;
    engine.player.facing = Math.PI;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqc: true });

    var cqcEvents = engine.events.filter(function (e) { return e.type === "cqc"; });
    assert(cqcEvents.length === 0, "expected no cqc event from the front, got " + JSON.stringify(engine.events));
    var missEvents = engine.events.filter(function (e) { return e.type === "cqcMiss"; });
    assert(missEvents.length === 1, "expected exactly one cqcMiss event, got " + JSON.stringify(engine.events));
    assert(engine.guards[0].state !== "SLEEPING", "expected the guard to remain awake, got " + engine.guards[0].state);
  },
});

// ---- 3. CQC is blocked entirely while squad.phase is ALERT ----------------

Game.selfTests.push({
  name: "cqc: blocked outright while squad.phase is ALERT, even at point-blank range",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "tg-alert-cqc", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });

    var reachedAlert = false;
    for (var i = 0; i < 240 && !reachedAlert; i++) {
      engine.player.x = 22;
      engine.player.y = 5;
      engine.tick();
      if (engine.squad.phase === "ALERT") reachedAlert = true;
    }
    assert(reachedAlert, "setup failed: squad never reached ALERT");

    // Let the guard close the distance toward ARREST_DIST (well inside the
    // 2.5m cqcMiss feedback range) before attempting the takedown.
    for (var j = 0; j < 120; j++) {
      engine.tick();
      engine.player.x = 22;
      engine.player.y = 5;
    }
    assert(engine.squad.phase === "ALERT", "setup failed: squad fell out of ALERT before the attempt");

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqc: true });

    var cqcEvents = engine.events.filter(function (e) { return e.type === "cqc"; });
    assert(cqcEvents.length === 0, "expected CQC to be blocked during ALERT, got " + JSON.stringify(engine.events));
    assert(engine.guards[0].state !== "SLEEPING", "expected the guard to remain unaffected, got " + engine.guards[0].state);
  },
});

// ---- 4. CQC is silent (no event at all) when no guard is within range -----

Game.selfTests.push({
  name: "cqc: silent (no cqc, no cqcMiss) when no guard is within the 2.5m feedback range",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "tg-far", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    engine.player.x = -500;
    engine.player.y = -500;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqc: true });

    var relevant = engine.events.filter(function (e) { return e.type === "cqc" || e.type === "cqcMiss"; });
    assert(relevant.length === 0, "expected zero cqc/cqcMiss events when far from every guard, got " + JSON.stringify(engine.events));
  },
});

// ---- 5. Drag attach: guard follows ~0.9m behind the player ----------------

Game.selfTests.push({
  name: "drag: attaching to a sleeping guard makes it follow ~0.9m behind the player every tick",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "sleeper-drag", spawn: { x: 21, y: 25 }, waypoints: [{ x: 1021, y: 25 }] }],
    });
    engine.guards[0].tranq(true); // headshot -> instantly SLEEPING
    assert(engine.guards[0].state === "SLEEPING", "setup failed: guard should be SLEEPING");

    engine.player.x = 20;
    engine.player.y = 25;
    engine.player.facing = 0;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(engine.dragging === "sleeper-drag", "expected engine.dragging === 'sleeper-drag', got " + engine.dragging);

    for (var i = 0; i < 30; i++) {
      engine.tick({ moveX: 1, moveY: 0, run: false, stance: "stand" });
      var expectedX = engine.player.x - Math.cos(engine.player.facing) * 0.9;
      var expectedY = engine.player.y - Math.sin(engine.player.facing) * 0.9;
      assert(
        Math.abs(engine.guards[0].x - expectedX) < 1e-6 && Math.abs(engine.guards[0].y - expectedY) < 1e-6,
        "tick " + i + ": expected dragged guard at (" + expectedX + "," + expectedY + "), got (" + engine.guards[0].x + "," + engine.guards[0].y + ")"
      );
      var followDist = dist(engine.player.x, engine.player.y, engine.guards[0].x, engine.guards[0].y);
      assert(Math.abs(followDist - 0.9) < 1e-6, "expected follow distance ~0.9m, got " + followDist);
    }
  },
});

// ---- 6. Drag halves (0.55x) player speed ----------------------------------

Game.selfTests.push({
  name: "drag: reduces player speed to ~0.55x, measured over 60 ticks against an undragged baseline",
  fn: function () {
    var dragEngine = Game.createEngine({
      guardConfigs: [{ id: "sleeper-speed", spawn: { x: 21, y: 25 }, waypoints: [{ x: 1021, y: 25 }] }],
    });
    dragEngine.guards[0].tranq(true);
    dragEngine.player.x = 20;
    dragEngine.player.y = 25;
    dragEngine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(dragEngine.dragging === "sleeper-speed", "setup failed: drag never attached");

    var startX = dragEngine.player.x;
    for (var i = 0; i < 60; i++) {
      dragEngine.tick({ moveX: 1, moveY: 0, run: false, stance: "stand" });
    }
    var draggedDisplacement = dragEngine.player.x - startX;

    var baselineEngine = Game.createEngine({
      guardConfigs: [{ id: "sleeper-speed-b", spawn: { x: 21, y: 25 }, waypoints: [{ x: 1021, y: 25 }] }],
    });
    baselineEngine.player.x = 20;
    baselineEngine.player.y = 25;
    var startXb = baselineEngine.player.x;
    for (var j = 0; j < 60; j++) {
      baselineEngine.tick({ moveX: 1, moveY: 0, run: false, stance: "stand" });
    }
    var baselineDisplacement = baselineEngine.player.x - startXb;

    assert(baselineDisplacement > 0, "setup failed: baseline player never moved");
    var ratio = draggedDisplacement / baselineDisplacement;
    assert(
      Math.abs(ratio - 0.55) < 0.02,
      "expected dragged/baseline displacement ratio ~0.55, got " + ratio.toFixed(4) +
        " (dragged=" + draggedDisplacement.toFixed(3) + ", baseline=" + baselineDisplacement.toFixed(3) + ")"
    );
  },
});

// ---- 7. Release drops the guard where it was --------------------------

Game.selfTests.push({
  name: "drag: pressing G again away from a locker releases -- the guard stays exactly where it was dropped",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "sleeper-release", spawn: { x: 21, y: 25 }, waypoints: [{ x: 1021, y: 25 }] }],
    });
    engine.guards[0].tranq(true);
    engine.player.x = 20;
    engine.player.y = 25;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(engine.dragging === "sleeper-release", "setup failed: drag never attached");

    for (var i = 0; i < 20; i++) {
      engine.tick({ moveX: 1, moveY: 0, run: false, stance: "stand" });
    }

    // Release: another G edge, well clear of any locker (loadingDock's
    // lockers sit at x~2, far from this eastward walk).
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(engine.dragging === null, "expected engine.dragging cleared to null after release, got " + engine.dragging);

    var droppedX = engine.guards[0].x;
    var droppedY = engine.guards[0].y;

    for (var j = 0; j < 30; j++) {
      engine.tick({ moveX: 1, moveY: 0, run: false, stance: "stand" });
    }

    assert(
      engine.guards[0].x === droppedX && engine.guards[0].y === droppedY,
      "expected the released guard to stay put at (" + droppedX + "," + droppedY + "), got (" + engine.guards[0].x + "," + engine.guards[0].y + ")"
    );
  },
});

// ---- 8. Firing while dragging is blocked (busy event, no dart spent) ------

Game.selfTests.push({
  name: "drag: firing while dragging is blocked -- busy event, no dart spent, drag unaffected",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "sleeper-busy", spawn: { x: 21, y: 25 }, waypoints: [{ x: 1021, y: 25 }] }],
    });
    engine.guards[0].tranq(true);
    engine.player.x = 20;
    engine.player.y = 25;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(engine.dragging === "sleeper-busy", "setup failed: drag never attached");

    var dartsBefore = engine.inventory.darts;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", fire: true });

    var busyEvents = engine.events.filter(function (e) { return e.type === "busy"; });
    assert(busyEvents.length === 1, "expected exactly one busy event, got " + JSON.stringify(engine.events));
    var tranqEvents = engine.events.filter(function (e) { return e.type === "tranqFired"; });
    assert(tranqEvents.length === 0, "expected no tranqFired event while dragging, got " + JSON.stringify(engine.events));
    assert(engine.inventory.darts === dartsBefore, "expected no dart spent while dragging, got " + engine.inventory.darts);
    assert(engine.dragging === "sleeper-busy", "expected drag to remain attached, got " + engine.dragging);
  },
});

// ---- 9. Stuffing a body into a locker sets hidden -- exempt from colleague
//         discovery even under a watching guard's clear, sustained sight ---

Game.selfTests.push({
  name: "locker: a stuffed body is hidden=true and exempt from colleague-discovery even under direct sustained sight",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(1);
    var squad = Game.createSquad();

    var sleeper = Game.createGuard({
      world: world, vision: vision, rng: rng,
      spawn: { x: 20, y: 28 }, waypoints: [{ x: 1020, y: 28 }],
      id: "body-locker-1", squad: squad,
    });
    sleeper.tranq(true);
    assert(sleeper.state === "SLEEPING", "setup failed: sleeper should be SLEEPING");

    var locker = { x: 14, y: 28, facing: 0 };
    sleeper.stuffInLocker(locker);
    assert(sleeper.hidden === true, "expected sleeper.hidden true after stuffInLocker");
    assert(sleeper.x === locker.x && sleeper.y === locker.y, "expected sleeper repositioned to the locker");

    var watcher = Game.createGuard({
      world: world, vision: vision, rng: rng,
      spawn: { x: 10, y: 28 }, waypoints: [{ x: 1010, y: 28 }],
      id: "watcher-locker-1", squad: squad,
    }); // facing 0 (+x): the locker sits 4m dead ahead, well inside BODY_SPOT_RANGE

    var player = farPlayer();
    var MAX_TICKS = Math.round(5 / DT); // well past BODY_SPOT_CONFIRM_S (0.5s)
    for (var i = 0; i < MAX_TICKS; i++) {
      var sleepingList = [{ id: sleeper.id, x: sleeper.x, y: sleeper.y, hidden: sleeper.hidden }];
      watcher.update(DT, { player: player, sleepingGuards: sleepingList });
      sleeper.update(DT, { player: player, sleepingGuards: sleepingList });
      squad.tick(DT, watcher.hasLOS || sleeper.hasLOS);
      assert(squad.alertCount === 0, "expected zero alerts (hidden exemption) at tick " + i);
      assert(watcher.state !== "ALERT", "expected watcher to never enter ALERT while the body is hidden, tick " + i);
    }
  },
});

// ---- 10. Hiding the player in a locker gates guard perception -------------

Game.selfTests.push({
  name: "locker: hiding the player gates guard perception -- meter stays 0 despite a guard with clear LOS",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var locker = zone.lockers[0]; // {x:2, y:9, facing:0}
    var engine = Game.createEngine({
      zoneData: zone,
      guardConfigs: [{ id: "watcher-hide", spawn: { x: 6, y: 9 }, waypoints: [{ x: 6, y: 9 }] }],
    });
    engine.guards[0].facing = Math.PI; // facing due west, straight down the line to the locker

    engine.player.x = locker.x;
    engine.player.y = locker.y;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true }); // G near a locker, not dragging -> HIDE
    assert(engine.playerHidden === true, "expected playerHidden true after hiding, got " + engine.playerHidden);

    for (var i = 0; i < 300; i++) { // 5s
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
      assert(engine.guards[0].meter === 0, "expected meter pinned at 0 while hidden, tick " + i + " got " + engine.guards[0].meter);
      assert(engine.guards[0].hasLOS === false, "expected hasLOS false against the decoy while hidden, tick " + i);
    }
  },
});

// ---- 11. Exiting the locker restores normal perception --------------------

Game.selfTests.push({
  name: "locker: exiting restores normal perception -- a nearby guard can detect the player again",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var locker = zone.lockers[0]; // {x:2, y:9, facing:0}
    var engine = Game.createEngine({
      zoneData: zone,
      guardConfigs: [{ id: "watcher-exit", spawn: { x: 6, y: 9 }, waypoints: [{ x: 6, y: 9 }] }],
    });
    engine.guards[0].facing = Math.PI;

    engine.player.x = locker.x;
    engine.player.y = locker.y;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true }); // HIDE
    assert(engine.playerHidden === true, "setup failed: player never hid");

    // A few ticks hidden, to prove the gate was actually engaged.
    for (var i = 0; i < 30; i++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
    }
    assert(engine.guards[0].meter === 0, "setup failed: meter should still read 0 while hidden");

    // Exit: another G edge while playerHidden always means EXIT.
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(engine.playerHidden === false, "expected playerHidden false after exiting, got " + engine.playerHidden);
    // Stepped out 1m east along the locker's facing (0).
    assert(
      Math.abs(engine.player.x - (locker.x + 1)) < 0.2 && Math.abs(engine.player.y - locker.y) < 0.2,
      "expected the player to step out ~1m along the locker's facing, got (" + engine.player.x + "," + engine.player.y + ")"
    );

    // Now stand close in front of the guard's own facing and confirm
    // detection resumes (meter rises above 0 again).
    var meterRose = false;
    for (var j = 0; j < 180 && !meterRose; j++) {
      var g = engine.guards[0];
      engine.player.x = g.x + Math.cos(g.facing) * 2;
      engine.player.y = g.y + Math.sin(g.facing) * 2;
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
      if (engine.guards[0].meter > 0) meterRose = true;
    }
    assert(meterRose, "expected the guard's meter to rise above 0 once perception was restored");
  },
});

// ---- 12. Waking a hidden (stuffed) guard steps it out of the locker -------

Game.selfTests.push({
  name: "locker: a hidden guard wakes after SLEEP_S, steps out of the locker, and resumes as INVESTIGATE",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(1);
    var guard = Game.createGuard({
      world: world, vision: vision, rng: rng,
      spawn: { x: 20, y: 5 }, waypoints: zone.waypoints,
      id: "sleeper-locker-wake",
    });

    guard.tranq(true);
    var locker = { x: 20, y: 5, facing: 0 };
    guard.stuffInLocker(locker);
    assert(guard.hidden === true, "setup failed: guard should be hidden after stuffInLocker");

    var player = farPlayer();
    var wokeAtTick = null;
    var TOTAL_TICKS = Math.round((Game.GUARD.SLEEP_S + 5) / DT);
    for (var i = 0; i < TOTAL_TICKS && wokeAtTick === null; i++) {
      guard.update(DT, { player: player });
      if (guard.state === "INVESTIGATE") wokeAtTick = i;
    }

    assert(wokeAtTick !== null, "guard never woke into INVESTIGATE");
    assert(guard.hidden === false, "expected guard.hidden false after waking, got " + guard.hidden);
    var steppedDist = dist(guard.x, guard.y, locker.x, locker.y);
    assert(steppedDist > 0.5, "expected the guard to have stepped clear of the locker, only moved " + steppedDist + "m");
    assert(steppedDist < 1.5, "expected the step to be roughly 1m, got " + steppedDist + "m");
    // Stepped east (locker.facing === 0).
    assert(guard.x > locker.x, "expected the guard to step out east of the locker, got x=" + guard.x);
  },
});

// ---- 13. hudModel.status is additive -- item box is a separate field ------

Game.selfTests.push({
  name: "hud: status reflects DRAGGING/HIDDEN additively -- the item box is a field DRAGGING/HIDDEN never touch",
  fn: function () {
    if (typeof require !== "undefined") require("../src/hud.js");

    // NOTE (box/chaff/ration cycle): the three item.name/item.count
    // assertions below originally read `item.name === "---" && item.count
    // === null` (the pre-items-cycle placeholder). That premise is now
    // factually wrong -- src/items.js's Game.createInventory() now starts
    // with a real ration count, and src/hud.js's own contract requires
    // hudModel.item = {name:"RATION", count: rations} whenever
    // engine.inventory exists (see its file header). Per CLAUDE.md's ratchet
    // rule 2 ("a wrong test is replaced by a stricter one"), the SAME
    // sanctioned replacement tests/hud.test.js's fresh-engine assertion just
    // got is applied here too -- driven off Game.ITEMS.STARTING_RATIONS so it
    // can't drift from the tunable. This test's actual subject (status stays
    // additive -- DRAGGING/HIDDEN never mutate the item box) is UNCHANGED;
    // only the item box's own expected shape is updated to match reality.
    var freshEngine = Game.createEngine();
    var freshModel = Game.hudModel(freshEngine);
    assert(freshModel.status === null, "expected status null on a fresh engine, got " + freshModel.status);
    assert(
      freshModel.item.name === "RATION" && freshModel.item.count === Game.ITEMS.STARTING_RATIONS,
      "expected real item shape {RATION, " + Game.ITEMS.STARTING_RATIONS + "}, got " + JSON.stringify(freshModel.item)
    );

    var dragEngine = Game.createEngine({
      guardConfigs: [{ id: "sleeper-hud", spawn: { x: 21, y: 25 }, waypoints: [{ x: 1021, y: 25 }] }],
    });
    dragEngine.guards[0].tranq(true);
    dragEngine.player.x = 20;
    dragEngine.player.y = 25;
    dragEngine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(dragEngine.dragging === "sleeper-hud", "setup failed: drag never attached");
    var dragModel = Game.hudModel(dragEngine);
    assert(dragModel.status === "DRAGGING", "expected status 'DRAGGING', got " + dragModel.status);
    assert(
      dragModel.item.name === "RATION" && dragModel.item.count === Game.ITEMS.STARTING_RATIONS,
      "expected the item box untouched by DRAGGING, got " + JSON.stringify(dragModel.item)
    );

    var zone = Game.ZONES.loadingDock;
    var locker = zone.lockers[0];
    var hideEngine = Game.createEngine({ zoneData: zone });
    hideEngine.player.x = locker.x;
    hideEngine.player.y = locker.y;
    hideEngine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(hideEngine.playerHidden === true, "setup failed: player never hid");
    var hideModel = Game.hudModel(hideEngine);
    assert(hideModel.status === "HIDDEN", "expected status 'HIDDEN', got " + hideModel.status);
    assert(
      hideModel.item.name === "RATION" && hideModel.item.count === Game.ITEMS.STARTING_RATIONS,
      "expected the item box untouched by HIDDEN, got " + JSON.stringify(hideModel.item)
    );
  },
});

if (typeof module !== "undefined") module.exports = {};
