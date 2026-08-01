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
