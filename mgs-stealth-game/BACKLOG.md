# BACKLOG.md

Format: `title | category | size S/M/L | pillar | acceptance criteria`
Top of backlog follows the fixed bootstrap order until the win state + rank screen
ships; only after that does normal prioritization (feature → bugfix → polish →
content rotation) take over. L items must be split before selection.

## Bootstrap order (fixed — one item per cycle, tested before the next)

1. Boot + tests | feature | S | Readability | `node build.js` produces game.html from src/; `node test.js` runs green with real assertions; game.html opens from file:// showing a title screen; boot self-test overlay blocks start on failure.
2. World: one zone, walls, collision | feature | M | Readability | Loading Dock defined as data; AABB wall collision; `world.isBlocked(x,y)` + raycast helper; unit tests for collision + raycast.
3. Player movement set | feature | M | Expression | walk/run/crouch/crawl with distinct speeds; collision-respecting movement; stance affects profile (for vision later); headless input-driven tests.
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

## Post-bootstrap wells (refill source — see CLAUDE.md)

- sewer/heliport/freezer zones, patrol-mech boss, sniper duel, European Extreme,
  VR Missions, NG+, heavies/dogs, rain, photo mode, codec easter eggs, speedrun
  timer, colorblind radar palettes.
