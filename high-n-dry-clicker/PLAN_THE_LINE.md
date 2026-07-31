# PLAN_THE_LINE.md — progression you can see, and a line you can arrange

**For Ben, after pass 3.** Written from two notes:

> *"there needs to be better visual feedback as the game progresses to get a sense that you are
> doing something. This will involve a lot of tweaking."*

> *"maybe as you add friers and staff you place them and it can speed up production or you can
> upgrade equipment etc."*

Opinionated on purpose. Argue with it. `SCALE_PLAN.md` still stands for the camera and the five
systems; this supersedes its §4 order of work.

---

## 0. The two problems, stated honestly

**Problem one: the shop looks the same at 10 tongs as at 100.** Between camera unlocks — which are
hours apart — buying things changes a number and produces a toast. The scene has a `busy` value
driving lamp brightness and traffic, and that's the entire visual difference between a struggling
shop and an empire. That is the actual complaint, and it's correct.

**Problem two: buying is the only verb.** Tap to serve, tap to buy. There's no decision in the
game — nothing where a player who thinks about it does better than one who doesn't. That's not
automatically bad (Cookie Clicker has no decisions either, and it's a classic), but it's why the
mid-game feels inert no matter how good the art gets.

They have one shared answer: **make the things you already buy show up as objects, and let you
arrange those objects.**

---

## 1. The rule that keeps this a clicker

`BUILD_BRIEF.md` §0 says: *one screen, one number, one thumb* and **a second gameplay screen means
you've gone wrong.** Placement is exactly the feature that grows a builder mode, a grid editor,
and a tutorial. So this plan amends the brief in one specific, bounded way:

> **Amendment.** The player may rearrange stations **within the shop scene they are already
> looking at**. There is no build mode, no editor, no grid screen, no second canvas. If a change
> requires leaving the counter view to make it, it is out of scope by definition.

And three guardrails that are not negotiable:

1. **Layout is a bonus, never a tax.** Hard rule 4 says the game never punishes. Any arrangement
   yields **at least** what the same purchases yield today. A bad layout costs you an unearned
   bonus; it never costs you output. There is no wrong answer, only a better one.
2. **The bonus is capped small.** Target **+40% at perfect**. That is worth less than a single
   tier upgrade. A player who never once drags anything is playing the game correctly.
3. **One tap gets you ~90% of it.** An auto-arrange ("let Kez sort it") is shipped in the same
   pass as the drag. Optimising by hand is a pleasure available to people who enjoy it, never a
   maintenance task for people who don't.

If any of those three slip, the feature has become a different game and should be cut.

---

# PART ONE — progression you can see

Five layers, cheapest and highest-value first. None of them touch the economy.

## 2.1 The best idea in this document: the 36 tier upgrades become the visual ladder

We already have `generatorTiers` — 12 generators × 3 tiers, unlocked at **10 / 25 / 50 owned**,
each a ×2. That is 36 purchases the player already makes, and **every single one of them is
currently invisible.** The most significant purchases in the game produce a toast and nothing else.

So: **each tier upgrade physically replaces the equipment.** Four visual states per station,
driven by things you actually buy, on a cadence the economy already paces.

| Station | Base (own ≥1) | ×10 | ×25 | ×50 |
|---|---|---|---|---|
| **Tongs** | one pair on the rail | a full rail of tongs | second rail, mise-en-place tubs | tubs, tongs, a prep bench that's clearly working |
| **Fryer** | single basket | double basket | bank of three, oil shimmer | auto-lift rig, baskets cycling on their own |
| **Grill hand** | one person at the grill | two, grill widens | three, second flat-top | four, the grill runs the full bench |
| **Front of house** | one at the register | two registers | a proper front counter, tap-and-go | four staff, order screens overhead |
| **Delivery hatch** | a hatch in the wall | hatch with bags waiting | a courier standing there | couriers queueing, bags stacked |

Venues (Rosebery onward) already have their own readout — the NOW TRADING board and the strip —
so their tiers light more windows on their frontage instead.

**Why this is the right move:** it costs no new economy, no new config, no balance risk. It takes
36 purchases that currently do nothing visible and makes them the backbone of progression. It is
also *exactly* Ben's "or you can upgrade equipment etc." — the system already exists, it was just
never drawn.

## 2.2 The purchase moment

Right now: a toast slides up. That's it, for every purchase in the game.

Instead, roughly 0.6s of ceremony, scaled to what you bought:

- **Ordinary unit** — the object appears with a small slam and a dust puff; the lamp ticks up.
- **First of a station** — the person walks in from the door and takes their place. You watch them
  arrive. (We have names and quirks already; this is where they land.)
- **Tier upgrade** — the old equipment goes dark, the new rig slides in, the camera pushes in ~4%
  and settles. The ticker names it in voice.
- **Camera unlock** — as built in Phase D.

Plus: the docket you tapped **tears off and flies to the rail**. Cheap, tactile, and it makes the
docket metaphor pay off instead of being decoration.

## 2.3 The horizon strip — the highest-value single element

A thin line under the till:

```
NEXT   FRYER  $231   ·   in 12s
```

The cheapest thing you can't yet afford, with a live countdown at current $/sec. When you can
afford it, it flips to `READY` in amber.

This is the most effective "am I getting somewhere" device in the genre and we don't have it.
Cookie Clicker doesn't either — that's one of its genuine weaknesses, not a thing to copy. It
converts idle time from *waiting* into *watching a number come down*, which is a completely
different feeling for the price of one DOM row.

## 2.4 Momentum — the actual answer to "am I doing something"

Keep a rolling sample of $/sec. Occasionally, in the ticker, in voice:

> *"Three times the money you were making twenty minutes ago. Nobody's noticed."*

A player's sense of progress is a **derivative**, and we currently never show it. This is a handful
of lines and it directly answers his note.

## 2.5 Ambient density — the continuous curve

Everything above is stepped. Between steps, the room should thicken continuously off total owned
and current $/sec: patties down on the grill, dockets on the rail, trays stacked, smoke volume,
grease on the flat-top, queue depth, how fast the crew move, how hard the lamp burns. Nothing
readable on its own — but it means there is **no flat stretch anywhere**, which is the real
failure mode.

---

# PART TWO — the line

## 3.1 Bays and roles

The bench is divided into **bays**, left to right, in the order food actually travels.

- Start with **4 bays**; a "fitout" upgrade family extends to **8**.
- A **station type** occupies one bay — you own 14 tongs, but Tongs is one station in one bay.
- Every station has a role, and roles have an order:

  **PREP → COOK → ASSEMBLE → SERVE**

  Tongs = PREP · Fryer = COOK · Grill hand = COOK · Front of house = SERVE ·
  Delivery hatch = SERVE. The grill itself is fixed at bay 0 and can't be moved — it's plumbed in,
  which is both true and a useful anchor.

## 3.2 Flow, pairing, and the cap

Two bonuses. Both are additive-to-1.0 and both floor at zero.

**Flow** — for each adjacent pair where the left station's role comes at or before the right's,
`+6%` global. Five pairs across six bays ⇒ **max +30%**. Arrange the line in food order and it
flows; arrange it backwards and you simply get 1.0×, not a penalty.

**Pairing** — a *person* adjacent to *equipment* of the same role gives that equipment's generator
`+15%`. Kez next to the grill; Dougie next to the fryer. This is the bit with actual texture,
because the people have names and you're standing them next to their kit.

**Cap: ×1.40 total.** In `economy.config.json`, asserted in the sim, and it does not move without
a deliberate decision recorded in `PROGRESS.md`.

Where it lands in the maths — it slots into the existing shape without disturbing it:

```
cps = Σ(owned_i × baseRate_i × genMult_i × layoutMult_i) × globalMult × flowMult × productionMult
```

## 3.3 The interaction — phone first, or it's worthless

Ben plays on an iPhone with a thumb. Dragging small objects on a canvas is miserable there, so
**tap-two-to-swap is the primary interaction** and drag is the bonus:

1. Tap a station → it lifts, and every bay shows a ghost of what swapping would give you.
2. Tap a bay → they swap, the staff member walks over, the readout updates.
3. Tap the same station again → cancel.

A live readout while a station is lifted: `FLOW +24%  ·  KEZ +15%`. Never a percentage in the
abstract — always attached to the thing it's about.

And **AUTO** — one steel plate under the scene. *"Let Kez sort it."* Solves the arrangement and
walks everyone to their new bays in one animation. With ≤8 bays the optimum is cheap to compute
exactly, so this is genuinely optimal, not a heuristic.

## 3.4 Why this can't become a chore

- Capped at +40%, so ignoring it costs less than one tier upgrade.
- You'd touch it maybe **eight times in a run** — only when a new station type arrives.
- No penalty state, ever, so there's nothing to *maintain*.
- AUTO is one tap and it's optimal.
- No timers, no decay, no "your layout has degraded". (Hard rule 7.)

---

# PART THREE — what this does to the engine, the sim and the gates

This is the part that decides whether the feature is honest, so it's not optional.

**State.** New field `layout: number[]` — bay index → generator index, `-1` for empty. Schema
version bumps; migration defaults to purchase order, which by construction scores ≥ 1.0×.

**Engine.** Layout resolution goes in `derive.ts` next to the other multipliers. Pure, deterministic,
no DOM. Bay count, role order, per-pair bonus, pairing bonus and the cap all live in
`economy.config.json` — config is law, no exceptions.

**Playbot.** Placement is a strategy, so the bot needs one. Two policies:

- `naive` — never rearranges. Purchase order forever.
- `tidy` — runs AUTO after every purchase.

**New assertions (G3):**

- **A7 — layout is a bonus, never a tax.** `naive` output ≥ the same purchases score today.
  This is the mechanical statement of hard rule 4, and it must be impossible to fail quietly.
- **A8 — layout is bounded.** `tidy / naive ≤ 1.45` at every sample across a 3h run.
- **A9 — AUTO is optimal.** For ≤8 bays, brute force and assert AUTO matches it.

**And the discipline that matters most:** the G4 pacing gates (B1/B2/B4) continue to be evaluated
on **`naive`**. A new system must never be allowed to quietly rescue existing pacing failures —
otherwise we've hidden B1 and B4 rather than fixed them, and we'd never know.

---

# PART FOUR — order of work

Part One first, in full. It's pure feedback, carries no economy risk, and it's the note Ben led
with. Part Two lands on top of a shop that's already worth looking at.

| # | Pass | What lands | Risk |
|---|---|---|---|
| **E1** | Tier ladder | 36 tier upgrades become visible equipment. §2.1 | none — drawing only |
| **E2** | The purchase moment | Ceremony, staff walk-ons, docket tear-off. §2.2 | none |
| **E3** | Horizon + momentum | Next-purchase strip, derivative in the ticker. §2.3–2.4 | none |
| **E4** | Ambient density | Continuous thickening off owned and $/sec. §2.5 | perf (G5) |
| **F1** | Layout in the engine | State, config, `derive.ts`, A7–A9, playbot policies | **the real one** |
| **F2** | Layout in the UI | Tap-two-to-swap, live readout, AUTO, staff walking | interaction |
| **F3** | Fitout | Bays 4 → 8 as a purchasable family | balance |
| **G** | Re-tune | Pacing with layout in play; **resolve B2** | balance |

Still outstanding from `SCALE_PLAN.md`, unchanged: **C** the rush, **E** rivals, **F** specials
board, **G** the sale as a set-piece.

**My recommendation: E1–E4, stop, you look at it.** That is the whole of his first note, it's
several hours of work, and it's the half where I can't go wrong. F1–F3 is a system with real
balance consequences and it deserves a fresh look after you've seen the feedback pass land.

---

# PART FIVE — what I'd cut first, and what worries me

**Cut first, in this order:** F3 fitout (4 bays is enough to make the point) · §2.2's camera
push-in (nice, not load-bearing) · pairing bonus (flow alone is a complete mechanic).

**What worries me, honestly:**

1. **Layout becoming an optimisation chore.** The single biggest risk. Mitigated by the cap and by
   AUTO shipping in the same pass — never later.
2. **Tap-two-to-swap being fiddly on a real phone.** I can test touch emulation, but emulation has
   already lied to me once this project (the start button). This needs your thumb, not my
   screenshot.
3. **Visual noise.** Tier 3 on every station at once could become soup. The ambient curve in §2.5
   must come *down* as stations get busier, not just up.
4. **Perf.** Four visual tiers × five stations × particles × three views. G5 exists for this.
5. **Me gold-plating the art and never resolving B2.** Worth saying out loud: the pacing gate has
   been amber for three passes now and none of this fixes it.

---

# PART SIX — decisions I need from you

1. **Scope of this pass** — E1–E4 then stop and look, or straight through to F3?
2. **Does layout mean anything, or is it flavour?** +40% at perfect is my recommendation: real
   enough to feel, small enough to ignore. Bigger makes it mandatory.
3. **B2, still open.** Every generator bought within a 3h sim; the top six never are. Raise the
   horizon for that assertion only, compress the ladder, or relax it. Compressing caused the 1e36
   runaway last time, so my recommendation is to raise the horizon and treat the top of the ladder
   as an explicitly multi-prestige goal.
