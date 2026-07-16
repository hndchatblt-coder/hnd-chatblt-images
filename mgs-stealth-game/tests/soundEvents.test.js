// tests/soundEvents.test.js — headless assertions for src/soundEvents.js and
// its engine.js integration (noise step + knock verb). Same registry pattern
// as tests/world.test.js/tests/engine.test.js: push onto the shared
// Game.selfTests list; test.js runs every entry headless, and boot.js runs
// the SAME list in-browser before the title screen — so every test here must
// be environment-portable (no Date.now/Math.random/node-only APIs).
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var DT = 1 / 60;
var zone = Game.ZONES.loadingDock;
var world = Game.createWorld(zone);
var soundEvents = Game.createSoundEvents({ world: world });

// A spy "listener" satisfying the { x, y, hearNoise(x,y,strength), id? }
// shape emit/emitRadius expect (see src/soundEvents.js contract) — records
// every hearNoise() call so tests can assert on strength/args without a real
// guard's FSM in the way.
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

// ---- 1. wallsBetween: 0 in open floor; 1 across the guard hut; >=2 across
// two obstacles. All three segments are real loadingDock geometry, verified
// against the walls array in src/world.js's zone comment:
//   - open floor: the south patrol corridor between waypoints SW (3,27) and
//     SE (37,27) — y=27 is clear of every wall (perimeter bottom is y:29-30;
//     every interior small-crate cluster sits at y:21-24 or above).
//   - 1 wall: (7,5)->(17,5) crosses ONLY the guard hut ({x:9,y:3,w:6,h:5} =
//     x:9-15,y:3-8); nothing else occupies y=5 in that x-range.
//   - >=2 walls: (15,15)->(35,15) crosses the center crate stack
//     ({x:17,y:13,w:6,h:5} = x:17-23,y:13-18) THEN the east container
//     ({x:26,y:9,w:6,h:11} = x:26-32,y:9-20); both spans include y=15.
Game.selfTests.push({
  name: "soundEvents wallsBetween: 0 in open floor, 1 across guard hut, >=2 across two obstacles",
  fn: function () {
    assert(
      soundEvents.wallsBetween(3, 27, 37, 27) === 0,
      "expected 0 walls along the open south corridor"
    );
    assert(
      soundEvents.wallsBetween(7, 5, 17, 5) === 1,
      "expected exactly 1 wall (guard hut) crossing (7,5)->(17,5)"
    );
    var crossed = soundEvents.wallsBetween(15, 15, 35, 15);
    assert(crossed >= 2, "expected >=2 walls crossing (15,15)->(35,15), got " + crossed);
  },
});

// ---- 2. effectiveRadius: knock (10) through 1 wall = 5, through 2 walls =
// 2.5. Uses a SYNTHETIC zone with two parallel vertical walls (for an EXACT,
// hand-verifiable wall count) rather than loadingDock geometry.
Game.selfTests.push({
  name: "soundEvents effectiveRadius: knock through 1 wall = 5, through 2 walls = 2.5",
  fn: function () {
    var synthZone = {
      id: "synthTest",
      name: "synthetic parallel-walls test zone",
      bounds: { w: 20, h: 20 },
      walls: [
        { x: 5, y: 0, w: 1, h: 20 }, // wall A: vertical strip at x:5-6
        { x: 10, y: 0, w: 1, h: 20 }, // wall B: vertical strip at x:10-11
      ],
      playerSpawn: { x: 0, y: 0 },
      exit: { x: 0, y: 0, w: 1, h: 1 },
      waypoints: [],
      darkZones: [],
    };
    var synthWorld = Game.createWorld(synthZone);
    var synthSound = Game.createSoundEvents({ world: synthWorld });

    // Source at x=0; listener at x=7 crosses only wall A (1 wall).
    var oneWallRadius = synthSound.effectiveRadius("knock", 0, 10, 7, 10);
    assert(
      Math.abs(oneWallRadius - 5) < 1e-9,
      "expected knock radius through 1 wall to be exactly 5, got " + oneWallRadius
    );

    // Listener at x=12 crosses both wall A and wall B (2 walls).
    var twoWallRadius = synthSound.effectiveRadius("knock", 0, 10, 12, 10);
    assert(
      Math.abs(twoWallRadius - 2.5) < 1e-9,
      "expected knock radius through 2 walls to be exactly 2.5, got " + twoWallRadius
    );
  },
});

// ---- 3. emit: guard at 7m in open, knock (10m, sharp) -> heard "strong".
Game.selfTests.push({
  name: "soundEvents emit: knock heard as strong at 7m in open floor",
  fn: function () {
    var listener = spyListener("spy-3", 17, 27); // south corridor, 7m from (10,27)
    var results = soundEvents.emit(10, 27, "knock", [listener]);
    assert(listener.calls.length === 1, "expected hearNoise to be called exactly once");
    assert(listener.calls[0].strength === "strong", "expected 'strong', got " + listener.calls[0].strength);
    assert(results[0].heard === true, "expected results[0].heard === true");
    assert(Math.abs(results[0].dist - 7) < 1e-9, "expected dist ~7, got " + results[0].dist);
  },
});

// ---- 4. emit: guard at 12m, knock -> not heard.
Game.selfTests.push({
  name: "soundEvents emit: knock at 12m in open floor is not heard",
  fn: function () {
    var listener = spyListener("spy-4", 22, 27); // south corridor, 12m from (10,27)
    var results = soundEvents.emit(10, 27, "knock", [listener]);
    assert(listener.calls.length === 0, "expected hearNoise NOT to be called at 12m (eff radius 10)");
    assert(results[0].heard === false, "expected results[0].heard === false");
  },
});

// ---- 5. emit: guard at 6m behind 1 wall (eff 5) -> not heard; same
// geometry knock moved closer (4m) -> heard. Geometry: SW small crate
// ({x:4,y:21,w:3,h:3} = x:4-7,y:21-24) sits between both pairs of points
// (all sampled at y=22.5, the crate's midline; all endpoints verified open
// floor).
Game.selfTests.push({
  name: "soundEvents emit: knock at 6m behind 1 wall not heard, same wall at 4m heard",
  fn: function () {
    var farListener = spyListener("spy-5-far", 7.5, 22.5);
    var farResults = soundEvents.emit(1.5, 22.5, "knock", [farListener]);
    assert(
      soundEvents.wallsBetween(1.5, 22.5, 7.5, 22.5) === 1,
      "setup: expected exactly 1 wall between the far pair"
    );
    assert(farListener.calls.length === 0, "expected knock at 6m behind 1 wall (eff 5) NOT to be heard");
    assert(Math.abs(farResults[0].effRadius - 5) < 1e-9, "expected effRadius 5, got " + farResults[0].effRadius);

    var nearListener = spyListener("spy-5-near", 7.5, 22.5);
    var nearResults = soundEvents.emit(3.5, 22.5, "knock", [nearListener]);
    assert(
      soundEvents.wallsBetween(3.5, 22.5, 7.5, 22.5) === 1,
      "setup: expected exactly 1 wall between the near pair (same wall, closer source)"
    );
    assert(nearListener.calls.length === 1, "expected knock at 4m behind 1 wall (eff 5) to be heard");
    assert(nearListener.calls[0].strength === "strong", "expected 'strong', got " + nearListener.calls[0].strength);
    assert(nearResults[0].heard === true, "expected results[0].heard === true");
  },
});

// ---- 6. soft sound: radius 8 (run) at 6m in open -> "faint".
Game.selfTests.push({
  name: "soundEvents emit: run noise (radius 8) at 6m in open floor is heard as faint",
  fn: function () {
    var listener = spyListener("spy-6", 16, 27); // south corridor, 6m from (10,27)
    var results = soundEvents.emit(10, 27, "run", [listener]);
    assert(listener.calls.length === 1, "expected hearNoise to be called exactly once");
    assert(listener.calls[0].strength === "faint", "expected 'faint', got " + listener.calls[0].strength);
    assert(results[0].heard === true, "expected results[0].heard === true");
  },
});

// ---- 7. Full-stack engine noise pipeline: a running player ~6m ahead of a
// stationary PATROL guard, in open floor, escalates the guard out of PATROL
// (faint noise -> SUSPICIOUS) within a few ticks.
Game.selfTests.push({
  name: "engine noise pipeline: running player 6m from a guard in open floor triggers SUSPICIOUS",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "noise-g1", spawn: { x: 25, y: 27 }, waypoints: [{ x: 25, y: 27 }] }],
    });
    engine.player.x = 19; // 6m west of the guard, same open south corridor
    engine.player.y = 27;

    var leftPatrol = false;
    for (var tick = 0; tick < 30 && !leftPatrol; tick++) {
      engine.tick({ moveX: 1, moveY: 0, run: true, stance: "stand" });
      if (engine.guards[0].state !== "PATROL") leftPatrol = true;
    }

    assert(leftPatrol, "expected guard to leave PATROL within 30 ticks of a running player 6m away");
    assert(
      engine.guards[0].state === "SUSPICIOUS",
      "expected guard state SUSPICIOUS (faint noise from PATROL), got " + engine.guards[0].state
    );
  },
});

// ---- 8. Engine knock verb: player adjacent to the west container, one
// input.knock=true tick emits exactly one "knock" event and a nearby guard
// hears it as "strong"; holding input.knock=true for 10 more ticks fires NO
// further "knock" events (edge-triggered, not level-triggered).
Game.selfTests.push({
  name: "engine knock verb: edge-triggered, emits once, heard strong, no repeat while held",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "knock-g1", spawn: { x: 18, y: 20 }, waypoints: [{ x: 18, y: 20 }] }],
    });
    // (14.6, 15) is 0.6m from the west container's east edge (x=14) — well
    // within Game.SOUND.KNOCK_WALL_DIST (1.2), verified adjacent below.
    engine.player.x = 14.6;
    engine.player.y = 15;
    assert(
      engine.world.isBlockedCircle(engine.player.x, engine.player.y, Game.SOUND.KNOCK_WALL_DIST),
      "setup: expected player position to be adjacent to a wall"
    );

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch", knock: true });

    var knockEvents = engine.events.filter(function (e) {
      return e.type === "knock";
    });
    var noiseHeardEvents = engine.events.filter(function (e) {
      return e.type === "noiseHeard" && e.guardId === "knock-g1";
    });
    assert(knockEvents.length === 1, "expected exactly one knock event, got " + knockEvents.length);
    assert(
      noiseHeardEvents.length === 1 && noiseHeardEvents[0].strength === "strong",
      "expected the guard to hear the knock as strong"
    );

    var repeatKnockEvents = 0;
    for (var tick = 0; tick < 10; tick++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch", knock: true });
      repeatKnockEvents += engine.events.filter(function (e) {
        return e.type === "knock";
      }).length;
    }
    assert(
      repeatKnockEvents === 0,
      "expected NO further knock events while input.knock is held true, got " + repeatKnockEvents
    );
  },
});

// ---- 9. Knock away from any wall (open center floor) fires no knock event.
Game.selfTests.push({
  name: "engine knock verb: knocking away from any wall fires no knock event",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "noknock-g1", spawn: { x: 20, y: 10 }, waypoints: [{ x: 20, y: 10 }] }],
    });
    engine.player.x = 20; // open center floor, verified >1.2m from every wall
    engine.player.y = 10;
    assert(
      !engine.world.isBlockedCircle(engine.player.x, engine.player.y, Game.SOUND.KNOCK_WALL_DIST),
      "setup: expected player position to NOT be adjacent to any wall"
    );

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", knock: true });

    var knockEvents = engine.events.filter(function (e) {
      return e.type === "knock";
    });
    assert(knockEvents.length === 0, "expected no knock event when not adjacent to a wall, got " + knockEvents.length);
  },
});
