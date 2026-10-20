// tests/regressions/door-acoustics.test.js — regression(cycle39): closed
// doors attenuate sound like walls.
//
// BACKGROUND: src/world.js's DOORS / DYNAMIC BLOCKERS already made a closed
// door block isBlocked/isBlockedCircle/raycast/moveCircle exactly like a
// wall, but src/soundEvents.js's wallsBetween/effectiveRadius iterated
// `world.zone.walls` directly and had no notion of world.js's dynamic door
// state — a closed door was ACOUSTICALLY TRANSPARENT (see the old HONEST GAP
// notes in both files' headers, now replaced). The fix: world.js grew an
// additive world.closedDoorRects() live accessor (currently-closed doors as
// plain {x,y,w,h} AABBs); soundEvents.js's wallsBetween now counts entries
// from it exactly like wall entries, re-read fresh on every call (doors
// change state at runtime — a cached count would go stale). This file is the
// permanent named regression test for that fix (see BACKLOG.md/CLAUDE.md's
// "Fixed bugs -> permanent named test in tests/regressions/" rule).
//
// Same registry pattern as every other tests/*.test.js file: push onto the
// shared Game.selfTests list; test.js runs every entry headless with real
// exit codes.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const DT = 1 / 60;

// A spy "listener" satisfying the { x, y, hearNoise(x,y,strength), id? }
// shape emit/emitRadius expect (see src/soundEvents.js contract) — same
// helper as tests/soundEvents.test.js.
function spyListener(id, x, y) {
  var calls = [];
  return {
    id: id,
    x: x,
    y: y,
    hearNoise: function (nx, ny, strength) {
      calls.push({ x: nx, y: ny, strength: strength });
    },
    calls: calls,
  };
}

function laboratoryDoor(zone, id) {
  for (var i = 0; i < zone.doors.length; i++) {
    if (zone.doors[i].id === id) return zone.doors[i];
  }
  throw new Error("no door with id " + id + " found");
}

// ---------------------------------------------------------------------------
// Synthetic zone: exactly one door at x:3-4 (full zone height), no walls in
// the way of the segments used below. Reused across tests 1-2 for exact,
// hand-verifiable geometry (same "synthetic zone for exactness" convention
// tests/soundEvents.test.js's own effectiveRadius test uses).
// ---------------------------------------------------------------------------
function makeSynthDoorZone() {
  return {
    id: "synthDoorTest",
    name: "synthetic single-door test zone",
    bounds: { w: 20, h: 20 },
    walls: [{ x: 8, y: 0, w: 1, h: 20 }], // a REAL wall at x:8-9, for test 2's "+1 wall" case
    doors: [{ x: 3, y: 0, w: 1, h: 20, lock: null, id: "doorA" }], // x:3-4
    playerSpawn: { x: 0, y: 0 },
    exit: { x: 0, y: 0, w: 1, h: 1 },
    exits: [{ x: 0, y: 0, w: 1, h: 1, to: "none", entranceKey: "none" }],
    entrances: {},
    waypoints: [],
    waypoints2: [],
    darkZones: [],
    lockers: [],
    cameras: [],
    pickups: [],
    lasers: [],
    guardDoor: { x: 0, y: 0 },
  };
}

// ---------------------------------------------------------------------------
// 1. Synthetic: knock (10m) across a CLOSED door at 6m -> not heard (eff 5m);
//    same knock with the door OPEN -> heard strong. Source (0,10), listener
//    (6,10): the door (x:3-4) sits strictly between them (verified via
//    wallsBetween itself below), distance is exactly 6.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "regression(cycle39): closed doors attenuate sound like walls — synthetic knock: closed not heard at 6m, open heard",
  fn: function () {
    var zone = makeSynthDoorZone();
    var world = Game.createWorld(zone);
    var soundEvents = Game.createSoundEvents({ world: world });

    assert(!world.isDoorOpen("doorA"), "setup: expected doorA to start closed");

    var closedListener = spyListener("closed", 6, 10);
    var closedResults = soundEvents.emit(0, 10, "knock", [closedListener]);
    assert(
      soundEvents.wallsBetween(0, 10, 6, 10) === 1,
      "setup: expected exactly 1 crossing (the closed door) between (0,10) and (6,10)"
    );
    assert(
      Math.abs(closedResults[0].effRadius - 5) < 1e-9,
      "expected effRadius 5 (10 * 0.5^1) with the door closed, got " + closedResults[0].effRadius
    );
    assert(closedListener.calls.length === 0, "expected the knock NOT to be heard through the closed door at 6m (eff radius 5)");
    assert(closedResults[0].heard === false, "expected results[0].heard === false with the door closed");

    world.setDoorOpen("doorA", true);
    assert(soundEvents.wallsBetween(0, 10, 6, 10) === 0, "expected 0 crossings once the door is open");

    var openListener = spyListener("open", 6, 10);
    var openResults = soundEvents.emit(0, 10, "knock", [openListener]);
    assert(
      Math.abs(openResults[0].effRadius - 10) < 1e-9,
      "expected effRadius 10 (unattenuated) with the door open, got " + openResults[0].effRadius
    );
    assert(openListener.calls.length === 1, "expected the same knock to be heard once the door is open");
    assert(openListener.calls[0].strength === "strong", "expected 'strong' (knock is sharp), got " + openListener.calls[0].strength);
    assert(openResults[0].heard === true, "expected results[0].heard === true with the door open");
  },
});

// ---------------------------------------------------------------------------
// 2. wallsBetween counts: closed door alone = 1; open door alone = 0; closed
//    door + one real wall = 2 (eff radius 2.5 for a knock).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "regression(cycle39): wallsBetween counts a closed door as 1, open as 0, closed door + one wall as 2 (eff 2.5)",
  fn: function () {
    var zone = makeSynthDoorZone();
    var world = Game.createWorld(zone);
    var soundEvents = Game.createSoundEvents({ world: world });

    // (0,10)->(6,10): crosses ONLY the door (x:3-4); the real wall (x:8-9)
    // is past the listener, not between the two points.
    assert(
      soundEvents.wallsBetween(0, 10, 6, 10) === 1,
      "expected exactly 1 crossing (closed door only) for (0,10)->(6,10)"
    );

    world.setDoorOpen("doorA", true);
    assert(
      soundEvents.wallsBetween(0, 10, 6, 10) === 0,
      "expected 0 crossings once the door is open (the only obstacle in range)"
    );

    // (0,10)->(12,10): crosses the door (x:3-4) THEN the real wall (x:8-9) —
    // 2 distinct crossings when the door is closed.
    world.setDoorOpen("doorA", false);
    var crossed = soundEvents.wallsBetween(0, 10, 12, 10);
    assert(crossed === 2, "expected exactly 2 crossings (closed door + real wall) for (0,10)->(12,10), got " + crossed);

    var effRadius = soundEvents.effectiveRadius("knock", 0, 10, 12, 10);
    assert(
      Math.abs(effRadius - 2.5) < 1e-9,
      "expected knock effRadius 2.5 (10 * 0.5^2) through closed door + wall, got " + effRadius
    );
  },
});

// ---------------------------------------------------------------------------
// 3. Real Laboratory geometry: a guard-position sound check across the
//    closed L1 door (doorL1: x:18-22,y:17-18) doesn't reach as far as it
//    would with the door open. Source (20,18.8) is 0.8m south of the door
//    (inside the lobby's open floor, well clear of every other wall);
//    listener (20,12.8) is 6.0m north of it (inside the mid floor's open
//    west-wing area, x=20 clear of Wall B at x:24 and the L1/L3 door
//    columns) — the ONLY thing between them is doorL1 itself (Wall A is
//    split around exactly this x:18-22 gap, per src/world.js's Laboratory
//    comment). eff radius closed = 10*0.5 = 5 (< 6, not heard); eff radius
//    open = 10 (>= 6, would be heard) — the exact reachability gap this
//    regression is about.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "regression(cycle39): real Laboratory geometry — guard behind closed L1 door doesn't hear a lobby knock that would reach with the door open",
  fn: function () {
    var zone = Game.ZONES.laboratory;
    var door = laboratoryDoor(zone, "doorL1");
    var world = Game.createWorld(zone);
    var soundEvents = Game.createSoundEvents({ world: world });

    var srcX = 20;
    var srcY = door.y + door.h + 0.8; // 18.8 — lobby side, south of the door
    var dstX = 20;
    var dstY = door.y - 4.2; // 12.8 — mid-floor side, north of the door, dist 6.0

    assert(Math.abs(srcY - dstY - 6) < 1e-9, "setup: expected the two probe points to be exactly 6m apart");
    assert(!world.isDoorOpen("doorL1"), "setup: expected doorL1 to start closed");
    assert(
      soundEvents.wallsBetween(srcX, srcY, dstX, dstY) === 1,
      "setup: expected exactly 1 crossing (doorL1) between the lobby and mid-floor probe points"
    );

    var listener = spyListener("lab-guard", dstX, dstY);
    var closedResults = soundEvents.emit(srcX, srcY, "knock", [listener]);
    assert(
      Math.abs(closedResults[0].effRadius - 5) < 1e-9,
      "expected effRadius 5 through the closed L1 door, got " + closedResults[0].effRadius
    );
    assert(listener.calls.length === 0, "expected the guard NOT to hear a lobby knock 6m away through the closed L1 door");

    world.setDoorOpen("doorL1", true);
    assert(
      soundEvents.wallsBetween(srcX, srcY, dstX, dstY) === 0,
      "expected 0 crossings once doorL1 is open"
    );
    var openResults = soundEvents.emit(srcX, srcY, "knock", [listener]);
    assert(
      Math.abs(openResults[0].effRadius - 10) < 1e-9,
      "expected effRadius 10 (unattenuated) once doorL1 is open, got " + openResults[0].effRadius
    );
    assert(listener.calls.length === 1, "expected the same knock, at the same distance, to be heard once doorL1 is open");
  },
});

// ---------------------------------------------------------------------------
// 4. Full-stack engine test in the real Laboratory zone: a player knock near
//    the closed L1 door does NOT reach a guard stationed just beyond the
//    closed-door attenuated range on the far side (guard stays PATROL);
//    opening the door (toggling world.setDoorOpen directly, isolating this
//    test from the separate keycard-badge mechanic already covered by
//    tests/laboratory.test.js) and repeating the identical knock DOES reach
//    the guard (INVESTIGATE) — per src/guardAI.js's hearNoise contract, a
//    PATROL guard that hears a "strong" noise goes straight to INVESTIGATE.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "regression(cycle39): full-stack — guard beyond a closed door stays PATROL on a knock, INVESTIGATEs once the door opens",
  fn: function () {
    var zone = Game.ZONES.laboratory;
    var door = laboratoryDoor(zone, "doorL1");
    var guardY = door.y - 4.2; // 12.8, ~6m north through the door gap
    var engine = Game.createEngine({
      zoneData: zone,
      seed: 39,
      guardConfigs: [{ id: "door-test-g", spawn: { x: 20, y: guardY }, waypoints: [{ x: 20, y: guardY }] }],
    });

    // Player position: x=17.9 (just west of the door gap, x:18-22) is within
    // Game.SOUND.KNOCK_WALL_DIST (1.2) of Wall A's own west segment
    // (x:0-18,y:17-18) — a REAL, permanent wall, unlike the door itself — so
    // the knock verb fires identically whether doorL1 is open or closed
    // (verified below). The straight line from here to the guard still
    // crosses ONLY doorL1's gap (x:18-22), not Wall A itself: y drops below
    // Wall A's own y:17-18 band only once x has already crossed into the
    // door's x-range (verified via wallsBetween below), so this is a clean
    // test of the door's own acoustic behavior, not Wall A's.
    engine.player.x = 17.9;
    engine.player.y = door.y + door.h + 0.8; // 18.8
    assert(
      engine.world.isBlockedCircle(engine.player.x, engine.player.y, Game.SOUND.KNOCK_WALL_DIST),
      "setup: expected the player position to be adjacent to Wall A (real wall, not the door)"
    );
    assert(!engine.world.isDoorOpen("doorL1"), "setup: expected doorL1 to start closed");
    assert(
      engine.soundEvents.wallsBetween(engine.player.x, engine.player.y, 20, guardY) === 1,
      "setup: expected exactly 1 crossing (doorL1, closed) between the player and the guard"
    );
    assert(engine.guards[0].state === "PATROL", "setup: expected the guard to start PATROL");

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch", knock: true });
    var knockEvents = engine.events.filter(function (e) { return e.type === "knock"; });
    assert(knockEvents.length === 1, "setup: expected exactly one knock event, got " + knockEvents.length);

    // A few more ticks (no further knock, since knock is edge-triggered) to
    // let any noiseHeard/state transition settle.
    for (var i = 0; i < 10; i++) {
      engine.player.x = 17.9;
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch" });
    }
    assert(
      engine.guards[0].state === "PATROL",
      "expected the guard to stay PATROL — the closed L1 door should have attenuated the knock out of range, got " + engine.guards[0].state
    );

    // Open the door directly (isolating this test from the keycard-badge
    // mechanic, already covered by tests/laboratory.test.js) and repeat the
    // identical knock from the identical position. Wall A adjacency (not the
    // now-open door) is still what makes the knock verb fire.
    engine.world.setDoorOpen("doorL1", true);
    assert(
      engine.world.isBlockedCircle(engine.player.x, engine.player.y, Game.SOUND.KNOCK_WALL_DIST),
      "setup: expected the player to still be adjacent to Wall A once doorL1 is open"
    );
    assert(
      engine.soundEvents.wallsBetween(engine.player.x, engine.player.y, 20, guardY) === 0,
      "setup: expected 0 crossings once doorL1 is open"
    );
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch", knock: true });
    var knockEvents2 = engine.events.filter(function (e) { return e.type === "knock"; });
    assert(knockEvents2.length === 1, "expected exactly one more knock event once the door is open, got " + knockEvents2.length);

    var sawInvestigate = false;
    for (var t = 0; t < 30 && !sawInvestigate; t++) {
      engine.player.x = 17.9;
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch" });
      if (engine.guards[0].state === "INVESTIGATE") sawInvestigate = true;
    }
    assert(sawInvestigate, "expected the guard to reach INVESTIGATE within 30 ticks of the same knock once the L1 door is open");
  },
});

// ---------------------------------------------------------------------------
// 5. Determinism: two engines, identical seed + identical scripted inputs,
//    with a door-state change (closed -> open, via world.setDoorOpen)
//    happening mid-run -> identical event streams (snapshot() plus an
//    accumulated log of every noiseHeard/knock event across every tick).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "regression(cycle39): determinism holds for door-acoustics across identical scripted runs with a door-state change mid-run",
  fn: function () {
    var zone = Game.ZONES.laboratory;
    var door = laboratoryDoor(zone, "doorL1");
    var guardY = door.y - 4.2;

    function scriptedInput(tick) {
      return {
        moveX: 0,
        moveY: 0,
        run: false,
        stance: "crouch",
        knock: tick % 20 === 0, // edge-triggered knock, repeated every 20 ticks
      };
    }

    function run(seed) {
      var engine = Game.createEngine({
        zoneData: zone,
        seed: seed,
        guardConfigs: [{ id: "door-test-g", spawn: { x: 20, y: guardY }, waypoints: [{ x: 20, y: guardY }] }],
      });
      engine.player.x = 17.9; // adjacent to Wall A (real wall), so knock fires whether doorL1 is open or closed
      engine.player.y = door.y + door.h + 0.8;
      var log = []; // { tick, event } entries, so pre/post door-open can be told apart below
      for (var t = 0; t < 120; t++) {
        if (t === 60) engine.world.setDoorOpen("doorL1", true); // door state change mid-run, identical on both runs
        engine.player.x = 17.9;
        engine.player.y = door.y + door.h + 0.8;
        engine.tick(scriptedInput(t));
        for (var i = 0; i < engine.events.length; i++) log.push({ tick: t, event: engine.events[i] });
      }
      return { engine: engine, log: log };
    }

    var a = run(3939);
    var b = run(3939);

    var logA = JSON.stringify(a.log);
    var logB = JSON.stringify(b.log);
    assert(logA === logB, "expected identical accumulated event logs for identical seed+input+door-state-script, got:\n" + logA + "\nvs\n" + logB);

    var snapA = JSON.stringify(a.engine.snapshot());
    var snapB = JSON.stringify(b.engine.snapshot());
    assert(snapA === snapB, "expected identical final snapshots for identical seed+input+door-state-script");

    // Sanity: the pre-open knocks (t<60, door closed) must NOT have reached
    // the guard, and at least one post-open knock (t>=60, door open) must
    // have — otherwise this test would trivially pass without ever
    // exercising the door's acoustic transition.
    function guardHeardNoise(entry) {
      return entry.event.type === "noiseHeard" && entry.event.guardId === "door-test-g";
    }
    var preOpenHeard = a.log.some(function (entry) { return entry.tick < 60 && guardHeardNoise(entry); });
    assert(!preOpenHeard, "setup failed: expected NO noiseHeard for the guard while doorL1 was closed (t<60)");

    var postOpenHeard = a.log.some(function (entry) { return entry.tick >= 60 && guardHeardNoise(entry); });
    assert(postOpenHeard, "setup failed: expected at least one noiseHeard for the guard once doorL1 opened (t>=60)");
  },
});
