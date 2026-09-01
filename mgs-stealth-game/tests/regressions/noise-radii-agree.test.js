// tests/regressions/noise-radii-agree.test.js — regression(cycle22/A8): player
// noiseRadius values agree with Game.SOUND.RADII. Ensures that the player's
// motion-state noise radii (local NOISE_RUN/WALK/CROUCH/CRAWL constants in
// src/player.js) stay in sync with Game.SOUND.RADII values in
// src/soundEvents.js, so a rebalance in one module is caught if the other
// isn't updated.
const Game = global.Game;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const DT = 1 / 60;

Game.selfTests.push({
  name: "regression(cycle22/A8): player noiseRadius values agree with Game.SOUND.RADII",
  fn: function () {
    // Build a real engine to get a live player
    var engine = Game.createEngine();
    var player = engine.player;

    // Test each motion state:
    // 1. run (stand stance + run flag + moving)
    player.stance = "stand";
    player.update({ moveX: 1, moveY: 0, run: true, stance: "stand" }, DT);
    var runRadius = player.noiseRadius();
    assert(
      runRadius === Game.SOUND.RADII.run,
      "run: player.noiseRadius() = " + runRadius + " but Game.SOUND.RADII.run = " + Game.SOUND.RADII.run
    );

    // 2. walk (stand stance, no run flag, moving)
    engine.tick({ moveX: 1, moveY: 0, run: false, stance: "stand" });
    var walkRadius = player.noiseRadius();
    assert(
      walkRadius === Game.SOUND.RADII.walk,
      "walk: player.noiseRadius() = " + walkRadius + " but Game.SOUND.RADII.walk = " + Game.SOUND.RADII.walk
    );

    // 3. crouch (crouch stance, moving)
    engine.tick({ moveX: 1, moveY: 0, run: false, stance: "crouch" });
    var crouchRadius = player.noiseRadius();
    assert(
      crouchRadius === Game.SOUND.RADII.crouch,
      "crouch: player.noiseRadius() = " + crouchRadius + " but Game.SOUND.RADII.crouch = " + Game.SOUND.RADII.crouch
    );

    // 4. crawl (crawl stance, moving) — note: Game.SOUND.RADII has no crawl key,
    // so noiseRadius should be 0 (stationary crawl would also be 0, but here we
    // verify the moving crawl case also returns 0)
    engine.tick({ moveX: 1, moveY: 0, run: false, stance: "crawl" });
    var crawlRadius = player.noiseRadius();
    assert(
      crawlRadius === 0,
      "crawl: player.noiseRadius() = " + crawlRadius + " (expected 0; Game.SOUND.RADII has no crawl key)"
    );

    // 5. stationary (all stances, no movement) should all be 0
    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "stand" });
    var stationaryStandRadius = player.noiseRadius();
    assert(
      stationaryStandRadius === 0,
      "stationary (stand): player.noiseRadius() = " + stationaryStandRadius + " (expected 0)"
    );

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crouch" });
    var stationaryCrouchRadius = player.noiseRadius();
    assert(
      stationaryCrouchRadius === 0,
      "stationary (crouch): player.noiseRadius() = " + stationaryCrouchRadius + " (expected 0)"
    );

    engine.tick({ moveX: 0, moveY: 0, run: false, stance: "crawl" });
    var stationaryCrawlRadius = player.noiseRadius();
    assert(
      stationaryCrawlRadius === 0,
      "stationary (crawl): player.noiseRadius() = " + stationaryCrawlRadius + " (expected 0)"
    );
  },
});
