// tests/regressions/verb-gating-a2.test.js — regression(cycle36/A2): ration/chaff
// gating semantics. Audit A2 cycle 20 found that ration and chaff verbs had no
// interaction gating (usable while hidden/dragging), unlike fire/CQC/box.
// DECISION: ration is ALWAYS allowed (quiet, small, MGS convention); chaff is
// BLOCKED while hidden-in-locker, allowed while dragging/boxed. This test
// verifies the semantics are implemented and stable.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const DT = 1 / 60;

Game.selfTests.push({
  name: "regression(cycle36/A2): ration always allowed; chaff blocked while hidden",
  fn: function () {
    // Load warehouse: has guards, lockers, and locales for testing drag/hide/box
    var zone = Game.ZONES.warehouse;
    var engine = Game.createEngine({
      zoneData: zone,
      guardConfigs: [{ id: "test-guard", spawn: { x: 20, y: 20 }, waypoints: [{ x: 30, y: 20 }] }],
    });
    var player = engine.player;
    var inv = engine.inventory;
    var guard = engine.guards[0];

    // Setup: damage player to ensure ration can heal (hp < 1)
    player.damage(0.3);
    var hpBeforeTesting = player.hp;
    assert(hpBeforeTesting < 1, "setup failed: player hp should be damaged");

    // === TEST 1: RATION while HIDDEN (ALWAYS ALLOWED) ===
    // Hide player in a locker
    engine.playerHidden = true;
    var hpWhileHidden = player.hp;

    // Fire ration verb while hidden
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: true });

    // Verify: ration was used (hp should have risen)
    assert(player.hp > hpWhileHidden, "ration should heal while hidden-in-locker");
    var chaffCountAfterHiddenRation = inv.chaff;

    // Verify: only ration event was pushed, no "busy" event
    var busyEvents = engine.events.filter(function (e) {
      return e.type === "busy";
    });
    assert(busyEvents.length === 0, "ration verb should never emit busy event");

    var rationEvents = engine.events.filter(function (e) {
      return e.type === "ration";
    });
    assert(rationEvents.length === 1, "ration event should be present");

    // === TEST 2: CHAFF while HIDDEN (BLOCKED) ===
    // Player is still hidden; reset events to see fresh ones
    engine.events = [];
    var chaffCountBefore = inv.chaff;

    // Fire chaff verb while hidden
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", chaff: true });

    // Verify: chaff was NOT consumed (still at same count)
    assert(inv.chaff === chaffCountBefore, "chaff should not be consumed while hidden");

    // Verify: only "busy" event was pushed, no chaff event
    var chaffEventAfter = engine.events.filter(function (e) {
      return e.type === "chaff";
    });
    assert(chaffEventAfter.length === 0, "chaff event should NOT be present while hidden");

    var busyEventWhileHidden = engine.events.filter(function (e) {
      return e.type === "busy";
    });
    assert(busyEventWhileHidden.length === 1, "should emit busy when chaff blocked");

    // === TEST 3: RATION while DRAGGING (ALWAYS ALLOWED) ===
    // Exit locker, set up drag state
    engine.playerHidden = false;
    guard.tranq(true); // Put guard to sleep so we can drag
    assert(guard.state === "SLEEPING", "setup failed: guard should be SLEEPING");

    // Position player near guard and initiate drag
    engine.player.x = 20.5;
    engine.player.y = 20;
    engine.player.facing = 0;
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    assert(engine.dragging === guard.id, "setup failed: drag should be initiated");

    // Reset events and damage player again for ration test
    engine.events = [];
    player.damage(0.2);
    var hpWhileDragging = player.hp;

    // Fire ration verb while dragging
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: true });

    // Verify: ration was used (hp should have risen)
    assert(player.hp > hpWhileDragging, "ration should heal while dragging");

    // Verify: no busy event (ration is never blocked)
    var busyWhileDragging = engine.events.filter(function (e) {
      return e.type === "busy";
    });
    assert(busyWhileDragging.length === 0, "ration should never emit busy while dragging");

    // === TEST 4: CHAFF while DRAGGING (ALLOWED) ===
    engine.events = [];
    var chaffCountBeforeDrag = inv.chaff;

    // Fire chaff verb while dragging
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", chaff: true });

    // Verify: chaff was consumed (count decremented)
    assert(inv.chaff === chaffCountBeforeDrag - 1, "chaff should be consumed while dragging");

    // Verify: chaff event was pushed, no busy event
    var chaffEventWhileDrag = engine.events.filter(function (e) {
      return e.type === "chaff";
    });
    assert(chaffEventWhileDrag.length === 1, "chaff event should be present while dragging");

    var busyEventWhileDrag = engine.events.filter(function (e) {
      return e.type === "busy";
    });
    assert(busyEventWhileDrag.length === 0, "should not emit busy when chaff is allowed while dragging");

    // === TEST 5: RATION while BOXED (ALWAYS ALLOWED) ===
    // Release drag and enable box
    engine.events = [];
    engine.dragging = null;
    assert(inv.hasBox, "setup failed: player should have box");

    var boxEdge = !inv.boxOn; // Ensure we toggle it on
    var boxToggleResult = false;
    engine.tick({
      moveX: 0,
      moveY: 0,
      run: false,
      stance: "stand",
      box: true,
    });
    assert(inv.boxOn, "setup failed: box should be toggled on");

    // Damage player again for ration test
    player.damage(0.2);
    var hpWhileBoxed = player.hp;

    // Fire ration verb while boxed
    engine.events = [];
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", ration: true });

    // Verify: ration was used (hp should have risen)
    assert(player.hp > hpWhileBoxed, "ration should heal while boxed");

    // Verify: no busy event (ration is never blocked)
    var busyWhileBoxed = engine.events.filter(function (e) {
      return e.type === "busy";
    });
    assert(busyWhileBoxed.length === 0, "ration should never emit busy while boxed");

    // === TEST 6: CHAFF while BOXED (ALLOWED) ===
    engine.events = [];
    var chaffCountBeforeBox = inv.chaff;

    // Fire chaff verb while boxed
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", chaff: true });

    // Verify: chaff was consumed (count decremented)
    assert(inv.chaff === chaffCountBeforeBox - 1, "chaff should be consumed while boxed");

    // Verify: chaff event was pushed, no busy event
    var chaffEventWhileBoxed = engine.events.filter(function (e) {
      return e.type === "chaff";
    });
    assert(chaffEventWhileBoxed.length === 1, "chaff event should be present while boxed");

    var busyEventWhileBoxed = engine.events.filter(function (e) {
      return e.type === "busy";
    });
    assert(busyEventWhileBoxed.length === 0, "should not emit busy when chaff is allowed while boxed");
  },
});
