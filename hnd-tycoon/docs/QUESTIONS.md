# OPEN QUESTIONS

Ben answers these. Claude Code **adds** to them and **never answers them
itself** — see the questions-first protocol in `CLAUDE.md`.

Status: `OPEN` / `ANSWERED` / `DEFERRED (blocks step N)`.

When a question is answered, move the answer inline, mark it ANSWERED, and if
it changes anything structural, log it in `DECISIONS.md`.

---

## Q1 — How brutal is space? `OPEN — blocks step 3`

Step 3's gate says moving the grill six tiles from the pass "measurably drops
throughput". No floor was set. If the delta is 2%, layout is decoration and
design pillar one is dead.

**Recommendation: ≥10% throughput drop for six tiles**, asserted hard in the
test. Higher makes the spatial puzzle savage and Rosebery (7×22) nearly
unplayable; lower makes it cosmetic.

Ben: pick a number. It propagates into every venue shape.

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
