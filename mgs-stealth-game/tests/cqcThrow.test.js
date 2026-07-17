// tests/cqcThrow.test.js — headless assertions for the CQC THROW risk/reward
// fork (Q HOLD) added alongside the existing CQC takedown (Q TAP): the new
// STUNNED state in src/guardAI.js (guard.cqcThrow()/enterStun()/tickStunned,
// the wake-into-SUSPICIOUS path, and the tranq()/cqc() "follow-up finisher"
// conversion) and the new THROW VERB in src/engine.js (tryCqcThrow(), the
// displacement-through-world.moveCircle + STUNNED + "bodyDrop" thud effect,
// input.cqcThrow's edge-triggered wiring). Same registry pattern as every
// other tests/*.js file: push onto the shared Game.selfTests list; test.js
// runs every entry and reports ok/FAIL with real exit codes. Follows
// tests/cqc.test.js's own conventions (real engines, teleport-the-guard/
// teleport-the-player tricks, guard-level direct-call tricks for save/
// restore since saveState.restore() only ever rebuilds a zone's DEFAULT
// guard roster — see test 10 below).
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

// ---- 1. Q TAP still chokes -- existing behavior pinned, unaffected by the
// new hold/throw fork sharing the same key. -------------------------------

Game.selfTests.push({
  name: "cqcThrow: a plain tap (input.cqc) still chokes exactly as before -- SLEEPING, not STUNNED",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "tap-tg", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    // 1.3m due WEST of the guard -- directly behind its east-facing cone.
    engine.player.x = 18.7;
    engine.player.y = 5;
    engine.player.facing = 0;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqc: true });

    var cqcEvents = engine.events.filter(function (e) { return e.type === "cqc"; });
    var throwEvents = engine.events.filter(function (e) { return e.type === "cqcThrow"; });
    assert(cqcEvents.length === 1 && cqcEvents[0].guardId === "tap-tg", "expected one cqc event for tap-tg, got " + JSON.stringify(engine.events));
    assert(throwEvents.length === 0, "a plain tap must never emit a cqcThrow event, got " + JSON.stringify(engine.events));
    assert(engine.guards[0].state === "SLEEPING", "expected the tapped guard SLEEPING, got " + engine.guards[0].state);
    // Choke is silent and stationary -- the guard must not have moved.
    assert(engine.guards[0].x === 20 && engine.guards[0].y === 5, "a choke must not displace the guard, got " + engine.guards[0].x + "," + engine.guards[0].y);
  },
});

// ---- 2. Q HOLD throws: STUNNED, displaced ~2m, cqcThrow event, thud heard -

Game.selfTests.push({
  name: "cqcThrow: a hold (input.cqcThrow) throws -- STUNNED, displaced ~2m along the player's facing, cqcThrow event, thud heard by a bystander",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [
        { id: "throw-tg", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] },
        { id: "throw-bystander", spawn: { x: 25, y: 5 }, waypoints: [{ x: -975, y: 5 }] },
      ],
    });
    engine.player.x = 18.7;
    engine.player.y = 5;
    engine.player.facing = 0;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqcThrow: true });

    var throwEvents = engine.events.filter(function (e) { return e.type === "cqcThrow"; });
    assert(throwEvents.length === 1 && throwEvents[0].guardId === "throw-tg", "expected one cqcThrow event for throw-tg, got " + JSON.stringify(engine.events));
    assert(engine.guards[0].state === "STUNNED", "expected the thrown guard STUNNED immediately, got " + engine.guards[0].state);

    var displaced = dist(20, 5, engine.guards[0].x, engine.guards[0].y);
    assert(Math.abs(displaced - 2.0) < 0.01, "expected ~2.0m displacement along the player's facing, got " + displaced.toFixed(3) + "m");
    assert(engine.guards[0].x > 21.9, "expected the guard displaced EAST (the player's facing), got x=" + engine.guards[0].x);

    var heardStrong = engine.events.some(function (e) {
      return e.type === "noiseHeard" && e.guardId === "throw-bystander" && e.strength === "strong";
    });
    assert(heardStrong, "expected the bystander to have heard the throw's thud as a STRONG (sharp) noise, got " + JSON.stringify(engine.events));
  },
});

// ---- 3. Throw into a wall: slides/stops, never ends up inside a wall ------

Game.selfTests.push({
  name: "cqcThrow: thrown toward a wall -- slides along it, stops, and never ends up inside it",
  fn: function () {
    // Guard sits just south of the SW small-crates obstacle
    // ({x:4,y:21,w:3,h:3} in loadingDock), facing due north (straight at the
    // crate). The player throws it diagonally (NW): the x-component (open
    // floor) applies, the y-component (straight into the crate) does not --
    // world.moveCircle resolves each axis independently, so this is a real
    // "slides along the obstacle" case, not a full-displacement clip-through.
    var engine = Game.createEngine({
      guardConfigs: [{ id: "wall-tg", spawn: { x: 5.5, y: 25 }, waypoints: [{ x: 5.5, y: -1000 }] }],
    });
    var g = engine.guards[0];
    assert(Math.abs(g.facing - -Math.PI / 2) < 1e-9, "setup failed: expected wall-tg to face due north, got " + g.facing);
    assert(!engine.world.isBlockedCircle(g.x, g.y, g.radius), "setup failed: guard spawn already blocked");

    engine.player.x = 5.5;
    engine.player.y = 26.3; // 1.3m south -- behind the north-facing guard
    engine.player.facing = (-3 * Math.PI) / 4; // NW: throws partly INTO the crate

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqcThrow: true });

    assert(g.state === "STUNNED", "expected the guard STUNNED after the throw, got " + g.state);
    assert(!engine.world.isBlockedCircle(g.x, g.y, g.radius), "guard ended up OVERLAPPING a wall -- clipped through, got " + g.x + "," + g.y);

    var displaced = dist(5.5, 25, g.x, g.y);
    assert(displaced > 0.01, "expected SOME displacement (the open-floor axis is unobstructed), got " + displaced.toFixed(3) + "m");
    assert(displaced < 1.99, "expected LESS than the full 2.0m displacement -- the wall should have stopped the blocked axis, got " + displaced.toFixed(3) + "m");
    // The blocked axis (y, straight into the crate) must not have moved at all.
    assert(Math.abs(g.y - 25) < 1e-9, "expected the y-axis (blocked by the crate) to be fully rejected, got y=" + g.y);
  },
});

// ---- 4. Stun expires -> SUSPICIOUS at own position (NOT PATROL, NOT       -
// INVESTIGATE) -- pinned difference from a tranq/choke wake. --------------

Game.selfTests.push({
  name: "cqcThrow: STUNNED expires into SUSPICIOUS at its own position -- NOT the tranq wake's INVESTIGATE, meter reset to 0",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "wake-tg", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    engine.player.x = 18.7;
    engine.player.y = 5;
    engine.player.facing = 0;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqcThrow: true });

    var g = engine.guards[0];
    var thrownX = g.x;
    var thrownY = g.y;
    assert(g.state === "STUNNED", "setup failed: expected STUNNED immediately after the throw");

    // Vanish -- well outside any vision range -- so a fresh SUSPICIOUS wake
    // has nothing to immediately re-confirm.
    engine.player.x = -1000;
    engine.player.y = -1000;

    var woke = null;
    var TOTAL_TICKS = Math.round((Game.GUARD.STUN_S + 2) / DT);
    for (var i = 0; i < TOTAL_TICKS; i++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
      if (g.state !== "STUNNED") {
        woke = g.state;
        break;
      }
    }

    assert(woke === "SUSPICIOUS", "expected the stunned guard to wake into SUSPICIOUS, got " + woke);
    assert(g.stimulus && Math.abs(g.stimulus.x - thrownX) < 1e-6 && Math.abs(g.stimulus.y - thrownY) < 1e-6,
      "expected the wake stimulus to be the guard's OWN (thrown) position, got " + JSON.stringify(g.stimulus) + " vs (" + thrownX + "," + thrownY + ")");
    assert(g.meter === 0, "expected meter reset to 0 on a STUNNED wake, got " + g.meter);
  },
});

// ---- 5. Stunned guard is choke-able -> SLEEPING (follow-up finisher) -----

Game.selfTests.push({
  name: "cqcThrow: a STUNNED guard can be CQC-choked (follow-up finisher) -- converts straight to SLEEPING",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "finish-tg", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    engine.player.x = 18.7;
    engine.player.y = 5;
    engine.player.facing = 0;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqcThrow: true });

    var g = engine.guards[0];
    assert(g.state === "STUNNED", "setup failed: expected STUNNED after the throw");

    // Close distance again -- reposition behind the guard's NEW position
    // (facing is unchanged by a throw, only x/y move).
    engine.player.x = g.x - 1.3;
    engine.player.y = g.y;
    engine.player.facing = g.facing;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqc: true });

    var cqcEvents = engine.events.filter(function (e) { return e.type === "cqc"; });
    assert(cqcEvents.length === 1 && cqcEvents[0].guardId === "finish-tg", "expected a cqc event finishing off the stunned guard, got " + JSON.stringify(engine.events));
    assert(g.state === "SLEEPING", "expected the STUNNED guard converted to SLEEPING by the follow-up choke, got " + g.state);
  },
});

// ---- 6. Stunned guard is NOT re-throwable --------------------------------

Game.selfTests.push({
  name: "cqcThrow: a STUNNED guard cannot be re-thrown -- cqcMiss, no second displacement, stays STUNNED",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "rethrow-tg", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    engine.player.x = 18.7;
    engine.player.y = 5;
    engine.player.facing = 0;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqcThrow: true });

    var g = engine.guards[0];
    var posAfterFirst = { x: g.x, y: g.y };
    assert(g.state === "STUNNED", "setup failed: expected STUNNED after the first throw");

    // Release the Q edge (input.cqcThrow is edge-triggered) before the second attempt.
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });

    engine.player.x = g.x - 1.3;
    engine.player.y = g.y;
    engine.player.facing = g.facing;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqcThrow: true });

    var throwEvents = engine.events.filter(function (e) { return e.type === "cqcThrow"; });
    var missEvents = engine.events.filter(function (e) { return e.type === "cqcMiss"; });
    assert(throwEvents.length === 0, "expected NO second cqcThrow event on an already-STUNNED guard, got " + JSON.stringify(engine.events));
    assert(missEvents.length === 1, "expected a cqcMiss (busy) response instead, got " + JSON.stringify(engine.events));
    assert(g.state === "STUNNED", "expected the guard to remain STUNNED, got " + g.state);
    assert(g.x === posAfterFirst.x && g.y === posAfterFirst.y, "expected NO further displacement from the rejected second throw, got " + g.x + "," + g.y + " vs " + JSON.stringify(posAfterFirst));
  },
});

// ---- 7. The thud pulls a nearby second guard to INVESTIGATE (the risk) ---

Game.selfTests.push({
  name: "cqcThrow: the SHARP thud pulls a nearby second guard straight to INVESTIGATE (the risk half of the risk/reward)",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [
        { id: "risk-tg", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] },
        { id: "risk-bystander", spawn: { x: 25, y: 5 }, waypoints: [{ x: -975, y: 5 }] },
      ],
    });
    engine.player.x = 18.7;
    engine.player.y = 5;
    engine.player.facing = 0;

    assert(engine.guards[1].state === "PATROL", "setup failed: expected the bystander on PATROL before the throw");
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqcThrow: true });

    assert(engine.guards[1].state === "INVESTIGATE", "expected the bystander pulled straight to INVESTIGATE by the throw's thud, got " + engine.guards[1].state);
    assert(engine.squad.phase === "INFILTRATION", "an INVESTIGATE-triggering noise is not itself an alert -- expected squad.phase still INFILTRATION, got " + engine.squad.phase);
  },
});

// ---- 8. Determinism: identical seed + input -> identical snapshot --------

Game.selfTests.push({
  name: "cqcThrow: determinism -- identical seed + scripted input (including a throw) -> identical final snapshot",
  fn: function () {
    function scriptedInput(tick) {
      if (tick === 0) return { moveX: 0, moveY: 0, run: false, stance: "stand", cqcThrow: true };
      if (tick < 60) return { moveX: 0, moveY: 0, run: false, stance: "stand" };
      var t2 = tick - 60;
      return {
        moveX: Math.sin(t2 * 0.031),
        moveY: Math.cos(t2 * 0.047),
        run: tick % 9 === 0,
        stance: "stand",
      };
    }

    var guardConfigs = [{ id: "det-tg", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }];
    var engineA = Game.createEngine({ seed: 20260716, guardConfigs: guardConfigs });
    var engineB = Game.createEngine({ seed: 20260716, guardConfigs: guardConfigs });
    engineA.player.x = engineB.player.x = 18.7;
    engineA.player.y = engineB.player.y = 5;
    engineA.player.facing = engineB.player.facing = 0;

    var sawThrow = false;
    for (var t = 0; t < 400; t++) {
      var input = scriptedInput(t);
      engineA.tick(input);
      engineB.tick(input);
      if (engineA.events.some(function (e) { return e.type === "cqcThrow"; })) sawThrow = true;
    }

    assert(sawThrow, "sanity: expected the scripted throw to have actually connected during this run");
    var snapA = JSON.stringify(engineA.snapshot());
    var snapB = JSON.stringify(engineB.snapshot());
    assert(snapA === snapB, "expected identical snapshots for identical seed+input, got:\n" + snapA + "\nvs\n" + snapB);
  },
});

// ---- 9. A STUNNED guard is NOT draggable (only SLEEPING bodies drag) -----

Game.selfTests.push({
  name: "cqcThrow: a STUNNED guard is NOT a valid drag target -- only an actually-SLEEPING body attaches",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "drag-tg", spawn: { x: 20, y: 5 }, waypoints: [{ x: 1020, y: 5 }] }],
    });
    engine.player.x = 18.7;
    engine.player.y = 5;
    engine.player.facing = 0;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", cqcThrow: true });

    var g = engine.guards[0];
    assert(g.state === "STUNNED", "setup failed: expected STUNNED after the throw");

    engine.player.x = g.x - 0.5;
    engine.player.y = g.y;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });

    assert(engine.dragging === null, "expected a STUNNED guard to be ineligible for drag-attach, got engine.dragging=" + engine.dragging);
  },
});

// ---- 10. Save/restore mid-stun round-trips: remaining stun time correct --

Game.selfTests.push({
  name: "cqcThrow: save/restore mid-STUN round-trips -- remaining stun time is preserved, not restarted",
  fn: function () {
    // saveState.restore() always rebuilds a zone's DEFAULT guard roster (see
    // src/saveState.js contract) -- so, exactly like
    // tests/saveState.test.js's own REPLAY GATE tests, this uses the
    // DEFAULT engine/guard ("g1") and drives STUNNED via a direct
    // guard.cqcThrow() call (bypassing the full THROW VERB pipeline, which
    // isn't the point of this test -- the point is the FSM/timer round-trip).
    var engine = Game.createEngine({ seed: 20260716002 });
    var g1 = engine.guards[0];
    g1.cqcThrow();
    assert(g1.state === "STUNNED", "setup failed: expected g1 STUNNED immediately after cqcThrow()");

    var ELAPSED_BEFORE_SAVE_S = 2.0;
    for (var i = 0; i < Math.round(ELAPSED_BEFORE_SAVE_S / DT); i++) engine.tick();
    assert(g1.state === "STUNNED", "setup failed: guard woke too early, before the save");

    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engine)));
    var restored = saveState.restore(save);
    var rg = restored.guards[0];
    assert(rg.id === "g1", "setup failed: expected the restored roster's first guard to be g1, got " + rg.id);
    assert(rg.state === "STUNNED", "expected the restored guard still STUNNED, got " + rg.state);

    var remaining = Game.GUARD.STUN_S - ELAPSED_BEFORE_SAVE_S;

    // Tick to just short of the CORRECT remaining window -- must still be
    // STUNNED (proves the clock did NOT restart at the full GUARD.STUN_S).
    var justUnder = Math.round((remaining - 0.1) / DT);
    for (var j = 0; j < justUnder; j++) restored.tick();
    assert(rg.state === "STUNNED", "expected the restored guard still STUNNED just short of its correct remaining stun window, got " + rg.state);

    // Tick past the correct remaining window -- must have woken by now.
    for (var k = 0; k < Math.round(0.3 / DT); k++) restored.tick();
    assert(rg.state === "SUSPICIOUS", "expected the restored guard to wake into SUSPICIOUS right on schedule (remaining stun time honored), got " + rg.state);
  },
});
