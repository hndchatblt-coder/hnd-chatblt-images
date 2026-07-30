# PROGRESS.md — High N' Dry: Clicker

Append-only iteration log. Terse. One entry per iteration or milestone.

---

## M0 — headless engine, config, sim harness · **G3 GREEN**

Built: `economy.config.json` (every number), `src/engine/` (config+validate, seeded RNG, state,
derive, engine, save, numbers — zero DOM imports), `sim/playbot.ts` (3 profiles × 3h),
`sim/assert.ts` (G3), `sim/tune.ts` (measurement tool, not a gate), 35 unit tests.

**Gates:** G1 typecheck clean · G2 35/35 · G3 6/6.

```
A1 cost curve              baseCost x 1.15^owned, bulk = sum of singles
A2 no dominated generator  all 12 best $/output for some window (max 56 owned needed)
A3 idle reaches prestige   123.0min, no softlock
A4 active vs idle          2.57x over 30min from equivalent progression (target 2-3)
A5 max upgrade step        4.42x (clk-reads), cap 25x
A6 first prestige casual   73.4min (target 45-120)
```

### Config values added during M0 (flagged per brief §5)

- **`click.baseCpsShare` = 0.01.** A tap is worth this share of one second's production, before
  upgrades. Added to fix A5 — see below.
- **`notation.groupSize`, `notation.scientificThresholdExponent`, `time.*`.** Unit conversions,
  so engine code holds no numeric literals.
- **`sim.profiles[].bootstrapTaps`.** See the idle-profile note below.
- **`prestige.minLifetimeRevenueToSell` tuned 1e6 → 8e6** to land A6 (was 35.8min, now 73.4min).

### Three findings worth Ben's attention

**1. A5 was red at 294× — fixed structurally, not by tuning.**
The "convert production into click power" upgrade (`clk-reads`) switched `cpsShare` on from zero,
so click power jumped 294× the instant it was bought. Fix: `cpsShare` is now a small non-zero base
(0.01) that upgrades **multiply** (×5, ×5, ×4) rather than switch on. Every step is now bounded —
largest observed 4.42×. Same end-state power, no cliff.

**2. A4 "active yields 2.0–3.0× idle over 30 minutes" — measured from equivalent progression.**
Measured from a *cold start* the answer is 84.5× and no amount of tuning brings it into a 2–3×
band. Reason: the gap is compounding, not additive — an active player buys generators earlier and
the lead grows exponentially. To force 2–3× from a cold start, clicking would have to contribute
almost nothing, which contradicts §3.3 ("keeps active play meaningful").
So A4 asserts the question I believe is intended: **fork one mid-game state, play 30 minutes
actively vs idly, compare.** That lands at **2.57×** with no special pleading. The cold-start
number is printed alongside as info, never asserted. **If you meant the cold-start reading, say so
— it needs a design change, not a tune.**

**3. The `idle` profile taps until it owns its first generator, then never again.**
A literal zero-tap profile can never earn its first dollar (cash 0, cps 0) — true of Cookie Clicker
too. "Idle-only reaches prestige without softlock" is really asking whether idle play is viable
after the opening. It is: first sale at 123min.

### Known, not yet due

- **Idle max dead window 419s** (G4 budget is 90s). G4 lands at M2; the early idle grind is the
  cause and the fix is early-ladder pacing. Not touched yet — fixing it now would be tuning
  against a gate that isn't running.
- Top generators unbought inside 3h at every profile. Expected — they're the late ladder; the
  3h sim just doesn't reach them.

### Interpretation call in GAME.md

Brief says "~60 upgrades" *and* five tiers per generator (which alone is 60). Resolved as 3 tiers
× 12 generators + 14 click + 14 global = **64**, with 100/150 thresholds held for a later content
pass. Flag if you'd rather have all five tiers.

---

## M1 — one screen: patty, tap, cash, one generator, save/load · **FEEL GATE 1**

Next. Stops for Ben. Question at the gate: **is the tap right?** Nothing else matters yet.
