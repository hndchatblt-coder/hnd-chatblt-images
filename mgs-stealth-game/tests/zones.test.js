// tests/zones.test.js — headless assertions for the two-zone world (Game.ZONES)
// and the zone-transition machinery in src/engine.js. Same registry pattern as
// tests/world.test.js / tests/engine.test.js: push onto the shared
// Game.selfTests list; test.js runs every entry and reports ok/FAIL with real
// exit codes.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var DT = 1 / 60;

// Same leg-clearance technique as tests/world.test.js test #9 ("every
// consecutive waypoint leg is walkably clear (r=0.6 sampled)"), generalized
// to run over EVERY waypoint loop (`waypoints` and, where present,
// `waypoints2`) in EVERY zone in Game.ZONES — the sanity test in world.test.js
// only ever checked loadingDock.waypoints.
function assertLoopClear(world, loopName, waypoints) {
  assert(waypoints.length >= 3, loopName + ": expected at least 3 waypoints for a loop, got " + waypoints.length);

  for (var i = 0; i < waypoints.length; i++) {
    var a = waypoints[i];
    var b = waypoints[(i + 1) % waypoints.length];
    var legLabel = loopName + " leg " + i + " (" + i + "->" + ((i + 1) % waypoints.length) + ")";

    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var legLen = Math.sqrt(dx * dx + dy * dy);
    var samples = Math.ceil(legLen / 0.25);

    for (var s = 0; s <= samples; s++) {
      var t = samples > 0 ? s / samples : 0;
      var px = a.x + dx * t;
      var py = a.y + dy * t;
      assert(
        !world.isBlockedCircle(px, py, 0.6),
        legLabel + " blocked at sample (" + px.toFixed(2) + "," + py.toFixed(2) + ")"
      );
    }

    var hit = world.raycast(a.x, a.y, b.x, b.y);
    assert(
      hit === null,
      legLabel + " raycast hit at (" + (hit ? hit.x.toFixed(2) : "?") + "," + (hit ? hit.y.toFixed(2) : "?") + ")"
    );
  }
}

// 1. Every patrol loop (waypoints, and waypoints2 where present) in every
// zone is walkably clear at r=0.6 — the general form of world.test.js's
// single-zone/single-loop sanity check.
Game.selfTests.push({
  name: "zones: every waypoint loop in every zone is walkably clear (r=0.6 sampled)",
  fn: function () {
    var zoneIds = Object.keys(Game.ZONES);
    assert(zoneIds.length >= 2, "expected at least 2 zones, got " + zoneIds.length);

    zoneIds.forEach(function (zoneId) {
      var zone = Game.ZONES[zoneId];
      var world = Game.createWorld(zone);
      assertLoopClear(world, zoneId + ".waypoints", zone.waypoints);
      if (zone.waypoints2) {
        assertLoopClear(world, zoneId + ".waypoints2", zone.waypoints2);
      }
    });
  },
});

// 2. exit/exits back-compat: zone.exit is always exactly exits[0], on both
// zones — hud/radar/render/pre-existing scenarios all read zone.exit and must
// keep working verbatim.
Game.selfTests.push({
  name: "zones: zone.exit alias === zone.exits[0] on every zone",
  fn: function () {
    Object.keys(Game.ZONES).forEach(function (zoneId) {
      var zone = Game.ZONES[zoneId];
      assert(Array.isArray(zone.exits) && zone.exits.length >= 1, zoneId + ": expected a non-empty exits array");
      assert(zone.exit === zone.exits[0], zoneId + ": zone.exit must be === zone.exits[0]");
    });
  },
});

// 3. entrances/exits well-formed: every exit's `to` + entranceKey resolve to
// an actual spawn point on the target zone, EXCEPT the documented "extraction"
// TERMINAL. KNOWN_STUBS used to be the list of not-yet-built zone ids this
// cycle's Game.ZONES was allowed to point at without resolving (see
// src/engine.js's zoneBlocked handling) — PREMISE EXPIRED this cycle (win-
// state): the Comms Tower's own north exit, "extraction", was the last live
// entry in that list (see the git history of this file for the earlier
// Laboratory-stub/commsTower-stub eras), and this cycle's src/engine.js
// change (see its own MISSION STATS / EXTRACTION / RANK contract) turns
// "extraction" from "a zone some future cycle will build" into a PERMANENT
// TERMINAL that tryZoneTransition() special-cases BEFORE ever consulting
// Game.ZONES at all — it is not a stub waiting to be resolved, it is the
// mission's actual end, and Game.ZONES.extraction is expected to NEVER
// exist. So: KNOWN_STUBS is now permanently empty (kept, not deleted, so a
// future genuine stub has an obvious place to land again), and the
// well-formedness check below carves out "extraction" as its own named
// exception rather than routing it through the KNOWN_STUBS mechanism.
var KNOWN_STUBS = [];
Game.selfTests.push({
  name: "zones: every exit's to+entranceKey resolves (except the extraction terminal)",
  fn: function () {
    Object.keys(Game.ZONES).forEach(function (zoneId) {
      var zone = Game.ZONES[zoneId];
      zone.exits.forEach(function (exit, i) {
        var label = zoneId + ".exits[" + i + "]";
        assert(typeof exit.to === "string" && exit.to.length > 0, label + ": missing `to`");
        assert(typeof exit.entranceKey === "string" && exit.entranceKey.length > 0, label + ": missing `entranceKey`");

        if (exit.to === "extraction") {
          // TERMINAL, not a zone — see src/engine.js's tryZoneTransition,
          // which resolves this specially (completeMission()) before ever
          // looking it up in Game.ZONES. Nothing further to check here.
          return;
        }

        var targetZone = Game.ZONES[exit.to];
        assert(targetZone, label + ": unresolvable `to` (not a real zone, not the extraction terminal): " + exit.to);

        var entrance = targetZone.entrances && targetZone.entrances[exit.entranceKey];
        assert(
          entrance && typeof entrance.x === "number" && typeof entrance.y === "number",
          label + ": entranceKey '" + exit.entranceKey + "' does not resolve on " + exit.to + ".entrances"
        );

        var targetWorld = Game.createWorld(targetZone);
        assert(
          !targetWorld.isBlocked(entrance.x, entrance.y),
          label + ": resolved entrance (" + entrance.x + "," + entrance.y + ") on " + exit.to + " is blocked"
        );
      });
    });

    // PREMISE EXPIRY (see comment above): this cycle's own change is exactly
    // what emptied KNOWN_STUBS, so assert that expiry stays true rather than
    // silently accepting a KNOWN_STUBS list quietly regrowing without this
    // test itself being reconsidered — a future cycle that adds a REAL stub
    // must go through the same "documented terminal vs. genuine placeholder"
    // decision this comment block just walked through, not just append to
    // the array.
    assert(KNOWN_STUBS.length === 0, "expected no known stubs left this cycle (extraction is now a terminal, not a stub)");
  },
});

// 4. Engine transition: drive the player into loadingDock's north exit while
// INFILTRATION -> zoneChange event, engine.zone becomes warehouse, player
// lands at warehouse.entrances.fromLoadingDock, 2 guards, fresh squad.
Game.selfTests.push({
  name: "engine zone transition: crossing loadingDock's north exit during INFILTRATION enters warehouse",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var warehouse = Game.ZONES.warehouse;
    var engine = Game.createEngine({ seed: 1, zoneData: dock });

    assert(engine.squad.phase === "INFILTRATION", "setup: expected fresh engine to start INFILTRATION");

    engine.player.x = dock.exit.x + dock.exit.w / 2;
    engine.player.y = dock.exit.y + dock.exit.h / 2;
    engine.player.stance = "crouch";
    engine.player.facing = 1.23; // arbitrary nonzero facing to verify preservation

    engine.tick({ moveX: 0, moveY: 0, stance: "crouch" });

    var zoneChangeEvents = engine.events.filter(function (e) {
      return e.type === "zoneChange";
    });
    assert(zoneChangeEvents.length === 1, "expected exactly one zoneChange event, got " + zoneChangeEvents.length);
    assert(zoneChangeEvents[0].from === "loadingDock", "expected zoneChange.from === loadingDock");
    assert(zoneChangeEvents[0].to === "warehouse", "expected zoneChange.to === warehouse");

    assert(engine.zone.id === "warehouse", "expected engine.zone to be warehouse, got " + engine.zone.id);
    assert(engine.snapshot().zoneId === "warehouse", "expected snapshot().zoneId === warehouse");

    var entrance = warehouse.entrances.fromLoadingDock;
    assert(
      engine.player.x === entrance.x && engine.player.y === entrance.y,
      "expected player at warehouse.entrances.fromLoadingDock, got " + JSON.stringify({ x: engine.player.x, y: engine.player.y })
    );
    assert(engine.player.stance === "crouch", "expected player stance preserved across the transition");
    assert(engine.player.facing === 1.23, "expected player facing preserved across the transition");

    assert(engine.guards.length === 2, "expected 2 guards in warehouse, got " + engine.guards.length);
    var ids = engine.guards.map(function (g) {
      return g.id;
    });
    assert(ids.indexOf("w1") !== -1 && ids.indexOf("w2") !== -1, "expected warehouse guards w1/w2, got " + JSON.stringify(ids));

    assert(engine.squad.phase === "INFILTRATION", "expected a fresh squad starting INFILTRATION, got " + engine.squad.phase);
    assert(engine.squad.alertCount === 0, "expected a fresh squad with alertCount 0, got " + engine.squad.alertCount);

    // A further tick in the new zone should just work (world/vision/guards
    // fully wired for warehouse).
    engine.tick({ moveX: 0, moveY: 0 });
    assert(engine.zone.id === "warehouse", "expected engine to keep ticking fine in warehouse");
  },
});

// 5. No zone-changing mid-alert: teleport the player next to a guard until
// ALERT fires, then stand in the exit region for 60 ticks -- still
// loadingDock the whole time.
Game.selfTests.push({
  name: "engine zone transition: no transition during ALERT (stand in exit region while ALERT)",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var engine = Game.createEngine({
      seed: 1,
      zoneData: dock,
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
    assert(reachedAlert, "setup failed: squad never reached ALERT");

    // Now stand in the exit trigger region for 60 ticks. squad.phase will
    // most likely be leaving ALERT (the player is no longer near the exit's
    // sightline) but the whole point is it's never INFILTRATION-and-in-the-
    // exit at the same moment as a successful cross, since the transition
    // must not happen until the squad is fully stood down AND even then only
    // takes effect the tick the player is actually in the region again.
    engine.player.x = dock.exit.x + dock.exit.w / 2;
    engine.player.y = dock.exit.y + dock.exit.h / 2;
    for (var i = 0; i < 60; i++) {
      engine.tick({ moveX: 0, moveY: 0, stance: "stand" });
      engine.player.x = dock.exit.x + dock.exit.w / 2;
      engine.player.y = dock.exit.y + dock.exit.h / 2;
      assert(
        engine.zone.id === "loadingDock",
        "expected to stay in loadingDock while ALERT/EVASION/CAUTION, left at tick " + i + " (phase=" + engine.squad.phase + ")"
      );
    }
  },
});

// 6. Round trip: loadingDock -> warehouse -> loadingDock.
Game.selfTests.push({
  name: "engine zone transition: round trip loadingDock -> warehouse -> loadingDock",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var warehouse = Game.ZONES.warehouse;
    var engine = Game.createEngine({ seed: 2, zoneData: dock });

    engine.player.x = dock.exit.x + dock.exit.w / 2;
    engine.player.y = dock.exit.y + dock.exit.h / 2;
    engine.tick();
    assert(engine.zone.id === "warehouse", "expected warehouse after the first crossing, got " + engine.zone.id);

    var southExit = warehouse.exits[0]; // to: loadingDock
    assert(southExit.to === "loadingDock", "setup: expected warehouse.exits[0] to lead back to loadingDock");
    engine.player.x = southExit.x + southExit.w / 2;
    engine.player.y = southExit.y + southExit.h / 2;
    engine.tick();

    assert(engine.zone.id === "loadingDock", "expected loadingDock again after the return crossing, got " + engine.zone.id);
    var backEvents = engine.events.filter(function (e) {
      return e.type === "zoneChange";
    });
    assert(backEvents.length === 1 && backEvents[0].from === "warehouse" && backEvents[0].to === "loadingDock", "expected exactly one warehouse->loadingDock zoneChange, got " + JSON.stringify(backEvents));

    var entrance = dock.entrances.fromWarehouse;
    assert(
      engine.player.x === entrance.x && engine.player.y === entrance.y,
      "expected player at loadingDock.entrances.fromWarehouse"
    );
    assert(engine.guards.length === 1 && engine.guards[0].id === "g1", "expected the single default loadingDock guard g1 back");
  },
});

// 7. Extraction terminal: standing in the Comms Tower's north exit while
// INFILTRATION emits missionComplete exactly once and freezes the engine
// (tick() becomes a no-op, same FROZEN ENGINE contract as gameOver).
// REPOINTED this cycle (win-state): this test used to exercise the
// zoneBlocked mechanic against this exact same exit, back when "extraction"
// was still an ordinary unresolved stub — src/engine.js's tryZoneTransition
// now special-cases exit.to === "extraction" as a PERMANENT TERMINAL BEFORE
// it ever reaches the zoneBlocked branch (see test #3's KNOWN_STUBS note
// above and src/engine.js's own MISSION STATS / EXTRACTION / RANK contract),
// so the old "zoneBlocked fires" premise is no longer true by design — this
// is the "replace with a stricter test" the old premise's expiry calls for,
// not a deletion (see tests/winState.test.js for the fuller rank/stats
// coverage this same terminal now also gets).
Game.selfTests.push({
  name: "engine zone transition: extraction terminal emits missionComplete once and freezes the engine",
  fn: function () {
    var tower = Game.ZONES.commsTower;
    var engine = Game.createEngine({ seed: 3, zoneData: tower });

    var northExit = tower.exits[0]; // to: extraction
    assert(northExit.to === "extraction", "setup: expected commsTower.exits[0] to be the extraction terminal");

    engine.player.x = northExit.x + northExit.w / 2;
    engine.player.y = northExit.y + northExit.h / 2;
    // The extraction trigger sits directly up the helipad-approach camera's
    // own facing line (see src/world.js's commsTower cameras comment) --
    // crawl keeps visionProfile() at its lowest multiplier (0.3) so this
    // test's ticks stay nowhere near VISION.ALERT_AT (a camera reaching it
    // would flip squad.phase off INFILTRATION and starve tryZoneTransition
    // of the very phase it needs to evaluate this trigger at all -- see
    // src/engine.js's DESIGN RULE) -- this test is about the missionComplete
    // mechanic, not about surviving the camera, so the setup deliberately
    // removes that variable rather than relying on sweep timing.
    engine.player.stance = "crawl";

    assert(engine.missionComplete === false, "expected fresh engine.missionComplete false");

    engine.tick({ moveX: 0, moveY: 0 });

    assert(engine.missionComplete === true, "expected engine.missionComplete true after standing in the extraction trigger");
    assert(engine.zone.id === "commsTower", "expected no zone switch to have happened, got zone " + engine.zone.id);
    var completeEvents = engine.events.filter(function (e) {
      return e.type === "missionComplete";
    });
    assert(completeEvents.length === 1, "expected exactly 1 missionComplete event, got " + completeEvents.length);
    assert(typeof completeEvents[0].rank === "string" && completeEvents[0].rank.length > 0, "expected a non-empty rank string on the missionComplete event");
    assert(completeEvents[0].stats && typeof completeEvents[0].stats.alertsTotal === "number", "expected a stats object on the missionComplete event");

    var frozenTickCount = engine.tickCount;
    var frozenEventsLength = engine.events.length;
    for (var i = 0; i < 30; i++) {
      engine.tick({ moveX: 1, moveY: 1 }); // even a movement input must be a total no-op while frozen
    }
    assert(engine.tickCount === frozenTickCount, "expected tickCount to freeze, got " + engine.tickCount + " vs " + frozenTickCount);
    assert(engine.events.length === frozenEventsLength, "expected engine.events to stay exactly as the completing tick left it");
    assert(engine.zone.id === "commsTower", "expected the frozen engine to still report commsTower");
  },
});

// 8. Determinism across a transition: two engines, same seed + identical
// scripted inputs driving the player across a real zone crossing ->
// identical snapshot() at the end.
Game.selfTests.push({
  name: "engine zone transition: determinism holds across a real zone crossing",
  fn: function () {
    function scriptedInput(tick) {
      return {
        moveX: Math.sin(tick * 0.041),
        moveY: Math.cos(tick * 0.029),
        run: tick % 11 === 0,
        stance: tick % 150 < 50 ? "crouch" : "stand",
      };
    }

    function runCrossing(seed) {
      var engine = Game.createEngine({ seed: seed });
      var dock = Game.ZONES.loadingDock;
      for (var t = 0; t < 200; t++) {
        engine.tick(scriptedInput(t));
      }
      // Force the crossing deterministically (identical direct teleport on
      // both engines) rather than relying on the scripted walk to find the
      // gap, then let a further identical scripted run play out post-switch.
      // The crossing tick itself uses zero movement input so player.update()
      // doesn't walk the teleported position off the exit trigger before
      // engine.js's end-of-tick zone-transition check reads it.
      engine.player.x = dock.exit.x + dock.exit.w / 2;
      engine.player.y = dock.exit.y + dock.exit.h / 2;
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
      // Confirm the crossing actually happened (setup validity) BEFORE the
      // further scripted ticks below, which may wander the player back and
      // forth across the (nearby) warehouse south exit one or more times --
      // that's fine and expected for a small random walk landing 1m from its
      // own return trigger; it's exactly the kind of churn this test wants
      // to prove stays deterministic, not something to prevent.
      if (engine.zone.id !== "warehouse") {
        throw new Error("setup failed: expected engine to have crossed into warehouse right after the crossing tick");
      }
      for (var t2 = 201; t2 < 400; t2++) {
        engine.tick(scriptedInput(t2));
      }
      return engine;
    }

    var a = runCrossing(999);
    var b = runCrossing(999);

    var snapA = JSON.stringify(a.snapshot());
    var snapB = JSON.stringify(b.snapshot());
    assert(snapA === snapB, "expected identical snapshots across a transition for identical seed+input, got:\n" + snapA + "\nvs\n" + snapB);
  },
});
