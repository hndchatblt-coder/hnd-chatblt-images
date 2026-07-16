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
10. Remaining zones | content | L→split | Expression | ~~Warehouse~~ DONE cycle 15. Next: (a) Laboratory (cameras + laser sensors + keycards L1-L3 — needs camera entity in guard/vision system first), (b) Comms Tower (heavy patrols, finale).
10b. Departed-zone state persistence | feature | M | Consequence | stash squad/guard state per zone on exit, restore on re-entry (alerted zones stay hot); replaces v1 discard semantics; determinism preserved.
11. ~~Items/CQC/tranq~~ DONE c16-c19 (throw variant + guard box-memory spun off as separate items below).
- Per-guard box memory | feature | S | Tension | a guard who saw the box move stays suspicious of it (extraMult 0.5 not 0.05 for that guard, decays with CAUTION).
- Radar hidden/dragging states | polish | S | Readability | radarModel gains playerHidden/dragging; player triangle dims in locker (packet omission from c18).
- Locker checks during EVASION | feature | S | Tension | hiding mid-EVASION is dominant; guards sweeping in EVASION open nearby lockers (discovery → ALERT).
- CQC throw variant | feature | S | Expression | hold Q: throw (2m, 5s stun, 6m thud) vs tap choke — risk/reward choice.
- Aim line while F held | polish | S | Readability | faint ray preview so ranged darts are judgeable.
- Hit flash / damage feedback | polish | S | Readability | brief red flash or player flinch on playerHit event in render.js.
- Death sting | polish | S | Tension | music one-shot on gameOver event.
12. Codec | feature | M | Toybox | overlay, two procedural pixel portraits, scrolling text + blips, frequency dial; calls: mission open, first body, first alert, low darts.
13. SaveState | feature | S | Consequence | serialize/restore full sim state; deterministic resume proven by replay test.
14. Win state + rank screen | feature | M | Consequence | extract from Comms Tower roof; rank on time/alerts/kills/darts; BIG BOSS for no-alert no-kill.

## Audit findings (cycle 20 — fresh-eyes review; full report in TESTLOG)

- ~~A1: box doesn't gate fire/CQC~~ FIXED cycle 21 (regression test in tests/regressions/).
- A2: ration/chaff ungated while hidden/dragging | bugfix | S | Readability | decide semantics explicitly (ration-always-ok may stand), document, test.
- A3: engine contract block missing gameOver/inventory/chaffUntil | polish | S | Readability | fold the last 4 cycles' props into the canonical list.
- A4: chaff has no HUD slot + dangling "see BACKLOG" comment | polish | S | Readability | show chaff count; fix comment.
- A5: radar blind to hidden/dragging (dup of existing item — merged) | polish | S | Readability.
- A6: "box camp" sim scenario name says crawl, tests stand+move | bugfix | S | — | rename or add crawl leg (append-only: extend, don't weaken).
- A7: 5 duplicated distance/angle helpers across modules | polish | M | — | acceptable per module-local-math mandate BUT document the invariant; consider tests asserting cross-module agreement instead of merging.
- A8: noise radii triplicated (player.js locals, SOUND.RADII, test literals) | bugfix | S | Toybox | make player read Game.SOUND.RADII (load-order safe) or add a cross-check test binding them.
- A9: 13/15 event types unconsumed in production | note | — | expected (codec/audio consumers pending); recheck at cycle 40 audit.
- A10: drag-follow bypasses wall collision | bugfix | S | Consequence | route dragged body through moveCircle or clamp; corner-drag regression test.
- A11: SPEC states reinforcements + radio check-ins as fact; unbuilt | polish | S | — | annotate SPEC with (director module, pending) hedges — SPEC stays the target, but no silent contradiction.
- A12: LOGIC_ORDER never extended; 6 test files carry self-require boilerplate | polish | S | — | add hud/radar/music to test.js LOGIC_ORDER, drop the guards.

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
