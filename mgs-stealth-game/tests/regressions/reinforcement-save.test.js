// tests/regressions/reinforcement-save.test.js — regression test for
// cycle-40 audit finding B1 (CRITICAL) and its companion B2: a save captured
// while a director.js-spawned reinforcement guard ("reinf-<n>") was alive on
// the roster used to be SILENTLY UNLOADABLE. src/saveState.js's restore()
// only knew how to rebuild the ZONE_GUARDS base roster, so any saved guard
// id it didn't recognize threw "no guard with id reinf-1 ...", and
// src/boot.js's F9 caught that throw and showed a "NO SAVE" toast instead of
// surfacing the error — the player's save was gone with no indication why.
// Repro (as filed): ALERT -> wait ~6-16s for reinf-1 -> F5 -> F9.
//
// B2 (found while fixing B1): director.js's own reinforcementSeq/
// alertWasActive/nextSpawnAt closure vars were absent from its
// getState()/setState() — a naive fix that only reconstructed the GUARD
// (without also restoring the director's own bookkeeping) would leave
// reinforcementSeq reset to 0 after a restore, so the very next spawn would
// reissue "reinf-1" — an id already in use by the just-restored guard.
//
// Same registry pattern as every other tests/*.js file: push onto the
// shared Game.selfTests list; test.js runs every entry headless, and
// boot.js runs the SAME list in-browser before the title screen.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var DT = 1 / 60;

// Holds squad.phase pinned to "ALERT" for `ticks` engine ticks, re-pinning
// (and re-supplying lastKnown) every single tick — same precedent as
// tests/escalation.test.js and tests/zonePersistence.test.js use: with the
// player parked off-map (never gaining real LOS), squad.tick()'s own
// ALERT -> EVASION decay would otherwise fire the very first tick, so this
// overrides it dead-straight every time, exactly like a live sustained
// ALERT bout would read from director.tickEscalation()'s point of view.
//
// POSTCONDITION (deliberate): on return, squad.phase reads "ALERT" again,
// with every awake guard's OWN state resynced to match. Without this,
// engine.squad.phase would read "EVASION" the instant this function
// returns — the LAST tick's own squad.tick(dt, anyLOS=false) call always
// decays ALERT -> EVASION at its very end (anyLOS is always false here, the
// player is parked off-map), one tick after that same tick's guard-update
// loop already resynced guard.state to ALERT from the phase this function
// force-set at the TOP of that tick (see src/engine.js's own tick() step
// order: guards update first, squad.tick() runs last). A real F5 press,
// mid a real sustained ALERT bout (anyLOS genuinely true because the
// player is actually visible), would never read that one-tick-stale
// combination — so this function re-pins phase/lastKnown one final time,
// WITHOUT ticking again, to leave the engine in a state a real capture()
// could actually observe: squad.phase and every guard's own state reading
// "ALERT" in agreement, exactly as of the instant BETWEEN two ticks (which
// is exactly when a real save happens — see src/boot.js's F5 handler).
// Returns the ids of every "reinforcement" event fired during the hold.
function holdAlert(engine, lastKnown, ticks) {
  var spawnedIds = [];
  for (var i = 0; i < ticks; i++) {
    engine.squad.phase = "ALERT";
    engine.squad.lastKnown = { x: lastKnown.x, y: lastKnown.y };
    engine.tick();
    for (var e = 0; e < engine.events.length; e++) {
      if (engine.events[e].type === "reinforcement") spawnedIds.push(engine.events[e].guardId);
    }
  }
  engine.squad.phase = "ALERT";
  engine.squad.lastKnown = { x: lastKnown.x, y: lastKnown.y };
  return spawnedIds;
}

function findGuard(engine, id) {
  for (var i = 0; i < engine.guards.length; i++) {
    if (engine.guards[i].id === id) return engine.guards[i];
  }
  return null;
}

// A busier scripted log than a plain sine wave — presses run on scattered
// edges too, same "exercise more than just position" spirit as
// tests/saveState.test.js's own mixedInput. Kept well under the 40s radio
// check-in interval's first boundary (see src/director.js's own
// PURE-FUNCTION CHECK-IN SCHEDULE / missingSearchers documented-gap note) —
// this file's own scenarios never accumulate more than ~20s of engine.time
// before their final tick, so the check-ins' one still-undocumented gap
// (missingSearchers not captured) can never actually fire mid-test here.
function scriptedInput(tick) {
  return {
    moveX: Math.sin(tick * 0.041),
    moveY: Math.cos(tick * 0.029),
    run: tick % 9 === 0,
    stance: tick % 180 < 60 ? "crouch" : tick % 180 < 120 ? "crawl" : "stand",
  };
}

// ---------------------------------------------------------------------------
// 1. THE REPRO: ALERT -> a reinforcement spawns -> capture mid-ALERT ->
//    restore() succeeds (no throw) -> restored roster has the reinforcement
//    guard at its saved position/state.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "regression(cycle40 audit B1): saveState.restore() no longer throws on a save captured mid-ALERT with a live reinforcement guard",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var engine = Game.createEngine({ zoneData: dock, seed: 40001 });
    engine.player.x = -1000;
    engine.player.y = -1000;

    var HOLD_TICKS = Math.round(8 / DT); // reinf-1 is due at +6s (REINFORCEMENT_FIRST_DELAY_S)
    var spawned = holdAlert(engine, dock.playerSpawn, HOLD_TICKS);
    assert(spawned.length >= 1, "setup failed: no reinforcement spawned within 8s of ALERT");
    assert(engine.guards.length === 2, "setup: expected 1 base guard + 1 reinforcement, got " + engine.guards.length);

    var reinfId = spawned[0];
    var liveReinf = findGuard(engine, reinfId);
    assert(liveReinf, "setup failed: spawned reinforcement not found on engine.guards");
    var savedX = liveReinf.x;
    var savedY = liveReinf.y;
    var savedState = liveReinf.state;

    var saveState = Game.createSaveState();
    // JSON round-trip, exactly like a real F5 -> localStorage -> F9 cycle.
    var save = JSON.parse(JSON.stringify(saveState.capture(engine)));
    assert(
      save.guards.some(function (g) { return g.id === reinfId; }),
      "setup failed: captured save doesn't contain the reinforcement guard"
    );

    var threw = false;
    var thrownMessage = "";
    var restored = null;
    try {
      restored = saveState.restore(save);
    } catch (e) {
      threw = true;
      thrownMessage = String((e && e.message) || e);
    }
    assert(!threw, "THE BUG: restore() threw on a save with a live reinforcement guard: " + thrownMessage);

    assert(
      restored.guards.length === 2,
      "expected 2 guards on the restored roster (1 base + 1 reinforcement), got " + restored.guards.length
    );
    var restoredReinf = findGuard(restored, reinfId);
    assert(restoredReinf, "expected the restored roster to include " + reinfId);
    assert(
      restoredReinf.x === savedX && restoredReinf.y === savedY,
      "restored reinforcement position mismatch: expected (" + savedX + "," + savedY + "), got (" + restoredReinf.x + "," + restoredReinf.y + ")"
    );
    assert(
      restoredReinf.state === savedState,
      "restored reinforcement state mismatch: expected " + savedState + ", got " + restoredReinf.state
    );
  },
});

// ---------------------------------------------------------------------------
// 2. THE HARD GATE: capture mid-ALERT with a reinforcement alive, then tick
//    both the original (still-ticking) engine and a freshly restored one
//    600 MORE ticks with the SAME scripted input log -> byte-identical
//    snapshot() JSON. This is the actual proof that the reinforcement guard
//    isn't just present after restore, but correctly wired into everything
//    (squad, rng, waypoints, director's own bookkeeping) that determinism
//    depends on.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "regression(cycle40 audit B1) HARD GATE: save mid-ALERT with a reinforcement, 600 more ticks vs restore+same ticks -> identical snapshot",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var engineA = Game.createEngine({ zoneData: dock, seed: 40002 });
    engineA.player.x = -1000;
    engineA.player.y = -1000;

    var HOLD_TICKS = Math.round(8 / DT);
    var spawned = holdAlert(engineA, dock.playerSpawn, HOLD_TICKS);
    assert(spawned.length >= 1, "setup failed: no reinforcement spawned");
    assert(engineA.guards.length === 2, "setup: expected 2 guards");

    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engineA)));

    for (var t = 0; t < 600; t++) engineA.tick(scriptedInput(t));

    var engineB = saveState.restore(save);
    for (t = 0; t < 600; t++) engineB.tick(scriptedInput(t));

    var snapA = JSON.stringify(engineA.snapshot());
    var snapB = JSON.stringify(engineB.snapshot());
    assert(
      snapA === snapB,
      "reinforcement replay gate diverged:\nA=" + snapA + "\nB=" + snapB
    );
  },
});

// ---------------------------------------------------------------------------
// 3. Post-restore id continuity (audit B2): after restore, forcing a NEW
//    reinforcement spawn (keeping ALERT alive) must never reissue an id
//    already on the restored roster. Pins director.js's reinforcementSeq
//    surviving getState()/setState().
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "regression(cycle40 audit B2): reinforcementSeq survives a restore -- a post-restore spawn never collides with an existing guard id",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var engine = Game.createEngine({ zoneData: dock, seed: 40003 });
    engine.player.x = -1000;
    engine.player.y = -1000;

    var HOLD_TICKS = Math.round(8 / DT);
    var spawned = holdAlert(engine, dock.playerSpawn, HOLD_TICKS);
    assert(spawned.indexOf("reinf-1") !== -1, "setup failed: expected reinf-1 to have spawned, got " + JSON.stringify(spawned));
    assert(engine.guards.length === 2, "setup: expected 1 base + reinf-1");

    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engine)));
    var restored = saveState.restore(save);
    assert(restored.squad.phase === "ALERT", "expected restored engine still mid-ALERT");

    // Hold ALERT open through the second scheduled spawn (+10s more, see
    // src/director.js's own REINFORCEMENT_INTERVAL_S) on the RESTORED
    // engine -- long enough for a fresh spawn even under the bugged
    // behavior (reinforcementSeq wrongly reset to 0 would still spawn
    // SOMETHING, just with a colliding id).
    var MORE_TICKS = Math.round(15 / DT);
    var newIds = holdAlert(restored, dock.playerSpawn, MORE_TICKS);
    assert(newIds.length >= 1, "expected a further reinforcement to spawn while ALERT stayed open post-restore, got none");
    assert(
      newIds.indexOf("reinf-1") === -1,
      "B2 regression: post-restore spawn reissued an id already in use (reinf-1), got " + JSON.stringify(newIds)
    );

    var idCounts = {};
    for (var k = 0; k < restored.guards.length; k++) {
      var gid = restored.guards[k].id;
      idCounts[gid] = (idCounts[gid] || 0) + 1;
    }
    for (var gid2 in idCounts) {
      assert(idCounts[gid2] === 1, "duplicate guard id on the restored roster: " + gid2 + " (x" + idCounts[gid2] + ")");
    }
  },
});

// ---------------------------------------------------------------------------
// 4. Corrupt-save honesty: a save blob with a bogus, non-reinforcement-
//    shaped guard id must still throw -- pins the intended strictness (this
//    fix widens WHAT'S accepted, it must not turn restore() into something
//    that silently half-loads a genuinely corrupt save).
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "regression(cycle40): restore() still throws on a genuinely unrecognized (non-reinforcement) guard id",
  fn: function () {
    var engine = Game.createEngine({ zoneData: Game.ZONES.loadingDock, seed: 40004 });
    for (var i = 0; i < 30; i++) engine.tick();

    var saveState = Game.createSaveState();

    var save1 = saveState.capture(engine);
    save1.guards.push({ id: "totally-bogus-guard-id", state: save1.guards[0].state });
    var threw1 = false;
    var message1 = "";
    try {
      saveState.restore(save1);
    } catch (e) {
      threw1 = true;
      message1 = String((e && e.message) || e);
    }
    assert(threw1, "expected restore() to throw on an unrecognized, non-reinforcement guard id");
    assert(/totally-bogus-guard-id/.test(message1), "expected the error to name the offending id, got: " + message1);

    // A near-miss that LOOKS reinforcement-ish but doesn't match the exact
    // "reinf-<digits>" shape director.js actually mints -- must still throw,
    // pinning that the id check is a real pattern match, not a loose prefix
    // check.
    var save2 = saveState.capture(engine);
    save2.guards.push({ id: "reinf-abc", state: save2.guards[0].state });
    var threw2 = false;
    var message2 = "";
    try {
      saveState.restore(save2);
    } catch (e2) {
      threw2 = true;
      message2 = String((e2 && e2.message) || e2);
    }
    assert(threw2, "expected restore() to throw on a non-numeric 'reinf-abc' id");
    assert(/reinf-abc/.test(message2), "expected the error to name the offending id, got: " + message2);
  },
});

// ---------------------------------------------------------------------------
// 5. Cross-system consistency: the INFILTRATION-only exit gate still holds
//    (a live reinforcement implies the zone went through ALERT, and
//    tryZoneTransition refuses to run outside INFILTRATION) -- but the
//    CALMER variant, a save taken in CAUTION (decayed out of ALERT, still
//    holding a persisted reinforcement guard) restores correctly too, and
//    once the restored engine itself decays the rest of the way to
//    INFILTRATION, the reinforcement guard resyncs to PATROL and a zone
//    transition succeeds -- proving the fix holds up through the full
//    escalate-then-calm-down lifecycle, not just the mid-ALERT snapshot.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "regression(cycle40): a CAUTION-phase save with a persisted reinforcement restores correctly, and the INFILTRATION exit gate is honored on both sides",
  fn: function () {
    var dock = Game.ZONES.loadingDock;
    var engine = Game.createEngine({ zoneData: dock, seed: 40005 });
    engine.player.x = -1000;
    engine.player.y = -1000;

    var HOLD_TICKS = Math.round(8 / DT);
    var spawned = holdAlert(engine, dock.playerSpawn, HOLD_TICKS);
    assert(spawned.indexOf("reinf-1") !== -1, "setup failed: expected reinf-1 to have spawned");

    // Force the decay ladder down to CAUTION directly (same direct-
    // assignment precedent tests/zonePersistence.test.js already uses for
    // INFILTRATION) -- two ticks for the phase flip + guard resync. Every
    // guard's own detection meter is reset to 0 first: holdAlert() above
    // leaves it pinned at 1 (guard.state === "ALERT" forces meter = 1 every
    // tick, see src/guardAI.js step 2 PERCEPTION), and the CAUTION FSM
    // branch immediately re-escalates back to ALERT if
    // guard.meter >= SUSPICIOUS_AT on its very first CAUTION tick (see
    // guardAI.js's own CAUTION case) -- a real decay reaches CAUTION only
    // after 30s+ of EVASION with no LOS, during which the meter would have
    // long drained on its own (see vision.js's own ~2s drain timing); this
    // direct-assignment shortcut skips that natural drain, so it's zeroed
    // by hand here to land in the SAME calmer state a real decay would.
    for (var mi = 0; mi < engine.guards.length; mi++) engine.guards[mi].meter = 0;
    engine.squad.phase = "CAUTION";
    engine.squad.phaseTime = 0;
    engine.squad.lastKnown = null;
    engine.tick();
    engine.tick();
    assert(engine.squad.phase === "CAUTION", "setup failed: expected squad.phase CAUTION, got " + engine.squad.phase);
    var reinf = findGuard(engine, "reinf-1");
    assert(reinf, "setup failed: reinf-1 missing from the roster");
    assert(reinf.state === "CAUTION", "setup failed: expected the reinforcement synced to CAUTION, got " + reinf.state);

    // CROSS-SYSTEM CHECK: the INFILTRATION-only exit gate still blocks a
    // crossing while squad.phase reads CAUTION (unrelated to this cycle's
    // fix, but the audit's own root-cause note was "these two systems
    // diverged" -- confirming this invariant still holds alongside the new
    // reinforcement-restore path is the point of this test).
    var exit = dock.exits[0];
    engine.player.x = exit.x + exit.w / 2;
    engine.player.y = exit.y + exit.h / 2;
    engine.player.stance = "crawl";
    engine.tick({ moveX: 0, moveY: 0, stance: "crawl" });
    assert(engine.zone.id === "loadingDock", "expected the CAUTION-phase zone transition to be blocked, but it crossed");

    // Move the player back off the trigger before saving.
    engine.player.x = -1000;
    engine.player.y = -1000;
    engine.tick();

    var savedX = findGuard(engine, "reinf-1").x;
    var savedY = findGuard(engine, "reinf-1").y;

    var saveState = Game.createSaveState();
    var save = JSON.parse(JSON.stringify(saveState.capture(engine)));
    assert(save.squad.phase === "CAUTION", "expected to capture mid-CAUTION, got " + save.squad.phase);

    var threw = false;
    var restored = null;
    try {
      restored = saveState.restore(save);
    } catch (e) {
      threw = true;
    }
    assert(!threw, "restore() threw on a CAUTION-phase save with a persisted reinforcement");
    assert(restored.squad.phase === "CAUTION", "expected restored squad.phase CAUTION, got " + restored.squad.phase);
    var restoredReinf = findGuard(restored, "reinf-1");
    assert(restoredReinf, "expected restored roster to include reinf-1");
    assert(restoredReinf.state === "CAUTION", "expected restored reinf-1 state CAUTION, got " + restoredReinf.state);
    assert(
      restoredReinf.x === savedX && restoredReinf.y === savedY,
      "restored reinforcement position mismatch"
    );

    // Now let the RESTORED engine finish decaying to INFILTRATION (same
    // direct-assignment precedent) -- the reinforcement guard should resync
    // to PATROL exactly like any other guard, and the exit gate should
    // open back up.
    restored.squad.phase = "INFILTRATION";
    restored.squad.phaseTime = 0;
    restored.squad.lastKnown = null;
    restored.tick();
    restored.tick();
    assert(restored.squad.phase === "INFILTRATION", "expected restored squad to finish decaying to INFILTRATION");
    var patrollingReinf = findGuard(restored, "reinf-1");
    assert(patrollingReinf.state === "PATROL", "expected reinf-1 resynced to PATROL, got " + patrollingReinf.state);

    restored.player.x = exit.x + exit.w / 2;
    restored.player.y = exit.y + exit.h / 2;
    restored.player.stance = "crawl";
    restored.tick({ moveX: 0, moveY: 0, stance: "crawl" });
    assert(
      restored.zone.id === "warehouse",
      "expected the now-INFILTRATION restored engine to cross into warehouse, got " + restored.zone.id
    );
  },
});
