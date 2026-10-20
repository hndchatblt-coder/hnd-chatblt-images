// tests/tranq.test.js — headless assertions for the tranq pistol + sleeping-
// guard mechanics: inventory/dart-shot resolution (src/items.js), the
// SLEEPING guard state + colleague discovery (src/guardAI.js), and the
// engine-level fire-verb wiring (src/engine.js: tranqFired event, dart-impact
// noise, guard.tranq() dispatch). Same registry pattern as every other
// tests/*.js file: push onto the shared Game.selfTests list; test.js runs
// every entry and reports ok/FAIL with real exit codes.
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

// Convenience: fires once on a real engine via a single edge-triggered
// engine.tick({ ..., fire: true }) call and returns the tranqFired events
// pushed that tick (0 or 1 — a tick with no darts left pushes none).
function fireOnce(engine) {
  engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", fire: true });
  return engine.events.filter(function (e) {
    return e.type === "tranqFired";
  });
}

// ---- 1. Inventory: counts down, empty no-fire -----------------------------

Game.selfTests.push({
  name: "tranq: inventory starts at 12 darts, decrements per shot, and reports fired:false at 0",
  fn: function () {
    var inv = Game.createInventory();
    assert(inv.weapon === "tranq", "expected weapon 'tranq', got " + inv.weapon);
    assert(
      inv.darts === Game.ITEMS.STARTING_DARTS,
      "expected " + Game.ITEMS.STARTING_DARTS + " starting darts, got " + inv.darts
    );

    var fakeEngine = {
      player: { x: 0, y: 0, facing: 0 },
      world: { raycast: function () { return null; } },
      guards: [],
    };

    for (var i = 0; i < Game.ITEMS.STARTING_DARTS; i++) {
      var r = inv.fireTranq(fakeEngine);
      assert(r.fired === true, "expected shot " + i + " to fire, darts=" + inv.darts);
    }
    assert(inv.darts === 0, "expected 0 darts left, got " + inv.darts);

    var empty = inv.fireTranq(fakeEngine);
    assert(empty.fired === false, "expected fired:false with no darts left, got " + JSON.stringify(empty));
    assert(Object.keys(empty).length === 1, "expected {fired:false} only, got " + JSON.stringify(empty));
    assert(inv.darts === 0, "expected darts to stay 0 (no dart consumed on an empty attempt)");
  },
});

// ---- 2. A miss travels to the wall, no guardId ----------------------------

Game.selfTests.push({
  name: "tranq: a miss travels to the wall and reports impact there with no guardId",
  fn: function () {
    var engine = Game.createEngine({ seed: 1 });
    // Open south corridor, facing due north (-PI/2) straight at the center
    // crate stack's south face (walls: {x:17,y:13,w:6,h:5} -> y 13-18) — a
    // clean line with no guard anywhere near it (default g1 spawns far NW).
    engine.player.x = 20;
    engine.player.y = 27;
    engine.player.facing = -Math.PI / 2;

    var tranqEvents = fireOnce(engine);
    assert(tranqEvents.length === 1, "expected exactly one tranqFired event, got " + tranqEvents.length);

    var ev = tranqEvents[0];
    assert(ev.hit === false, "expected a miss, got hit=" + ev.hit);
    assert(ev.guardId === undefined, "expected no guardId on a miss, got " + ev.guardId);
    assert(
      Math.abs(ev.impact.x - 20) < 0.05 && Math.abs(ev.impact.y - 18) < 0.05,
      "expected impact at the crate stack's south face ~(20,18), got " + JSON.stringify(ev.impact)
    );
    assert(
      engine.inventory.darts === Game.ITEMS.STARTING_DARTS - 1,
      "expected exactly one dart spent, got " + engine.inventory.darts
    );
  },
});

// ---- 3. A hit on an unaware guard is a headshot -> instant SLEEPING -------

Game.selfTests.push({
  name: "tranq: hitting an unaware (non-ALERT) guard is a headshot -- instant SLEEPING",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "tg-headshot", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    // Clear open-floor line, well clear of the NW guard hut (x9-15,y3-8).
    engine.player.x = 16;
    engine.player.y = 5;
    engine.player.facing = 0; // due east, straight at the guard 4m away

    assert(engine.squad.phase === "INFILTRATION", "setup: squad should still be INFILTRATION (unaware)");

    var tranqEvents = fireOnce(engine);
    assert(tranqEvents.length === 1, "expected exactly one tranqFired event");
    var ev = tranqEvents[0];
    assert(ev.hit === true, "expected a hit, got " + JSON.stringify(ev));
    assert(ev.guardId === "tg-headshot", "expected guardId 'tg-headshot', got " + ev.guardId);
    assert(ev.headshot === true, "expected headshot true (guard was unaware), got " + ev.headshot);

    assert(
      engine.guards[0].state === "SLEEPING",
      "expected the hit guard to be SLEEPING immediately, got " + engine.guards[0].state
    );
  },
});

// ---- 4. A hit during ALERT staggers ~3s before finally sleeping -----------

Game.selfTests.push({
  name: "tranq: hitting a guard already ALERT staggers ~STAGGER_SLEEP_S before it finally sleeps",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "tg-stagger", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    engine.player.x = 22;
    engine.player.y = 5; // 2m ahead of the guard's facing (0) -- fills fast

    var reachedAlert = false;
    for (var i = 0; i < 240 && !reachedAlert; i++) {
      engine.tick();
      engine.player.x = 22;
      engine.player.y = 5;
      if (engine.squad.phase === "ALERT") reachedAlert = true;
    }
    assert(reachedAlert, "setup failed: squad never reached ALERT");

    // Face west, back toward the guard, and fire — a clean 2m hit.
    engine.player.facing = Math.PI;
    var tranqEvents = fireOnce(engine);
    engine.player.x = 22;
    engine.player.y = 5;

    assert(tranqEvents.length === 1, "expected the dart to fire");
    var ev = tranqEvents[0];
    assert(ev.hit === true, "expected a hit, got " + JSON.stringify(ev));
    assert(ev.headshot === false, "expected NOT a headshot (guard already ALERT), got " + ev.headshot);
    assert(
      engine.guards[0].state !== "SLEEPING",
      "expected the guard to keep acting immediately after a stagger hit, got " + engine.guards[0].state
    );

    var wentToSleepAt = null;
    var STAGGER_TICKS = Math.round((Game.GUARD.STAGGER_SLEEP_S + 1) / DT);
    for (var t = 0; t < STAGGER_TICKS && wentToSleepAt === null; t++) {
      engine.tick();
      engine.player.x = 22;
      engine.player.y = 5;
      if (engine.guards[0].state === "SLEEPING") wentToSleepAt = t;
    }
    assert(wentToSleepAt !== null, "guard never fell asleep after the stagger window");
    var seconds = wentToSleepAt * DT;
    assert(
      Math.abs(seconds - Game.GUARD.STAGGER_SLEEP_S) < 0.15,
      "expected sleep at ~" + Game.GUARD.STAGGER_SLEEP_S + "s, got " + seconds.toFixed(2) + "s"
    );
  },
});

// ---- 5. A sleeping guard wakes after SLEEP_S into INVESTIGATE, then PATROL

Game.selfTests.push({
  name: "tranq: a sleeping guard wakes after SLEEP_S into INVESTIGATE, then resumes PATROL",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(1);
    var guard = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: 20, y: 5 },
      waypoints: zone.waypoints,
      id: "sleeper-wake",
    });

    guard.tranq(true); // headshot -> instantly SLEEPING
    assert(guard.state === "SLEEPING", "expected guard asleep immediately after headshot");

    var player = farPlayer();
    var wokeAtTick = null;
    var backToPatrolTick = null;
    var TOTAL_TICKS = Math.round((Game.GUARD.SLEEP_S + Game.GUARD.INVESTIGATE_SEARCH + 10) / DT);
    for (var i = 0; i < TOTAL_TICKS; i++) {
      guard.update(DT, { player: player });
      if (wokeAtTick === null && guard.state === "INVESTIGATE") wokeAtTick = i;
      if (wokeAtTick !== null && backToPatrolTick === null && guard.state === "PATROL") backToPatrolTick = i;
    }

    assert(wokeAtTick !== null, "guard never woke into INVESTIGATE");
    var wokeAtS = wokeAtTick * DT;
    assert(
      Math.abs(wokeAtS - Game.GUARD.SLEEP_S) < 1.0,
      "expected wake at ~" + Game.GUARD.SLEEP_S + "s, got " + wokeAtS.toFixed(2) + "s"
    );
    assert(backToPatrolTick !== null, "guard never resumed PATROL after investigating its own wake-up spot");
  },
});

// ---- 6. A sleeping guard perceives nothing --------------------------------

Game.selfTests.push({
  name: "tranq: a SLEEPING guard perceives nothing -- meter/hasLOS stay 0/false with the player right in front",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(1);
    var guard = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: 20, y: 5 },
      waypoints: [{ x: 1020, y: 5 }],
      id: "sleeper-blind",
    });
    guard.tranq(true);
    assert(guard.state === "SLEEPING", "setup failed: guard should be SLEEPING");

    var player = { x: 22, y: 5, visionProfile: function () { return 1.0; } }; // 2m dead ahead

    for (var i = 0; i < 300; i++) {
      // 5s, well under SLEEP_S -- stays asleep throughout
      guard.update(DT, { player: player });
      assert(guard.meter === 0, "expected meter pinned at 0 while SLEEPING, got " + guard.meter + " at tick " + i);
      assert(guard.hasLOS === false, "expected hasLOS false while SLEEPING, tick " + i);
      assert(guard.state === "SLEEPING", "expected guard to stay SLEEPING, got " + guard.state + " at tick " + i);
    }
  },
});

// ---- 7. Colleague discovery: an awake guard spots a sleeping body ---------

Game.selfTests.push({
  name: "tranq: an awake guard spotting a sleeping colleague's body broadcasts ALERT at the body's position",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(1);
    var squad = Game.createSquad();

    // y=28: verified-clear open-floor row across the whole zone width (same
    // row tests/guardAI-partB.test.js's CAUTION-cone test relies on).
    var sleeper = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: 14, y: 28 },
      waypoints: [{ x: 1014, y: 28 }],
      id: "body-1",
      squad: squad,
    });
    sleeper.tranq(true); // instantly SLEEPING at (14,28)
    assert(sleeper.state === "SLEEPING", "setup failed: sleeper should be SLEEPING");

    var watcher = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: 10, y: 28 },
      waypoints: [{ x: 1010, y: 28 }],
      id: "watcher-1",
      squad: squad,
    }); // facing 0 (+x): the body sits 4m dead ahead, well inside BODY_SPOT_RANGE (10m)

    var sleepingList = [{ id: sleeper.id, x: sleeper.x, y: sleeper.y }];
    var player = farPlayer();

    // NOTE: neither guard has (or ever will have, in this test) live LOS on
    // the PLAYER — squad.tick() legitimately flips ALERT -> EVASION the very
    // same tick a body-found broadcastAlert fires (no live player contact to
    // hold ALERT open, per squad.tick's own contract) — so this checks
    // squad.alertCount (an incident happened) rather than squad.phase still
    // reading "ALERT" by the time this loop's own squad.tick() call runs;
    // watcherWasAlert instead captures watcher.state read RIGHT AFTER its
    // own update() (which is what actually calls broadcastAlert+setState),
    // before this same iteration's squad.tick() has a chance to flip it.
    var broadcastTick = null;
    var watcherWasAlert = false;
    var MAX_TICKS = Math.round(3 / DT);
    for (var i = 0; i < MAX_TICKS && broadcastTick === null; i++) {
      watcher.update(DT, { player: player, sleepingGuards: sleepingList });
      sleeper.update(DT, { player: player, sleepingGuards: sleepingList });
      if (!watcherWasAlert && watcher.state === "ALERT") watcherWasAlert = true;
      squad.tick(DT, watcher.hasLOS || sleeper.hasLOS);
      if (squad.alertCount > 0) broadcastTick = i;
    }

    assert(broadcastTick !== null, "watcher never broadcast an ALERT after spotting the sleeping body");
    assert(watcherWasAlert, "expected the watcher guard to have entered ALERT the tick it broadcast");
    assert(squad.lastKnown !== null, "expected squad.lastKnown to be set");
    assert(
      dist(squad.lastKnown.x, squad.lastKnown.y, sleeper.x, sleeper.y) < 0.01,
      "expected lastKnown at the body's position, got " + JSON.stringify(squad.lastKnown)
    );
  },
});

// ---- 8. Dart-impact noise (a miss) pulls a bystander guard to INVESTIGATE

Game.selfTests.push({
  name: "tranq: a dart's impact noise (a miss) pulls a bystander guard into INVESTIGATE",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "bystander", spawn: { x: 22, y: 20 }, waypoints: [{ x: 1022, y: 20 }] }],
    });
    // Same clean miss as test 2 -- impact lands at ~(20,18), the crate
    // stack's south face, well within the bystander's dartImpact earshot
    // (unattenuated 5m radius; distance ~2.83m, no wall crossed between them).
    engine.player.x = 20;
    engine.player.y = 27;
    engine.player.facing = -Math.PI / 2;

    var tranqEvents = fireOnce(engine);
    assert(
      tranqEvents.length === 1 && tranqEvents[0].hit === false,
      "setup failed: expected a clean miss, got " + JSON.stringify(tranqEvents)
    );

    var heardStrong = engine.events.some(function (e) {
      return e.type === "noiseHeard" && e.guardId === "bystander" && e.strength === "strong";
    });
    assert(heardStrong, "expected the bystander to have heard the dart impact as a strong noise");
    assert(
      engine.guards[0].state === "INVESTIGATE",
      "expected the bystander guard to be INVESTIGATE, got " + engine.guards[0].state
    );
  },
});

// ---- 9. A SLEEPING guard cannot be hit by a follow-up dart ----------------

Game.selfTests.push({
  name: "tranq: a SLEEPING guard is excluded from the hit test -- a follow-up dart passes through as a miss",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "tg-already-asleep", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    engine.guards[0].tranq(true);
    assert(engine.guards[0].state === "SLEEPING", "setup failed: guard should be SLEEPING");

    engine.player.x = 16;
    engine.player.y = 5;
    engine.player.facing = 0; // straight at the sleeping guard, same line as test 3

    var tranqEvents = fireOnce(engine);
    assert(tranqEvents.length === 1, "expected the second dart to fire");
    var ev = tranqEvents[0];
    assert(ev.hit === false, "expected a miss -- a SLEEPING guard cannot be hit, got " + JSON.stringify(ev));
    assert(
      engine.guards[0].state === "SLEEPING",
      "expected the guard to remain SLEEPING, got " + engine.guards[0].state
    );
  },
});
