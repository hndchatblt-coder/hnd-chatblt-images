// tests/boxChaff.test.js — headless assertions for the cardboard box, ration,
// and chaff-grenade item set: the BOX/RATION/CHAFF VERB wiring in
// src/engine.js, the extended Game.createInventory() shape in src/items.js,
// the additive hudModel.item/status fields in src/hud.js, and the chaff-jam
// signal in src/radar.js's radarModel. Same registry pattern as every other
// tests/*.js file: push onto the shared Game.selfTests list; test.js runs
// every entry and reports ok/FAIL with real exit codes. Follows
// tests/cqc.test.js's own conventions (real engines, teleport-a-guard/
// teleport-the-player tricks, a dedicated low-level harness for scenarios
// too fiddly to script through a full engine).
//
// loader unified cycle 30 — see test.js LOGIC_ORDER

const Game = global.Game;
const DT = 1 / 60;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function approx(a, b, eps) {
  return Math.abs(a - b) < eps;
}

// ---- 1. Box toggle: edge-triggered, holding the key doesn't re-toggle -----

Game.selfTests.push({
  name: "box: B toggles inventory.boxOn on a fresh edge; holding it does not re-toggle",
  fn: function () {
    var engine = Game.createEngine();
    assert(engine.inventory.boxOn === false, "expected boxOn false on a fresh engine");

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
    assert(engine.inventory.boxOn === true, "expected boxOn true after the B edge");

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
    assert(engine.inventory.boxOn === true, "expected boxOn to stay true while B is held (no re-toggle)");

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: false });
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
    assert(engine.inventory.boxOn === false, "expected a fresh B edge to toggle boxOn back off");
  },
});

// ---- 2. Box toggle blocked while dragging ----------------------------------

Game.selfTests.push({
  name: "box: B is a no-op while engine.dragging is set",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "sleeper-box-drag", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    engine.guards[0].tranq(true);
    engine.player.x = 20.5;
    engine.player.y = 5;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(engine.dragging === "sleeper-box-drag", "setup failed: drag never attached");

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
    assert(engine.inventory.boxOn === false, "expected the box toggle to be swallowed while dragging");
  },
});

// ---- 3. Box toggle blocked while hidden in a locker ------------------------

Game.selfTests.push({
  name: "box: B is a no-op while engine.playerHidden is true",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var locker = zone.lockers[0];
    var engine = Game.createEngine({ zoneData: zone });
    engine.player.x = locker.x;
    engine.player.y = locker.y;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(engine.playerHidden === true, "setup failed: player never hid");

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
    assert(engine.inventory.boxOn === false, "expected the box toggle to be swallowed while hidden");
  },
});

// ---- 4. G-key interactions are entirely blocked while boxed ---------------

Game.selfTests.push({
  name: "box: G (drag attach / locker hide) is entirely a no-op while boxOn",
  fn: function () {
    // 4a. Drag attach blocked.
    var dragEngine = Game.createEngine({
      guardConfigs: [{ id: "sleeper-boxed-g", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    dragEngine.guards[0].tranq(true);
    dragEngine.player.x = 20.5;
    dragEngine.player.y = 5;
    dragEngine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
    assert(dragEngine.inventory.boxOn === true, "setup failed: box never toggled on");

    dragEngine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(dragEngine.dragging === null, "expected G (attach) to be a no-op while boxed");

    // 4b. Locker hide blocked.
    var zone = Game.ZONES.loadingDock;
    var locker = zone.lockers[0];
    var hideEngine = Game.createEngine({ zoneData: zone });
    hideEngine.player.x = locker.x;
    hideEngine.player.y = locker.y;
    hideEngine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
    assert(hideEngine.inventory.boxOn === true, "setup failed: box never toggled on");

    hideEngine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(hideEngine.playerHidden === false, "expected G (hide) to be a no-op while boxed");
  },
});

// ---- 5. Box speed cap ~0.55x, measured against an unboxed baseline ---------

Game.selfTests.push({
  name: "box: reduces player speed to ~0.55x, measured over 60 ticks against a baseline",
  fn: function () {
    var boxEngine = Game.createEngine();
    boxEngine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
    assert(boxEngine.inventory.boxOn === true, "setup failed: box never toggled on");

    var startX = boxEngine.player.x;
    for (var i = 0; i < 60; i++) {
      boxEngine.tick({ moveX: 1, moveY: 0, run: false, stance: "stand", box: true });
    }
    var boxedDisplacement = boxEngine.player.x - startX;

    var baselineEngine = Game.createEngine();
    var startXb = baselineEngine.player.x;
    for (var j = 0; j < 60; j++) {
      baselineEngine.tick({ moveX: 1, moveY: 0, run: false, stance: "stand" });
    }
    var baselineDisplacement = baselineEngine.player.x - startXb;

    assert(baselineDisplacement > 0, "setup failed: baseline player never moved");
    var ratio = boxedDisplacement / baselineDisplacement;
    assert(
      Math.abs(ratio - 0.55) < 0.02,
      "expected boxed/baseline displacement ratio ~0.55, got " + ratio.toFixed(4) +
        " (boxed=" + boxedDisplacement.toFixed(3) + ", baseline=" + baselineDisplacement.toFixed(3) + ")"
    );
  },
});

// ---- helpers for the vision-discount tests (6, 7) --------------------------
// loadingDock's y=2 band is documented (see src/world.js) as clear of every
// obstacle ("NW corner (above all obstacles for clear north leg)") -- guard
// spawns at (10,2) facing a waypoint far to the east so it never "arrives"
// and its facing self-corrects to ~due-east every tick (dy stays exactly 0
// since the waypoint shares guard.y); re-pinning guard.x/y/facing and
// player.x/y before every tick.tick() call holds the geometry exactly fixed
// at dist=5m, isolating "does boxOn's visionProfile override work" from any
// patrol-movement drift.
function pinnedBoxEngine() {
  return Game.createEngine({
    guardConfigs: [{ id: "tg-box-vision", spawn: { x: 10, y: 2 }, waypoints: [{ x: 10000, y: 2 }] }],
  });
}

function pin(engine) {
  var g = engine.guards[0];
  g.x = 10;
  g.y = 2;
  g.facing = 0;
  engine.player.y = 2;
}

// ---- 6. Boxed + stationary in front of a guard at 5m: meter stays low -----

Game.selfTests.push({
  name: "box: boxed + stationary at 5m in a guard's cone keeps the meter under SUSPICIOUS_AT over 5s",
  fn: function () {
    var engine = pinnedBoxEngine();
    var g = engine.guards[0];
    pin(engine);
    engine.player.x = 15; // 5m due east of the guard, dead in its cone

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
    assert(engine.inventory.boxOn === true, "setup failed: box never toggled on");

    var maxTicks = Math.round(5 / DT);
    for (var i = 0; i < maxTicks; i++) {
      pin(engine);
      engine.player.x = 15;
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
      assert(
        g.state === "PATROL",
        "expected the guard to stay PATROL while the boxed player is stationary, tick " + i + " state=" + g.state
      );
    }
    assert(
      g.meter < Game.VISION.SUSPICIOUS_AT,
      "expected meter to stay under SUSPICIOUS_AT (" + Game.VISION.SUSPICIOUS_AT + ") after 5s, got " + g.meter
    );
  },
});

// ---- 7. Boxed + moving in front of a guard at 5m: SUSPICIOUS within ~2s ----

Game.selfTests.push({
  name: "box: boxed + moving at 5m in a guard's cone reaches SUSPICIOUS within ~2s (no discount while moving)",
  fn: function () {
    var engine = pinnedBoxEngine();
    var g = engine.guards[0];
    pin(engine);
    engine.player.x = 15;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
    assert(engine.inventory.boxOn === true, "setup failed: box never toggled on");

    var maxTicks = Math.round(2 / DT);
    var reachedAt = null;
    for (var i = 0; i < maxTicks; i++) {
      pin(engine);
      engine.player.x = 15;
      // moveX nonzero -> player.moving true -> BOX PERCEPTION drops to a flat
      // 1.0 (no discount) regardless of the tiny actual displacement, which
      // pin() overwrites back to x=15 every tick anyway (see file header).
      engine.tick({ moveX: 1, moveY: 0, run: false, stance: "stand", box: true });
      if (g.state === "SUSPICIOUS" || g.state === "INVESTIGATE") {
        reachedAt = i;
        break;
      }
    }
    assert(
      reachedAt !== null,
      "expected the guard to notice the boxed-but-moving player within 2s, final state=" + g.state + " meter=" + g.meter
    );
  },
});

// ---- 8. Ration: heals +0.35 capped at 1, decrements count ------------------

Game.selfTests.push({
  name: "ration: heals +0.35 (capped at 1), decrements inventory.rations, reports post-heal hp",
  fn: function () {
    var engine = Game.createEngine();
    engine.player.hp = 0.5;
    var rationsBefore = engine.inventory.rations;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: true });
    var events = engine.events.filter(function (e) { return e.type === "ration"; });
    assert(events.length === 1, "expected exactly one ration event, got " + JSON.stringify(engine.events));
    assert(approx(events[0].hp, 0.85, 1e-9), "expected reported hp 0.85, got " + events[0].hp);
    assert(approx(engine.player.hp, 0.85, 1e-9), "expected player.hp 0.85, got " + engine.player.hp);
    assert(engine.inventory.rations === rationsBefore - 1, "expected rations decremented by exactly 1");

    // Cap at 1: fresh edge, hp close to full.
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: false });
    engine.player.hp = 0.9;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: true });
    assert(approx(engine.player.hp, 1, 1e-9), "expected hp capped at 1, got " + engine.player.hp);
  },
});

// ---- 9. Ration: no-op at full hp (rations untouched, no event) -------------

Game.selfTests.push({
  name: "ration: pressing R at full hp is a no-op -- no event, rations untouched",
  fn: function () {
    var engine = Game.createEngine();
    assert(engine.player.hp === 1, "setup failed: expected full hp on a fresh engine");
    var rationsBefore = engine.inventory.rations;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: true });
    var events = engine.events.filter(function (e) { return e.type === "ration"; });
    assert(events.length === 0, "expected no ration event at full hp, got " + JSON.stringify(engine.events));
    assert(engine.inventory.rations === rationsBefore, "expected rations untouched at full hp");
  },
});

// ---- 10. Ration: counts down to 0, then a further press is a no-op --------

Game.selfTests.push({
  name: "ration: counts down to 0 across successive uses, then a further press is a no-op",
  fn: function () {
    var engine = Game.createEngine();
    var total = Game.ITEMS.STARTING_RATIONS;
    for (var i = 0; i < total; i++) {
      engine.player.hp = 0.1; // never full, so every press actually consumes one
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: false }); // fresh edge next tick
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: true });
    }
    assert(engine.inventory.rations === 0, "expected rations at 0 after " + total + " uses, got " + engine.inventory.rations);

    engine.player.hp = 0.1;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: false });
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: true });
    var events = engine.events.filter(function (e) { return e.type === "ration"; });
    assert(events.length === 0, "expected no-op at 0 rations, got " + JSON.stringify(engine.events));
    assert(engine.inventory.rations === 0, "expected rations to stay at 0, got " + engine.inventory.rations);
  },
});

// ---- 11. Chaff: radarModel jams while the timer is live, unjams after 15s --

Game.selfTests.push({
  name: "chaff: radarModel reads jammed+chaffActive (phaseJam false) while the CHAFF_S timer is live, unjams after",
  fn: function () {
    var engine = Game.createEngine();
    assert(engine.squad.phase === "INFILTRATION", "setup failed: expected squad.phase INFILTRATION");

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", chaff: true });
    var chaffEvents = engine.events.filter(function (e) { return e.type === "chaff"; });
    assert(chaffEvents.length === 1, "expected exactly one chaff event, got " + JSON.stringify(engine.events));

    var model = Game.radarModel(engine);
    assert(model.jammed === true, "expected jammed true right after the chaff pop");
    assert(model.chaffActive === true, "expected chaffActive true right after the chaff pop");
    assert(model.phaseJam === false, "expected phaseJam false -- squad never left INFILTRATION");

    // Park the player far off-map so no guard can possibly gain LOS and
    // flip squad.phase mid-wait -- isolates "does the CHAFF_S timer itself
    // expire" from any patrol/vision interaction.
    var justUnder = Math.round((Game.ITEMS.CHAFF_S - 0.1) / DT);
    for (var i = 0; i < justUnder; i++) {
      engine.player.x = -1000;
      engine.player.y = -1000;
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
    }
    var stillJammedModel = Game.radarModel(engine);
    assert(stillJammedModel.jammed === true, "expected still jammed just under CHAFF_S");

    var pastDeadline = Math.round(0.2 / DT);
    for (var j = 0; j < pastDeadline; j++) {
      engine.player.x = -1000;
      engine.player.y = -1000;
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
    }
    var unjammedModel = Game.radarModel(engine);
    assert(unjammedModel.jammed === false, "expected unjammed after CHAFF_S elapsed, got " + JSON.stringify(unjammedModel));
    assert(unjammedModel.chaffActive === false, "expected chaffActive false after CHAFF_S elapsed");
    assert(engine.squad.phase === "INFILTRATION", "expected squad.phase to still read INFILTRATION throughout");
  },
});

// ---- 12. Chaff pop is a sharp noise -- a nearby guard INVESTIGATEs it ------

Game.selfTests.push({
  name: "chaff: the pop is a sharp noise at the player's position -- a nearby guard INVESTIGATEs it",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "tg-chaff-noise", spawn: { x: 5, y: 5 }, waypoints: [{ x: 1005, y: 5 }] }],
    });
    // 3m from the guard -- within the chaff pop's 4m unattenuated radius,
    // clear open floor (west of the guard hut at x:9-15).
    engine.player.x = 8;
    engine.player.y = 5;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", chaff: true });
    var chaffEvents = engine.events.filter(function (e) { return e.type === "chaff"; });
    assert(chaffEvents.length === 1, "expected exactly one chaff event, got " + JSON.stringify(engine.events));

    var heardStrong = engine.events.some(function (e) {
      return e.type === "noiseHeard" && e.guardId === "tg-chaff-noise" && e.strength === "strong";
    });
    assert(heardStrong, "expected the guard to have heard the chaff pop as a strong noise, got " + JSON.stringify(engine.events));
    assert(
      engine.guards[0].state === "INVESTIGATE",
      "expected the guard to INVESTIGATE the chaff pop immediately, got " + engine.guards[0].state
    );
  },
});

// ---- 13. Chaff: counts down to 0, then a further press is a no-op ---------

Game.selfTests.push({
  name: "chaff: counts down to 0 across successive uses, then a further press is a no-op",
  fn: function () {
    var engine = Game.createEngine();
    var total = Game.ITEMS.STARTING_CHAFF;
    for (var i = 0; i < total; i++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", chaff: false }); // fresh edge next tick
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", chaff: true });
    }
    assert(engine.inventory.chaff === 0, "expected chaff at 0 after " + total + " uses, got " + engine.inventory.chaff);

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", chaff: false });
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", chaff: true });
    var events = engine.events.filter(function (e) { return e.type === "chaff"; });
    assert(events.length === 0, "expected no-op at 0 chaff grenades, got " + JSON.stringify(engine.events));
    assert(engine.inventory.chaff === 0, "expected chaff to stay at 0, got " + engine.inventory.chaff);
  },
});

// ---- 14. HUD: item box shows RATION xN, tracking consumption --------------

Game.selfTests.push({
  name: "hud: item box shows RATION count, tracking consumption across a ration use",
  fn: function () {
    var engine = Game.createEngine();
    var freshModel = Game.hudModel(engine);
    assert(
      freshModel.item.name === "RATION" && freshModel.item.count === Game.ITEMS.STARTING_RATIONS,
      "expected fresh item shape {RATION, " + Game.ITEMS.STARTING_RATIONS + "}, got " + JSON.stringify(freshModel.item)
    );

    engine.player.hp = 0.5;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: true });
    var afterModel = Game.hudModel(engine);
    assert(
      afterModel.item.count === Game.ITEMS.STARTING_RATIONS - 1,
      "expected item count decremented to " + (Game.ITEMS.STARTING_RATIONS - 1) + ", got " + afterModel.item.count
    );
  },
});

if (typeof module !== "undefined") module.exports = {};
