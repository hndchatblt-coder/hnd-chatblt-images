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
        // "Arrived" at the exit leg means the player has actually crossed
        // into the next zone — checked via engine.zone.id (NEW, Laboratory
        // cycle: previously this checked inRegion(..., zone.exit), which
        // happened to also read true once the player wandered into
        // warehouse's own north stub trigger afterward, since that rect's
        // numbers happened to coincide with loadingDock's own exit rect and
        // the stub used to be permanently unresolved (so the player just
        // parked there). Now that the Laboratory zone is built, warehouse's
        // north exit actually resolves, so that coincidental fallback would
        // walk the scripted route into a SECOND zone transition and stall
        // at a locked door — checking the zone id directly is the more
        // correct, forward-compatible signal for "the crossing this leg
        // wants happened" regardless of how many further zones get built.
        if (isExitLeg && engine.zone.id !== zone.id) {
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

// ---- director / camera playtest scenario ----------------------------------
// Real warehouse + real cameras (src/director.js) + real chaff (src/items.js/
// src/engine.js). Proves the two systems actually cooperate end to end: a
// well-timed chaff throw blinds BOTH pilot cameras for one continuous window
// long enough to slip a scripted crossing between them unseen, squad staying
// INFILTRATION throughout -- and once the chaff fades, the SAME cameras go
// back to work within a couple seconds of a fresh sighting.
scenarios.push({
  name: "camera gauntlet: chaff the cameras and slip through, then get caught once chaff fades",
  seed: 20260716023,
  run: function (G) {
    const warehouse = G.ZONES.warehouse;
    const engine = G.createEngine({ seed: this.seed, zoneData: warehouse });
    const cam1 = warehouse.cameras[1]; // east-aisle camera, facing east

    // Throw chaff immediately -- disables both pilot cameras for CHAFF_S (15s).
    engine.tick({ moveX: 0, moveY: 0, chaff: true });
    if (!(engine.chaffUntil > engine.time)) {
      throw new Error("setup failed: chaff never armed");
    }

    // Scripted crossing: dead-center of camera0's cone (west, ~3.9m out) ->
    // the clear y:14-16 cross-aisle band that spans the FULL width of the
    // map (verified against the warehouse's real walls -- see src/world.js's
    // camera placement comments) -> dead-center of camera1's cone (east,
    // ~3.4m out). Position is driven directly (teleport, collision
    // bypassed) -- same technique sim.js's own box-camp-style scenarios
    // already use to script a path; the system under test here is
    // detection, not pathfinding.
    const waypoints = [
      { x: 10, y: 13.5 }, // camera0's cone, dead ahead
      { x: 13, y: 15 }, // duck into the clear cross-aisle band
      { x: 20, y: 15 }, // center spine
      { x: 27, y: 15 },
      { x: 33, y: 13.5 }, // camera1's cone, dead ahead
    ];

    const SEGMENT_TICKS = Math.round(0.5 / DT); // 0.5s per leg -> 2s total crossing
    let elapsedS = 0;
    let sawEscalation = false;

    for (let seg = 0; seg < waypoints.length - 1; seg++) {
      const a = waypoints[seg];
      const b = waypoints[seg + 1];
      for (let i = 0; i < SEGMENT_TICKS; i++) {
        const t = i / SEGMENT_TICKS;
        engine.player.x = a.x + (b.x - a.x) * t;
        engine.player.y = a.y + (b.y - a.y) * t;
        engine.tick({ moveX: 0, moveY: 0 });
        elapsedS += DT;

        for (const e of engine.events) {
          if (e.type === "cameraSuspicious" || e.type === "cameraAlert") sawEscalation = true;
        }
        if (engine.squad.phase !== "INFILTRATION") {
          throw new Error(
            "squad left INFILTRATION during the chaffed crossing at t=" +
              elapsedS.toFixed(2) +
              "s (phase=" +
              engine.squad.phase +
              ")"
          );
        }
      }
    }

    if (sawEscalation) {
      throw new Error("a camera escalated (cameraSuspicious/cameraAlert) during the chaffed crossing");
    }
    if (elapsedS >= G.ITEMS.CHAFF_S) {
      throw new Error(
        "setup failed: the scripted crossing (" + elapsedS.toFixed(2) + "s) took longer than the chaff window itself"
      );
    }

    // Wait out the remainder of the chaff window well clear of any camera,
    // so the eventual "detection resumes" check below is a clean, fresh
    // sighting rather than a stale one from the crossing above.
    engine.player.x = -50;
    engine.player.y = -50;
    const remaining = engine.chaffUntil - engine.time;
    const WAIT_TICKS = Math.round((remaining + 0.1) / DT);
    for (let i = 0; i < WAIT_TICKS; i++) {
      engine.player.x = -50;
      engine.player.y = -50;
      engine.tick({ moveX: 0, moveY: 0 });
    }
    if (engine.chaffUntil > engine.time) {
      throw new Error("setup failed: chaff never actually expired");
    }

    // THEN: cameras work again -- stand solidly in camera1's cone and expect
    // detection quickly. The camera's own sweep periodically carries the
    // cone off a stationary target (see src/director.js's tickCameras
    // contract), so a fresh meter climbing from 0 to Game.VISION.ALERT_AT at
    // 5m takes a bit under 3s in practice (confirmed empirically against
    // this exact scenario, and consistent with the unit-level timing
    // measured in tests/cameras.test.js) rather than an instant trip --
    // budgeted generously here at 4s so this isn't a flaky race against the
    // sweep's exact phase.
    let alertTick = null;
    const POST_CHAFF_TICKS = Math.round(4 / DT);
    for (let i = 0; i < POST_CHAFF_TICKS; i++) {
      engine.player.x = cam1.x + 5;
      engine.player.y = cam1.y;
      engine.tick({ moveX: 0, moveY: 0 });
      if (engine.squad.phase === "ALERT" || engine.squad.phase === "EVASION") {
        alertTick = i;
        break;
      }
    }
    if (alertTick === null) {
      throw new Error("expected the squad to go hostile within a few seconds of standing in camera1's cone once chaff faded");
    }
  },
});

// ---- Laboratory playtest scenario (new — Laboratory cycle) -----------------
// Real warehouse + real Laboratory (src/world.js) + real doors/keycards
// (src/items.js/src/engine.js's PICKUPS/DOORS steps) + real lasers
// (src/director.js). Proves the whole new keycard-gated chain works
// end-to-end in one continuous scripted route: grab the L1 keycard tucked
// in the warehouse, cross into the Laboratory, badge through the locked L1
// door with it, then time a laser's off-phase to slip into the west wing
// and grab the L2 keycard — zero alerts for the entire route.
//
// GUARD-FREE BY DESIGN for the Warehouse leg only: engine.createEngine's
// opts.guardConfigs only governs the zone the engine is CONSTRUCTED with —
// a later zone transition always repopulates guards from src/engine.js's own
// ZONE_GUARDS table for the TARGET zone (see its own contract), so there is
// no equivalent hook to silence lab-g1/lab-g2 once the scripted route
// crosses into the Laboratory. This scenario is about proving the NEW
// systems this cycle added (keycards/doors/lasers/pickups) cooperate
// end-to-end, not re-proving guard-evasion timing (already extensively
// covered elsewhere in this file) — so the Warehouse leg removes w1/w2 to
// keep the route's safety margin entirely about camera timing, while the
// Laboratory leg keeps its real lab-g1/lab-g2 guards and is still routed to
// avoid them (the whole route stays well clear of lab-g1's lobby loop and
// never enters the west wing, where lab-g2 patrols, until well after
// crossing — see the specific waypoints below).
scenarios.push({
  name: "lab run: grab L1 in warehouse, badge through, time the lasers",
  seed: 20260716024,
  run: function (G) {
    const warehouse = G.ZONES.warehouse;
    const engine = G.createEngine({ seed: this.seed, zoneData: warehouse, guardConfigs: [] });

    const ARRIVE = 0.5;
    const MAX_LEG_TICKS = Math.round(20 / DT);

    // Walks toward (tx,ty) until arrival OR the zone changes underneath us
    // (a scripted leg that happens to cross a resolvable exit trigger mid-
    // walk counts as "done" the instant the crossing happens, same
    // "stop dead on a zoneChange" steering convention as the "two-zone
    // infiltration" scenario above) — asserts INFILTRATION/zero-alert
    // throughout every tick.
    function walkLeg(tx, ty, opts, legLabel) {
      opts = opts || {};
      const stance = opts.stance || "stand";
      const run = opts.run !== false;
      const arrive = opts.arrive || ARRIVE;
      const zoneAtStart = engine.zone.id;
      for (let i = 0; i < MAX_LEG_TICKS; i++) {
        if (engine.zone.id !== zoneAtStart) return;
        const dx = tx - engine.player.x;
        const dy = ty - engine.player.y;
        const d = Math.hypot(dx, dy);
        if (d <= arrive) return;
        engine.tick({ moveX: d > 0 ? dx / d : 0, moveY: d > 0 ? dy / d : 0, run: run, stance: stance });
        if (engine.squad.phase !== "INFILTRATION") {
          throw new Error(
            legLabel + ": squad left INFILTRATION (phase=" + engine.squad.phase + ") at player (" +
              engine.player.x.toFixed(2) + "," + engine.player.y.toFixed(2) + ")"
          );
        }
      }
      throw new Error(legLabel + ": stalled short of (" + tx + "," + ty + "), at (" + engine.player.x.toFixed(2) + "," + engine.player.y.toFixed(2) + ")");
    }

    // ---- Warehouse: grab the L1 keycard (see src/world.js's pickup
    // placement comment — tucked in the far-west dark zone), routed via the
    // clear south corridor and the row1/row2 aisle's y:14-16 cross-gap (see
    // src/world.js's warehouse layout comments) to avoid both shelving AND
    // camera0's cone (see the design brief's own "genuine route past it"
    // note — hugging y~15.4 keeps 0.4m of physical clearance from the
    // row2 wall while a fast RUN dash through the gap band minimizes time
    // spent anywhere near camera0's reach; crouching everywhere else keeps
    // the profile discount up without costing meaningful time on this
    // guard-free leg). ----
    walkLeg(10, 15.4, { stance: "crouch" }, "warehouse: diagonal to the cross-aisle gap");
    walkLeg(2, 15.4, { stance: "stand", run: true }, "warehouse: fast cross-aisle dash");
    walkLeg(2, 8, { stance: "crouch" }, "warehouse: north up the far-west aisle");
    walkLeg(4, 7, { stance: "crouch" }, "warehouse: L1 keycard pickup");

    if (!engine.inventory.keycards.L1) {
      throw new Error("setup failed: expected the L1 keycard to be collected by now");
    }
    const pickupEvents = engine.events.filter((e) => e.type === "pickup" && e.item === "keycardL1");
    // events only reflect the MOST RECENT tick (see src/engine.js's own
    // events contract) — the pickup already happened by now, so this is
    // just confirming the inventory flip actually came from a real pickup
    // path existing at all (the assertion above is the load-bearing one).
    void pickupEvents;

    // ---- to the Warehouse's own north exit (already resolves into the
    // Laboratory this cycle — see src/world.js's zone comments) ----
    walkLeg(4, 2, { stance: "crouch" }, "warehouse: to the north band");
    walkLeg(20, 2, { stance: "crouch" }, "warehouse: north exit crossing");

    if (engine.zone.id !== "laboratory") {
      throw new Error("expected to have crossed into the laboratory, got zone " + engine.zone.id);
    }

    // ---- Laboratory: badge through the L1 door (already holding the key).
    // Camera0's cone covers almost the ENTIRE lobby approach along x:20
    // (see src/world.js's own camera comment) — its pan angle is a pure
    // function of the GLOBAL engine.time (see src/director.js's own
    // contract), not "time since entering this zone," so how long the
    // Warehouse leg above took determines exactly what phase of camera0's
    // 6s sweep we arrive in. Rather than depend on that incidental timing,
    // wait here (stationary, well outside the door, at the entrance) until
    // camera0's sweep has actually carried its pan angle OUTSIDE its own
    // fovDeg/2 (a real "blind" instant near the extremes of a sine sweep,
    // where the pan angle also DWELLS longest — the derivative is smallest
    // right at the peak), THEN dash the whole approach at a dead run. This
    // is the deterministic, seed-proof version of "time the crossing,"
    // the exact same principle the lasers below make explicit.
    const cam0 = G.ZONES.laboratory.cameras[0];
    let foundBlindWindow = false;
    const CAM_WAIT_TICKS = Math.round(cam0.sweepPeriodS / DT) + 10;
    for (let i = 0; i < CAM_WAIT_TICKS; i++) {
      const panAngle = engine.director.cameraStates()[0].panAngle;
      const offsetDeg = (Math.abs(panAngle - cam0.facing) * 180) / Math.PI;
      if (offsetDeg > cam0.fovDeg / 2 + 2) {
        foundBlindWindow = true;
        break;
      }
      engine.tick({ moveX: 0, moveY: 0 });
      if (engine.squad.phase !== "INFILTRATION") {
        throw new Error("laboratory: squad left INFILTRATION while waiting out camera0's sweep, phase=" + engine.squad.phase);
      }
    }
    if (!foundBlindWindow) {
      throw new Error("laboratory: camera0's sweep never carried it outside its own FOV within one period");
    }

    walkLeg(20, 17.6, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: approach the L1 door");
    const doorL1 = engine.snapshot().doors.find((d) => d.id === "doorL1");
    if (!doorL1 || !doorL1.open) {
      throw new Error("expected doorL1 to have auto-opened for the keyed player, got " + JSON.stringify(doorL1));
    }
    walkLeg(20, 12, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: through the L1 door");

    // ---- into the west wing, then TIME the laser: wait out its ACTIVE
    // phase before dashing across (see src/director.js's own laser
    // contract) ----
    walkLeg(10, 12, { stance: "crouch" }, "laboratory: into the west wing above the beam");

    const westLaser = G.ZONES.laboratory.lasers[0]; // west wing laser
    let waitedOff = false;
    const LASER_WAIT_TICKS = Math.round((westLaser.periodS + 1) / DT);
    for (let i = 0; i < LASER_WAIT_TICKS && !waitedOff; i++) {
      engine.tick({ moveX: 0, moveY: 0 });
      if (engine.squad.phase !== "INFILTRATION") {
        throw new Error("squad left INFILTRATION while waiting out the laser's duty cycle, phase=" + engine.squad.phase);
      }
      if (!engine.director.laserStates()[0].active) waitedOff = true;
    }
    if (!waitedOff) {
      throw new Error("expected the west laser to reach its OFF phase within " + (westLaser.periodS + 1) + "s of waiting");
    }

    walkLeg(10, 6, { stance: "stand", run: true, arrive: 0.5 }, "laboratory: dash across the beam to the L2 keycard");

    if (!engine.inventory.keycards.L2) {
      throw new Error("expected the L2 keycard to be collected by now");
    }
    if (engine.events.some((e) => e.type === "laserTripped")) {
      throw new Error("expected NO laserTripped event on the final dash (timed for the OFF phase)");
    }
    if (engine.squad.phase !== "INFILTRATION" || engine.squad.alertCount !== 0) {
      throw new Error(
        "expected zero alerts across the entire route, got phase=" + engine.squad.phase + " alertCount=" + engine.squad.alertCount
      );
    }
  },
});

// ---- Comms Tower playtest scenario (new — Comms Tower cycle) ---------------
// The longest scenario in the suite: a full-facility run, dock (west flank,
// same route as the "engine-driven infiltration" scenario above) -> warehouse
// (grab L1) -> laboratory (badge through L1, time the west laser to grab L2
// via the west wing, cross doorL2 into the east wing, grab the bonus chaff
// grenade and use it to blind every camera in the zone before timing the
// east laser to grab L3, badge back through doorL2, badge through doorL3)
// -> north corridor -> the Comms Tower's own south entrance -> the tower's
// south dark zone.
//
// REAL GUARDS/CAMERAS THE WHOLE WAY — unlike the "lab run" scenario above
// (which constructs its engine directly IN the Warehouse specifically so
// its own opts.guardConfigs: [] override applies there), this scenario
// starts at the Loading Dock, so every later zone transition repopulates
// guards from src/engine.js's own ZONE_GUARDS table for real (there is no
// hook to silence a zone's guards once a transition INTO it has already
// happened) — dock g1, warehouse w1/w2, laboratory lab-g1/lab-g2 are all
// live, and every camera/laser is live too. Three routing lessons this
// scenario's own development surfaced, each worth naming since they're easy
// to get wrong by eye:
//   1. Warehouse's own south exit trigger (back to loadingDock) sits at
//      x:18-22,y:26-29 — directly under the entrance from loadingDock
//      (x:18-22,y:25) — so the straight-line "duck south, then west" route
//      the far-west-aisle L1 grab wants MUST detour around x:18-22 before
//      dropping below y:26, or it walks straight back out to the Dock.
//   2. Warehouse's w2 patrols a rectangle (x:17-22,y:5-25) that overlaps the
//      entrance column entirely — the only genuinely guard-free stretch is
//      the far-west aisle (row1's shelving, x:8-9.5, physically blocks LOS
//      into it), so every leg between the entrance and that aisle has to
//      clear w2's rectangle's x-range BEFORE lingering, not cross it
//      diagonally.
//   3. A camera's SWEEP (sweepDeg) stacks with its own FOV (fovDeg) — the
//      cone's reach at a given range is NOT bounded by facing +/- fovDeg/2,
//      it swings out to facing +/- (sweepDeg/2 + fovDeg/2) as the sweep
//      carries it — so "stay outside the camera's static facing cone" is
//      not a real safety guarantee the way it is for a laser's fixed line.
//      The Laboratory's east wing camera (cameras[2]) watches the L3
//      keycard at exactly its own facing height, where no such geometric
//      dodge exists at all — the reliable answer is the tool actually built
//      for this: grab the bonus chaff pickup and throw it, which disables
//      EVERY camera in the zone for CHAFF_S (15s), turning the rest of the
//      east wing into a pure laser-timing problem, same technique as the
//      west wing.
scenarios.push({
  name: "tower approach: full-facility run dock->tower unseen",
  seed: 20260716031,
  run: function (G) {
    const dock = G.ZONES.loadingDock;
    const lab = G.ZONES.laboratory;
    const engine = G.createEngine({ seed: this.seed, zoneData: dock });

    const MAX_LEG_TICKS = Math.round(30 / DT);

    // Real zoneChange events land here as they actually fire (see walkLeg
    // below) -- the final assertion at the end of this scenario checks THIS
    // array, not a hardcoded guess, so it only passes if every crossing
    // really happened via engine.js's own ZONE TRANSITIONS step.
    const zoneChanges = [];

    // Same "stop dead on a zoneChange" steering convention as the lab run
    // scenario above.
    function walkLeg(tx, ty, opts, legLabel) {
      opts = opts || {};
      const stance = opts.stance || "stand";
      const run = opts.run !== false;
      const arrive = opts.arrive || 0.5;
      const zoneAtStart = engine.zone.id;
      for (let i = 0; i < MAX_LEG_TICKS; i++) {
        if (engine.zone.id !== zoneAtStart) return;
        const dx = tx - engine.player.x;
        const dy = ty - engine.player.y;
        const d = Math.hypot(dx, dy);
        if (d <= arrive) return;
        engine.tick({ moveX: d > 0 ? dx / d : 0, moveY: d > 0 ? dy / d : 0, run: run, stance: stance });
        engine.events.forEach((e) => {
          if (e.type === "zoneChange") zoneChanges.push(e.to);
        });
        if (engine.squad.phase !== "INFILTRATION") {
          throw new Error(
            legLabel + ": squad left INFILTRATION (phase=" + engine.squad.phase + ") at player (" +
              engine.player.x.toFixed(2) + "," + engine.player.y.toFixed(2) + ")"
          );
        }
      }
      throw new Error(legLabel + ": stalled short of (" + tx + "," + ty + "), at (" + engine.player.x.toFixed(2) + "," + engine.player.y.toFixed(2) + ")");
    }

    // Stands still for up to maxTicks waiting for `check()` to return true;
    // throws (with legLabel) if it never does. Asserts INFILTRATION every
    // tick, same discipline as walkLeg.
    function waitUntil(check, maxTicks, legLabel) {
      for (let i = 0; i < maxTicks; i++) {
        if (check()) return;
        engine.tick({ moveX: 0, moveY: 0 });
        if (engine.squad.phase !== "INFILTRATION") {
          throw new Error(legLabel + ": squad left INFILTRATION while waiting, phase=" + engine.squad.phase);
        }
      }
      throw new Error(legLabel + ": condition never became true within " + maxTicks + " ticks");
    }

    function guardById(id) {
      return engine.guards.find((g) => g.id === id);
    }

    function outsideCameraFov(camIndex) {
      const cam = lab.cameras[camIndex];
      const panAngle = engine.director.cameraStates()[camIndex].panAngle;
      const offsetDeg = (Math.abs(panAngle - cam.facing) * 180) / Math.PI;
      return offsetDeg > cam.fovDeg / 2 + 2;
    }

    // ---- Loading Dock: west flank to the north exit (same route as the
    // "engine-driven infiltration" scenario above) ----
    walkLeg(3, 27, { stance: "stand" }, "dock: west along the open south corridor");
    walkLeg(3, 9, { stance: "crouch" }, "dock: north through the west-flank dark zone");
    walkLeg(3, 2, { stance: "crouch" }, "dock: NW corner, still sneaking near the guard hut");
    walkLeg(dock.exit.x + dock.exit.w / 2, dock.exit.y + dock.exit.h / 2, { stance: "stand" }, "dock: dash for the exit gap");
    if (engine.zone.id !== "warehouse") {
      throw new Error("expected to have crossed into the warehouse, got zone " + engine.zone.id);
    }

    // ---- Warehouse: grab the L1 keycard, routed around w2's rectangle and
    // clear of the south exit trigger back to the Dock (see lessons #1/#2
    // in this scenario's own header comment) ----
    walkLeg(16.5, 24, { stance: "crouch" }, "warehouse: diagonal off the entrance column, north of the south exit trigger");
    walkLeg(16.5, 27.5, { stance: "crouch" }, "warehouse: drop into the south corridor, west of the exit trigger");
    walkLeg(2, 27.5, { stance: "crouch" }, "warehouse: west along the south corridor, south of every shelving row");
    walkLeg(2, 8, { stance: "crouch" }, "warehouse: north up the far-west aisle");
    walkLeg(4, 7, { stance: "crouch", arrive: 0.3 }, "warehouse: L1 keycard pickup");
    if (!engine.inventory.keycards.L1) {
      throw new Error("setup failed: expected the L1 keycard to be collected by now");
    }

    // ---- to the Warehouse's own north exit, into the Laboratory ----
    walkLeg(4, 2, { stance: "crouch" }, "warehouse: to the north band");
    walkLeg(20, 2, { stance: "crouch" }, "warehouse: north exit crossing");
    if (engine.zone.id !== "laboratory") {
      throw new Error("expected to have crossed into the laboratory, got zone " + engine.zone.id);
    }

    // ---- Laboratory, lobby: time camera0's blind window, badge doorL1 ----
    waitUntil(() => outsideCameraFov(0), Math.round(lab.cameras[0].sweepPeriodS / DT) + 10, "laboratory: waiting out camera0's sweep");
    walkLeg(20, 17.6, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: approach the L1 door");
    const doorL1 = engine.snapshot().doors.find((d) => d.id === "doorL1");
    if (!doorL1 || !doorL1.open) {
      throw new Error("expected doorL1 to have auto-opened for the keyed player, got " + JSON.stringify(doorL1));
    }
    walkLeg(20, 12, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: through the L1 door");

    // ---- west wing: time the west laser to grab L2 first (lab-g2's own
    // rectangle, x:3-17,y:5-15, is not yet a concern for this short
    // above-the-beam dash — verified clear at this scenario's fixed seed) ----
    const westLaser = lab.lasers[0];
    walkLeg(10, 12, { stance: "crouch" }, "laboratory: into the west wing above the beam");
    waitUntil(() => !engine.director.laserStates()[0].active, Math.round((westLaser.periodS + 1) / DT), "laboratory: waiting out the west laser's duty cycle");
    walkLeg(10, 6, { stance: "stand", arrive: 0.5 }, "laboratory: dash across the beam to the L2 keycard");
    if (!engine.inventory.keycards.L2) {
      throw new Error("expected the L2 keycard to be collected by now");
    }

    // ---- wait for lab-g2 to be clear of the return path (its rectangle,
    // x:3-17,y:5-15, covers this whole stretch regardless of y — see lesson
    // #2), THEN time the west laser again for the crossing back south, then
    // east to doorL2 staying south of the beam so camera1's own sweep (see
    // lesson #3) never comes into play for this leg at all ----
    waitUntil(() => guardById("lab-g2").x < 7, Math.round(60 / DT), "laboratory: waiting for lab-g2 clear of the west wing return path");
    waitUntil(() => !engine.director.laserStates()[0].active, Math.round((westLaser.periodS + 1) / DT), "laboratory: waiting out the west laser's duty cycle (return)");
    walkLeg(10, 12, { stance: "stand", run: true, arrive: 0.5 }, "laboratory: back south across the beam");
    walkLeg(17.5, 12, { stance: "stand", run: true }, "laboratory: east toward doorL2, south of camera1's reach");
    walkLeg(23, 11, { stance: "stand", run: true }, "laboratory: approach doorL2");
    walkLeg(30, 12, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: through doorL2 into the east wing, south of the beam");
    const doorL2 = engine.snapshot().doors.find((d) => d.id === "doorL2");
    if (!doorL2 || !doorL2.open) {
      throw new Error("expected doorL2 to have auto-opened for the keyed player, got " + JSON.stringify(doorL2));
    }

    // ---- east wing: grab the bonus chaff, throw it to blind camera2 (see
    // lesson #3), then it's a pure laser-timing problem to reach L3 ----
    walkLeg(30, 14, { stance: "crouch" }, "laboratory: chaff pickup");
    engine.tick({ moveX: 0, moveY: 0, chaff: true });
    engine.events.forEach((e) => {
      if (e.type === "zoneChange") zoneChanges.push(e.to);
    });
    if (!(engine.chaffUntil > engine.time)) {
      throw new Error("setup failed: expected chaff to have armed");
    }
    if (engine.squad.phase !== "INFILTRATION") {
      throw new Error("laboratory: squad left INFILTRATION off the chaff pop's own noise, phase=" + engine.squad.phase);
    }
    const eastLaser = lab.lasers[1];
    walkLeg(30, 11, { stance: "crouch" }, "laboratory: back toward the beam, chaff still live");
    waitUntil(() => !engine.director.laserStates()[1].active, Math.round((eastLaser.periodS + 1) / DT), "laboratory: waiting out the east laser's duty cycle (chaffed)");
    walkLeg(34, 6, { stance: "stand", run: true, arrive: 0.5 }, "laboratory: dash across the beam to the L3 keycard");
    if (!engine.inventory.keycards.L3) {
      throw new Error("expected the L3 keycard to be collected by now");
    }

    // ---- back through doorL2, west to doorL3, into the north corridor and
    // the Comms Tower. Stage close to the beam first, THEN wait for the
    // laser's OFF phase, for a short final crossing rather than a long
    // one — a long approach gives the duty cycle time to flip back before
    // arrival, same lesson the outbound crossings above already apply. ----
    walkLeg(32, 9.3, { stance: "crouch" }, "laboratory: stage just north of the beam for the return crossing");
    waitUntil(() => !engine.director.laserStates()[1].active, Math.round((eastLaser.periodS + 1) / DT), "laboratory: waiting out the east laser's duty cycle (return, staged)");
    walkLeg(30, 11, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: back across the beam toward doorL2");
    walkLeg(23, 11, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: recross doorL2 westbound");
    walkLeg(20, 4, { stance: "crouch" }, "laboratory: approach doorL3");
    const doorL3 = engine.snapshot().doors.find((d) => d.id === "doorL3");
    if (!doorL3 || !doorL3.open) {
      throw new Error("expected doorL3 to have auto-opened for the keyed player, got " + JSON.stringify(doorL3));
    }
    walkLeg(20, 1.5, { stance: "crouch", arrive: 0.3 }, "laboratory: through doorL3 into the north corridor, to the tower entrance");

    // ---- END OF ROUTE: the Comms Tower's own south entrance ----
    if (engine.zone.id !== "commsTower") {
      throw new Error("expected to have crossed into the commsTower, got zone " + engine.zone.id);
    }
    const tower = G.ZONES.commsTower;
    const southShadow = tower.darkZones.find((dz) => dz.x <= 20 && 20 <= dz.x + dz.w && dz.y <= 26 && 26 <= dz.y + dz.h);
    if (!southShadow) {
      throw new Error("expected the tower's south entrance to land inside a dark zone");
    }
    if (Math.abs(engine.player.x - tower.entrances.fromLaboratory.x) > 1e-6 || Math.abs(engine.player.y - tower.entrances.fromLaboratory.y) > 1e-6) {
      throw new Error("expected the player at commsTower.entrances.fromLaboratory, got " + JSON.stringify({ x: engine.player.x, y: engine.player.y }));
    }

    // zoneChanges was appended to LIVE by walkLeg every time a real
    // zoneChange event actually fired (see its own declaration above) — this
    // is the real chain, not a guess.
    const expectedChain = ["warehouse", "laboratory", "commsTower"].join(",");
    if (zoneChanges.join(",") !== expectedChain) {
      throw new Error("expected the zoneChange chain [warehouse, laboratory, commsTower], got [" + zoneChanges.join(", ") + "]");
    }

    if (engine.squad.phase !== "INFILTRATION" || engine.squad.alertCount !== 0) {
      throw new Error(
        "expected zero alerts across the entire route, got phase=" + engine.squad.phase + " alertCount=" + engine.squad.alertCount
      );
    }
    if (engine.player.hp !== 1) {
      throw new Error("expected the player to still be at full hp, got " + engine.player.hp);
    }
    if (!engine.player.alive) {
      throw new Error("expected the player to still be alive");
    }
  },
});

// ---- save/restore playtest scenario ----------------------------------------
// "Save-scumming" (saving mid-infiltration, reloading, continuing) is a core
// stealth-game player behavior — this scenario proves it works at REAL
// playtest scale (60s+ of game time, a live zone, real guards), reusing the
// same shape as tests/saveState.test.js's REPLAY GATE (calm) test: tick a
// while, save, tick the SAME scripted input on both a continuing engine and a
// freshly restored one, and demand byte-identical final snapshots. If any
// module's getState()/setState() ever misses a closure var, this is one of
// the two places (alongside the test.js REPLAY GATE tests) that would catch
// the drift.
scenarios.push({
  name: "save-scumming works: mid-infiltration save/restore replays identically",
  seed: 20260716777,
  run: function (G) {
    const saveState = G.createSaveState();

    // Deterministic scripted input, a pure function of the GLOBAL tick index
    // (not "ticks since save") so continuing on either branch — the original
    // engine straight through, or a restored one starting mid-sequence — sees
    // the exact same input at the exact same tick.
    function scriptedInput(tick) {
      return {
        moveX: Math.sin(tick * 0.031),
        moveY: Math.cos(tick * 0.047),
        run: tick % 9 === 0,
        stance: tick % 240 < 80 ? "crouch" : tick % 240 < 160 ? "crawl" : "stand",
        knock: tick % 113 === 0,
        cqc: tick % 151 === 0,
      };
    }

    const engineA = G.createEngine({ seed: this.seed });

    const SAVE_AT_TICK = 1800; // 30s in
    const TOTAL_TICKS = 3600; // 60s total, per the design brief's "60s+"

    for (let tick = 0; tick < SAVE_AT_TICK; tick++) {
      engineA.tick(scriptedInput(tick));
    }

    // Round-trip through JSON, same as a real F5 save into localStorage (see
    // src/boot.js) — proves the captured object is plain-data safe, not just
    // that the live JS objects happen to compare equal.
    const save = JSON.parse(JSON.stringify(saveState.capture(engineA)));

    for (let tick = SAVE_AT_TICK; tick < TOTAL_TICKS; tick++) {
      engineA.tick(scriptedInput(tick));
    }

    const engineB = saveState.restore(save);
    for (let tick = SAVE_AT_TICK; tick < TOTAL_TICKS; tick++) {
      engineB.tick(scriptedInput(tick));
    }

    const snapA = JSON.stringify(engineA.snapshot());
    const snapB = JSON.stringify(engineB.snapshot());
    if (snapA !== snapB) {
      throw new Error(
        "save-scumming replay diverged at tick " + TOTAL_TICKS + ":\nA=" + snapA + "\nB=" + snapB
      );
    }
    if (engineA.tickCount !== TOTAL_TICKS) {
      throw new Error("expected engineA.tickCount " + TOTAL_TICKS + ", got " + engineA.tickCount);
    }
  },
});

// ---- THE CAPSTONE: full-facility ghost run, extract, rank BIG BOSS --------
// The final bootstrap feature's own playtest bot proof: reuses the "tower
// approach" scenario's exact dock->warehouse->laboratory->commsTower route
// (same seed, same waypoints -- verified byte-for-byte reproducible, since
// the engine is a pure deterministic function of seed + scripted input) and
// EXTENDS it across the Comms Tower's own 4-guard gauntlet (tower-g1/g2/g3/g4,
// 2 cameras, 1 laser -- see src/world.js's commsTower zone data and its own
// PATROL INTERLOCK comment) to the extraction trigger, asserting a genuine
// missionComplete with rank BIG BOSS and zero alerts across the ENTIRE
// mission, both zones' worth of route included.
//
// TOWER ROUTE (iterated against this exact seed until it passed -- see
// src/world.js's own commsTower comments for the zone layout this reasons
// about): the entrance (tower.entrances.fromLaboratory, (20,26)) sits in the
// south dark zone, but a straight walk west along y=26 wedges the player into
// the south-approach sandbag flank at x:15-17 -- dip to y=27.3 (south of the
// sandbags entirely) before heading west. From there, cut north into the WEST
// dark zone (x:2-6,y:16-22, and the ration pickup at (4,20)) rather than
// hugging the open x~9 corridor a straight line would take: that corridor sits
// outside any dark zone and is exactly equidistant from tower-g4's own west-
// yard patrol edges, giving zero shielding, whereas the actual dark zone
// (DARKNESS_MULT 0.5) plus a crawl profile keeps the detection meter from ever
// reaching SUSPICIOUS_AT during the unavoidable exposed stretch north of it.
// THE LASER DODGE: rather than time the north laser's duty cycle at all (it
// only spans x:13-27,y:5 -- see world.js's commsTower.lasers), this route
// simply crosses y:5 to the WEST of it (around x:10), where no beam exists,
// then cuts east into the north dark zone (x:14-26,y:2-5, "right at the
// helipad threshold" per world.js's own comment) for the final approach --
// avoiding the laser-timing problem entirely rather than solving it. This
// also stays well WEST of cam0's own boresight (x=20) for as much of the
// crossing as possible, since a wide-sweep camera's FOV cone is narrowest
// exactly on-axis and widest at the edges of its sweep -- see this
// scenario's own walkLeg comments below for exactly where.
scenarios.push({
  name: "BIG BOSS run: full facility ghost, extract, rank BIG BOSS",
  seed: 20260716031, // SAME seed as "tower approach" above -- this scenario extends that exact proven route rather than re-deriving it.
  run: function (G) {
    const dock = G.ZONES.loadingDock;
    const lab = G.ZONES.laboratory;
    const engine = G.createEngine({ seed: this.seed, zoneData: dock });

    const MAX_LEG_TICKS = Math.round(30 / DT);
    const zoneChanges = [];

    // Same "stop dead on a zoneChange" convention as the "tower approach"
    // scenario's own walkLeg -- PLUS a new "stop dead on missionComplete"
    // check, since extraction is a TERMINAL (see src/engine.js's own MISSION
    // STATS / EXTRACTION / RANK contract), not a zone switch: a frozen
    // engine's tick() is a no-op forever after (same FROZEN ENGINE contract
    // as gameOver), so blindly continuing to seek toward a target the player
    // already reached would spin every remaining leg's own tick budget for
    // nothing.
    function walkLeg(tx, ty, opts, legLabel) {
      opts = opts || {};
      const stance = opts.stance || "stand";
      const run = opts.run !== false;
      const arrive = opts.arrive || 0.5;
      const zoneAtStart = engine.zone.id;
      for (let i = 0; i < MAX_LEG_TICKS; i++) {
        if (engine.zone.id !== zoneAtStart) return;
        if (engine.missionComplete) return;
        const dx = tx - engine.player.x;
        const dy = ty - engine.player.y;
        const d = Math.hypot(dx, dy);
        if (d <= arrive) return;
        engine.tick({ moveX: d > 0 ? dx / d : 0, moveY: d > 0 ? dy / d : 0, run: run, stance: stance });
        engine.events.forEach((e) => {
          if (e.type === "zoneChange") zoneChanges.push(e.to);
        });
        if (engine.missionComplete) return;
        if (engine.squad.phase !== "INFILTRATION") {
          throw new Error(
            legLabel + ": squad left INFILTRATION (phase=" + engine.squad.phase + ") at player (" +
              engine.player.x.toFixed(2) + "," + engine.player.y.toFixed(2) + ")"
          );
        }
      }
      throw new Error(legLabel + ": stalled short of (" + tx + "," + ty + "), at (" + engine.player.x.toFixed(2) + "," + engine.player.y.toFixed(2) + ")");
    }

    function waitUntil(check, maxTicks, legLabel) {
      for (let i = 0; i < maxTicks; i++) {
        if (check()) return;
        engine.tick({ moveX: 0, moveY: 0 });
        if (engine.squad.phase !== "INFILTRATION") {
          throw new Error(legLabel + ": squad left INFILTRATION while waiting, phase=" + engine.squad.phase);
        }
      }
      throw new Error(legLabel + ": condition never became true within " + maxTicks + " ticks");
    }

    function guardById(id) {
      return engine.guards.find((g) => g.id === id);
    }

    function outsideCameraFov(camIndex) {
      const cam = lab.cameras[camIndex];
      const panAngle = engine.director.cameraStates()[camIndex].panAngle;
      const offsetDeg = (Math.abs(panAngle - cam.facing) * 180) / Math.PI;
      return offsetDeg > cam.fovDeg / 2 + 2;
    }

    // ---- Loading Dock -> Warehouse -> Laboratory -> Comms Tower entrance:
    // IDENTICAL route to the "tower approach" scenario above (same seed, same
    // waypoints/timing) -- see that scenario's own comments for the
    // lessons/reasoning behind each leg; not re-explained here.
    walkLeg(3, 27, { stance: "stand" }, "dock: west along the open south corridor");
    walkLeg(3, 9, { stance: "crouch" }, "dock: north through the west-flank dark zone");
    walkLeg(3, 2, { stance: "crouch" }, "dock: NW corner, still sneaking near the guard hut");
    walkLeg(dock.exit.x + dock.exit.w / 2, dock.exit.y + dock.exit.h / 2, { stance: "stand" }, "dock: dash for the exit gap");
    if (engine.zone.id !== "warehouse") {
      throw new Error("expected to have crossed into the warehouse, got zone " + engine.zone.id);
    }

    walkLeg(16.5, 24, { stance: "crouch" }, "warehouse: diagonal off the entrance column");
    walkLeg(16.5, 27.5, { stance: "crouch" }, "warehouse: drop into the south corridor");
    walkLeg(2, 27.5, { stance: "crouch" }, "warehouse: west along the south corridor");
    walkLeg(2, 8, { stance: "crouch" }, "warehouse: north up the far-west aisle");
    walkLeg(4, 7, { stance: "crouch", arrive: 0.3 }, "warehouse: L1 keycard pickup");
    if (!engine.inventory.keycards.L1) {
      throw new Error("setup failed: expected the L1 keycard to be collected by now");
    }

    walkLeg(4, 2, { stance: "crouch" }, "warehouse: to the north band");
    walkLeg(20, 2, { stance: "crouch" }, "warehouse: north exit crossing");
    if (engine.zone.id !== "laboratory") {
      throw new Error("expected to have crossed into the laboratory, got zone " + engine.zone.id);
    }

    waitUntil(() => outsideCameraFov(0), Math.round(lab.cameras[0].sweepPeriodS / DT) + 10, "laboratory: waiting out camera0's sweep");
    walkLeg(20, 17.6, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: approach the L1 door");
    walkLeg(20, 12, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: through the L1 door");

    const westLaser = lab.lasers[0];
    walkLeg(10, 12, { stance: "crouch" }, "laboratory: into the west wing above the beam");
    waitUntil(() => !engine.director.laserStates()[0].active, Math.round((westLaser.periodS + 1) / DT), "laboratory: waiting out the west laser's duty cycle");
    walkLeg(10, 6, { stance: "stand", arrive: 0.5 }, "laboratory: dash across the beam to the L2 keycard");
    if (!engine.inventory.keycards.L2) {
      throw new Error("expected the L2 keycard to be collected by now");
    }

    waitUntil(() => guardById("lab-g2").x < 7, Math.round(60 / DT), "laboratory: waiting for lab-g2 clear of the west wing return path");
    waitUntil(() => !engine.director.laserStates()[0].active, Math.round((westLaser.periodS + 1) / DT), "laboratory: waiting out the west laser's duty cycle (return)");
    walkLeg(10, 12, { stance: "stand", run: true, arrive: 0.5 }, "laboratory: back south across the beam");
    walkLeg(17.5, 12, { stance: "stand", run: true }, "laboratory: east toward doorL2, south of camera1's reach");
    walkLeg(23, 11, { stance: "stand", run: true }, "laboratory: approach doorL2");
    walkLeg(30, 12, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: through doorL2 into the east wing, south of the beam");

    walkLeg(30, 14, { stance: "crouch" }, "laboratory: chaff pickup");
    engine.tick({ moveX: 0, moveY: 0, chaff: true });
    engine.events.forEach((e) => {
      if (e.type === "zoneChange") zoneChanges.push(e.to);
    });
    if (!(engine.chaffUntil > engine.time)) {
      throw new Error("setup failed: expected chaff to have armed");
    }

    const eastLaser = lab.lasers[1];
    walkLeg(30, 11, { stance: "crouch" }, "laboratory: back toward the beam, chaff still live");
    waitUntil(() => !engine.director.laserStates()[1].active, Math.round((eastLaser.periodS + 1) / DT), "laboratory: waiting out the east laser's duty cycle (chaffed)");
    walkLeg(34, 6, { stance: "stand", run: true, arrive: 0.5 }, "laboratory: dash across the beam to the L3 keycard");
    if (!engine.inventory.keycards.L3) {
      throw new Error("expected the L3 keycard to be collected by now");
    }

    walkLeg(32, 9.3, { stance: "crouch" }, "laboratory: stage just north of the beam for the return crossing");
    waitUntil(() => !engine.director.laserStates()[1].active, Math.round((eastLaser.periodS + 1) / DT), "laboratory: waiting out the east laser's duty cycle (return, staged)");
    walkLeg(30, 11, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: back across the beam toward doorL2");
    walkLeg(23, 11, { stance: "stand", run: true, arrive: 0.3 }, "laboratory: recross doorL2 westbound");
    walkLeg(20, 4, { stance: "crouch" }, "laboratory: approach doorL3");
    walkLeg(20, 1.5, { stance: "crouch", arrive: 0.3 }, "laboratory: through doorL3 into the north corridor, to the tower entrance");

    if (engine.zone.id !== "commsTower") {
      throw new Error("expected to have crossed into the commsTower, got zone " + engine.zone.id);
    }
    const tower = G.ZONES.commsTower;

    // ---- NEW: the Comms Tower's own 4-guard gauntlet, to the extraction
    // trigger (see this scenario's own header comment for the reasoning) ----
    walkLeg(20, 27.3, { stance: "crouch" }, "tower: dip south of the entrance-corridor sandbags before heading west");
    walkLeg(9, 27.3, { stance: "crouch", run: true }, "tower: west past the sandbags, clear of the core-ring guard's own reach");
    walkLeg(4, 20, { stance: "crouch" }, "tower: into the west dark zone (bonus ration pickup at (4,20))");
    walkLeg(4, 16.5, { stance: "crouch" }, "tower: north within the west dark zone, staying shielded from tower-g4's patrol line as long as possible");
    walkLeg(5, 7, { stance: "crawl" }, "tower: north up the exposed corridor above the dark zone (crawl -- no shielding here, minimize the profile instead)");
    walkLeg(10, 4, { stance: "crawl" }, "tower: cross y=5 WEST of the laser's own span (x:13-27) -- no beam to time at all out here");
    walkLeg(16, 3, { stance: "crouch", run: true }, "tower: east into the north dark zone, off cam0's own boresight (x=20) for most of this leg");
    const northExit = tower.exits[0];
    if (northExit.to !== "extraction") {
      throw new Error("setup failed: expected commsTower.exits[0] to be the extraction terminal");
    }
    walkLeg(northExit.x + northExit.w / 2, northExit.y + northExit.h / 2, { stance: "crouch" }, "tower: final approach to the extraction trigger");

    // zoneChanges was appended to LIVE by walkLeg every time a real
    // zoneChange event actually fired -- the extraction terminal deliberately
    // does NOT add a 4th entry here (see src/engine.js's own EXTRACTION note:
    // "extraction" resolves as a missionComplete, never a zone switch).
    const expectedChain = ["warehouse", "laboratory", "commsTower"].join(",");
    if (zoneChanges.join(",") !== expectedChain) {
      throw new Error("expected the zoneChange chain [warehouse, laboratory, commsTower], got [" + zoneChanges.join(", ") + "]");
    }

    if (!engine.missionComplete) {
      throw new Error("expected engine.missionComplete true after reaching the extraction trigger");
    }
    if (engine.zone.id !== "commsTower") {
      throw new Error("expected engine.zone to still read commsTower (extraction is a terminal, not a zone switch), got " + engine.zone.id);
    }
    if (engine.stats.alertsTotal !== 0) {
      throw new Error("expected zero alerts across the ENTIRE mission, got alertsTotal=" + engine.stats.alertsTotal);
    }
    if (engine.stats.kills !== 0) {
      throw new Error("expected zero kills, got " + engine.stats.kills);
    }
    const rank = G.computeRank(engine.stats);
    if (rank !== "BIG BOSS") {
      throw new Error("expected rank BIG BOSS, got " + rank + " (stats=" + JSON.stringify(engine.stats) + ")");
    }

    const completeEvents = engine.events.filter((e) => e.type === "missionComplete");
    if (completeEvents.length !== 1) {
      throw new Error("expected exactly one missionComplete event on the completing tick, got " + completeEvents.length);
    }
    if (completeEvents[0].rank !== "BIG BOSS") {
      throw new Error("expected the missionComplete event's own rank to be BIG BOSS, got " + completeEvents[0].rank);
    }
  },
});

// ---- ESCALATION playtest scenarios (cycle: ALERT reinforcements + radio
// check-ins) --------------------------------------------------------------
// "The clock is ticking": leaving a tranq'd body out in the open is a timed
// countdown, not a free pass -- within the missing guard's own 40s radio
// check-in, a buddy gets dispatched to its CURRENT position (see
// src/director.js's own ESCALATION contract) and, finding it lying in plain
// sight, raises the alarm exactly like stumbling on it during an ordinary
// patrol would. The contrast scenario below re-runs the identical seed with
// one difference -- the body stuffed in a locker first -- and the same
// dispatch still happens (check-ins don't care about .hidden, only
// .state === SLEEPING) but never escalates to an alert, matching the
// HIDDEN-BODY EXEMPTION documented in src/guardAI.js.
//
// Both scenarios use CUSTOM guard positions rather than the Warehouse's
// canonical w1 (outer perimeter)/w2 (center-aisle) pair: those two are
// deliberately separated by the row-1/row-2/row-3 shelving (see
// src/world.js's own warehouse wall layout and the "clean up after
// yourself" scenario's own note above) so that a body dropped in the
// center aisle is naturally out of the perimeter guard's own patrol sight --
// exactly the kind of level geometry a real dispatched searcher's simple
// direct-line travel (guardAI.js has no real pathfinding) can get
// permanently wedged against. Both guards here sit on the open north
// perimeter strip (y:0-4, clear of every shelving row, which all start at
// y:4 -- see the warehouse wall list) so the buddy's investigate walk is a
// straight, unobstructed line the whole way, the same way any zone's own
// authored guardDoor reinforcement loop is verified open before use.
scenarios.push({
  name: "the clock is ticking: tranq without cleanup gets found",
  seed: 20260716040,
  run: function (G) {
    const warehouse = G.ZONES.warehouse;
    const engine = G.createEngine({
      seed: this.seed,
      zoneData: warehouse,
      guardConfigs: [
        { id: "w1", spawn: { x: 10, y: 2 }, waypoints: [{ x: 10, y: 2 }] },
        { id: "w2", spawn: { x: 25, y: 2 }, waypoints: [{ x: 25, y: 2 }] },
      ],
    });
    const w1 = engine.guards[0];
    const w2 = engine.guards[1];

    // ---- Dart w2 clean, in the open -------------------------------------
    // Same "teleport 3m ahead of facing, then face back" technique as the
    // "clean up after yourself" scenario, reused verbatim.
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

    // ---- Retreat to a far, dark corner and just... wait ------------------
    // No cleanup at all -- the body stays exactly where it fell. The
    // player parks in the Warehouse's own SE dark zone (x:31-37, y:20-26),
    // far from both guards, and never moves again: this scenario isolates
    // whether the ENVIRONMENT alone (a sleeping body nobody dragged away)
    // is enough to eventually raise the alarm with no further player input.
    engine.player.x = 34;
    engine.player.y = 23;

    let sawMissedCheckIn = false;
    let sawInvestigate = false;
    let alertAt = null;
    let sawEvasion = false;
    let sawCaution = false;
    let sawInfiltrationAgain = false;

    const WINDOW_S = 150; // 40s worst-case check-in wait + travel/search + EVASION_S(30) + CAUTION_S(45) + buffer
    for (let t = 0; t < Math.round(WINDOW_S / DT); t++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch" });
      engine.player.x = 34;
      engine.player.y = 23;

      for (const ev of engine.events) {
        if (ev.type === "missedCheckIn" && ev.guardId === "w2") sawMissedCheckIn = true;
        if (ev.type === "alert" && alertAt === null) alertAt = engine.time;
      }
      if (w1.state === "INVESTIGATE") sawInvestigate = true;
      if (engine.squad.phase === "EVASION") sawEvasion = true;
      if (engine.squad.phase === "CAUTION") sawCaution = true;
      if (sawCaution && engine.squad.phase === "INFILTRATION") sawInfiltrationAgain = true;

      if (!engine.player.alive) {
        throw new Error("player died at t=" + engine.time.toFixed(2) + " despite being parked far from both guards the whole run");
      }
    }

    if (!sawMissedCheckIn) {
      throw new Error("expected a missedCheckIn event for w2 within " + WINDOW_S + "s of falling asleep in the open");
    }
    if (!sawInvestigate) {
      throw new Error("expected w1 to be dispatched into INVESTIGATE toward w2's body");
    }
    if (alertAt === null) {
      throw new Error("expected w1 to eventually find w2's body (lying in the open) and raise an alert");
    }
    if (!sawEvasion || !sawCaution || !sawInfiltrationAgain) {
      throw new Error(
        "expected the full ladder ALERT -> EVASION -> CAUTION -> INFILTRATION to play out after the body was found, got " +
          JSON.stringify({ sawEvasion, sawCaution, sawInfiltrationAgain })
      );
    }
    if (engine.squad.phase !== "INFILTRATION") {
      throw new Error("expected the squad to have decayed all the way back to INFILTRATION by the end of the window, got " + engine.squad.phase);
    }
    if (!engine.player.alive) {
      throw new Error("expected the player to survive the whole encounter parked in the dark corner");
    }
  },
});

// Contrast, same seed: the ONE difference is stuffing w2's body into a
// locker before anything else happens -- the check-in dispatch still fires
// (check-ins ignore .hidden entirely, only .state matters -- see
// src/director.js's own ESCALATION contract), w1 still gets sent to
// investigate, but the HIDDEN-BODY EXEMPTION (src/guardAI.js) means it can
// never actually spot the body, so no alert ever fires across the same
// window.
scenarios.push({
  name: "the clock is ticking, contrasted: same seed, body stuffed in a locker never gets found",
  seed: 20260716040,
  run: function (G) {
    const warehouse = G.ZONES.warehouse;
    const locker = warehouse.lockers[0]; // {x:2,y:6,facing:0} -- clear open-floor approach from (10,2)
    const engine = G.createEngine({
      seed: this.seed,
      zoneData: warehouse,
      guardConfigs: [
        { id: "w1", spawn: { x: 10, y: 2 }, waypoints: [{ x: 10, y: 2 }] },
        { id: "w2", spawn: { x: 25, y: 2 }, waypoints: [{ x: 25, y: 2 }] },
      ],
    });
    const w1 = engine.guards[0];
    const w2 = engine.guards[1];

    const ahead = 3;
    engine.player.x = w2.x + Math.cos(w2.facing) * ahead;
    engine.player.y = w2.y + Math.sin(w2.facing) * ahead;
    engine.player.facing = w2.facing + Math.PI;

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", fire: true });
    const tranqEvents = engine.events.filter((e) => e.type === "tranqFired");
    if (tranqEvents.length !== 1 || !tranqEvents[0].hit || !tranqEvents[0].headshot || tranqEvents[0].guardId !== "w2") {
      throw new Error("setup failed: expected a clean unaware headshot on w2, got " + JSON.stringify(tranqEvents));
    }

    // Straight to the locker (guard.stuffInLocker is guardAI.js's own public
    // API -- the real drag-then-stuff player verb sequence is already
    // covered end to end by "clean up after yourself" above; this scenario
    // is isolating the escalation/check-in contrast, not re-proving drag).
    w2.stuffInLocker(locker);
    if (!w2.hidden || w2.x !== locker.x || w2.y !== locker.y) {
      throw new Error("setup failed: expected w2 hidden at the locker (" + locker.x + "," + locker.y + "), got hidden=" + w2.hidden);
    }

    engine.player.x = 34;
    engine.player.y = 23;

    let sawMissedCheckIn = false;
    let sawInvestigate = false;
    let sawAlert = false;
    let returnedToPatrolAfterInvestigate = false;

    const WINDOW_S = 150; // same budget as the contrasted scenario above
    for (let t = 0; t < Math.round(WINDOW_S / DT); t++) {
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch" });
      engine.player.x = 34;
      engine.player.y = 23;

      for (const ev of engine.events) {
        if (ev.type === "missedCheckIn" && ev.guardId === "w2") sawMissedCheckIn = true;
        if (ev.type === "alert") sawAlert = true;
      }
      if (w1.state === "INVESTIGATE") sawInvestigate = true;
      if (sawInvestigate && w1.state === "PATROL") returnedToPatrolAfterInvestigate = true;

      if (engine.squad.phase !== "INFILTRATION" || engine.squad.alertCount !== 0) {
        throw new Error(
          "expected zero alerts for the WHOLE window with the body safely stuffed away, got phase=" +
            engine.squad.phase +
            " alertCount=" +
            engine.squad.alertCount +
            " at t=" +
            engine.time.toFixed(2)
        );
      }
    }

    if (!sawMissedCheckIn) {
      throw new Error("expected a missedCheckIn event for w2 even though the body is hidden -- check-ins ignore .hidden");
    }
    if (!sawInvestigate) {
      throw new Error("expected w1 to still be dispatched into INVESTIGATE toward the locker");
    }
    if (!returnedToPatrolAfterInvestigate) {
      throw new Error("expected w1 to give up searching the empty-looking spot and return to PATROL");
    }
    if (sawAlert) {
      throw new Error("expected NO alert for the whole window -- a locker-hidden body is exempt from colleague discovery");
    }
    if (engine.squad.phase !== "INFILTRATION" || engine.squad.alertCount !== 0) {
      throw new Error("expected INFILTRATION with zero alerts at the end, got phase=" + engine.squad.phase + " alertCount=" + engine.squad.alertCount);
    }
    // NOT asserted: w2.hidden at the end -- GUARD.SLEEP_S (60s) is well
    // inside this 150s window, so w2 wakes and steps back out of the locker
    // (a real, separate mechanic -- see guardAI.js's own SLEEPING contract)
    // partway through. That's expected, not a cleanup failure; the whole
    // point of this scenario is that it never mattered because nobody ever
    // found the body while it WAS hidden.
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
