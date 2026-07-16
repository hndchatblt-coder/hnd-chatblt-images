# BACKLOG.md

Format: `title | category | size S/M/L | pillar | acceptance criteria`
Top of backlog follows the fixed bootstrap order until the win state + rank screen
ships; only after that does normal prioritization (feature → bugfix → polish →
content rotation) take over. L items must be split before selection.

## Bootstrap order (fixed — one item per cycle, tested before the next)

1. ~~Boot + tests~~ DONE cycle 0.
2. ~~World: one zone, walls, collision~~ DONE cycle 1.
3. ~~Player movement set~~ DONE cycle 2.
4. ~~Vision~~ DONE cycle 3 (staggering deferred to engine cycle with guardAI).
5a. ~~GuardAI part A (PATROL/SUSPICIOUS/INVESTIGATE)~~ DONE cycle 4.
5b. ~~Waypoint route bugfix~~ DONE cycle 5.
5c. ~~GuardAI part B~~ DONE cycle 6 (reinforcements + radio check-ins → director module, below).
5d. ~~Engine module~~ DONE cycle 8 (vision staggering deferred — see below).
6. ~~SoundEvents~~ DONE cycle 9.
6b. ~~Render layer~~ DONE cycle 10 (v0.10 released).
6c. ~~Cone/marker readability~~ DONE cycle 13.
6d. Knock ripple visual | polish | S | Readability | expanding ring at knock point (world-space, ~0.5s) so players see their own sound radius; also faint ring for run footsteps every ~0.5s.
7. ~~Radar~~ DONE cycle 11 (chaff jam hook documented, wired when chaff lands).
8. ~~HUD~~ DONE cycle 12.
9. ~~Music~~ DONE cycle 14 (needs human ear pass — see FEEDBACK request in TESTLOG).
9b. Mute key + volume | polish | S | Readability | M toggles mute (suspend master gain); persists in-session; title legend updated.
10. ~~Remaining zones~~ ALL DONE (Warehouse c15, cameras c23, Laboratory c24, Comms Tower c25).
- ~~Ration pickup collectible~~ FIXED cycle 29.
- Camera meter visibility | polish | S | Readability | cone color ramps with camera meter (cyan→amber→red) so players see how close a camera is to confirming.
- soundEvents: attenuate through closed doors, not just walls | bugfix | S | Consequence | HONEST GAP from the Laboratory cycle — src/soundEvents.js's wallsBetween/effectiveRadius iterate `world.zone.walls` directly (see its own IMPLEMENTATION NOTE for why it can't reuse world.raycast in a marching loop) and have no notion of world.js's new dynamic door-blockers list, so a closed Laboratory door is currently ACOUSTICALLY TRANSPARENT — a knock/gunshot/footstep on one side attenuates as if the door weren't there (movement/LOS through it are still correctly blocked; only the sound-radius math misses it). Fix: thread a door-aware wallsBetween through soundEvents.js once that file is back in scope.
- radar/render pickup glow: chaff has no exposed "already collected" flag | polish | S | Readability | src/radar.js's radarModel.pickups / src/render.js's pickup actors correctly stop glowing a collected KEYCARD pickup (checked against engine.inventory.keycards) but a collected "chaff" pickup has no equivalent persistent per-index flag exposed outside engine.js's own private PICKUPS bookkeeping, so its glow/card keeps showing after collection — cosmetic only (inventory.collectPickup itself is correctly idempotent-safe). Fix: expose a small collectedPickups snapshot off engine (or director) for the view layer to read.
10b. Departed-zone state persistence | feature | M | Consequence | stash squad/guard state per zone on exit, restore on re-entry (alerted zones stay hot); replaces v1 discard semantics; determinism preserved.
11. ~~Items/CQC/tranq~~ DONE c16-c19 (throw variant + guard box-memory spun off as separate items below).
- Per-guard box memory | feature | S | Tension | a guard who saw the box move stays suspicious of it (extraMult 0.5 not 0.05 for that guard, decays with CAUTION).
- Radar hidden/dragging states | polish | S | Readability | radarModel gains playerHidden/dragging; player triangle dims in locker (packet omission from c18).
- Locker checks during EVASION | feature | S | Tension | hiding mid-EVASION is dominant; guards sweeping in EVASION open nearby lockers (discovery → ALERT).
- CQC throw variant | feature | S | Expression | hold Q: throw (2m, 5s stun, 6m thud) vs tap choke — risk/reward choice.
- Aim line while F held | polish | S | Readability | faint ray preview so ranged darts are judgeable.
- Hit flash / damage feedback | polish | S | Readability | brief red flash or player flinch on playerHit event in render.js.
- Death sting | polish | S | Tension | music one-shot on gameOver event.
12. ~~Codec~~ DONE cycle 26 (frequency-dial input + easter-egg calls → wells).
- Defer non-critical codec calls while ALERT/EVASION | polish | S | Tension | firstBody/lowDarts queue until phase cools; firstAlert plays immediately (it's about the alert).
13. ~~SaveState~~ DONE cycle 27 (single-slot; multi-slot + codec-pause save edge + schema migration → backlog later).
14. ~~Win state + rank screen~~ DONE cycle 28. **BOOTSTRAP ORDER COMPLETE — normal rotation (feature → bugfix → polish → content) governs from here.**

- **CRASH FIX (cycle 32, TOP): searcher wedge → invariant throw** | bugfix | S | Consequence | guards dispatched to unreachable positions (check-in bodies behind shelving) wedge until MAX_STATE_S throws in live gameplay. Fix: wedge detection in INVESTIGATE travel (no progress over ~2s) → abandon → return to patrol; keep the invariant throw. Regression test with a deliberately unreachable body using REAL warehouse w1/w2 placements.

## Audit findings (cycle 20 — fresh-eyes review; full report in TESTLOG)

- ~~A1: box doesn't gate fire/CQC~~ FIXED cycle 21 (regression test in tests/regressions/).
- A2: ration/chaff ungated while hidden/dragging | bugfix | S | Readability | decide semantics explicitly (ration-always-ok may stand), document, test.
- ~~A3~~ FIXED cycle 30. ~~A4~~ FIXED cycle 30 (chaff HUD + regressions).
- A5: radar blind to hidden/dragging (dup of existing item — merged) | polish | S | Readability.
- ~~A6~~ FIXED cycle 22 (renamed + separate crawl scenario).
- A7: 5 duplicated distance/angle helpers across modules | polish | M | — | acceptable per module-local-math mandate BUT document the invariant; consider tests asserting cross-module agreement instead of merging.
- ~~A8~~ FIXED cycle 22 (cross-check regression test).
- A9: 13/15 event types unconsumed in production | note | — | expected (codec/audio consumers pending); recheck at cycle 40 audit.
- ~~A10~~ FIXED cycle 22 (moveCircle routing + corner-drag regression).
- ~~A11~~ FIXED cycle 30 (SPEC hedges). ~~A12~~ FIXED cycle 30 (loader unified).

## Non-bootstrap items (from playtests)

- moveCircle substep guard vs wall tunneling | bugfix | S | Consequence | a single-tick displacement of any magnitude never crosses a wall; regression test with a 2m/tick displacement into a 1m wall. (Blocked-by-need: do before any dash/throw physics.)
- Vision staggering hook | polish | S | — engine+guardAI joint: guardAI accepts a precomputed sight result (or skip flag) so engine can stagger across guards; only needed if perf headroom shrinks (currently 130x). Cite: Readability (perf = frame stability).
- Scenario waypoint-follow helper | polish | S | Toybox | tiny shared steering helper for sim scenarios so scripted routes survive layout tweaks.
- Title screen version from PROGRESS | polish | S | Readability | boot.js hardcodes "v0.0 — nothing to play yet"; build.js should inject the real version string at build time.
- Mid-yard patrol waypoint | polish | S | Tension | perimeter-only loop leaves the center weave unwatched; add a 5th waypoint through the yard interior (leg-clearance test guards placement); check with radar once visible.
- Peripheral vision band | feature | S | Tension | 70–90° arc fills at half rate; tests for band edges. (Candidate — check readability cost first.)
- Per-guard fill multiplier | polish | S | Tension | Comms Tower heavies detect faster; plumb viewer.fillMult through computeSight.
- Stance transition timers | polish | S | Readability | crouch↔crawl↔stand take real time (e.g. 0.25s), blocking visionProfile strobing; test asserts profile changes only after the timer.
- Decide wall-scrape noise semantics | polish | S | Readability | `player.moving` is intent-based; once soundEvents lands, decide whether pushing a wall emits noise and document + test the choice.
- Exit-approach cover in Loading Dock | polish | S | Expression | revisit after vision lands: if the final 6m to the exit is a flat dash under a cone, add a crate or darkZone near the gap.

## Post-bootstrap wells (refill source — see CLAUDE.md)

- sewer/heliport/freezer zones, patrol-mech boss, sniper duel, European Extreme,
  VR Missions, NG+, heavies/dogs, rain, photo mode, codec easter eggs, speedrun
  timer, colorblind radar palettes.
