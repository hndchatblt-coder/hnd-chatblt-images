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
6d. ~~Knock ripple visual~~ DONE cycle 33 (+ hit flash + death sting).
7. ~~Radar~~ DONE cycle 11 (chaff jam hook documented, wired when chaff lands).
8. ~~HUD~~ DONE cycle 12.
9. ~~Music~~ DONE cycle 14 (needs human ear pass — see FEEDBACK request in TESTLOG).
9b. Mute key + volume | polish | S | Readability | M toggles mute (suspend master gain); persists in-session; title legend updated.
10. ~~Remaining zones~~ ALL DONE (Warehouse c15, cameras c23, Laboratory c24, Comms Tower c25).
- ~~Ration pickup collectible~~ FIXED cycle 29.
- ~~Camera meter visibility~~ DONE cycle 38.
- ~~Door acoustics~~ FIXED cycle 39 (closedDoorRects + regression suite).
- radar/render pickup glow: chaff has no exposed "already collected" flag | polish | S | Readability | src/radar.js's radarModel.pickups / src/render.js's pickup actors correctly stop glowing a collected KEYCARD pickup (checked against engine.inventory.keycards) but a collected "chaff" pickup has no equivalent persistent per-index flag exposed outside engine.js's own private PICKUPS bookkeeping, so its glow/card keeps showing after collection — cosmetic only (inventory.collectPickup itself is correctly idempotent-safe). Fix: expose a small collectedPickups snapshot off engine (or director) for the view layer to read.
10b. ~~Zone-state persistence~~ DONE cycle 34 (missingSearchers stash gap + build minification → audit-40 sweep items).
- Build-time comment minification | polish | S | — | game.html crossed 1MB; strip comments at build (never tests); measure savings.
11. ~~Items/CQC/tranq~~ DONE c16-c19 (throw variant + guard box-memory spun off as separate items below).
- Per-guard box memory | feature | S | Tension | a guard who saw the box move stays suspicious of it (extraMult 0.5 not 0.05 for that guard, decays with CAUTION).
- ~~Radar hidden/dragging states~~ DONE cycle 38.
- ~~Locker checks during EVASION~~ DONE cycle 35.
- ~~CQC throw variant~~ DONE cycle 37.
- ~~Q legend hint~~ DONE cycle 38.
- Aim line while F held | polish | S | Readability | faint ray preview so ranged darts are judgeable.
12. ~~Codec~~ DONE cycle 26 (frequency-dial input + easter-egg calls → wells).
- Defer non-critical codec calls while ALERT/EVASION | polish | S | Tension | firstBody/lowDarts queue until phase cools; firstAlert plays immediately (it's about the alert).
13. ~~SaveState~~ DONE cycle 27 (single-slot; multi-slot + codec-pause save edge + schema migration → backlog later).
14. ~~Win state + rank screen~~ DONE cycle 28. **BOOTSTRAP ORDER COMPLETE — normal rotation (feature → bugfix → polish → content) governs from here.**

- ~~Searcher-wedge crash~~ FIXED cycle 32 (wedge trackers + give-up; asymptotic edge case is a ledgered watch item).

## Audit findings (cycle 40 — full report in TESTLOG cycle 40)

- ~~B1/B2~~ FIXED cycle 41 (reunified reconstruction path + bookkeeping in saves).
- ~~B3~~ FIXED cycle 42 (1.19MB → 577KB).
- B4: wire cameraAlert/laserTripped/reinforcement into player feedback | polish | M | Readability | distinct sting/flash/radar-blip per event; remaining write-only events get documented rationale.
- B5: cqcThrow missing from verb-gating regression | bugfix | S | Readability | extend box-gates-combat/verb-gating tests: throw while boxed/hidden/dragging → busy.
- B6: cross-module math agreement test | polish | S | — (meta/tooling; see B12) | parametrized test asserting all distance/angleDiff impls agree.
- B7: asymptotic-wedge oscillation regression | polish | S | Consequence | build the oscillating-corner scenario the claim rests on.
- B8: missingSearchers gap — confirmed benign, stays documented (no action).
- B9: PROGRESS module-status table stale ~20 cycles | polish | S | Readability | sync or retire (changelog is the trusted ledger).
- ~~B10~~ FIXED cycle 43.
- B11: guard-bar vs camera-ramp dual encoding | polish | S | Readability | consider unifying; low priority.
- B12: pillar-citation discipline: add a "meta/tooling" lane to DESIGN.md or retrofit citations | polish | S | — | fix the constitution gap the audit found in the process itself.
- B13: loader-order parity unenforced (node vs browser module order differs; harmless today) | polish | S | — (meta) | add a test asserting no module reads sibling Game.* at load time, or align the orders.
- B14: chaff pickup collected-glow (dup of existing item; merged).

## Audit findings (cycle 20 — fresh-eyes review; full report in TESTLOG)

- ~~A1: box doesn't gate fire/CQC~~ FIXED cycle 21 (regression test in tests/regressions/).
- ~~A2~~ FIXED cycle 36 (ration always; chaff locker-gated; regression).
- ~~A3~~ FIXED cycle 30. ~~A4~~ FIXED cycle 30 (chaff HUD + regressions).
- A5: radar blind to hidden/dragging (dup of existing item — merged) | polish | S | Readability.
- ~~A6~~ FIXED cycle 22 (renamed + separate crawl scenario).
- A7: 5 duplicated distance/angle helpers across modules | polish | M | — | acceptable per module-local-math mandate BUT document the invariant; consider tests asserting cross-module agreement instead of merging.
- ~~A8~~ FIXED cycle 22 (cross-check regression test).
- A9: 13/15 event types unconsumed in production | note | — | expected (codec/audio consumers pending); recheck at cycle 40 audit.
- ~~A10~~ FIXED cycle 22 (moveCircle routing + corner-drag regression).
- ~~A11~~ FIXED cycle 30 (SPEC hedges). ~~A12~~ FIXED cycle 30 (loader unified).

## Graphics arc (added cycle 41 from human direction — weave into rotation after B1/B3)

- G1: Humanoid silhouettes | polish | M | Tension | guards/player as primitive-composed figures (torso/head/legs), walk-cycle bob, stance poses; screenshot-verified. The boxes→people step.
- G2: Procedural canvas textures | polish | M | Tension | floor grain, container ridges, per-zone palettes (dock rust, lab cold, tower night); zero external assets.
- G3: Lighting pass | polish | M | Readability | shadow-casting spotlights + darker ambient; dark zones as real shadow pools; keep cone honesty.
- G4: CRT post-effect | polish | S | Tension | scanlines + vignette shader quad; toggleable.
- G5: Peek camera rotation (SPEC) | feature | M | Expression | hold-key ~30° camera swing; revisits the top-down vs isometric drift.
- G6: Guard chatter bubbles (SPEC) | polish | S | Toybox | idle speech dots on PATROL.
- G7: Muzzle flash + tower searchlights | polish | S | Tension | later.

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
