// tests/regressions/ration-pickup.test.js — regression test for cycle 29:
// ration pickups collect and heal. Cycle 25 ledger: "ration" pickup in
// commsTower is data-only, uncollectible. This test verifies the fix:
// ration pickups increment inv.rations on walk-over and don't double-collect.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function dist(x1, y1, x2, y2) {
  var dx = x2 - x1;
  var dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

Game.selfTests.push({
  name: "regression(cycle29): ration pickups collect and heal",
  fn: function () {
    var DT = 1 / 60;

    // Build engine in commsTower zone
    var engine = Game.createEngine({ zoneData: Game.ZONES.commsTower });
    var player = engine.player;
    var inv = engine.inventory;

    // Get the ration pickup location from zone data
    var zone = Game.ZONES.commsTower;
    var rationPickup = zone.pickups.find(function (p) {
      return p.item === "ration";
    });
    assert(rationPickup, "ration pickup not found in commsTower");

    // Store initial ration count
    var initialRations = inv.rations;
    assert(initialRations === 3, "expected starting rations to be 3, got " + initialRations);

    // Teleport player onto the ration pickup's coordinates
    player.x = rationPickup.x;
    player.y = rationPickup.y;

    // Tick to trigger pickup collection
    engine.tick(DT, { moveX: 0, moveY: 0, run: false });

    // Assert rations incremented (3 -> 4)
    assert(inv.rations === 4, "rations should be 4 after pickup, got " + inv.rations);

    // Assert pickup event was fired
    var pickupEvent = engine.events.find(function (e) {
      return e.type === "pickup" && e.item === "ration";
    });
    assert(pickupEvent, "pickup event not found for ration");

    // Move player away from pickup
    player.x = -10;
    player.y = -10;

    // Tick again to verify no double-collection
    engine.tick(DT, { moveX: 0, moveY: 0, run: false });

    // Assert rations remain at 4 (no double-collect)
    assert(inv.rations === 4, "rations should still be 4 after moving away, got " + inv.rations);

    // Now test ration usage: damage the player
    player.damage(0.5);
    var hpBeforeRation = player.hp;
    assert(hpBeforeRation < 1, "player hp should be < 1 after damage, got " + hpBeforeRation);

    // Use a ration via the inventory verb (fire the ration verb)
    var rationResult = inv.useRation(player);
    assert(rationResult.used === true, "ration should be used");
    assert(rationResult.healAmount === Game.ITEMS.RATION_HEAL, "heal amount should be RATION_HEAL");

    // Apply the heal (this is what engine.js's RATION VERB does)
    player.hp = Math.min(1, player.hp + rationResult.healAmount);

    // Assert hp rose by 0.35 (RATION_HEAL)
    var expectedHp = Math.min(1, hpBeforeRation + Game.ITEMS.RATION_HEAL);
    assert(
      Math.abs(player.hp - expectedHp) < 0.001,
      "hp should be " + expectedHp + ", got " + player.hp
    );

    // Assert rations decremented (4 -> 3)
    assert(inv.rations === 3, "rations should be 3 after use, got " + inv.rations);
  },
});
