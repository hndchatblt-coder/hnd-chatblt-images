// tests/music.test.js -- headless assertions for src/music.js's PURE side
// (Game.musicState / Game.createMusicDirector) only. The synth/WebAudio half
// (Game.createMusic) is BROWSER ONLY by design (see src/music.js's file
// header) and is deliberately NEVER exercised here -- constructing an
// AudioContext in node would throw (there is none), and even in-browser at
// boot audio may be locked pre-gesture. screenshot.js is what verifies
// createMusic().update() runs for real (or no-ops silently) without ever
// throwing a page error.
//
// loader unified cycle 30 — see test.js LOGIC_ORDER

const Game = global.Game;
const DT = 1 / 60;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function freshEngine() {
  return Game.createEngine();
}

// Ticks `engine`, each tick re-teleporting the player to a fixed distance
// directly in front of guards[0]'s CURRENT facing (recomputed live every
// tick, since a patrolling/sweeping guard's facing keeps changing) -- close
// enough (2m, inside VISION.FILL_NEAR_DIST) and dead-center in its cone so
// the meter fills to ALERT_AT quickly. Mirrors tests/radar.test.js's and
// tests/hud.test.js's own driveToAlert helper exactly, except it also drives
// a music director alongside every tick so sting/resolve edges are never
// missed between ticks.
function driveToAlert(engine, director, counts, maxTicks) {
  for (var i = 0; i < maxTicks; i++) {
    var g = engine.guards[0];
    var ahead = 2;
    engine.player.x = g.x + Math.cos(g.facing) * ahead;
    engine.player.y = g.y + Math.sin(g.facing) * ahead;
    engine.tick();
    tallyDirector(director, engine, counts);
    if (engine.squad.phase === "ALERT") return i;
  }
  return null;
}

// Ticks `engine` with the player hidden far off in open space (no guard can
// possibly retain LOS) until `predicate(engine)` is true or maxTicks elapse,
// tallying director output every tick. Returns the tick index it became true
// at, or null. Mirrors tests/radar.test.js's tickHiddenUntil helper exactly.
function tickHiddenUntil(engine, director, counts, predicate, maxTicks) {
  for (var i = 0; i < maxTicks; i++) {
    engine.player.x = -1000;
    engine.player.y = -1000;
    engine.tick();
    tallyDirector(director, engine, counts);
    if (predicate(engine)) return i;
  }
  return null;
}

function tallyDirector(director, engine, counts) {
  var r = director.update(engine.squad.phase);
  if (r.sting) counts.stings++;
  if (r.resolve) counts.resolves++;
  return r;
}

// ---- 1. INFILTRATION baseline -----------------------------------------------

Game.selfTests.push({
  name: "music: director on a fresh INFILTRATION phase reports track sneak, no sting",
  fn: function () {
    var director = Game.createMusicDirector();
    var r = director.update("INFILTRATION");
    assert(r.track === "sneak", "expected track sneak for INFILTRATION, got " + r.track);
    assert(r.sting === false, "expected no sting entering INFILTRATION");
  },
});

// ---- 2. INFILTRATION -> ALERT fires exactly one sting -----------------------

Game.selfTests.push({
  name: "music: INFILTRATION->ALERT reports combat/sting/changed all true; staying ALERT reports sting/changed false",
  fn: function () {
    var director = Game.createMusicDirector();
    director.update("INFILTRATION");

    var r1 = director.update("ALERT");
    assert(r1.track === "combat", "expected track combat entering ALERT, got " + r1.track);
    assert(r1.sting === true, "expected sting true entering ALERT from INFILTRATION");
    assert(r1.changed === true, "expected changed true entering ALERT from INFILTRATION");

    var r2 = director.update("ALERT");
    assert(r2.track === "combat", "expected track to stay combat while phase stays ALERT");
    assert(r2.sting === false, "expected sting false while already in combat");
    assert(r2.changed === false, "expected changed false while phase stays ALERT");
  },
});

// ---- 3. ALERT -> EVASION -> CAUTION walk, no stings --------------------------

Game.selfTests.push({
  name: "music: ALERT->EVASION->CAUTION walk reports evasion then caution, no stings anywhere",
  fn: function () {
    var director = Game.createMusicDirector();
    director.update("ALERT");

    var r1 = director.update("EVASION");
    assert(r1.track === "evasion", "expected track evasion, got " + r1.track);
    assert(r1.sting === false, "expected no sting entering EVASION");

    var r2 = director.update("CAUTION");
    assert(r2.track === "caution", "expected track caution, got " + r2.track);
    assert(r2.sting === false, "expected no sting entering CAUTION");
  },
});

// ---- 4. CAUTION -> INFILTRATION fires exactly one resolve --------------------

Game.selfTests.push({
  name: "music: CAUTION->INFILTRATION reports sneak/resolve true once, then resolve false on the next update",
  fn: function () {
    var director = Game.createMusicDirector();
    director.update("ALERT");
    director.update("EVASION");
    director.update("CAUTION");

    var r1 = director.update("INFILTRATION");
    assert(r1.track === "sneak", "expected track sneak resuming INFILTRATION, got " + r1.track);
    assert(r1.resolve === true, "expected resolve true on CAUTION->INFILTRATION");

    var r2 = director.update("INFILTRATION");
    assert(r2.resolve === false, "expected resolve false on the following update (already INFILTRATION)");
  },
});

// ---- 5. Full ladder driven by a real engine ---------------------------------

Game.selfTests.push({
  name: "music: full alert ladder driven by a real engine yields exactly one sting and one resolve",
  fn: function () {
    var engine = freshEngine();
    var director = Game.createMusicDirector();
    var counts = { stings: 0, resolves: 0 };

    // Baseline call at t=0, before any tick -- mirrors src/boot.js calling
    // music.update() once synchronously at startGame() time.
    tallyDirector(director, engine, counts);

    var reachedAlertAt = driveToAlert(engine, director, counts, Math.round(10 / DT));
    assert(reachedAlertAt !== null, "setup failed: squad never reached ALERT within 10s");

    var reachedEvasionAt = tickHiddenUntil(
      engine,
      director,
      counts,
      function (e) {
        return e.squad.phase === "EVASION";
      },
      60
    );
    assert(reachedEvasionAt !== null, "setup failed: squad never reached EVASION after losing contact");

    var maxToCaution = Math.round(Game.GUARD.EVASION_S / DT) + 120; // EVASION_S plus a 2s buffer
    var reachedCautionAt = tickHiddenUntil(
      engine,
      director,
      counts,
      function (e) {
        return e.squad.phase === "CAUTION";
      },
      maxToCaution
    );
    assert(reachedCautionAt !== null, "setup failed: squad never reached CAUTION within EVASION_S + buffer");

    var maxToInfiltration = Math.round(Game.GUARD.CAUTION_S / DT) + 120; // CAUTION_S plus a 2s buffer
    var reachedInfiltrationAt = tickHiddenUntil(
      engine,
      director,
      counts,
      function (e) {
        return e.squad.phase === "INFILTRATION";
      },
      maxToInfiltration
    );
    assert(
      reachedInfiltrationAt !== null,
      "setup failed: squad never returned to INFILTRATION within CAUTION_S + buffer"
    );

    assert(counts.stings === 1, "expected exactly one sting across the full ladder, got " + counts.stings);
    assert(counts.resolves === 1, "expected exactly one resolve across the full ladder, got " + counts.resolves);
  },
});

if (typeof module !== "undefined") module.exports = {};
