# STATE — living progress log

Claude Code: read this first, update it last. Keep it honest. If something is
half-done, say half-done. Future sessions depend on this being true.

---

## Current position

### ✅ Step 9 — Satisfaction, reviews, reputation

The shop has a reputation and it can be wrecked. Satisfaction multiplies wait,
quality and accuracy so no good dimension covers for a bad one; reviews are
angry-skewed 30% against 7%, which is why a struggling shop's review pool is
**67% one-and-two-star**; and stars are recency-weighted over the last 250 with
a ten-day half-life against a 3.8 prior.

Measured bad week: trough **1.97 stars on day 5**, +0.5 recovered by day 11.

Reputation is a keyed map from the first line (§6.5) — every review carries its
channel, and a second channel is a config entry.

**On screen the same step it exists** (§22.5): five glyphs and a tweened number
in the top bar, red below three stars.

Attacked as a future-architecture reviewer; found three: `starsOf` ignored the
channel it was asked for, the review array grew forever, and the review RNG
was seeded from the site rather than the run so every seed shared one stream.
All fixed and gated. See D034.

**Gate: 151 passing, 23 todo, boundaries clean.**

---

### ✅ Step 7b — Rostering and firing (post-audit)

**Labour is a decision now.** Staff carry a seven-day roster; wages accrue only
for rostered days at that day's penalty rate, and someone rostered off is not in
the building. Measured over 56 days and 8 seeds, Friday+Saturday ($72,536) beats
both doing nothing ($70,291) and rostering every day ($60,054) — and the roster
that serves the most covers earns the least. See D031.

Firing costs two weeks' notice, paid, worked out. Hiring costs one shift up
front and starts them on no days at all.

**Attacked with the exploiter's lens; found three holes my own comments claimed
were closed** — instant roster changes, dodging the wage by rostering someone
off at lunchtime, and firing your way down to zero staff. All fixed and gated.
See D032.

**Gate: 135 passing, 23 todo, boundaries clean.** Tap latency measured in-page
at 1–3ms; 62fps software-rendered headless (not a device measurement).

**DEBT-1:** the walk-in beat is correct and invisible — one tick is 27 tiles of
walking in a 15-tile shop.

---

**Next step: 6 — Money and the P&L.**

**But step 5's gate is not closed and only Ben can close it.** Density stage 0
asks whether a stranger watching for thirty seconds describes what is happening
unprompted, and whether you want to keep watching. No test claims that and this
file does not either. `play/index.html` ships with step 5 so it can be judged
rather than asserted. See D019.

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

### 🟡 Step 5 — ShapeRegistry and the first watchable burger

**There are pixels.** A warm shop in a cold street: tiled back wall, extraction
hood over the gas run, grill and fryer against it, the pass glowing in the
middle of the room, a cook in whites walking between them, food changing colour
as it cooks, steam, and someone waiting at the door.

Shipped:
- `src/render/shapes/ShapeRegistry.ts` — every shape drawn once with
  `Graphics`, baked into a `RenderTexture` at boot, then instanced. **No raster
  assets.** Plus `SpritePool`, so density costs allocation once.
- `src/render/projection.ts` — top-down with a shallow oblique lean, **not
  isometric**. No rotation at all: grid x is screen x, so a nine-wide room is
  nine taps wide. The lean is two things only — depth tiles are shorter than
  they are wide, and anything with height gets a front face under its top face.
- `src/render/scene/Scene.ts` — the shop. Floor, services drawn into it, wall,
  hood, stations, staff, food, queue, steam, and depth sorting so a cook in
  front of the grill does not vanish into it.
- `src/render/palette.ts` — the raw → seared → perfect → burnt ramp as an
  interpolation. Deliberately free of PixiJS so the ramp is testable without a
  GPU.
- `src/render/Game.ts` — fixed 10 Hz sim ticks, frames whenever the browser
  offers one. Speed multiplies ticks processed, never tick size.
- `src/ui/` — a thin React HUD polling at 4 Hz. It does **not** re-render on a
  sim tick; a React tree reconciling at 10 Hz would cost more than the
  simulation it describes.
- `play/index.html` — one self-contained 648 kB file for the phone.

Machine-checkable criteria — 11 tests in `tests/step5.test.ts`:
- ✅ The projection is a cross-section: back-of-house up-screen, door
  down-screen, food flowing down and customers up (§12).
- ✅ Grid x is screen x, depth is foreshortened, nothing is skewed.
- ✅ Leichhardt fits the 390-wide portrait frame.
- ✅ The food ramp is continuous — every 2% step moves less than 24 units of
  total channel distance, so there is no point at which it reads as a state
  machine.
- ✅ **Burnt is only ever reached because quality was lost.** Perfectly cooked
  food never burns by itself; it burns because nobody came back for it.
- ✅ Reserved hues are reserved: no decorative colour anywhere in `brand.ts`
  collides with the food ramp or the ticket ramp (§21.3).
- ✅ `src/sim` imports nothing from `render/`, `ui/` or pixi.

**Not claimed — density stage 0.** *"Someone unfamiliar watches for 30 seconds
and correctly describes what's happening, unprompted. You want to keep watching
it."* That is Ben's call and nothing here asserts it. See D019.

### What the render pass forced

- **The floor alone was illegible.** A grid in a void, with the top rows of
  floor indistinguishable from the empty frame above them. A tiled wall with a
  hard skirting line fixed it. Not in the spec; added because the first
  screenshot was unreadable (D020).
- **The extraction hood is the best thing on screen** and it was an accident.
  It hangs over the gas run and nowhere else, so the picture now states the
  rule that §7.1 encodes — the grill is at the back because that is where the
  extraction is. A constraint the player would otherwise have to be told.
- A hard-edged ellipse for the warm wash read as a rendering bug. Baked soft
  instead, twenty-two rings.
- The first pass sized tiles at 36x24 and the shop sat in the bottom half of
  the frame with a black void above. 40x31 fills it.

### Notes for future sessions

- Staff now carry a continuous `x`/`y` in grid coordinates, updated as they
  walk. That is simulation truth, not a render hack — a person who teleports
  between tiles reads as a bug, and §21.5's whole premise is that human motion
  looks different from machine motion.
- The front half of the shop is a large empty floor. Correct for stage 0, and
  it is where seating goes at step 10 — worth checking then that it fills.
- Delivery to the phone: single file, committed, githack, verified with
  Playwright **touch** emulation. A desktop click passing is not evidence a tap
  works (D021).

---

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

## Adversarial audit — step 5

**Gameplay.** No new decisions — step 5 is a render pass and adds none. Nothing
became maximisable and nothing became strictly better than its absence.

**Architecture.** `sim/` still imports nothing from `render/` or `ui/`,
asserted twice now (the boundary script and a test). Numbers outside config:
none — every dimension, colour and motion constant is in `config/render.ts` or
`config/brand.ts`. The §26 item this step touches is the camera, and it is
**not** closed: there is one fixed view, not the N-tier stack §26 requires.
That is correct for step 5 and it is step 17's job (zoom tiers, §23) — flagging
it so it is not forgotten.

**Presentation.** *Density stage?* Stage 0, which is this step's target — one
staffer, one grill, two or three customers, one heat source, steam. *Does every
new item have an install beat, an idle signature and a working signature?*
Idle: yes, pilot lights breathe on anything that burns gas, so the kitchen
looks ON at rest. Working: yes, steam per active cooking station and the food
ramp. **Install beat: no** — nothing can be bought yet, and it lands with step
7, which gates on it. *Does every shape read at 12px?* The silhouettes were
drawn for it (hard outlines, colour carrying the information, the cap
separating a cook from a customer) but it has not been verified at 12px on a
real device. *Thumb, portrait, 390px, no hover?* Yes — 44px speed buttons in
the bottom third, no hover states anywhere, verified with touch-only emulation.
*Muted?* Silent by construction; there is no audio yet.

**Discipline.** *What did you build that nobody asked for?* The back wall and
the extraction hood (D020), both because the first render was illegible without
them, and `src/render/palette.ts` as a separate module so the food ramp is
testable without a GPU. *Is the newest system visible?* That is the entire
step. *Most boring 60 seconds?* Watching the empty front half of the shop —
which is where seating goes at step 10.

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
| 5 | The extraction hood explains the game better than any HUD element | It hangs over the gas run and nowhere else, so the screen states why the grill is at the back. Unplanned, and the best thing in the render. |
| 5 | A floor with no wall reads as a void, not a room | Added a tiled wall and a skirting line. D020. |

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

---

## Step 10 — demand, pricing, marketing, balking. SHIPPED.

**What is now playable:** you can set your price and watch the fair-price band
move as your rating does; you can buy marketing and watch cost-per-cover tell
you whether it is working; a table of six arrives as one dreadful ticket; and
when somebody gives up on your queue you see them leave before the number moves.

The whole of §6.1 is live, `competitorPressure` included and pinned at zero.

### On screen
- **The walkout.** They reach the door, look at the line, turn and go. D040.
- **The ticket rail**, over the pass: paper dockets with a header band that ages
  white -> amber -> red, red pulsing. A six-top's docket is taller.
- **Posture.** The queue sags and leans as its wait runs past §7.4's six-minute
  grace. Three and a half pixels each; unmistakable at fourteen of them.
- **Prices & marketing sheet** with the §8.2 band drawn (not printed) and the
  §8.3 cost-per-cover figure.

### Measured
Roster curve, 56 days, six seeds — the peak moved, see D037:

```
hires  shape        cash
0      —          $58,377
1      all 7      $80,755   <- the peak
2      all 7      $60,019
3      all 7      $39,123
2      Thu-Sat    $65,563   <- shape matters again above the peak
```

Balk rate by day of week, one staffer, 56 days, four seeds — this is the shape
the roster decision is made against:

```
       arrivals/day   balk%   mean queue
Mon          95         2.0      0.88
Wed         116         3.0      1.19
Thu         138         6.7      1.64
Fri         182        13.0      2.67
Sat         201        16.8      3.24
```

`npm run balance`, 70 days, four seeds:

```
                        naive      idle
stars bottom by day 30   2.64      3.17
covers over 70 days     11551      8636   (+34%)
marketing paid         $5,400        $0
ending cash           $67,640   $70,483   <- worked harder, finished poorer
```

### Surprises
- Adding archetypes moved the LEVEL of the economy twice while looking like it
  only moved the shape — once through quantity, once through patience. Both
  needed normalising. D036. This is now the third time a "content" addition has
  silently re-tuned the game, and it is worth assuming the next one will too.
- Reputation feeding demand made labour compound, which killed step 7b's
  original conclusion outright. D037.
- The step-4 gate "wastes nothing at all on a quiet day" became false, honestly:
  a six-top toasts six buns at once and assembly works through them one at a
  time, so the last one sits. 1.5% of production, all of it buns, and a single
  holding cabinet takes it to 0.3%. The gate now asserts that DROP, which is a
  stronger claim than zero ever was.

### Debt carried
- **DEBT-1** (unchanged, now stated plainly in the gate): at 120x compression no
  walk is visible in the sim's own sampling — one tick is 27 tiles of walking in
  a 15-tile shop. Smoothing it is the renderer's job, between ticks, and is not
  done. The step 7b walk-in gate used to assert a POSITION and was passing by
  luck; it now asserts the walk was charged, which is what is actually true.
- **D030** (`reconcile()` is a tautology) — still unfixed.
- `bot:balanced`, `bot:tightarse`, `bot:roboboss` do not exist. They need verbs
  the game has not got yet (automation is step 12), and a bot that pretended to
  automate would make step 12's "neither strategy may dominate" unfalsifiable.
- The §25.2 session model (three 8-minute sessions a day, offline accrual behind
  the §5.2 caps) is not applied to bots. Needs offline accrual, step 20. Bots
  decide once per game day, which is a MORE attentive player than the real
  pattern, so the measured spiral is a lower bound.
- Financing and resale, still dropped from step 7. `src/save/` is still a
  `.gitkeep`.

**Next: step 11 — incidents, ambience, recovery.**

---

## Step 11 — incidents, ambience, recovery. SHIPPED.

**What is now playable:** things break and you decide when to deal with them;
you can spend money on a room worth sitting in and find out it only pays if
you are busy; and if you wreck the place there is a way back that takes about a
week of running the shop properly.

### On screen
- **"The state of things"** — a panel that appears only when something IS wrong.
  Each fault with what it is doing to you and what it costs to sort. **No
  countdown anywhere on it**, and there is a gate asserting the absence.
- **The bank**, quoted verbatim, getting colder as the overdraft deepens. Cash
  turns red before the bank says anything.
- **The Recovery Plan's next objective** takes the always-visible line when it
  is open. A shop under 2.5 stars has a more urgent question than "what is my
  constraint".
- **Tables and fit-out** in the shop, taking real floor tiles.

### Measured

The roster curve is not the only curve any more. Ambience, 56 days, six seeds:

```
seats    0        2        4        8       16
cash  $38,772  $44,147  $44,404  $40,661  $38,001
```

Three bots, 70 days, four seeds:

```
                        naive     balanced      idle
stars bottom by d30      2.34         3.19      2.80
covers over 70d          9185        17039      6917
marketing paid         $5,400            —         $0
ending cash           $48,784      $51,879   $46,330
```

The dig-out, `bot:naive` handing a 2.26-star shop to `bot:balanced` on day 35:
**6,5,5,5,5,7 days — mean 5.5**, against §10's budget of ≈8. Faster than
budgeted, which is what killed the acceleration multiplier (D044).

### Surprises
- The Recovery Plan's repair multiplier was solving a problem that did not
  exist. The shop already digs out faster than §10 budgets without it. D044.
- Incidents made `bot:idle` decay below 3.0 stars, which broke step 10's
  balance gate — the naive-vs-idle signature stopped discriminating. The
  control moved to `bot:balanced`, which is a stronger claim and the first
  falsifiable test of §13's actionability. D046.
- Ambience was a pure stat upgrade until it got a standing cost, because §6.4's
  floor-competition justification is simply false in a 9x15 room. D045.
- The Poisson gate had to move. Hourly arrival counts are now a MIXED Poisson —
  reputation, marketing, price and the recovery penalty all move the rate day
  to day (measured cv 0.18 across twenty Thursdays), and a mixed Poisson is
  over-dispersed by construction. The exact property moved onto `rng.poisson`
  where the rate is held still; the shop-level gate asserts burstiness.
- Step 4's "covers barely move" gate was measuring the wrong quantity. Its
  arms differ by whether the Recovery Plan fired, not by capacity —
  `served/arrived` is 1.000 in both.

### Debt carried
- **D030** (`reconcile()` is a tautology) — still unfixed. Oldest open debt.
- **DEBT-1** — no inter-tick interpolation, so walking still teleports.
- `bot:tightarse` and `bot:roboboss` do not exist. They need automation, step 12.
- The §25.2 session model is still not applied to bots; needs offline accrual,
  step 20.
- **New:** the test suite is now 103 seconds. The handover runs are 110 game
  days x 6 seeds x 2 tests. If it gets slower, share the runs between them.
- **New:** a shop with no seating can ignore `roomTired` for free — room
  condition only matters when there are ambience points to spoil. It soaks a
  `MAX_OPEN` slot and helps you. Harmless today, wrong in principle.
- Financing and resale still dropped from step 7. `src/save/` is still a
  `.gitkeep`.

**Next: step 12 — the equipment ladder.**

---

## Step 12 — the equipment ladder. SHIPPED.

**What is now playable:** you can automate, and it is a genuine argument rather
than an upgrade path. Three different shops all work and none of them is the
answer.

### Measured — 90 days, four seeds

```
bot         cash      covers   stars    vs balanced
balanced   $74,028    21,774    3.39         —
tightarse  $71,156     8,874    3.47      -3.9%
roboboss   $87,066    13,737    3.91     +17.6%
naive      $41,800    10,693    2.37
idle       $43,407     7,965    2.77
```

**Exit criterion met.** It started at +85% and -262%.

The lean shop serves 40% of the covers for about the same money. The automated
one serves fewer covers than the staffed one and keeps more of the takings. The
staffed one serves everybody. All three are defensible and that is the point.

### What the ladder is
Six rungs of §14.2, each expressed as a change to the §14.1 attention split and
never to the clock. Machines fit to a station, break on their own run-hours
inverse to maintenance spend, and draw utilities every trading hour whether busy
or not — which is what makes automation worse than staff on a dead Monday.

Prices come from **measured operating value** at roughly an 85-day payback, not
from how impressive the machine sounds. Tier 5 is visible and locked behind
`requiresSites: 2` — a robotic fry station generates about $71 a day in one
shop, so an honest single-shop price would be less than an auto-lift fryer.
One burger bar is not the business that buys a robot. §14.5 gates on venue
count, not cash.

### Surprises — every one of them a modelling error, not a tuning one
The gap was never the prices. Four bugs, in order of damage:

1. **A machine that walled in its own station.** A conveyor took the last access
   tile of the toaster it bolts onto; covers fell from 10,595 to **116** over
   ninety days while staff-hours went UP. Nothing checked whether a purchase
   stranded an existing station. D048.
2. **Saved attention became phantom unattended time.** Cutting assembly's setup
   conjured four seconds of "cooking" into an eighteen-second hand step, and
   §14.1 released the staffer to walk away into it. Buying a $1,250 pump bought
   extra walking, at -$4,778. D047.
3. **Machines charged for floor they do not take.** A clamshell replaces a
   flat-top; it does not stand beside one. D048.
4. **A broken machine was billed twice** — it stopped helping AND taxed its
   station 70%. §14.4 wants the first, not the second. D049.

And one economy finding: over-pricing was nearly free, because it suppressed
demand a one-staffer shop could not serve anyway. Charging over §8.2's fair band
now costs satisfaction on every order served. D050.

### Debt carried
- **The conveyor toaster is still -$1,841** of operating value with no floor
  cost and halved utilities. Covers fall 1.8%; waste FELL, so it is not
  staleness. **I have not isolated the mechanism and have not invented one.** A
  rung that is wrong for this shop is legitimate, but the reason should be
  understood before Act II.
- **D030** (`reconcile()` is a tautology) — still unfixed. Oldest open debt.
- **DEBT-1** — no inter-tick interpolation; walking still teleports.
- Machines have no on-screen presence yet beyond the install beat — §21.2 wants
  an idle and a working signature each, and §14.2's whole tier-3 payoff is the
  §21.5 mechanical/human motion contrast. **That is step 13 and it is the next
  step**, so it is scheduled rather than skipped.
- The §25.2 session model is still not applied to bots; needs offline accrual,
  step 20.
- Financing and resale still dropped from step 7. `src/save/` is still a
  `.gitkeep`.

**Next: step 13 — the rhythm beat.**

---

## Step 12 — superseded WIP note (kept for the record)
## Step 12 — the equipment ladder. **NOT DONE. The exit criterion fails.**

Committed because the machinery is real and tested, not because the step is
finished. **Do not treat this as shipped.**

### What is built and green
- `config/machines.ts` — six rungs of §14.2, each expressed as a change to the
  §14.1 attention split and **never** to the clock. Automation buys back
  attention, not time; nothing here has a `speedMultiplier`.
- Machines fit to a station, take their own floor tiles, draw utilities every
  trading hour whether busy or not (§14.3), and break at a rate proportional to
  their own run-hours and inverse to maintenance spend (§14.4).
- Preventive maintenance as one skippable weekly cost.
- All five §25.2 bots now exist.

### Why it is not done — measured, 90 days, four seeds

```
bot         cash      covers   stars
tightarse  $104,473   10,874   3.88     <- +85% over balanced
balanced    $56,465   21,993   3.32
roboboss   -$91,540   15,801   3.89     <- bankrupt
naive       $46,363   11,051   2.49
idle        $46,547    8,220   2.78
```

The exit criterion is that `tightarse` and `roboboss` both land within **25%**
of `balanced`. They land at +85% and −262%.

**The cause is the ladder, not the bots.** Every machine that can be afforded
loses money (2 staff, all week, 90 days, against $41,657 with none):

```
sauceRail         $41,264    -$393
conveyorToaster   $36,792  -$4,865
kiosk             $30,357 -$11,299
clamshell / autoLiftFryer / roboFry — never affordable in 90 days at all
```

Pricing is NOT the problem and was checked first: the price curve peaks at
100% ($46,547) and falls away both sides — 90% $40,380, 110% $44,463, 118%
$38,145, 150% $4,897. That dial is behaving.

I costed every machine against §14.3's "at least two of capital / floor /
utilities / flexibility / reliability" and never measured what the attention it
saves is actually worth. The costs are real and the benefit was assumed. Same
failure as D044, third occurrence of the pattern.

### What the next session should do
1. Measure the labour-seconds each machine actually removes per trading day at
   a realistic load, and price the rung against that, rather than against how
   impressive it sounds.
2. §14.5 gives the target the tuning must hit: labour **22–26%** of revenue
   heavily automated against **30–34%** without, "alongside a much larger capex
   and utilities line. Cheaper, not free, and far more brittle." Nothing
   currently measures labour share — build that readout first, then tune to it.
3. Re-check `tightarse` afterwards. Its +85% may be partly a knock-on: with no
   machine worth buying, the lean strategy has nothing to lose to.
4. Only then write `tests/step12.test.ts` with the ±25% gate.

**Step 12 is IN PROGRESS. Step 11 is the last completed step.**

---

## Step 13 — the rhythm beat. SHIPPED, with one honest caveat.

**What is now playable:** the kitchen changes character when you automate it.
A fitted machine is a cold blue-grey gantry with a cyan indicator standing
proud of the warm timber-and-steel bench it sits on, and its arm travels the
crossbeam on a fixed clock while the people around it never quite repeat.

### The contrast, built on both sides
- **Machines**: one period, identical phase for every unit of a kind, sawtooth
  stroke and return. Two clamshells move as one. `RENDER.RHYTHM` has no jitter
  field, no phase offset and no easing — there is nothing in it that *could*
  put two machines out of step.
- **People**: per-person phase AND speed (`MOTION.speedJitter`, declared at
  step 5 and unused until now), a sway beaten against the bob, wander while
  walking, fidget while standing.
- **A failure visible before it is notified**: a broken machine stalls partway
  through the stroke and buzzes there, tinted. It reads wrong instantly
  *because* everything else about a machine is perfectly regular.

### Found by the new gate, in my own work
The human gait had a bob:sway ratio of **3.934** — a 4:1 harmonic in all but
name. The two sines re-aligned every four steps, so a person visibly looped,
which is precisely the thing that makes a person read as a machine. Now
`bobHz / 2phi`: an irrational ratio never re-aligns.

I would not have caught that by looking. It came out of writing the gate.

### THE CAVEAT — what "verified" does and does not mean here
The exit criterion is *"a player distinguishes an automated kitchen from a
manual one at a glance, muted, with no labels."*

**The palette and silhouette half is verified**, from screenshots: cold blue
machine mass with a cool indicator against a sodium-lamp room, standing taller
than the bench line. That is a genuine at-a-glance read.

**The MOTION half is not verified and cannot be, from a still frame.** §21.5's
actual claim is about rhythm, and a screenshot has no rhythm in it. What is
gated is structural — that the two vocabularies differ in construction, that
the machine has no source of variation and the person has four, that the
periods are non-harmonic. That is a strong proxy and it is not the same thing
as having watched it.

Anyone continuing this should watch it move before trusting stage 2 is hit.

### Debt carried
- Motion contrast unwatched — see above. Needs a multi-frame capture or a human.
- Density stage 2 assessed against §21.1 with only two machines fitted, not a
  full stage-2 kitchen.
- The ticket rail still overlaps the assembly bench, though at six dockets
  rather than nine it no longer buries the kitchen.
- **D030** (`reconcile()` is a tautology) — still unfixed. Oldest open debt.
- **DEBT-1** — no inter-tick interpolation; walking still teleports.
- The conveyor toaster's -$1,841 operating value is still unexplained (D051).

**Next: step 14 — the ladder and the daily headline.**

---

## Step 13 — superseded WIP note (kept for the record)
## Step 13 — the rhythm beat. **IN PROGRESS.**

Committed because both halves of §21.5 are built and green, but the exit
criterion — *"a player distinguishes an automated kitchen from a manual one at a
glance, muted, with no labels"* — has **not been verified on screen**, and the
spec says this is the game's best visual moment and not to rush it.

### Built
- **Machines are on the floor**, sat proud of their host station so the station
  still reads underneath. Cold steel against the warm room, with the hard
  horizontal band that every piece of catering kit has and no person does.
- **The machine half of §21.5**: `RENDER.RHYTHM`. One period, the same phase for
  every unit of a kind, no jitter, no easing. Two clamshells are in perfect
  lockstep. A sawtooth stroke-and-return, because a sine reads as breathing and
  a mechanism does not breathe.
- **The human half**, which did not exist. `drawStaff` bobbed everyone on one
  clean sine — exactly as metronomic as a machine — so the contrast the whole
  step is about was two things oscillating. Now: per-person phase AND per-person
  speed (`MOTION.speedJitter`, declared at step 5 and unused until now), a
  second sway on a deliberately non-harmonic period so the gait never visibly
  repeats, sideways wander while walking, and a slow fidget while standing.
- **A failure visible before it is notified**: a broken machine stalls partway
  through its stroke and buzzes there, tinted. It reads wrong instantly
  *because* everything else about a machine is perfectly regular.

### NOT done
- **Not verified visually.** The first screenshot showed machines covering their
  stations entirely; that is fixed but unconfirmed. The exit criterion is a
  visual judgement and it has not been made.
- No `tests/step13.test.ts` yet.
- Density stage 2 not assessed against §21.1's table.

### RETRACTED — the "shipped-build hazard" was my own test harness

The previous commit claimed: *"At 70 arrivals an hour with one staffer, the game
stops... `state.openOrders` grows without bound and `ServiceSystem.tick` walks
all of it every tick."*

**That is false.** Measured headlessly:

```
rate  20  openOrders    1  | 6h of ticks:  4ms = 0.002ms/tick
rate  45  openOrders    0  | 6h of ticks:  2ms = 0.001ms/tick
rate  70  openOrders    3  | 6h of ticks:  5ms = 0.003ms/tick
rate 120  openOrders   12  | 6h of ticks:  5ms = 0.003ms/tick
```

`openOrders` does not grow without bound — §6.3 balking caps it, which is the
whole point of balking — and the sim costs three microseconds a tick at nearly
twice the saturation rate.

The freeze was **`machines={[]}` in my own debug harness.** An array prop is a
fresh identity on every render, and I had put it in `GameCanvas`'s `useEffect`
dependency list, so the Game was destroyed and rebuilt four times a second and
never advanced a tick. No error, because nothing was wrong — it was being
correctly torn down and correctly rebuilt, forever.

Fixed by depending on a joined key rather than the array object. That is a real
latent bug for any caller passing an array literal, so the fix earns its place
even though the crisis did not exist.

**This is the fifth unmeasured claim this session** (D023, D032, D044, D047, and
now this) and the first one I have shipped in a commit message. The pattern is
always the same: a confident mechanism written before the measurement. The
measurement here took four minutes.


---

## Step 14 — SHIPPED: the ladder and the daily headline

**What is now playable.** Every trading day ends on one line of plain English
drawn from that day's own figures, pinned above the covers count. Under it sit
the next two rungs — the nearer one naming the door it opens, the one after it
named only. Clearing a rung opens a capability and never pays cash: the pricing
and marketing panel is not on screen until the shop has served fifty covers in a
day, and the button is absent rather than greyed, because the refusal lives in
the simulation and the missing button is its consequence.

### The exit criteria

**"The harness dead-zone detector reports no decision-free gap over 3 game days
for any active bot."**

```
  §15.3 gate — nobody may go 3 game days with nothing worth doing:
    bot:naive      longest dead run  0d     0 days with no move   5.8 rungs banked
    bot:balanced   longest dead run  0d     0 days with no move   8.0 rungs banked
    bot:tightarse  longest dead run  0d     0 days with no move   8.0 rungs banked
    bot:roboboss   longest dead run  0d     0 days with no move   8.0 rungs banked
    bot:idle       longest dead run  0d     0 days with no move   6.0 rungs banked
```

Applied to all five bots, not just `balanced` as §15.3 names — a dead zone that
only spares the bot that plays well is still a dead zone. **The detector is
capable of reporting one**: before D057's fix it reported real 7-day and 5-day
runs for `naive` and `roboboss`, and three tests construct false cases directly.

**"Read twenty and cut any that could apply to any day."** Twenty are printed by
the gate on every run, so this stays a reading criterion rather than becoming a
boolean:

```
    d 1  Waste ate your Mon — 26 things binned, 17% of what you made.
    d 3  $2,861 through the till. Best day you have had.
    d 4  141 covers and nobody walked out.
    d10  Best Wed yet — 231 covers.
    d11  Lost 31 customers to the queue.
    d17  202 covers, nobody walked. second clean day in a row.
    d20  Waste ate your Sat — 221 things binned, 45% of what you made.
```

Eighty-four consecutive headlines were read end to end. Every line was specific
and true and *"Waste ate your Wednesday"* still landed five days out of seven —
specific is not the same as worth reading twice. So a repeat says what the
repeat means: **"the third day straight over a tenth of everything you cooked."**
Nine templates gained an `again` variant; two were rewritten because they read
wrong rather than because a test failed.

### What I got wrong, and how

- **The trade panel behind `secondStaff` disarmed the naive trap.** `bot:naive`
  never hires, so it never reached the rung, so it spent `AUD 0.00` on
  advertising for seventy days and finished indistinguishable from the shop
  nobody touched. Caught by the balance gate, not by reading. D056.
- **The roster on rung one cost `bot:balanced` $5,679** and pushed `roboboss` to
  exactly +25.0% against step 12's 25% ceiling. Ablation isolated it to the
  interaction of two gates that were each fine alone. D055.
- **`hadDecision` was tautological on its first draft** — it counted `hire`,
  which is affordable and unowned forever. D057, and D030's defect again in the
  function written to avoid it.
- **`decisionGap` took a "today" that meant two different things** at its two
  call sites, so every bot read a gap of ≥1 every day and 276 ordinary days
  looked dead. The parameter is gone.
- **The HUD grew to 40% of the phone** and the day's verdict rendered over floor
  tiles with the grout showing through. Only found by running `npm run look`.

### Adversarial pass — the exploiter's lens

1. **The rung panel emptied once Act I was cleared** — which `bot:balanced`
   reaches inside seventy days — leaving the most invested player with no stated
   objective. That is the readout version of the dead zone §15.3 forbids.
   `nextRungs` now falls through to the next act. **Fixed.**
2. `decisionGap`'s two conventions. **Fixed** by deleting the parameter.
3. `Game.ladder()` emptied `justUnlocked` as a side effect of a read. Renamed
   `takeLadder()`. **Fixed** — the consume is right, the silence was not.
4. `revenueAtDayStart`/`expensesAtDayStart` depended on system registration
   order. **Fixed by deletion** — `ledger.today()` already existed.
5. `brokenKit.again` said *"still 3 things broken"* when the count moves between
   days. Now *"3 things now"*. **Fixed.**
6. Three weekly rungs met in one week bank over three weeks. True, good, and now
   documented so it does not get "fixed".

### Known and not fixed

- **The headline is written at CLOSE**, so a customer already in the queue when
  the doors shut is not counted. Measured: 2 days in 84, always by exactly one
  cover. Moving it to cycle-end would put it after the day report is sealed.
- **The room is sparse and dark** in every screenshot — one person, empty floor.
  Not step 14's remit, but it is what the game currently looks like.
- **Covers and walkouts persist on screen overnight** with no "yesterday" mark.
- D054's debt stands: the motion contrast is still gated structurally and never
  watched. `npm run look` takes stills, and a still frame contains no motion.

---

## Step 15 — SHIPPED: weekly specials

**What is now playable.** Every Monday the shop picks next week's special from
a pool that opens as the ladder is climbed, and says how much to prep. The panel
puts all three of §18's sides on the row itself — what it draws (*Wed · +55%*),
what it leans on (*the fryer*), and what it costs to be wrong (*24 to prep,
binned if unsold*, in amber when the ingredient has no second life). Promoting
it costs $140 for the week and roughly doubles the crowd.

On the day, seekers walk in and buy it while there is stock. When it runs out
they walk in, find it gone, and leave — through the same door, into the same
walkout animation as anyone who got sick of the queue.

### The exit criteria

Measured, eight seeds, nine weeks, on a shop staffed to serve the crowd:

```
                       plain      promoted
  never run it        -$1,547
  under      (8)      -$1,076      -$2,385
  to spec    (24)     -$1,101      -$1,163
  sized      (46)          —       -$1,869
  over    (60/110)      -$209      -$2,726
  way over  (200)     -$3,318
```

- **A measurable cost for over-prepping.** −$3,318 at 8x spec against −$209 at
  2.5x, and promoted −$2,726 against −$1,163. ✓
- **A measurable cost for under-prepping.** Promoted, −$2,385 against −$1,163. ✓
- **86'ing a promoted special is worse than never running one.** −$2,385
  against −$1,547. ✓

**Stated rather than hidden: the UNPROMOTED column is flat.** Between 8 and 60
units the whole spread is inside the seed noise. Wings cost $2.40, so thirty-six
spare ones is $86 a week, and the shop is throughput-limited on a Wednesday
night so the small unpromoted uplift mostly becomes walkouts whatever is in the
fridge. The criteria are asserted where the mechanism has signal — which is also
the case §18's third clause names. Logged as DEBT below.

### What I got wrong, and how

Four attempts at §18's hardest clause, three of which measured fine at the time.
Full account in D059. The short version: a withdrawal threshold made announcing
an undeliverable special *free*; reconstructing the crowd at close counted a
whole day for a dinner spike; credibility alone is self-limiting rather than
punishing. It only became true when the disappointed stopped being book-keeping
and started walking through the door and taking up room.

- **The seeker roll shared the arrivals RNG stream** (D060), so switching
  specials on changed the whole arrival *sequence*, not just its rate. Every A/B
  in the harness was measuring the weather too. Three tests that passed against
  the contaminated numbers failed honestly once it was fixed.
- **Every `prepUnits` in the config was 2–3x too high** (D061). Two arithmetic
  errors under it: parties counted as covers, and `SEEKER_FRACTION` applied to
  every arrival in the window rather than the extra ones.
- **`.sheet-wrap` was a class that does not exist** (D062). No compile error, no
  test, no lint — the panel rendered under the bottom bar and half of it could
  not be tapped. Found by `npm run look`, which is now 2 for 2 on finding things
  no gate in this project can see.

### Adversarial pass — the performance engineer's lens

1. **The seeker roll shared the arrivals stream.** Highest severity, because it
   silently poisoned every measurement the step is judged on. **Fixed.**
2. `state.special.drawn` — written every tick by `ArrivalsSystem`, read by
   nothing after attempt 4 replaced it. D043's shape again. **Deleted.**
3. `openedThisWeek` — same. **Deleted.**
4. A special whose named day *is* the selection day would be binned twice and
   charged to `unitsProduced` twice. Nothing in the pool runs on a Monday, which
   is precisely why it would ship broken. **Fixed** by binning the outgoing
   special explicitly rather than whatever `running` happens to say.
5. `SPECIAL_BY_ID` lookup on every tick of every day forever. Real but small;
   short-circuits on `specialUplift <= 0` in the hot path. **Logged, not fixed.**

### DEBT carried out of this step

- **The unpromoted special is inside the noise.** Needs `uplift` and `unitCost`
  revisited in a balance pass; both are provisional and both move when
  `REAL_NUMBERS.md` lands.
- **A four-staff shop is unprofitable** at every special setting. That predates
  this step and is an over-staffing question, but it made the exit table read in
  negative numbers throughout.
- **No bot runs specials.** The five §25.2 bots ignore the mechanic entirely, so
  `npm run balance` says nothing about it. The step-15 gates live in
  `tests/step15.test.ts` instead.
- The per-tick config lookup above.

---

## Step 16 — SHIPPED: contracts

**What is now playable.** Once the shop is rated 4.0, somebody starts ringing
up with work — a fortieth at the bowlo wanting eighty burgers by Friday six, a
week on a festival site that takes two of your staff with it, someone with a
camera and two hundred thousand followers and no intention of paying. The offer
arrives as a card with two full-sized buttons, and *No thanks* is exactly as big
as *Take it*, because §16's guarantee is that saying no is free and a guarantee
you have to hunt for is one the design is quietly discouraging.

Take one and it becomes the line above your objectives, with the days left in it
and a bar that means the same thing on every job — including the influencer,
whose target is a ceiling rather than a floor.

### The exit criteria

Both are safety properties, so both are tested at the mechanism:

- **A contract can be failed without the run becoming unrecoverable.** Failing
  posts *nothing* — a spy watches `ledger.post` across a failure and requires no
  penalty account. The shop keeps trading and keeps banking rungs. Six failed
  jobs in a row leaves it badly rated, never negatively rated. ✓
- **A player mid-recovery can decline indefinitely and still progress.**
  Measured over ninety days: a shop that says no to every offer banks all ten
  Act I rungs, identical to one that accepts everything. Nothing on the ladder
  names a contract; a contract reward only ever opens a door EARLY. ✓

### What I got wrong, and how

- **Goodwill never decayed** (D063). A shop taking every job ran +0.71 stars
  above one declining every job, purely on the strength of jobs finished weeks
  earlier — a stat that maximises with no downside, banned by pillar. With 4%
  daily decay the edge is +0.09 stars and $11,387 rather than $48,204 over
  ninety days.
- **The whole system was invisible.** Offered, lapsed, and the player never saw
  it. Caught by the first-timer lens, not by any test.
- **The fourth action button shipped grey** and four buttons wrapped to two
  lines each on a 390px phone. The button rule listed selectors one at a time,
  so a new one fell back to the browser default. Found by `npm run look`.

### Adversarial pass — the first-timer's lens

1. **No UI at all.** Highest severity: a system the player cannot see is not a
   system. **Fixed** — offer card, active-job line, progress bar.
2. **Goodwill compounded forever.** **Fixed** by decay (D063).
3. **Four buttons wrapped; the fourth was unstyled.** **Fixed** — 2x2 grid, one
   shared rule for every secondary action.
4. **Three stacked objectives** — headline, contract, two rungs — left the room
   a sliver. **Fixed**: a deadline outranks an open-ended target, so a live
   contract takes a rung's slot rather than adding to it (D066).
5. `import.meta.env` needed Vite's ambient types the sim deliberately does not
   pull in. **Fixed** by narrowing inline.

### DEBT carried out of this step

- **Contracts are still worth ~$11k over ninety days against declining.** Real
  but no longer dominant. Whether that is the right size is a balance question
  for the pass that also owns step 15's flat unpromoted special.
- **No bot takes contracts**, so `npm run balance` says nothing about them —
  same gap as specials. §25.2's report is supposed to include "contracts taken
  vs failed".
- **`festivalStall` and `foodTruckDay` both accrue on `day.served`.** They
  differ in duration and in whether staff are removed, but the counter is the
  same one. Distinct enough to pass the "no two stresses alike" test, thinner
  than the other three in practice.
- The per-tick `SPECIAL_BY_ID` lookup from step 15 is still there.

---

## Step 17 — PARTIAL: legibility done, density measured, two criteria unmet

Logged honestly as partial rather than shipped. Two of the four exit criteria
are met and proven, one is met on a proxy, and one is not attempted.

### Met, and proven by test

**Reserved-hue enforcement (§21.3).** The rule turned out to be a saturation
rule rather than a hue rule — the literal reading failed 28 of 30 decorative
tokens, because the food ramp and the room share the entire warm half of the
wheel. See D067. Measured against the rule that survived, **the game was
failing**: the pilot lights (chroma 194) and sodium lamp (184) were louder than
ticketWarning (171), so the loudest thing on screen was a decorative dot.
Signals raised, decoration calmed, and it is visible in the screenshot — the
ticket rail is now unmistakably the thing your eye goes to.

**Motion budget degradation.** Implemented as a pure, tested function: nothing
culled below 24 bodies, capped at 18 fidgeting above that, ranked from the front
so it reads as depth, and the walk cycle never culled at any density. D068.

### Met on a proxy, stated as such

**"60fps with 40 customers and 12 staff on a throttled mid-range Android."**
There is no Android here. On Chromium at 4x CPU throttle, stage 4 (69–87
customers, 12 staff) costs **7.3–9.2ms of a 16.7ms frame**, sim plus render.
Comfortable, and the entity count is well past what the criterion asks for.

But the wall-clock numbers this container reports are worthless: a flat 83.3ms
per frame — exactly five vsync intervals — **unchanged from 16 entities to 86**.
It has no GPU and paces requestAnimationFrame in whole intervals. Real-device
frame rate is **unverified**, not met.

### NOT met, and not attempted this step

- **"Every shape readable at 12px."** The palette work is a necessary condition
  for it and not the whole of it. No shape has been rendered at 12px and looked
  at.
- **"A full service played muted loses no information."** There is no audio in
  the game, so it is trivially true and meaninglessly so. The real criterion —
  every sound has a visual twin — cannot be tested until there are sounds.
- **Particle systems with pooling** (steam, haze, conveyor motion): not built.
- **Auto-surfacing overlays** (congestion, walk distance, utilisation, queue
  age): not built.
- **Tier 1 detail pass** and the zoom-in-on-one-patty reward: not built.

### Found by looking, not fixed

**The ticket rail is a wall.** Six tickets render as large white rectangles in
front of the counter, hiding the kitchen they are reporting on. They also read
as floating rather than hanging on a rail. The signal now correctly dominates —
which is the moment its size becomes the problem. Next thing to fix in this
step.

### DEBT

- Everything in "not attempted" above.
- The fps harness cannot resolve better than ~2.6x. Fine as a regression
  detector, useless as a benchmark.
