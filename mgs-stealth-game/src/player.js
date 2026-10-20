// src/player.js
// PUBLIC API:
//   Game.createPlayer({ world }) -> player, where `world` is a Game.createWorld(...)
//   instance (see src/world.js). Spawns at world.zone.playerSpawn, radius 0.4.
//
//   Player state — plain readable properties, updated in place by update():
//     player.x, player.y     — position (meters, world space)
//     player.facing          — radians; atan2(dy, dx) of the last nonzero
//                               movement input (0 = +x, PI/2 = +y since +y is
//                               down). Retained (unchanged) while idle.
//     player.stance          — "stand" | "crouch" | "crawl"
//     player.running         — boolean; true only on ticks where the player is
//                               actually moving at the "stand" run speed (i.e.
//                               stance === "stand" && input.run && moving).
//     player.moving          — boolean; true iff this tick's input had nonzero
//                               displacement (before the moveCircle collision
//                               resolve — it reflects INTENT to move, not
//                               whether a wall fully absorbed it).
//     player.radius           — 0.4 (constant)
//     player.hp               — 0..1, starts at 1 (full health). Damage
//                               reduces it (see player.damage below); nothing
//                               in this module restores it (a future
//                               items/ration cycle would call damage() with a
//                               negative amount, or add its own setter — hp is
//                               a plain mutable property, not read-only).
//     player.alive            — boolean, player.hp > 0. Kept as a separate
//                               flat prop (rather than making callers compare
//                               hp themselves) so "is the player still in the
//                               fight" is a single obvious read. Recomputed
//                               every time hp changes (i.e. inside damage());
//                               never touched by update().
//
//   player.update(input, dt):
//     input: { moveX: -1..1, moveY: -1..1, run: boolean,
//              stance: "stand" | "crouch" | "crawl" }
//     dt: fixed timestep in seconds (engine uses 1/60).
//     - DEAD PLAYER: if !player.alive, update() ignores input entirely — no
//       movement, no facing/stance change. player.moving and player.running
//       are forced to false (so noiseRadius()/vision profile callers reading
//       a dead player don't see a stale "was moving" flag) and the function
//       returns immediately. Position, facing, and stance are left exactly as
//       they were at the moment of death (a frozen pose), consistent with
//       engine.js's gameOver freeze (see src/engine.js contract).
//     - The (moveX, moveY) vector is clamped to magnitude 1 (diagonal input is
//       not faster than axis-aligned input).
//     - input.stance sets player.stance for this tick (and is retained if the
//       caller omits it on a later tick).
//     - Speed (m/s) by stance: stand+run 6.0, stand (walk) 3.0, crouch 1.6,
//       crawl 0.8. run only takes effect in "stand"; crouch/crawl ignore
//       input.run and use their own fixed speed.
//     - facing updates only on nonzero input; otherwise unchanged.
//     - Movement is resolved through world.moveCircle — the player can never
//       end up overlapping a wall.
//
//   player.damage(amount) — reduces player.hp by `amount` (same 0..1 unit as
//   hp itself), clamped so hp never goes below 0 (over-damage is silently
//   silently absorbed, not tracked as "overkill"). Recomputes player.alive
//   (hp > 0) immediately after. Amount is expected non-negative (a future
//   ration/heal hook would be its own method, not a negative-amount call to
//   this one — see the hp note above); this function itself does not clamp
//   the upper bound past 1 because it only ever subtracts, never adds. Pure
//   state mutation — no events, no side effects beyond hp/alive; callers
//   (engine.js) are responsible for turning a damage() call into any
//   observable event (e.g. {type:"playerHit"}) and for checking
//   player.alive afterward to drive game-over.
//
//   player.visionProfile() -> number
//     Perception multiplier for the vision module: stand 1.0, crouch 0.6
//     (-40%), crawl 0.3 (-70%). Depends only on current stance.
//
//   player.noiseRadius() -> number
//     Meters of noise radius generated THIS tick, for the soundEvents module:
//     stationary (not moving) 0; else run 8, walk (stand, not running) 3,
//     crouch 1, crawl 0.
//
// Pure logic module: no THREE, no DOM, no browser APIs — runs headless in
// node. No dependency on other modules for math (own local helpers below).
(function (Game) {
  // ---- local math helpers (no dependency on other modules) -----------------

  // Clamps a 2D vector to magnitude <= 1, preserving direction. Vectors
  // already within the unit disc are returned unchanged.
  function clampToUnit(x, y) {
    var mag = Math.sqrt(x * x + y * y);
    if (mag > 1) {
      return { x: x / mag, y: y / mag, mag: 1 };
    }
    return { x: x, y: y, mag: mag };
  }

  var RADIUS = 0.4;

  var SPEED_RUN = 6.0;
  var SPEED_WALK = 3.0;
  var SPEED_CROUCH = 1.6;
  var SPEED_CRAWL = 0.8;

  var VISION_STAND = 1.0;
  var VISION_CROUCH = 0.6;
  var VISION_CRAWL = 0.3;

  var NOISE_RUN = 8;
  var NOISE_WALK = 3;
  var NOISE_CROUCH = 1;
  var NOISE_CRAWL = 0;

  // ---- player factory --------------------------------------------------------

  function createPlayer(deps) {
    var world = deps.world;
    var spawn = world.zone.playerSpawn;

    var player = {
      x: spawn.x,
      y: spawn.y,
      facing: 0,
      stance: "stand",
      running: false,
      moving: false,
      radius: RADIUS,
      hp: 1,
      alive: true,
    };

    function speedFor(stance, run) {
      if (stance === "crouch") return SPEED_CROUCH;
      if (stance === "crawl") return SPEED_CRAWL;
      // "stand" (and any unrecognized stance falls back to stand's rules)
      return run ? SPEED_RUN : SPEED_WALK;
    }

    function update(input, dt) {
      input = input || {};

      if (!player.alive) {
        // Dead: ignore input entirely, no movement, no facing/stance change
        // (see file header). Position/facing/stance stay exactly as they
        // were the instant hp hit 0.
        player.moving = false;
        player.running = false;
        return;
      }

      if (input.stance !== undefined) player.stance = input.stance;

      var rawX = input.moveX || 0;
      var rawY = input.moveY || 0;
      var v = clampToUnit(rawX, rawY);

      var moving = v.mag > 0;
      player.moving = moving;

      if (moving) {
        player.facing = Math.atan2(v.y, v.x);
      }

      var runRequested = !!input.run && player.stance === "stand";
      player.running = moving && runRequested;

      var speed = speedFor(player.stance, runRequested);
      var dx = v.x * speed * dt;
      var dy = v.y * speed * dt;

      var res = world.moveCircle(player.x, player.y, dx, dy, player.radius);
      player.x = res.x;
      player.y = res.y;
    }

    function visionProfile() {
      if (player.stance === "crouch") return VISION_CROUCH;
      if (player.stance === "crawl") return VISION_CRAWL;
      return VISION_STAND;
    }

    function noiseRadius() {
      if (!player.moving) return 0;
      if (player.running) return NOISE_RUN;
      if (player.stance === "crouch") return NOISE_CROUCH;
      if (player.stance === "crawl") return NOISE_CRAWL;
      return NOISE_WALK;
    }

    // See file header: pure hp/alive mutation, no events/side effects beyond
    // that — engine.js turns this into observable events and game-over.
    function damage(amount) {
      player.hp = Math.max(0, player.hp - amount);
      player.alive = player.hp > 0;
    }

    player.update = update;
    player.visionProfile = visionProfile;
    player.noiseRadius = noiseRadius;
    player.damage = damage;

    return player;
  }

  Game.createPlayer = createPlayer;
  if (typeof module !== "undefined")
    module.exports = { createPlayer: createPlayer };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
