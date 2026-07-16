# TESTLOG.md

## Cycle 3 (vision: cone, LOS, detect meter)

`node build.js && node test.js` 28/28; `node sim.js` 1/1. 9 new vision tests.

Playtest (paper trace: stood a hypothetical guard at waypoint NW facing the
container alley, walked the three routes against computeSight by hand):

**3 problems:**
1. DRAIN_PER_SEC 0.5 means a meter that hit 0.9 takes ~1.8s to clear — but
   there's no partial-decay "memory": ducking behind a crate for 0.5s and
   re-emerging restarts fill from ~0.65, which feels right, but the GUARD
   forgets nothing/knows nothing — the ?/! reaction belongs to the FSM cycle
   and must consume SUSPICIOUS_AT crossings as EVENTS, not levels. → FSM brief.
2. Proximity scale bottoms at 0.3 at 14m: full detection at max range takes
   ~2.7s standing — possibly too forgiving for the finale zone's heavy patrols.
   Revisit with a per-guard fill multiplier when Comms Tower lands. → backlog.
3. Peripheral vision is a hard cone edge: a target at 36° is invisible, 34° is
   full-rate. MGS uses this readability but a narrow "peripheral band" (half
   rate, 70–90°) would reward brushing the edge. → backlog candidate (Tension).

**3 delights:**
1. Stateless computeSight/tickMeter — the FSM cycle gets exact, replayable
   perception with zero hidden coupling.
2. Crawling through the dark alley at 2m from a guard's line: 0.3×0.5 = 15%
   fill rate → ~5.3s to confirm. The crawl-under-the-cone fantasy works.
3. The ±PI seam test means no "guard is blind when facing west" class of bug —
   that one always ships otherwise.

## Cycle 2 (player movement set)

`node build.js && node test.js` 19/19; `node sim.js` 1/1. 8 new player tests.

Playtest (headless walk of all three routes with scripted inputs — no vision/
guards yet, so this is movement feel on paper):

**3 problems:**
1. `player.moving` reflects INTENT (nonzero input), not actual displacement —
   pushing into a wall counts as "moving" and will emit walk-radius noise
   against a wall. Defensible (scraping is noisy) but must be a deliberate
   choice once soundEvents lands. → backlog note.
2. Stance switches are instant — crawl→stand→crawl toggling will look teleporty
   and lets players strobe their visionProfile. Needs transition timers before
   vision tuning is meaningful. → backlog.
3. No wall-press verb yet; corner peek is core MGS grammar and affects vision
   exposure. Scheduled with items/CQC group but may deserve promotion. → note.

**3 delights:**
1. Speed table (6/3/1.6/0.8) gives crawl-through-dark-zone a real cost — the
   stealth route through the container alley takes ~14s vs ~5s run.
2. Collision slide means hugging container edges feels frictionless — no
   snagging on AABB corners during the center weave.
3. visionProfile/noiseRadius as tiny pure functions on the player = the vision
   and sound cycles get their inputs for free, no refactor needed.

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
