# PROGRESS.md — High N' Dry Tycoon

Append-only. One entry per milestone, each ending with the §18 adversarial audit answered before
the milestone is called done.

---

## M0 — headless core · GATE GREEN

Sim loop, one venue, both launch recipes, arrivals, staff working the recipe DAG, orders served,
day report to console, harness skeleton with `bot:idle`.

### What runs

```
$ npm run sim -- --days 7 --seed 42

D  0  in   32  balk   95 ( 74.8%)  served   32  wait  17.1m  sat  0.37  rev  $645.00  ...  rep 2.44
D  4  in   54  balk   94 ( 63.5%)  served   54  wait  12.8m  sat  0.54  rev $1079.50  ...  rep 2.44
```

That is a one-person shop drowning, and it reads as one — which is the point of doing M0 headless.
The tension model is legible in a text log before a single pixel exists.

### Gate

| Check | Result |
|---|---|
| Byte-identical across two separate node processes | PASS — 1411 bytes, identical |
| A different seed gives a different run | PASS — determinism isn't just "not random" |
| Seven days of trade | PASS |
| No orders stranded at close | PASS |
| Idle survives seven days | PASS — $16,874 |

---

### §18 Adversarial audit

**1. Name a decision where both options are defensible.**

Staffing, and it's measured rather than argued (`sweepStaff`, 14 days, seed 42):

| Staff | Gross | Reputation | Mean wait | Balk |
|---|---|---|---|---|
| 1 | $5,597 | 2.63 | 12.4m | 59.6% |
| 2 | $9,508 | 3.21 | 8.2m | 49.3% |
| **3** | **$11,010** | 3.58 | 6.7m | 45.2% |
| 4 | $8,177 | 3.63 | 6.1m | 41.1% |
| 6 | $1,152 | **3.81** | 5.7m | 38.6% |
| 8 | −$10,192 | 3.75 | 5.6m | 37.4% |

**Peak profit is three staff. Peak reputation is six.** Going from 3 to 6 costs $9,858 of gross and
buys 0.23 stars — and because `reputationMultiplier` has exponent 1.6, those stars compound into
demand later. Take the money now or buy the demand curve. Both are defensible, and which is right
depends on whether you're saving for a second venue.

**2. Any stat maximisable with no downside?** No, and this is now a standing test rather than a
claim — `tension.test.ts` fails the build if gross profit stops peaking in the middle of the
staffing sweep, or if overstaffing stops actually hurting.

**3. Any number hardcoded outside `src/config`?** Six, and the architecture test caught them, not
me: patience variance, the stamina→speed curve, the minimum work rate, the service-time smoothing
factor and the marketing decay. All moved to config. The half-life constant is now written
`exp(−LN2·age/halfLife)` so there is no bare literal in simulation code at all. **The test stays in
the suite**, so this can't rot.

**4. Does `sim/` import from `render/` or `ui/`?** No — asserted by test, along with no
`Math.random` and no wall clock anywhere in the sim.

**5. Same seed, same output?** Verified across two separate OS processes, not just two calls in
one process. Also verified that running 3 days in one call equals three 1-day calls, which is the
property speed multipliers depend on.

**6. Thumb, portrait, 390px, no hover?** N/A — no UI this milestone, by design.

**7. Every shape at 12px?** N/A — no shapes this milestone.

**8. Most boring 60 seconds of play right now?** All of it, honestly: there is no play. The most
boring *thing* is that the day report is identical in shape every day because nothing the player
could do exists yet. M1 fixes that by making the floor plan a decision.

**9. Is the newest system visible?** The day report *is* the milestone, and it shows the tension
model working: balk rate rises before reputation falls, exactly as §3 describes.

**10. What did I build that nobody asked for?**

Three things, and two of them I'd defend:

- **Config for content M0 doesn't use** — all three venues with grids, blocked tiles and service
  points; eight traits; station footprints. *Defended:* M1's gate is "moving the grill 6 tiles from
  the pass measurably drops throughput", and that needs the grid and service points to already
  exist and be real. Writing them now means M1 has nothing to invent. None of it is referenced by
  running code, so it costs nothing if it turns out wrong.
- **`sweepStaff` and `tension.test.ts`** — not in the milestone list. *Defended:* audit Q1 and Q2
  can't be answered honestly without measuring, and turning the measurement into a standing test
  is how it keeps being true.
- **The `--staff` CLI flag.** Nobody asked. It exists because the sweep needed it. Keeping it.

### Known and deliberately not fixed

- **Balk rate is very high** (45–60%) even at good staffing. Demand is currently uncapped by
  anything except staff throughput, and there is no way to *add capacity* — that's M1's stations
  and M2's hiring. Expect this number to fall a lot in M1.
- **Wages accrue but are never paid.** M0 accrues them onto the day; M2 pays them Sunday 23:00
  with penalty rates, which is when labour% becomes a real constraint.
- **`dtGameSeconds` is 12s**, coarser than the shortest recipe step (plate, 6s). Sub-tick steps
  finish in the tick they start, so durations under ~12s are effectively rounded up. Noted in
  `config/time.ts`; worth remembering when tuning recipes.
