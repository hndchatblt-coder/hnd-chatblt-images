# BACKLOG.md

Format: `title | category | size S/M/L | pillar | acceptance criteria`
Top of backlog follows the fixed bootstrap order until the win state + rank screen
ships; only after that does normal prioritization (feature → bugfix → polish →
content rotation) take over. L items must be split before selection.

## Bootstrap order (fixed — one item per cycle, tested before the next)

1. ~~Boot + tests~~ DONE cycle 0.
2. ~~World: one zone, walls, collision~~ DONE cycle 1.
3. ~~Player movement set~~ DONE cycle 2.
4. Vision: one guard, cone, detect meter | feature | M | Tension | 70° 14m cone, raycast vs walls, fill-meter detection with stance/darkness modifiers; staggered per tick; tests for occlusion + modifier math.
5. GuardAI: full FSM | feature | L→split | Tension | PATROL→SUSPICIOUS→INVESTIGATE→ALERT→EVASION→CAUTION→PATROL per SPEC timings; split into (a) PATROL+SUSPICIOUS+INVESTIGATE, (b) ALERT+EVASION+CAUTION+convergence before selection.
6. SoundEvents | feature | M | Toybox | emit radii per SPEC; wall attenuation 50%/wall; guards receive stimuli; knock verb; sim asserts guard INVESTIGATEs a knock within 2s.
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
- Stance transition timers | polish | S | Readability | crouch↔crawl↔stand take real time (e.g. 0.25s), blocking visionProfile strobing; test asserts profile changes only after the timer.
- Decide wall-scrape noise semantics | polish | S | Readability | `player.moving` is intent-based; once soundEvents lands, decide whether pushing a wall emits noise and document + test the choice.
- Exit-approach cover in Loading Dock | polish | S | Expression | revisit after vision lands: if the final 6m to the exit is a flat dash under a cone, add a crate or darkZone near the gap.

## Post-bootstrap wells (refill source — see CLAUDE.md)

- sewer/heliport/freezer zones, patrol-mech boss, sniper duel, European Extreme,
  VR Missions, NG+, heavies/dogs, rain, photo mode, codec easter eggs, speedrun
  timer, colorblind radar palettes.
