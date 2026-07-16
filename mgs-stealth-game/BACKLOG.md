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
6b. Render layer: minimum playable | feature | M | Tension | src/render.js (ONLY module touching THREE): isometric camera per SPEC, boxes-for-walls Loading Dock, player+guard meshes with facing, dark-zone floor tint; boot.js starts engine loop + keyboard input (WASD run/crouch/crawl/knock) behind the title screen; screenshot scenes expand to 3 (title, in-game, alert); THE GAME BECOMES PLAYABLE THIS CYCLE.
7. Radar | feature | M | Readability | top-right soliton radar: walls, player, guards + live cones; static during ALERT/EVASION; canvas-drawn, gorgeous.
8. HUD | feature | S | Readability | life top-left, item box bottom-right, weapon box bottom-left, alert-phase indicator, zone name cards.
9. Music | feature | M | Tension | WebAudio state machine sneak→sting→combat→evasion→caution→resolve, crossfades only, failure-isolated no-op wrapper.
10. Remaining zones (Warehouse, Laboratory, Comms Tower) | content | L→split | Expression | one zone per cycle; zone transitions; cameras + lasers + keycards in Lab; heavy patrols in Tower.
11. Items/CQC/tranq | feature | L→split | Expression | box, tranq pistol (12 darts, sleep 60s, headshot instant), CQC grab→choke/throw, drag bodies, lockers (stuff + hide), ration, chaff; split per verb-group.
12. Codec | feature | M | Toybox | overlay, two procedural pixel portraits, scrolling text + blips, frequency dial; calls: mission open, first body, first alert, low darts.
13. SaveState | feature | S | Consequence | serialize/restore full sim state; deterministic resume proven by replay test.
14. Win state + rank screen | feature | M | Consequence | extract from Comms Tower roof; rank on time/alerts/kills/darts; BIG BOSS for no-alert no-kill.

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
