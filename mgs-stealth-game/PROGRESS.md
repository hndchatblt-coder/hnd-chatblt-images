# PROGRESS.md

**Version:** v0.8 (cycle 8 — engine)

## Module status

| Module         | Status      | Notes                                    |
|----------------|-------------|------------------------------------------|
| rng            | stub        | seeded RNG single source                 |
| boot           | stub        | game loop shell + boot self-test hook    |
| world          | v1          | Loading Dock data; isBlocked/raycast/moveCircle |
| player         | v1          | stances/speeds/facing; visionProfile+noiseRadius |
| vision         | v1          | stateless cone/LOS/meter; thresholds for FSM |
| guardAI        | v2 (full)   | full FSM ladder + createSquad phase controller |
| soundEvents    | not started | emit radii, wall attenuation             |
| items          | not started | box, tranq, CQC, lockers, chaff          |
| director       | not started | reinforcements, radio check-ins          |
| engine         | v1          | canonical tick, events, snapshot(); perf 0.031ms/10 guards |
| saveState      | not started | snapshot() groundwork exists in engine   |
| radar          | not started | soliton radar                            |
| hud            | not started |                                          |
| codec          | not started |                                          |
| music          | not started | WebAudio, failure-isolated               |
| render         | not started | ONLY module allowed to touch THREE       |

## Known issues

- engine.events clears every tick — consumers must drain post-tick same-tick.
- ALERT guards hold at 2m with no damage — player HP lands with items/HUD.
- moveCircle has no substep guard: a >1m single-tick displacement could tunnel a
  1m wall. Unreachable at 60Hz today; must fix before dash/throw physics.

## Changelog (last 5)

- cycle 8: engine — canonical fixed-timestep loop (player→guards→squad→events),
  snapshot(), smoke + perf gates (54/54, 7/7, 0.031ms/tick @ 10 guards)
- cycle 7: bugfix — full test suite (47) now bundled into game.html; in-browser
  boot gate runs the same suite as node (was 3/3, now 47/47)
- cycle 6: guardAI part B — ALERT pursuit/arrest, EVASION staggered sweep,
  CAUTION widened cones, createSquad phase controller, meter-bounce bug fixed
  (47/47, 6/6)
- cycle 5: bugfix — waypoint route rerouted around guard hut; leg-clearance
  sanity test (r=0.6 sampled + raycast, wrap-around); first regression test
  (guard walks real loop 180s). 38/38, 4/4
- cycle 4: guardAI part A — PATROL/SUSPICIOUS/INVESTIGATE FSM, hearNoise API,
  head-sweep, determinism test, 3 sim scenarios (36/36, 4/4)
- cycle 3: vision — 70°/14m cone, exact LOS, fill meter (0.8s confirm at 2m),
  stance/darkness/extraMult modifiers, 9 tests (28/28)
- cycle 2: player — walk/run/crouch/crawl (6/3/1.6/0.8 m/s), facing, collision
  via world.moveCircle, visionProfile + noiseRadius hooks, 8 tests (19/19)
- cycle 1: world — Loading Dock as data (8 interior obstacles, 3 routes, dark
  zones), exact slab raycast, sliding circle collision, 8 tests (11/11)
- cycle 0: scaffold — repo layout, ledgers, build/test/sim harness skeletons, loop.sh
