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

// ---- soundEvents playtest scenarios (cycle: soundEvents) -------------------
// Same engine-driven style as the "engine-driven infiltration" scenario
// above, exercising the knock verb + noise pipeline end to end against a
// guard on the REAL loadingDock waypoint loop.

scenarios.push({
  name: "knock lures guard from patrol and player slips by unseen",
  seed: 20260716007,
  run: function (G) {
    const zone = G.ZONES.loadingDock;
    // Guard spawns mid-leg on the real waypoint loop's west leg (SW(3,27)
    // <-> NW(3,2), a vertical x=3 line — see src/world.js's loadingDock
    // comment), heading toward waypoints[0] = NW next, same as any guard
    // walking that leg would be. waypoints is the REAL zone.waypoints array,
    // so after this the guard continues the normal NW->NE->SE->SW loop.
    const engine = G.createEngine({
      seed: this.seed,
      zoneData: zone,
      guardConfigs: [{ id: "lure-g1", spawn: { x: 3, y: 15 }, waypoints: zone.waypoints }],
    });

    // Player crouches at the west container's edge ((x:8-14,y:9-20) — see
    // zone comment) at (7.5,15): isBlockedCircle(7.5,15,KNOCK_WALL_DIST=1.2)
    // is true (0.5m from the container's west face), so a knock here is
    // valid, and the straight line back to the guard's (3,15) west-leg
    // position is 0 walls / 4.5m — well inside the ~8m "clear line" this
    // scenario calls for and the knock's 10m base radius.
    const knockAt = { x: 7.5, y: 15 };
    engine.player.x = knockAt.x;
    engine.player.y = knockAt.y;

    // A few settle ticks, crouched and still, so the guard's position at
    // knock time is exactly known (it will have barely moved off spawn).
    for (let i = 0; i < 5; i++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch" });
      engine.player.x = knockAt.x;
      engine.player.y = knockAt.y;
    }
    if (engine.guards[0].state !== "PATROL") {
      throw new Error("setup failed: guard not in PATROL before the knock, got " + engine.guards[0].state);
    }

    // Fire the knock.
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch", knock: true });
    engine.player.x = knockAt.x;
    engine.player.y = knockAt.y;

    if (!engine.events.some((e) => e.type === "knock")) {
      throw new Error("expected a knock event on the input.knock edge (player was adjacent to the west container)");
    }
    // A strong knock heard from PATROL goes straight to INVESTIGATE (see
    // guardAI.js's hearNoise contract) — same tick, so "within 2s of the
    // knock" holds with room to spare.
    if (engine.guards[0].state !== "INVESTIGATE") {
      throw new Error("expected the knock to lure the guard into INVESTIGATE, got " + engine.guards[0].state);
    }

    // The instant the knock lands, the player crawls away NORTH-WEST through
    // the west dark zone (x:2-7,y:9-20 — see zone comment) toward its far
    // (NW) corner at (2.5,9) — moving immediately (not lingering at the
    // stimulus point, which the guard's cone is about to converge on) is
    // what keeps exposure low: crawl (noiseRadius 0, visionProfile 0.3)
    // stacks with the zone's darkness (0.5x fill) so the guard's meter never
    // gets close to SUSPICIOUS_AT while it travels to, and searches, the now
    // player-vacated knock point. The run stops once the search completes
    // and the guard is confirmed back in PATROL — this scenario is about the
    // lure+slip-by, not the guard's unrelated patrol resumption afterward.
    const escapeTarget = { x: 2.5, y: 9 };
    const TOTAL_TICKS = Math.round(20 / DT); // ~2.3s travel + 8s search + buffer
    let minDistToKnock = Infinity;
    let backToPatrolAtTick = null;

    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      const t = tick * DT;
      const dx = escapeTarget.x - engine.player.x;
      const dy = escapeTarget.y - engine.player.y;
      const d2 = Math.hypot(dx, dy);
      const input =
        d2 > 0.1
          ? { moveX: dx / d2, moveY: dy / d2, run: false, stance: "crawl" }
          : { moveX: 0, moveY: 0, run: false, stance: "crawl" };
      engine.tick(input);

      const d = Math.hypot(engine.guards[0].x - knockAt.x, engine.guards[0].y - knockAt.y);
      if (d < minDistToKnock) minDistToKnock = d;
      if (engine.squad.phase !== "INFILTRATION") {
        throw new Error(
          "squad phase left INFILTRATION (" +
            engine.squad.phase +
            ") at t=" +
            t.toFixed(2) +
            "s — the guard spotted the player, the lure/slip-by failed"
        );
      }
      if (backToPatrolAtTick === null && engine.guards[0].state === "PATROL") {
        backToPatrolAtTick = tick;
        break; // lure+search+all-clear confirmed; stop here (see comment above)
      }
    }

    if (minDistToKnock > G.GUARD.ARRIVE_DIST) {
      throw new Error("guard never arrived at the knock's stimulus point, min dist " + minDistToKnock.toFixed(2));
    }
    if (backToPatrolAtTick === null) {
      throw new Error("guard never finished its search and returned to PATROL within the scenario window");
    }
  },
});

scenarios.push({
  name: "wall kills the knock: guard hut blocks a knock just beyond the attenuated radius",
  seed: 20260716008,
  run: function (G) {
    const zone = G.ZONES.loadingDock;
    // Guard spawns west of the guard hut ({x:9,y:3,w:6,h:5} = x:9-15,y:3-8 —
    // see zone comment), on the real waypoint loop (heading toward
    // waypoints[0] = NW next, same route any patrolling guard follows).
    const engine = G.createEngine({
      seed: this.seed,
      zoneData: zone,
      guardConfigs: [{ id: "wall-g1", spawn: { x: 7, y: 5 }, waypoints: zone.waypoints }],
    });

    // Player knocks from the EAST side of the guard hut, adjacent to it
    // (isBlockedCircle(15.5,5,KNOCK_WALL_DIST=1.2) true — 0.5m from the
    // hut's east face). The straight line back to the guard crosses the hut
    // exactly once (1 wall) and the RAW distance (8.5m) is comfortably under
    // knock's unattenuated 10m radius — it's specifically
    // WALL_ATTENUATION^1 (10 * 0.5 = 5m effective) putting 8.5m out of
    // range that kills this knock, not mere distance.
    const knockAt = { x: 15.5, y: 5 };
    engine.player.x = knockAt.x;
    engine.player.y = knockAt.y;

    const wallsCrossed = engine.soundEvents.wallsBetween(
      engine.guards[0].x,
      engine.guards[0].y,
      knockAt.x,
      knockAt.y
    );
    if (wallsCrossed < 1) {
      throw new Error("setup failed: expected >=1 wall (the guard hut) between guard and knock point, got " + wallsCrossed);
    }
    const rawDist = Math.hypot(knockAt.x - engine.guards[0].x, knockAt.y - engine.guards[0].y);
    if (rawDist >= G.SOUND.RADII.knock) {
      throw new Error(
        "setup failed: raw distance " +
          rawDist.toFixed(2) +
          "m already exceeds the unattenuated knock radius (" +
          G.SOUND.RADII.knock +
          "m) -- this wouldn't isolate the wall's effect"
      );
    }

    for (let i = 0; i < 5; i++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch" });
      engine.player.x = knockAt.x;
      engine.player.y = knockAt.y;
    }
    if (engine.guards[0].state !== "PATROL") {
      throw new Error("setup failed: guard not in PATROL before the knock, got " + engine.guards[0].state);
    }

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch", knock: true });
    engine.player.x = knockAt.x;
    engine.player.y = knockAt.y;

    if (!engine.events.some((e) => e.type === "knock")) {
      throw new Error("expected a knock event to fire (player was adjacent to the guard hut wall)");
    }
    if (engine.events.some((e) => e.type === "noiseHeard" && e.guardId === "wall-g1")) {
      throw new Error("expected the guard NOT to hear the knock through the wall, but it did");
    }

    const TOTAL_TICKS = Math.round(10 / DT); // 10s after the knock
    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch" });
      engine.player.x = knockAt.x;
      engine.player.y = knockAt.y;
      if (engine.guards[0].state !== "PATROL") {
        throw new Error(
          "guard left PATROL within 10s of a knock that should have been blocked by the wall, state=" +
            engine.guards[0].state
        );
      }
    }
  },
});

// ---- zone-transition playtest scenario (cycle: Zones) ----------------------
// Same engine-driven style as the scenarios above, but the whole point this
// time is crossing a REAL zone boundary mid-run: dock -> warehouse -> dock,
// asserting zero alerts across the entire trip and both zoneChange events
// firing. Reuses the west-flank route from the "engine-driven infiltration"
// scenario above for the Loading Dock leg (same geometry, same reasoning).
//
// IMPORTANT steering detail: each leg's "walk toward this waypoint" loop MUST
// stop dead the instant a zoneChange event fires, rather than continuing to
// chase that leg's ORIGINAL target coordinate — once engine.tick() swaps the
// world/player mid-loop, engine.player is a brand-new instance in the new
// zone, and a stale target from the old zone can put the steering vector
// wildly off (in an earlier draft of this scenario, chasing loadingDock's
// exit-dash target after the switch dragged the player straight through the
// Warehouse's OWN north stub into guards w1/w2's spawn points and triggered
// ALERT — the fix is simply to treat a zoneChange event as "leg complete,"
// exactly like reaching the waypoint itself).
//
// Guard-timing note: per src/engine.js's zone-transition semantics, guards
// are rebuilt FRESH at their ZONE_GUARDS spawn points on every zone entry (v1
// semantics — no persistence across a departure). So every time this
// scenario (re-)enters the Warehouse, w1 spawns at waypoints[0]=(3,2) (far
// NW) and w2 at waypoints2[0]=(17,5) (north-central) — both far from the
// south entrance (20,25) this scenario actually uses. The brief "move a few
// meters in" dip to (20,21) and pull back to (20,25.5) stays well south of
// w2's patrol rectangle (y:5-20) the whole time, and the total Warehouse
// dwell is far shorter than w2's ~18s travel time to get anywhere near that
// area (see src/world.js's warehouse comment) — comfortable margin, not a
// hair's-breadth timing dependency.
scenarios.push({
  name: "two-zone infiltration: dock to warehouse and back unseen",
  seed: 20260716009,
  run: function (G) {
    const dock = G.ZONES.loadingDock;
    const warehouse = G.ZONES.warehouse;
    const engine = G.createEngine({ seed: this.seed, zoneData: dock });

    const ARRIVE = 0.5;
    const MAX_LEG_TICKS = Math.round(30 / DT);
    let anyAlertEverFired = false;
    let zoneChangeCount = 0;

    // Walks toward `wp` until either arrival (ARRIVE) or a zoneChange event
    // fires (treated as leg completion — see the steering note above).
    // Throws if the leg stalls without either happening.
    function walkLeg(wp, legLabel) {
      for (let i = 0; i < MAX_LEG_TICKS; i++) {
        const dx = wp.x - engine.player.x;
        const dy = wp.y - engine.player.y;
        const d = Math.hypot(dx, dy);
        if (d <= ARRIVE) return;

        engine.tick({ moveX: d > 0 ? dx / d : 0, moveY: d > 0 ? dy / d : 0, run: false, stance: wp.stance });
        if (engine.squad.alertCount > 0) anyAlertEverFired = true;
        if (engine.events.some((e) => e.type === "zoneChange")) {
          zoneChangeCount++;
          return;
        }
      }
      throw new Error("scripted route stalled heading to " + legLabel + " " + JSON.stringify(wp));
    }

    // ---- Loading Dock: west flank to the north exit (same route as the
    // "engine-driven infiltration" scenario above) ----
    const dockLegs = [
      { x: 3, y: 27, stance: "stand" }, // west along the open south corridor
      { x: 3, y: 9, stance: "crouch" }, // north through the west-flank dark zone
      { x: 3, y: 2, stance: "crouch" }, // NW corner, still sneaking near the guard hut
      { x: dock.exit.x + dock.exit.w / 2, y: dock.exit.y + dock.exit.h / 2, stance: "stand" }, // dash for the exit gap
    ];
    for (const wp of dockLegs) {
      walkLeg(wp, "loadingDock leg");
      if (zoneChangeCount >= 1) break; // the exit-dash leg crossed; stop iterating dockLegs
    }
    if (engine.zone.id !== "warehouse") {
      throw new Error("expected to have crossed into warehouse, got zone " + engine.zone.id);
    }

    // ---- Warehouse: a few meters in from the south entrance, then straight
    // back out (well south of both guards' patrol ground — see the
    // guard-timing note above) ----
    const warehouseLegs = [
      { x: 20, y: 21, stance: "crouch" }, // a few meters north of the entrance
      { x: 20, y: 25.5, stance: "crouch" }, // back toward the south exit trigger
      { x: warehouse.exit.x + warehouse.exit.w / 2, y: warehouse.exit.y + warehouse.exit.h / 2, stance: "stand" }, // cross back
    ];
    for (const wp of warehouseLegs) {
      walkLeg(wp, "warehouse leg");
      if (zoneChangeCount >= 2) break;
    }
    if (engine.zone.id !== "loadingDock") {
      throw new Error("expected to have returned to loadingDock, got zone " + engine.zone.id);
    }

    if (zoneChangeCount !== 2) {
      throw new Error("expected exactly 2 zoneChange events (there and back), got " + zoneChangeCount);
    }
    if (anyAlertEverFired) {
      throw new Error("expected zero alerts across the whole two-zone round trip, but at least one fired");
    }
    if (engine.squad.alertCount !== 0) {
      throw new Error("expected squad.alertCount === 0 at the end, got " + engine.squad.alertCount);
    }

    // One more tick for good measure: proves the engine is still perfectly
    // usable after a round-trip zone transition, not just technically "not
    // crashed" the instant it landed back in loadingDock.
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
  },
});

// ---- combat playtest scenario (cycle: combat) ------------------------------
// A full firefight round-trip against the REAL engine: get made (ALERT),
// take at least one hit, then break contact and survive long enough for the
// squad ladder to wind all the way back down on its own — the "shootout,
// then get away" loop the guardFire/playerHit/gameOver wiring exists for.

scenarios.push({
  name: "firefight survival: alert, take hits, break contact, survive",
  seed: 20260716010,
  run: function (G) {
    const zone = G.ZONES.loadingDock;
    const engine = G.createEngine({ seed: this.seed, zoneData: zone });
    const guard = engine.guards[0];

    // Teleport 5m directly ahead of the guard's initial facing (0 rad, +x —
    // guard g1 spawns AT its own first waypoint, see src/guardAI.js's
    // initialFacing derivation) — the same close-range, dead-ahead setup
    // tests/combat.test.js's engine-driven tests use to force a real ALERT
    // (and, this cycle, real gunfire) quickly and reliably, without waiting
    // out a full patrol route.
    engine.player.x = guard.x + Math.cos(guard.facing) * 5;
    engine.player.y = guard.y + Math.sin(guard.facing) * 5;

    // ---- Phase 1: hold position and eat at least one hit ----
    const HOLD_MAX_TICKS = Math.round(25 / DT);
    let tookHit = false;
    let guardFireAfterAlertEnded = false;
    let alertEverSeen = false;
    let alertEndedTick = null; // tick index (in the flattened count below) ALERT first stopped being the phase
    let tickIndex = 0;

    for (; tickIndex < HOLD_MAX_TICKS && !tookHit; tickIndex++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
      if (engine.squad.phase === "ALERT") alertEverSeen = true;
      for (const ev of engine.events) {
        if (ev.type === "playerHit") tookHit = true;
      }
    }
    if (!alertEverSeen) {
      throw new Error("setup invalid: squad never reached ALERT while the player held position in plain sight");
    }
    if (!tookHit) {
      throw new Error("setup invalid: player never took a hit within " + (HOLD_MAX_TICKS * DT).toFixed(0) + "s of holding position under fire");
    }
    const hpAfterFirstHit = engine.player.hp;
    if (!(hpAfterFirstHit < 1 && hpAfterFirstHit > 0)) {
      throw new Error("expected 0 < hp < 1 right after the first hit, got " + hpAfterFirstHit);
    }

    // ---- Phase 2: break contact — flee to the west-flank dark zone ----
    // (x:2-7, y:9-20 — see src/world.js's loadingDock.darkZones), landing at
    // (4, 15): comfortably inside it, and far from BOTH squad.lastKnown
    // (pinned at wherever the player was actually last SEEN — near the
    // encounter point around (6-8, 2), see below) and every leg of the
    // guard's own patrol/CAUTION waypoint loop (the 4 perimeter corners at
    // roughly x~3/x~37/y~2/y~27 — see loadingDock.waypoints in src/world.js),
    // so neither EVASION's convergence-and-sweep at lastKnown nor CAUTION's
    // widened-cone patrol of the perimeter ever comes close enough to
    // re-spot the player here (verified empirically against several
    // candidate hideouts while authoring this scenario — a full scripted
    // sprint across the map, tried first, kept ending in the player either
    // running face-first into the west shipping container's north face
    // (guard hut/container geometry — see src/world.js) or, once it did
    // route around, getting run down again during EVASION's convergence
    // since it stopped moving at a reachable point, which both re-enables
    // the un-halved base 0.75 hit chance (see the ALERT/COMBAT accuracy note
    // in src/guardAI.js: player.moving must stay true for the halving to
    // apply) and gives the guard time to close in — repeatedly fatal in
    // practice). A teleport here is the same "jump straight to the next
    // beat" technique tests/combat.test.js and screenshot.js's scene setup
    // already use to skip re-deriving a full walking route for state that
    // isn't what's under test; what IS under test (a real hit taken, a real
    // multi-tick FSM ladder unwind, real guardFire-after-ALERT exclusion) is
    // still driven entirely through engine.tick().
    engine.player.x = 4;
    engine.player.y = 15;
    engine.player.stance = "crouch";

    const BREAK_MAX_TICKS = Math.round(5 / DT); // hasLOS should fail the very next tick
    let brokeContact = false;
    for (let i = 0; i < BREAK_MAX_TICKS && !brokeContact; i++, tickIndex++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch" });
      if (engine.squad.phase === "ALERT") alertEverSeen = true;
      if (alertEndedTick === null && engine.squad.phase !== "ALERT") alertEndedTick = tickIndex;
      for (const ev of engine.events) {
        if (ev.type === "guardFire" && alertEndedTick !== null) guardFireAfterAlertEnded = true;
      }
      if (engine.squad.phase === "EVASION" || engine.squad.phase === "CAUTION" || engine.squad.phase === "INFILTRATION") {
        brokeContact = true;
      }
    }
    if (!brokeContact) {
      throw new Error("player never broke contact (squad stayed ALERT) within " + (BREAK_MAX_TICKS * DT).toFixed(0) + "s of fleeing to the dark zone");
    }

    // ---- Phase 3: hold in the dark zone and let the squad ladder wind all the way down ----
    const COOLDOWN_MAX_TICKS = Math.round(120 / DT); // EVASION_S(30) + CAUTION_S(45) + generous margin
    let sawEvasion = engine.squad.phase === "EVASION";
    let sawCaution = engine.squad.phase === "CAUTION";
    let backToInfiltration = engine.squad.phase === "INFILTRATION";
    for (let i = 0; i < COOLDOWN_MAX_TICKS && !backToInfiltration; i++, tickIndex++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch" });
      if (engine.squad.phase === "EVASION") sawEvasion = true;
      if (engine.squad.phase === "CAUTION") sawCaution = true;
      if (engine.squad.phase === "INFILTRATION") backToInfiltration = true;
      for (const ev of engine.events) {
        if (ev.type === "guardFire" && alertEndedTick !== null) guardFireAfterAlertEnded = true;
      }
    }

    if (!sawEvasion) throw new Error("squad never passed through EVASION after breaking contact");
    if (!sawCaution) throw new Error("squad never passed through CAUTION after EVASION");
    if (!backToInfiltration) {
      throw new Error("squad never wound all the way back down to INFILTRATION within " + (COOLDOWN_MAX_TICKS * DT).toFixed(0) + "s of breaking contact");
    }
    if (guardFireAfterAlertEnded) {
      throw new Error("a guard fired a shot after ALERT had already ended — firing must be exclusive to ALERT");
    }
    if (!(engine.player.hp > 0)) {
      throw new Error("expected player.hp > 0 (survived) at the end, got " + engine.player.hp);
    }
    if (engine.player.hp >= 1) {
      throw new Error("expected player.hp < 1 (damage was actually taken) at the end, got " + engine.player.hp);
    }
    if (!engine.player.alive) {
      throw new Error("expected player.alive true at the end");
    }
    if (engine.gameOver) {
      throw new Error("expected engine.gameOver false — the player should have survived the firefight");
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
    if (snapshot.gameOver !== false || snapshot.player.alive !== true) {
      throw new Error("final snapshot should read gameOver:false, player.alive:true, got " + json);
    }

    // A few more ticks for good measure: the engine keeps ticking cleanly
    // (no throw) well after the whole ladder has resolved.
    for (let i = 0; i < 60; i++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
    }
  },
});

// ---- tranq playtest scenario (cycle: tranq) --------------------------------
// The signature non-lethal move: put the Loading Dock's own guard to sleep
// with a clean unaware headshot, then ghost the same proven west-flank route
// ("engine-driven infiltration" / "two-zone infiltration" above) into the
// Warehouse without ever tripping a single alert. Reuses those scenarios'
// exact dockLegs geometry (verified-clear west-flank route) and walkLeg
// steering technique (stop dead on a zoneChange event, per the "two-zone
// infiltration" scenario's own IMPORTANT steering note above).

scenarios.push({
  name: "tranq the dock guard and ghost the warehouse",
  seed: 20260716010,
  run: function (G) {
    const dock = G.ZONES.loadingDock;
    const engine = G.createEngine({ seed: this.seed, zoneData: dock });

    // g1 spawns at dock.waypoints[0] = (3,2), facing toward waypoints[1]
    // (east, facing 0) -- nothing has ticked yet, so this is exact.
    const guard = engine.guards[0];

    // Line up a clean, close-range shot: teleport the player a few meters
    // directly in front of the guard's facing, then face back toward it —
    // same teleport trick tests/combat.test.js and screenshot.js's "03-alert"
    // scene use to force a specific encounter without walking a real route.
    const ahead = 3;
    engine.player.x = guard.x + Math.cos(guard.facing) * ahead;
    engine.player.y = guard.y + Math.sin(guard.facing) * ahead;
    engine.player.facing = guard.facing + Math.PI;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", fire: true });

    const tranqEvents = engine.events.filter((e) => e.type === "tranqFired");
    if (tranqEvents.length !== 1 || !tranqEvents[0].hit || !tranqEvents[0].headshot) {
      throw new Error(
        "setup failed: expected a clean unaware headshot on the dock guard, got " + JSON.stringify(tranqEvents)
      );
    }
    if (guard.state !== "SLEEPING") {
      throw new Error("expected the dock guard to be SLEEPING immediately after the headshot, got " + guard.state);
    }
    if (engine.inventory.darts !== 11) {
      throw new Error("expected 11 darts left after one shot, got " + engine.inventory.darts);
    }
    if (engine.squad.alertCount !== 0 || engine.squad.phase !== "INFILTRATION") {
      throw new Error(
        "expected the tranq shot itself to raise zero alerts (squad still INFILTRATION), got phase=" +
          engine.squad.phase +
          " alertCount=" +
          engine.squad.alertCount
      );
    }

    // ---- Ghost to the Warehouse, unseen — same west-flank route as
    // "engine-driven infiltration"/"two-zone infiltration" above. The
    // sleeping guard sits at (3,2) the whole time (SLEEPING guards never
    // move — see src/guardAI.js's SLEEPING contract), directly on this
    // route's NW-corner waypoint; that's harmless (it perceives nothing
    // asleep, and guards were never solid obstacles to player movement to
    // begin with), so the route is walked unmodified.
    const ARRIVE = 0.5;
    const MAX_LEG_TICKS = Math.round(30 / DT);
    let anyAlertEverFired = false;
    let zoneChangeCount = 0;

    function walkLeg(wp) {
      for (let i = 0; i < MAX_LEG_TICKS; i++) {
        const dx = wp.x - engine.player.x;
        const dy = wp.y - engine.player.y;
        const d = Math.hypot(dx, dy);
        if (d <= ARRIVE) return;

        engine.tick({ moveX: d > 0 ? dx / d : 0, moveY: d > 0 ? dy / d : 0, run: false, stance: wp.stance });
        if (engine.squad.alertCount > 0) anyAlertEverFired = true;
        if (engine.events.some((e) => e.type === "zoneChange")) {
          zoneChangeCount++;
          return;
        }
      }
      throw new Error("scripted route stalled heading to " + JSON.stringify(wp));
    }

    const dockLegs = [
      { x: 3, y: 27, stance: "stand" },
      { x: 3, y: 9, stance: "crouch" },
      { x: 3, y: 2, stance: "crouch" },
      { x: dock.exit.x + dock.exit.w / 2, y: dock.exit.y + dock.exit.h / 2, stance: "stand" },
    ];
    for (const wp of dockLegs) {
      walkLeg(wp);
      if (zoneChangeCount >= 1) break;
    }

    if (engine.zone.id !== "warehouse") {
      throw new Error("expected to have crossed into warehouse, got zone " + engine.zone.id);
    }
    if (zoneChangeCount !== 1) {
      throw new Error("expected exactly 1 zoneChange event, got " + zoneChangeCount);
    }
    if (anyAlertEverFired) {
      throw new Error("expected zero alerts across the entire trip (tranq shot + walk), but at least one fired");
    }
    if (engine.squad.alertCount !== 0) {
      throw new Error("expected squad.alertCount === 0 at the end, got " + engine.squad.alertCount);
    }
    if (engine.squad.phase !== "INFILTRATION") {
      throw new Error("expected squad.phase INFILTRATION throughout, ended at " + engine.squad.phase);
    }
    if (engine.inventory.darts !== 11) {
      throw new Error("expected darts to still read 11 at the end (no further shots fired), got " + engine.inventory.darts);
    }
    // The dock guard itself is gone from engine.guards after the zone switch
    // (v1 zone semantics: guards are rebuilt fresh per zone, never persisted
    // across a departure — see src/engine.js's ZONE TRANSITIONS contract),
    // but the abandoned object reference is still ours to read: nothing
    // mutates it further once it's off the active roster, so it's frozen at
    // exactly the state it was in the instant the zone switched.
    if (guard.state !== "SLEEPING") {
      throw new Error("expected the dock guard to still read SLEEPING after the crossing, got " + guard.state);
    }
  },
});

// ---- CQC / drag / locker playtest scenario (cycle: CQC/body-drag/lockers) --
// "Clean up after yourself": dart a guard, drag the body to a locker, stuff
// it out of sight, then prove the cleanup actually worked — a squadmate's
// normal patrol sweeps right past where the body USED to lie and never
// alerts, and the engine never throws across the whole sequence. Uses the
// Warehouse (2 guards, w1/w2 — see src/engine.js's ZONE_GUARDS table) since
// the Loading Dock only has one guard and this needs a SECOND, independent
// guard to demonstrate "the colleague never finds out."

scenarios.push({
  name: "clean up after yourself: tranq, drag, stuff, ghost",
  seed: 20260716020,
  run: function (G) {
    const warehouse = G.ZONES.warehouse;
    const engine = G.createEngine({ seed: this.seed, zoneData: warehouse });

    const w1 = engine.guards[0]; // outer perimeter loop (waypoints)
    const w2 = engine.guards[1]; // center-aisle cross-sweep (waypoints2)
    if (w1.id !== "w1" || w2.id !== "w2") {
      throw new Error("setup failed: expected guards [w1, w2], got " + engine.guards.map((g) => g.id));
    }

    // ---- Dart w2 in the center aisle -----------------------------------
    // w2 spawns at waypoints2[0] = (17,5), facing straight at waypoints2[1]
    // = (22,5) i.e. due east (facing 0) — nothing has ticked yet, so this is
    // exact. Same "teleport 3m ahead of facing, then face back" technique as
    // the "tranq the dock guard" scenario above, reused verbatim for w2.
    const ahead = 3;
    engine.player.x = w2.x + Math.cos(w2.facing) * ahead;
    engine.player.y = w2.y + Math.sin(w2.facing) * ahead;
    engine.player.facing = w2.facing + Math.PI;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", fire: true });
    const tranqEvents = engine.events.filter((e) => e.type === "tranqFired");
    if (tranqEvents.length !== 1 || !tranqEvents[0].hit || !tranqEvents[0].headshot || tranqEvents[0].guardId !== "w2") {
      throw new Error("setup failed: expected a clean unaware headshot on w2, got " + JSON.stringify(tranqEvents));
    }
    if (w2.state !== "SLEEPING") {
      throw new Error("expected w2 SLEEPING immediately after the headshot, got " + w2.state);
    }
    const bodySpotX = w2.x;
    const bodySpotY = w2.y; // "the former body position" — see the assertion at the end below.

    // ---- Drag w2 to the nearest locker, then stuff it ------------------
    // Nearest of warehouse.lockers to w2's position (17,5) is (11,6) —
    // computed here (not hardcoded) so this stays correct if the level data
    // ever shifts. w1 is still at its (3,2) spawn at this point (only a
    // handful of ticks have elapsed) with NO LOS to either (17,5) or (11,6)
    // — both are blocked by the row-1/row-2 shelving from that angle — so
    // there's no risk of w1 spotting the not-yet-hidden drag in transit.
    let locker = null;
    let bestDist = Infinity;
    for (const lk of warehouse.lockers) {
      const d = Math.hypot(lk.x - w2.x, lk.y - w2.y);
      if (d < bestDist) {
        bestDist = d;
        locker = lk;
      }
    }
    if (!locker) throw new Error("setup failed: warehouse has no lockers");

    // Attach: teleport the player adjacent to the sleeping w2, then a G edge.
    engine.player.x = w2.x + 0.5;
    engine.player.y = w2.y;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    if (engine.dragging !== "w2") {
      throw new Error("setup failed: expected drag to attach to w2, got " + engine.dragging);
    }

    // Let go of the G key for one tick (drag omitted -> false) so the NEXT
    // press is a fresh edge — input.drag is edge-triggered exactly like
    // knock/fire/cqc (see src/engine.js contract), so two drag:true ticks
    // back to back would only register as one held key, not attach-then-
    // stuff. This tick's harmless DRAG FOLLOW just re-confirms w2 trailing
    // the (stationary) player.
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });

    // Teleport straight to the locker's doorstep (well within the 1.0m
    // interact range) and stuff — a fresh G edge, this time with a locker in
    // range while still dragging, so handleDragKey's priority takes the
    // STUFF branch (see src/engine.js's DRAG VERB / LOCKER VERB contract).
    engine.player.x = locker.x + (locker.x < w2.x ? 0.5 : -0.5);
    engine.player.y = locker.y;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    if (engine.dragging !== null) {
      throw new Error("expected drag released after stuffing, got " + engine.dragging);
    }
    if (!w2.hidden || w2.x !== locker.x || w2.y !== locker.y) {
      throw new Error(
        "expected w2 hidden at the locker (" + locker.x + "," + locker.y + "), got hidden=" + w2.hidden + " at (" + w2.x + "," + w2.y + ")"
      );
    }
    if (engine.squad.alertCount !== 0 || engine.squad.phase !== "INFILTRATION") {
      throw new Error(
        "expected zero alerts from the whole dart+drag+stuff sequence, got phase=" + engine.squad.phase + " alertCount=" + engine.squad.alertCount
      );
    }

    // ---- Ghost: park the player off-map, let w1 patrol normally --------
    // w1's own patrol loop opens with the FULL y=2 perimeter leg (spawn
    // (3,2) -> (37,2), see warehouse.waypoints), which passes directly over
    // x=11..17 — right past bodySpotX/bodySpotY, the former body position —
    // well within the first ~23s of this run (34m / PATROL_SPEED 1.5 m/s).
    // The player is parked far off-map throughout so this scenario isolates
    // ONE thing: does the ENVIRONMENT (an empty patch of floor where a body
    // used to be, plus a locker with a body stuffed in it elsewhere) ever
    // cause a spurious alert. Run comfortably under GUARD.SLEEP_S (60s) so
    // w2 doesn't wake mid-scenario (that mechanic has its own dedicated
    // coverage in tests/cqc.test.js) — this scenario is purely about w1.
    engine.player.x = -1000;
    engine.player.y = -1000;

    const GHOST_TICKS = Math.round(45 / DT);
    for (let i = 0; i < GHOST_TICKS; i++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
      if (engine.squad.phase !== "INFILTRATION" || engine.squad.alertCount !== 0) {
        throw new Error(
          "w1 alerted at tick " + i + " despite the body being safely stuffed away (phase=" + engine.squad.phase + ", alertCount=" + engine.squad.alertCount + ", w1 at (" + w1.x.toFixed(2) + "," + w1.y.toFixed(2) + "), former body spot (" + bodySpotX.toFixed(2) + "," + bodySpotY.toFixed(2) + "))"
        );
      }
    }

    if (engine.squad.phase !== "INFILTRATION" || engine.squad.alertCount !== 0) {
      throw new Error("expected INFILTRATION throughout with zero alerts at the end, got phase=" + engine.squad.phase + " alertCount=" + engine.squad.alertCount);
    }
    if (!w2.hidden) {
      throw new Error("expected w2 to still read hidden at the end (well under SLEEP_S), got hidden=" + w2.hidden);
    }
  },
});

// ---- box/chaff/ration playtest scenario ------------------------------------
// "box camp": a boxed, stationary player parked just off w1's own patrol lane
// (NOT on the traveled line itself, and NOT blocking his waypoint arrival --
// see src/engine.js's BOX VERB contract for why "visible but discounted" is
// the whole point) is ignored through a full pass; the instant the player
// starts moving while still in the box, the SAME guard notices within a few
// seconds ("blown if seen moving"). Engine never throws.

scenarios.push({
  name: "box camp: boxed player ignored by passing patrol, blown when moving in view",
  seed: 20260716021,
  run: function (G) {
    const warehouse = G.ZONES.warehouse;
    // Single guard on w1's own outer-perimeter loop (see src/world.js:
    // warehouse.waypoints) -- w2's separate center-aisle sweep is irrelevant
    // to this scenario and only adds noise, so it's left out via a bespoke
    // guardConfigs override (see src/engine.js's own opts.guardConfigs
    // contract) rather than fighting the default two-guard roster.
    const engine = G.createEngine({
      seed: this.seed,
      zoneData: warehouse,
      guardConfigs: [{ id: "w1", spawn: warehouse.waypoints[0], waypoints: warehouse.waypoints }],
    });
    const w1 = engine.guards[0];

    // (20,7): 5m south of w1's y=2 perimeter leg (spawn (3,2) -> (37,2), see
    // warehouse.waypoints) -- clear open floor (west of the row1/row2 aisle,
    // east of the far-west aisle, well clear of every shelving row/crate
    // cluster/dark zone), so w1's cone sweeps over this spot as it walks the
    // leg without ever colliding with the player's body (the perpendicular
    // offset keeps the player off the traveled line entirely).
    engine.player.x = 20;
    engine.player.y = 7;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
    if (!engine.inventory.boxOn) {
      throw new Error("setup failed: box never toggled on");
    }

    // ---- Camp: hold position through w1's full first leg + a buffer ----
    // 34m at PATROL_SPEED (1.5 m/s) is ~23s; 30s covers the whole leg with
    // margin. minDist tracks how close w1 actually gets (expected ~5m, the
    // perpendicular offset above) for the error message below.
    let minDist = Infinity;
    const CAMP_TICKS = Math.round(30 / DT);
    for (let i = 0; i < CAMP_TICKS; i++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", box: true });
      const d = Math.hypot(w1.x - engine.player.x, w1.y - engine.player.y);
      if (d < minDist) minDist = d;
      if (engine.squad.phase !== "INFILTRATION") {
        throw new Error(
          "w1 alerted at tick " + i + " despite the player being boxed and stationary (phase=" +
            engine.squad.phase + ", minDist so far " + minDist.toFixed(2) + "m)"
        );
      }
    }
    if (minDist > 6) {
      throw new Error("setup failed: w1 never passed within 6m of the camped player, min dist " + minDist.toFixed(2));
    }
    if (engine.squad.phase !== "INFILTRATION") {
      throw new Error("expected INFILTRATION after the full camp pass, got " + engine.squad.phase);
    }

    // ---- Reveal: keep the box on but start moving, right in w1's cone ----
    // Same teleport-2m-ahead-of-the-guard's-CURRENT-facing technique as the
    // "guard reaches INVESTIGATE within 2s of a strong knock" scenario above
    // (robust regardless of w1's own independent position/facing at this
    // point in its patrol) -- this time moveX is nonzero every tick, so
    // BOX PERCEPTION reads player.moving true and drops the discount to a
    // flat 1.0 (see engine.js's BOX VERB contract): "blown if seen moving".
    let revealedAt = null;
    const REVEAL_TICKS = Math.round(3 / DT);
    for (let i = 0; i < REVEAL_TICKS; i++) {
      const ahead = 2;
      engine.player.x = w1.x + Math.cos(w1.facing) * ahead;
      engine.player.y = w1.y + Math.sin(w1.facing) * ahead;
      engine.tick({ moveX: 1, moveY: 0, run: false, stance: "stand", box: true });
      if (w1.state === "SUSPICIOUS" || w1.state === "INVESTIGATE") {
        revealedAt = i;
        break;
      }
    }
    if (revealedAt === null) {
      throw new Error(
        "expected w1 to notice the boxed-but-moving player within 3s, final state=" + w1.state + " meter=" + w1.meter
      );
    }
  },
});

// A6 extension: test that crawl+boxed+moving ALSO triggers detection
// (movement while boxed = 1.0 profile regardless of stance, per engine.js's BOX PERCEPTION)
scenarios.push({
  name: "box blown when crawling in view too",
  seed: 20260716022,
  run: function (G) {
    const warehouse = G.ZONES.warehouse;
    const engine = G.createEngine({
      seed: this.seed,
      zoneData: warehouse,
      guardConfigs: [{ id: "w1", spawn: warehouse.waypoints[0], waypoints: warehouse.waypoints }],
    });
    const w1 = engine.guards[0];

    // Same position as above
    engine.player.x = 20;
    engine.player.y = 7;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crawl", box: true });
    if (!engine.inventory.boxOn) {
      throw new Error("setup failed: box never toggled on");
    }

    // Camp for 30s with crawl stance
    let minDist = Infinity;
    const CAMP_TICKS = Math.round(30 / DT);
    for (let i = 0; i < CAMP_TICKS; i++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crawl", box: true });
      const d = Math.hypot(w1.x - engine.player.x, w1.y - engine.player.y);
      if (d < minDist) minDist = d;
      if (engine.squad.phase !== "INFILTRATION") {
        throw new Error(
          "w1 alerted at tick " + i + " despite the player being boxed and stationary in crawl (phase=" +
            engine.squad.phase + ", minDist so far " + minDist.toFixed(2) + "m)"
        );
      }
    }
    if (minDist > 6) {
      throw new Error("setup failed: w1 never passed within 6m of the camped crawling player, min dist " + minDist.toFixed(2));
    }

    // Reveal: crawl+move+box should ALSO trigger SUSPICIOUS/INVESTIGATE
    let revealedAt = null;
    const REVEAL_TICKS = Math.round(3 / DT);
    for (let i = 0; i < REVEAL_TICKS; i++) {
      const ahead = 2;
      engine.player.x = w1.x + Math.cos(w1.facing) * ahead;
      engine.player.y = w1.y + Math.sin(w1.facing) * ahead;
      engine.tick({ moveX: 1, moveY: 0, run: false, stance: "crawl", box: true });
      if (w1.state === "SUSPICIOUS" || w1.state === "INVESTIGATE") {
        revealedAt = i;
        break;
      }
    }
    if (revealedAt === null) {
      throw new Error(
        "expected w1 to notice the crawling-boxed-but-moving player within 3s, final state=" + w1.state + " meter=" + w1.meter
      );
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
