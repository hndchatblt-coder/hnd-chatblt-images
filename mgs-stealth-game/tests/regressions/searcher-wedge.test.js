// tests/regressions/searcher-wedge.test.js — regression(cycle32): a guard
// dispatched to INVESTIGATE (or converging in ALERT/EVASION) an unreachable
// stimulus must give up gracefully long before src/guardAI.js's own
// GUARD.MAX_STATE_S invariant throws. Ledgered cycle 31 bug: guards move by
// direct-line-plus-slide (no pathfinding, see world.moveCircle) — a radio
// check-in searcher sent to a body position tucked behind warehouse shelving
// wedges against a wall, makes no progress, and eventually trips the
// MAX_STATE_S.INVESTIGATE (30s) ceiling, which THROWS. The invariant did its
// job; the fix (src/guardAI.js's WEDGE GIVE-UP contract, see its file header)
// is what must now keep the FSM from ever deserving it.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function dist(x1, y1, x2, y2) {
  var dx = x2 - x1;
  var dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

var DT = 1 / 60;
var KNOWN_STATES = ["PATROL", "SUSPICIOUS", "INVESTIGATE", "ALERT", "EVASION", "CAUTION", "SLEEPING"];

// ---- 1. THE REAL CASE ------------------------------------------------------
// Real warehouse zone, REAL w1 (outer perimeter)/w2 (center-aisle) guard
// placements — engine.createEngine's own default guardConfigsForZone, no
// custom spawn/waypoints. w2 is knocked out (guard.tranq(true), the same
// direct API sim.js's own "the clock is ticking" scenarios use) at (12, 20)
// -- inside the row2/row3 center-aisle band, but far enough down-aisle that
// w1's own outer-perimeter patrol has no clear direct-line-plus-slide
// approach to it (confirmed against the PRE-fix guardAI.js: this exact
// (preTicks=600, tranq at (12,20)) setup throws "guard w1 stuck in
// INVESTIGATE for 30.02s" without the fix in place). w1 is the only guard
// left on PATROL, so src/director.js's own missed-40s-radio-check-in dispatch
// (see its ESCALATION contract) sends w1 to investigate w2's frozen position
// once the check-in lands.
Game.selfTests.push({
  name: "regression(cycle32): dispatched searcher gives up gracefully on unreachable stimulus -- real warehouse w1/w2",
  fn: function () {
    var warehouse = Game.ZONES.warehouse;
    var engine = Game.createEngine({ seed: 42, zoneData: warehouse });
    var w1 = engine.guards[0];
    var w2 = engine.guards[1];

    // Park the player far away and out of the way for the whole run -- this
    // scenario isolates the environment-only check-in/searcher-dispatch
    // mechanic, same technique sim.js's own escalation scenarios use.
    engine.player.x = -1000;
    engine.player.y = -1000;

    // Let w1's real patrol run a little first so the check-in dispatch (which
    // fires on a fixed absolute-time schedule, independent of when we tranq)
    // lands with w1 genuinely elsewhere on its own perimeter loop -- not a
    // contrived coincidence, just realistic timing.
    for (var i = 0; i < 600; i++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
    }

    // Freeze w2 at a spot tucked in the center aisle, out of w1's own direct-
    // line reach -- "a radio-check-in searcher sent to a body position behind
    // warehouse shelving", per the file header.
    w2.x = 12;
    w2.y = 20;
    w2.tranq(true);
    assert(w2.state === "SLEEPING", "setup failed: expected w2 SLEEPING immediately after tranq(true)");

    var sawMissedCheckIn = false;
    var sawInvestigate = false;
    var returnedToPatrol = false;

    var WINDOW_S = 120; // generous window per the acceptance criteria
    var TICKS = Math.round(WINDOW_S / DT);
    for (var t = 0; t < TICKS; t++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch" });
      engine.player.x = -1000;
      engine.player.y = -1000;

      for (var e = 0; e < engine.events.length; e++) {
        if (engine.events[e].type === "missedCheckIn" && engine.events[e].guardId === "w2") {
          sawMissedCheckIn = true;
        }
      }
      if (w1.state === "INVESTIGATE") sawInvestigate = true;
      if (sawInvestigate && w1.state === "PATROL") returnedToPatrol = true;

      // The whole point: this must NEVER throw. update()/guard.tranq() calls
      // above already ran inside this same try-less loop -- a thrown Error
      // here fails the test with a real stack, exactly the crash this
      // regression guards against.
    }

    assert(sawMissedCheckIn, "expected a missedCheckIn event for w2 within " + WINDOW_S + "s");
    assert(sawInvestigate, "expected w1 to be dispatched into INVESTIGATE toward w2's frozen position");
    assert(
      KNOWN_STATES.indexOf(w1.state) !== -1,
      "expected w1 to end in a valid FSM state, got " + w1.state
    );
    assert(
      returnedToPatrol,
      "expected w1 to give up the unreachable search and return to PATROL within " + WINDOW_S + "s (never happened)"
    );
  },
});

// ---- 2. Direct wedge unit case --------------------------------------------
// A custom, minimal zone: a fully-enclosed 5x6m vault (four walls, NO gaps at
// all) with a stimulus dead in its center. The guard approaches along a pure
// north-south line (same x as the vault's center) so there is no secondary
// open axis to slide along at all -- the cleanest possible "wedge against a
// wall, make zero progress" case.
Game.selfTests.push({
  name: "regression(cycle32): direct wedge unit case -- guard gives up and returns to PATROL without ever arriving",
  fn: function () {
    var vaultZone = {
      walls: [
        { x: 8, y: 8, w: 6, h: 1 }, // north wall (x8-14, y8-9)
        { x: 8, y: 14, w: 6, h: 1 }, // south wall (x8-14, y14-15) -- no gap
        { x: 8, y: 8, w: 1, h: 7 }, // west wall (x8-9, y8-15)
        { x: 13, y: 8, w: 1, h: 7 }, // east wall (x13-14, y8-15)
      ],
    };
    var world = Game.createWorld(vaultZone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(777);

    var guard = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: 10.5, y: 20 },
      waypoints: [{ x: 10.5, y: 1020 }], // far off in the same direction, irrelevant to this test
      id: "vault-wedge",
    });

    var stimX = 10.5;
    var stimY = 11.5; // dead center of the fully-enclosed vault -- unreachable
    var player = { x: -1000, y: -1000, visionProfile: function () { return 1; } };

    guard.hearNoise(stimX, stimY, "strong");
    assert(guard.state === "INVESTIGATE", "expected immediate INVESTIGATE on strong noise, got " + guard.state);

    var minDist = Infinity;
    var backToPatrol = false;
    var TICKS = Math.round(40 / DT); // generous: well past MAX_STATE_S.INVESTIGATE (30s)
    for (var i = 0; i < TICKS; i++) {
      guard.update(DT, { player: player });
      var d = dist(guard.x, guard.y, stimX, stimY);
      if (d < minDist) minDist = d;
      if (guard.state === "PATROL") {
        backToPatrol = true;
        break;
      }
    }

    assert(
      minDist > Game.GUARD.ARRIVE_DIST,
      "expected the guard to NEVER actually arrive at the fully-enclosed stimulus (min dist " + minDist + ")"
    );
    assert(backToPatrol, "expected the guard to give up and return to PATROL within 40s (instead of tripping MAX_STATE_S.INVESTIGATE)");
  },
});

// ---- 3. Reachable stimulus still works exactly as before -------------------
// Same shape as tests/guardAI.test.js's own pre-existing INVESTIGATE test
// (untouched, still runs in this same suite) -- a nearby, unobstructed
// stimulus must still be walked to, searched, and returned from normally.
// This is the no-regression check: WEDGE GIVE-UP must never fire on a normal,
// reachable investigation.
Game.selfTests.push({
  name: "regression(cycle32): reachable stimulus still investigates and returns to PATROL normally (no regression)",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(9001);

    var gx = 20,
      gy = 20;
    var guard = Game.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: gx, y: gy },
      waypoints: [{ x: gx + 1000, y: gy }],
      id: "reachable-check",
    });

    var nx = gx + 3,
      ny = gy; // 3m away, clear open floor -- INVESTIGATE_SPEED 2.0 m/s -> ~1.5s travel
    var player = { x: -1000, y: -1000, visionProfile: function () { return 1; } };

    guard.hearNoise(nx, ny, "strong");
    assert(guard.state === "INVESTIGATE", "expected immediate INVESTIGATE on strong noise, got " + guard.state);

    var minDist = Infinity;
    var backToPatrol = false;
    var TICKS = Math.round(15 / DT); // ~1.5s travel + 8s search + buffer
    for (var i = 0; i < TICKS; i++) {
      guard.update(DT, { player: player });
      var d = dist(guard.x, guard.y, nx, ny);
      if (d < minDist) minDist = d;
      if (guard.state === "PATROL") {
        backToPatrol = true;
        break;
      }
    }

    assert(minDist <= Game.GUARD.ARRIVE_DIST, "expected the guard to arrive within ARRIVE_DIST of a reachable stimulus, min dist " + minDist);
    assert(backToPatrol, "expected the guard to return to PATROL after a normal investigate completes");
  },
});

// ---- 4. Determinism --------------------------------------------------------
// Two identically-seeded runs of the SAME wedge scenario (custom enclosed
// zone from test 2 above) must produce byte-for-byte identical (x, y, state)
// traces -- WEDGE GIVE-UP's progress tracker is tick-counted, not an
// accumulated dt-seconds float, specifically so it can never introduce any
// nondeterminism (see src/guardAI.js's own file header note).
Game.selfTests.push({
  name: "regression(cycle32): wedge give-up is deterministic across identical seeded runs",
  fn: function () {
    var vaultZone = {
      walls: [
        { x: 8, y: 8, w: 6, h: 1 },
        { x: 8, y: 14, w: 6, h: 1 },
        { x: 8, y: 8, w: 1, h: 7 },
        { x: 13, y: 8, w: 1, h: 7 },
      ],
    };
    var stimX = 10.5;
    var stimY = 11.5;
    var player = { x: -1000, y: -1000, visionProfile: function () { return 1; } };
    var TICKS = Math.round(40 / DT);

    function runOnce() {
      var world = Game.createWorld(vaultZone);
      var vision = Game.createVision({ world: world });
      var rng = Game.createRng(31337);
      var guard = Game.createGuard({
        world: world,
        vision: vision,
        rng: rng,
        spawn: { x: 10.5, y: 20 },
        waypoints: [{ x: 10.5, y: 1020 }],
        id: "vault-wedge-determinism",
      });
      guard.hearNoise(stimX, stimY, "strong");

      var trace = [];
      for (var i = 0; i < TICKS; i++) {
        guard.update(DT, { player: player });
        trace.push(guard.x.toFixed(6) + "," + guard.y.toFixed(6) + "," + guard.state);
      }
      return trace;
    }

    var traceA = runOnce();
    var traceB = runOnce();

    assert(traceA.length === traceB.length, "expected both traces to have the same length");
    for (var i = 0; i < traceA.length; i++) {
      assert(
        traceA[i] === traceB[i],
        "trace diverged at tick " + i + ": " + traceA[i] + " !== " + traceB[i]
      );
    }
  },
});
