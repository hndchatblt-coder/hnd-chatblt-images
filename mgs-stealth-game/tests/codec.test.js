// tests/codec.test.js -- headless assertions for src/codec.js's PURE director
// half (Game.createCodecDirector) only. The view half (Game.createCodec) is
// BROWSER ONLY by design (see src/codec.js's file header) and is deliberately
// NOT exercised here -- no DOM, no canvas, no WebAudio in this file at all.
// screenshot.js's "04-codec" scene is what verifies the rendered overlay (and
// its procedural portraits) actually look right (open shots/04-codec.png and
// look).
//
// test.js's own LOGIC_ORDER (fixed; out of scope to touch this cycle) does
// not yet list src/codec.js, so this file loads it itself, the same require
// test.js uses for every other src module -- safe in node (require exists as
// a free variable in every CommonJS module) and a complete no-op in the
// browser build (build.js's ORDER array already lists codec.js ahead of the
// test-file collection step). Mirrors tests/radar.test.js's/tests/music.test.js's
// own self-require guard trick exactly.
if (typeof require !== "undefined") {
  require("../src/codec.js");
}

const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// Recursively asserts a value tree contains no function and no `undefined`
// property anywhere -- JSON.stringify silently drops both, so a naive
// round-trip check alone could miss a leaked function/undefined. Mirrors
// tests/radar.test.js's own assertNoFunctionsOrUndefined helper exactly.
function assertNoFunctionsOrUndefined(value, path) {
  path = path || "root";
  if (value === undefined) throw new Error("found undefined at " + path);
  if (typeof value === "function") throw new Error("found a function at " + path);
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      assertNoFunctionsOrUndefined(value[i], path + "[" + i + "]");
    }
    return;
  }
  for (var k in value) {
    if (Object.prototype.hasOwnProperty.call(value, k)) {
      assertNoFunctionsOrUndefined(value[k], path + "." + k);
    }
  }
}

function assertValidCall(call, expectedId) {
  assert(call !== null && typeof call === "object", "call should be an object");
  assert(call.id === expectedId, "expected id " + expectedId + ", got " + call.id);
  assert(
    call.speaker === "COMMANDER" || call.speaker === "MEI",
    "speaker should be COMMANDER or MEI, got " + call.speaker
  );
  assert(
    call.freq === Game.CODEC.FREQ[call.speaker],
    "freq should match Game.CODEC.FREQ[speaker]"
  );
  assert(Array.isArray(call.lines), "lines should be an array");
  assert(call.lines.length >= 4, "expected >=4 lines, got " + call.lines.length);
  call.lines.forEach(function (line, i) {
    assert(typeof line.who === "string" && line.who.length > 0, "line " + i + " missing who");
    assert(typeof line.text === "string" && line.text.length > 0, "line " + i + " missing text");
  });
  assertNoFunctionsOrUndefined(call, "call");
  // full JSON round-trip, belt-and-braces on top of the walk above.
  var roundTripped = JSON.parse(JSON.stringify(call));
  assert(roundTripped.id === call.id, "call should survive a JSON round-trip");
}

Game.selfTests.push({
  name: "codec: missionOpen fires exactly once, on the very first update()",
  fn: function () {
    var director = Game.createCodecDirector();
    var first = director.update([], { darts: 12 });
    assertValidCall(first, "missionOpen");

    // No other trigger conditions met on subsequent calls -> nothing queued.
    var second = director.update([], { darts: 12 });
    assert(second === null, "expected null on the second update() call");
    var third = director.update([], { darts: 12 });
    assert(third === null, "missionOpen must never fire a second time");
  },
});

Game.selfTests.push({
  name: "codec: firstAlert fires once on an {type:'alert'} event, not again on a second alert",
  fn: function () {
    var director = Game.createCodecDirector();
    director.update([], { darts: 12 }); // consume missionOpen first

    var call = director.update([{ type: "alert", x: 1, y: 2 }], { darts: 12 });
    assertValidCall(call, "firstAlert");

    var again = director.update([{ type: "alert", x: 3, y: 4 }], { darts: 12 });
    assert(again === null, "firstAlert must not re-fire on a later alert event");
  },
});

Game.selfTests.push({
  name: "codec: firstAlert also fires on a phaseChange to ALERT",
  fn: function () {
    var director = Game.createCodecDirector();
    director.update([], { darts: 12 }); // consume missionOpen

    var call = director.update(
      [{ type: "phaseChange", from: "INFILTRATION", to: "ALERT" }],
      { darts: 12 }
    );
    assertValidCall(call, "firstAlert");
  },
});

Game.selfTests.push({
  name: "codec: firstBody fires on a tranqFired hit, and NOT on a tranqFired miss",
  fn: function () {
    var miss = Game.createCodecDirector();
    miss.update([], { darts: 12 }); // consume missionOpen
    var missResult = miss.update(
      [{ type: "tranqFired", hit: false, impact: { x: 0, y: 0 } }],
      { darts: 12 }
    );
    assert(missResult === null, "a tranq MISS must not trigger firstBody");

    var hit = Game.createCodecDirector();
    hit.update([], { darts: 12 }); // consume missionOpen
    var hitResult = hit.update(
      [{ type: "tranqFired", hit: true, headshot: false, guardId: "g1", impact: { x: 0, y: 0 } }],
      { darts: 12 }
    );
    assertValidCall(hitResult, "firstBody");

    // Once fired, a later hit must not re-trigger it.
    var again = hit.update(
      [{ type: "tranqFired", hit: true, guardId: "g2", impact: { x: 0, y: 0 } }],
      { darts: 12 }
    );
    assert(again === null, "firstBody must not re-fire on a later tranq hit");
  },
});

Game.selfTests.push({
  name: "codec: firstBody also fires on a {type:'cqc'} event",
  fn: function () {
    var director = Game.createCodecDirector();
    director.update([], { darts: 12 }); // consume missionOpen
    var call = director.update([{ type: "cqc", guardId: "g1" }], { darts: 12 });
    assertValidCall(call, "firstBody");
  },
});

Game.selfTests.push({
  name: "codec: lowDarts fires once when darts drops to <= 3, not again below that",
  fn: function () {
    var director = Game.createCodecDirector();
    director.update([], { darts: 12 }); // consume missionOpen

    var above = director.update([], { darts: 4 });
    assert(above === null, "darts=4 should not trigger lowDarts yet");

    var at3 = director.update([], { darts: 3 });
    assertValidCall(at3, "lowDarts");

    var at1 = director.update([], { darts: 1 });
    assert(at1 === null, "lowDarts must not re-fire once already fired");
  },
});

Game.selfTests.push({
  name: "codec: same-tick multiple triggers queue in priority order, one call per update()",
  fn: function () {
    var director = Game.createCodecDirector();
    // The very first update() call ALSO carries an alert event, a body
    // event, and a low-darts state all at once -- missionOpen, firstAlert,
    // firstBody, and lowDarts all newly qualify on this single call.
    var events = [
      { type: "alert", x: 0, y: 0 },
      { type: "cqc", guardId: "g1" },
    ];
    var state = { darts: 2 };

    var callA = director.update(events, state);
    assertValidCall(callA, "missionOpen"); // highest priority, returned first

    var callB = director.update([], {});
    assertValidCall(callB, "firstAlert");

    var callC = director.update([], {});
    assertValidCall(callC, "firstBody");

    var callD = director.update([], {});
    assertValidCall(callD, "lowDarts");

    var callE = director.update([], {});
    assert(callE === null, "queue should be drained after all four calls");
  },
});

Game.selfTests.push({
  name: "codec: every call id produces a JSON-serializable call with >=4 lines and a valid speaker/freq",
  fn: function () {
    var ids = ["missionOpen", "firstAlert", "firstBody", "lowDarts"];
    var events = [
      { type: "alert", x: 0, y: 0 },
      { type: "cqc", guardId: "g1" },
    ];
    var director = Game.createCodecDirector();
    var seen = [];
    for (var i = 0; i < ids.length; i++) {
      var call = director.update(i === 0 ? events : [], { darts: 2 });
      seen.push(call);
    }
    ids.forEach(function (id, i) {
      assertValidCall(seen[i], id);
    });
  },
});

Game.selfTests.push({
  name: "codec: update() defaults events/state when omitted, still fires missionOpen",
  fn: function () {
    var director = Game.createCodecDirector();
    var call = director.update();
    assertValidCall(call, "missionOpen");
  },
});
