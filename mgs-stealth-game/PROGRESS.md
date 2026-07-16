# PROGRESS.md

**Version:** v0.20 (cycle 20 — audit; 12 findings → backlog A1-A12)

## Module status

| Module         | Status      | Notes                                    |
|----------------|-------------|------------------------------------------|
| rng            | stub        | seeded RNG single source                 |
| boot           | v1          | self-test gate, title, input, fixed-step loop |
| world          | v2          | 2 zones (dock, warehouse), exits[]/entrances{}, lockers data |
| player         | v1          | stances/speeds/facing; visionProfile+noiseRadius |
| vision         | v1          | stateless cone/LOS/meter; thresholds for FSM |
| guardAI        | v2 (full)   | full FSM ladder + createSquad phase controller |
| soundEvents    | v1          | emit radii, analytic wall attenuation, knock verb |
| items          | v3          | full SPEC set: tranq, CQC, drag, lockers, box, ration, chaff |
| director       | not started | reinforcements, radio check-ins          |
| engine         | v1          | canonical tick, events, snapshot(); perf 0.031ms/10 guards |
| saveState      | not started | snapshot() groundwork exists in engine   |
| radar          | v1          | model/view split; jams (static) on ALERT/EVASION |
| hud            | v1          | life/clock/phase/boxes/zone card/vignette; hp+items hooked |
| codec          | not started |                                          |
| music          | v1          | pure director + synth beds, crossfades, no-op isolation |
| render         | v1          | iso scene, state-colored wall-clipped cones, meters |

## Known issues

- engine.events clears every tick — consumers must drain post-tick same-tick.
- No render damage feedback (hit flash) yet — hp only visible in LIFE bar.
- moveCircle has no substep guard: a >1m single-tick displacement could tunnel a
  1m wall. Unreachable at 60Hz today; must fix before dash/throw physics.

## Changelog (last 5)

- cycle 20: AUDIT — 12 findings (box/fire gate gap tops the list), clean bill
  on architecture rules; findings → BACKLOG A1-A12
- cycle 19: box (0.05 stationary/blown moving), ration (+0.35, x3), chaff
  (15s radar jam, noisy pop) — item set complete (131/131, 14/14; 4
  placeholder assertions replaced-stricter, see TESTLOG)
- cycle 18: CQC from behind, body drag (0.55 speed, 0.9m trail), lockers
  (stuff bodies — discovery-exempt; hide player via decoy gating), wake-and-
  step-out (117/117, 13/13)
- cycle 17: tranq — ray-clip aiming, headshot/stagger rules, 60s sleep +
  wake-search, colleague body-discovery ALERT at body position, dart-impact
  noise, TRANQ HUD (104/104, 12/12; one hud test replaced-stricter, see
  TESTLOG)
- cycle 16: combat — player hp, ALERT gunfire (grace + cadence + stance-aware
  accuracy), gunshot noise, MISSION FAILED + restart, engine freeze (95/95,
  11/11)
- cycle 15: Warehouse zone (aisle maze, 2 guards, 2 loops) + INFILTRATION-gated
  zone transitions, cross-zone determinism (87/87, 10/10)
- cycle 14: music — sneak/combat/evasion/caution beds + sting/resolve
  one-shots, 1.5s crossfades, permanent-no-op audio isolation (79/79, 9/9)
- cycle 13: polish — cone fills brightened + crisp rims (same clipped verts),
  markers/meter 2x, SUSPICIOUS amber; state progression legible at 720p
- cycle 12: HUD — MGS1-style overlay (life, clock, alert counter, phase banner
  with EVASION/CAUTION countdowns, weapon/item boxes, zone card, detection
  vignette) (74/74, 9/9)
- cycle 11: soliton radar — pure radarModel + canvas view, guard cones with
  CAUTION widening, deterministic jam static, no position leaks (69/69, 9/9)
- cycle 10: render — playable! iso view, state-colored wall-clipped vision
  cones, stance-scaled player, markers/meter, WASD+knock input, 3-scene
  screenshot suite; release v0.10 snapshotted, PLAYME regenerated
- cycle 9: soundEvents — SPEC radii, 50%/wall attenuation (analytic), sharp vs
  soft stimuli, engine knock verb + noiseHeard events; knock-lure scenario
  passes end to end (63/63, 9/9)
- cycle 8: engine — canonical fixed-timestep loop (player→guards→squad→events),
  snapshot(), smoke + perf gates (54/54, 7/7, 0.031ms/tick @ 10 guards)
- cycle 7: bugfix — full test suite (47) now bundled into game.html; in-browser
  boot gate runs the same suite as node (was 3/3, now 47/47)
- cycle 6: guardAI part B — ALERT pursuit/arrest, EVASION staggered sweep,
  CAUTION widened cones, createSquad phase controller, meter-bounce bug fixed
  (47/47, 6/6)
- cycle 5: bugfix — waypoint route rerouted around guard hut; leg-clearance
  sanity test (r=0.6 sampled + raycast, wrap-around); first regression test
  (guard walks real loop 180s). 38/38, 4/4
- cycle 4: guardAI part A — PATROL/SUSPICIOUS/INVESTIGATE FSM, hearNoise API,
  head-sweep, determinism test, 3 sim scenarios (36/36, 4/4)
- cycle 3: vision — 70°/14m cone, exact LOS, fill meter (0.8s confirm at 2m),
  stance/darkness/extraMult modifiers, 9 tests (28/28)
- cycle 2: player — walk/run/crouch/crawl (6/3/1.6/0.8 m/s), facing, collision
  via world.moveCircle, visionProfile + noiseRadius hooks, 8 tests (19/19)
- cycle 1: world — Loading Dock as data (8 interior obstacles, 3 routes, dark
  zones), exact slab raycast, sliding circle collision, 8 tests (11/11)
- cycle 0: scaffold — repo layout, ledgers, build/test/sim harness skeletons, loop.sh
