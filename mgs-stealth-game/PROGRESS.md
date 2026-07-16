# PROGRESS.md

**Version:** v0.2 (cycle 2 — player)

## Module status

| Module         | Status      | Notes                                    |
|----------------|-------------|------------------------------------------|
| rng            | stub        | seeded RNG single source                 |
| boot           | stub        | game loop shell + boot self-test hook    |
| world          | v1          | Loading Dock data; isBlocked/raycast/moveCircle |
| player         | v1          | stances/speeds/facing; visionProfile+noiseRadius |
| vision         | not started | cones, detect meter, raycast             |
| guardAI        | not started | full FSM                                 |
| soundEvents    | not started | emit radii, wall attenuation             |
| items          | not started | box, tranq, CQC, lockers, chaff          |
| director       | not started | reinforcements, radio check-ins          |
| saveState      | not started |                                          |
| radar          | not started | soliton radar                            |
| hud            | not started |                                          |
| codec          | not started |                                          |
| music          | not started | WebAudio, failure-isolated               |
| render         | not started | ONLY module allowed to touch THREE       |

## Known issues

- moveCircle has no substep guard: a >1m single-tick displacement could tunnel a
  1m wall. Unreachable at 60Hz today; must fix before dash/throw physics.

## Changelog (last 5)

- cycle 2: player — walk/run/crouch/crawl (6/3/1.6/0.8 m/s), facing, collision
  via world.moveCircle, visionProfile + noiseRadius hooks, 8 tests (19/19)
- cycle 1: world — Loading Dock as data (8 interior obstacles, 3 routes, dark
  zones), exact slab raycast, sliding circle collision, 8 tests (11/11)
- cycle 0: scaffold — repo layout, ledgers, build/test/sim harness skeletons, loop.sh
