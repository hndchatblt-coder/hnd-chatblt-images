# SCALE_PLAN.md — how this gets big without getting boring

**For Ben. Written after the customer reframe landed. Opinionated on purpose — argue with it.**

---

## 0. The one sentence that must survive everything

**The shop is the readout.** Every number in this game should be legible as a thing on screen:
staff standing at stations, a queue out the door, a second venue's sign lighting up. The moment
progress becomes a row in a list, we're back to being a Cookie Clicker reskin.

Everything below is downstream of that.

---

## 1. The core idea: the camera pulls back

A clicker's problem at scale is that the numbers explode and **the screen stays the same size**.
Cookie Clicker answers with a longer list. We can answer with something a burger business actually
does: it takes up more space in the world.

Five zoom levels, one screen, same tap verb:

| # | View | What you see | What tapping does |
|---|---|---|---|
| 1 | **The counter** | Individual customers, faces, the grill | Serve a customer |
| 2 | **The shop** | Whole floor, staff at stations, queue to the door | Serve a customer |
| 3 | **The strip** | Your shopfront among neighbours, bikes pulling out | Serve a customer |
| 4 | **Sydney** | Real map. Leichhardt, Rosebery, Neutral Bay light up as you take them | Serve the busiest venue |
| 5 | **Everywhere** | Franchise dots spreading, supply lines, the absurd end | Same |

Three things make this work rather than being a gimmick:

- **You can always zoom back in and tap the counter.** Clicking never dies, it becomes a choice.
  That's the honest fix for "late-game clickers stop being clickers."
- **The pull-back is the reward.** Crossing a scale threshold isn't a toast, it's the camera
  physically retreating and the world you built coming into frame. That's the set-piece §2 of the
  brief keeps asking for ("crossing a power threshold is unmistakable without reading text").
- **It's still one screen.** Same canvas, same verb, no second gameplay screen. It zooms; it
  doesn't navigate. *(Flagging it because it stretches the brief's rule — your call.)*

---

## 2. Five systems that keep it fun on the way up

Ordered by how much fun per unit of work. Each is specific to this business, not generic idle-game
furniture.

### 2.1 People with names — **highest value, lowest cost**

There are **20 named staff already written** in the parked project (`managers.json`), with quirks
in exactly the right voice:

> **Deano** — Gun on the grill. Availability described as "spiritual."
> **Kimberley R.** — Has never once run out of brioche. Suppliers fear her.
> **Macca** — 17 years in hospo. Moves at one speed. It is the correct speed.

Hiring a generator shouldn't add `+1 grill hand`. It should hire **Deano**, who appears at the
grill, and whose quirk is a real (small) modifier. Suddenly your shop is staffed by people you
recognise instead of a counter.

Same trick on the other side of the pass: **regulars**. A customer who keeps coming back, gets a
name, orders the same thing every time, and tips if you serve them fast. The ticker already has
the joke written — *"A regular has ordered the same burger 400 times and still reads the menu."*

This is the single biggest character-per-hour win available, and the content is already approved.

### 2.2 The rush — time of day, and the frenzy made real

Golden Patty is currently an abstract floating bonus. Replace it with **the lunch rush and Friday
night**: the queue floods, the shop fills, the lamp goes hot, everything is worth more for 60-90
seconds. Same maths as a frenzy, but it's a thing that happens in a burger bar rather than a
mysterious glowing biscuit.

It also gives the day a shape — the brief's own §3 has a day/night cycle doing nothing yet.

### 2.3 The specials board — a real weekly decision

The board is already on the wall. `specials.json` (also already written) has patties, sauces and
gimmicks with **hidden demographic affinities**:

> Irish Curry Sauce · Midnight Menu · Kids Eat Free Tuesday · The Gauntlet Scratchie

Once a game-week you pick 1 of 3 generated specials. It either goes off — a named surge — or it
flops and you get a one-liner. **The flop copy is the joke engine**; the brief calls it a
first-class content type and it's the cheapest personality in the game.

Crucially it's a *decision*, and clickers are starved of decisions.

### 2.4 Rivals across the road — presence, never punishment

`rivals.json` exists: **Grillzilla Franchise Group** (340 stores, assembled not cooked) and
**PATTY CVLT** (no menu, no vowels, the queue is the marketing). Both have taunt copy written.

They open on your strip. Your arrivals dip a little. You respond — a special, a reel, undercutting
— and take the corner back. They **never take your progress** (pillar), they take *potential*.
They're there to give the world an opinion about you.

At Sydney scale they're colouring in the map you're competing for.

### 2.5 The sale — make prestige a set-piece

Right now "sell the business" is a menu action that resets numbers. It should be the most
memorable ten seconds in the game: the shop empties, the staff leave, the sign comes down, a new
sign goes up, and you're back at the counter on your own — but the world remembers you
(Goodwill). Then you climb faster and the pull-back happens sooner.

---

## 3. The idea that resolves a gate

Right now **G4 B2** fails: not every generator gets bought inside a 3-hour sim, because a 12-rung
×10 ladder is a multi-day climb. I flagged three ways out and said two were your call.

The zoom design answers it properly: **the ladder is not meant to be finished in one run.** It's
meant to span prestige cycles — that's what makes the second run feel fast and the pull-back feel
earned. So the right assertion isn't "every generator inside 3 hours," it's:

> Every generator is bought inside a **full arc** — three prestige cycles of casual play — and
> each individual run reaches at least one new rung it has never seen.

That keeps the assertion honest (nothing is unreachable, nothing is dead content) without
compressing the economy into something that explodes. **This is my recommendation for B2.**

---

## 4. Order of work

Each phase ends where the brief says it should: a gate, or you.

| Phase | Build | Proves | Gate |
|---|---|---|---|
| **A** | Composition + art pass on the current shop. Fix the sparse counter, restore the patty's status, fix the queue clipping. | The shop is worth looking at before we add to it. | **FEEL GATE** |
| **B** | Named staff + regulars (§2.1). Wire `managers.json`. | The shop has people in it, not units. | FEEL GATE |
| **C** | The rush (§2.2) replaces the abstract golden patty. Day/night starts mattering. | The loop has a heartbeat. | G4 |
| **D** | Zoom level 2 (**the shop**) and the pull-back transition. | The camera idea actually lands. | **FEEL GATE — the big one** |
| **E** | Specials board (§2.3). The weekly decision. | There's a choice worth making. | G3 + G4 |
| **F** | The sale as a set-piece (§2.5) + Goodwill perks. | Run two feels faster and better. | G3 |
| **G** | Zoom 3–4 (**strip, Sydney**) + rivals (§2.4). | The world is bigger than the shop. | G4 |
| **H** | Zoom 5, the absurd end, achievements, stats, settings. | Finished, not just working. | Exit criteria |

**Phase A first, deliberately.** The current scene is sparse and I know it. Adding systems on top
of a shop that doesn't look good yet just buries the problem.

---

## 5. What I'd cut, and what worries me

**Cut:** the abstract Golden Patty (becomes the rush), and the idea of finishing the ladder in one
sitting (it spans prestiges by design now).

**Three risks worth naming:**

1. **Arrival rate now caps click income.** Serving is throttled by how many customers exist — at
   the old 3s spacing, 25 taps earned $3. That's arguably a *feature* (clicking gets a natural
   ceiling, idle stays relevant), but it isn't in the sim, and A4's active-vs-idle ratio quietly
   assumes uncapped tapping. **Needs modelling before the economy can be trusted at scale.**
2. **Zoom is the expensive idea.** Levels 1–2 are cheap. Level 4 (Sydney) is a real chunk of work.
   If it gets cut, the game still works — but the "scale" answer gets weaker, so I'd rather build
   the transition early (Phase D) and find out.
3. **Scope.** The brief's whole point was scope discipline — one prototype finished to a high bar.
   This plan is bigger than that brief. Phases A–D are the version that stays honest to it; E–H
   are the version where it becomes its own thing. **Worth deciding which one we're building
   before Phase D, not after.**

---

## 6. The three questions I actually want answered

1. **Does the camera pull-back excite you, or is it me being clever?** It's the load-bearing idea
   here and the most expensive one. If it doesn't land, the plan reorders around people and rushes
   instead (B, C, E) and stays small.
2. **Named staff and regulars — right amount of texture, or too fiddly for a clicker?** It's the
   cheapest personality available and it uses copy you already wrote.
3. **A–D or A–H?** Small and finished, or big and yours. I'll build either well; I just want us to
   pick on purpose rather than drift.
