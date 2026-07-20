# PROGRESS.md

Tracks milestone status per CLAUDE.md. Ticked items verify; unticked items are next.

## M1 — Engine skeleton ✅ (2026-07-20)
- [x] Config loader: `economy.config.json` validated against a zod schema (`engine/src/content/schemas.ts`) — any missing/renamed key fails loudly instead of silently defaulting.
- [x] Content loaders: `content/tiles.json`, `managers.json`, `rivals.json`, `specials.json`, all zod-validated.
- [x] Seeded RNG (`engine/src/rng.ts`, mulberry32) — deterministic, snapshot/resume via `getState()`/`fromState()`.
- [x] Two-clock model (`engine/src/clock.ts`): `EconomyClock` (gmin, day/hour/minute, demand multiplier) + `ActiveClock` (real seconds). Verified against GAME_DESIGN §2 (1 real sec = 2 game min) and cross-checked against `sim/sanity_sim.py`'s hour/day multiplier table.
- [x] Game state shape (`engine/src/state.ts`) + `StorageAdapter` interface + save/load round-trip (`engine/src/save.ts`) — corrupted saves throw instead of silently coercing.
- [x] Input-log replay harness (`engine/src/replay.ts`) — generic over the action type so M2 can plug in the real Expeditor actions (tap customer, hire, boost lane, ...) without touching the harness itself. Proven deterministic (same seed + log → byte-identical state) with a stand-in demo action set.
- 28/28 tests passing (`cd engine && npm test`), typecheck clean (`npm run typecheck`).

No feel gate needed for M1 — nothing here is player-facing yet.

## M2 — The Expeditor, engine + UI — NOT STARTED
Needs: port `reference/prototype-v7.jsx` onto the M1 engine (orders, waves, stock, serving, tips,
downtime verbs, events) as real `InputLogEntry` actions + a React/canvas UI, plus a Tone.js sound
pass. **Ends in a feel gate — Ben plays it on his phone before M3 starts.** Not attempted yet:
this needs Ben's hands, not more autonomous building.

## M3–M7 — not started
Per CLAUDE.md, each gated on the previous milestone's sign-off.

## Known open issue (inherited, not introduced by this import)
`sim/sanity_sim.py` (greedy-bot pacing check) currently reports first-manager at ~82 real minutes
against economy.config.json's pacingTargets range of 20–40 — the `venueSizes` comment in
economy.config.json references a stale "manager 21.9min" figure from an earlier config revision
that no longer matches the current numbers. This predates the High N' Dry rename (same result
under the Burger Warlord numbers) — flagging it here rather than silently retuning config, since
GAME_DESIGN.md explicitly marks balance as "provisional until the simulation assertion suite
passes" and config changes are Ben's call.
