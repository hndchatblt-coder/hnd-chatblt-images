# TESTLOG.md

## Cycle 11 (soliton radar)

69/69; 9/9; 3/3 shots eyeballed — radar crisp in patrol, full static + blinking
ALERT when jammed. Model/view split: pure radarModel(engine) is what's tested;
the model EMPTIES the guards array while jammed so positions can't leak.

**3 problems:**
1. radar.js isn't in test.js's LOGIC_ORDER, so its test self-requires the
   module — works, but the loader convention now has two patterns. Unify at
   the cycle-20 audit (add a RENDER_SAFE list or make radarModel its own tiny
   logic module).
2. Radar shows walls but not the detection meter / squad phase text — HUD
   cycle should add the alert-phase indicator so radar static is explained to
   new players ("why did my map break").
3. Radar overlaps nothing at 1280x720 but its 220px fixed width will collide
   with the HUD's item box on small windows — HUD cycle must define the
   overlay layout grid.

**3 delights:**
1. The jam is a mechanic, not a cosmetic: the model refusing to emit guard
   data during ALERT/EVASION means even a debug consumer can't cheat.
2. Deterministic static (xorshift on tickCount) — identical replays produce
   identical noise; the aesthetic obeys the determinism rule.
3. CAUTION widening on the radar cones mirrors guardAI's real perception
   constants — the map never lies about what guards can see.

## Cycle 10 (render layer — GAME IS PLAYABLE; release v0.10)

63/63 tests; 9/9 scenarios; 3/3 screenshots inspected by eye (title, patrol
with wall-clipped green cone, alert with red cone + meter). THREE isolated to
render.js (grep-verified). Release snapshot releases/v0.10.html + PLAYME.md
regenerated.

Playtest (real one, via screenshot driving + scripted keys):

**3 problems:**
1. PATROL cone at alpha 0.18 additive is too faint against the dark floor —
   the Readability centerpiece shouldn't need squinting. Bump alpha/brightness
   or add a cone edge line. → backlog (polish, top).
2. State markers ("?"/"!") and the detection meter are tiny at this camera
   scale — at 720p they're a few pixels. Scale sprites by frustum size.
   → backlog (polish).
3. Camera is near-vertical tilted top-down, not the diagonal MGS isometric;
   subagent chose it deliberately (wall overlap at 40×30 aspect). Defensible
   but drifts from SPEC's "locked isometric" — revisit with the peek-rotation
   feature; keep an eye on it. → backlog (design note).

**3 delights:**
1. Cones honestly hug walls per-frame (24 raycasts/guard) — what the guard
   sees and what the fan shows can never disagree. Readability pillar, kept
   honest by geometry.
2. Cold-boot file:// double-click → 63 tests → title → playable, all in one
   196KB file with zero external assets beyond the THREE CDN tag.
3. The knock lure works with real keyboard input exactly as the headless
   scenario predicted — sim.js and the browser agree on reality.

## Cycle 9 (soundEvents + engine noise/knock wiring)

63/63 tests; 9/9 scenarios; screenshot clean. Wall attenuation counts wall
entries analytically (unclamped slab t in (0,1) per wall) — no raycast
marching, no epsilon traps. Knock is edge-triggered and wall-adjacent only.
Sharp sounds (knock/dart/bodyDrop/locker) = strong stimulus; movement = faint.

The classic MGS beat now passes as a machine-checked scenario: knock on the
container, guard INVESTIGATEs within 2s, player crawls past through the dark
zone, squad never leaves INFILTRATION. And its mirror: one wall between
source and guard kills a knock just beyond attenuated radius.

**3 problems:**
1. Movement noise re-emits every tick while moving — hearNoise("faint") spam
   is absorbed by SUSPICIOUS refresh semantics today, but INVESTIGATE-grade
   soft sounds (future: running on metal floors) would re-stimulate mid-search
   constantly. Needs a per-guard stimulus cooldown when that lands. → backlog.
2. Guards never emit sounds themselves (footsteps) — player has no audio
   awareness of off-screen guards until music/audio cycle. Radar mitigates
   first; note for music cycle (positional footstep synth). → backlog well.
3. sim lure scenario is seed-tuned and route-brittle (documented by the
   subagent) — survives layout guards but not big redesigns. Waypoint-follow
   helper item already on backlog; raise its priority when zones multiply.

**3 delights:**
1. Toybox pillar has its first machine-verified unscripted-story primitive:
   sound × FSM × level geometry composing into a working lure.
2. The engine event stream now carries knock + noiseHeard — radar/HUD get
   "visualize what guards perceive" (Readability pillar) for free.
3. Analytical wall counting is exact and O(walls) — no pathological cases,
   no iteration caps, and it reuses the same closed-edge convention as
   collision, so sound and sight can never disagree about geometry.

## Cycle 8 (engine: fixed-timestep orchestrator)

54/54 tests; 7/7 scenarios; screenshot clean (54/54 in-browser). Perf gate:
~0.031ms/tick with 10 guards (budget 4ms). Smoke test is now a named,
permanent gate. Subagent caught a real event-ordering bug mid-build: phase
snapshots must be taken BEFORE guard updates (broadcastAlert fires inside
guard.update), else phaseChange events are silently swallowed.

**3 problems:**
1. Vision staggering deferred honestly (guardAI owns its computeSight with no
   skip hook). Perf says we don't need it yet; revisit if guard counts grow or
   zones get wall-heavy. → backlog (engine+guardAI joint change).
2. engine.events is cleared each tick — consumers must drain synchronously.
   Fine for render/music reading post-tick; document loudly when those land.
3. The infiltration sim scenario steers by hardcoded segments — brittle if the
   Loading Dock layout changes. Acceptable (leg-clearance test protects the
   route), but a tiny waypoint-follow helper for scenarios would cut future
   scenario-authoring cost. → backlog (S, harness).

**3 delights:**
1. The whole game now runs through ONE sanctioned loop — sim scenarios, tests,
   and the future render layer all drive the identical tick order.
2. Determinism proven at the engine level: same seed + same input log →
   byte-identical snapshot JSON after 600 ticks. Replays are now a fact.
3. 0.031ms/tick means the perf budget has ~130x headroom before staggering or
   optimization is even a conversation.

## Cycle 7 (bugfix: boot self-test parity)

`node build.js && node test.js` 47/47; `node sim.js` 6/6; screenshot verified
by eye: in-browser gate now reports 47/47 (was 3/3). build.js bundles
tests/**/*.js wrapped in an IIFE shadowing `global` → window; boot.js is
appended last so it gates after all registrations. game.html now 126KB.

**3 problems:**
1. Artifact size will grow linearly with the test corpus (tests ship in the
   deliverable by mandate). Fine at 126KB; if it ever matters, minify-comments
   at build time — NOT test exclusion. → note only.
2. In-browser suite includes the 10800-tick regression walk — boot cost is
   still imperceptible, but boot time should be watched at the cycle-20 audit.
3. Stale "v0.0 — nothing to play yet" line remains (separate backlog item;
   real title screen arrives with the render cycle).

**3 delights:**
1. The architecture mandate ("same suite runs in-browser") is now literally
   true — a bad CDN copy of Three or a browser-only quirk gets caught at boot.
2. IIFE-shadowing `global` needed zero changes to any test file — the node
   test pattern was browser-compatible by accident of discipline.
3. The screenshot loop caught this bug and verified the fix — the every-5-
   cycles eyeball rule pays for itself.

## Cycle 6 (guardAI part B: ALERT/EVASION/CAUTION + squad)

`node build.js && node test.js` 47/47; `node sim.js` 6/6. 9 new tests, 2 new
scenarios incl. the full ladder (seen → converge → sweep → caution → patrol
within 90s of lost contact).

Build subagent caught and fixed a real transition bug: ALERT pinned the meter
at 1.0, which instantly re-tripped EVASION's escalation threshold on the very
tick contact was lost — the squad bounced ALERT↔EVASION forever. Fixed by
zeroing the meter on ALERT→EVASION (documented inline).

**3 problems:**
1. The squad.tick(dt, anyLOS) wiring lives only in sim scenarios — every
   consumer must remember to call it after guard updates. The engine module
   must own this loop; until then it's a footgun. → engine cycle (next).
2. ALERT guards "arrest" at 2m and just hold — no consequence beyond proximity.
   Player HP/game-over needs items/HUD cycles; until then alerts are toothless
   drama. → acknowledged sequencing, not a bug.
3. Reinforcements (max +3 at zone door) and the 40s radio check-in mechanic
   are still unbuilt (director module). The ladder de-escalates a bit cleanly —
   nobody comes looking for a missing buddy. → director cycle.

**3 delights:**
1. The meter-bounce bug is exactly the class of thing sim.js exists for — an
   imagined playtest would have shipped it. The harness is earning its keep.
2. Staggered EVASION sweeps via deterministic id-hash offsets: two guards at
   the same last-known-position fan out instead of staring the same way.
   Free emergent competence.
3. CAUTION guards finishing a noise INVESTIGATE before resuming caution patrol
   (live-checked against squad.phase, not latched) — small, but it's the
   difference between an FSM and an actual organization.

## Cycle 5 (bugfix: waypoint route through guard hut)

`node build.js && node test.js` 38/38; `node sim.js` 4/4. Route rerouted to a
perimeter loop with verified ≥0.6m clearance; leg-clearance sanity test added
(samples every 0.25m at r=0.6 + raycast per leg, wrap-around included); first
regression test landed: a real guard walks the real loop for 180s and must
visit all 4 waypoints without leaving PATROL.

**3 problems:**
1. The fixed loop hugs the perimeter (y=2/27, x=3/37) — the yard interior is
   now unpatrolled, so the center weave route may be tension-free. Revisit
   when radar lands and coverage is visible; likely wants a 5th mid-yard
   waypoint (clearance test will catch bad placement now). → backlog.
2. Leg-clearance test uses r=0.6 while guards are r=0.4 — good margin, but the
   0.6 constant is duplicated in test and route design informally. Acceptable;
   note only.
3. Regression test costs 10800 simulated ticks (~instant in node today) —
   watch total test-suite wall time as regressions accumulate; budget check at
   the cycle-20 audit.

**3 delights:**
1. The bug became three permanent artifacts: fixed data, a stricter invariant
   for EVERY future zone, and a full-stack regression walk. Classic ratchet.
2. Error messages in the leg test name the leg and coordinates — future zone
   authoring failures will be self-explaining.
3. Haiku handled the whole packet cleanly on numbers alone — cheap-model
   delegation for data+scaffold work is validated.

## Cycle 4 (guardAI part A: PATROL/SUSPICIOUS/INVESTIGATE)

`node build.js && node test.js` 36/36; `node sim.js` 4/4 (first 3 real
behavior scenarios). 8 new guardAI tests.

Playtest (sim-backed this time — knock scenario, lost-contact scenario, 120s
mixed run all pass against the real FSM):

**3 problems:**
1. **REAL BUG FOUND (by build subagent): loadingDock waypoint leg NW(4,5)→
   NE(36,5) passes through the guard-hut wall (9,3,6x5).** A no-pathfinding
   guard wedges at x≈8.6 forever. Zone sanity test checks waypoints are in
   open floor but NOT that consecutive legs are raycast-clear. → TOP of
   backlog (bugfix, cycle 5): fix waypoint route + strengthen sanity test +
   regression test.
2. ALERT is a placeholder (stand still, meter pinned, no exit) — fine mid-
   bootstrap, but the game is unlosable and unwinnable until part B. → next
   feature cycle.
3. Guard walks the SUSPICIOUS stare with zero body movement — stopping dead is
   readable but a small step toward the stimulus (MGS lean) would sell it.
   → polish backlog.

**3 delights:**
1. The knock scenario works end to end: hearNoise("strong") at t=1s →
   INVESTIGATE by t≤3s → arrival at the knock point. The core MGS loop exists.
2. Determinism test: two identically-seeded guards trace identical (x,y,state)
   over 600 ticks — replay debugging is real from day one.
3. MAX_STATE_S enforced by a thrown Error inside update() — a stuck guard can
   never ship silently; the 120s mixed run leans on it as a live invariant.

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
