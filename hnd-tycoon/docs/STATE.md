# STATE — living progress log

Claude Code: read this first, update it last. Keep it honest. If something is
half-done, say half-done. Future sessions depend on this being true.

---

## Current position

**Next step: 3 — The floor** (`docs/BUILD_PLAN.md`). The pivotal gate: moving
the grill six tiles from the pass must measurably drop throughput. Blocked on
**Q1** (how big a drop counts) — recommendation ≥10%, proceeding on that unless
Ben says otherwise.

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

### ✅ Step 2 — One customer, one burger

The simulation now runs a shop. Fourteen customers an hour walk into
Leichhardt as a Poisson process, order a burger or chips, and one staffer works
five stations to get it to them in about four minutes.

Shipped:
- `src/sim/recipeGraph.ts` — a recipe validated into a DAG, with **two**
  orderings that are not the same thing: `topological` (dependencies first,
  used to prove correctness) and `pull` (shallowest first, nearest the
  customer, used to schedule). Rejects cycles, duplicate producers, and any
  recipe with more than one thing to hand the customer.
- `src/sim/state.ts` — one mutable state object the systems share. Id counters
  live in it rather than at module scope, so two runs in the same process
  cannot drift.
- `src/sim/entities/` — `order` (customer separate from order, ready for the
  table of six), `station` + `Job`, `staff` (company-owned, `siteId` is an
  assignment), `stock` (a plain count, deliberately narrow so step 4 can swap
  in dated lots).
- `src/sim/systems/arrivals.ts` — Poisson arrivals, first term of the §6.1
  formula only. Every later term multiplies into `ratePerHour` and nothing here
  changes when they do.
- `src/sim/systems/kitchen.ts` — requirement explosion down each DAG, netting
  off buffer and work-in-progress, pulling shallowest-first.
- `src/sim/systems/service.ts` — FIFO, and an order goes out only when every
  line is fulfilled.
- `src/sim/scenario.ts` — the single place a world gets assembled (D010).
- `src/harness/probe.ts` — multi-seed measurement. Single-seed comparisons of
  two kitchens are worse than useless.
- `src/config/{demand,kitchen,report}.ts` — every number the above uses.

Exit criteria — **verified by running them, 13 tests in `tests/step2.test.ts`**:
- ✅ 7-day run: ~156 covers/day, 3.8 min mean wait, 99.6% of arrivals served.
- ✅ Doubling every station's speed cuts mean wait to **41%** of baseline.
  Asserted as a band (25–55%), not an equality — see D011.2.
- ✅ The DAG resolves in valid topological order, and **execution** respects it:
  the test watches the job table tick by tick and asserts patty, bun and
  garnish all complete before assemble, and assemble before plate.
- ✅ No order is ever marked served with an unfulfilled line.
- ✅ Arrivals are Poisson: variance/mean = 0.7–1.4, and bursts exceed mean + 2sd.

### Two defects found in the handed-over code

Both in step 1's files, both would have surfaced as mysterious balance problems
much later:

- **`TICKS_PER_GAME_SECOND` was 1200. It should be 1/12.** Every recipe
  duration is charged against this. Nothing consumed it yet, which is why
  nothing caught it. See D006.
- **`GameTime` was branded twice**, incompatibly, in `types.ts` and `clock.ts`.
  See D007.

Also: `World` took its calendar from a hardcoded `'sydneyStandard'` default
rather than from `site.calendarId`. Fixed — §26 says the trading day is never
hardcoded, and a default is a quiet way of hardcoding one.

### Notes for future sessions

- **The tick is a budget, not a step** (D008). Twelve game seconds per tick,
  spent; a job finishing early releases the remainder into the next job in the
  same tick. The naive one-job-per-tick version makes a 6s plate cost the same
  as a 12s tick and flattens the whole production model. Step 3 charges walking
  against this same budget — that is why it is shaped this way.
- **The scheduler pulls.** Measured at 45 arrivals/hr: pull serves 86% of
  arrivals, push (deepest unmet need first) serves **4%** — it makes patties
  forever and plates nothing. There is a gate on this now, and it only bites
  under load; at 14/hr both policies look fine, which is how this would have
  shipped.
- **A gate written after the code is not yet a gate.** All 13 passed first
  time, so each was mutation-tested: replacing Poisson with uniform arrivals
  correctly failed two of them, and flipping the scheduler to push **passed all
  thirteen**. That gap is what the load gate above was written to close.
- Recipe durations are in game seconds. Stations and staff both multiply the
  rate (`speedMultiplier * skill`).

---

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

## Adversarial audit — step 2

Run against this step's own work, per `docs/AUDIT.md`. Answered honestly,
including where the answer is "none".

**Gameplay.** *A decision where both options are defensible?* **None — this
step added no gameplay.** Phase A is a headless simulation and the first real
player decision arrives at step 7. Correct for the phase, but worth saying out
loud rather than inventing one. *A stat maximisable with no downside?* **Yes,
two.** Batch size: over-filling a batch is free right now, because freshness and
waste do not exist until step 4 — a mutation that always cooks full batches
passes every gate. And `speedMultiplier`, which is strictly better with no
capital cost until step 7 and no floor-space or reliability trade until step 12.
Both are scheduled holes, but they mean step 4 is load-bearing, not polish.
*Longest decision-free gap?* Not measurable — no decisions exist yet.

**Architecture.** §26 walked item by item: currency (no money yet, `Money`
exists unused), wage rules (n/a), reputation (n/a), site type (`Site`/`SiteId`
throughout, and the calendar now comes from the site — fixed this step),
placement (**no grid yet — that is step 3, and it is the one §26 item currently
outstanding**), routing (n/a), camera (n/a), trading day (fixed), staff scope
(company-owned, `siteId` is an assignment), ladder (n/a), bottleneck logic
(n/a), distance and latency (step 3). Numbers outside config: two found, both
fixed, and rule 5 is now automated (D009). `sim/` importing `render/` or `ui/`:
clean. Same seed, same output: verified by running — byte-identical over 14
days, plus a new test comparing two full simulations down to the stock count.
The previous determinism test passed with **no systems registered**, so it was
testing the clock and nothing else.

**Presentation.** All N/A. Density stage 0 arrives at step 5; there are no
pixels yet by design.

**Discipline.** *Rewards opening the app more than twice a day?* No system
exists that could. *Most boring 60 seconds?* All of it — there is no play.
*What did you build that nobody asked for?* Three things, each justified:
`scenario.ts` (three call sites were about to assemble worlds differently, and
registration order is load-bearing), `harness/probe.ts` (multi-seed measurement
— single-seed kitchen comparisons demonstrably report the wrong sign), and the
magic-number check (found two real violations the moment it was switched on).

---

## Open questions

See `docs/QUESTIONS.md`. Currently blocking:

- **Q1 — how brutal is space?** Blocks step 3. Needs a numeric floor for the
  throughput drop when the grill moves six tiles. Recommendation: ≥10%.
- **Q2 — real economy numbers.** Blocks step 6, wanted before step 2. Ben is
  filling in `docs/REAL_NUMBERS.md`.
- **Q3 — real floorplans?** Blocks step 3.
- **Q4 — running shop or empty room at day one?** Blocks step 19.
- **Q8 — are 150 covers/day and a 4-minute wait right for Leichhardt?** Blocks
  nothing; a cheap, specific slice of Q2.
- **Q9 — one staffer caps at ~40 covers/hr and then throughput *falls*.**
  Blocks nothing; step 8's readout has to be able to name this.

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
| 2 | `TICKS_PER_GAME_SECOND` shipped 14,400x wrong, unused and therefore invisible | Every duration in the game is charged against it. D006. |
| 2 | Flipping the scheduler from pull to push passed all 13 new gates | A gate written after the code is not yet a gate. Mutation-testing found it; a load gate now closes it. |
| 2 | Throughput *falls* above ~40 covers/hr instead of plateauing | Emergent from one staffer thrashing between the pass and the grill. Not scripted, and exactly the §4 spiral. Q9. |

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

Step 2, no bots yet — Leichhardt, 8 seeds, 7 days, one staffer, six stations:

```
arrivals/hr    14      30      45      70
covers/day    156     329     427     346     <- falls past the knee (Q9)
mean wait     3.8m    7.2m    58m     270m
speed 2x      1.55m   1.66m   —       —       <- 41% of baseline
```
