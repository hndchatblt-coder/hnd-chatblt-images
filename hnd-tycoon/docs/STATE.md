# STATE — living progress log

Claude Code: read this first, update it last. Keep it honest. If something is
half-done, say half-done. Future sessions depend on this being true.

---

## Current position

**Next step: 5 — ShapeRegistry and the first watchable burger** (`docs/BUILD_PLAN.md`).
The first pixels. Phase A is done: there is a simulation you can argue with.

Blocked-ish on **Q11** — Leichhardt is currently 3.6m x 6.0m, which is a small
shop, and step 5 is about to draw it. Proceeding on the invented dimensions
unless Ben says otherwise; the fix is more tiles, not bigger ones.

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

### ✅ Step 4 — Attention profiles and buffers

The core tension exists, in text, and it is the one the spec promised:
**par-cooking ahead of a rush is the correct play and also how you lose money.**

Measured over 6 seeds, 5 days, with a two-hour triple-rate rush:

| patties held ahead | mean wait | units binned |
|---|---|---|
| 0 (make to order) | 6.54 min | 256 |
| 4 | 5.07 min | 279 |
| 8 | 4.34 min | 594 |
| 12 (+6 chips) | 2.10 min | 1787 |

Covers barely move across all four. Par-cooking buys the *customer's* time, not
the shop's capacity — if it raised throughput too it would just be an upgrade
and there would be no decision in it.

Shipped:
- **The attention split** (§14.1). A job is now six phases and only four hold a
  person: `travel → setup → cooking → recall → finish → carry`. The staffer is
  **released during `cooking`**. A patty is 8s loading, 68s cooking alone, 14s
  finishing — twenty-two seconds of human attention inside ninety seconds of
  cooking, exactly as the spec says. Assembly and garnish stay fully manual,
  because there is nothing to walk away from.
- `src/sim/entities/stock.ts` rewritten as **dated lots**, FIFO out, with §7.3's
  quality curve and automatic binning below 0.35.
- **Lapse.** Cooked food sitting on an unattended station loses quality if the
  step `canLapse`. Finishing a lapsing batch outranks starting new work, or the
  scheduler would cheerfully let a grill burn while it started another one.
- **Holding cabinets** (§14.2 tier 1). Multiply freshness windows. They cut the
  waste par-cooking creates by 77% and change the wait by nothing at all — they
  buy nothing on their own, only in combination with a decision to cook ahead.
  That is the shape every good upgrade in this game should have.
- A rush window in `config/demand.ts`, which step 10 replaces with the real
  daypart curves.

Exit criteria — 21 tests in `tests/step4.test.ts`, all passing:
- ✅ Par-cooking measurably improves mean wait (6.54 → 4.34 at par 8).
- ✅ Par-cooking measurably increases waste (256 → 594).
- ✅ Both visible in the day report (`meanWaitMin`, `waste`).
- ✅ Items below quality 0.35 are binned.
- ✅ A step with `canLapse` degrades when left unattended.
- ✅ Holding cabinets extend freshness windows.
- ✅ Unattended cooking lets one person run a bigger kitchen — same shop, same
  staffer, same arrivals, 20%+ more covers with the split on.
- ✅ A quiet day wastes **nothing**. Waste is a consequence of a decision or of
  overload, never a standing tax.

### The step 3 prediction was wrong

D014 predicted attention profiles would roughly triple the six-tile spatial
tax. They did the opposite to the capacity number: it fell from 6.7% of batches
to 3.6%, because a staffer who can walk away from a patty has idle time, and
extra walking eats the idle time before it eats production.

What did not fall is what the customer feels. At the saturation knee the
stretched layout serves **9.4% fewer covers** and makes them wait **19 → 52
minutes**. Full numbers and the reasoning in D016; `npm run floor` prints it.

The honest summary of design pillar one, after four steps: **placement
feasibility is the hard constraint and walking distance is the soft one.** The
grill can only sit where the gas is. The fryer needs gas *and* extraction,
which is five tiles in the entire building. That already binds, and it will
bind much harder at step 12 when a clamshell grill wants two of those tiles.

### The bug that instrumentation found and tests did not

Unattended cooking was written inside the advance/schedule interleave loop,
which runs until nobody can make progress — so every pass advanced every
cooking job by a full tick, up to 64 times. The fryer logged **123% of trading
hours** against a workload implying 49%.

No test caught it. It was found by printing station utilisation while chasing
something else, and the giveaway was that the inflation scaled with how much of
a step was unattended. See D017.

Worth generalising: anything that advances on elapsed time rather than on a
consumed budget must live outside that loop.

### Notes for future sessions

- **The bottleneck is now the staffer, and it is legible.** At 90 arrivals/hr
  one person is 106% busy; a second takes covers from 4450 to 4929 and the wait
  from 37.6 minutes to 3.7. That is step 8's readout having something true to
  say, and step 7's first hire having an obvious reason.
- `SATURATION_RATE` lives in `src/harness/probe.ts` and moved 45 → 85 this
  step. Any layout comparison must be made there: below it both layouts serve
  everyone and the delta reads zero, far above it the stretched kitchen
  collapses and it reads whatever you like (D018).
- Par levels and holding cabinets are on `SimState`, not read from config
  directly, because the player sets them from step 19 and the harness moves
  them now.

---

### ✅ Step 3 — The floor

The shop has a floorplan, and it costs money.

Leichhardt is 9 × 15 tiles at 40cm each, with the column at (4,7), gas along
the back wall only, extraction over a narrower stretch of the same wall, and
plumbing on the opposite side at the far end. Stations have real footprints —
the grill is 2×1, the prep bench 3×1, the pass 1×2 — and each has to sit on
the services it needs. Staff walk, and they carry.

Shipped:
- `src/sim/floor.ts` — the grid. Placement validity with a **reason in
  English** (`no gas under the Grill`, `the column at (4,7) is in the way`),
  because that string is what renovate mode shows the player at step 19.
  Footprints, rotation, occupancy, and A* pathing on a 4-connected grid with a
  Manhattan heuristic — admissible, so distances are exact rather than
  estimated, and the cache is a lookup.
- `src/config/stations.ts` — footprints and service requirements per §7.1,
  plus tile size and walking pace.
- `src/config/layouts.ts` — named floorplans. `leichhardtTight` is the
  baseline; `leichhardtStretched` is identical except the pass, six tiles
  further from the grill.
- `src/sim/systems/kitchen.ts` — a job is now **travel → work → carry**, all
  three charged against the same per-tick budget. Output does not enter the
  buffer until someone has walked it to the station that consumes it (D013).
- `scripts/floor.ts` / `npm run floor` — prints the delta.

**The number: 6.6% of covers, 6.7% of batches.** Grill-to-pass 5 tiles vs 11,
saturated at 45 arrivals/hour, 8 seeds, 7 days.

Exit criteria — 16 tests in `tests/step3.test.ts`:
- ✅ Moving the pass six tiles from the grill measurably drops throughput, and
  the delta is printed as a number.
- ⚠️ It is **6.6%, not the ≥10%** recommended for Q1. Read D014 before
  treating this as passed — the assertion is set at >4%, which is what the
  model honestly supports, and a 10% gate is carried forward to step 4.
- ✅ Staff cannot path through obstructed tiles. Around the column is 4 tiles
  where through it would be 2.
- ✅ A station cannot be placed without its service point. The fryer needs gas
  *and* extraction and there are only five tiles in the building with both.
- ✅ The column blocks placement and pathing.
- ✅ Unreachable means `Infinity`, not a guess.
- ✅ Stations are worked from beside them, never from inside.

### Why the pivotal number came in low, and what was not done about it

Walking is **4.0% of staff time** in the tight layout and 9.0% stretched. It
cannot cost more of the day than it occupies. The cause is that a staffer is
currently pinned to a station for the whole of a 90-second patty and a
195-second fryer basket — attention profiles are step 4 — so `work` outweighs
`walk` 25 to 1.

Slowing the walk speed or inflating the tile size would have produced a green
gate and buried the finding. Neither was done. See D014.

**This suggests steps 3 and 4 are ordered wrongly.** The spatial tax cannot be
measured honestly while a cook babysits a fryer for three minutes. Not
reordering them — the floor is a prerequisite for step 4's task assignment
either way — but the headline number belongs to step 4, and step 4's gate now
re-runs this exact comparison at 10%.

### Notes for future sessions

- **Services are a harder constraint than floor area.** The grill cannot move
  six tiles from anything at Leichhardt, because gas is one wall. The gate
  moves the *pass* instead (D012). You do not choose where the grill goes; you
  choose what you build around it. That is a better game than the one where
  every station floats.
- `betweenStations` returning 0 is correct, not a bug: it means one tile is
  adjacent to both stations, so you work them without moving.
- Distances are cached and the cache clears on any placement change. If a later
  step moves stations mid-service, that clear is the thing to watch.

---

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

## Adversarial audit — step 4

**Gameplay.** *A decision where both options are defensible?* **Yes, and it is
the best one so far: how far ahead to cook.** Nothing is a hedge that costs you
food; twelve patties ahead is a two-minute wait and seven times the waste.
Neither is correct, and which one is better depends on whether the rush turns
up — which the player cannot know when they decide. That is the shape the whole
game wants. *A stat maximisable with no downside?* **Batch size is fixed** —
it was the outstanding hole from steps 2 and 3, and freshness closed it:
over-filling batches now costs waste. `speedMultiplier` is still free, and stays
free until step 7 gives it a price. Compactness is still free until ambience
claims floor tiles at step 11. *Anything strictly better than its absence?* The
holding cabinet was the risk, and it is **not** — it changes the wait by nothing
at all unless you also decide to cook ahead. *Longest decision-free gap?* Still
unmeasurable; no player decisions are exposed yet.

**Architecture.** §26 walked again; nothing new hardcoded. One violation caught
by the boundary checker and worth recording because it was a false positive
that identified a real hazard: a local variable named `window` in `sim/`.
Renamed. Numbers outside config: none — par levels, lapse grace, quality decay,
the waste floor and the cabinet multiplier all live in `config/kitchen.ts`.
Determinism re-verified by running.

**Presentation.** Still N/A, and this is the last step where that is an
acceptable answer. Step 5 gates on density stage 0.

**Discipline.** *Rewards opening the app more than twice a day?* No. Par levels
are a standing setting, not a timed one — deliberately, because a par level
that had to be re-set before each rush would be exactly the pull-them-back
mechanic §5.3 and the anti-goals forbid. *Most boring 60 seconds?* Still all of
it — there are no pixels. *What did you build that nobody asked for?* The
`UNATTENDED_COOKING` flag. Justified: §14.1's claim that automation buys
attention rather than time is the spine of the game, and a claim that cannot be
measured is a slogan. The flag turns it into a number — 20%+ more covers from
the same person.

---

## Adversarial audit — step 3

**Gameplay.** *A decision where both options are defensible?* **Yes — the first
one in the project.** Where the pass goes. Near the cooking, and the line is
short but the room is cramped and the pass is a long way from the street; near
the street, and service is quick to hand over but every burger crosses the
building. Currently only the throughput side is modelled, so the trade is
one-sided until ambience claims floor tiles at step 11 — noted, not resolved.
*A stat maximisable with no downside?* Still the two from step 2 (batch size,
station speed), unchanged. Compactness is now a third: there is no cost to a
tighter kitchen yet. Ambience (§6.4) is what will make floor space contested,
and until then "put everything as close together as possible" is free and
correct. Flagged for step 11. *Longest decision-free gap?* Still not
measurable — the player cannot place anything until step 19.

**Architecture.** §26 walked again. **Placement is the item this step
closes**: abstract grid, abstract service-point requirements, nothing in
`floor.ts` knows it is a restaurant. Distance-and-latency is partly closed —
transit is explicit and charged in seconds, but `controlLatencyHours` is still
inert, correctly, until Act V. Trading day, site type, staff scope, reputation,
currency, routing, camera, ladder, bottleneck: unchanged from step 2. Numbers
outside config: one found (`1e4` as a grid stride) and fixed by deriving it,
which removed a latent aliasing bug at the same time (D015). Boundaries clean.
Determinism verified by running.

**Presentation.** Still N/A — pixels start at step 5. The floor is now the
thing that will be drawn, and it is worth saying that a 9×15 room at 40cm a
tile is 3.6m × 6.0m, which is a *very* small shop. If the real Leichhardt is
bigger, the tile count needs to grow before step 5 draws it. Logged as part of
Q3.

**Discipline.** *Rewards opening the app more than twice a day?* No. *Most
boring 60 seconds?* Still all of it. *What did you build that nobody asked
for?* Rotation (`rotated`) — justified: the prep bench is 3×1 and Leichhardt's
plumbing is a 2-tile vertical run on a side wall, so without rotation the prep
bench cannot legally be placed at all. And `npm run floor`, which BUILD_PLAN
explicitly asks for ("Print the delta").

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
- **Q1 — how brutal is space?** Re-measured after step 4: **9.4% of covers,
  3.6% of capacity, 2.7x the wait.** Needs your number. See D016.
- **Q8 — are 150 covers/day and a 4-minute wait right for Leichhardt?** Blocks
  nothing; a cheap, specific slice of Q2.
- **Q9 — one staffer caps at ~40 covers/hr and then throughput *falls*.**
  Superseded in magnitude by step 4 (the cap is now ~85/hr) but the shape
  stands. Step 8's readout has to be able to name it.
- **Q10 — waste at 11% of covers during a rush.** Blocks nothing; check against
  real waste%.
- **Q11 — is Leichhardt really 3.6m x 6.0m?** Step 5 is about to draw it.

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
| 3 | The pivotal gate came in at 6.6%, not ≥10% | Walking is 4% of staff time, so it cannot cost more. Attention profiles (step 4) are the missing piece. Not tuned to hide it. D014. |
| 3 | The grill cannot move six tiles from anything at Leichhardt | Gas is one wall. Services constrain harder than area — a better game than the one where every station floats. D012. |
| 3 | Leichhardt at 40cm a tile is 3.6m × 6.0m, which is a very small shop | Provisional, but step 5 is about to draw it. Q11. |
| 4 | My step 3 prediction was wrong — the capacity tax FELL, 6.7% → 3.6% | A staffer who can walk away from a patty has idle time, and walking eats idle before it eats production. The covers delta rose to 9.4% anyway. D016. |
| 4 | Unattended cooking ran up to 64 times per tick | It sat inside the advance/schedule interleave. Fryer logged 123% of trading hours. Found by instrumentation, not by a test. D017. |
| 4 | The holding cabinet turned out to have exactly the right shape by accident | It buys nothing alone and a lot in combination. Worth copying deliberately for the rest of the ladder. |

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

Step 4, `npm run floor` — saturated at 85/hr (the knee moved), 8 seeds, 5 days:

```
                    tight    stretched
grill -> pass       5 tiles   11 tiles
covers               4459        4039     <- -9.4%
batches             12904       12435     <- -3.6%   capacity tax
mean wait           19.1m       51.8m     <- 2.7x    where it actually bites
walk share          12.9%       21.4%     <- the ceiling on what layout can cost
```

Step 4, par-cooking into a two-hour triple-rate rush, 6 seeds, 5 days:

```
par patties      0       4       8      12(+6 chips)
mean wait      6.54m   5.07m   4.34m    2.10m
units binned    256     279     594     1787
covers         2258    2260    2260     2263        <- a trade, not a win
```

One staffer vs two, tight layout at 90/hr:

```
staff=1  covers 4450  wait 37.6m   <- 106% busy: the bottleneck is a person
staff=2  covers 4929  wait  3.7m
staff=3  covers 4933  wait  3.3m   <- and then it is not
```
