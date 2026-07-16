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
