// tests/regressions/chaff-hud.test.js — regression test for chaff cycle:
// chaff count appears in hudModel and decrements on use.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

Game.selfTests.push({
  name: "regression(chaff-hud): fresh engine model shows chaff count",
  fn: function () {
    var engine = Game.createEngine();
    var model = Game.hudModel(engine);

    assert(
      model.chaff === Game.ITEMS.STARTING_CHAFF,
      "expected chaff " + Game.ITEMS.STARTING_CHAFF + ", got " + model.chaff
    );
  },
});

Game.selfTests.push({
  name: "regression(chaff-hud): chaff verb decrements model.chaff",
  fn: function () {
    var engine = Game.createEngine();
    var initialChaff = Game.ITEMS.STARTING_CHAFF;

    // First tick with no chaff input
    engine.tick({ moveX: 0, moveY: 0, run: false, chaff: false });
    var model1 = Game.hudModel(engine);
    assert(model1.chaff === initialChaff, "chaff should not decrement without verb");

    // Second tick with chaff input (edge-triggered)
    engine.tick({ moveX: 0, moveY: 0, run: false, chaff: true });
    var model2 = Game.hudModel(engine);
    assert(model2.chaff === initialChaff - 1, "chaff should decrement by 1 after use, got " + model2.chaff);

    // Third tick holding chaff (no new edge, so no decrement)
    engine.tick({ moveX: 0, moveY: 0, run: false, chaff: true });
    var model3 = Game.hudModel(engine);
    assert(model3.chaff === initialChaff - 1, "chaff should not re-decrement on held key");

    // Release and press again
    engine.tick({ moveX: 0, moveY: 0, run: false, chaff: false });
    engine.tick({ moveX: 0, moveY: 0, run: false, chaff: true });
    var model4 = Game.hudModel(engine);
    assert(model4.chaff === initialChaff - 2, "chaff should decrement again on new edge, got " + model4.chaff);
  },
});
