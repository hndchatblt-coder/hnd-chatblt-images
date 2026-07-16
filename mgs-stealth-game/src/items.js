// src/items.js
// PUBLIC API:
//   Game.ITEMS — tunable constants:
//     {
//       STARTING_DARTS: 12,   // Game.createInventory()'s starting dart count
//       DART_RANGE: 14,       // meters, max travel distance of a fired dart
//       DART_HIT_PERP: 0.5,   // meters, max perpendicular distance from the
//                             // shot ray for a guard to count as hit
//     }
//
//   Game.createInventory() -> inv
//     inv.weapon — "tranq" (only weapon this cycle; a fixed string, not yet a
//       real loadout system).
//     inv.darts  — mutable dart count, starts at ITEMS.STARTING_DARTS (12).
//       Decremented by a successful fireTranq() CALL (any call that actually
//       consumes a dart, hit or miss) — see fireTranq below. Carries over a
//       zone transition unchanged (engine.js never resets/rebuilds inventory
//       on switchZone — darts are mission-scoped, not zone-scoped).
//
//     inv.fireTranq(engine) -> { fired, hit, guardId?, headshot?, impact:{x,y} }
//       `engine` is a live Game.createEngine() instance (or anything shaped
//       like one: .player {x,y,facing}, .world (raycast), .guards[] (each
//       with x, y, id, state, squad.phase)) — read-only, this function never
//       mutates engine/player/world/guards itself (see ENGINE-AGNOSTIC note
//       below).
//
//       No darts left (inv.darts <= 0): returns { fired: false } immediately,
//       no dart consumed, no other field set.
//
//       Otherwise: inv.darts-- (a dart is spent on every actual shot,
//       regardless of hit/miss), then the shot is resolved as a straight ray
//       from the player's position along player.facing, max ITEMS.DART_RANGE
//       (14m):
//         1. WALL CLIP: engine.world.raycast(player.x, player.y, farX, farY)
//            (farX/farY = the ray's endpoint at max range) gives the wall hit
//            distance (or DART_RANGE if the ray is totally clear — no wall in
//            range).
//         2. GUARD HIT TEST: for every guard in engine.guards that is NOT
//            currently "SLEEPING" (an awake, non-sleeping guard — a sleeping
//            body cannot be shot again by this pass; see guardAI.js's
//            SLEEPING contract), project the guard's offset from the player
//            onto the ray direction ("along") and perpendicular to it
//            ("perp"). A guard qualifies as a hit candidate iff:
//              - along > 0 (in front of the player, not behind), AND
//              - perp < ITEMS.DART_HIT_PERP (0.5m — close enough to the ray
//                line), AND
//              - along < wallHitDistance (closer than whatever wall would
//                otherwise stop the dart — a guard standing behind a wall
//                from the shooter's POV cannot be hit).
//            Among all qualifying guards, the NEAREST one (smallest `along`)
//            is the one hit. No qualifying guard -> a miss.
//         3. RESULT:
//            HIT: { fired: true, hit: true, guardId: <hit guard's id>,
//                    headshot: <hit guard's squad.phase !== "ALERT">,
//                    impact: { x: <hit guard's x>, y: <hit guard's y> } }
//              HEADSHOT RULE (documented here, applied by the CALLER — see
//              ENGINE-AGNOSTIC note below): a dart landing on a guard whose
//              squad is NOT currently in ALERT phase is an unaware target —
//              instant sleep (headshot). A dart landing on a guard whose
//              squad IS in ALERT (the guard is actively hunting/fighting,
//              not caught flat-footed) staggers instead — the guard keeps
//              acting normally for GUARD.STAGGER_SLEEP_S (3s) before it
//              finally goes down. This function only COMPUTES the boolean;
//              guardAI.js's guard.tranq(headshot) is what actually applies
//              the instant-sleep-vs-stagger behavior (see its own contract).
//            MISS: { fired: true, hit: false,
//                     impact: <wall hit point, or the max-range point along
//                     the ray if the ray never hit a wall> }
//            Either way, `impact` is the dart's final resting point — the
//            CALLER (engine.js) is responsible for emitting the dart-impact
//            SHARP noise (SOUND.RADII.dartImpact, 5m unattenuated) there;
//            see the ENGINE-AGNOSTIC note below for why that's not done here.
//
//   ENGINE-AGNOSTIC NOTE: this module reads engine.player/world/guards to do
//   its geometry (that's an ordinary dependency, same shape as every other
//   logic module consuming world/vision/etc.), but it never calls
//   soundEvents.emit/emitRadius and never calls guard.tranq() itself — sound
//   emission and the hit-guard's actual state mutation are ENGINE's job (see
//   src/engine.js's fire-verb wiring), so this module stays a pure "what did
//   the shot do" calculator with no side effects on anything outside its own
//   `inv` object (inv.darts is the only mutation fireTranq performs).
//
// Pure logic module: no THREE, no DOM, no browser APIs, no Math.random/Date —
// runs headless in node. No dependency on other modules for math (own local
// helpers below); consumes an engine-shaped object via .player/.world/.guards
// only, per the contract above.
(function (Game) {
  var ITEMS = {
    STARTING_DARTS: 12,
    DART_RANGE: 14,
    DART_HIT_PERP: 0.5,
  };

  function createInventory() {
    var inv = {
      weapon: "tranq",
      darts: ITEMS.STARTING_DARTS,
    };

    function fireTranq(engine) {
      if (inv.darts <= 0) return { fired: false };
      inv.darts--;

      var player = engine.player;
      var world = engine.world;
      var guards = engine.guards;

      var dirX = Math.cos(player.facing);
      var dirY = Math.sin(player.facing);
      var farX = player.x + dirX * ITEMS.DART_RANGE;
      var farY = player.y + dirY * ITEMS.DART_RANGE;

      var wallHit = world.raycast(player.x, player.y, farX, farY);
      var wallDist = wallHit ? wallHit.dist : ITEMS.DART_RANGE;

      var bestGuard = null;
      var bestAlong = Infinity;

      for (var i = 0; i < guards.length; i++) {
        var g = guards[i];
        if (g.state === "SLEEPING") continue; // only awake, non-sleeping guards can be hit

        var dx = g.x - player.x;
        var dy = g.y - player.y;
        var along = dx * dirX + dy * dirY;
        if (along <= 0) continue; // behind the shooter

        var perp = Math.abs(dx * dirY - dy * dirX); // distance from (dx,dy) to the ray line
        if (perp < ITEMS.DART_HIT_PERP && along < wallDist) {
          if (along < bestAlong) {
            bestAlong = along;
            bestGuard = g;
          }
        }
      }

      if (bestGuard) {
        var headshot = bestGuard.squad.phase !== "ALERT";
        return {
          fired: true,
          hit: true,
          guardId: bestGuard.id,
          headshot: headshot,
          impact: { x: bestGuard.x, y: bestGuard.y },
        };
      }

      var impact = wallHit ? { x: wallHit.x, y: wallHit.y } : { x: farX, y: farY };
      return { fired: true, hit: false, impact: impact };
    }

    inv.fireTranq = fireTranq;
    return inv;
  }

  Game.ITEMS = ITEMS;
  Game.createInventory = createInventory;
  if (typeof module !== "undefined")
    module.exports = { createInventory: createInventory, ITEMS: ITEMS };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
