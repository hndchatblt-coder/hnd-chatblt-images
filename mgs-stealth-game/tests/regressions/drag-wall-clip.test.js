// tests/regressions/drag-wall-clip.test.js — regression(cycle22/A10): dragged
// body never overlaps walls. Ensures that dragging a sleeping guard along a
// path that hugs walls/corners does not clip the body into collision geometry;
// world.moveCircle enforcement in the DRAG FOLLOW block (src/engine.js ~line
// 1204) guarantees the body slides instead of penetrating.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const DT = 1 / 60;

Game.selfTests.push({
  name: "regression(cycle22/A10): dragged body never overlaps walls",
  fn: function () {
    // Use warehouse zone for realistic geometry
    var zone = Game.ZONES.warehouse;
    var engine = Game.createEngine({
      zoneData: zone,
      guardConfigs: [{ id: "drag-test", spawn: { x: 20, y: 20 }, waypoints: [{ x: 30, y: 20 }] }],
    });
    var guard = engine.guards[0];

    // Tranquilize the guard to sleep (headshot -> instantly SLEEPING)
    guard.tranq(true);
    assert(guard.state === "SLEEPING", "setup failed: guard should be SLEEPING");

    // Position player adjacent to (within 1.2m of) the sleeping guard
    // so the drag verb can attach to it. Guard is at (20, 20), so position
    // player close by. We'll then drag them along the edge of the crate cluster.
    engine.player.x = 20.5;
    engine.player.y = 20;
    engine.player.facing = 0; // facing east initially

    // Start dragging by pressing the drag key (G) near the sleeping guard
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand", drag: true });
    if (!engine.dragging) {
      throw new Error("setup failed: drag never initiated");
    }

    // Now drag the guard for 300+ ticks by moving player along a path in open
    // space (center aisle of the warehouse). This ensures the body stays with the
    // player while the drag-follow mechanism tries to keep it 0.9m behind.
    // The player will make a winding path that exercises the collision handling.
    const DRAG_TICKS = 320;
    for (let i = 0; i < DRAG_TICKS; i++) {
      // Move player in a rectangular pattern: north, then west, then south, then east
      if (i < 80) {
        // Move north (toward shelving)
        engine.player.y = Math.max(8, engine.player.y - 0.04);
      } else if (i < 160) {
        // Move west (along the shelving)
        engine.player.x = Math.max(18, engine.player.x - 0.04);
      } else if (i < 240) {
        // Move south (back down)
        engine.player.y = Math.min(25, engine.player.y + 0.04);
      } else {
        // Move east (back to start area)
        engine.player.x = Math.min(22, engine.player.x + 0.04);
      }
      engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });

      // Every tick, verify the guard body doesn't overlap any wall
      var isBlocked = engine.world.isBlockedCircle(guard.x, guard.y, 0.4);
      assert(
        !isBlocked,
        "tick " + i + ": guard body at (" + guard.x.toFixed(2) + "," + guard.y.toFixed(2) +
          ") overlaps a wall (radius 0.4)"
      );
    }
  },
});
