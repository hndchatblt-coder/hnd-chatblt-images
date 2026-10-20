// tests/escalation.test.js — headless assertions for src/director.js's
// ESCALATION section (ALERT reinforcements + 40s radio check-ins) and its
// wiring into src/engine.js. Same registry pattern as every other
// tests/*.test.js file: push onto the shared Game.selfTests list; test.js
// runs every entry and reports ok/FAIL with real exit codes.
//
// Two testing styles are used, matching the shape of what's under test:
//   - Tests 1/2/3/5 build a director DIRECTLY (Game.createDirector), same
//     style as tests/cameras.test.js's own pan-angle test, with a real
//     Game.createSquad() whose .phase/.lastKnown we mutate by hand. This
//     gives exact, drift-free control over squad.phase/ctx.time without
//     needing a guard to hold real LOS on the player for 26+ seconds
//     straight (squad.tick()'s own ALERT->EVASION decay would otherwise
//     fire the instant no guard has LOS, which is exactly what we don't
//     want while probing the escalation TIMING itself).
//   - Tests 4/6/7/8/9 drive a real Game.createEngine() end to end, since
//     they're integration checks (perf cost, tranq()/stuffInLocker() ->
//     missedCheckIn -> INVESTIGATE -> colleague discovery -> alert,
//     determinism of the full event stream). Where ALERT needs to be held
//     open longer than a guard's real LOS would sustain it, engine.squad.phase
//     is re-pinned to "ALERT" every tick before calling engine.tick() —
//     directly setting squad's own flat, mutable .phase prop, not a hack
//     around any private state.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var DT = 1 / 60;

function farPlayer() {
  return {
    x: -9999,
    y: -9999,
    facing: 0,
    visionProfile: function () {
      return 1.0;
    },
  };
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

// ---------------------------------------------------------------------------
// 1. Reinforcement timing: ALERT begins at t -> +1 ~6s, +2 ~16s, +3 ~26s,
//    never a +4th.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "escalation: reinforcements spawn +1 ~6s, +2 ~16s, +3 ~26s after ALERT begins, never a 4th",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(101);
    var squad = Game.createSquad(); // starts INFILTRATION
    var director = Game.createDirector({ world: world, vision: vision, squad: squad, rng: rng });
    var guards = [];

    // A few seconds of INFILTRATION first, so "ALERT begins at t" is a real
    // rising edge, not just an artifact of starting the clock at 0.
    var PRE_S = 5;
    var i;
    for (i = 0; i < Math.round(PRE_S / DT); i++) {
      director.tickEscalation(DT, { time: i * DT, guards: guards });
    }

    var alertStart = PRE_S;
    squad.phase = "ALERT";
    squad.lastKnown = { x: 20, y: 15 };

    var spawnOffsets = [];
    var TOTAL_S = 45;
    var STEPS = Math.round(TOTAL_S / DT);
    for (i = 0; i < STEPS; i++) {
      var t = alertStart + i * DT;
      var fired = director.tickEscalation(DT, { time: t, guards: guards });
      fired.forEach(function (ev) {
        if (ev.type === "reinforcement") spawnOffsets.push(t - alertStart);
      });
    }

    assert(
      spawnOffsets.length === 3,
      "expected exactly 3 reinforcements, got " + spawnOffsets.length + " at offsets " + JSON.stringify(spawnOffsets)
    );
    assert(Math.abs(spawnOffsets[0] - 6) < 0.01, "expected 1st reinforcement ~6s after ALERT, got " + spawnOffsets[0].toFixed(4));
    assert(Math.abs(spawnOffsets[1] - 16) < 0.01, "expected 2nd reinforcement ~16s after ALERT, got " + spawnOffsets[1].toFixed(4));
    assert(Math.abs(spawnOffsets[2] - 26) < 0.01, "expected 3rd reinforcement ~26s after ALERT, got " + spawnOffsets[2].toFixed(4));
  },
});

// ---------------------------------------------------------------------------
// 2. Spawn location valid (guardDoor, open floor, r=0.6) and the spawned
//    guard is in ALERT converging on lastKnown from its own first update().
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "escalation: reinforcement spawns at guardDoor on open floor and converges on lastKnown once in ALERT",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(102);
    var squad = Game.createSquad();
    squad.phase = "ALERT";
    squad.lastKnown = { x: 20, y: 15 };
    var director = Game.createDirector({ world: world, vision: vision, squad: squad, rng: rng });
    var guards = [];

    var spawnedId = null;
    var TOTAL_TICKS = Math.round(7 / DT);
    for (var i = 0; i < TOTAL_TICKS && !spawnedId; i++) {
      var fired = director.tickEscalation(DT, { time: i * DT, guards: guards });
      fired.forEach(function (ev) {
        if (ev.type === "reinforcement") spawnedId = ev.guardId;
      });
    }
    assert(spawnedId, "expected a reinforcement to have spawned within 7s of ALERT");

    var newGuard = guards[guards.length - 1];
    assert(newGuard && newGuard.id === spawnedId, "expected the pushed guard to match the fired event's guardId");

    var door = zone.guardDoor;
    assert(
      newGuard.x === door.x && newGuard.y === door.y,
      "expected the reinforcement to spawn exactly at guardDoor, got (" + newGuard.x + "," + newGuard.y + ")"
    );
    assert(!world.isBlockedCircle(newGuard.x, newGuard.y, 0.6), "guardDoor spawn point must be open floor at r=0.6");
    assert(newGuard.state === "PATROL", "expected a brand-new guard's pre-first-update default to be PATROL, got " + newGuard.state);

    // Its own very first update() call performs the ordinary radio-call sync
    // into ALERT (see director.js's SPAWN note) -- the same path every other
    // squad member already goes through.
    newGuard.update(DT, { player: farPlayer(), sleepingGuards: [] });
    assert(newGuard.state === "ALERT", "expected the reinforcement's own first update() to sync it into ALERT, got " + newGuard.state);

    var d0 = dist(newGuard.x, newGuard.y, squad.lastKnown.x, squad.lastKnown.y);
    for (var c = 0; c < Math.round(2 / DT); c++) {
      newGuard.update(DT, { player: farPlayer(), sleepingGuards: [] });
    }
    var d1 = dist(newGuard.x, newGuard.y, squad.lastKnown.x, squad.lastKnown.y);
    assert(d1 < d0, "expected the reinforcement to converge on squad.lastKnown, started " + d0.toFixed(2) + "m away, now " + d1.toFixed(2) + "m away");
  },
});

// ---------------------------------------------------------------------------
// 3. Counter persists through a CAUTION decay within one zone visit; a fresh
//    zone visit (fresh director instance) starts unspent.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "escalation: reinforcement counter survives a phase decay, resets only on a fresh zone visit",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(103);
    var squad = Game.createSquad();
    var director = Game.createDirector({ world: world, vision: vision, squad: squad, rng: rng });
    var guards = [];
    var simTime = 0;

    function step() {
      var fired = director.tickEscalation(DT, { time: simTime, guards: guards });
      simTime += DT;
      return fired;
    }

    function countReinforcements(seconds) {
      var n = 0;
      var steps = Math.round(seconds / DT);
      for (var i = 0; i < steps; i++) {
        var fired = step();
        for (var f = 0; f < fired.length; f++) {
          if (fired[f].type === "reinforcement") n++;
        }
      }
      return n;
    }

    squad.phase = "ALERT";
    squad.lastKnown = { x: 20, y: 15 };
    var firstBout = countReinforcements(30);
    assert(firstBout === 3, "expected all 3 reinforcements to spawn during the first ALERT bout, got " + firstBout);

    // Decay out of ALERT (simulated directly -- this test cares about the
    // counter's own persistence rule, not squad.tick()'s real timers).
    squad.phase = "CAUTION";
    var duringCaution = countReinforcements(10);
    assert(duringCaution === 0, "expected zero reinforcements while not ALERT, got " + duringCaution);

    // Re-alert within the SAME director instance (same zone visit) -- the
    // counter must NOT have reset just because the phase decayed.
    squad.phase = "ALERT";
    var secondBout = countReinforcements(30);
    assert(secondBout === 0, "expected zero further reinforcements on a re-alert within the same zone visit (counter already capped), got " + secondBout);

    // A FRESH director (standing in for a fresh zone visit -- see
    // director.js's own ESCALATION contract: reinforcementCount is a closure
    // var scoped to one director instance, rebuilt fresh by switchZone)
    // starts unspent and can spawn its own +3.
    var director2 = Game.createDirector({ world: world, vision: vision, squad: squad, rng: rng });
    var guards2 = [];
    var simTime2 = 0;
    squad.phase = "ALERT";
    var freshCount = 0;
    var steps2 = Math.round(30 / DT);
    for (var i = 0; i < steps2; i++) {
      var fired2 = director2.tickEscalation(DT, { time: simTime2, guards: guards2 });
      simTime2 += DT;
      for (var f2 = 0; f2 < fired2.length; f2++) {
        if (fired2[f2].type === "reinforcement") freshCount++;
      }
    }
    assert(freshCount === 3, "expected a fresh zone visit's own director to spawn its own +3, got " + freshCount);
  },
});

// ---------------------------------------------------------------------------
// 4. PERF BUDGET — commsTower's 4 base guards + a full +3 reinforcements (7
//    guards total), full tick still under the 4ms/tick budget. Same portable
//    timing shim as tests/engine.test.js's/tests/commsTower.test.js's own
//    perf tests.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "escalation perf: commsTower + 3 reinforcements (7 guards) still under 4ms/tick budget",
  fn: function () {
    var now =
      typeof performance !== "undefined" && performance.now
        ? function () {
            return performance.now();
          }
        : function () {
            var t = process.hrtime.bigint();
            return Number(t) / 1e6;
          };

    var engine = Game.createEngine({ zoneData: Game.ZONES.commsTower, seed: 42017 });
    assert(engine.guards.length === 4, "setup: expected 4 base guards in commsTower, got " + engine.guards.length);

    // Park the player far off-map so guards converging on the (fake)
    // lastKnown never gain real LOS and open fire -- this test measures tick
    // COST with 7 guards, not combat outcomes (a dead player -> gameOver
    // freezes engine.tick() into a no-op, silently stalling the very
    // reinforcement schedule under test).
    engine.player.x = -1000;
    engine.player.y = -1000;

    engine.squad.phase = "ALERT";
    engine.squad.lastKnown = { x: 20, y: 20 };
    var WARMUP_TICKS = Math.round(30 / DT);
    for (var i = 0; i < WARMUP_TICKS; i++) {
      if (engine.squad.phase !== "ALERT") engine.squad.phase = "ALERT";
      engine.tick();
    }
    assert(engine.guards.length === 7, "expected 4 base + 3 reinforcements = 7 guards after warmup, got " + engine.guards.length);

    var TOTAL_TICKS = 600;
    var start = now();
    for (var tick = 0; tick < TOTAL_TICKS; tick++) {
      if (engine.squad.phase !== "ALERT") engine.squad.phase = "ALERT";
      engine.tick({
        moveX: Math.sin(tick * 0.037),
        moveY: Math.cos(tick * 0.041),
        run: tick % 6 === 0,
        stance: "stand",
      });
    }
    var avgMs = (now() - start) / TOTAL_TICKS;

    assert(avgMs < 4, "expected average tick under 4ms with 7 guards, got " + avgMs.toFixed(3) + "ms");
  },
});

// ---------------------------------------------------------------------------
// 5. Check-in stagger: two guards at different roster indices miss their
//    check-ins on different ticks.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "escalation: two guards' check-in ticks differ, staggered by roster index",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var world = Game.createWorld(zone);
    var vision = Game.createVision({ world: world });
    var rng = Game.createRng(105);
    var squad = Game.createSquad(); // stays INFILTRATION; reinforcements irrelevant here
    var director = Game.createDirector({ world: world, vision: vision, squad: squad, rng: rng });

    // Plain mock guards (not Game.createGuard) -- deliberate: this isolates
    // the SCHEDULING/dispatch logic from guardAI's own FSM (a real dispatched
    // searcher would, after arriving, likely spot the (non-hidden) sleeping
    // body and go ALERT via colleague discovery, radio-syncing every OTHER
    // guard into ALERT too and starving later indices of an available PATROL
    // searcher -- exactly the mechanic tests 6-8 exercise deliberately. Here
    // we only want to see WHEN each index's check-in lands.)
    function mockGuard(id, x, y, state) {
      return {
        id: id,
        x: x,
        y: y,
        state: state,
        hearNoise: function (nx, ny) {
          this.state = "INVESTIGATE";
        },
      };
    }

    var guards = [
      mockGuard("missing1", 5, 15, "SLEEPING"), // index 0 -> offset 0s
      mockGuard("missing2", 35, 15, "SLEEPING"), // index 1 -> offset 5s
      mockGuard("searcher1", 6, 15, "PATROL"),
      mockGuard("searcher2", 34, 15, "PATROL"),
    ];

    var firstSeen = {};
    var TOTAL_S = 45;
    var STEPS = Math.round(TOTAL_S / DT);
    for (var i = 0; i < STEPS; i++) {
      var t = i * DT;
      var fired = director.tickEscalation(DT, { time: t, guards: guards });
      fired.forEach(function (ev) {
        if (ev.type === "missedCheckIn" && firstSeen[ev.guardId] === undefined) {
          firstSeen[ev.guardId] = t;
        }
      });
    }

    assert(firstSeen.missing1 !== undefined, "expected missing1's (index 0) check-in to be missed");
    assert(firstSeen.missing2 !== undefined, "expected missing2's (index 1) check-in to be missed");
    assert(
      firstSeen.missing1 !== firstSeen.missing2,
      "expected the two guards' check-in ticks to differ, both landed at t=" + firstSeen.missing1
    );
    var gap = firstSeen.missing2 - firstSeen.missing1;
    assert(Math.abs(gap - 5) < 0.02, "expected a ~5s stagger between index 0 and index 1, got " + gap.toFixed(3) + "s");
  },
});

// ---------------------------------------------------------------------------
// 6. Tranq a guard -> within <=40s a buddy INVESTIGATEs at the body's
//    current position.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "escalation: tranq a guard -> within <=40s a buddy INVESTIGATEs at the body's position",
  fn: function () {
    var zone = Game.ZONES.loadingDock;
    var engine = Game.createEngine({
      zoneData: zone,
      seed: 4001,
      guardConfigs: [
        { id: "missing1", spawn: { x: 5, y: 15 }, waypoints: [{ x: 5, y: 15 }] },
        { id: "searcher1", spawn: { x: 25, y: 15 }, waypoints: [{ x: 25, y: 15 }] },
      ],
    });
    var missing = engine.guards[0];
    var searcher = engine.guards[1];

    // Park the player far off-map: this test is about the check-in/dispatch
    // machinery, not combat. With the real player sitting at its default
    // zone.playerSpawn, searcher1's own ordinary patrol perception can spot
    // it organically and go ALERT chasing/firing at the player instead --
    // no longer "PATROL", so it's no longer available to be dispatched at
    // missing1's check-in (a real, intentional rule -- see director.js's
    // "if no PATROL guard is free, skip" note -- just not what THIS test is
    // isolating).
    engine.player.x = -1000;
    engine.player.y = -1000;

    // A few seconds first so this isn't the t~0 "already asleep at the very
    // first boundary" edge case.
    for (var i = 0; i < Math.round(3 / DT); i++) engine.tick();

    missing.tranq(true); // instant SLEEPING -- same public API items.js's own dart-hit path uses
    assert(missing.state === "SLEEPING", "setup failed: expected missing1 SLEEPING after tranq(true)");
    var bodyX = missing.x;
    var bodyY = missing.y;
    var tranqTime = engine.time;

    var dispatchedAt = null;
    var searcherIdSeen = null;
    var MAX_WAIT_S = 41; // spec bound (40s) + one tick of slack
    for (var t = 0; t < Math.round(MAX_WAIT_S / DT) && dispatchedAt === null; t++) {
      engine.tick();
      for (var e = 0; e < engine.events.length; e++) {
        var ev = engine.events[e];
        if (ev.type === "missedCheckIn" && ev.guardId === "missing1") {
          dispatchedAt = engine.time;
          searcherIdSeen = ev.searcherId;
        }
      }
    }

    assert(dispatchedAt !== null, "expected a missedCheckIn event for missing1 within " + MAX_WAIT_S + "s of falling asleep");
    assert(
      dispatchedAt - tranqTime <= 41,
      "expected the dispatch within ~40s of the missed guard falling asleep, took " + (dispatchedAt - tranqTime).toFixed(2) + "s"
    );
    assert(searcherIdSeen === "searcher1", "expected searcher1 (the only awake PATROL guard) to be dispatched, got " + searcherIdSeen);
    assert(searcher.state === "INVESTIGATE", "expected searcher1 to be INVESTIGATEing, got " + searcher.state);
    assert(
      dist(searcher.stimulus.x, searcher.stimulus.y, bodyX, bodyY) < 1e-6,
      "expected searcher1's stimulus to be the body's own position"
    );
  },
});

// ---------------------------------------------------------------------------
// 7. Body stuffed in a locker before its check-in -> searcher investigates,
//    NO alert, returns to patrol.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "escalation: a locker-hidden body still gets a searcher dispatched, but no alert -- searcher returns to patrol",
  fn: function () {
    var zone = Game.ZONES.warehouse;
    var locker = zone.lockers[0]; // {x:2,y:6,facing:0}
    var engine = Game.createEngine({
      zoneData: zone,
      seed: 4002,
      guardConfigs: [
        { id: "missing1", spawn: { x: locker.x + 1, y: locker.y }, waypoints: [{ x: locker.x + 1, y: locker.y }] },
        { id: "searcher1", spawn: { x: locker.x + 4, y: locker.y }, waypoints: [{ x: locker.x + 4, y: locker.y }] },
      ],
    });
    var missing = engine.guards[0];
    var searcher = engine.guards[1];

    // Park the player far off-map (see test 6's own note): isolates this
    // test to the check-in/dispatch + colleague-discovery-exemption
    // machinery, with no organic camera/guard-on-player contact possible.
    engine.player.x = -1000;
    engine.player.y = -1000;

    for (var i = 0; i < Math.round(3 / DT); i++) engine.tick();

    missing.tranq(true);
    missing.stuffInLocker(locker);
    assert(missing.hidden === true, "setup failed: expected missing1 hidden after stuffInLocker");
    assert(missing.x === locker.x && missing.y === locker.y, "setup failed: expected missing1 repositioned to the locker");

    var sawMissedCheckIn = false;
    var sawAlert = false;
    var sawInvestigate = false;
    var returnedToPatrolAfterInvestigate = false;
    var WINDOW_S = 80; // 40s worst-case check-in wait + travel + INVESTIGATE_SEARCH(8s) + buffer
    for (var t = 0; t < Math.round(WINDOW_S / DT); t++) {
      engine.tick();
      for (var e = 0; e < engine.events.length; e++) {
        var ev = engine.events[e];
        if (ev.type === "missedCheckIn" && ev.guardId === "missing1") sawMissedCheckIn = true;
        if (ev.type === "alert") sawAlert = true;
      }
      if (searcher.state === "INVESTIGATE") sawInvestigate = true;
      if (sawInvestigate && searcher.state === "PATROL") returnedToPatrolAfterInvestigate = true;
    }

    assert(sawMissedCheckIn, "expected a missedCheckIn even though the body is hidden -- check-ins ignore .hidden, only .state === SLEEPING");
    assert(sawInvestigate, "expected the searcher to have been dispatched into INVESTIGATE");
    assert(!sawAlert, "expected NO alert -- a locker-hidden body is exempt from colleague discovery");
    assert(returnedToPatrolAfterInvestigate, "expected the searcher to give up and return to PATROL after searching a hidden body's spot");
    assert(engine.squad.phase === "INFILTRATION", "expected squad.phase to still read INFILTRATION at the end, got " + engine.squad.phase);
  },
});

// ---------------------------------------------------------------------------
// 8. Missed check-in repeats ~40s later while the guard is still missing.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "escalation: a missed check-in repeats ~40s later while the guard is still asleep",
  fn: function () {
    var zone = Game.ZONES.warehouse;
    var locker = zone.lockers[0];
    var engine = Game.createEngine({
      zoneData: zone,
      seed: 4003,
      guardConfigs: [
        { id: "missing1", spawn: { x: locker.x + 1, y: locker.y }, waypoints: [{ x: locker.x + 1, y: locker.y }] },
        { id: "searcher1", spawn: { x: locker.x + 4, y: locker.y }, waypoints: [{ x: locker.x + 4, y: locker.y }] },
      ],
    });
    var missing = engine.guards[0];

    // Park the player far off-map (see test 6's own note).
    engine.player.x = -1000;
    engine.player.y = -1000;

    // Tranq + stuff BEFORE any ticking, so the guard is SLEEPING from t=0.
    // GUARD.SLEEP_S is 60s -- a real wake-up (state -> PATROL) is a
    // DIFFERENT, real mechanic that has nothing to do with "missing," so the
    // window under test here (needing TWO 40s-apart check-in boundaries) has
    // to land comfortably inside that 60s sleep, not straddle it.
    missing.tranq(true);
    missing.stuffInLocker(locker); // hidden -- never spotted/found, but still wakes on its own SLEEP_S clock

    var checkinTimes = [];
    var WINDOW_S = 55; // comfortably inside the 60s natural sleep window
    for (var t = 0; t < Math.round(WINDOW_S / DT) && checkinTimes.length < 2; t++) {
      engine.tick();
      for (var e = 0; e < engine.events.length; e++) {
        var ev = engine.events[e];
        if (ev.type === "missedCheckIn" && ev.guardId === "missing1") checkinTimes.push(engine.time);
      }
    }

    assert(checkinTimes.length >= 2, "expected the missed check-in to repeat at least twice within " + WINDOW_S + "s, got " + checkinTimes.length);
    var gap = checkinTimes[1] - checkinTimes[0];
    assert(Math.abs(gap - 40) < 0.5, "expected consecutive missed check-ins for the same guard ~40s apart, got " + gap.toFixed(2) + "s");
  },
});

// ---------------------------------------------------------------------------
// 9. Determinism: identical seeds -> identical event streams (reinforcement/
//    missedCheckIn included) over 120s.
// ---------------------------------------------------------------------------
Game.selfTests.push({
  name: "escalation determinism: identical seeds -> identical event streams (reinforcement/missedCheckIn included) over 120s",
  fn: function () {
    function scriptedInput(tick) {
      return {
        moveX: Math.sin(tick * 0.031),
        moveY: Math.cos(tick * 0.047),
        run: tick % 9 === 0,
        stance: tick % 150 < 50 ? "crouch" : tick % 150 < 100 ? "crawl" : "stand",
      };
    }

    function buildEngine() {
      return Game.createEngine({ zoneData: Game.ZONES.commsTower, seed: 9999 });
    }

    var engineA = buildEngine();
    var engineB = buildEngine();
    // Park both players far off-map, identically (see test 6's own note):
    // this test is about the EVENT STREAM matching bit-for-bit, not combat
    // outcomes -- a guard killing the player mid-run would freeze that
    // engine's tick() into a no-op (see file header, tick() step 0), which
    // would trivially (and vacuously) keep both streams "identical" by
    // starving both of any further events instead of actually exercising
    // 120s of reinforcement/check-in activity.
    engineA.player.x = -1000;
    engineA.player.y = -1000;
    engineB.player.x = -1000;
    engineB.player.y = -1000;
    var eventsA = [];
    var eventsB = [];

    var TOTAL_TICKS = Math.round(120 / DT);
    // ALERT starts late (45s in) so the tranq'd guard's own 40s check-in
    // boundary (it falls asleep at ~2s, index 0 -> boundaries at 0/40/80s)
    // lands FIRST, while every other guard is still ordinary PATROL and
    // available to be dispatched -- once ALERT is pinned, every OTHER guard
    // radio-syncs into ALERT too (a real rule, not a test artifact), leaving
    // nobody free to search, which would starve this run of the very
    // missedCheckIn event the sanity check below wants to see exercised.
    var ALERT_AT = Math.round(45 / DT);
    var TRANQ_AT = Math.round(2 / DT);

    for (var tick = 0; tick < TOTAL_TICKS; tick++) {
      if (tick === TRANQ_AT) {
        engineA.guards[0].tranq(true);
        engineB.guards[0].tranq(true);
      }
      if (tick >= ALERT_AT) {
        if (engineA.squad.phase !== "ALERT") {
          engineA.squad.phase = "ALERT";
          engineA.squad.lastKnown = { x: 20, y: 20 };
        }
        if (engineB.squad.phase !== "ALERT") {
          engineB.squad.phase = "ALERT";
          engineB.squad.lastKnown = { x: 20, y: 20 };
        }
      }
      var input = scriptedInput(tick);
      engineA.tick(input);
      engineB.tick(input);
      Array.prototype.push.apply(eventsA, engineA.events);
      Array.prototype.push.apply(eventsB, engineB.events);
    }

    var strA = JSON.stringify(eventsA);
    var strB = JSON.stringify(eventsB);
    assert(strA === strB, "expected identical event streams for identical seeds+input; diverged");

    // Sanity: make sure this run actually exercised both escalation event
    // types, else the equality check above would be vacuously true.
    var hadReinforcement = eventsA.some(function (e) {
      return e.type === "reinforcement";
    });
    var hadMissedCheckIn = eventsA.some(function (e) {
      return e.type === "missedCheckIn";
    });
    assert(hadReinforcement, "sanity: expected at least one reinforcement event in this determinism run");
    assert(hadMissedCheckIn, "sanity: expected at least one missedCheckIn event in this determinism run");
  },
});
