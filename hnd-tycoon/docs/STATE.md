# STATE — living progress log

Claude Code: read this first, update it last. Keep it honest. If something is
half-done, say half-done. Future sessions depend on this being true.

---

## Current position

**Next step: 2 — One customer, one burger** (`docs/BUILD_PLAN.md`)

**Phase A — The engine (steps 1–4).** Headless. No pixels yet. The goal of this
phase is a simulation you can argue with.

---

## Completed

### ✅ Step 0 — Foundations (added during handoff prep)

Not in the original 20 steps; done up front because every item is cheap now
and a rewrite in Act III.

- `src/sim/types.ts` — **§26 turned into compile errors.** Branded `GameTime`
  and `Tiles`; `Money` as integer cents with a currency tag that refuses to mix;
  `Site`/`SiteKind` rather than `Venue`; `ReputationMap` rather than scalar
  fields; generic `Route`/`VehicleClass` carrying `controlLatencyHours`.
- `src/config/recipes.ts` — cheeseburger and chips transcribed exactly from
  spec §7, with attention profiles per step (§14.1).
- `src/config/sites.ts` — Leichhardt 9×15 with the column at (4,7), Rosebery
  7×22, Neutral Bay 11×11, each with service points, rent and foot traffic.
- `src/harness/session.ts` — the session model and offline caps, encoded once
  so no bot reinvents them.
- `src/harness/bot.ts` — bot interface and result shape.
- `tests/gates.pending.test.ts` — exit criteria for steps 2, 3, 4, 6, 8, 12,
  14 and 20 written as `it.todo`. Unskip before starting each step.
- `.github/workflows/gate.yml` — CI running the gate plus a byte-identical
  determinism diff.

40 tests passing, 32 pending gates.

### ✅ Step 1 — Skeleton and clock

Shipped:
- Vite/TypeScript/Vitest project, strict mode with `noUncheckedIndexedAccess`
  and `exactOptionalPropertyTypes` on.
- `src/sim/rng.ts` — mulberry32 PRNG, seeded, serialisable to a single uint32,
  with `fork(name)` for per-system named streams and `poisson()` for arrivals.
- `src/sim/clock.ts` — tick-driven game clock. Trading windows come from a
  per-site `TradingCalendar` in config, never hardcoded (§26).
- `src/sim/world.ts` — tick orchestration, system registry, day-boundary and
  payroll hooks. Systems register here; no game logic lives in this file.
- `scripts/check-boundaries.mjs` — enforces the sim/render separation, bans
  `Math.random`, `Date.now` and browser globals inside `sim/`.
- `scripts/sim.ts` and `scripts/balance.ts` (stub) CLI entry points.
- 13 tests covering determinism, RNG streams, clock boundaries, payroll timing.

Exit criteria — **verified, not assumed**:
- ✅ Identical seed produces byte-identical output across runs.
- ✅ Clock advances correctly across a week including Sunday 23:00 payroll.
- ✅ `npm run gate` passes clean.

Notes for future sessions:
- **Named RNG streams matter.** Always take `world.rngFor('yourSystem')` rather
  than using the root RNG. Otherwise adding a new consumer of randomness
  shifts every other system's sequence and every balance number moves.
- Day 0 is a Sunday. An 8-day run therefore contains two payrolls, not one.
- The boundary checker strips comments before scanning, so you can write
  `Date.now()` in a comment without tripping it.
- Verified pacing: three 8-minute sessions plus capped offline advances ~6.5
  game days per real day, which matches the spec target of 6–7. Locked in
  `tests/session.test.ts` so it can't drift silently.

---

## Open questions

See `docs/QUESTIONS.md`. Currently blocking:

- **Q1 — how brutal is space?** Blocks step 3. Needs a numeric floor for the
  throughput drop when the grill moves six tiles. Recommendation: ≥10%.
- **Q2 — real economy numbers.** Blocks step 6, wanted before step 2. Ben is
  filling in `docs/REAL_NUMBERS.md`.
- **Q3 — real floorplans?** Blocks step 3.
- **Q4 — running shop or empty room at day one?** Blocks step 19.

Resolved:
- **Acts III–V are confirmed real intent.** Keep all §26 architecture. Do not
  propose simplifying it.
- **Ship target deferred** — cheap to defer, but it blocks using real staff
  names. Use the fictional roster until it resolves.
- **Autonomy: ask on ambiguity, batched front-loaded per step.** See the
  questions-first protocol in `CLAUDE.md`.

**Every number currently in `src/config/` is provisional.** Do not tune balance
against them.

---

## Surprises and deviations

| Step | What | Why |
|---|---|---|
| 1 | Used an inlined mulberry32 instead of the `seedrandom` package named in the spec | Zero dependencies, and the whole PRNG state is one uint32 so it serialises into the save file trivially. Determinism guaranteed across environments. Logged in `docs/DECISIONS.md`. |

---

## Balance snapshot

Nothing to report until the arrivals and economy systems exist (steps 2 and 6).
From step 6 onward, paste the key harness figures here each session so drift is
visible across sessions:

```
bot:balanced   venue-2 day: —    labour%: —    COGS%: —    longest dead gap: —
bot:naive      rep floor: —      recovery day: —
bot:idle       cash positive: —
```
