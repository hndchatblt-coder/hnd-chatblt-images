// tests/feedback.test.js — headless assertions for the feedback-effects cycle
// (hit flash + knock/footstep ripples in src/render.js, death sting in
// src/music.js). Those two modules are THREE/WebAudio-driven views/audio and
// are NOT headless-testable (render.js isn't in test.js's LOGIC_ORDER at all;
// src/music.js's createMusic synth side is deliberately excluded from node
// tests too — see that file's own header). What IS pure and node-testable,
// and what this file actually pins:
//   1. The event CONTRACT those effects consume — engine.js really does
//      produce "knock" (with x/y), "playerHit" (with hp), and "gameOver"
//      events with the shapes render.js/music.js read from. If a future
//      engine.js change silently renamed/dropped one of these fields, this
//      is what would catch it (render.js/music.js can't catch it themselves
//      — they're not exercised headless).
//   2. src/music.js's PURE side (Game.createMusicDirector) is UNCHANGED by
//      this cycle's death-sting work — the design brief deliberately kept
//      the director phase-only and put the gameOver edge-detection in
//      createMusic's own (browser-only, untested-headless) update() instead.
//      These are a quick RE-PIN of tests/music.test.js's own assertions
//      (not a replacement for them — see CLAUDE.md's append-only rule) so a
//      regression that leaked gameOver-awareness into the director would
//      show up here too, from a file whose whole point is this cycle's diff.
//
// screenshot.js (visual, in-browser) is the real gate for whether the flash/
// ripples/sting actually look and sound right — see PROGRESS.md/TESTLOG.md
// for that pass.

const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const DT = 1 / 60;

// ---- helpers (mirrors tests/combat.test.js's / tests/soundEvents.test.js's
// own patterns exactly, not reinvented) --------------------------------------

// Builds a single-guard engine and teleports the player `ahead` meters
// directly along the guard's INITIAL facing, same trick
// tests/combat.test.js's firefightEngine() and screenshot.js's "03-alert"
// scene both already use to force a real ALERT/firefight without waiting out
// a full patrol route.
function firefightEngine(seed, ahead) {
  const engine = Game.createEngine({ seed: seed });
  const guard = engine.guards[0];
  engine.player.x = guard.x + Math.cos(guard.facing) * ahead;
  engine.player.y = guard.y + Math.sin(guard.facing) * ahead;
  return engine;
}

// ---- 1. knock event contract: carries x/y at the player's knock position --

Game.selfTests.push({
  name: "feedback contract: a real knock produces exactly one {type:knock,x,y} event at the player's position",
  fn: function () {
    // Same adjacency trick as tests/soundEvents.test.js's own knock-verb
    // test: (14.6, 15) sits 0.6m from the west container's east edge (x=14),
    // well within Game.SOUND.KNOCK_WALL_DIST (1.2).
    const engine = Game.createEngine();
    engine.player.x = 14.6;
    engine.player.y = 15;
    assert(
      engine.world.isBlockedCircle(engine.player.x, engine.player.y, Game.SOUND.KNOCK_WALL_DIST),
      "setup: expected player position to be adjacent to a wall"
    );

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch", knock: true });

    const knockEvents = engine.events.filter(function (e) {
      return e.type === "knock";
    });
    assert(knockEvents.length === 1, "expected exactly one knock event, got " + knockEvents.length);
    assert(
      knockEvents[0].x === engine.player.x && knockEvents[0].y === engine.player.y,
      "expected knock event x/y to equal the player's position at the moment of the knock — " +
        "this is exactly the field src/render.js's ripple spawn reads (see BACKLOG 6d)"
    );
  },
});

// ---- 2. playerHit/gameOver event contract: playerHit carries hp, decreasing;
//         gameOver fires exactly once when hp reaches 0 -----------------------

Game.selfTests.push({
  name: "feedback contract: a real firefight's playerHit events carry decreasing hp, and gameOver fires exactly once at hp 0",
  fn: function () {
    const engine = firefightEngine(5150001, 5);
    engine.squad.phase = "ALERT";
    engine.squad.phaseTime = 0;
    engine.squad.lastKnown = { x: engine.player.x, y: engine.player.y };

    const hitEvents = []; // { hp }
    let gameOverEvents = 0;
    const maxTicks = Math.round(60 / DT); // generous — 60s of simulated combat

    for (let i = 0; i < maxTicks; i++) {
      engine.tick();
      for (const ev of engine.events) {
        if (ev.type === "playerHit") hitEvents.push({ hp: ev.hp });
        if (ev.type === "gameOver") gameOverEvents++;
      }
      if (engine.gameOver) break;
    }

    assert(
      hitEvents.length >= 2,
      "setup failed: expected at least 2 playerHit events over 60s of firefight, got " + hitEvents.length
    );
    assert(typeof hitEvents[0].hp === "number", "expected playerHit event to carry a numeric hp field");
    for (let i = 1; i < hitEvents.length; i++) {
      assert(
        hitEvents[i].hp < hitEvents[i - 1].hp,
        "expected strictly decreasing hp across playerHit events (render.js's hit-flash reset logic " +
          "doesn't depend on this, but a hit event that DIDN'T report a hp drop would signal a broken " +
          "contract) — got " + hitEvents[i - 1].hp + " -> " + hitEvents[i].hp
      );
    }

    assert(engine.gameOver === true, "setup failed: expected the player to die within 60s of this firefight");
    assert(
      gameOverEvents === 1,
      "expected exactly one gameOver event (music.js's death-sting edge-detect assumes this), got " + gameOverEvents
    );
    assert(hitEvents[hitEvents.length - 1].hp === 0, "expected the final playerHit event's hp to be exactly 0");
  },
});

// ---- 3. music.js pure side re-pin: createMusicDirector is UNCHANGED by the
//         death-sting cycle (see file header) --------------------------------

Game.selfTests.push({
  name: "feedback re-pin: Game.createMusicDirector stays phase-only and its INFILTRATION/ALERT/resolve contract still holds after the death-sting cycle",
  fn: function () {
    const director = Game.createMusicDirector();

    // update() takes exactly one argument (a phase string) — no engine,
    // no gameOver awareness. Calling it with a phase string only must still
    // behave exactly as tests/music.test.js already pins.
    const r0 = director.update("INFILTRATION");
    assert(r0.track === "sneak" && r0.sting === false, "expected fresh INFILTRATION -> sneak, no sting");

    const r1 = director.update("ALERT");
    assert(
      r1.track === "combat" && r1.sting === true && r1.changed === true,
      "expected INFILTRATION->ALERT to report combat/sting/changed all true, unaffected by this cycle"
    );

    // Passing a bogus/unknown phase (standing in for "the director genuinely
    // has no idea gameOver exists, or any other engine concept") must still
    // fall back to the previous track rather than throw or branch on
    // anything gameOver-shaped — pins that no gameOver-awareness leaked in.
    const r2 = director.update("NOT_A_REAL_PHASE");
    assert(
      r2.track === "combat",
      "expected an unrecognized phase to fall back to prevTrack (combat), got " + r2.track
    );
  },
});

if (typeof module !== "undefined") module.exports = {};
