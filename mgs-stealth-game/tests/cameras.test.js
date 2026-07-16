// tests/cameras.test.js — headless assertions for src/director.js's security
// cameras, plus their wiring into src/engine.js (tick() ordering, events,
// snapshot). Same registry pattern as every other tests/*.test.js file: push
// onto the shared Game.selfTests list; test.js runs every entry and reports
// ok/FAIL with real exit codes.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const DT = 1 / 60;

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

// A stationary target far outside any camera's range, used whenever a test
// wants a camera to see NOTHING at all.
function farTarget() {
  return {
    x: -9999,
    y: -9999,
    visionProfile: function () {
      return 1.0;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Pan angle: deterministic given ctx.time, bounded to +/- sweepDeg/2
//    around `facing` over a full sweepPeriodS.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "director: camera pan angle is a deterministic, bounded function of ctx.time",
  fn: function () {
    const zone = Game.ZONES.warehouse;
    const world = Game.createWorld(zone);
    const vision = Game.createVision({ world: world });
    const squad = Game.createSquad();
    const director = Game.createDirector({ world: world, vision: vision, squad: squad });

    const cam = zone.cameras[0];
    const halfSweepRad = (cam.sweepDeg * Math.PI) / 180 / 2;
    const player = farTarget();

    let seenMin = Infinity;
    let seenMax = -Infinity;
    const STEPS = 600; // 10s of sim time at DT=1/60, well over one 6s sweepPeriodS

    for (let i = 0; i < STEPS; i++) {
      const t = i * DT;
      director.tickCameras(DT, { time: t, chaffUntil: 0, player: player });
      const panAngle = director.cameraStates()[0].panAngle;

      const expected = cam.facing + Math.sin((2 * Math.PI * t) / cam.sweepPeriodS) * halfSweepRad;
      assert(
        Math.abs(panAngle - expected) < 1e-9,
        "pan angle not a pure/deterministic function of ctx.time at t=" + t.toFixed(3)
      );

      const delta = panAngle - cam.facing;
      if (delta < seenMin) seenMin = delta;
      if (delta > seenMax) seenMax = delta;
    }

    assert(
      seenMax <= halfSweepRad + 1e-9 && seenMin >= -halfSweepRad - 1e-9,
      "pan swing exceeded +/- sweepDeg/2: min=" + seenMin.toFixed(4) + " max=" + seenMax.toFixed(4)
    );
    // With a full 10s window (> one 6s period) the sweep should have actually
    // approached both extremes, not just stayed near zero.
    assert(seenMax > halfSweepRad * 0.9, "pan angle never swung near the +sweepDeg/2 extreme");
    assert(seenMin < -halfSweepRad * 0.9, "pan angle never swung near the -sweepDeg/2 extreme");
  },
});

// ---------------------------------------------------------------------------
// 2. Full engine: a player held dead-center in a camera's cone at 5m fills
//    the meter to ALERT_AT -> cameraAlert event + squad ALERT, and guards
//    converge on the reported position.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "director: player held in a camera cone at 5m triggers cameraAlert + squad ALERT, guards converge",
  fn: function () {
    const engine = Game.createEngine({ zoneData: Game.ZONES.warehouse, seed: 909001 });
    const cam = Game.ZONES.warehouse.cameras[1]; // east-facing camera, faces 0 rad

    // Dead-center of the camera's base facing, 5m out — clear open floor
    // (verified against the warehouse's real walls when these positions were
    // chosen, see src/world.js's camera placement comments).
    engine.player.x = cam.x + 5;
    engine.player.y = cam.y;
    engine.player.stance = "stand";

    let sawCameraAlert = false;
    const SEARCH_TICKS = Math.round(8 / DT); // generous: the sweep periodically
    // carries the player out of the narrow FOV, so the meter fills across
    // several in-cone/out-of-cone arcs rather than in one smooth ramp — see
    // src/director.js's tickCameras contract.
    for (let i = 0; i < SEARCH_TICKS && !sawCameraAlert; i++) {
      engine.tick({ moveX: 0, moveY: 0 });
      for (let e = 0; e < engine.events.length; e++) {
        if (engine.events[e].type === "cameraAlert") sawCameraAlert = true;
      }
    }
    assert(sawCameraAlert, "expected a cameraAlert event within 8s of standing 5m dead-center in a camera's cone");
    // The camera's broadcastAlert() flips squad.phase to ALERT the instant
    // the meter crosses ALERT_AT (src/guardAI.js's own no-op-if-already-ALERT
    // rule), but since NO GUARD has real LOS on the player in this scenario
    // (see src/engine.js's DESIGN RULE: cameras don't feed anyLOS), the very
    // same squad.tick() call that runs later THIS SAME engine tick sees
    // anyGuardHasLOS === false and immediately advances ALERT -> EVASION —
    // so by the time tick() returns, phase may already read EVASION rather
    // than a lingering ALERT. Either is the "went hostile because of the
    // camera" outcome this test cares about.
    assert(
      engine.squad.phase === "ALERT" || engine.squad.phase === "EVASION",
      "expected squad.phase ALERT or EVASION after the camera alert, got " + engine.squad.phase
    );
    assert(engine.squad.alertCount >= 1, "expected the camera alert to have counted as a real alert incident");

    const lastKnown = engine.squad.lastKnown;
    assert(
      Math.abs(lastKnown.x - engine.player.x) < 1e-6 && Math.abs(lastKnown.y - engine.player.y) < 1e-6,
      "expected squad.lastKnown to be the camera-reported player position"
    );

    const target = { x: lastKnown.x, y: lastKnown.y };
    const initialMin = Math.min.apply(
      null,
      engine.guards.map(function (g) {
        return dist(g.x, g.y, target.x, target.y);
      })
    );

    // Guards converge on the reported position (ALERT pursuit, or EVASION's
    // own convergence-on-lastKnown sweep once the squad has decayed off the
    // camera-only ALERT — see src/guardAI.js's EVASION contract and
    // engine.js's DESIGN RULE above) — give it several seconds of travel and
    // confirm at least one guard was actually forced hostile.
    let anyGuardWentHostile = false;
    const FOLLOWUP_TICKS = Math.round(6 / DT);
    for (let j = 0; j < FOLLOWUP_TICKS; j++) {
      engine.tick({ moveX: 0, moveY: 0 });
      if (engine.guards.some((g) => g.state === "ALERT" || g.state === "EVASION")) anyGuardWentHostile = true;
    }
    assert(anyGuardWentHostile, "expected at least one guard to go hostile (ALERT/EVASION) after the camera-triggered squad alert");

    const finalMin = Math.min.apply(
      null,
      engine.guards.map(function (g) {
        return dist(g.x, g.y, target.x, target.y);
      })
    );
    assert(
      finalMin < initialMin - 2,
      "expected the nearest guard to have closed real distance toward the camera-reported position: initial=" +
        initialMin.toFixed(2) +
        " final=" +
        finalMin.toFixed(2)
    );
  },
});

// ---------------------------------------------------------------------------
// 3. Box + stationary in a camera's cone: the wrapped (perceivedPlayer)
//    target is respected, meter stays far below SUSPICIOUS_AT.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "director: boxed + stationary in a camera cone keeps the meter near zero (wrapped target respected)",
  fn: function () {
    const engine = Game.createEngine({ zoneData: Game.ZONES.warehouse, seed: 909002 });
    const cam = Game.ZONES.warehouse.cameras[1];

    engine.player.x = cam.x + 5;
    engine.player.y = cam.y;
    engine.player.stance = "stand";

    engine.tick({ moveX: 0, moveY: 0, box: true });
    assert(engine.inventory.boxOn, "setup failed: box never toggled on");

    let maxMeter = 0;
    let sawEscalation = false;
    const CAMP_TICKS = Math.round(40 / DT); // several full sweepPeriodS cycles
    for (let i = 0; i < CAMP_TICKS; i++) {
      engine.tick({ moveX: 0, moveY: 0, box: true });
      for (let e = 0; e < engine.events.length; e++) {
        if (engine.events[e].type === "cameraSuspicious" || engine.events[e].type === "cameraAlert") {
          sawEscalation = true;
        }
      }
      const m = engine.director.cameraStates()[1].meter;
      if (m > maxMeter) maxMeter = m;
    }

    assert(!sawEscalation, "boxed + stationary player should never trip cameraSuspicious/cameraAlert");
    assert(
      maxMeter < Game.VISION.SUSPICIOUS_AT,
      "expected the camera meter to stay well below SUSPICIOUS_AT while boxed+stationary, peak was " + maxMeter.toFixed(3)
    );
  },
});

// ---------------------------------------------------------------------------
// 4. Chaff disables: meter frozen, disabled flag set, no alert while the
//    player dances in and out of the cone.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "director: chaff disables a camera — meter frozen, disabled flag set, no alert while chaffed",
  fn: function () {
    const engine = Game.createEngine({ zoneData: Game.ZONES.warehouse, seed: 909003 });
    const cam = Game.ZONES.warehouse.cameras[1];

    engine.player.x = cam.x + 5;
    engine.player.y = cam.y;

    engine.tick({ moveX: 0, moveY: 0, chaff: true });
    assert(engine.chaffUntil > engine.time, "setup failed: chaff never armed");

    const baselineMeter = engine.director.cameraStates()[1].meter;
    assert(engine.director.cameraStates()[1].disabled, "expected camera[1].disabled immediately after throwing chaff");

    const DANCE_TICKS = Math.round((Game.ITEMS.CHAFF_S - 1) / DT); // stay inside the 15s window with margin
    for (let i = 0; i < DANCE_TICKS; i++) {
      // "dances in the cone": alternate dead-center / off to the side every
      // ~0.2s, trying (and failing) to trip the meter while chaffed.
      const phase = Math.floor(i / 12) % 2 === 0;
      engine.player.x = phase ? cam.x + 5 : cam.x + 5;
      engine.player.y = phase ? cam.y : cam.y + 6; // off-center, still nominally "nearby"

      engine.tick({ moveX: 0, moveY: 0 });

      const state = engine.director.cameraStates()[1];
      assert(state.disabled, "expected camera[1] to stay disabled throughout the chaff window (tick " + i + ")");
      assert(
        state.meter === baselineMeter,
        "expected the meter to stay FROZEN exactly at its pre-chaff value while disabled (tick " + i + "): " +
          state.meter +
          " !== " +
          baselineMeter
      );
      for (let e = 0; e < engine.events.length; e++) {
        assert(
          engine.events[e].type !== "cameraSuspicious" && engine.events[e].type !== "cameraAlert",
          "no camera escalation should be possible while chaffed (tick " + i + ")"
        );
      }
    }
  },
});

// ---------------------------------------------------------------------------
// 5. Disabled clears after CHAFF_S (15s) and detection resumes.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "director: a chaffed camera's disabled flag clears after CHAFF_S and detection resumes",
  fn: function () {
    const engine = Game.createEngine({ zoneData: Game.ZONES.warehouse, seed: 909004 });
    const cam = Game.ZONES.warehouse.cameras[1];

    // Park well outside the cone during the chaff window itself so this test
    // isolates "does disabled clear on schedule" from "does detection
    // resume" — both checked, but sequentially.
    engine.player.x = -50;
    engine.player.y = -50;

    engine.tick({ moveX: 0, moveY: 0, chaff: true });
    assert(engine.director.cameraStates()[1].disabled, "setup failed: camera never disabled by chaff");

    const THROUGH_CHAFF_TICKS = Math.round((Game.ITEMS.CHAFF_S + 0.5) / DT);
    for (let i = 0; i < THROUGH_CHAFF_TICKS; i++) {
      engine.tick({ moveX: 0, moveY: 0 });
    }
    assert(
      !engine.director.cameraStates()[1].disabled,
      "expected camera[1].disabled to clear once engine.time passed chaffUntil"
    );

    // Detection resumes: move into the cone now and confirm a fresh alert.
    engine.player.x = cam.x + 5;
    engine.player.y = cam.y;

    let sawCameraAlert = false;
    const SEARCH_TICKS = Math.round(8 / DT);
    for (let i = 0; i < SEARCH_TICKS && !sawCameraAlert; i++) {
      engine.tick({ moveX: 0, moveY: 0 });
      for (let e = 0; e < engine.events.length; e++) {
        if (engine.events[e].type === "cameraAlert") sawCameraAlert = true;
      }
    }
    assert(sawCameraAlert, "expected the camera to resume normal detection once chaff expired");
  },
});

// ---------------------------------------------------------------------------
// 6. cameraSuspicious fires once per rising edge, not once per tick spent
//    above the threshold.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "director: cameraSuspicious fires once per crossing, not once per tick above SUSPICIOUS_AT",
  fn: function () {
    const zone = Game.ZONES.warehouse;
    const world = Game.createWorld(zone);
    const vision = Game.createVision({ world: world });
    const squad = Game.createSquad();
    const director = Game.createDirector({ world: world, vision: vision, squad: squad });

    const cam = zone.cameras[1]; // east camera, facing 0
    // time held at 0 for every "in cone" tick below: sin(0) === 0, so
    // panAngle === cam.facing exactly, guaranteeing this dead-ahead target is
    // in-cone regardless of how many dt-driven meter ticks have elapsed —
    // ctx.time only drives the pan angle, dt drives meter integration, and
    // the two are independent inputs (see src/director.js's contract).
    const inCone = {
      x: cam.x + 5,
      y: cam.y,
      visionProfile: function () {
        return 1.0;
      },
    };
    const outOfCone = farTarget();

    let suspiciousCount = 0;

    // Phase 1: rise past SUSPICIOUS_AT (stop short of it staying there forever).
    for (let i = 0; i < 60; i++) {
      const fired = director.tickCameras(DT, { time: 0, chaffUntil: 0, player: inCone });
      fired.forEach((f) => {
        if (f.type === "cameraSuspicious") suspiciousCount++;
      });
      if (director.cameraStates()[1].meter >= Game.VISION.SUSPICIOUS_AT) break;
    }
    assert(suspiciousCount === 1, "expected exactly one cameraSuspicious on the initial rising edge, got " + suspiciousCount);

    // Still above the line: several more ticks must NOT re-fire it.
    for (let i = 0; i < 30; i++) {
      const fired = director.tickCameras(DT, { time: 0, chaffUntil: 0, player: inCone });
      fired.forEach((f) => {
        if (f.type === "cameraSuspicious") suspiciousCount++;
      });
    }
    assert(suspiciousCount === 1, "cameraSuspicious re-fired while continuously above threshold: count=" + suspiciousCount);

    // Phase 2: drain back below SUSPICIOUS_AT.
    for (let i = 0; i < 120; i++) {
      director.tickCameras(DT, { time: 0, chaffUntil: 0, player: outOfCone });
    }
    assert(
      director.cameraStates()[1].meter < Game.VISION.SUSPICIOUS_AT,
      "setup failed: meter never drained back below SUSPICIOUS_AT"
    );

    // Phase 3: re-enter the cone -- exactly one more cameraSuspicious.
    for (let i = 0; i < 60; i++) {
      const fired = director.tickCameras(DT, { time: 0, chaffUntil: 0, player: inCone });
      fired.forEach((f) => {
        if (f.type === "cameraSuspicious") suspiciousCount++;
      });
      if (director.cameraStates()[1].meter >= Game.VISION.SUSPICIOUS_AT) break;
    }
    assert(suspiciousCount === 2, "expected a second cameraSuspicious on re-crossing, got " + suspiciousCount);
  },
});

// ---------------------------------------------------------------------------
// 7. Determinism: two engines, same seed, identical camera meters over 600
//    ticks.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "director: two engines with identical seed/inputs produce identical camera meters over 600 ticks",
  fn: function () {
    const engineA = Game.createEngine({ zoneData: Game.ZONES.warehouse, seed: 55555 });
    const engineB = Game.createEngine({ zoneData: Game.ZONES.warehouse, seed: 55555 });

    const cam = Game.ZONES.warehouse.cameras[0];
    [engineA, engineB].forEach((eng) => {
      eng.player.x = cam.x + 4;
      eng.player.y = cam.y;
    });

    for (let i = 0; i < 600; i++) {
      // A little back-and-forth movement (identical on both) so this
      // exercises more than a frozen player, without needing real input
      // devices.
      const wobble = Math.sin(i / 37) > 0 ? 1 : -1;
      engineA.tick({ moveX: wobble * 0.2, moveY: 0 });
      engineB.tick({ moveX: wobble * 0.2, moveY: 0 });

      const camsA = engineA.director.cameraStates();
      const camsB = engineB.director.cameraStates();
      assert(camsA.length === camsB.length, "camera counts diverged at tick " + i);
      for (let c = 0; c < camsA.length; c++) {
        assert(
          camsA[c].meter === camsB[c].meter,
          "camera[" + c + "] meter diverged at tick " + i + ": " + camsA[c].meter + " !== " + camsB[c].meter
        );
        assert(
          camsA[c].panAngle === camsB[c].panAngle,
          "camera[" + c + "] panAngle diverged at tick " + i
        );
        assert(camsA[c].disabled === camsB[c].disabled, "camera[" + c + "] disabled diverged at tick " + i);
      }
    }
  },
});
