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
