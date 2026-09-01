// tests/laboratory.test.js — headless assertions for the Laboratory zone:
// door blocking/open-close mechanics (src/world.js + src/engine.js's DOORS
// step), keycard pickups (src/items.js/src/engine.js's PICKUPS step), and
// lasers (src/director.js's laser contract + src/engine.js's LASERS step).
// Same registry pattern as every other tests/*.test.js file: push onto the
// shared Game.selfTests list; test.js runs every entry and reports ok/FAIL
// with real exit codes.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const DT = 1 / 60;

function laserByEndpoints(zone, x1) {
  for (let i = 0; i < zone.lasers.length; i++) {
    if (zone.lasers[i].x1 === x1) return zone.lasers[i];
  }
  throw new Error("no laser with x1=" + x1 + " found in zone.lasers");
}

// Walks the player in a straight vertical line (x fixed) from y=startY to
// y=endY via REAL player.update() movement (run, "stand"), one tick at a
// time, so the engine's own prevX/prevY -> x/y movement segment is genuine
// -- NOT a teleport, which would produce a zero-length segment and never
// trip anything (see src/director.js's own LASERS contract for why the
// crossing test needs a real movement segment). Returns after crossing endY
// or MAX_TICKS, whichever comes first.
function walkVertical(engine, x, startY, endY, maxTicks) {
  engine.player.x = x;
  engine.player.y = startY;
  engine.player.facing = Math.PI / 2;
  const dir = endY > startY ? 1 : -1;
  for (let i = 0; i < maxTicks; i++) {
    engine.player.x = x; // keep a dead-straight line
    engine.tick({ moveX: 0, moveY: dir, run: true, stance: "stand" });
    if (dir > 0 ? engine.player.y >= endY : engine.player.y <= endY) break;
  }
}

// Advances a fresh/no-op-ticking engine until its west laser (lasers[0],
// spanning x:2-18 @ y:10) reads the desired active phase, WITHOUT moving the
// player (so no accidental crossing happens while waiting). Ticks FIRST,
// then checks: director.laserStates() only reflects a REAL evaluation after
// tickLasers has actually run at least once (see src/director.js's own
// cameraStates-style "pure snapshot of the most recent call" contract) --
// checking before any tick reads the construction-time default (active:
// false) instead, which would misreport "already off" at time=0 even though
// the true phase at t=0 is ACTIVE (phase 0 < dutyOn).
function waitForLaserPhase(engine, laserIndex, wantActive, maxTicks) {
  for (let i = 0; i < maxTicks; i++) {
    engine.tick({ moveX: 0, moveY: 0 });
    const active = engine.director.laserStates()[laserIndex].active;
    if (active === wantActive) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 1. Registration sanity.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "laboratory: zone is registered in Game.ZONES with doors/lasers/pickups/two guard loops",
  fn: function () {
    const lab = Game.ZONES.laboratory;
    assert(!!lab, "expected Game.ZONES.laboratory to exist");
    assert(lab.id === "laboratory", "expected zone.id === 'laboratory'");
    assert(Array.isArray(lab.doors) && lab.doors.length >= 3, "expected at least 3 doors (L1/L2/L3), got " + (lab.doors && lab.doors.length));
    assert(Array.isArray(lab.lasers) && lab.lasers.length >= 2, "expected at least 2 lasers, got " + (lab.lasers && lab.lasers.length));
    assert(Array.isArray(lab.pickups) && lab.pickups.length >= 2, "expected at least 2 pickups (L2/L3 keycards), got " + (lab.pickups && lab.pickups.length));
    assert(Array.isArray(lab.lockers) && lab.lockers.length >= 3, "expected at least 3 lockers, got " + (lab.lockers && lab.lockers.length));
    assert(Array.isArray(lab.darkZones) && lab.darkZones.length >= 2, "expected at least 2 dark zones, got " + (lab.darkZones && lab.darkZones.length));
    assert(Array.isArray(lab.cameras) && lab.cameras.length === 3, "expected exactly 3 cameras, got " + (lab.cameras && lab.cameras.length));
    assert(Array.isArray(lab.waypoints) && lab.waypoints.length >= 3, "expected a real waypoints loop");
    assert(Array.isArray(lab.waypoints2) && lab.waypoints2.length >= 3, "expected a real waypoints2 loop");

    // Warehouse's own L1 keycard placement (see src/world.js's schema note).
    const wh = Game.ZONES.warehouse;
    assert(
      wh.pickups.some(function (p) { return p.item === "keycardL1"; }),
      "expected the warehouse to carry a keycardL1 pickup for the Laboratory's L1 door"
    );
  },
});

// ---------------------------------------------------------------------------
// 2. Door blocking mechanics (world.js level, no engine involved): a closed
//    door blocks isBlocked/isBlockedCircle/raycast/moveCircle exactly like a
//    wall; opening it clears all four.
// ---------------------------------------------------------------------------
// Probe x=19 (not the door's geometric x-center, 20): doorL1 spans x:18-22,
// but Wall B's own segments sit immediately at x:20-21 (see src/world.js's
// Laboratory layout), close enough that a r=0.6 circle centered exactly at
// x=20 clips Wall B's corner regardless of the door's own state -- an
// honest artifact of the two structures sharing a corner, not a door bug.
// x=19 is comfortably inside the door's span and a full meter clear of
// Wall B, so every check below is testing ONLY doorL1.
Game.selfTests.push({
  name: "laboratory doors: a closed door blocks isBlocked/isBlockedCircle/raycast/moveCircle like a wall",
  fn: function () {
    const zone = Game.ZONES.laboratory;
    const world = Game.createWorld(zone);
    const door = laboratoryDoor(zone, "doorL1");
    const px = 19;
    const py = door.y + door.h / 2;

    assert(!world.isDoorOpen("doorL1"), "expected doorL1 to start closed");
    assert(world.isBlocked(px, py), "expected a point inside the closed door to be blocked");
    assert(world.isBlockedCircle(px, py, 0.6), "expected a r=0.6 circle inside the closed door to be blocked");

    const hit = world.raycast(px, door.y - 2, px, door.y + door.h + 2);
    assert(hit !== null, "expected a raycast straight through the closed door to hit it");

    // Small step landing WELL INSIDE the door's own footprint (moveCircle
    // only checks its FINAL destination, not a swept path -- see
    // src/world.js's own moveCircle contract -- so the step size must
    // actually land inside a thin 1m-deep obstacle like a door to exercise
    // blocking, the same way tests/world.test.js's own moveCircle test picks
    // a destination deep inside a large wall).
    const moved = world.moveCircle(px, door.y - 1.4, 0, 2.0, 0.6);
    assert(moved.y < door.y, "expected moveCircle to reject a step landing inside the closed door, got y=" + moved.y);
  },
});

Game.selfTests.push({
  name: "laboratory doors: the same door, once opened, no longer blocks any of the four checks",
  fn: function () {
    const zone = Game.ZONES.laboratory;
    const world = Game.createWorld(zone);
    const door = laboratoryDoor(zone, "doorL1");
    const px = 19;
    const py = door.y + door.h / 2;

    world.setDoorOpen("doorL1", true);
    assert(world.isDoorOpen("doorL1"), "expected isDoorOpen to report true after setDoorOpen(true)");
    assert(!world.isBlocked(px, py), "expected the point inside the door to be clear once open");
    assert(!world.isBlockedCircle(px, py, 0.6), "expected a r=0.6 circle inside the door to be clear once open");

    const hit = world.raycast(px, door.y - 2, px, door.y + door.h + 2);
    assert(hit === null, "expected a raycast straight through the open door to pass clean");

    // Same step size as the closed-door test above, but now unblocked: the
    // destination (still inside the door's own footprint) should be
    // reached exactly, not rejected.
    const moved = world.moveCircle(px, door.y - 1.4, 0, 2.0, 0.6);
    assert(Math.abs(moved.y - (door.y - 1.4 + 2.0)) < 1e-9, "expected moveCircle to reach its destination unblocked, got y=" + moved.y);

    // A bigger step landing PAST the door's far edge should also go
    // straight through -- proof the door is fully out of the way, not just
    // the single destination point tested above.
    const movedPast = world.moveCircle(px, door.y - 1.4, 0, 3.0, 0.6);
    assert(movedPast.y > door.y + door.h, "expected moveCircle to pass straight through and past the open door, got y=" + movedPast.y);
  },
});

function laboratoryDoor(zone, id) {
  for (let i = 0; i < zone.doors.length; i++) {
    if (zone.doors[i].id === id) return zone.doors[i];
  }
  throw new Error("no door with id " + id + " found");
}

// ---------------------------------------------------------------------------
// 3. Engine DOORS step: a locked door does not auto-open without the
//    matching keycard, and does open once the player holds it.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "laboratory doors: a locked door stays shut without the key, opens once the player holds it",
  fn: function () {
    const zone = Game.ZONES.laboratory;
    const engine = Game.createEngine({ zoneData: zone, seed: 42, guardConfigs: [] });
    const door = laboratoryDoor(zone, "doorL1");

    engine.player.x = door.x + door.w / 2;
    engine.player.y = door.y + door.h / 2;
    for (let i = 0; i < 30; i++) {
      engine.tick({ moveX: 0, moveY: 0 });
      engine.player.x = door.x + door.w / 2;
      engine.player.y = door.y + door.h / 2;
    }
    assert(!engine.snapshot().doors.find(function (d) { return d.id === "doorL1"; }).open, "expected doorL1 to stay closed with no key present");

    engine.inventory.keycards.L1 = true;
    engine.tick({ moveX: 0, moveY: 0 });
    const doorOpenEvents = engine.events.filter(function (e) { return e.type === "doorOpen" && e.id === "doorL1"; });
    assert(doorOpenEvents.length === 1, "expected exactly one doorOpen event for doorL1 once the L1 key is held, got " + doorOpenEvents.length);
    assert(engine.snapshot().doors.find(function (d) { return d.id === "doorL1"; }).open, "expected doorL1 to read open in the snapshot");
  },
});

// ---------------------------------------------------------------------------
// 4. Keycard pickup: auto-collects on walkover, sets inventory, pushes event.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "laboratory pickups: walking over the L2 keycard collects it, sets inventory, pushes a pickup event",
  fn: function () {
    const zone = Game.ZONES.laboratory;
    const engine = Game.createEngine({ zoneData: zone, seed: 7, guardConfigs: [] });
    const pickup = zone.pickups.find(function (p) { return p.item === "keycardL2"; });
    assert(!!pickup, "setup: expected a keycardL2 pickup in the Laboratory zone data");

    assert(engine.inventory.keycards.L2 === false, "setup: expected L2 not held yet");
    engine.player.x = pickup.x;
    engine.player.y = pickup.y;
    engine.tick({ moveX: 0, moveY: 0 });

    assert(engine.inventory.keycards.L2 === true, "expected inventory.keycards.L2 to be true after walking over the pickup");
    const pickupEvents = engine.events.filter(function (e) { return e.type === "pickup" && e.item === "keycardL2"; });
    assert(pickupEvents.length === 1, "expected exactly one pickup event for keycardL2, got " + pickupEvents.length);

    // Standing there another tick must not re-fire the event or double count.
    engine.tick({ moveX: 0, moveY: 0 });
    const secondTickPickups = engine.events.filter(function (e) { return e.type === "pickup"; });
    assert(secondTickPickups.length === 0, "expected no repeat pickup event on a later tick standing on the same spot");
  },
});

Game.selfTests.push({
  name: "laboratory pickups: the bonus chaff grenade increments inventory.chaff beyond the starting count",
  fn: function () {
    const zone = Game.ZONES.laboratory;
    const engine = Game.createEngine({ zoneData: zone, seed: 8, guardConfigs: [] });
    const pickup = zone.pickups.find(function (p) { return p.item === "chaff"; });
    assert(!!pickup, "setup: expected a chaff pickup in the Laboratory zone data");

    const before = engine.inventory.chaff;
    engine.player.x = pickup.x;
    engine.player.y = pickup.y;
    engine.tick({ moveX: 0, moveY: 0 });
    assert(engine.inventory.chaff === before + 1, "expected inventory.chaff to increment by exactly 1, got " + engine.inventory.chaff + " (was " + before + ")");
  },
});

// ---------------------------------------------------------------------------
// 5. Lasers: crossing during the ACTIVE phase trips (instant ALERT + event);
//    crossing during the OFF phase does not.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "laboratory lasers: crossing the west beam while ACTIVE trips laserTripped + squad ALERT",
  fn: function () {
    const zone = Game.ZONES.laboratory;
    const laser = laserByEndpoints(zone, 2);
    const engine = Game.createEngine({ zoneData: zone, seed: 100, guardConfigs: [] });

    engine.player.x = laser.x1 + 4; // clear of both side walls, on the beam's line
    engine.player.y = laser.y1 - 2;
    const ok = waitForLaserPhase(engine, 0, true, Math.round(laser.periodS / DT) + 10);
    assert(ok, "setup failed: west laser never reached its ACTIVE phase");

    let tripped = false;
    for (let i = 0; i < 120 && !tripped; i++) {
      engine.player.x = laser.x1 + 4;
      engine.tick({ moveX: 0, moveY: 1, run: true, stance: "stand" });
      if (engine.events.some(function (e) { return e.type === "laserTripped" && e.laserIndex === 0; })) tripped = true;
      if (engine.player.y > laser.y1 + 2) break;
    }
    assert(tripped, "expected a laserTripped event while crossing the beam during its ACTIVE phase");
    assert(engine.squad.phase === "ALERT" || engine.squad.phase === "EVASION", "expected squad to have gone hostile off the laser trip, got " + engine.squad.phase);
  },
});

Game.selfTests.push({
  name: "laboratory lasers: crossing the west beam during its OFF phase does not trip anything",
  fn: function () {
    const zone = Game.ZONES.laboratory;
    const laser = laserByEndpoints(zone, 2);
    const engine = Game.createEngine({ zoneData: zone, seed: 101, guardConfigs: [] });

    engine.player.x = laser.x1 + 4;
    engine.player.y = laser.y1 - 2;
    const ok = waitForLaserPhase(engine, 0, false, Math.round(laser.periodS / DT) + 10);
    assert(ok, "setup failed: west laser never reached its OFF phase");

    let tripped = false;
    for (let i = 0; i < 120; i++) {
      engine.player.x = laser.x1 + 4;
      engine.tick({ moveX: 0, moveY: 1, run: true, stance: "stand" });
      if (engine.events.some(function (e) { return e.type === "laserTripped"; })) tripped = true;
      if (engine.player.y > laser.y1 + 2) break;
    }
    assert(!tripped, "expected NO laserTripped event while crossing during the OFF phase");
    assert(engine.squad.phase === "INFILTRATION", "expected squad to remain INFILTRATION, got " + engine.squad.phase);
  },
});

// ---------------------------------------------------------------------------
// 6. Box does NOT protect against a laser (beams don't care); chaff does NOT
//    disable a laser either (it's not a camera).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "laboratory lasers: a boxed player still trips the beam (box does not protect against lasers)",
  fn: function () {
    const zone = Game.ZONES.laboratory;
    const laser = laserByEndpoints(zone, 2);
    const engine = Game.createEngine({ zoneData: zone, seed: 202, guardConfigs: [] });

    engine.player.x = laser.x1 + 4;
    engine.player.y = laser.y1 - 2;
    const ok = waitForLaserPhase(engine, 0, true, Math.round(laser.periodS / DT) + 10);
    assert(ok, "setup failed: west laser never reached its ACTIVE phase");

    engine.tick({ moveX: 0, moveY: 0, box: true });
    assert(engine.inventory.boxOn, "setup failed: box never toggled on");

    let tripped = false;
    for (let i = 0; i < 120 && !tripped; i++) {
      engine.player.x = laser.x1 + 4;
      engine.tick({ moveX: 0, moveY: 1, run: true, stance: "stand", box: true });
      if (engine.events.some(function (e) { return e.type === "laserTripped" && e.laserIndex === 0; })) tripped = true;
      if (engine.player.y > laser.y1 + 2) break;
    }
    assert(tripped, "expected the boxed player to still trip the laser crossing it");
  },
});

Game.selfTests.push({
  name: "laboratory lasers: an active chaff jam does not disable a laser (still trips while chaffed)",
  fn: function () {
    const zone = Game.ZONES.laboratory;
    const laser = laserByEndpoints(zone, 2);
    const engine = Game.createEngine({ zoneData: zone, seed: 303, guardConfigs: [] });

    engine.player.x = laser.x1 + 4;
    engine.player.y = laser.y1 - 2;
    const ok = waitForLaserPhase(engine, 0, true, Math.round(laser.periodS / DT) + 10);
    assert(ok, "setup failed: west laser never reached its ACTIVE phase");

    // Simulate an active chaff jam directly (see engine.js's CHAFF VERB —
    // chaffUntil is a plain absolute-time deadline compared against
    // engine.time every tick).
    engine.chaffUntil = engine.time + 100;

    let tripped = false;
    for (let i = 0; i < 120 && !tripped; i++) {
      engine.player.x = laser.x1 + 4;
      engine.tick({ moveX: 0, moveY: 1, run: true, stance: "stand" });
      if (engine.events.some(function (e) { return e.type === "laserTripped" && e.laserIndex === 0; })) tripped = true;
      if (engine.player.y > laser.y1 + 2) break;
    }
    assert(tripped, "expected the laser to still trip while chaffUntil > time (chaff does not disable lasers)");
  },
});

// ---------------------------------------------------------------------------
// 7. Zone sanity: the Laboratory is automatically covered by the
//    generalized waypoint-loop test, plus guard loops never cross a locked
//    door's closed AABB (guards never need doors -- see src/world.js's own
//    design note).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "laboratory: the generalized zones waypoint-loop test automatically covers the Laboratory",
  fn: function () {
    assert("laboratory" in Game.ZONES, "expected Game.ZONES to include laboratory (the generalized test in tests/zones.test.js iterates Object.keys(Game.ZONES), so this alone proves it's exercised)");
  },
});

Game.selfTests.push({
  name: "laboratory: neither guard's patrol loop ever crosses a locked door's AABB",
  fn: function () {
    const zone = Game.ZONES.laboratory;
    const loops = [
      { name: "waypoints (lab-g1)", points: zone.waypoints },
      { name: "waypoints2 (lab-g2)", points: zone.waypoints2 },
    ];

    function pointInRect(px, py, rect) {
      return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
    }

    loops.forEach(function (loop) {
      for (let i = 0; i < loop.points.length; i++) {
        const a = loop.points[i];
        const b = loop.points[(i + 1) % loop.points.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const samples = Math.ceil(len / 0.25);
        for (let s = 0; s <= samples; s++) {
          const t = samples > 0 ? s / samples : 0;
          const px = a.x + dx * t;
          const py = a.y + dy * t;
          zone.doors.forEach(function (door) {
            if (!door.lock) return; // unlocked doors are fine to (theoretically) cross
            assert(
              !pointInRect(px, py, door),
              loop.name + " leg " + i + " passes through locked door " + door.id + "'s AABB at (" + px.toFixed(2) + "," + py.toFixed(2) + ")"
            );
          });
        }
      }
    });
  },
});

// ---------------------------------------------------------------------------
// 8. warehouse -> laboratory transition via fromWarehouse entrance.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "laboratory: warehouse -> laboratory transition lands the player at entrances.fromWarehouse",
  fn: function () {
    const warehouse = Game.ZONES.warehouse;
    const lab = Game.ZONES.laboratory;
    const engine = Game.createEngine({ seed: 55, zoneData: warehouse });

    const northExit = warehouse.exits[1];
    assert(northExit.to === "laboratory", "setup: expected warehouse.exits[1].to === 'laboratory'");

    engine.player.x = northExit.x + northExit.w / 2;
    engine.player.y = northExit.y + northExit.h / 2;
    engine.tick({ moveX: 0, moveY: 0 });

    const zoneChangeEvents = engine.events.filter(function (e) { return e.type === "zoneChange"; });
    assert(zoneChangeEvents.length === 1, "expected exactly one zoneChange event, got " + zoneChangeEvents.length);
    assert(zoneChangeEvents[0].to === "laboratory", "expected zoneChange.to === laboratory");
    assert(engine.zone.id === "laboratory", "expected engine.zone to be laboratory, got " + engine.zone.id);

    const entrance = lab.entrances.fromWarehouse;
    assert(
      engine.player.x === entrance.x && engine.player.y === entrance.y,
      "expected player at laboratory.entrances.fromWarehouse, got " + JSON.stringify({ x: engine.player.x, y: engine.player.y })
    );
    assert(engine.guards.length === 2, "expected 2 laboratory guards, got " + engine.guards.length);
    const ids = engine.guards.map(function (g) { return g.id; });
    assert(ids.indexOf("lab-g1") !== -1 && ids.indexOf("lab-g2") !== -1, "expected lab-g1/lab-g2, got " + JSON.stringify(ids));

    // A further tick in the new zone should just work.
    engine.tick({ moveX: 0, moveY: 0 });
    assert(engine.zone.id === "laboratory", "expected engine to keep ticking fine in laboratory");
  },
});

// ---------------------------------------------------------------------------
// 9. Determinism across door/laser/keycard state: two engines, same seed +
//    identical scripted inputs -> identical snapshot() (extended this cycle
//    with doors/keycards/lasers -- see src/engine.js's snapshot contract).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "laboratory: determinism holds for door/laser/keycard state across identical scripted runs",
  fn: function () {
    function scriptedInput(tick) {
      return {
        moveX: Math.sin(tick * 0.037),
        moveY: Math.cos(tick * 0.023),
        run: tick % 13 === 0,
        stance: tick % 180 < 60 ? "crouch" : "stand",
        chaff: tick === 90,
      };
    }

    function run(seed) {
      const engine = Game.createEngine({ zoneData: Game.ZONES.laboratory, seed: seed });
      // Force the L1 door open partway through via a direct key grant +
      // proximity walk, identically on both runs (deterministic script, not
      // randomness) so the doors/keycards snapshot fields actually differ
      // from their all-closed/all-false defaults.
      for (let t = 0; t < 300; t++) {
        if (t === 100) engine.inventory.keycards.L1 = true;
        if (t >= 150 && t < 160) {
          const door = laboratoryDoor(Game.ZONES.laboratory, "doorL1");
          engine.player.x = door.x + door.w / 2;
          engine.player.y = door.y + door.h / 2;
        }
        engine.tick(scriptedInput(t));
      }
      return engine;
    }

    const a = run(778899);
    const b = run(778899);

    const snapA = JSON.stringify(a.snapshot());
    const snapB = JSON.stringify(b.snapshot());
    assert(snapA === snapB, "expected identical snapshots (incl. doors/lasers/keycards) for identical seed+input, got:\n" + snapA + "\nvs\n" + snapB);

    // Sanity: the script above should have actually exercised non-default
    // door/keycard state, otherwise this test would trivially pass by
    // comparing two engines that never left their defaults.
    const snap = a.snapshot();
    assert(snap.keycards.L1 === true, "setup failed: expected keycards.L1 true after the scripted run");
    assert(snap.doors.some(function (d) { return d.id === "doorL1" && d.open; }), "setup failed: expected doorL1 to have opened during the scripted run");
  },
});
