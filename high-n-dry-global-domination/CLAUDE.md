# CLAUDE.md — Build rules for High N' Dry: Global Domination (v0.3)

You are building the game specified in `GAME_DESIGN.md` with balance values from `economy.config.json`. **Read `PROTOTYPE_NOTES.md` before writing any gameplay code** — it documents seven prototypes of dead ends. `reference/prototype-v7.jsx` is the feel spec for the active layer.

## Prime directives

1. **Two layers, two verification regimes.** The IDLE economy is sim-verified: headless engine, deterministic, assertion suite (`sim:assert`) is law. The ACTIVE layer (the Expeditor) is playtest-verified: every milestone touching it ends with a **feel gate** — Ben plays a build and signs off. You cannot sim your way past a feel gate, and you cannot playtest your way past a red assertion.
2. **Config is law.** Every number — idle AND active — comes from `economy.config.json`. Add missing values to config and flag them; never inline. No numeric literals in engine code except 0, 1, indices.
3. **Determinism where possible.** The idle engine is fully deterministic. The active layer's *rules* (order gen, patience, stock, serve/tip resolution, surges) live in the engine package, seeded-RNG, replayable from an input log — only rendering and input capture live in the UI.
4. **Never violate Pillar 1 (no losses) or Pillar 6 (every attention state has a verb, no tap mandatory).**
5. **The design is not finished.** Ben's verdict on the best prototype: "still not good enough." Expect to iterate the active layer with him. One change per playtest. Do not batch five feel changes into one build.

## Repository structure

```
/engine          Pure TS. Idle sim + active-layer rules. Zero DOM imports.
  /src/idle      v0.2 economy: demand, stations, managers, offline, war
  /src/active    Expeditor rules: orders, patience, stock, serving, tips, surges, downtime verbs
  /src/content   Schema validation + loaders
  /tests
/content         JSON data (tiles, managers, rivals, specials, warAssets, upgrades, events, flopLines)
/sim             sim:assert (idle pacing suite), sim:fortnight (14-day curve), sim:replay (active-layer input-log replay)
/ui              React + the canvas scene. No game rules here.
/reference       prototype-v7.jsx — the feel spec. Read-only.
```

## Milestones — sign-off with Ben between each

- **M1 — Engine skeleton:** two-clock model, state shape, config loader, seeded RNG, save/load round-trip, input-log replay harness.
- **M2 — The Expeditor, engine + UI:** port prototype-v7 onto the real engine (orders, waves, stock, serving, tips, downtime verbs, events) + **sound pass** (Tone.js: sizzle, serve, tip, surge). GATE: replay tests green + **FEEL GATE** (Ben, on his phone).
- **M3 — Feel iteration sprint:** work the "still not good enough" gap with Ben. Candidate levers in PROTOTYPE_NOTES (Friday boss night + records, forecast, streaks, juicier feedback). One lever per build. GATE: Ben says the loop is *good*, not merely closest-yet. Do not proceed on momentum.
- **M4 — The automation arc:** shift supervisor (auto-serve below manual ceiling, no tips) + venue manager handoff to the idle sim + offline settlement. GATE: idle assertions green (re-tune config — the active layer changed early-game income) + feel gate on the handoff moment.
- **M5 — Empire layer:** venue #2 on the map, per-tile demographics driving order mix, currencies, area managers. GATE: sim + feel.
- **M6 — War layer:** per GDD §6 and v0.2 spec. GATE: sim.
- **M7 — Content breadth + agent loop:** per the agent-loop contract below.

## Stop-and-ask triggers
- Any feel change you're tempted to make without a playtest
- Any red assertion that wants its target range widened
- Any new mechanic, verb, or currency not in the GDD
- Cutting a downtime verb (needs Ben's call, backed by playtest evidence)
- Any dependency beyond React, Tone.js, three.js (map only), vitest/jest, zod

## Testing
- Idle: unit tests per formula; `sim:assert` greedy-bot pacing; `sim:fortnight` curve dump per milestone report; offline-settlement determinism test.
- Active: `sim:replay` — recorded input logs replay to identical outcomes; property tests (no order unservable forever, wave gaps within bounds, no mandatory tap).
- Content: zod on every row; CI fails on invalid content.

## Agent-loop contract (M7+)
Iterations may only add rows to /content, then run: schema validation + `sim:assert` + fortnight drift check (day-14 profit ±15% of baseline). Fail → revert + log. Never touch /engine in a content iteration.

## Voice & copy
Dry Australian hospo humour, deadpan, specific. Flop lines for failed specials are a first-class content type — write many, vary structure, never explain the joke. Escalation-phase tone stays quarantined behind its gates. Reference: "The Vegemite Aioli Stack. Leichhardt has voted. Moving on."
