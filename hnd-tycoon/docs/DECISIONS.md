# DECISIONS

Append-only log of choices that deviate from the spec, or that resolve an
ambiguity the spec left open. One entry per decision. Keep them short.

Do not delete entries. If a decision is reversed, add a new entry that says so.

---

## D001 — Inlined mulberry32 instead of `seedrandom`
**Step 1. Status: active.**

The spec names `seedrandom` in the stack. Used an inlined mulberry32 instead.

Why: zero dependencies; the entire PRNG state is a single uint32, so it
serialises into the save file with no special handling; and behaviour is
guaranteed identical across Node versions and browsers, which matters because
byte-identical output is a gate.

Cost: none identified. Reverse by swapping `src/sim/rng.ts` if a distribution
property is ever needed that mulberry32 can't provide.

---

## D002 — `npm run gate` composite script
**Step 1. Status: active.**

Added a single `gate` script chaining boundaries → typecheck → test → balance,
so the per-step gate is one command and can't be partially run by accident.

---

## D003 — Money as integer cents, not float dollars
**Step 0. Status: active.**

The spec requires the P&L to reconcile to the cent over a 90-day run (step 6
gate). Float dollars cannot do that — `0.1 + 0.2` alone breaks it, and a 90-day
run accumulates thousands of additions.

`Money` is `{ cents: integer, currency: CurrencyCode }` with an arithmetic
module that refuses to mix currencies. Test `money.test.ts` sums 10,000 × $0.10
and asserts exactly $1000.00.

---

## D004 — §26 enforced by the type system rather than by review
**Step 0. Status: active.**

The forbidden-hardcode list was documentation, and documentation loses to a
deadline. Every item that could be a type now is one: branded `GameTime` and
`Tiles`, `Money`, `Site`/`SiteKind`, `ReputationMap`, generic `Route`.

Cost: slightly more ceremony at call sites. Worth it — these are the exact
mistakes that are free today and a rewrite in Act III.

---

## D005 — Pending gates as `it.todo` tests
**Step 0. Status: active.**

Exit criteria in `BUILD_PLAN.md` are prose, and prose gates get declared
"essentially met". `tests/gates.pending.test.ts` restates them as todo tests to
be unskipped at the start of each step, failed, then passed.

---

<!-- Template:

## D00N — Title
**Step N. Status: active | superseded by D00M.**

What the spec said, what we did instead.

Why.

Cost, and how to reverse it.

-->
## D006 — `GAME_SECONDS_PER_TICK` was wrong by a factor of 14,400
**Step 2. Status: active.**

`clock.ts` shipped `TICKS_PER_GAME_SECOND = TICK_HZ * (1 / REAL_SECONDS_PER_GAME_HOUR) * 3600`,
which evaluates to 1200. The correct value is 1/12 — ten ticks per real second
and thirty real seconds per game hour is three hundred ticks an hour, so twelve
game seconds a tick. The line's own comment ("= ticks per game hour / 3600")
described the right calculation and the code did a different one.

Nothing consumed it yet, which is why nothing caught it. Every recipe duration
in the game is charged against this number, so it would have been the first
thing to go wrong at step 2 and very hard to see once it had.

Replaced with `GAME_SECONDS_PER_TICK = TIME.SECONDS_PER_HOUR / TICKS_PER_GAME_HOUR`
and a correct reciprocal. `SECONDS_PER_HOUR` moved into config on the way past.

---

## D007 — one `GameTime`, not two
**Step 2. Status: active.**

`GameTime` was branded in `src/sim/types.ts` AND declared again with a
different brand in `src/sim/clock.ts`. Two structurally incompatible types with
the same name, which defeats the point of branding them at all. `clock.ts` now
re-exports the one in `types.ts`.

---

## D008 — the tick is a budget, not a step
**Step 2. Status: active.**

A tick is twelve game seconds. The obvious implementation advances each job by
one whole `dt` per tick and moves on, which silently makes every step cost at
least twelve seconds no matter what the recipe says — flattening the difference
between a 6s plate and a 195s fryer basket, which is most of the production
game.

Instead each staffer gets a per-tick budget of seconds and spends it: a job
that finishes with budget left releases the rest into the next job in the same
tick. `KitchenSystem.tick` interleaves advance and schedule until neither makes
progress.

Cost: more code, and a backstop counter. Worth it — step 3 charges walking
against the same budget, which is only possible in this shape.

---

## D009 — hard rule 5 is a check now, not a note
**Step 2. Status: active.**

CLAUDE.md says `npm run boundaries` enforces the first four hard rules
automatically, leaving "zero magic numbers outside `src/config/`" to review.
Review loses to a deadline. Rule 5 is now enforced: bare numeric literals in
`src/sim/` fail the gate, allowing only 0, 1, 2 and 100.

It found two violations the moment it was switched on. `src/sim/rng.ts` is
exempt by path — mulberry32's multiplier is an algorithm constant, and moving
it to config would not make it tunable, it would make it a landmine.

---

## D010 — `src/sim/scenario.ts` is the only place a world gets assembled
**Step 2. Status: active.**

System registration order changes RNG consumption order and therefore every
balance number. The CLI, the tests and the harness were each about to build a
world by hand. They now all call `buildScenario`, and the ordering rationale
(arrivals → kitchen → service) is documented at the one place it is decided.

---

## D011 — step 2's six ambiguities, answered by Claude rather than by Ben
**Step 2. Status: active — Ben may overturn any of these cheaply.**

The questions-first protocol says never to invent an answer and proceed
quietly. Ben was unavailable, so these were decided loudly instead: stated in
the session summary, recorded here, and each one cheap to reverse.

1. **"One station" vs a five-station recipe.** BUILD_PLAN says "one station,
   one staff agent"; the cheeseburger DAG needs five station types. Built one
   instance of each type with a single staffer covering all of them. Collapsing
   to one generic station would have made the DAG gate test nothing.
2. **"Doubling speed halves wait"** holds only at light load. Asserted as a
   band (25%–55% of baseline) rather than an equality. Measured: 41% at 14
   arrivals/hr, because doubling speed removes the queueing as well as the
   service time.
3. **Flat arrival rate** = the site's own `baseFootTraffic` (Leichhardt: 14/hr).
   Daypart and day-of-week curves arrive at step 10.
4. **A customer orders one item**, 70% burger / 30% chips, in `config/demand.ts`.
5. **Batches are sized to outstanding need**, capped by capacity. Deliberately
   over-filling is par-cooking and must arrive at step 4 as a decision with a
   cost, not as the step-2 default.
6. **No balking and no reneging yet** (step 10). A saturated kitchen therefore
   queues without limit, which is informative rather than a bug.

---

## D012 — the gate moves the pass, not the grill
**Step 3. Status: active.**

BUILD_PLAN step 3 says "moving the grill six tiles from the pass". At
Leichhardt the grill cannot move six tiles from anything: gas runs along the
back wall only, so sliding the grill sideways changes its distance to the pass
by one or two tiles at most.

So the six tiles are opened from the other end — `leichhardtStretched` is
byte-identical to `leichhardtTight` except the pass sits at y=3 instead of y=9.
Grill-to-pass goes from 5 tiles to 11. Same measurement, same intent.

This is worth noting rather than hiding, because it is itself the finding: the
service points are a harder constraint than the floor area. You do not choose
where the grill goes. You choose what you build around it.

---

## D013 — staff carry output to whatever consumes it
**Step 3. Status: active.**

§7.1: "path to a station, execute a step, carry output onward. Distance
between dependent stations is the throughput tax."

A job therefore has three phases — travel, work, carry — all charged against
the same per-tick budget as the work. The output does not enter the buffer
until someone has physically walked it to the station that needs it, and the
staffer ends up standing there, so the next job at that station is free.

The alternative (a global buffer credited the instant cooking finishes) would
have made the distance between dependent stations cost nothing at all, and
made the floorplan a diagram.

---

## D014 — Q1 answered at 4% now, with 10% carried forward to step 4
**Step 3. Status: active — supersedes the recommendation in QUESTIONS.md Q1.**

The step 3 gate measures **6.6% of covers** (6.7% of batches) over 8 seeds on
a saturated kitchen. QUESTIONS.md Q1 recommended a >=10% floor.

It is short, and the cause is measurable rather than mysterious: walking is
**4.0% of staff time** in the tight layout. It cannot cost more of the day than
it occupies. Staff currently stand and watch a 90-second patty and a 195-second
fryer basket, because attention profiles do not exist until step 4 — `work`
outweighs `walk` 25:1.

Two things were deliberately NOT done. The walk speed was not slowed until the
gate went green, and the tile size was not inflated. Either would have produced
a passing number and buried the finding.

What was done instead: the assertion is set at >4%, which is what the model
honestly supports today, and `tests/gates.pending.test.ts` carries a step 4
gate re-running the identical comparison at 10%. If step 4 does not get it
there, Q1's threshold is wrong or walking is too cheap, and that is a
conversation with Ben rather than a tuning exercise.

**This also suggests steps 3 and 4 are ordered wrongly.** The spatial tax
cannot be honestly measured while a staffer is pinned to a fryer for three
minutes. Not reordering them — step 3's floor is a prerequisite for step 4's
multi-station assignment either way — but the pivotal number belongs to step 4.

---

## D015 — the grid key is derived, not a constant
**Step 3. Status: active.**

Tiles hash to integers as `y * width + x`, taking width from the site rather
than a fixed stride. The first draft used `y * 1e4 + x`, which the magic-number
check (D009) caught. Deriving it removed a latent aliasing bug at the same
time: any site wider than the stride would have collapsed two tiles onto one
key, silently.

---

## D016 — the six-tile delta is 9.4% of covers and 3.6% of capacity, and my step 3 prediction was wrong
**Step 4. Status: active — supersedes D014's prediction, not its principle.**

D014 predicted that attention profiles would roughly triple the spatial tax,
on the reasoning that staff-seconds per cover would fall by two thirds while
the walking stayed the same.

**That was wrong, and wrong in an interesting direction.** Once a staffer can
walk away from a cooking patty, they have idle time — and extra walking eats
the idle time before it eats production. The raw capacity tax actually FELL,
from 6.7% of batches to 3.6%.

What did not fall is what a customer experiences. Measured at the saturation
knee (85 arrivals/hr, where the tight kitchen serves 96% of arrivals):

|  | tight | stretched |
|---|---|---|
| covers | 4459 | 4039 |
| mean wait | 19.1 min | 51.8 min |
| walk share of staff time | 12.9% | 21.4% |

**9.4% of covers, and nearly triple the wait.** The stretched kitchen does not
fail so much as fall behind and never catch up.

So the honest answer to "how brutal is space" has two halves, and only one of
them is about walking:

1. **Placement feasibility is the hard constraint.** The grill can only sit
   where the gas is; the fryer needs gas AND extraction, which is five tiles in
   the whole building. That already binds and will bind much harder at step 12
   when a clamshell grill wants two of those tiles.
2. **Walking distance is a real but secondary tax** — a few per cent of
   capacity, amplified into ~10% of covers and 2.7x the wait once the kitchen
   is at its limit.

Q1 stays open with this data attached. Six tiles is 2.4 metres; asking 2.4
metres to cost 10% of a burger shop's *capacity* may simply not be realistic,
and the covers figure is rate-sensitive enough that quoting it alone would be
cherry-picking.

---

## D017 — cooking advanced up to 64 times per tick
**Step 4. Status: active.**

The advance/schedule interleave runs until nobody can make further progress.
The first draft of unattended cooking sat inside that loop, so every pass
advanced every cooking job by a full tick.

Found by instrumenting station utilisation rather than by a test: the fryer
logged **123% of trading hours** against a workload implying 49%, and the
grill 52% against 40%. The inflation scaled with how much of a step was
unattended, which is what identified it.

Cooking now advances once per tick, before the loop, and charges the station
only for the cooking it actually did rather than a whole tick per call.

The class of bug is worth remembering: anything that advances on wall-clock
rather than on a consumed budget must live outside that loop.

---

## D018 — one saturation rate, exported once
**Step 4. Status: active.**

`SATURATION_RATE` lives in `src/harness/probe.ts` and is imported by both test
files and `npm run floor`. It moved from 45 to 85 at step 4 and three separate
copies would have drifted silently, which is precisely how a layout comparison
comes to be measured at the wrong load and report the wrong sign.

---

## D019 — the density stage 0 gate is NOT claimed
**Step 5. Status: open — needs Ben.**

BUILD_PLAN step 5's exit criterion: *"Someone unfamiliar watches for 30 seconds
and correctly describes what's happening, unprompted. You want to keep watching
it. If you don't, stop and fix it before proceeding."*

That is a human gate. Nothing here claims it and no test asserts it. What has
been done instead: everything the human gate depends on is tested (§12's
cross-section orientation, the continuity of the food ramp, the reserved-hue
rule, the sim/render boundary), and a playable single-file build ships with
this commit so Ben can close it himself.

Reporting a human gate as passed on the strength of a passing typecheck is the
exact failure `CLAUDE.md` describes as "essentially met". It is not met until
someone has watched it.

---

## D020 — the back wall and the extraction hood
**Step 5. Status: active.**

Neither is in the spec. Both were added because the first render was
illegible without them.

The floor alone read as a rectangle floating in a void, and worse, the top rows
of floor and the empty frame above them were indistinguishable. A tiled wall
with a hard skirting line fixes that in one move.

The extraction hood is the better of the two. It hangs over the gas run and
nowhere else, so the screen now *states* the constraint that §7.1 encodes:
the grill lives at the back because that is where the extraction is. That is a
rule the player would otherwise have to be told.

---

## D021 — single-file build, `play/index.html`
**Step 5. Status: active.**

Ben plays on an iPhone. Two delivery paths do not work and are not worth
retrying: the in-chat file preview (renders markup, does not execute
JavaScript, so the game looks frozen) and asking him to download an `.html`
and open it from Files.

`vite-plugin-singlefile` produces one self-contained 648 kB file, committed to
the repo and served through `raw.githack.com`. Verified with Playwright **touch**
emulation (`isMobile`, `hasTouch`, no mouse) before sending — a desktop
`click()` passing is not evidence that a tap works.
