# TESTLOG.md

## Cycle 1 (world: Loading Dock, walls, collision)

`node build.js && node test.js` 11/11; `node sim.js` 1/1. 8 new world tests.

Playtest (mental walk of the data — no player module yet, so this is a map read):
started at spawn (20,27), traced the three routes: west container hug passes
through a dark zone (good — stealth route is the slow route), east flank is the
open/fast route, center weave threads two ~4m gaps around the crate stack.

**3 problems:**
1. moveCircle resolves per-axis with no substepping — a >1m single-tick
   displacement could tunnel a 1m wall. Not reachable at 60Hz today; needs a
   substep guard before any dash/throw physics. → backlog.
2. Waypoint loop is a plain rectangle — patrol will feel robotic; wants head-sweep
   pauses and an off-loop detour (guard hut visit). → handled in guardAI cycle.
3. Exit gap (4m at north) has no cover within ~6m of it — final approach may be
   a flat dash. Revisit after vision lands to check if a darkZone belongs there.

**3 delights:**
1. Center crate stack blocking the spawn→exit sightline is asserted BY TEST —
   the level can never silently regress into a straight corridor.
2. Dark zone in the container alley sets up a classic "watch the cone sweep past
   while pressed in shadow" beat before vision even exists.
3. Closed-edge containment convention documented in the contract block — vision
   raycasts will never disagree with collision about where a wall starts.

## Cycle 0 (scaffold)

Harness skeletons written. `node build.js && node test.js` green on skeleton
modules (rng + boot). No playtest yet — nothing to play.
