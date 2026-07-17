// tests/codecDefer.test.js -- headless assertions for phase-aware deferral in
// src/codec.js's createCodecDirector. Verifies that firstBody and lowDarts
// calls are deferred during ALERT/EVASION phases and released when the phase
// returns to INFILTRATION/CAUTION. Existing one-shot semantics and priority
// order are preserved across deferrals. Backward compatibility: undefined
// phase = legacy behavior (all calls fire immediately).

const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function assertValidCall(call, expectedId) {
  assert(call !== null && typeof call === "object", "call should be an object");
  assert(call.id === expectedId, "expected id " + expectedId + ", got " + call.id);
}

// Test 1: firstBody deferred during ALERT phase, released on phase transition
Game.selfTests.push({
  name: "codec: firstBody is DEFERRED while squadPhase is ALERT",
  fn: function () {
    var director = Game.createCodecDirector();
    director.update([], {}, "INFILTRATION"); // missionOpen fires

    // Trigger firstBody while in ALERT phase -- should be deferred, not queued
    var duringAlert = director.update([{ type: "cqc", guardId: "g1" }], {}, "ALERT");
    assert(duringAlert === null, "firstBody should be deferred during ALERT, no call returned");

    // Still in ALERT phase, no new triggers -- nothing queued yet
    var stillAlert = director.update([], {}, "ALERT");
    assert(stillAlert === null, "nothing should be queued while still in ALERT");

    // Phase transitions back to INFILTRATION -- deferred firstBody is released
    var afterAlert = director.update([], {}, "INFILTRATION");
    assertValidCall(afterAlert, "firstBody");

    // Once released, it should not re-fire
    var again = director.update([], {}, "INFILTRATION");
    assert(again === null, "firstBody must not re-fire after being released");
  },
});

// Test 2: lowDarts deferred during EVASION phase, released on phase transition
Game.selfTests.push({
  name: "codec: lowDarts is DEFERRED while squadPhase is EVASION",
  fn: function () {
    var director = Game.createCodecDirector();
    director.update([], {}, "INFILTRATION"); // missionOpen fires

    // Trigger lowDarts while in EVASION phase -- should be deferred
    var duringEvasion = director.update([], { darts: 2 }, "EVASION");
    assert(duringEvasion === null, "lowDarts should be deferred during EVASION, no call returned");

    // Still in EVASION, no new triggers
    var stillEvasion = director.update([], { darts: 2 }, "EVASION");
    assert(stillEvasion === null, "nothing should be queued while still in EVASION");

    // Phase transitions back to CAUTION -- deferred lowDarts is released
    var afterEvasion = director.update([], { darts: 2 }, "CAUTION");
    assertValidCall(afterEvasion, "lowDarts");

    // Once released, it should not re-fire
    var again = director.update([], { darts: 1 }, "CAUTION");
    assert(again === null, "lowDarts must not re-fire after being released");
  },
});

// Test 3: firstAlert fires immediately even during ALERT phase (not deferred)
Game.selfTests.push({
  name: "codec: firstAlert fires IMMEDIATELY during ALERT phase, never deferred",
  fn: function () {
    var director = Game.createCodecDirector();
    director.update([], {}, "INFILTRATION"); // missionOpen fires

    // firstAlert triggered during ALERT phase -- should play immediately
    var call = director.update([{ type: "phaseChange", from: "INFILTRATION", to: "ALERT" }], {}, "ALERT");
    assertValidCall(call, "firstAlert");

    // Next update in same phase should return null (no other trigger)
    var next = director.update([], {}, "ALERT");
    assert(next === null, "nothing else queued after firstAlert");
  },
});

// Test 4: Undefined phase = legacy behavior (all calls fire immediately)
Game.selfTests.push({
  name: "codec: undefined phase (legacy mode) fires all calls immediately",
  fn: function () {
    var director = Game.createCodecDirector();
    director.update([], {}); // missionOpen fires, no phase arg

    // Trigger firstBody with no phase arg (legacy mode) -- should fire immediately
    var body = director.update([{ type: "cqc", guardId: "g1" }], {});
    assertValidCall(body, "firstBody");

    // Trigger lowDarts with no phase arg (legacy mode) -- should fire immediately
    var darts = director.update([], { darts: 3 });
    assertValidCall(darts, "lowDarts");

    // All one-shot triggers exhausted
    var final = director.update([], {});
    assert(final === null, "all triggers fired in legacy mode");
  },
});

// Test 5: Deferred calls maintain one-shot + priority when released together
Game.selfTests.push({
  name: "codec: both firstBody and lowDarts deferred, released in priority order",
  fn: function () {
    var director = Game.createCodecDirector();
    director.update([], {}, "INFILTRATION"); // missionOpen fires

    // Both firstBody and lowDarts trigger during ALERT phase
    director.update([{ type: "cqc", guardId: "g1" }], { darts: 1 }, "ALERT");
    // Neither is queued immediately (both deferred)

    var check1 = director.update([], {}, "ALERT");
    assert(check1 === null, "nothing queued while in ALERT");

    // Phase exits ALERT to INFILTRATION -- both deferred calls are released
    // firstBody has higher priority (3) than lowDarts (4), so it releases first
    var first = director.update([], { darts: 1 }, "INFILTRATION");
    assertValidCall(first, "firstBody");

    var second = director.update([], { darts: 1 }, "INFILTRATION");
    assertValidCall(second, "lowDarts");

    // Both have been released and consumed
    var final = director.update([], {}, "INFILTRATION");
    assert(final === null, "queue empty after both released");
  },
});

// Test 6: missionOpen always fires immediately, regardless of phase
Game.selfTests.push({
  name: "codec: missionOpen fires immediately on first update, regardless of phase",
  fn: function () {
    var director = Game.createCodecDirector();
    // First update during ALERT phase -- missionOpen should still fire immediately
    var call = director.update([], {}, "ALERT");
    assertValidCall(call, "missionOpen");

    // Subsequent updates in ALERT should return null (nothing else to queue)
    var next = director.update([], {}, "ALERT");
    assert(next === null, "nothing queued after missionOpen in ALERT phase");
  },
});
