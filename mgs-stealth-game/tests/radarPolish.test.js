// tests/radarPolish.test.js — headless assertions for the readability polish
// batch (cycle 18 backlog item): src/radar.js's new playerHidden/dragging
// model flags, camera meter passthrough, and the shared pure
// Game.radarCameraColor(meter) ramp helper both src/radar.js's 2D view and
// src/render.js's 3D camera cones consume. MODEL-SIDE ONLY — same posture as
// tests/radar.test.js's own header: the canvas/THREE view halves are
// deliberately untested headless by design (screenshot.js is what verifies
// pixels). Same registry pattern as every other tests/*.test.js file: push
// onto the shared Game.selfTests list; test.js runs every entry and reports
// ok/FAIL with real exit codes.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var DT = 1 / 60;

// ---------------------------------------------------------------------------
// 1. playerHidden: false by default, true once hidden in a locker, false
//    again after stepping back out — same G-near-a-locker HIDE mechanism as
//    tests/lockerChecks.test.js/tests/cqc.test.js.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "radarPolish: radarModel.playerHidden reflects engine.playerHidden across hide/exit",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var locker0 = zone.lockers[0]; // {x:2, y:9, facing:0}

    var engine = Game.createEngine({ zoneData: zone });

    var before = Game.radarModel(engine);
    assert(before.playerHidden === false, "expected playerHidden false before hiding");

    engine.player.x = locker0.x;
    engine.player.y = locker0.y;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true }); // HIDE
    assert(engine.playerHidden === true, "setup failed: player never hid");

    var hidden = Game.radarModel(engine);
    assert(hidden.playerHidden === true, "expected radarModel.playerHidden true while engine.playerHidden is true");

    // A G press is EDGE-TRIGGERED (src/engine.js's own DRAG VERB / LOCKER
    // VERB contract, private prevDrag closure) -- drag must go false for at
    // least one tick before the NEXT drag:true registers as a fresh edge,
    // same as tests/cqc.test.js's own attach-then-release tests do.
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });

    // Press G again to EXIT the locker (see src/engine.js's LOCKER VERB
    // contract: playerHidden true -> next G press always means exit).
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(engine.playerHidden === false, "setup failed: player never exited the locker");

    var after = Game.radarModel(engine);
    assert(after.playerHidden === false, "expected radarModel.playerHidden false again after exiting");
  },
});

// ---------------------------------------------------------------------------
// 2. dragging: false by default, true once attached to a sleeping guard,
//    false again after release — same drag-attach mechanism as
//    tests/cqc.test.js's own drag tests.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "radarPolish: radarModel.dragging reflects engine.dragging across attach/release",
  fn: function () {
    var engine = Game.createEngine({
      guardConfigs: [{ id: "sleeper-radar-polish", spawn: { x: 21, y: 25 }, waypoints: [{ x: 1021, y: 25 }] }],
    });
    engine.guards[0].tranq(true); // headshot -> instantly SLEEPING
    assert(engine.guards[0].state === "SLEEPING", "setup failed: guard should be SLEEPING");

    engine.player.x = 20;
    engine.player.y = 25;
    engine.player.facing = 0;

    var before = Game.radarModel(engine);
    assert(before.dragging === false, "expected dragging false before attaching");

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true }); // ATTACH
    assert(engine.dragging === "sleeper-radar-polish", "setup failed: drag never attached");

    var dragging = Game.radarModel(engine);
    assert(dragging.dragging === true, "expected radarModel.dragging true (coerced from the guardId) while attached");

    // G is EDGE-TRIGGERED (see test 1's own note above) -- a no-drag tick in
    // between lets the next drag:true register as a fresh press.
    engine.tick({ moveX: 1, moveY: 0, run: false, stance: "stand" });

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true }); // RELEASE
    assert(engine.dragging === null, "setup failed: drag never released");

    var after = Game.radarModel(engine);
    assert(after.dragging === false, "expected radarModel.dragging false again after release");
  },
});

// ---------------------------------------------------------------------------
// 3. Camera meter passthrough: radarModel's cameras[i].meter always mirrors
//    engine.director.cameraStates()[i].meter exactly, at boot AND after the
//    meter has moved (not just a coincidental 0 === 0 match at tick 0).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "radarPolish: radarModel camera entries' meter mirrors engine.director.cameraStates() exactly, including after it moves",
  fn: function () {
    var zone = Game.ZONES.warehouse;
    var cam0 = zone.cameras[0]; // {x:13.9, y:13.5, facing:PI, ...}
    var engine = Game.createEngine({ zoneData: zone, seed: 4242 });

    // At boot (before any tick), every camera reports meter 0 per
    // src/director.js's own contract -- confirm the model matches that.
    var bootModel = Game.radarModel(engine);
    var bootStates = engine.director.cameraStates();
    assert(bootModel.cameras.length === bootStates.length, "expected one radar camera entry per director camera state");
    for (var i = 0; i < bootStates.length; i++) {
      assert(bootModel.cameras[i].meter === bootStates[i].meter, "camera " + i + " meter mismatch at boot");
    }

    // Sit the player dead-center in camera 0's cone, close in, so the meter
    // actually climbs off zero (mirrors tests/cameras.test.js's own "5m
    // dead-center" setup, just close enough here that a handful of ticks is
    // plenty to move the needle).
    engine.player.x = cam0.x - 3; // camera faces PI (west), so -x is ahead of it
    engine.player.y = cam0.y;
    engine.player.stance = "stand";

    var sawNonZero = false;
    for (var t = 0; t < 90; t++) {
      engine.tick({ moveX: 0, moveY: 0 });
      var liveModel = Game.radarModel(engine);
      var liveStates = engine.director.cameraStates();
      if (liveStates[0].meter > 0) sawNonZero = true;
      // A close, dead-center camera meter can climb all the way to ALERT_AT
      // and trip squad ALERT (see src/director.js's own broadcastAlert note)
      // within this window -- once jammed, radarModel's cameras array is
      // DELIBERATELY emptied (test 5 below pins that exact behavior), so a
      // straight per-index meter comparison against the still-populated
      // director.cameraStates() would no longer be an apples-to-apples
      // check. Stop comparing (not a failure) the instant that happens --
      // this test's own job is only the UNJAMMED passthrough guarantee.
      if (liveModel.jammed) break;
      for (var j = 0; j < liveStates.length; j++) {
        assert(
          liveModel.cameras[j].meter === liveStates[j].meter,
          "camera " + j + " meter diverged from director.cameraStates() at tick " + t
        );
      }
    }
    assert(sawNonZero, "expected camera 0's meter to have actually risen off zero during this run (test would be meaningless otherwise)");
  },
});

// ---------------------------------------------------------------------------
// 4. Color ramp helper: Game.radarCameraColor(meter) is a pure function of
//    meter, reading cyan-ish at 0, amber-ish at SUSPICIOUS_AT, red-ish near
//    1.0, with a monotonic (non-decreasing) red channel across the whole
//    0..1 range.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "radarPolish: Game.radarCameraColor ramps cyan(0) -> amber(SUSPICIOUS_AT) -> red(~1.0), R monotonic non-decreasing",
  fn: function () {
    assert(typeof Game.radarCameraColor === "function", "expected Game.radarCameraColor to be exported");

    var susAt = Game.VISION.SUSPICIOUS_AT;

    var cyan = Game.radarCameraColor(0);
    assert(
      cyan.g > cyan.r && cyan.b > cyan.r,
      "expected cyan-ish at meter 0 (G and B both above R), got " + JSON.stringify(cyan)
    );
    assert(Math.abs(cyan.g - cyan.b) <= 30, "expected G and B roughly balanced at meter 0 (cyan, not green or blue), got " + JSON.stringify(cyan));

    var amber = Game.radarCameraColor(susAt);
    assert(
      amber.r > amber.g && amber.g > amber.b,
      "expected amber-ish at meter SUSPICIOUS_AT (R > G > B), got " + JSON.stringify(amber)
    );

    var red = Game.radarCameraColor(0.95);
    assert(
      red.r > red.g + 60 && red.r > red.b + 60,
      "expected red-ish at meter 0.95 (R well above both G and B), got " + JSON.stringify(red)
    );

    // Monotonic (non-decreasing) red-channel increase across the full range.
    var prevR = -1;
    for (var m = 0; m <= 1.0001; m += 0.05) {
      var mm = Math.min(m, 1);
      var rgb = Game.radarCameraColor(mm);
      assert(rgb.r >= prevR, "expected R channel non-decreasing as meter rises, dropped at meter=" + mm.toFixed(2));
      prevR = rgb.r;
    }
    // And it actually DID rise somewhere (not a flat constant the whole way).
    assert(Game.radarCameraColor(1).r > Game.radarCameraColor(0).r, "expected R to have genuinely risen from meter 0 to meter 1");

    // Pure function: same input, same output, every time; out-of-range
    // inputs clamp rather than producing nonsense.
    assert(
      JSON.stringify(Game.radarCameraColor(0.5)) === JSON.stringify(Game.radarCameraColor(0.5)),
      "expected radarCameraColor to be a pure function of meter"
    );
    assert(
      JSON.stringify(Game.radarCameraColor(1)) === JSON.stringify(Game.radarCameraColor(5)),
      "expected meter > 1 to clamp to the same result as meter 1"
    );
    assert(
      JSON.stringify(Game.radarCameraColor(0)) === JSON.stringify(Game.radarCameraColor(-5)),
      "expected meter < 0 to clamp to the same result as meter 0"
    );
  },
});

// ---------------------------------------------------------------------------
// 5. Jammed model: cameras are emptied exactly like guards -- no meter (or
//    position) leak while the radar is dark. PINS the CURRENT, deliberate
//    behavior documented in src/radar.js's own file header (cameras array is
//    built from `jammed ? [] : cameraStates.map(...)`, same rule as guards):
//    a camera's live sweep direction/meter is exactly the tactical intel the
//    jam is supposed to deny, so it is NOT treated like the "structural"
//    doors/pickups fields that stay visible through a jam.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "radarPolish: jammed radarModel empties cameras (no meter/position leak), same rule as guards",
  fn: function () {
    var zone = Game.ZONES.warehouse;
    var engine = Game.createEngine({ zoneData: zone, seed: 77 });

    // Drive camera 0's meter up off zero first, so an empty `cameras` array
    // once jammed is a genuine assertion about hiding LIVE, non-zero state --
    // not a coincidental "it was already empty/zero" pass.
    // A handful of ticks close in front of the camera (dead-center of its
    // sweep) is enough to nudge the meter off zero (src/vision.js's tickMeter
    // fill contract: ~0.3s/18 ticks to SUSPICIOUS_AT, ~0.8s/48 ticks to
    // ALERT_AT) WITHOUT reaching ALERT_AT and self-triggering broadcastAlert
    // -- this test wants to catch the camera mid-warm-up, still INFILTRATION,
    // not already forced into ALERT by its own setup.
    var cam0 = zone.cameras[0];
    engine.player.x = cam0.x - 3;
    engine.player.y = cam0.y;
    engine.player.stance = "stand";
    for (var t = 0; t < 8; t++) engine.tick({ moveX: 0, moveY: 0 });
    var liveMeter = engine.director.cameraStates()[0].meter;
    assert(liveMeter > 0, "setup failed: expected camera 0's meter to have risen off zero before jamming");
    assert(engine.squad.phase === "INFILTRATION", "setup failed: expected squad still INFILTRATION before the forced jam below");

    var liveModel = Game.radarModel(engine);
    assert(liveModel.jammed === false, "setup failed: expected NOT jammed yet (still INFILTRATION)");
    assert(liveModel.cameras.length === zone.cameras.length, "expected the live (unjammed) model to report every camera");

    // Force ALERT -> jammed === true (phaseJam), same mechanism as
    // tests/radar.test.js/tests/lockerChecks.test.js's own direct
    // squad.phase overrides.
    engine.squad.phase = "ALERT";
    var jammedModel = Game.radarModel(engine);
    assert(jammedModel.jammed === true, "expected jammed true once squad.phase is ALERT");
    assert(
      jammedModel.cameras.length === 0,
      "expected cameras EMPTIED while jammed (no meter/position leak), got " + JSON.stringify(jammedModel.cameras)
    );
    assert(jammedModel.guards.length === 0, "expected guards emptied too, for the same reason (sanity check on the shared rule)");

    // Un-jam (back to INFILTRATION) and confirm the cameras reappear with
    // their real, undisturbed meter -- proving the emptying above was a pure
    // view-time redaction, not a mutation of the underlying director state.
    engine.squad.phase = "INFILTRATION";
    var restoredModel = Game.radarModel(engine);
    assert(restoredModel.jammed === false, "expected jammed false again after restoring INFILTRATION");
    assert(restoredModel.cameras.length === zone.cameras.length, "expected cameras to reappear once unjammed");
    assert(
      restoredModel.cameras[0].meter === engine.director.cameraStates()[0].meter,
      "expected the restored camera meter to match the director's real (undisturbed) state"
    );
  },
});

if (typeof module !== "undefined") module.exports = {};
