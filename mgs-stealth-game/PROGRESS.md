# PROGRESS.md

**Version:** v0.39 (cycle 39 — door acoustics)

## Module status

| Module         | Status      | Notes                                    |
|----------------|-------------|------------------------------------------|
| rng            | stub        | seeded RNG single source                 |
| boot           | v1          | self-test gate, title, input, fixed-step loop |
| world          | v4          | all 4 zones; extraction stub remains (win state next) |
| player         | v1          | stances/speeds/facing; visionProfile+noiseRadius |
| vision         | v1          | stateless cone/LOS/meter; thresholds for FSM |
| guardAI        | v2 (full)   | full FSM ladder + createSquad phase controller |
| soundEvents    | v1          | emit radii, analytic wall attenuation, knock verb |
| items          | v3          | full SPEC set: tranq, CQC, drag, lockers, box, ration, chaff |
| director       | v2          | cameras + lasers + reinforcements + radio check-ins |
| engine         | v1          | canonical tick, events, snapshot(); perf 0.031ms/10 guards |
| saveState      | v1          | full capture/restore, resume-determinism gated, F5/F9 |
| radar          | v1          | model/view split; jams (static) on ALERT/EVASION |
| hud            | v1          | life/clock/phase/boxes/zone card/vignette; hp+items hooked |
| codec          | v1          | 4 one-shot calls, seeded pixel portraits, engine-pause |
| music          | v1          | pure director + synth beds, crossfades, no-op isolation |
| render         | v1          | iso scene, state-colored wall-clipped cones, meters |

## Known issues

- Asymptotic wedge (decaying progress hovering just above the give-up
  threshold) can theoretically still hit MAX_STATE_S — unreachable with real
  zone geometry today; watch item.

- engine.events clears every tick — consumers must drain post-tick same-tick.
- No render damage feedback (hit flash) yet — hp only visible in LIFE bar.
- moveCircle has no substep guard: a >1m single-tick displacement could tunnel a
  1m wall. Unreachable at 60Hz today; must fix before dash/throw physics.

## Changelog (last 5)

- cycle 39: bugfix — closed doors attenuate sound like walls (252/252, 25/25)
- cycle 38: polish — radar hidden/dragging, camera cyan→amber→red meter ramp
  (shared pure helper, both views), Q legend (247/247, 25/25)
- cycle 37: CQC throw — Q hold: 2m wall-safe toss, 5s STUNNED (wakes
  SUSPICIOUS), thud noise; stunned chokeable/not re-throwable (242/242,
  25/25)
- cycle 36: bugfix — A2 verb gating (ration always; chaff blocked in locker)
  (232/232, 24/24). Audit-20 actionables complete.
- cycle 35: EVASION locker checks — near-lastKnown lockers get checked
  (dedup, one per guard, wedge-safe); camping punished, distance rewarded
  (231/231, 24/24)
- cycle 34: zone-state persistence — stash/thaw via getState machinery,
  zone-lifetime reinforcement budget, SAVE_VERSION 3 (222/222, 23/23)
- cycle 33: polish — hit flash, noise-radius ripples (run/walk/knock, sized
  to real emit radii), death sting + bed duck (213/213, 22/22)
- cycle 32: crash fix — wedge trackers with graceful give-up on INVESTIGATE/
  EVASION/ALERT convergence; save/restore taught the tracker state; real-
  placement regression (210/210, 22/22)
- cycle 31: reinforcements (6s/10s, max +3/zone visit, guardDoor spawns) +
  40s radio check-ins (missed → searcher dispatched; lockers protect); SPEC
  hedges removed (206/206, 22/22). Crash path found → cycle 32.
- cycle 30: polish — engine contract synced, chaff HUD count, SPEC hedges,
  LOGIC_ORDER unified; v0.30 released, PLAYME regenerated (197/197, 20/20)
- cycle 29: bugfix — ration pickups collectible (+regression) (195/195, 20/20)
- cycle 28: win state — extraction terminal, mission stats (cross-zone,
  save-surviving), rank table w/ BIG BOSS, rank screen; capstone BIG BOSS
  ghost-run scenario passes (194/194, 20/20). Bootstrap order complete.
- cycle 27: saveState — full sim serialization (all FSM closure state
  enumerated), resume determinism proven calm+chaos, F5/F9 + localStorage
  (184/184, 19/19)
- cycle 26: codec — COMMANDER/MEI calls (missionOpen/firstAlert/firstBody/
  lowDarts), procedural mirrored-half pixel portraits, type-in + blips,
  engine pause, 04-codec screenshot scene (175/175, 18/18)
- cycle 25: Comms Tower — 4 interlocking heavy patrols, searchlight cameras,
  extraction stub; full-facility zero-alert scenario passes (166/166, 18/18)
- cycle 24: Laboratory — keycard doors (dynamic blockers), duty-cycle lasers,
  3-camera installation, L1 pickup seeded in warehouse (158/158, 17/17)
- cycle 23: cameras — sweeping cones via shared vision math + perception
  wrapper, chaff freeze, camera alerts tip squad without feeding anyLOS,
  radar/render cones, 2 pilot cams in warehouse (144/144, 16/16)
- cycle 22: bugfix batch — truthful box scenarios + crawl coverage (A6),
  noise-radii cross-check (A8), wall-safe drag + regression (A10)
  (137/137, 15/15)
- cycle 21: bugfix A1 — box gates fire/CQC (busy event), matrix docs,
  regression test (135/135, 14/14)
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
