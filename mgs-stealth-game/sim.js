// sim.js — headless playtest bot. Runs scripted infiltration scenarios against
// the REAL engine (60s+ of game time at fixed 60Hz) and asserts guard-behavior
// OUTCOMES, e.g.:
//   - "guard reaches INVESTIGATE within 2s of a knock"
//   - "all guards back to PATROL within 90s of lost contact"
//   - "no guard stuck in any state longer than its max timer"
// This catches the bugs an imagined playtest confidently misses.
//
// Scenarios live inline until the engine exists (cycle: GuardAI); each scenario
// is { name, seed, run(Game) } where run throws on a violated assertion.
const fs = require("fs");
const path = require("path");

const LOGIC_ORDER = [
  "rng.js",
  "world.js",
  "player.js",
  "soundEvents.js",
  "vision.js",
  "guardAI.js",
  "items.js",
  "director.js",
  "saveState.js",
  "engine.js",
];
const srcDir = path.join(__dirname, "src");
for (const f of LOGIC_ORDER) {
  const p = path.join(srcDir, f);
  if (fs.existsSync(p)) require(p);
}
const Game = global.Game;

const scenarios = [];

// Scaffold-phase scenario: proves the harness itself runs and the RNG that will
// drive every replay is deterministic over a long horizon. Real infiltration
// scenarios are added by the world/guardAI cycles and are append-only.
scenarios.push({
  name: "harness: 3600-tick deterministic RNG horizon (60s @ 60Hz)",
  seed: 20260716,
  run: function (G) {
    const a = G.createRng(this.seed);
    const b = G.createRng(this.seed);
    for (let tick = 0; tick < 3600; tick++) {
      if (a.next() !== b.next()) {
        throw new Error("replay determinism broken at tick " + tick);
      }
    }
  },
});

// ---- guardAI playtest scenarios -------------------------------------------
// Real world + vision + guard + a scripted (non-random) player, run at the
// engine's fixed timestep. These assert OUTCOMES a roleplayed playtest would
// check for, against the actual FSM implementation in src/guardAI.js.

const DT = 1 / 60;

function scriptedPlayer(x, y) {
  return {
    x: x,
    y: y,
    visionProfile: function () {
      return 1.0;
    },
  };
}

scenarios.push({
  name: "guard reaches INVESTIGATE within 2s of a strong knock",
  seed: 20260716001,
  run: function (G) {
    const world = G.createWorld(G.ZONES.loadingDock);
    const vision = G.createVision({ world: world });
    const rng = G.createRng(this.seed);
    // Spawn well away from the noise so the guard isn't already there.
    // (2,15) and (2,5) are open floor with a clear straight line between
    // them, verified against the real loadingDock walls.
    const guard = G.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: 2, y: 15 },
      waypoints: [{ x: 2, y: 15 }],
      id: "sim-knock",
    });
    const player = scriptedPlayer(-1000, -1000); // never seen; noise is the only stimulus
    const knockAt = { x: 2, y: 5 };

    let investigateAtTick = null;
    let minDistToKnock = Infinity;
    const TOTAL_TICKS = Math.round(20 / DT); // 20s of game time

    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      const t = tick * DT;
      if (Math.abs(t - 1.0) < DT / 2) {
        guard.hearNoise(knockAt.x, knockAt.y, "strong");
      }
      guard.update(DT, { player: player });
      if (investigateAtTick === null && guard.state === "INVESTIGATE") {
        investigateAtTick = tick;
      }
      const d = Math.hypot(guard.x - knockAt.x, guard.y - knockAt.y);
      if (d < minDistToKnock) minDistToKnock = d;
    }

    if (investigateAtTick === null) {
      throw new Error("guard never reached INVESTIGATE after the strong knock");
    }
    const investigateAtS = investigateAtTick * DT;
    if (investigateAtS > 3.0) {
      throw new Error(
        "expected INVESTIGATE by t<=3s (knock at t=1s + <=2s reaction), got t=" + investigateAtS.toFixed(2) + "s"
      );
    }
    if (minDistToKnock > G.GUARD.ARRIVE_DIST) {
      throw new Error("guard never arrived at the knock's stimulus point, min dist " + minDistToKnock.toFixed(2));
    }
  },
});

scenarios.push({
  name: "guard back in PATROL within 90s after losing contact",
  seed: 20260716002,
  run: function (G) {
    const world = G.createWorld(G.ZONES.loadingDock);
    const vision = G.createVision({ world: world });
    const rng = G.createRng(this.seed);
    // Single fixed waypoint far along facing 0 so the guard walks a stable
    // straight line without arriving during this scenario's window.
    const guard = G.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: 20, y: 5 },
      waypoints: [{ x: 1020, y: 5 }],
      id: "sim-lost-contact",
    });
    // Player stands 10m ahead in plain sight for exactly 1s (verified to
    // reach SUSPICIOUS well within that window but not fill all the way to
    // ALERT — closer range fills too fast), then teleports far away for the
    // rest of the run.
    const seenSpot = { x: 30, y: 5 };
    let hidPlayer = false;
    const TOTAL_TICKS = Math.round(90 / DT); // 90s of game time

    let reachedSuspicious = false;
    let backToPatrolAtTick = null;

    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      const t = tick * DT;
      const player = t < 1.0 ? scriptedPlayer(seenSpot.x, seenSpot.y) : scriptedPlayer(-1000, -1000);
      if (t >= 1.0) hidPlayer = true;
      guard.update(DT, { player: player });
      if (guard.state === "SUSPICIOUS") reachedSuspicious = true;
      if (guard.state === "ALERT") {
        throw new Error("guard should not have escalated to ALERT from a 1s sighting");
      }
      if (hidPlayer && guard.state === "PATROL" && backToPatrolAtTick === null) {
        backToPatrolAtTick = tick;
      }
    }

    if (!reachedSuspicious) {
      throw new Error("guard never reached SUSPICIOUS from the 1s sighting — scenario setup invalid");
    }
    if (backToPatrolAtTick === null) {
      throw new Error("guard never returned to PATROL within 90s of losing contact");
    }
    if (guard.meter > 0.05) {
      throw new Error("expected meter ~0 once back in PATROL, got " + guard.meter.toFixed(3));
    }
  },
});

scenarios.push({
  name: "no guard state exceeds its max timer over a 120s mixed run",
  seed: 20260716003,
  run: function (G) {
    const world = G.createWorld(G.ZONES.loadingDock);
    const vision = G.createVision({ world: world });
    const rng = G.createRng(this.seed);
    const guard = G.createGuard({
      world: world,
      vision: vision,
      rng: rng,
      spawn: { x: 20, y: 5 },
      waypoints: [{ x: 1020, y: 5 }],
      id: "sim-mixed",
    });
    const TOTAL_TICKS = Math.round(120 / DT); // 120s of game time

    // A handful of brief sightings and noises scattered through the run.
    // guard.update() itself throws if stateTime ever exceeds
    // GUARD.MAX_STATE_S for SUSPICIOUS/INVESTIGATE — that invariant is the
    // real assertion here; this scenario just has to keep perturbing the
    // guard enough to exercise every state repeatedly without crashing.
    const sightWindows = [
      [3, 3.4],
      [20, 20.3],
      [55, 55.5],
      [90, 90.2],
    ];
    const noiseEvents = [
      { at: 10, x: 25, y: 5, strength: "faint" },
      { at: 40, x: 22, y: 6, strength: "strong" },
      { at: 75, x: 18, y: 4, strength: "faint" },
      { at: 105, x: 21, y: 5, strength: "strong" },
    ];
    const firedNoises = new Set();

    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      const t = tick * DT;

      for (const ev of noiseEvents) {
        if (!firedNoises.has(ev) && Math.abs(t - ev.at) < DT / 2) {
          guard.hearNoise(ev.x, ev.y, ev.strength);
          firedNoises.add(ev);
        }
      }

      const inSightWindow = sightWindows.some(function (w) {
        return t >= w[0] && t < w[1];
      });
      const player = inSightWindow ? scriptedPlayer(23, 5) : scriptedPlayer(-1000, -1000);

      guard.update(DT, { player: player }); // throws internally if a state overruns its MAX_STATE_S ceiling
    }

    const validStates = ["PATROL", "SUSPICIOUS", "INVESTIGATE", "ALERT"];
    if (validStates.indexOf(guard.state) === -1) {
      throw new Error("guard ended the run in an invalid state: " + guard.state);
    }
  },
});

// ---- guardAI part-B playtest scenarios (squad + ALERT/EVASION/CAUTION) ----
// Same real world+vision+guard(+squad) setup as the part-A scenarios above,
// run at the engine's fixed timestep, asserting OUTCOMES against the actual
// squad-coordination FSM in src/guardAI.js.

scenarios.push({
  name:
    "full alert ladder: seen -> ALERT converge -> EVASION sweep -> CAUTION -> all guards PATROL within 90s of lost contact",
  seed: 20260716004,
  run: function (G) {
    const world = G.createWorld(G.ZONES.loadingDock);
    const vision = G.createVision({ world: world });
    const squad = G.createSquad();

    // Two guards on one shared squad. Guard A is the one that gets a close,
    // clear look at the player; guard B never does (parked far away, facing
    // off into open floor) — it only ever finds out via the "radio call"
    // (squad.phase forcing its state, see guardAI.js's contract header).
    const guardA = G.createGuard({
      world: world,
      vision: vision,
      rng: G.createRng(this.seed),
      spawn: { x: 20, y: 5 },
      waypoints: [{ x: 1020, y: 5 }], // straight, clear line east — same geometry as the part-A scenarios above
      id: "ladder-A",
      squad: squad,
    });
    const guardB = G.createGuard({
      world: world,
      vision: vision,
      rng: G.createRng(this.seed + 1),
      spawn: { x: 3, y: 27 },
      waypoints: [{ x: 37, y: 27 }], // clear east-west line far south, never near the sighting
      id: "ladder-B",
      squad: squad,
    });
    const guards = [guardA, guardB];

    // Player: hidden until t=0.5s, then shows itself 2m in front of guard A
    // (close range -> fills the meter fast) and holds there until ALERT is
    // confirmed, then teleports clean out of the zone for the rest of the run.
    const showAt = { x: 22, y: 5 };
    const hiddenAt = { x: -1000, y: -1000 };
    let shown = false;
    let teleportedOutTick = null;
    let alertTick = null;
    let evasionTick = null;
    let cautionTick = null;
    let infiltrationTick = null;

    const TOTAL_TICKS = Math.round(100 / DT); // 100s of game time

    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      const t = tick * DT;
      if (!shown && t >= 0.5) shown = true;
      const playerVisible = shown && teleportedOutTick === null;
      const player = playerVisible ? scriptedPlayer(showAt.x, showAt.y) : scriptedPlayer(hiddenAt.x, hiddenAt.y);

      // ---- REFERENCE ENGINE WIRING ----
      // This is the loop the future engine module must run: update every
      // guard on the squad first, THEN call squad.tick(dt, anyGuardHasLOS)
      // exactly once, using the OR of every guard's hasLOS this tick. Order
      // matters — squad.tick() must run after all guards so a guard that
      // just confirmed sight this same tick (and hasn't lost it) correctly
      // keeps the squad in ALERT, while a tick where truly nobody has LOS
      // flips it to EVASION. See guardAI.js's squad.tick() contract.
      for (const g of guards) g.update(DT, { player: player });
      const anyLOS = guards.some(function (g) {
        return g.hasLOS;
      });
      squad.tick(DT, anyLOS);
      // ---- END REFERENCE ENGINE WIRING ----

      if (alertTick === null && squad.phase === "ALERT") alertTick = tick;
      if (alertTick !== null && teleportedOutTick === null) {
        // The instant ALERT is confirmed, teleport the player out for good.
        teleportedOutTick = tick;
      }
      if (evasionTick === null && squad.phase === "EVASION") evasionTick = tick;
      if (cautionTick === null && squad.phase === "CAUTION") cautionTick = tick;
      if (infiltrationTick === null && squad.phase === "INFILTRATION") infiltrationTick = tick;
    }

    if (alertTick === null) throw new Error("squad never reached ALERT — scenario setup invalid");
    if (evasionTick === null) throw new Error("squad never reached EVASION after losing the player");
    if (cautionTick === null) throw new Error("squad never reached CAUTION");
    if (infiltrationTick === null) throw new Error("squad never returned to INFILTRATION");

    const lostContactTick = teleportedOutTick; // the tick the player vanished
    const evasionDelayS = (evasionTick - lostContactTick) * DT;
    if (evasionDelayS > 2.0) {
      throw new Error("expected EVASION within 2s of losing LOS, took " + evasionDelayS.toFixed(2) + "s");
    }

    const evasionToInfiltrationS = (infiltrationTick - evasionTick) * DT;
    if (evasionToInfiltrationS > 80) {
      throw new Error(
        "expected INFILTRATION within ~80s of EVASION starting, took " + evasionToInfiltrationS.toFixed(2) + "s"
      );
    }

    for (const g of guards) {
      if (g.state !== "PATROL") {
        throw new Error("expected guard " + g.id + " back in PATROL at the end, got " + g.state);
      }
    }
  },
});

scenarios.push({
  name: "knock during CAUTION: guard INVESTIGATEs at CAUTION_SPEED, then resumes CAUTION patrol (not INFILTRATION)",
  seed: 20260716005,
  run: function (G) {
    const world = G.createWorld(G.ZONES.loadingDock);
    const vision = G.createVision({ world: world });
    const squad = G.createSquad();
    // Start the squad already CAUTION with plenty of time left on its clock
    // (CAUTION_S is 45s; this scenario's knock-response takes well under
    // 15s, so the timer never expires mid-scenario — that's the point).
    squad.phase = "CAUTION";
    squad.phaseTime = 5;

    const guard = G.createGuard({
      world: world,
      vision: vision,
      rng: G.createRng(this.seed),
      spawn: { x: 2, y: 15 },
      waypoints: [{ x: 2, y: 15 }], // stationary "loop" — isolates the noise response
      id: "sim-caution-knock",
      squad: squad,
    });
    const player = scriptedPlayer(-1000, -1000); // never seen; the knock is the only stimulus
    const knockAt = { x: 2, y: 5 }; // 10m north, verified clear line (see the part-A knock scenario above)

    // One setup tick so the guard's radio-call sync (squad.phase CAUTION)
    // takes effect before the knock — a guard freshly created always starts
    // in PATROL and only adopts CAUTION once update() has observed the
    // squad's phase (see guardAI.js's contract header on the sync order).
    guard.update(DT, { player: player });
    squad.tick(DT, guard.hasLOS);
    if (guard.state !== "CAUTION") {
      throw new Error("setup failed: guard never synced into CAUTION, got " + guard.state);
    }

    guard.hearNoise(knockAt.x, knockAt.y, "strong");
    if (guard.state !== "INVESTIGATE") {
      throw new Error("expected strong noise during CAUTION to trigger INVESTIGATE, got " + guard.state);
    }

    let minDistToKnock = Infinity;
    let backToCautionAtTick = null;
    const TOTAL_TICKS = Math.round(20 / DT); // 20s: CAUTION_SPEED travel (10m/2m/s=5s) + 8s search + buffer

    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      guard.update(DT, { player: player });
      squad.tick(DT, guard.hasLOS);
      const d = Math.hypot(guard.x - knockAt.x, guard.y - knockAt.y);
      if (d < minDistToKnock) minDistToKnock = d;
      if (backToCautionAtTick === null && guard.state === "CAUTION") backToCautionAtTick = tick;
      if (guard.state === "PATROL") {
        throw new Error("guard fell back to INFILTRATION PATROL before the squad's CAUTION timer expired");
      }
    }

    if (minDistToKnock > G.GUARD.ARRIVE_DIST) {
      throw new Error("guard never arrived at the knock's stimulus point, min dist " + minDistToKnock.toFixed(2));
    }
    if (backToCautionAtTick === null) {
      throw new Error("guard never resumed CAUTION patrol after the investigate search completed");
    }
    if (squad.phase !== "CAUTION") {
      throw new Error("expected squad.phase to still read CAUTION (timer not expired), got " + squad.phase);
    }
  },
});

// ---- engine-driven scenario (cycle: Engine) --------------------------------
// Same playtest-outcome style as the guardAI scenarios above, but driven
// entirely through Game.createEngine()/engine.tick() instead of hand-wiring
// world/vision/guard/squad — this is the "real" way the game will drive
// itself from here on (see src/engine.js: "THIS IS THE ONLY SANCTIONED TICK
// LOOP"). Steering is simple per-segment "walk toward this waypoint" input,
// not pathfinding.

scenarios.push({
  name: "engine-driven infiltration: scripted route from spawn toward exit stays clean or recovers",
  seed: 20260716006,
  run: function (G) {
    const zone = G.ZONES.loadingDock;
    const engine = G.createEngine({ seed: this.seed, zoneData: zone });

    // West flank route: south corridor -> north through the west-flank dark
    // zone (x~4, sampled at x=3 to clear the SW crate cluster at x:4-7,
    // y:21-24) -> NW corner near the guard hut -> dash east along y~2 into
    // the exit gap (x:18-22, y:0-3).
    const legs = [
      { x: 3, y: 27, stance: "stand" }, // west along the open south corridor
      { x: 3, y: 9, stance: "crouch" }, // north through the west-flank dark zone
      { x: 3, y: 2, stance: "crouch" }, // NW corner, still sneaking near the guard hut
      { x: zone.exit.x + zone.exit.w / 2, y: zone.exit.y + zone.exit.h / 2, stance: "stand" }, // dash for the exit gap
    ];

    const ARRIVE = 0.5;
    const MAX_LEG_TICKS = Math.round(30 / DT); // 30s safety cap per leg
    let anyAlertEverFired = false;

    for (let legIdx = 0; legIdx < legs.length; legIdx++) {
      const wp = legs[legIdx];
      const isExitLeg = legIdx === legs.length - 1;
      let arrived = false;

      for (let i = 0; i < MAX_LEG_TICKS && !arrived; i++) {
        if (isExitLeg && engine.world.inRegion(engine.player.x, engine.player.y, zone.exit)) {
          arrived = true;
          break;
        }
        const dx = wp.x - engine.player.x;
        const dy = wp.y - engine.player.y;
        const d = Math.hypot(dx, dy);
        if (!isExitLeg && d <= ARRIVE) {
          arrived = true;
          break;
        }
        engine.tick({ moveX: d > 0 ? dx / d : 0, moveY: d > 0 ? dy / d : 0, run: false, stance: wp.stance });
        if (engine.squad.alertCount > 0) anyAlertEverFired = true;
      }

      if (!arrived) {
        throw new Error("scripted route stalled heading to leg " + legIdx + " " + JSON.stringify(wp));
      }
    }

    // Reached the exit region — stand still and, if an alert ever fired
    // along the way, give the squad ladder up to 120s more of game time to
    // wind all the way back down to INFILTRATION on its own (no manual squad
    // calls; the engine owns the loop).
    const HOLD_TICKS = Math.round(120 / DT);
    let backToInfiltration = engine.squad.phase === "INFILTRATION";
    for (let i = 0; i < HOLD_TICKS && !backToInfiltration; i++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
      if (engine.squad.alertCount > 0) anyAlertEverFired = true;
      if (engine.squad.phase === "INFILTRATION") backToInfiltration = true;
    }

    if (anyAlertEverFired && !backToInfiltration) {
      throw new Error(
        "squad never returned to INFILTRATION within 120s of the player reaching the exit and standing still"
      );
    }

    const snapshot = engine.snapshot();
    let json;
    try {
      json = JSON.stringify(snapshot);
    } catch (e) {
      throw new Error("final snapshot() is not JSON-serializable: " + (e && e.message));
    }
    if (typeof json !== "string" || json.length === 0) {
      throw new Error("final snapshot() serialized to an unexpected empty value");
    }

    const validStates = ["PATROL", "SUSPICIOUS", "INVESTIGATE", "ALERT", "EVASION", "CAUTION"];
    for (const g of engine.guards) {
      if (validStates.indexOf(g.state) === -1) {
        throw new Error("guard " + g.id + " ended the run in an invalid state: " + g.state);
      }
    }
  },
});

let pass = 0;
let fail = 0;
for (const s of scenarios) {
  try {
    s.run(Game);
    pass++;
    console.log(`  ok   ${s.name}`);
  } catch (e) {
    fail++;
    console.error(`  FAIL ${s.name}`);
    console.error(`       ${e && e.stack ? e.stack.split("\n")[0] : e}`);
  }
}

console.log(`\nsim.js: ${pass}/${pass + fail} scenarios passed`);
process.exit(fail === 0 ? 0 : 1);
