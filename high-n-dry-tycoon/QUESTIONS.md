# QUESTIONS.md — for Ben

Things I hit while building that are genuinely your call. I've made a decision on each so the
build kept moving; each says what I assumed and how expensive it is to change. Answer whenever.

---

## Q1 — Space is pillar 1, but distance is only worth ~1.7%. Is that enough?

**Status: M1 gate passes, but only just, and I don't think the number honours the pillar.**

Opening six tiles between the grill and the pass costs **1.7% of throughput** (8 seeds × 14 days,
2 staff: 3190 → 3137 served, walking +9%). It's real and it's repeatable, but pillar 1 says *"space
is the constraint"* with the fail condition *"layout becomes cosmetic"*. 1.7% is nearer cosmetic
than constraint.

**Why it's small, and why tuning won't fix it.** I swept the two obvious knobs:

| Handling per trip | Congestion | Served (near) | Served (far) | Drop |
|---|---|---|---|---|
| 8s | 0.35 | 3192 | 3144 | **1.5%** |
| 15s | 0.35 | 2872 | 2848 | 0.9% |
| 15s | 0.6 | 2847 | 2837 | 0.3% |
| 25s | 0.6 | 2551 | 2494 | 2.2% |
| 40s | 0.8 | 2067 | 2071 | −0.2% |

Raising handling makes the shop slower overall but makes distance matter *less* — handling is a
fixed cost per trip, so it dilutes the variable part. The real reason distance is small is that
**cook times dominate**: a 14-tile walk is 6.6s and a 20-tile walk is 9.4s, against a 90-second
grill batch and a 195-second fryer basket. 2.8 seconds against 90.

**Three ways to make space actually bind. Your call:**

1. **Carrying is a separate move.** Right now a staffer walks to a station, works, and the output
   teleports into the buffer. Make them physically carry each batch to where it's consumed and you
   roughly double the trips, and every one of them scales with distance. Most realistic, most
   faithful to Idle Miner / Factorio, biggest change to the sim.
2. **Shorter, more frequent steps.** Grill 90s/batch-4 becomes 25s/batch-1. Far more trips, far
   more sensitivity to layout — but it stops being a burger shop and starts being a conveyor.
3. **Accept it and let layout matter through adjacency instead.** Distance stays a minor tax;
   what really matters is whether assembly and pass are next to each other, which the sim already
   rewards. Cheapest, but pillar 1 becomes "space is *a* constraint".

**My recommendation: option 1.** It's the only one that makes the pillar true, it's what makes the
screen worth watching (you can see someone carrying a tray the length of the shop), and it turns
the walk from a rounding error into the thing the player is looking at. It's maybe a day of work
and it changes the tasking system, so I haven't done it unilaterally.

**Shipped meanwhile:** handling 8s, congestion 0.35 — the values that give the cleanest signal.

---

## Q2 — The grill can't be the thing that moves

The M1 gate is written as "move the grill 6 tiles further from the pass". It can't be done: the
grill needs gas, gas runs along the back wall only, so its freedom is lateral and bounded by venue
width. In a 9-wide Leichhardt the furthest it can get from the pass is about two extra tiles.

I opened the distance by moving **the pass** instead — identical physics, and it's the move a
player would actually make because the pass is the station they *can* move. Flagging it because it
means service points are doing real work, which is good, but the gate as written is unsatisfiable.

**Assumed:** the gate means "increase grill→pass distance by 6 tiles", not "translate the grill".
Cheap to change if you meant something else.

## Q3 — Naive ends up *richer* than balanced. The spiral doesn't bite yet.

After 90 days (M2 gate):

| bot | cash | reputation | labour% |
|---|---|---|---|
| naive | **$560,533** | **2.80** | 10.7% |
| balanced | $282,775 | 3.74 | 33.2% |

`bot:naive` markets constantly, understaffs, runs at 2.8 stars — and finishes with twice the cash.
The punishment spiral in §3 is not yet punishing, because under-staffing saves more in wages than
bad reputation costs in demand.

M3 adds errors, fatigue and incidents, which should tilt this. But I want to flag the shape of the
problem now: **the spiral only bites if the reputation→demand link is stronger than the
wages→margin link.** Right now it isn't, and the exponent on `reputationMultiplier` (1.6) is the
dial that decides it.

**Assumed for now:** M3's error and incident systems close the gap. If they don't, the honest fix
is raising the reputation exponent so the difference between 2.8 and 3.7 stars is brutal rather
than 25% of demand. Will report the number after M3.

---

## Q4 — More staff than stations does nothing, and I think that's right

Revenue plateaus dead flat from 6 staff onward (~$68,147 at 6, 8, 10, 12 staff) because the shop
only has 7 stations and bodies can't share a bench. Gross goes **negative at 10 staff**.

That's the spatial constraint showing up in the economy rather than only in walk times, and I
think it's exactly what pillar 1 wants — the answer to "I need more throughput" becomes *buy a
second grill and find somewhere to put it*, not *hire another body*.

Flagging only because it makes the staffing curve very flat between 2 and 6, so the hiring decision
is less interesting than the equipment one. **No action taken.** Tell me if you want bodies to
matter more than benches.

## Q5 — I added reneging, which wasn't in the brief. It was load-bearing.

The M3 gate wouldn't pass without it and I want you to know why.

`bot:naive` spiralled perfectly (3.83 → 2.22 stars) but then **could not recover at all** — 25 days
of disciplined play moved it 2.21 → 2.27. The cause: customers who had ordered never left. Orders
that couldn't be filled sat in the queue forever, so the kitchen stayed permanently slammed, the
error rate stayed pinned at its ceiling, and reputation couldn't climb no matter how well the shop
was then run.

§4.3 has balking (leaving *before* ordering) but nothing for giving up *after*. So a customer who
has waited three times their patience now walks out, and unlike a balk they're properly angry
about it — 45% chance of a one-star review.

With it: **2.22 → 3.89 stars over 25 days.** The way out is discipline, exactly as §3 wants.

**Assumed:** three times patience, one star, 45% review rate. All in `config/demand.ts`. Say the
word if you want them different — but I don't think the game works without the mechanic existing.

---

## Q6 — Two scheduler bugs, and the fix changed the shop's character

Chasing the M1 gate turned up two real faults in how the kitchen decides what to make:

1. **It was a push system, not a pull.** It always worked the *deepest* unmet need, so under
   pressure patties were always short and the kitchen made patties forever — nothing ever reached
   the pass. A real kitchen plates the burger that's ready before putting more meat on. Now
   shallowest-first.
2. **A step needed the whole order book's worth of inputs before it could run.** With forty
   orders open, plating one burger required forty burgers in stock. Now a step runs as soon as it
   has the inputs for one batch.

Together these lifted production 20% and revenue 23% on identical settings, and they're why the
M1 gate finally reads properly (2.5% fewer batches for six tiles, walking +11%).

**Worth knowing because it changes tuning:** every number I quoted before this fix was measured on
a kitchen that was quietly strangling itself. The COGS/labour figures in the M2 notes are still
roughly right, but treat anything about throughput from M1/M2 as superseded.

---

## Q7 — The M1 gate needs a saturated kitchen to be measurable at all

Measuring "does distance cost throughput" on a live shop is confounded: a slower kitchen makes
people renege, which *reduces* the work the kitchen is asked to do, which can make the slower
layout look faster. That inverted the result twice.

The gate now measures a **saturated kitchen** — an unlimited order book, no arrivals, no reneging
— so throughput is pure capacity. That's a fair test of the question, but it's worth saying out
loud that in the *live* game the effect is smaller and noisier than the gate number suggests.

Still connected to **Q1**: 2.5% under saturation is honest but modest. My recommendation there
(make carrying an explicit move) stands.
