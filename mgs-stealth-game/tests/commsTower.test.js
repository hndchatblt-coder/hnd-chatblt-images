// tests/commsTower.test.js — headless assertions for the Comms Tower zone,
// the finale (pillar: Tension): registration/schema sanity, the
// Laboratory -> Comms Tower transition, explicit r=0.6 leg-clearance for all
// FOUR patrol loops (tests/zones.test.js's own generalized loop test only
// ever iterates `waypoints`/`waypoints2` — a fixed pair, not a `waypoints*`
// wildcard scan — so waypoints3/waypoints4 get no coverage there at all),
// the "extraction" stub, the heavy-zone perf budget (4 guards + 2 cameras +
// 1 laser, the heaviest roster shipped so far), determinism, and the
// cameras' actual 100deg sweep width. Same registry pattern as every other
// tests/*.test.js file: push onto the shared Game.selfTests list; test.js
// runs every entry and reports ok/FAIL with real exit codes.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const DT = 1 / 60;

// Same leg-clearance technique as tests/zones.test.js's own assertLoopClear
// (and tests/world.test.js before it) — duplicated locally rather than
// imported, same self-contained-test-file convention every other
// tests/*.test.js in this codebase already follows.
function assertLoopClear(world, loopName, waypoints) {
  assert(Array.isArray(waypoints) && waypoints.length >= 3, loopName + ": expected at least 3 waypoints for a loop");

  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    const legLabel = loopName + " leg " + i + " (" + i + "->" + ((i + 1) % waypoints.length) + ")";

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const legLen = Math.sqrt(dx * dx + dy * dy);
    const samples = Math.ceil(legLen / 0.25);

    for (let s = 0; s <= samples; s++) {
      const t = samples > 0 ? s / samples : 0;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      assert(
        !world.isBlockedCircle(px, py, 0.6),
        legLabel + " blocked at sample (" + px.toFixed(2) + "," + py.toFixed(2) + ")"
      );
    }

    const hit = world.raycast(a.x, a.y, b.x, b.y);
    assert(hit === null, legLabel + " raycast hit at (" + (hit ? hit.x.toFixed(2) : "?") + "," + (hit ? hit.y.toFixed(2) : "?") + ")");
  }
}

// ---------------------------------------------------------------------------
// 1. Registration sanity.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "commsTower: zone is registered in Game.ZONES with the full heavy-patrol schema",
  fn: function () {
    const tower = Game.ZONES.commsTower;
    assert(!!tower, "expected Game.ZONES.commsTower to exist");
    assert(tower.id === "commsTower", "expected zone.id === 'commsTower'");
    assert(tower.bounds.w === 40 && tower.bounds.h === 30, "expected a 40x30 zone");

    assert(Array.isArray(tower.waypoints) && tower.waypoints.length >= 3, "expected a real waypoints loop");
    assert(Array.isArray(tower.waypoints2) && tower.waypoints2.length >= 3, "expected a real waypoints2 loop");
    assert(Array.isArray(tower.waypoints3) && tower.waypoints3.length >= 3, "expected a real waypoints3 loop");
    assert(Array.isArray(tower.waypoints4) && tower.waypoints4.length >= 3, "expected a real waypoints4 loop");

    assert(Array.isArray(tower.cameras) && tower.cameras.length === 2, "expected exactly 2 cameras, got " + (tower.cameras && tower.cameras.length));
    tower.cameras.forEach(function (cam, i) {
      assert(cam.sweepDeg === 100, "expected camera " + i + " sweepDeg === 100, got " + cam.sweepDeg);
      assert(cam.range === 12, "expected camera " + i + " range === 12, got " + cam.range);
    });

    assert(Array.isArray(tower.lasers) && tower.lasers.length >= 1, "expected at least 1 laser, got " + (tower.lasers && tower.lasers.length));
    assert(Array.isArray(tower.doors) && tower.doors.length >= 1, "expected at least 1 door, got " + (tower.doors && tower.doors.length));
    assert(tower.doors.some(function (d) { return d.lock === null; }), "expected at least one unlocked door (the core stairwell)");

    assert(Array.isArray(tower.darkZones) && tower.darkZones.length >= 3, "expected at least 3 dark zones, got " + (tower.darkZones && tower.darkZones.length));
    assert(Array.isArray(tower.lockers) && tower.lockers.length >= 3, "expected at least 3 lockers, got " + (tower.lockers && tower.lockers.length));

    assert(Array.isArray(tower.pickups) && tower.pickups.length >= 2, "expected at least 2 pickups, got " + (tower.pickups && tower.pickups.length));
    assert(tower.pickups.some(function (p) { return p.item === "ration"; }), "expected a ration pickup");
    assert(tower.pickups.some(function (p) { return p.item === "chaff"; }), "expected a chaff pickup");

    assert(tower.exit === tower.exits[0], "expected zone.exit alias === zone.exits[0]");
    assert(tower.exits[0].to === "extraction", "expected the only exit to point at the extraction stub");
    assert(typeof tower.entrances.fromLaboratory === "object", "expected entrances.fromLaboratory to be defined");

    // Laboratory's own exit must point at this zone with a matching entranceKey.
    const lab = Game.ZONES.laboratory;
    assert(lab.exits[0].to === "commsTower", "setup: expected laboratory.exits[0].to === 'commsTower'");
    assert(lab.exits[0].entranceKey === "fromLaboratory", "setup: expected laboratory.exits[0].entranceKey === 'fromLaboratory'");
  },
});

// ---------------------------------------------------------------------------
// 2. Laboratory -> Comms Tower transition (entrance/exit pair).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "commsTower: laboratory -> commsTower transition lands the player at entrances.fromLaboratory with 4 guards",
  fn: function () {
    const lab = Game.ZONES.laboratory;
    const tower = Game.ZONES.commsTower;
    const engine = Game.createEngine({ seed: 61, zoneData: lab });

    const northExit = lab.exits[0];
    engine.player.x = northExit.x + northExit.w / 2;
    engine.player.y = northExit.y + northExit.h / 2;
    engine.player.stance = "crouch";
    engine.player.facing = 2.1;
    engine.tick({ moveX: 0, moveY: 0, stance: "crouch" });

    const zoneChangeEvents = engine.events.filter(function (e) { return e.type === "zoneChange"; });
    assert(zoneChangeEvents.length === 1, "expected exactly one zoneChange event, got " + zoneChangeEvents.length);
    assert(zoneChangeEvents[0].from === "laboratory" && zoneChangeEvents[0].to === "commsTower", "expected laboratory->commsTower zoneChange");
    assert(engine.zone.id === "commsTower", "expected engine.zone to be commsTower, got " + engine.zone.id);
    assert(engine.snapshot().zoneId === "commsTower", "expected snapshot().zoneId === commsTower");

    const entrance = tower.entrances.fromLaboratory;
    assert(
      engine.player.x === entrance.x && engine.player.y === entrance.y,
      "expected player at commsTower.entrances.fromLaboratory, got " + JSON.stringify({ x: engine.player.x, y: engine.player.y })
    );
    assert(engine.player.stance === "crouch", "expected player stance preserved across the transition");
    assert(engine.player.facing === 2.1, "expected player facing preserved across the transition");

    assert(engine.guards.length === 4, "expected 4 commsTower guards, got " + engine.guards.length);
    const ids = engine.guards.map(function (g) { return g.id; });
    ["tower-g1", "tower-g2", "tower-g3", "tower-g4"].forEach(function (id) {
      assert(ids.indexOf(id) !== -1, "expected guard id " + id + ", got " + JSON.stringify(ids));
    });

    assert(engine.squad.phase === "INFILTRATION", "expected a fresh squad starting INFILTRATION, got " + engine.squad.phase);
    assert(engine.squad.alertCount === 0, "expected a fresh squad with alertCount 0, got " + engine.squad.alertCount);

    // A further tick in the new zone should just work.
    engine.tick({ moveX: 0, moveY: 0 });
    assert(engine.zone.id === "commsTower", "expected engine to keep ticking fine in commsTower");
  },
});

// ---------------------------------------------------------------------------
// 3. Explicit r=0.6 leg clearance for all 4 waypoint loops.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "commsTower: all 4 waypoint loops (waypoints/2/3/4) are walkably clear at r=0.6",
  fn: function () {
    const tower = Game.ZONES.commsTower;
    const world = Game.createWorld(tower);

    assertLoopClear(world, "commsTower.waypoints (tower-g1, perimeter ring)", tower.waypoints);
    assertLoopClear(world, "commsTower.waypoints2 (tower-g2, core ring)", tower.waypoints2);
    assertLoopClear(world, "commsTower.waypoints3 (tower-g3, east yard)", tower.waypoints3);
    assertLoopClear(world, "commsTower.waypoints4 (tower-g4, west yard)", tower.waypoints4);
  },
});

// ---------------------------------------------------------------------------
// 4. Extraction exit: known stub, resolves to zoneBlocked, engine keeps
// ticking normally afterward (see tests/zones.test.js's own dedicated
// zoneBlocked-mechanics test for the region-entry-edge assertions; this test
// is about the stub's OWN identity plus post-block engine health).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "commsTower: the extraction exit is the current known stub and the engine stays healthy after zoneBlocked",
  fn: function () {
    const tower = Game.ZONES.commsTower;
    assert(!Game.ZONES.extraction, "setup: expected Game.ZONES.extraction to NOT exist yet this cycle");

    const engine = Game.createEngine({ seed: 62, zoneData: tower });
    const northExit = tower.exits[0];
    engine.player.x = northExit.x + northExit.w / 2;
    engine.player.y = northExit.y + northExit.h / 2;
    engine.player.stance = "crawl"; // see tests/zones.test.js's own note on this same trigger sitting in camera0's facing line

    let sawBlocked = false;
    engine.tick({ moveX: 0, moveY: 0 });
    engine.player.x = northExit.x + northExit.w / 2;
    engine.player.y = northExit.y + northExit.h / 2;
    engine.events.forEach(function (e) { if (e.type === "zoneBlocked" && e.to === "extraction") sawBlocked = true; });
    assert(sawBlocked, "expected a zoneBlocked event naming 'extraction' on entering the trigger");
    assert(engine.zone.id === "commsTower", "expected to remain in commsTower after the block");

    // Keeps ticking fine afterward: no crash, tickCount advances, gameOver
    // never latches from merely standing in a blocked exit trigger.
    const tickCountBefore = engine.tickCount;
    for (let i = 0; i < 30; i++) {
      engine.tick({ moveX: 0, moveY: 0 });
    }
    assert(engine.tickCount === tickCountBefore + 30, "expected tickCount to keep advancing normally");
    assert(engine.gameOver === false, "expected gameOver to remain false");
  },
});

// ---------------------------------------------------------------------------
// 5. Guards never path through the core walls over 120s of patrol, and every
// guard actually visits every one of its own waypoints (full waypointIndex
// coverage). Player parked far off-map so nothing pulls a guard off its loop
// (camera/vision interactions have their own dedicated coverage elsewhere in
// this file and in tests/cameras.test.js) -- this test is purely about
// wall-clearance + loop-coverage over a long patrol window.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "commsTower: all 4 guards stay unblocked by the core walls and visit every waypoint over 120s",
  fn: function () {
    const tower = Game.ZONES.commsTower;
    const engine = Game.createEngine({ seed: 63, zoneData: tower });
    const world = engine.world;

    engine.player.x = -1000;
    engine.player.y = -1000;

    const visited = {};
    engine.guards.forEach(function (g) { visited[g.id] = new Set(); });

    const TOTAL_TICKS = Math.round(120 / DT);
    for (let t = 0; t < TOTAL_TICKS; t++) {
      engine.tick({ moveX: 0, moveY: 0 });
      engine.player.x = -1000;
      engine.player.y = -1000;

      engine.guards.forEach(function (g) {
        assert(
          !world.isBlockedCircle(g.x, g.y, 0.6),
          "guard " + g.id + " overlapping a wall at (" + g.x.toFixed(2) + "," + g.y.toFixed(2) + ") at tick " + t
        );
        visited[g.id].add(g.waypointIndex);
      });
    }

    assert(engine.squad.phase === "INFILTRATION", "expected squad to remain INFILTRATION with the player parked off-map, got " + engine.squad.phase);

    const loopsByGuard = {
      "tower-g1": tower.waypoints,
      "tower-g2": tower.waypoints2,
      "tower-g3": tower.waypoints3,
      "tower-g4": tower.waypoints4,
    };
    Object.keys(loopsByGuard).forEach(function (id) {
      const expected = loopsByGuard[id].length;
      assert(
        visited[id].size === expected,
        id + ": expected to visit all " + expected + " waypoints over 120s, visited " + visited[id].size + " (indices " + Array.from(visited[id]).join(",") + ")"
      );
    });
  },
});

// ---------------------------------------------------------------------------
// 6. PERF BUDGET — heaviest zone shipped: 4 guards + 2 cameras + 1 laser,
// 600 ticks under 4ms/tick average. Same portable timing shim as
// tests/engine.test.js's own perf test.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "commsTower perf: 4 guards + 2 cameras + 1 laser, full tick under 4ms budget",
  fn: function () {
    const now =
      typeof performance !== "undefined" && performance.now
        ? function () { return performance.now(); }
        : function () { return Number(process.hrtime.bigint()) / 1e6; };

    const engine = Game.createEngine({ zoneData: Game.ZONES.commsTower, seed: 7001 });
    assert(engine.guards.length === 4, "setup: expected 4 guards in commsTower");
    assert(engine.director.cameraStates().length === 2, "setup: expected 2 cameras");
    assert(engine.director.laserStates().length === 1, "setup: expected 1 laser");

    const TOTAL_TICKS = 600;
    const start = now();
    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      engine.tick({
        moveX: Math.sin(tick * 0.037),
        moveY: Math.cos(tick * 0.041),
        run: tick % 6 === 0,
        stance: "stand",
      });
    }
    const elapsed = now() - start;
    const avgMs = elapsed / TOTAL_TICKS;

    assert(avgMs < 4, "expected average tick under 4ms with 4 guards + 2 cameras + 1 laser, got " + avgMs.toFixed(3) + "ms");
  },
});

// ---------------------------------------------------------------------------
// 7. Determinism: two engines, same seed, identical 600-tick scripted input
// -> identical final snapshot().
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "commsTower determinism: same seed + same scripted input -> identical final snapshot over 600 ticks",
  fn: function () {
    function scriptedInput(tick) {
      return {
        moveX: Math.sin(tick * 0.029),
        moveY: Math.cos(tick * 0.033),
        run: tick % 9 === 0,
        stance: tick % 210 < 70 ? "crouch" : tick % 210 < 140 ? "crawl" : "stand",
        chaff: tick === 250,
      };
    }

    const engineA = Game.createEngine({ zoneData: Game.ZONES.commsTower, seed: 8080 });
    const engineB = Game.createEngine({ zoneData: Game.ZONES.commsTower, seed: 8080 });

    for (let tick = 0; tick < 600; tick++) {
      const input = scriptedInput(tick);
      engineA.tick(input);
      engineB.tick(input);
    }

    const snapA = JSON.stringify(engineA.snapshot());
    const snapB = JSON.stringify(engineB.snapshot());
    assert(snapA === snapB, "expected identical snapshots for identical seed+input, got:\n" + snapA + "\nvs\n" + snapB);
  },
});

// ---------------------------------------------------------------------------
// 8. Both cameras actually sweep the full 100deg width (bounded pan check,
// same technique as tests/cameras.test.js's own pan-angle test).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "commsTower cameras: both cameras' pan angle is bounded to +/- 50deg (sweepDeg 100) and actually reaches it",
  fn: function () {
    const zone = Game.ZONES.commsTower;
    const world = Game.createWorld(zone);
    const vision = Game.createVision({ world: world });
    const squad = Game.createSquad();
    const director = Game.createDirector({ world: world, vision: vision, squad: squad });

    const farTarget = {
      x: -9999,
      y: -9999,
      visionProfile: function () { return 1.0; },
    };

    zone.cameras.forEach(function (cam, camIndex) {
      const halfSweepRad = (cam.sweepDeg * Math.PI) / 180 / 2;
      let seenMin = Infinity;
      let seenMax = -Infinity;
      const STEPS = 600; // 10s at DT=1/60, well over one 6s sweepPeriodS

      for (let i = 0; i < STEPS; i++) {
        const t = i * DT;
        director.tickCameras(DT, { time: t, chaffUntil: 0, player: farTarget });
        const panAngle = director.cameraStates()[camIndex].panAngle;

        const expected = cam.facing + Math.sin((2 * Math.PI * t) / cam.sweepPeriodS) * halfSweepRad;
        assert(
          Math.abs(panAngle - expected) < 1e-9,
          "camera " + camIndex + ": pan angle not a pure/deterministic function of ctx.time at t=" + t.toFixed(3)
        );

        const delta = panAngle - cam.facing;
        if (delta < seenMin) seenMin = delta;
        if (delta > seenMax) seenMax = delta;
      }

      assert(
        seenMax <= halfSweepRad + 1e-9 && seenMin >= -halfSweepRad - 1e-9,
        "camera " + camIndex + ": pan swing exceeded +/- sweepDeg/2: min=" + seenMin.toFixed(4) + " max=" + seenMax.toFixed(4)
      );
      assert(seenMax > halfSweepRad * 0.9, "camera " + camIndex + ": pan angle never swung near the +50deg extreme");
      assert(seenMin < -halfSweepRad * 0.9, "camera " + camIndex + ": pan angle never swung near the -50deg extreme");
    });
  },
});
