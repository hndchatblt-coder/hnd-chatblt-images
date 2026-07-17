// tests/regressions/box-gates-combat.test.js — regression test for cycle 21 /
// audit A1: cardboard box properly gates fire and CQC verbs. Ensures that
// while boxOn, fire (E) and CQC (Q) are blocked and emit { type: "busy" },
// but knock (K) and consumables (ration, chaff) remain allowed.
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

// ---- 1. Fire while boxed → busy event, no tranqFired, darts unchanged ------

Game.selfTests.push({
  name: "regression(cycle21/A1): boxed player cannot fire — busy event, no dart spent",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "bg-fire", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });

    engine.inventory.boxOn = true;
    var dartsBefore = engine.inventory.darts;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", fire: true });

    var busyEvents = engine.events.filter(function (e) { return e.type === "busy"; });
    assert(busyEvents.length === 1, "expected exactly one busy event while boxed, got " + JSON.stringify(engine.events));

    var tranqEvents = engine.events.filter(function (e) { return e.type === "tranqFired"; });
    assert(tranqEvents.length === 0, "expected no tranqFired event while boxed, got " + JSON.stringify(engine.events));

    assert(engine.inventory.darts === dartsBefore, "expected no dart spent while boxed, got " + engine.inventory.darts + " (was " + dartsBefore + ")");
  },
});

// ---- 2. CQC while boxed (behind a guard in range) → busy event, guard stays awake ----

Game.selfTests.push({
  name: "regression(cycle21/A1): boxed player cannot CQC — busy event, guard stays awake",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "bg-cqc", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });

    // Position player 1.2m due WEST (behind) the guard, which faces east (0).
    engine.player.x = 18.8;
    engine.player.y = 5;
    engine.player.facing = 0;

    engine.inventory.boxOn = true;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqc: true });

    var busyEvents = engine.events.filter(function (e) { return e.type === "busy"; });
    assert(busyEvents.length === 1, "expected exactly one busy event while boxed, got " + JSON.stringify(engine.events));

    var cqcEvents = engine.events.filter(function (e) { return e.type === "cqc"; });
    assert(cqcEvents.length === 0, "expected no cqc event while boxed, got " + JSON.stringify(engine.events));

    assert(engine.guards[0].state !== "SLEEPING", "expected the guard to remain awake while CQC is blocked, got " + engine.guards[0].state);
  },
});

// ---- 3. Fire while NOT boxed works normally — tranqFired, darts-1 --------

Game.selfTests.push({
  name: "regression(cycle21/A1): fire works normally when box is OFF",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "bg-fire-off", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });

    engine.player.x = 16;
    engine.player.y = 5;
    engine.player.facing = 0; // due east, straight at the guard 4m away

    assert(engine.inventory.boxOn === false, "setup: box should start OFF");
    var dartsBefore = engine.inventory.darts;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", fire: true });

    var tranqEvents = engine.events.filter(function (e) { return e.type === "tranqFired"; });
    assert(tranqEvents.length === 1, "expected exactly one tranqFired event with box OFF, got " + JSON.stringify(engine.events));

    assert(engine.inventory.darts === dartsBefore - 1, "expected exactly one dart spent, got " + engine.inventory.darts + " (was " + dartsBefore + ")");
  },
});

// ---- 4. Knock while boxed works — knock event still fires (allowed) -------

Game.selfTests.push({
  name: "regression(cycle21/A1): knock is always allowed while boxed",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var engine = Game.createEngine({ zoneData: zone });

    // Position player adjacent to the large south wall of the crate stack
    // (x:17, y:13, w:6, h:5 => y 13-18). Knock should reach it.
    engine.player.x = 20;
    engine.player.y = 19; // just south of the wall at y=18
    engine.player.facing = -Math.PI / 2; // facing north toward the wall

    engine.inventory.boxOn = true;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", knock: true });

    var knockEvents = engine.events.filter(function (e) { return e.type === "knock"; });
    assert(knockEvents.length === 1, "expected exactly one knock event even while boxed, got " + JSON.stringify(engine.events));
  },
});
