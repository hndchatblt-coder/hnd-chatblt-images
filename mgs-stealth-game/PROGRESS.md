# PROGRESS.md

**Version:** v0.0 (cycle 0 — scaffold)

## Module status

| Module         | Status      | Notes                                    |
|----------------|-------------|------------------------------------------|
| rng            | stub        | seeded RNG single source                 |
| boot           | stub        | game loop shell + boot self-test hook    |
| world          | not started | zones as data, walls, collision          |
| player         | not started | movement set                             |
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

- None yet.

## Changelog (last 5)

- cycle 0: scaffold — repo layout, ledgers, build/test/sim harness skeletons, loop.sh
