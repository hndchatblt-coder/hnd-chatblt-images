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

Built: canvas scene (steel bench, heat lamp whose intensity tracks production, full-bleed grill,
the patty as hero), "The Sear" tap feedback, eased till counter, ticker, one generator, autosave,
offline settlement. 62 kB gzipped. Verified under iPhone touch emulation: taps register, purchase
works, save survives a page load, no console errors, no external requests.

### Iteration 1 — docket-to-rail removed, rising number restored

**Finding (Ben, FEEL GATE 1):** "The docket to rail is confusing."

**Diagnosis — structural, not a tune.** Four things wrong at once:
1. The metaphor was inverted. A docket on a rail is an order *to be made*, not a sale completed.
   Borrowing a real object from the subject's world and reversing its meaning reads wrong to
   exactly the audience that knows it.
2. It split the feedback from the action — tap at the patty, payoff at the top of the screen.
3. The rail carried no information: eight identical `$1` dockets that look like a readout.
4. It contradicted brief §2, which lists "a rising number" as a required part of every tap. I'd
   overridden an explicit requirement in my own design pass.

**Change (one):** removed the rail and the flying dockets; restored the rising number at the patty
— tabular mono, dark backing for legibility over flame/steel/patty, fast out and quick fade. Scene
reclaimed the rail's 44px, everything shifted up, canvas 372 → 328.

**Gate deltas:** G1 clean · G2 35/35 · G3 6/6 GREEN (untouched — this was a presentation change,
no economy values moved) · bundle 62.0 kB gzipped.

**Tooling fix along the way:** `npm run shots` hung forever on Playwright's internal
`document.fonts.ready` wait after any second navigation. Screenshots are now non-fatal and bounded,
so a flaky capture can't block the assertions.

### Still open for Ben

- Q1 from PLAYTEST.md: is one tap worth $1, or should the first tap feel chunkier?
- Q3 from PLAYTEST.md: is the patty the hero, or is the steel/lamp competing with it?
- The two M0 findings above (active-vs-idle interpretation, and the 294× cliff fix).

---

## M2 — full ladder + upgrade families · **G3 GREEN, G4 RED (1/4)**

Built:
- **UI:** all 12 generators with progressive reveal, the three upgrade families in a swappable
  panel, ×1/×10 bulk buy, per-generator readout ($/sec each, share of takings, next ×2 threshold),
  tier-crossing stinger, ticker pools now gated by progress. Still one screen — the patty never
  leaves; the shop list swaps beneath it.
- **Playbot now sells the business** (and buys perks). Without it the bot never restarted stronger,
  which is not how the game is played.
- **G4 assertions added** (B1 dead window, B2 every generator bought, B3 bought soon after unlock,
  B4 no purchase cliff) plus dead-window *location* diagnostics.

**Gates:** G1 clean · G2 35/35 · G3 6/6 GREEN · **G4 1/4** —

```
FAIL B1 no dead window        worst 419s (idle, starting 26min), budget 90s
FAIL B2 every generator bought unbought in 3h — idle misses 7, casual 6, tryhard 6
PASS B3 bought soon after unlock
FAIL B4 no purchase cliff     longest gap 173s (idle), budget 90s
```

### What I tried, and why it's reverted

To make the top rungs reachable I compressed the ladder to ×8 cost / ×5 rate. It worked for B2
(tryhard bought all 12) and it broke two other things: the tryhard profile went exponential —
**1e36 in an hour** — and the prestige loop turned chaotic and non-monotonic (share 1.0 → 1.2e8,
share 0.54 → 6e36, because higher click power made the bot sell constantly and reset its own
progress). Reverted to the Cookie Clicker curve, which is sane at every profile.

I also changed the bot's sell rule twice. First version sold whenever the gain beat a small
threshold, so it reset constantly and casual's final cps *fell* from 6.6e4 to 1.3e2. Now it sells
only when the permanent multiplier would at least double — 0/1/2 sales per 3h, which reads right.

Three balance changes in a row without a playtest between them is exactly what §8 says not to do.
Hence the revert, and hence the stop-and-ask below rather than a fourth swing.

### STOP-AND-ASK: B2 may be an assertion problem, not an economy problem

**"Every generator gets bought by every profile"** — inside a 3-hour sim, with a 12-rung ladder
whose rungs are ×10 apart. The 12th rung costs $14T. A Cookie-Clicker-shaped game reaches its top
building in days, not hours; that's the genre's shape, and the brief is explicit that the loop is
load-bearing and shouldn't be improved on.

So the three ways out, and I'm not picking one unilaterally because two of them change a pillar:

1. **Raise the sim horizon** for B2 only (e.g. every generator bought within 24 simulated hours,
   keeping the 3h run for everything else). Changes no game values. My recommendation.
2. **Compress the ladder** so 12 rungs fit in 3h. Tried; it needs the whole economy re-tuned around
   it and my first attempt exploded. Doable, but it's a different-feeling game — rungs stop being
   milestones and become steps.
3. **Relax B2** to "every generator bought by the tryhard profile". Weakest option, and it's
   weakening an assertion, which the brief forbids me doing on my own.

B1/B4 (idle dead windows) are a genuine economy problem and mine to fix — the idle profile catches
no golden patties by definition, so a long save-up is dead air with nothing to break it. That's the
next iteration once B2's direction is settled, since compressing the ladder would move it too.

---

## Reframe — customers in the shop · direction change, needs Ben's verdict

**Finding (Ben):** *"I want this game to be better. You are just copying cookie clicker. Before we
had customers coming to the shop and all kinds of cool stuff."*

He's right, and the brief is partly why: it asked for Cookie Clicker's exact skeleton and said not
to improve the loop. Followed literally, that produced something inert — you tap an abstract patty,
and buying fifty pairs of tongs changes a number and **nothing on screen**.

**Structural diagnosis.** In Cookie Clicker, buying a farm changes a number. In this game, buying a
fryer should change *the shop*. The scene was scenery; it needed to be the readout.

**The change:**
- **Tapping serves a customer.** Customers walk in, queue at the counter, glow when they're ready.
  Tapping empty air does nothing, so the queue is the target and the click has an object.
- **Generators physically appear.** Tongs on the rail, a fryer that bubbles, staff standing at
  their stations, a pickup hatch, and venues listed on a NOW TRADING board.
- **Staff serve customers on their own** — idle income made visible, marked with a small green tick
  so it reads without stealing focus.
- **Traffic thickens as you grow.** More staff, busier shop.
- Menu board added to the back wall; scene recomposed and tightened (H 440 → 330 across the pass).

The economy is untouched: tap = serve = clickPower, staff = cps. **G3 stays 6/6 green.** The
metaphor now matches the maths instead of fighting it.

### Finding that fell out of it

**Serving is throttled by arrivals.** With customers arriving every ~3s, 25 taps earned $3 — the
player physically cannot tap at the ~2/sec the economy is tuned around. Arrival gap cut to ~1.2s
(floor 0.35s) so there's always someone at the counter. Worth knowing that *arrival rate is now a
real economic lever* — it caps click income. That's arguably a feature (it gives clicking a natural
ceiling and makes idle matter), but it isn't modelled in the sim yet, and the playbot still assumes
uncapped tapping.

### Known and unfixed in this pass

Composition is still sparse: the counter band is empty, the patty has lost its status in the
corner, and the queue clips at the left edge. Deliberately not polished further — the direction
needs Ben's verdict before more time goes into the pixels.

---

## Phase A + B — the shop is worth looking at, and it has people in it

Ben: *"Yes yes let's pump it out make it make sense."* Built the first two phases of SCALE_PLAN.md.

**Phase A — composition.** The scene was structurally right but sparse. Fixed: the patty got its
size and status back (rx 30 → 40) on a wider grill; the empty counter band now carries a till, a
sauce caddy, a napkin dispenser and a tray stack; served customers leave through the door they
came in and fade rather than walking out through the left wall; the queue clears the left edge.

**Phase B — people with names.** The 20 staff from the parked project are now the crew:

- Hiring a station hires a **person**. First hire toasts *"Kez is on the grill hand. Locks up,
  sets the alarm, texts 'done'. Has never elaborated."*
- The ladder row reads **"Archie T. and 13 more"** with that person's quirk as the flavour line.
- Staff stand behind the counter in whites with their names above them.
- Roughly one customer in four is a **regular** with a name — a face you know, no mechanics.
- A fresh crew rolls in after every sale, which the ticker already jokes about.

**Deliberately flavour-only.** Quirks modify nothing, so the sim stays honest and nobody has to
balance a joke. That also means **G3 is untouched: 6/6 GREEN**.

**Gates:** G1 clean · G2 35/35 · G3 6/6 GREEN · G4 1/4 (unchanged — B1/B2/B4 still open and still
waiting on the B2 direction call in SCALE_PLAN.md §3).

**Three layout bugs caught by looking at screenshots, not by tests:** the tray stack was drawn
inside the grill; NOW TRADING sat on top of the menu board; and the staff were painted over by the
bench because they were drawn before it. All three were invisible to every automated check.

---

## Phase D — the camera pulls back

Ben: *"Keep building I want to see this scale."* The headline idea from SCALE_PLAN.md §1: one
canvas, three framings, with an animated pull-back between them.

**The counter** — what you had. **The shop** — your lit shopfront from the footpath, awning, sign,
crew in silhouette behind the glass, and the queue running out the door. **The strip** — six
frontages, yours lit and awninged, the rivals (GRILLZILLA, PATTY CVLT) cold and dim, delivery
bikes running the road.

The camera **earns** each step: front of house opens up the shop, a second venue opens up the
strip, and crossing the threshold pulls back once on its own — that's the reward beat. You can
always come back in, and tapping works at the counter *and* at the shopfront, so clicking never
dies. From the strip you're told to zoom in to serve.

The queue is **one logical line** the whole time; each view just looks at it from further away.
`place()` maps queue position to screen position per view — and the direction flips at the
shopfront, because from out on the footpath the door is on your right.

**The arrival cap was real, and it was hurting.** The playtest measured a thumb at ~2 taps/sec
getting only **0.83 serves/sec** — customers couldn't walk in fast enough, so the UI was quietly
capping click income at less than half what the economy is tuned for. Two fixes: the base arrival
gap drops 1.2s → 0.55s, and serving someone while the queue is short pulls the next person in
early ("the shop is busy because you are serving"). Re-measured: **1.65 serves/sec** at a 2/sec
tap rate, the remaining gap being the player's aim, not a system cap. Arrivals are UI-only, so
**G3 is untouched**.

**Craft pass, all of it found by looking at screenshots:**

- The zoom buttons were overlaying the canvas and sitting on the heat lamps → moved out of the
  scene into a DOM row underneath it.
- Customers bunched on the footpath → widened the shopfront spacing and ran the line away from
  the door instead of into the left wall.
- Staff names collided with the bench edge → put them on a plate.
- The customer side of the counter was a grey void → floor, perspective tiling, warm spill from
  the pass, and the queue moved up 18px to close the dead band.
- Window silhouettes were oversized blobs → half-height, seen over the pass.
- The strip's glow smeared a hard band across the sky → clipped per venue, plus a soft light-
  pollution dome above each open one.
- Leaving customers walked straight through the people still queueing → off twice as fast.

**Gates:** G1 clean · G2 35/35 · G3 6/6 GREEN · G4 1/4 (B1/B2/B4 unchanged — still waiting on the
B2 direction call in SCALE_PLAN.md §3). Touch playtest clean: no console errors, no external
requests, save survives reload.

---

## Pass 3 — the line, not the cookie

Ben: *"I want everything to look a lot better. Why is the patty so stupidly large. Look to other
idle games for inspiration. I think cookie clicker was the wrong direction."*

He's right, and right about the cause rather than the symptom. Full reasoning and the new palette
are in **DESIGN_TOKENS.md pass 3**; the short version:

**Why the patty was that big.** It was Cookie Clicker's cookie with a burger skin on it — the
click target the whole screen was composed around (pass 1 literally spec'd `THE PATTY — hero,
thumb zone`). The reframe moved tapping onto customers and *nobody took it off the stage*, so for
two milestones the largest, best-lit object on screen has been doing nothing at all.

**The redirect.** The screen is now a burger bar's **line**, cut away side-on, running left to
right the way food does. References taken deliberately: **Idle Miner Tycoon** for the side-cut
with workers at stations (the closest fit to what the shop was already trying to be, and the
reason a mascot object had to go — in a good idle game the screen is a *process*), **Egg, Inc.**
for the place physically growing, **AdVenture Capitalist** for the idea that throughput needs a
visible cycle rather than a number.

**What changed:**

1. **The giant patty is deleted.** Five to six small ones sizzling on the grill instead, each on
   its own cook clock so they come along rare-to-charred rather than pulsing in unison.
2. **Burgers travel the line.** Every serve, yours *or* your staff's, puts a burger on the pass
   and arcs it to the customer who ordered it. Your $/sec is now a visible rate of food leaving
   the kitchen — the single change that does the most work.
3. **The room warmed up.** Cream subway tile is the ground; the bench is stainless *accent*; the
   counter is timber with panelling and a kick rail; the dining floor is warm quarry tile in
   perspective. The old ground was grey-blue steel filling most of the frame, which is why the
   scene read cold no matter how many warm lamps were hung on it.
4. **The DOM chrome followed.** Warm charcoal, not blue steel — with the scene warm, the chrome
   was the last cold block and the split was obvious.
5. Staff got aprons and an edge (whites vanished into a light bench), NOW TRADING became an
   actual chalkboard, and the queue settles ~2× faster because a constantly-served front left
   people permanently overlapping.

**Floor perspective, worth writing down:** the first attempt drew parallel vertical joints and it
read unmistakably as a *brick wall behind the customers*. Joints have to run to a vanishing point
before a floor reads as a floor.

**Gates:** G1 clean · G2 35/35 · G3 6/6 GREEN · G4 1/4 (B1/B2/B4 unchanged — this pass was
entirely presentational; no config, no engine). Touch playtest clean.

---

## E1–E4 and F1–F3 — progression you can see, and a line you can arrange

Built to `PLAN_THE_LINE.md`. Six passes; the notable parts are the things measurement caught that
guessing would not have.

### E1 — the 36 tier upgrades become visible equipment

The ×2s at 10/25/50 owned were the most significant purchases in the game and **every one of them
was invisible** — a toast and nothing else. Each now physically replaces the rig: one basket in
the oil → two → three → an auto-lift gantry cycling them on its own; one cook at the grill → four
and a second flat-top; one bag on the pickup shelf → a rack of six.

This forced the bench into **bays**. Four people at a station is what tier 3 looks like, and at
fixed positions the crews ran off the right edge and stood inside the fryer. That skeleton is what
PART TWO needed anyway, so it was built once, here.

Front of house stopped wearing chef's whites in the same pass — at tier 3 eight identical figures
merged into one indistinguishable wall.

### E2 — the purchase moment

Gear lands with a pop and a puff of dust. The first of a station is a **person who walks in off
the street**, crosses the floor and steps up behind the counter. A tier upgrade leans the camera
in ~4% and lets it settle. The docket you tapped tears.

Verified by capturing frames *through* the walk. The first attempt drew the new hire with ordinary
hair and they read as another customer, which is why they now arrive in uniform.

### E3 — the horizon and the momentum line

`NEXT  FRYER  $231 · in 12s` under the till, flipping to READY. Turns idle time from waiting into
watching a number come down. Plus a rolling $/sec sample so the ticker can say *"three times the
money you were making twenty minutes ago"* — a sense of progress is a **derivative** and the UI
had never shown one.

### E4 — ambient density

A docket rail off the heat-lamp bar that fills with orders, mess accumulating on the bench, a crew
that visibly speeds up. The rail first ran across the bays and was completely hidden behind the
fryer and the crew; it now hangs where a real one does.

### F1 — the line, in the engine

**Two things measurement caught:**

1. With as many bays as placeable stations, **the default line was already optimal** — a tidy
   line scored 1.00× a naive one and the whole system was inert. Fixed by making bays *scarcer*
   than stations: everything you own produces normally wherever it is, the bench is only where the
   bonuses live, so the decision is which stations get the good spots — and that changes across a
   run as different generators come to dominate income.
2. **AUTO scoring the abstract multiplier was wrong.** A 20% bonus on a station earning 2% of your
   income is worth nothing next to the same bonus on the one carrying you. AUTO now maximises
   actual output, and A9 brute-forces it against deliberately lopsided weights.

Over five seeds a tidy line ends between 1.07× and 1.58× a naive one, **median 1.21×** — meaningful
without being mandatory. **G4 pacing stays measured on the naive policy** so this can never quietly
rescue B1/B2/B4.

### F2 — arranging it with a thumb

Tap a bay, tap another, they swap — in the shop scene you're already looking at. No build mode, no
editor, no second canvas. Drag was deliberately *not* the primary interaction: dragging small
objects on a phone is miserable. Anything owned but off the line sits on a labelled back shelf, so
"the shop is the readout" keeps holding when the bench is full.

AUTO lights up **only when a better line is actually available** — teaches the mechanic without a
tutorial and without nagging once the line is right.

Verified under touch: swapping bay 0 and bay 2 drops flow +16% → +8% (a smaller bonus, never a
penalty), and AUTO restores it *while moving the pairing to a different person than the default
had* — the evidence that the weighted objective is doing real work.

### F3 — the fitout, and a hole it exposed

Two purchasable fitouts extend the bench 3 → 5 bays. A fitout never raises the bonus **cap**; it
lets more of what you own be on the line at once, which is a safer lever.

**The hole:** the cap was only ever applied to a *displayed* `total`, while `derive.ts` multiplied
by the raw `flowMult`. At 3 bays nothing exceeded it so nothing showed. A fitout adds bays, adds
ordered pairs, and would have pushed the applied multiplier to ~1.58× against a 1.4 cap — silently.
The cap now scales what is actually applied, and **A8 tests the longest bench the game can ever
have**, not the starting one. It now reports exactly 1.400× at 4 bays, which is the cap doing its
job rather than a coincidence.

Buying bench and seeing nothing land on it was a weak purchase moment, so a fitout runs AUTO in the
engine — you paid for bench, the gear goes on it, rearranging afterwards is still yours.

### Gates

G1 clean · G2 41/41 · **G3 9/9 GREEN** (A7–A9 new) · G4 1/4 — B1/B2/B4 unchanged and untouched by
any of this, still waiting on the B2 direction call.

---

## The three systems that had no UI at all

Found while auditing for "is this actually a complete prototype": **the golden patty, selling the
business, and forty achievements were all fully implemented in the engine and completely
unreachable from the game.** Prestige is the entire long-term loop and there was no way to do it.

**The golden patty is a person now.** A coin drifting across the screen is a mobile-game
convention; someone walking in who is obviously worth serving is the same mechanic told in the
language of the shop. They come through the door under a moving wash of light, and the time you
have left is a ring closing around them — no countdown bar, no number. Tapping them takes priority
over serving, because missing the rarest thing on screen for a nearer customer would be miserable.

**The books.** A third panel: sell the business, spend goodwill on the six perks, and the wall of
forty achievements. Selling is a two-tap arm, not because we want to nag but because it is the one
irreversible act in the game — and when it lands, the room empties: everyone leaves, the camera
comes back to the counter, the venues go dark, and a crew who have never met you start tomorrow.

Verified end to end under touch: 43 goodwill awarded, the run reset to zero on the books, the
achievement wall **kept everything it had** and gained one, and all six perks became purchasable.
Nothing the player earned is ever removed — hard rule 4, checked rather than assumed.
