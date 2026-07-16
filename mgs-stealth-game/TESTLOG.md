# TESTLOG.md

## Cycle 26 (codec)

175/175; 18/18; 4/4 shots (new 04-codec inspected by eye — the portraits
read as faces: stern grey-olive COMMANDER, balaclava'd OPERATIVE). Pure
director with one-shot priority-queued triggers (missionOpen/firstAlert/
firstBody/lowDarts) consuming real engine events — A9's write-only event
stream now has a production consumer. Engine freezes during calls; type-in
runs off local rAF time; blips via isolated warn-once WebAudio; game-over
force-dismisses the codec.

**3 problems:** (1) codec pause is a free tactical timeout — MGS pauses too,
so authentic, but firstAlert popping DURING a chase freezes the action mid-
adrenaline; consider deferring non-critical calls until phase cools. →
backlog (Tension). (2) only 4 calls; frequency dial input (manual dialing,
easter eggs) not built. → backlog well. (3) screenshot scenes 02/03 now need
dismissal choreography — scene setups are getting long; acceptable, watch
complexity.

**3 delights:** (1) the mirrored-half seeded pixel faces came out genuinely
charming — ASCII-sanity-checked before canvas. (2) MEI's body-disposal call
firing off your first tranq teaches the drag/locker mechanic exactly when
relevant. (3) model/view split means every trigger is testable without a
single DOM call.

## Cycle 25 (Comms Tower — the facility is complete)

166/166; 18/18; screens clean. Finale zone: hollow core stairwell with ring
corridor, 4 interlocking patrol loops (perimeter/core/east/west, 2m seams),
2 wide-sweep searchlight cameras (100°), laser on the final approach, 4 dark
zones, extraction stub at the helipad. The capstone scenario — dock →
warehouse → lab → tower, real guards/cameras/lasers all the way, ZERO alerts
— passes. KNOWN_STUBS maintenance: commsTower resolved, extraction is the
live stub (repoint-don't-weaken, same documented pattern).

Notable route findings (documented in scenario header): camera sweep angle
STACKS with FOV (staying outside the base cone is not safety); the lab's
east-wing camera has no geometric dodge — the intended counter is the bonus
chaff. The tower run needed real tool use, not just routing. Tension pillar
delivering.

**Gaps ledgered:** ration pickup is data-only (items.collectPickup doesn't
know "ration" — items.js out of scope this packet) → next small cycle.

**3 delights:** (1) a zero-alert full-facility ghost run exists and is
machine-checked — the game's core promise, proven every test run. (2) 4-zone
facility with 9 guards, 7 cameras, 3 lasers, all data-driven. (3) the sim
bot keeps doing level QA — camera/sweep stacking was discovered by a failing
scripted route, not by a player.

## Cycle 24 (Laboratory: doors, keycards, lasers)

158/158; 17/17; screens clean. Keycard-gated progression (L1 found in the
warehouse dark zone → L1/L2/L3 doors → commsTower stub), dynamic door
blockers in world (walls-equivalent when closed), engine owns door policy
(proximity auto-open, 3s auto-close), duty-cycle lasers (box doesn't save
you, chaff doesn't help, locker exempt), 3 cameras, 2 guards whose loops
never cross locked doors.

**TEST UPDATES (premise expiry, ratchet rule 2):** tests/zones.test.js's
stub assertions were hardcoded to "laboratory doesn't exist" — now it does.
Replaced with a KNOWN_STUBS allowlist of equal strictness (typo'd `to` still
fails; stub branch still must be exercised — now via commsTower). One sim
route's arrival check corrected from coincidental rect-match to zone-id.
Verified by diff.

**HONEST GAP (ledgered by builder in BACKLOG):** closed doors are
acoustically transparent — soundEvents iterates zone.walls and can't see
door blockers without modification (that file was out of packet scope).
Movement/LOS correctly blocked; only sound-radius math misses doors. Also:
collected chaff pickups keep glowing (no exposed collected flag).

**3 delights:** (1) the lab run scenario threads pickup → badge → laser
timing in one machine-checked route. (2) wall B moved to x=24 because the
scripted playtest found a corner pinch — the sim bot is doing level QA now.
(3) lasers as pure time functions: replay-identical, no state.

## Cycle 23 (security cameras + director module born)

144/144; 16/16; screens clean. Sweeping wall-mounted cameras (sinusoidal pan
off engine.time), same vision math as guards, same perception-wrapped player
(box/locker rules apply identically — director never sees the wrapping),
chaff freezes them, radar + render show live cones. Key wiring: cameras
never feed anyLOS — they tip the squad (broadcastAlert + live lastKnown
refresh) but guards must physically come confirm; ALERT decays to EVASION on
schedule even under a watching camera. Pure MGS.

**3 problems:** (1) camera meters aren't visible to the player — you can't
tell how close a camera is to spotting you (guards have the over-head meter);
add camera meter arc on the radar/cone color ramp → backlog. (2) live camera
keeps refreshing lastKnown during EVASION — sweep converges on your ACTUAL
hiding spot if you hide in a watched aisle; brutal but maybe too punishing
without a visible cue; watch in playtests. (3) warehouse now has 2 guards + 2
cameras — dock→warehouse difficulty step is steep; consider 1 camera at the
dock (tutorializes cameras) → backlog (content).

**3 delights:** (1) the chaff-window crossing scenario is a real puzzle
speedrun — 15s to cross two watched intersections. (2) cameras reusing the
guard perception wrapper meant box/locker Just Worked with zero new gating
code. (3) director.js is born with a clean contract for reinforcements +
check-ins to move into.

## Cycle 22 (bugfix batch: audit A6, A8, A10)

137/137; 15/15; screens clean. A6: scenario renamed truthfully + new crawl
scenario (confirmed: moving while boxed = 1.0 profile regardless of stance —
design feature, now documented by test). A8: cross-check regression binds
player noise radii to Game.SOUND.RADII without merging the mandated module-
local constants. A10: dragged bodies now slide along walls via moveCircle +
320-tick corner-drag regression.

Audit scoreboard: A1, A6, A8, A10 closed. Remaining: A2-A5, A11, A12 (docs/
polish tier), A7/A9 (watch items).

## Cycle 21 (bugfix: audit A1 — box gates fire/CQC)

135/135; 14/14; screens clean. Fire and CQC now blocked while boxed (busy
event, mirrors drag gating); knock/ration/chaff stay allowed; interaction
matrix documentation extended; 4-assertion regression test in
tests/regressions/. The audit's top finding closed within one cycle.

Problems/delights: minimal cycle by design — one bug, one gate, one
regression test. Delight: the busy-event pattern absorbed a third consumer
without modification.

## Cycle 20 (AUDIT — no building)

Fresh-eyes Sonnet audit of the whole repo at HEAD 8d485bb (131/131, 14/14
green, clean tree). 12 findings → BACKLOG as A1-A12. Highest: the cardboard
box does not gate fire/CQC (verified by live repro — you can snipe from
inside the disguise); ration/chaff similarly ungated; engine contract block
drifted (missing gameOver/inventory/chaffUntil); a sim scenario name claims
crawl but tests stand+move; noise radii exist in triplicate; drag-follow
bypasses wall collision.

Clean bill: zero THREE leaks, zero import/export, zero Math.random/Date
outside the sanctioned perf-test shim, no double-loading between node and
browser loaders, both prior ratchet-rule-2 test replacements verified
stricter, no cross-test state coupling.

Verdict (auditor's words): "unusually disciplined... the rot found is
concentrated exactly where the newest surface hasn't had its edges squared
— all backlog-shaped, not fire-shaped."

Next cycles: A1 (box/fire gate) leads as bugfix; A6+A8+A10 batchable as a
small-fixes cycle; A3/A4/A11/A12 as a docs/harness polish cycle.

## Cycle 19 (box, ration, chaff — item set complete)

131/131; 14/14; screens clean. Box: 0.05 flat profile stationary, 1.0 the
instant you move (blown-if-seen-moving per SPEC), 0.55 speed cap, mutually
exclusive with drag/locker via one gate. Ration: +0.35 hp, 3 carried. Chaff:
15s radar jam (distinct blue CHAFF static vs alert static), pop emits 4m
sharp noise — the tradeoff is the point. Camera hook documented for the Lab.

**TEST REPLACEMENTS (ratchet rule 2):** hudModel.item became {RATION, count}
— made the item-placeholder assertions factually false in tests/hud.test.js
(1) and tests/cqc.test.js (3, outside the packet's file list — the agent
flagged the overrun honestly; replacements verified by diff to be stricter,
constant-driven, inline-documented). Pattern identical to cycle 17's weapon
box. No other assertions touched.

**3 problems:** (1) placeholder-shape assertions keep breaking as features
fill them — tests asserting "not yet implemented" are time bombs; audit
should flag any remaining placeholder assertions for preemptive replacement.
(2) box has no wear/blow state — once seen moving, toggling B off/on resets
suspicion cleanly; consider a per-guard box memory (backlog, Tension).
(3) chaff currently only jams radar — no cameras exist; its 2 charges are
weak value until the Lab. Sequencing note, not a bug.

**3 delights:** (1) the interaction matrix (box/drag/locker mutually
exclusive through two gates) stayed simple because each verb was built on
the same edge-trigger scaffold. (2) blue CHAFF static vs red ALERT static —
the radar now explains WHY it's broken. (3) box camp scenario: a guard cone
sweeps a stationary box at 6m and walks on — pure MGS.

## Cycle 18 (CQC, drag, lockers)

117/117; 13/13; screens clean. CQC from behind (>100° off guard facing,
blocked during ALERT) reuses the sleep path; drag scales move input 0.55 with
the body trailing 0.9m; one G key drives attach/release/stuff/hide/exit via
a priority function; stuffed bodies exempt from colleague discovery; hidden
players gated by a decoy-position substitution (guardAI/vision untouched).
Waking stuffed guards step out into INVESTIGATE.

**3 problems:** (1) radar doesn't reflect hidden/dragging (radar.js wasn't in
the task packet's allowed list — my packet omission, honestly skipped by the
agent) → next polish cycle. (2) CQC throw variant deferred (choke==sleep v1)
— fine, but Q has no risk/reward choice yet. (3) decoy-substitution hides the
player from FIRING too — correct today (guards can't fire outside ALERT and
you can't enter a locker during ALERT... verify: you CAN hide during EVASION;
a guard regaining LOS on the locker spot sees nothing — intended, but EVASION
hide-in-locker is now dominant; needs a discovery counter (guards checking
lockers in EVASION) → backlog (Tension).

**3 delights:** (1) the cleanup loop (dart → drag → stuff → other guard walks
the lane obliviously) passes machine-checked — evidence management is real
gameplay now. (2) one context key for the whole body pipeline feels right in
hand. (3) decoy approach: two modules learned a feature existed without one
line of their code changing.

## Cycle 17 (tranq pistol + sleeping guards)

104/104; 12/12; screens clean (weapon box: TRANQ x12). Ray-clip aiming with
0.5m tolerance, headshot = hit while squad not in ALERT (instant sleep),
ALERT hits stagger 3s, 60s sleep → wake into self-INVESTIGATE, colleague
body-discovery (0.6 profile, 10m, 0.5s confirm) → ALERT at the BODY's
position. items.js is engine-agnostic (computes, never mutates).

**TEST REPLACEMENT (ratchet rule 2 ledger entry):** tests/hud.test.js's
fresh-engine assertion expected the weapon PLACEHOLDER ({---, null}) — a
premise made factually false by this cycle's contract (hudModel.weapon =
{TRANQ, darts}). Replaced by a STRICTER assertion (exact name + exact
STARTING_DARTS constant), reasoning documented inline in the test file.
No other test touched.

**3 problems:** (1) sleeping guards can't be moved yet — a body in a patrol
lane is a guaranteed discovery with no counterplay until CQC/drag (next
cycle). (2) no aim indicator — firing along facing is hard to judge at range;
consider a faint aim line while F held → backlog polish. (3) waking guards
resume PATROL after their self-search — a guard who was darted mid-alert
wakes amnesiac; acceptable v1, tie to zone-state persistence item.

**3 delights:** (1) body-found alerts point at the body, not the player —
guards converge on evidence while the player is elsewhere; produces genuine
misdirection stories. (2) dart-impact noise makes a MISSED shot a lure —
failure has gameplay value (Toybox). (3) the ghost run scenario (dart the
dock guard, cross two zones, zero alerts, 11 darts left) is the fantasy of
the whole game in one machine-checked assert.

## Cycle 16 (combat: hp, guard fire, game over)

95/95; 11/11; screens clean; restart flow verified live (die → MISSION
FAILED → Enter → fresh run). Guards fire in ALERT only: 0.6s grace, 1.5s
cadence, hit chance 0.75 halved by moving and halved by crouch/crawl
independently. Gunshots emit 10m noise other guards hear. hp carries across
zone transitions (no door-heal). Engine freezes on gameOver.

Interesting find by the build agent: crouched+stationary and standing+moving
are mathematically identical hit chances (0.375) — the planned test was a
guaranteed tie; replaced with crouched+moving vs standing+moving which has a
real margin. Documented in combat.test.js.

**3 problems:** (1) no damage feedback in render (no flinch/flash) — player
hp only visible in the LIFE bar; hit-flash → backlog (polish). (2) guards
never reload/flank — sustained ALERT is stand-and-shoot; fine for v1, note
for guard-variety well. (3) death by drained hp mid-EVASION can feel abrupt
with no music cue — death sting → music backlog.

**3 delights:** (1) MISSION FAILED at 0hp makes every earlier system suddenly
matter — dark zones, crouching, breaking LOS are survival now, not style.
(2) the accuracy model rewards exactly the verbs the game teaches. (3) the
firefight-survival scenario proves recoverable-chaos (Consequence pillar) end
to end: get shot, flee, outlast the ladder, live.

## Cycle 15 (Warehouse zone + transitions)

87/87; 10/10 (incl. two-zone unseen round trip); screenshots clean. Facility
is multi-zone: exits[]/entrances{} schema (zone.exit kept as live alias),
INFILTRATION-gated transitions, fresh-rebuild v1 semantics, rng stream
preserved across zones (cross-zone determinism proven by test).

**3 problems:**
1. Departed-zone guard/squad state is discarded — alert a guard, leave,
   return: he's forgotten everything. Acceptable v1; persistence is a real
   feature (per-zone state stash) → backlog (M, Consequence).
2. Player object is rebuilt on transition because player.js binds world at
   construction — hp/inventory will need careful copying when they exist;
   fragile spot, flag for the items cycle.
3. "Verticality" from SPEC interpreted as aisle-maze density (2D sim can't do
   catwalks). Deliberate scope call — SPEC drift noted here so the audit can
   challenge it.

**3 delights:**
1. Zone-change gating on INFILTRATION means you can't flee mid-alert —
   EVASION must be survived, not skipped. Consequence pillar, enforced by
   one condition.
2. The generalized leg-clearance test now sweeps EVERY loop in EVERY zone —
   cycle-5's bug class is extinct by construction.
3. Warehouse w2 guard sweeping the center aisle while w1 walks the perimeter
   creates natural pincer moments with zero scripting.

## Cycle 14 (music)

79/79; 9/9; screenshots clean. Pure director (track/sting/resolve semantics
fully tested, incl. real-engine ladder: exactly one sting + one resolve) +
lazily-built WebAudio beds crossfaded 1.5s, one-try/catch permanent-no-op
isolation. AudioContext constructed inside the Enter gesture's call stack.

**3 problems:** (1) can't hear it in CI — audio quality is unverified by
machine; needs a human ear pass (FEEDBACK.md request). (2) beds run forever
once started — node counts modest but battery cost on laptops unknown; consider
suspending silent beds. (3) no volume control / mute key — players will want
M to mute. → backlog both.

**3 delights:** (1) the "!" sting fires from the same squad transition that
jams the radar and pops the banner — one source of truth, three senses.
(2) resolve motif on CAUTION→INFILTRATION rewards surviving the ladder.
(3) audio noise buffers use a local xorshift, honoring determinism even
where it's only aesthetic.

## Cycle 13 (polish: cone/marker readability)

74/74; 9/9; shots eyeballed. Cone fills brightened + LineLoop rims from the
same raycast-clipped fan vertices; markers doubled; meter 2x; SUSPICIOUS now
distinctly amber. Green→amber→orange→red progression obvious at 720p.

**3 problems:** (1) player facing wedge nearly invisible at this scale —
minor, fold into next render pass. (2) cone rim z-nudge (0.005) may shimmer
on other GPUs — watch in future screenshots. (3) no visual for knock (sound
ripple) — players can't see their own noise; Readability gap → backlog.

**3 delights:** (1) rim reuses exact fan vertices — outline can never
disagree with fill. (2) meter pixel-sampled to match meterColor(1) — the
subagent verified color truth, not just presence. (3) alert scene is now
genuinely dramatic: red cone + "!" + banner + jammed radar all say RUN.

## Cycle 12 (HUD)

74/74; 9/9; shots eyeballed — HUD complete (life/clock/alert count, phase
banner with countdowns, weapon/item boxes, zone card, detection vignette),
no radar collision, jam static now visually explained by the ALERT banner.

**3 problems:**
1. LIFE is a lie until player.hp exists — the bar always reads full. Items/
   combat cycle must land hp + damage (guards do nothing at arrest range).
2. Weapon/item boxes are placeholders — fine, but the layout grid is now
   informal knowledge across radar.js and hud.js margins. Audit should
   extract an overlay-layout constants block.
3. Zone card + phase banner both occupy top-center space — simultaneous
   display (zone entry during CAUTION) would overlap. Rare until multi-zone;
   fix with the zones cycle.

**3 delights:**
1. EVASION/CAUTION countdowns surfaced from squad timers — the de-escalation
   clock is now player-visible knowledge (Readability & Tension both).
2. hudModel forward-hooks (hp, weapon, item) mean items/combat cycles fill
   real data with zero HUD rework.
3. Detection vignette gives peripheral awareness without looking at the bar.

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
