// tests/combat.test.js — headless assertions for the new combat consequence
// system: player.hp/damage (src/player.js), guard ALERT fire behavior
// (src/guardAI.js), and engine-level guardFire/playerHit/gameOver wiring
// (src/engine.js). Same registry pattern as every other tests/*.js file:
// push onto the shared Game.selfTests list; test.js runs every entry and
// reports ok/FAIL with real exit codes.
//
// test.js's own LOGIC_ORDER (fixed, out of scope to touch this cycle) does
// not list src/hud.js — mirrors tests/hud.test.js's own self-require guard
// trick so the one hudModel assertion below works standalone regardless of
// tests/ file load order (all tests/*.js files are `require`d before ANY
// test .fn() runs — see test.js's loadDir then run-loop split — but this
// keeps combat.test.js correct in isolation too).
if (typeof require !== "undefined") {
  require("../src/hud.js");
}

const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const DT = 1 / 60;

function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// Builds a single-guard engine (loadingDock default: guard "g1" spawned at
// zone.waypoints[0], see src/engine.js's ZONE_GUARDS table) and teleports the
// player `ahead` meters directly along the guard's INITIAL facing (0 rad,
// +x — see the guard's initialFacing computation in src/guardAI.js:
// spawn === waypoints[0] for g1, so atan2(0,0) === 0). This is the same
// teleport trick screenshot.js's "03-alert" scene uses to force a real ALERT
// without waiting out a full patrol route. Distance is chosen so the player
// stays within both VISION.RANGE (14m) and GUARD.FIRE_RANGE (10m) even after
// the guard closes in to GUARD.ARREST_DIST (2m).
function firefightEngine(seed, ahead) {
  const engine = Game.createEngine({ seed: seed });
  const guard = engine.guards[0];
  engine.player.x = guard.x + Math.cos(guard.facing) * ahead;
  engine.player.y = guard.y + Math.sin(guard.facing) * ahead;
  return engine;
}

// Drives `engine` for up to maxTicks ticks (default input — the player never
// moves), collecting every guardFire/playerHit event seen. Stops early once
// `stopWhen(state)` returns true (state exposes tickIndex/alertTick/etc.), so
// callers can bail out the moment they have what they need. ALSO stops the
// instant engine.gameOver goes true (see src/engine.js's FROZEN ENGINE
// contract: a frozen engine's tick() returns immediately WITHOUT re-clearing
// engine.events, so blindly continuing to read engine.events after that
// point would re-count the same stale final tick's events on every further
// iteration — stopping here is what avoids that, not a workaround for a bug
// elsewhere).
function driveFirefight(engine, maxTicks, stopWhen) {
  const fireEvents = []; // { tick, hit }
  const hitEvents = []; // { tick, hp }
  let alertTick = null;

  for (let i = 0; i < maxTicks; i++) {
    engine.tick();
    if (alertTick === null && engine.squad.phase === "ALERT") alertTick = i;
    for (const ev of engine.events) {
      if (ev.type === "guardFire") fireEvents.push({ tick: i, hit: ev.hit });
      if (ev.type === "playerHit") hitEvents.push({ tick: i, hp: ev.hp });
    }
    if (engine.gameOver) break;
    if (stopWhen && stopWhen({ tick: i, alertTick: alertTick, fireEvents: fireEvents, hitEvents: hitEvents })) {
      break;
    }
  }
  return { alertTick: alertTick, fireEvents: fireEvents, hitEvents: hitEvents };
}

// ---- 1. player.damage clamps, alive flips, dead player ignores movement ----
Game.selfTests.push({
  name: "combat: player.damage clamps at 0, flips alive, and a dead player ignores movement input",
  fn: function () {
    const world = Game.createWorld(Game.ZONES.loadingDock);
    const player = Game.createPlayer({ world: world });

    assert(player.hp === 1, "expected fresh player hp 1, got " + player.hp);
    assert(player.alive === true, "expected fresh player alive true");

    player.damage(0.3);
    assert(Math.abs(player.hp - 0.7) < 1e-9, "expected hp 0.7 after 0.3 damage, got " + player.hp);
    assert(player.alive === true, "expected alive true at hp 0.7");

    player.damage(10); // way over max remaining hp — must clamp, not go negative
    assert(player.hp === 0, "expected hp clamped to 0, got " + player.hp);
    assert(player.alive === false, "expected alive false at hp 0");

    // Further damage on an already-dead player stays clamped at 0.
    player.damage(0.5);
    assert(player.hp === 0, "expected hp to stay clamped at 0, got " + player.hp);

    // Dead player ignores movement input entirely.
    const beforeX = player.x;
    const beforeY = player.y;
    const beforeFacing = player.facing;
    for (let i = 0; i < 120; i++) {
      player.update({ moveX: 1, moveY: 1, run: true, stance: "stand" }, DT);
    }
    assert(player.x === beforeX && player.y === beforeY, "dead player should not move");
    assert(player.facing === beforeFacing, "dead player's facing should not change");
    assert(player.moving === false, "dead player's moving flag should be false");
    assert(player.running === false, "dead player's running flag should be false");
  },
});

// ---- 2. Guard in ALERT with LOS at close range fires after FIRE_FIRST_DELAY_S ----
Game.selfTests.push({
  name: "combat: guard in ALERT with LOS fires its first shot ~FIRE_FIRST_DELAY_S after entering ALERT",
  fn: function () {
    const engine = firefightEngine(830001, 5);

    const result = driveFirefight(engine, 900, function (s) {
      return s.alertTick !== null && s.fireEvents.length >= 1;
    });

    assert(result.alertTick !== null, "guard never reached ALERT — setup invalid");
    assert(result.fireEvents.length >= 1, "guard never fired a shot");

    const ticksSinceAlert = result.fireEvents[0].tick - result.alertTick;
    const expectedTicks = Math.round(Game.GUARD.FIRE_FIRST_DELAY_S / DT); // 36 @ 60Hz
    assert(
      Math.abs(ticksSinceAlert - expectedTicks) <= 2,
      "expected first shot ~" + expectedTicks + " ticks (" + Game.GUARD.FIRE_FIRST_DELAY_S +
        "s) after ALERT, got " + ticksSinceAlert + " ticks"
    );
  },
});

// ---- 3. Fire cadence ~FIRE_INTERVAL_S between shots while LOS holds ----
Game.selfTests.push({
  name: "combat: fire cadence stays ~FIRE_INTERVAL_S between shots while LOS holds",
  fn: function () {
    const engine = firefightEngine(830002, 5);

    // 25s horizon: comfortably enough time (after however long it takes to
    // reach ALERT, plus FIRE_FIRST_DELAY_S) to observe several shots at the
    // 1.5s cadence.
    const result = driveFirefight(engine, 1500, function (s) {
      return s.fireEvents.length >= 4;
    });

    assert(result.alertTick !== null, "guard never reached ALERT — setup invalid");
    assert(result.fireEvents.length >= 4, "expected at least 4 shots, got " + result.fireEvents.length);

    const expectedTicks = Math.round(Game.GUARD.FIRE_INTERVAL_S / DT); // 90 @ 60Hz
    for (let i = 1; i < result.fireEvents.length; i++) {
      const delta = result.fireEvents[i].tick - result.fireEvents[i - 1].tick;
      assert(
        Math.abs(delta - expectedTicks) <= 2,
        "expected ~" + expectedTicks + " ticks (" + Game.GUARD.FIRE_INTERVAL_S +
          "s) between shot " + (i - 1) + " and " + i + ", got " + delta + " ticks"
      );
    }
  },
});

// ---- 4. Hits reduce hp by FIRE_DAMAGE; playerHit events carry decreasing hp ----
Game.selfTests.push({
  name: "combat: a HIT shot reduces player.hp by FIRE_DAMAGE, and playerHit events carry strictly decreasing hp",
  fn: function () {
    const engine = firefightEngine(830003, 5);

    const result = driveFirefight(engine, 3000, function (s) {
      return s.hitEvents.length >= 3;
    });

    assert(result.alertTick !== null, "guard never reached ALERT — setup invalid");
    assert(result.hitEvents.length >= 3, "expected at least 3 hits, got " + result.hitEvents.length + " (seed/setup should guarantee this)");

    let expectedHp = 1;
    for (const hitEv of result.hitEvents) {
      expectedHp = Math.max(0, expectedHp - Game.GUARD.FIRE_DAMAGE);
      assert(
        Math.abs(hitEv.hp - expectedHp) < 1e-9,
        "expected playerHit hp " + expectedHp + " after a FIRE_DAMAGE hit, got " + hitEv.hp
      );
    }

    // hp sequence across hits is strictly decreasing (while > 0).
    for (let i = 1; i < result.hitEvents.length; i++) {
      assert(
        result.hitEvents[i].hp < result.hitEvents[i - 1].hp,
        "expected strictly decreasing hp across hits, got " + result.hitEvents[i - 1].hp + " -> " + result.hitEvents[i].hp
      );
    }

    assert(Math.abs(engine.player.hp - expectedHp) < 1e-9, "engine.player.hp should match the last playerHit hp");
  },
});

// ---- 5. Crouching takes strictly fewer hits than standing, under otherwise identical conditions ----
// DESIGN NOTE ON THE TWO ARMS COMPARED: the accuracy formula is base 0.75,
// HALVED if player.moving, HALVED AGAIN (independently) if stance is
// crouch/crawl — i.e. moving and crouch/crawl are two SEPARATE, EQUALLY-
// WEIGHTED (x0.5 each) penalties applied to the SAME base, not a ladder where
// crouching "beats" moving. That means "crouched+stationary" (only the
// crouch halving applies: 0.75*0.5=0.375) and "standing+moving" (only the
// moving halving applies: 0.75*0.5=0.375) land on the EXACT SAME chance —
// verified empirically while authoring this test: driving both arms from the
// SAME seed with the SAME guard geometry (necessary so both draw from the
// SAME rng.next() sequence at the SAME shot indices, see below) produced
// IDENTICAL hit counts for every one of 2000 seeds tried, because the two
// arms are, by the formula, indistinguishable single-penalty cases — there
// is no seed that makes one "robustly fewer" than the other, since they are
// not actually different distributions. So this test instead holds `moving`
// CONSTANT (true in both arms — a player actively repositioning during a
// firefight, the realistic combat case) and varies ONLY stance, isolating
// the crouch/crawl halving on its own: crouched+moving (0.75*0.5*0.5=0.1875)
// vs standing+moving (0.75*0.5=0.375). This is a real, unequal comparison —
// crouching provably helps on top of already moving — and is what "crouching
// reduces hits taken" cashes out to under the specified formula.
//
// LOCKSTEP + SEED CHOICE: both runs force squad.phase = "ALERT" (with
// lastKnown already at the player's position) BEFORE the very first tick, so
// guard.state syncs to ALERT on tick 0 in both runs regardless of the
// target's visionProfile() (crouch vs stand would otherwise change how long
// PRE-alert perception takes to fill the meter, shifting the two runs' fire
// cadence out of lockstep). Both runs keep the player at the SAME position
// for the whole window, fed via an identical tiny moveX (0.0001) every tick
// in BOTH arms — per src/player.js's contract, player.moving reflects
// movement INTENT ("before the moveCircle collision resolve"), so this
// genuinely sets moving=true via the real mechanism while the actual
// resulting displacement (speed * dt * 0.0001) is many orders of magnitude
// below anything that could change distance/LOS. With guard geometry and
// fire cadence therefore IDENTICAL between the two runs, both consume the
// SAME rng.next() draw at each shot (rng.js: one seed => one deterministic
// draw sequence, and guardAI.js's fire roll is the only rng consumer wired
// up this cycle), evaluated against a stricter threshold in the crouch run
// (0.1875) than the stand run (0.375). Since 0.1875 < 0.375, "draw < 0.1875"
// implies "draw < 0.375" for every single draw, so
// crouchMovingHits <= standMovingHits holds BY CONSTRUCTION for ANY seed —
// seed 29 was picked (searched 1..500) purely to pin a concrete, comfortably
// robust margin for the second assertion below (not because the <= itself
// needed a special seed).
Game.selfTests.push({
  name: "combat: crouching takes fewer hits than standing, both while moving, over identical 20s windows",
  fn: function () {
    const SEED = 29;
    const AHEAD = 5;
    const TICKS_20S = Math.round(20 / DT);

    function runFirefight(stance) {
      const engine = firefightEngine(SEED, AHEAD);
      engine.squad.phase = "ALERT";
      engine.squad.phaseTime = 0;
      engine.squad.lastKnown = { x: engine.player.x, y: engine.player.y };
      engine.player.stance = stance;
      const input = { moveX: 0.0001, moveY: 0, run: false, stance: stance };

      let hits = 0;
      for (let i = 0; i < TICKS_20S; i++) {
        engine.tick(input);
        for (const ev of engine.events) {
          if (ev.type === "guardFire" && ev.hit) hits++;
        }
        // This test measures HIT-CHANCE behavior over a fixed 20s window, not
        // the death/game-over system (that's tests 4/6) — so a player who
        // would otherwise die partway through (ending the firefight early,
        // see src/engine.js's FROZEN ENGINE contract) is healed back to full
        // and un-frozen immediately, keeping both runs comparable over the
        // SAME full window instead of one truncating early.
        if (engine.gameOver) {
          engine.player.hp = 1;
          engine.player.alive = true;
          engine.gameOver = false;
        }
      }
      return hits;
    }

    const crouchMovingHits = runFirefight("crouch");
    const standMovingHits = runFirefight("stand");

    assert(
      crouchMovingHits <= standMovingHits,
      "expected crouching to take <= hits vs standing (both moving), got " + crouchMovingHits + " vs " + standMovingHits
    );
    assert(
      standMovingHits - crouchMovingHits >= 4,
      "expected a robust margin (>=4) between standing+moving (" + standMovingHits +
        ") and crouched+moving (" + crouchMovingHits + ") hits over 20s"
    );
  },
});

// ---- 6. hp 0 -> gameOver event once, engine frozen (tick returns immediately) ----
Game.selfTests.push({
  name: "combat: hp reaching 0 sets gameOver exactly once and freezes the engine (tick returns immediately)",
  fn: function () {
    const engine = Game.createEngine({ seed: 99001 });
    assert(engine.gameOver === false, "expected fresh engine.gameOver false");

    engine.player.damage(1); // hp -> 0, alive -> false, directly (no combat needed)
    engine.tick(); // this tick should observe hp<=0 and latch gameOver

    assert(engine.gameOver === true, "expected engine.gameOver true after hp hit 0");
    const gameOverEvents = engine.events.filter(function (e) { return e.type === "gameOver"; });
    assert(gameOverEvents.length === 1, "expected exactly 1 gameOver event, got " + gameOverEvents.length);

    const frozenTickCount = engine.tickCount;
    const frozenTime = engine.time;
    for (let i = 0; i < 30; i++) {
      engine.tick({ moveX: 1, moveY: 1, run: true, stance: "stand" });
    }
    assert(engine.tickCount === frozenTickCount, "expected tickCount to freeze, got " + engine.tickCount + " vs " + frozenTickCount);
    assert(engine.time === frozenTime, "expected time to freeze, got " + engine.time + " vs " + frozenTime);

    const snap = engine.snapshot();
    assert(snap.gameOver === true, "expected snapshot().gameOver true");
    assert(snap.player.hp === 0, "expected snapshot().player.hp 0, got " + snap.player.hp);
    assert(snap.player.alive === false, "expected snapshot().player.alive false");
  },
});

// ---- 7. No firing outside ALERT ----
Game.selfTests.push({
  name: "combat: a guard in INVESTIGATE with LOS never fires — firing is exclusive to ALERT",
  fn: function () {
    const engine = Game.createEngine({ seed: 4001 });
    const guard = engine.guards[0];
    const px = guard.x + 4;
    const py = guard.y;

    // Drive the guard into INVESTIGATE via a strong noise, same public API
    // soundEvents.js would call (see guardAI.js's hearNoise contract).
    guard.hearNoise(px, py, "strong");
    assert(guard.state === "INVESTIGATE", "setup invalid: hearNoise('strong') should drive PATROL -> INVESTIGATE");

    engine.player.x = px;
    engine.player.y = py;

    let alertTick = null;
    let guardFireBeforeAlert = 0;
    let sawInvestigateOrCaution = guard.state === "INVESTIGATE" || guard.state === "CAUTION";
    for (let i = 0; i < 600 && alertTick === null; i++) {
      engine.tick();
      if (guard.state === "INVESTIGATE" || guard.state === "CAUTION") sawInvestigateOrCaution = true;
      if (engine.events.some(function (e) { return e.type === "guardFire"; })) guardFireBeforeAlert++;
      if (engine.squad.phase === "ALERT") alertTick = i;
    }

    assert(sawInvestigateOrCaution, "setup invalid: guard never spent time in INVESTIGATE/CAUTION");
    assert(alertTick !== null, "setup invalid: guard never escalated to ALERT (can't prove the pre-ALERT window meaningfully)");
    assert(guardFireBeforeAlert === 0, "guard fired a shot before squad.phase reached ALERT");
  },
});

// ---- 8. hudModel life tracks player.hp ----
Game.selfTests.push({
  name: "combat: hudModel life tracks player.hp once damaged",
  fn: function () {
    const engine = Game.createEngine({ seed: 1 });
    engine.player.damage(0.3);
    const model = Game.hudModel(engine);
    assert(Math.abs(model.life - 0.7) < 1e-9, "expected hudModel.life 0.7 after 0.3 damage, got " + model.life);
  },
});
