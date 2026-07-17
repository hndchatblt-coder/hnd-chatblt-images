// tests/vision.test.js — headless assertions for src/vision.js.
// Same registry pattern as tests/world.test.js: push onto the shared
// Game.selfTests list; test.js runs every entry and reports ok/FAIL with real
// exit codes.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function approx(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

var DEG = Math.PI / 180;

// A tiny custom zone (per vision.js contract, createWorld accepts any
// zoneData): a big open room, one occlusion wall far from every other test's
// coordinates (used only by the LOS tests), and one darkZone far from that
// wall (used only by the darkness modifier test). Real loadingDock geometry
// is exercised elsewhere (world.test.js, guardAI); this file needs precise,
// uncluttered geometry.
var customZone = {
  bounds: { w: 100, h: 100 },
  walls: [
    { x: 49, y: 5, w: 2, h: 10 }, // occlusion wall for the LOS tests
  ],
  darkZones: [
    { x: 70, y: 70, w: 4, h: 4 }, // for the darkness modifier test
  ],
};
var world = Game.createWorld(customZone);
var vision = Game.createVision({ world: world });
var VISION = Game.VISION;

// 1. target directly ahead at 5m, open floor: inCone, hasLOS, factor > 0.
Game.selfTests.push({
  name: "vision: target directly ahead at 5m in the open is seen",
  fn: function () {
    var viewer = { x: 5, y: 5, facing: 0 };
    var target = { x: 10, y: 5 };
    var sight = vision.computeSight(viewer, target, { profile: 1.0 });
    assert(approx(sight.dist, 5, 1e-9), "expected dist 5, got " + sight.dist);
    assert(sight.inCone, "expected target dead ahead to be inCone");
    assert(sight.hasLOS, "expected clear LOS on open floor");
    assert(sight.factor > 0, "expected factor > 0, got " + sight.factor);
  },
});

// 2. target at same dist but 40deg off facing (> 35deg half-angle): inCone
// false, factor 0.
Game.selfTests.push({
  name: "vision: target 40deg off facing (outside 35deg half-FOV) is not seen",
  fn: function () {
    var viewer = { x: 5, y: 5, facing: 0 };
    var ang = 40 * DEG;
    var target = { x: 5 + 5 * Math.cos(ang), y: 5 + 5 * Math.sin(ang) };
    var sight = vision.computeSight(viewer, target, { profile: 1.0 });
    assert(!sight.inCone, "expected 40deg off-center to be outside the cone");
    assert(sight.factor === 0, "expected factor 0, got " + sight.factor);
  },
});

// 3. target at 34deg off facing: inCone true (cone edge inclusive-ish).
// Documented choice: the half-FOV comparison is `<=`, so a target exactly at
// the edge (35deg for a 70deg FOV) would also count; 34deg is safely inside
// either way and demonstrates the near-edge case is seen.
Game.selfTests.push({
  name: "vision: target 34deg off facing (inside 35deg half-FOV) is seen",
  fn: function () {
    var viewer = { x: 5, y: 5, facing: 0 };
    var ang = 34 * DEG;
    var target = { x: 5 + 5 * Math.cos(ang), y: 5 + 5 * Math.sin(ang) };
    var sight = vision.computeSight(viewer, target, { profile: 1.0 });
    assert(sight.inCone, "expected 34deg off-center to be inside the cone");
  },
});

// 4. target beyond 14m: factor 0.
Game.selfTests.push({
  name: "vision: target beyond RANGE (14m) is not seen",
  fn: function () {
    var viewer = { x: 5, y: 5, facing: 0 };
    var target = { x: 5 + 15, y: 5 };
    var sight = vision.computeSight(viewer, target, { profile: 1.0 });
    assert(approx(sight.dist, 15, 1e-9), "expected dist 15, got " + sight.dist);
    assert(!sight.inCone, "expected beyond-range target to be outside the cone");
    assert(sight.factor === 0, "expected factor 0, got " + sight.factor);
  },
});

// 5. angle wrap: viewer facing PI, target across the +/-PI seam at a small
// angular offset must still register as inCone (naive subtraction without
// wrapping would report a ~2*PI difference here instead of ~0.05 rad).
Game.selfTests.push({
  name: "vision: angle wrap across the +/-PI seam is handled correctly",
  fn: function () {
    var viewer = { x: 10, y: 10, facing: Math.PI };
    var ang = -Math.PI + 0.05; // just past the seam from PI's perspective
    var target = { x: 10 + 5 * Math.cos(ang), y: 10 + 5 * Math.sin(ang) };
    var sight = vision.computeSight(viewer, target, { profile: 1.0 });
    assert(sight.inCone, "expected small angular offset across the seam to be inCone");
    assert(sight.factor > 0, "expected factor > 0 across the seam, got " + sight.factor);
  },
});

// 6. wall between viewer and target: hasLOS false, factor 0.
Game.selfTests.push({
  name: "vision: a wall between viewer and target blocks LOS",
  fn: function () {
    var viewer = { x: 45, y: 10, facing: 0 };
    var target = { x: 55, y: 10 }; // dist 10, wall spans x:49-51,y:5-15
    var sight = vision.computeSight(viewer, target, { profile: 1.0 });
    assert(sight.inCone, "expected dead-ahead target within range to be inCone");
    assert(!sight.hasLOS, "expected the wall to block LOS");
    assert(sight.factor === 0, "expected factor 0 when LOS is blocked, got " + sight.factor);
  },
});

// 7. target just IN FRONT of a wall (viewer-target clear, wall behind
// target): hasLOS true.
Game.selfTests.push({
  name: "vision: target standing in front of a wall (wall behind it) has clear LOS",
  fn: function () {
    var viewer = { x: 45, y: 10, facing: 0 };
    var target = { x: 48, y: 10 }; // dist 3, wall starts at x=49 - just behind target
    var sight = vision.computeSight(viewer, target, { profile: 1.0 });
    assert(sight.inCone, "expected dead-ahead target within range to be inCone");
    assert(sight.hasLOS, "expected LOS to be clear up to the target, wall is behind it");
    assert(sight.factor > 0, "expected factor > 0, got " + sight.factor);
  },
});

// 8. modifiers: crawl profile (0.3) and darkness (0.5) each reduce factor by
// the right ratio vs the standing/lit baseline at identical geometry;
// extraMult 0.05 stacks multiplicatively.
Game.selfTests.push({
  name: "vision: crawl, darkness, and extraMult modifiers scale factor by the right ratio",
  fn: function () {
    var viewer = { x: 5, y: 5, facing: 0 };
    var target = { x: 10, y: 5 }; // dist 5, open + lit
    var base = vision.computeSight(viewer, target, { profile: 1.0 }).factor;
    assert(base > 0, "expected a positive baseline factor");

    var crawl = vision.computeSight(viewer, target, { profile: 0.3 }).factor;
    assert(approx(crawl, base * 0.3, 1e-9), "expected crawl factor === base * 0.3, got " + crawl + " vs " + base * 0.3);

    var extra = vision.computeSight(viewer, target, { profile: 1.0, extraMult: 0.05 }).factor;
    assert(approx(extra, base * 0.05, 1e-9), "expected extraMult 0.05 to scale factor by 0.05, got " + extra + " vs " + base * 0.05);

    // Darkness: same distance (5m) from the viewer to the darkZone rect
    // {x:70,y:70,w:4,h:4} (center 72,72), same profile, clear LOS.
    var darkViewer = { x: 67, y: 72, facing: 0 };
    var darkTarget = { x: 72, y: 72 };
    assert(vision.isInDarkZone(darkTarget.x, darkTarget.y), "expected target center inside the darkZone");
    var dark = vision.computeSight(darkViewer, darkTarget, { profile: 1.0 }).factor;
    assert(approx(dark, base * VISION.DARKNESS_MULT, 1e-9), "expected darkness factor === base * DARKNESS_MULT, got " + dark + " vs " + base * VISION.DARKNESS_MULT);
  },
});

// 9. meter timing: standing target at 2m (FILL_NEAR_DIST) reaches
// SUSPICIOUS_AT within ~0.3s and ALERT_AT (1.0) in 0.8s +/-15%; crawling the
// same geometry takes >=3x longer; factor 0 drains a full meter to 0 in ~2s
// +/-10%; meter never leaves [0,1].
Game.selfTests.push({
  name: "vision: tickMeter timing matches SPEC (0.35 by ~0.3s, 1.0 by 0.8s+/-15%, crawl >=3x, drain ~2s+/-10%)",
  fn: function () {
    var dt = 1 / 60;
    var viewer = { x: 5, y: 5, facing: 0 };
    var target = { x: 7, y: 5 }; // dist 2 === FILL_NEAR_DIST

    var standFactor = vision.computeSight(viewer, target, { profile: 1.0 }).factor;
    assert(approx(standFactor, VISION.FILL_BASE, 1e-9), "expected factor === FILL_BASE at NEAR_DIST, got " + standFactor);

    function fillTime(factor, threshold) {
      var meter = 0;
      var t = 0;
      var crossed = null;
      for (var i = 0; i < 100000; i++) {
        meter = vision.tickMeter(meter, factor, dt);
        assert(meter >= 0 && meter <= 1, "meter left [0,1]: " + meter);
        t += dt;
        if (crossed === null && meter >= threshold) {
          crossed = t;
          if (threshold >= 1) break;
        }
        if (crossed !== null) break;
      }
      assert(crossed !== null, "meter never reached threshold " + threshold);
      return crossed;
    }

    var tSuspicious = fillTime(standFactor, VISION.SUSPICIOUS_AT);
    assert(tSuspicious <= 0.35, "expected SUSPICIOUS_AT within ~0.3s, took " + tSuspicious + "s");
    assert(tSuspicious >= 0.2, "SUSPICIOUS_AT crossed suspiciously fast: " + tSuspicious + "s");

    var tAlertStand = fillTime(standFactor, VISION.ALERT_AT);
    assert(
      tAlertStand >= 0.8 * 0.85 && tAlertStand <= 0.8 * 1.15,
      "expected ALERT_AT in 0.8s +/-15%, took " + tAlertStand + "s"
    );

    var crawlFactor = vision.computeSight(viewer, target, { profile: 0.3 }).factor;
    var tAlertCrawl = fillTime(crawlFactor, VISION.ALERT_AT);
    assert(
      tAlertCrawl >= 3 * tAlertStand * 0.95,
      "expected crawl fill to take >=3x as long as standing: crawl=" + tAlertCrawl + " stand=" + tAlertStand
    );

    // Drain: factor 0 from a full meter down to 0 in ~2s +/-10%.
    var meter = 1.0;
    var t = 0;
    var drainedAt = null;
    for (var i = 0; i < 100000; i++) {
      meter = vision.tickMeter(meter, 0, dt);
      assert(meter >= 0 && meter <= 1, "meter left [0,1] during drain: " + meter);
      t += dt;
      if (meter <= 0) {
        drainedAt = t;
        break;
      }
    }
    assert(drainedAt !== null, "meter never drained to 0");
    assert(
      drainedAt >= 2 * 0.9 && drainedAt <= 2 * 1.1,
      "expected full drain in ~2s +/-10%, took " + drainedAt + "s"
    );

    // Clamping sanity: overshoot in either direction stays inside [0,1].
    assert(vision.tickMeter(0.99, 100, 1) === 1, "expected meter to clamp at 1");
    assert(vision.tickMeter(0.01, 0, 100) === 0, "expected meter to clamp at 0");
  },
});
