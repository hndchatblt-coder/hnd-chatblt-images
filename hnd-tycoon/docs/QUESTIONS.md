# OPEN QUESTIONS

Ben answers these. Claude Code **adds** to them and **never answers them
itself** — see the questions-first protocol in `CLAUDE.md`.

Status: `OPEN` / `ANSWERED` / `DEFERRED (blocks step N)`.

When a question is answered, move the answer inline, mark it ANSWERED, and if
it changes anything structural, log it in `DECISIONS.md`.

---

## Q1 — How brutal is space? `MEASURED at step 3 — still needs your number`

Step 3's gate says moving the grill six tiles from the pass "measurably drops
throughput". No floor was set. If the delta is 2%, layout is decoration and
design pillar one is dead.

**Original recommendation: ≥10%.**

**Measured: 6.6% of covers, 6.7% of batches**, 8 seeds, saturated kitchen,
grill-to-pass 5 tiles vs 11. Run `npm run floor` to see it.

It is real and it is consistent, but it is short of 10%, and the reason is
worth understanding before you pick a number: **walking is only 4.0% of staff
time**, so it cannot cost more than that. Staff currently stand and watch a
90-second patty and a 195-second fryer basket, because attention profiles are
step 4. Once tend time is separated from elapsed time, staff-seconds per cover
should fall by roughly two thirds and the same six tiles should bite about
three times as hard.

So the honest position is: the pillar holds directionally, the magnitude is
pending step 4, and the assertion is currently set at >4% with a 10% gate
carried forward. Nothing has been tuned to make either number look better —
see D014.

Ben: pick a number for after step 4. It propagates into every venue shape.

---

## Q2 — Real economy numbers `OPEN — blocks step 6, wanted before step 2`

Everything in `src/config/` is currently invented. See `docs/REAL_NUMBERS.md`
for the fill-in template. This is the single highest-value input to the whole
project: it makes the sim authentic *and* makes balancing possible by eye.

---

## Q3 — Real floorplans? `OPEN — blocks step 3`

Current floorplans are invented: Leichhardt 9×15 with a column at (4,7),
Rosebery 7×22, Neutral Bay 11×11.

Real shapes would be better and are exactly the detail that makes this yours.
But real floorplans in a public build is a different question from a personal
one — and the ship target is deferred (Q5). Safe default: keep the invented
shapes, tuned to *feel* like the real ones.

---

## Q4 — Do you start with a running shop or an empty room? `OPEN — blocks step 19`

Current: one grill, one staffer, already trading on day one. Alternative: the
real story — Leichhardt six years ago, buying the fitout, first service.

Changes the opening ninety seconds, which is the highest-leverage minute in
the game.

---

## Q5 — Ship target `DEFERRED by Ben`

App store / personal / in-venue cabinet — decided later.

**Cheap to defer**, because the constraints that would have driven it are
already settled: code-drawn art means no asset licensing, no IAP is a stated
anti-goal, and telemetry is local-only.

**One thing it does block:** real staff names (Q6). Do not ship a public build
with real employees' names in it without asking them. Until the target is
decided, use the fictional Aussie hospo roster.

---

## Q6 — Real staff names? `BLOCKED by Q5`

Named characters is the mechanic (§22.1). Archie and Kimberley appearing would
be charming. Hold until Q5 resolves, and ask them first regardless.

Default until then: fictional names, renameable by the player.

---

## Q7 — Working title `OPEN — blocks nothing`

"High N' Dry Tycoon" is a placeholder invented during spec work. No mechanical
consequence; rename whenever.

---

<!-- Template:

## QN — Title `OPEN | ANSWERED | DEFERRED (blocks step N)`

What's ambiguous, what the options are, what the recommendation is and why.

-->

## Q8 — Is 150 covers a day and a 4-minute wait right for Leichhardt? `OPEN — blocks nothing`

Step 2's baseline: 14 arrivals/hour over an 11-hour day gives ~150 covers and a
mean wait of 3.8 minutes. Both are invented and both are inside the band the
gate accepts, so the gate is not evidence they're right.

Four minutes feels fast for a burger cooked to order. If the real number is
8–12, the whole production economy is more strained than what's currently
modelled and the first hire matters much sooner.

Answer via `docs/REAL_NUMBERS.md` — this is Q2 in a specific, cheap form.

---

## Q9 — One staffer caps at ~40 covers/hour, then throughput *falls*. Intended? `OPEN — blocks nothing, informs step 8`

Measured over 8 seeds:

| arrivals/hr | covers/day | mean wait |
|---|---|---|
| 14 | 156 | 3.8 min |
| 30 | 329 | 7.2 min |
| 45 | 427 | 58 min |
| 70 | 346 | 270 min |

Two things worth a look. Forty covers an hour from one person is high — it
comes from batching, which gets *more* efficient as the queue deepens, and the
real constraint on a single human isn't modelled until attention profiles land
at step 4. And past the knee, throughput doesn't plateau, it drops: the one
staffer thrashes between the pass and the grill.

The drop is emergent, not scripted, and it is exactly the "punishment spiral"
of §4. It is also precisely what step 8's bottleneck readout has to be able to
name in plain English. Flagging now so step 8 is measured against it.

## Q10 — Waste at 11% of covers during a rush. Right? `OPEN — blocks nothing`

Make-to-order with a two-hour triple-rate rush bins about 256 units over five
days against 2258 covers. Away from a rush it bins **nothing at all** — waste
only appears when the kitchen is overloaded and cooked food sits waiting for
someone to come back for it, which is the correct shape.

`docs/REAL_NUMBERS.md` asks for waste% and this is the number to check it
against. If real High N' Dry waste is 3–5%, the lapse penalty is too harsh or
the freshness windows are too short.

---

## Q11 — Is a 3.6m x 6.0m shop right for Leichhardt? `OPEN — blocks step 5`

Nine tiles by fifteen at 40cm a tile is 3.6 metres wide and 6 metres deep.
That is a small shop, and step 5 is about to draw it.

Two ways to fix it if it is wrong: more tiles, or bigger tiles. **More tiles**
is the right lever — the 40cm tile is calibrated against the station
footprints in §7.1 (a 2x1 grill is 80cm of bench, which is correct), so
changing tile size would break every footprint at once.

A rough width and depth in metres for each of the three shops is all that is
needed. Part of Q3.

## Q12 — one cook is ~5x too productive, and that is now the only thing left `OPEN — blocks the whole economy`

After the audit fixes, hiring pays for itself at 85 arrivals/hour and does not
at the shipped 14. Break-even sits somewhere around 70.

The shipped rate is not the problem — raising it to 70 would mean 770 covers a
day out of one small room, which is absurd. **The problem is that one modelled
cook absorbs 152 covers a day at roughly 20% occupancy.** That is about 55
covers per labour-hour; a real quick-service kitchen runs 6–12.

The gap is that the sim models the cook line and nothing else. Real hospitality
labour is mostly *not* cooking: taking orders, packing, restocking, prep before
service, cleaning after it, and simply being there through the quiet hours.

Three ways out, and this one is genuinely yours because it decides what the game
is about:

1. **Build the register (§7.1, §12).** It is in the spec, it is not built, and
   it adds unavoidable per-customer labour at the front of house. Most faithful,
   most work, and it makes the front half of the shop — currently empty floor —
   mean something.
2. **Add a fixed daily labour requirement.** Open, prep, clean, close. Models
   the real shape (labour that does not scale with covers) in one config value.
   Cheapest, and it is honest about why a quiet Monday still costs you a wage.
3. **Just scale up per-cover attention.** Fastest, least honest, and it makes
   every §7 prep time disagree with the spec.

My recommendation is 2 then 1: the fixed daily requirement immediately makes 150
covers a day need two or three people, and the register then earns its place as
a real station rather than as a balance patch.

Answer this and the shop stops being a trap at the rate the game actually ships
at.
