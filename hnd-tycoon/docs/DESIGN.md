# BUILD PROMPT — "High N' Dry Tycoon" (working title)
### v5 — five-act scope ladder, build-ready

**Paste this whole document into Claude Code as the project brief. Build milestone by milestone. Run the gate at the end of each one before moving on.**

---

## 0. How to use this document

Nine milestones, M0–M8, which together build **Acts I and II**. Acts III–V are specified at design level in §2 and are *not* built now — but §26 lists the architectural decisions that must be made correctly today so they remain buildable later. Violating §26 is the one category of mistake this project cannot recover from cheaply.

1. **Simulation before pixels.** M0 is headless. If it isn't interesting as a text log of numbers, no amount of animation saves it.
2. After each milestone: `npm run test`, `npm run balance`, then run the **adversarial audit** (§27) and fix what it finds *before* reporting back.
3. Every tunable lives in `src/config/*.ts`. Zero magic numbers in simulation code.
4. Commit at each milestone with a message describing what is now playable.
5. §24 lists settled decisions. **Do not relitigate them.**
6. **There is no art milestone.** From M1 onward every milestone ships something visibly better than the last, and every gate includes a visual Definition of Done. §21 and §25.4.
7. Read §1, §2 and §21 before making any balance or architecture decision.

---

## 1. The game

### 1.1 One paragraph

You run High N' Dry, a flame-grill burger bar. Customers come in off the street, order, and wait. You buy equipment, hire staff, and lay out a physical kitchen so food gets out fast. Marketing brings more customers; capacity determines whether that was a good idea. Serve well and reputation climbs, which multiplies demand. Over-promise and reviews tank, demand collapses, and you spend a long time digging out. You cannot lose — you can only make expensive mistakes. As you grow you automate the line with real kitchen equipment, expand to more venues each with an awkward floorplan of its own, and eventually run a supply network between them. And then it keeps going: a nation, a fleet, and — if it earns the right — orbit.

**Tone:** affectionate, grimy, Australian hospitality. Penalty rates. Cool-room breakdowns. A delivery driver leaving one star because the app told him the wrong pickup time. Made by someone who actually runs burger shops. **This tone never breaks, at any scale.** See §2.6.

### 1.2 The one-sentence spine

**The game is about progressively letting go of control, and every act takes more of it away from you.**

That is the through-line that makes a burger shop and an orbital colony the same game. In Act I you see every patty and can tap a ticket to expedite it. By Act V you are sending doctrine to a station forty light-minutes away and finding out hours later whether it worked. The idle genre's core promise — *it runs without you* — stops being a convenience feature and becomes the actual subject matter.

Design consequence: **each act must remove an affordance, not just add scale.** If an act only adds more of what came before, it has failed and should be cut.

### 1.3 Where this sits in the genre — and where it departs

The canonical idle game is a seesaw between exponentially rising costs and polynomially rising production, resolved periodically by a prestige reset handing back a permanent multiplier. That produces unbounded numbers and, eventually, a game where only the newest generator matters.

**We are not building that.** Three departures, each with a replacement:

| Convention | We do instead | Because |
|---|---|---|
| Exponential unbounded growth | **Stacked S-curves.** Each venue saturates at a real capacity ceiling set by floor area, equipment and staff. Growth resumes only by automating, expanding, or restructuring supply. | A restaurant has a physical ceiling. That ceiling *is* the game. |
| Prestige reset | **Scope escalation.** Five acts, each with a different verb and a different constraint. §2. | Wiping a business you built is thematically absurd and the genre's least-loved mechanic. Scope escalation delivers the same "new game" feeling without the loss. |
| Newest generator dominates | **Specialisation.** Every venue has a distinct daypart profile, rent, spend-per-head and floorplan, and later a distinct role in the network. Venue 1 becomes the commissary anchor. | The dominant known failure mode of multi-generator idle economies. Design against it explicitly. |

---

## 2. The five acts

This section is the reason v5 exists. Read it before anything else.

### 2.0 The rule that makes it work

Each act must satisfy all four:

1. **A new verb.** What the player physically does changes.
2. **A new hard constraint.** Something scarce and physical, not a cost curve.
3. **An affordance removed.** Something you could see or touch, you now can't.
4. **The same four numbers.** COGS%, labour%, waste%, reputation follow you the whole way.

Point 4 is what stops this becoming three games in a trenchcoat. Point 3 is what stops it becoming one game with bigger numbers.

### 2.1 Act I — The Shop

**Verb: PLACE.** **Constraint: floor tiles and service points.** **Unlocks: start.**

One venue. You lay out stations against a fixed floorplan with gas, extraction and plumbing in annoying places, hire named staff, watch food get made, and tap tickets to expedite. Full visibility, zero latency, total control. This is the baseline the rest of the game takes away from you.

Failure mode: bad service, walkouts, the review spiral.

### 2.2 Act II — The Group

**Verb: ROUTE.** **Constraint: truck capacity, delivery windows, the spoilage clock.** **Unlocks: 3 venues.** **Affordance removed: you can no longer watch everything.**

Three to six venues plus a commissary. You cannot be in three kitchens at once, so you stop placing and start delegating: role preferences, par levels, standing orders. The city tier becomes the main view and individual venues become things you check on.

The supply network is a small vehicle-routing problem where the objective is COGS% and the failure mode is a venue running dry at 7pm Saturday. Full detail in §17.

Failure mode: a venue starves while you're looking at another one.

### 2.3 Act III — The Nation

**Verb: DELEGATE.** **Constraint: variance and local taste.** **Unlocks: 8 venues at group reputation ≥ 4.3.** **Affordance removed: you can no longer see individual venues at all.**

You stop opening shops and start licensing them. Franchisees run venues you don't control, to standards you write. The game becomes about **variance management**: you no longer optimise a mean, you clamp a distribution.

New mechanics:

- **The playbook.** You author standard operating procedure — par levels, staffing floors, ingredient tier, menu scope, service targets. Tight playbooks reduce variance and reduce upside; loose ones let a good franchisee outperform and a bad one embarrass you.
- **Franchisee quality** is a hidden distribution you sample when you sign one. Due diligence costs money and time and narrows the distribution. Signing fast is cheaper and riskier.
- **Local taste.** Each region has a taste vector. The Sydney flagship burger is not the right product in Perth, let alone Osaka. Adapting the menu regionally costs supply-chain complexity — you've just broken your volume tier by needing two mince specs.
- **Brand contagion.** This is Act III's version of the review spiral, and it's the whole tension. One franchisee running dirty damages the *national* reputation, which drags demand at venues that did nothing wrong. You find out through aggregate metrics and audit sampling, not by watching. Auditing costs money; not auditing costs more, later, unpredictably.
- **Competitors.** For the first time, someone else is taking your customers. They open near you, they undercut, they copy your special. Market share becomes a real number.

Failure mode: you scale faster than your standards, variance blows out, and the national reputation slides while every individual dashboard looks fine.

**Why this is the right Act III:** it's the honest next problem for a real operator, it removes exactly the affordance the act needs to remove, and it converts the game's existing reputation machinery into something structurally new rather than bigger.

### 2.4 Act IV — The World

**Verb: SATURATE.** **Constraint: airspace, range, charge cycles, regulatory approval.** **Unlocks: national saturation.** **Affordance removed: you can no longer choose your customers.**

The burger drone fleet. Last-mile delivery goes autonomous, and the unit of expansion stops being a shop and becomes **coverage** — a radius over a map, contested with competitors doing the same thing.

- **Drones are the last rung of the automation ladder** (§14), and they obey its rule: they trade a labour problem for capital, range, charge-cycle scheduling, weather downtime and a spectacular new failure class. A grounded fleet is worse than never having had one, because you dismantled the courier relationships.
- **Dark kitchens.** Production sites with no dining room, sited to maximise drone coverage rather than foot traffic. The spatial game returns in a new form: you're now placing on a *city map* instead of a floor grid, and the same intuitions apply one scale up.
- **Regulatory approval per territory.** Airspace is granted, not bought. A safety incident can revoke it, and revocation is regional and slow to reverse.
- **Territory contest.** Overlapping coverage means margin war. Saturating a territory you can't supply is the Act IV version of over-marketing, and it produces the identical spiral at a national scale.

Failure mode: overreach. You take airspace you can't supply, service degrades across a whole region at once, and a regulator grounds you.

**Tonal note:** "burger drone army" is played entirely straight. Nobody in this game says the word army. It's a fleet, it has a maintenance schedule, and the P&L line is called *Fleet — depreciation and charge*. The comedy is that it's all deadly earnest and you're still checking COGS%.

### 2.5 Act V — Orbit

**Verb: DOCTRINE.** **Constraint: light-lag and lift cost.** **Unlocks: post-launch, only if Acts III–IV land.** **Affordance removed: real-time control, entirely.**

The final and most complete removal. You cannot manage a restaurant forty light-minutes away. You cannot expedite a ticket. You cannot even see the current state — only a state that *was* true, hours ago.

- **You send doctrine, not commands.** Standing policies, decision trees, thresholds. "If wait exceeds X, cut the menu to these three items." You are writing the operating system for a place you will never visit, and then watching a news feed to find out how it went.
- **Lift cost.** Everything shipped up costs enormously per kilogram, so the closed-loop question becomes central: what do you grow, brew, culture or print on-site versus lift? This is the supply meta's final form and it's genuinely a different puzzle, not a bigger one.
- **Colony sites** are the last spatial layer: a fixed volume with power, water, thermal and atmospheric constraints replacing gas, extraction and plumbing. The Act I skills apply again, one more time, under alien rules.
- **The report is the game.** Act V's entire UI is arguably an inbox. That's a bold, correct, and slightly frightening design, and it's why Act V is gated on the earlier acts actually being good.

Failure mode: a colony fails slowly and you learn about it after it's already happened. No loss state, but a genuine, earned sadness — which is more than most games in this genre ever attempt.

### 2.6 Holding the tone across five acts

The single biggest risk in this plan is tonal collapse — the game becoming a different, sillier thing around Act IV and losing what made it worth building. Three rules:

1. **Never wink.** Universal Paperclips works because it plays a paperclip company annexing the cosmos completely straight. The moment the game acknowledges its own absurdity, the spell breaks and it becomes a joke that isn't funny twice.
2. **The P&L never changes.** Same four numbers, same layout, same monospace column, on the shop floor and in orbit. This is the strongest tonal anchor available and it costs nothing.
3. **The people persist.** Staff hired in Act I should still be nameable in Act III — as area managers, as the franchisee you trained, as the one who told you they'd have a word after service and then didn't leave. The hospitality warmth is what stops the late game becoming a spreadsheet, and it's free once §22 exists.

### 2.7 Honest scoping

Acts I and II are M0–M8 and are a complete, shippable game on their own. **Ship them.** Act III is expansion 1, Act IV expansion 2, Act V expansion 3 — each gated on the previous one being played and enjoyed, not on enthusiasm.

The work required *now* is not to build Acts III–V. It is to avoid the dozen architectural decisions that would make them impossible or ruinously expensive later. That list is §26 and it is the most important part of this document.

---

## 3. Design pillars

| Pillar | Means | Fail condition |
|---|---|---|
| **Space is the constraint** | Throughput limited by floor shape, station placement, walk distance. | Layout becomes cosmetic and the player just buys more grills. |
| **Every dial fights another dial** | Marketing↑ → demand↑ → wait↑ → reputation↓ → demand↓. Staff↑ → throughput↑ → wages↑ → margin↓. | Any single stat can be maxed with no downside. |
| **The bottleneck is always visible** | The player can see which constraint binds and what it costs. | Player knows something is wrong but not what. |
| **Automation trades problems, never removes them** | Every machine converts a labour problem into a capital, space or reliability problem. | An upgrade is strictly better than not having it. |
| **Each act takes something away** | Scale removes an affordance, not just adds numbers. | An act is the previous act with more zeroes. |
| **Every upgrade shows on screen** | If you bought it, you can point at it. Density escalates visibly from quiet to manic. | An upgrade is a stat line. The screen looks the same on day 60 as day 6. |
| **Mistakes are recoverable and slow to fix** | No game over. Bad decisions cost days, not the run. | Punished with a loss screen, or punished with nothing. |
| **You can see the food** | The production chain is visible and legible. | Food becomes an invisible counter. |
| **Attention is rewarded, never required** | Sim runs unattended and while closed. | Any mechanic requiring a tap within N seconds. |
| **There is always a next thing** | Player can name their next two goals without opening a menu. | "What am I working towards?" |

---

## 4. Core loop and the tension model

```
        marketing spend ──> awareness ──┐
                                        ├──> ARRIVALS ──> queue ──> service ──> satisfaction
        reputation ────────────────────┘                     │                       │
              ▲                                              │                       │
              │                              capacity: stations, staff,              │
              └──────── reviews <───────────  automation, layout, supply             │
                                                                                     │
   revenue ── COGS ── wages ── rent ── capex ── marketing = cash ──> buy capacity <───┘
```

Two clocks, deliberately mismatched. **Marketing is fast** — money in today, customers tomorrow. **Reputation is slow** — weeks to build, days to destroy, days to repair. That asymmetry is the game.

### The punishment spiral (emergent, never scripted)

Over-market → arrivals exceed throughput → queue grows → customers **balk** → served customers wait too long → satisfaction drops → angry customers review at ~4× the rate of happy ones → reputation drops → demand multiplier drops → *and you're still carrying the staff you hired for volume you no longer have.* Payroll lands Sunday regardless.

Cut marketing, keep service tight, let the review window age out. Roughly 8–10 trading days of discipline.

**This spiral is fractal.** It recurs at every act with the same shape and a larger radius: over-marketing in Act I, over-expanding supply in Act II, over-franchising in Act III, over-saturating airspace in Act IV, over-committing lift in Act V. Build it once, generalised, and re-skin it per act. Do not write it five times.

---

## 5. Time

Time is the easiest thing to get wrong and it invalidates the entire economy when it goes wrong. The naive version of this design advances 80 game days over one night's sleep.

### 5.1 Rates

- Sim tick **10 Hz**, fixed `dt = 100ms`. Never tie sim to frame rate.
- 1 game hour = **30 real seconds** at 1×.
- Trading day 11:00–22:00 = 11 game hours ≈ **5.5 real minutes** of active play.
- Speed 1× / 2× / 4× (4× unlocks at venue 2). Pause allowed. Speed multiplies ticks processed, never `dt`.
- Payroll Sunday 23:00.

### 5.2 The offline rule

**Game time is gated by sessions, not elapsed real time.**

- Any offline gap grants **at most one trading day** of accrual, regardless of length.
- Maximum **two offline trading days per rolling real 24 hours.**
- Offline runs at **75% efficiency**, computed by the fast sim (§11.1).
- **Incidents do not auto-resolve.** A fryer that died at 3pm stayed dead.

An engaged player doing three 8-minute sessions advances ~6–7 game days per real day, putting venue 2 about a week out. Show the arithmetic on the card: *one trading day accrued (offline cap), 6 hours 20 minutes elapsed.*

### 5.3 Storage must never punish idling

A known genre anti-pattern caps offline accrual behind an upgradeable container, penalising absence and nudging players to pay for longer breaks. **We do not do this.** Cool-room and dry-store capacity constrain *purchasing strategy* and never gate offline earnings. Offline is capped by §5.2 alone, transparently, and no purchase raises that cap — in any act.

---

## 6. Demand, customers, arrivals

### 6.1 Demand

```
demandRate(t) =
    baseFootTraffic[venue]
  * daypartCurve(t)
  * dayOfWeekCurve(day)
  * reputationMultiplier(dineInRep)
  * (1 + marketingAwareness)
  * (1 + specialUplift(t))
  * (1 - priceResistance)
  * (1 - competitorPressure)   // 0 until Act III
```

- Arrivals are a **Poisson process**. Bursty by design.
- `reputationMultiplier(rep) = 0.35 + 1.15 * (rep / 5) ^ 1.6`. The gap between 4.2 and 4.6 stars is worth real money.
- `priceResistance = clamp((menuPrice / fairPrice(rep) - 1) * elasticity, 0, 0.8)`.
- `competitorPressure` is present in the formula from M3 and pinned at zero. Adding it later to a shipped economy would require rebalancing everything.

### 6.2 Customer archetypes

| Archetype | Patience | Spend | Review rate | Notes |
|---|---|---|---|---|
| **Regular** | High | Low | High, generous | Share grows with sustained good service. Forgives one bad experience, not two. |
| **Tourist / passer-by** | Low | High | Low | Weekend peak. Balks readily. |
| **Table of six** | Medium | Very high | Medium | One order, six items, enormous burst. Occupies six covers. |
| **Deliveroo-brain** | Very low | Medium | Very high, harsh | Expects app-speed in a dining room. |
| **Courier** (unlock) | N/A | N/A | Rates **delivery** channel only | Cares about pickup wait, nothing else. |

Archetype must be visible in silhouette and on the ticket. A table of six at 7:15pm Saturday should produce dread before the player reads a number.

### 6.3 Balking

```
estWait = queueLength * currentAvgServiceTime
pBalk   = clamp((estWait - patience * ambienceBonus) / patienceWindow, 0, 0.95)
```

Balkers leave immediately, 6% chance of a two-star "walked out, too busy" review. **Balk rate is a headline HUD stat** — it must move before reputation does.

### 6.4 Ambience — the second spatial lever

Seating, décor and fit-out raise `ambienceBonus`, multiplying patience and lifting dine-in spend per head. Décor occupies floor tiles — a *third* claimant alongside kitchen and storage.

A cramped efficient kitchen with a bleak room turns tables fast but has customers who won't wait; a beautiful room with a strangled kitchen has patient customers waiting a long time. Neither is correct. The right answer differs per venue: Neutral Bay's spend-per-head rewards ambience, Rosebery's lunch rush does not.

### 6.5 Reputation is a vector, not a number

`dineInRep` and `deliveryRep` are separate, with separate review pools and demand channels — a shop can be beloved in the room and mediocre in the app, because the app measures pickup wait and packaging, not welcome.

**Implement reputation as a keyed map from the start, not two fields.** Act III adds regional and national tiers, Act IV adds per-territory. A `Map<ReputationChannel, ReputationState>` costs nothing today and is the difference between a config change and a rewrite later. See §26.

---

## 7. Orders, recipes, production

A recipe is a **DAG of steps**, not a timer. This is what makes the kitchen a factory.

```ts
type Recipe = {
  id: string;
  sellPrice: number;
  ingredients: Record<ItemId, number>;
  steps: Step[];
  tasteVector?: TasteVector;   // null in Acts I–II, drives regional fit in Act III
};

type Step = {
  id: string;
  station: StationType;
  duration: number;            // seconds at skill 1.0
  batchSize: number;
  dependsOn: string[];
  output: ItemId;
  freshnessWindow?: number;
  attention: AttentionProfile; // §14
};
```

Seed content — Classic Cheeseburger:

- `patty` — grill, 90s, batch 4, freshness 480s
- `bun` — toast, 25s, batch 6, freshness 180s
- `garnish` — prep, 12s, batch 8, freshness 1200s
- `assemble` — assembly, 18s, batch 1, depends on [patty, bun, garnish]
- `plate` — pass, 6s, batch 1, depends on [assemble]

Chips: `basket` — fryer, 195s, batch 3, freshness 300s.

Batch sizes are the point. A grill doing four patties in 90s is wildly efficient *if* you have four patties of demand in the window, and wasteful if you cook four and sell one.

**Launch menu is two items plus drinks.** The rest unlock.

### 7.1 Stations, staff, movement

- Grid floor, ~40cm per tile. Footprints: grill 2×1, fryer 1×1, prep bench 3×1, pass 1×2, register 1×1, seating 1×1 per cover, cool room 2×2.
- Stations need **service points**: grill needs gas, fryer gas + extraction, sink plumbing. Fixed, annoying positions per venue.
- Staff are agents: path to a station, execute a step, carry output onward. **Walking takes time.** Distance between dependent stations is the throughput tax.
- Task assignment v1: priority queue, highest-priority ready step within capability, nearest preferred. Player shapes it via per-staff **role preference**. No full scheduler — emergent congestion should be visible.
- Dine-in customers need a free cover or they take away: faster, lower spend, higher balk rate.

### 7.2 Mistakes

```
pError = baseErrorRate * (1 + fatigue) * (1 + rushFactor) / skill
```

Wrong item, dropped order, burnt item. Item wasted, order remade, wait roughly doubles, satisfaction hit. Errors spike exactly when understaffed and slammed.

### 7.3 Freshness, buffers, waste

```
quality = 1                           if age <= window
        = 1 - (age - window) / decay  if beyond
```

Below `quality 0.35` the item is auto-binned as waste. **Par-cooking ahead of a rush is the correct play and also how you lose money.** Holding cabinets extend windows.

### 7.4 Satisfaction and reviews

```
satisfaction = waitScore * qualityScore * accuracyScore

waitScore     = clamp(1 - (wait - grace) / tolerance, 0, 1)   // grace 6 min, tolerance 14 min
qualityScore  = mean(item quality) * ingredientTierBonus
accuracyScore = 1 if correct, 0.4 if remade
```

```
pReview = 0.07 * archetypeReviewRate     if satisfaction >= 0.7
        = 0.30 * archetypeReviewRate     if satisfaction <  0.35
stars   = clamp(round(1 + satisfaction * 4), 1, 5)
```

Reputation = recency-weighted mean of last 250 reviews in that channel, half-life **10 game days**. New venues start with a prior of 3.8 stars at weight 15.

---

## 8. Money

- **Revenue** per order at menu price.
- **COGS** per ingredient consumed, *including waste and remakes*. Visible line on the daily P&L.
- **Wages** accrue hourly, paid **Sunday 23:00 as a lump**. Australian rules: casual loading ~25%, Saturday 1.25×, Sunday 1.5×, public holidays 2.25×. **Encode as a jurisdiction ruleset, not as constants** — Act III crosses borders. §26.
- **Fixed:** rent per venue per week, utilities scaling with equipment run-hours, insurance, POS subscription.
- **Capex and finance:** equipment bought outright or financed over 12/24/36 game months. Financing preserves cash at real interest, repayment landing weekly alongside wages. This is the decision every operator actually faces and it makes the automation ladder a genuine risk rather than a shopping list.
- **Marketing** converts to `marketingAwareness`, decaying ~12%/day. Efficiency scales *down* as reputation drops.
- **Cash can go negative.** Overdraft at 14% p.a. accruing daily, with an increasingly passive-aggressive bank.
- **Currency is a typed value with a unit, never a bare number.** §26.

### 8.1 Ingredient tiers — the early COGS lever

| Tier | Cost | Effect |
|---|---|---|
| Commodity | −18% | `ingredientTierBonus` 0.88 — noticeably worse burgers, reviews mention it |
| Standard | baseline | 1.0 |
| Premium | +22% | 1.08, unlocks a higher `fairPrice` ceiling |

A cheap high-volume shop and a premium low-volume shop are both viable, both visible in review text. The player reaches the supply meta already fluent in what COGS% means.

### 8.2 Pricing — the lever the player forgets they have

The player sets a price per menu item, adjustable any time, effective next trading day. This is the fastest lever in the game and the one with the most delayed consequence.

- Raising price lifts margin immediately and raises `priceResistance` (§6.1), which suppresses arrivals and shifts archetype mix — Tourists tolerate it, Regulars don't.
- `fairPrice(rep)` rises with reputation, so a 4.6-star shop can charge what a 3.8-star shop cannot. **This is the main way reputation converts into money** and it must be surfaced explicitly: show the player their current fair-price band next to the price input, as a range, updating live with reputation.
- Price changes carry a small one-off reputation friction. Constantly re-pricing looks erratic and Regulars notice.
- Discounting is the mirror image and equally available: below fair price, arrivals rise and margin falls. A viable strategy during recovery, and a trap if it becomes permanent.

**Design intent:** pricing should be the tool a struggling player reaches for and often reaches for wrongly. Raising prices to fix a cash problem when reputation is already sliding accelerates the spiral. Nothing should stop them.

### 8.3 Marketing — how the player actually spends it

Marketing is a per-channel weekly budget, set and forgotten, adjustable any time.

| Channel | Cost | Effect | Character |
|---|---|---|---|
| **Local print / letterbox** | Cheap | Slow build, decays slowly, biased to Regulars | Reliable, unexciting |
| **Social / paid digital** | Moderate | Fast spike, decays fast, biased to Tourists and Deliveroo-brain | The over-marketing trap lives here |
| **Special promotion** | Cheap | Only lifts the current week's special, high efficiency | Best value *if* you can serve it (§18) |
| **Influencer / press** | Lumpy | One-off event via contracts (§16) | High variance |

- Total awareness decays ~12%/day; each channel contributes with its own decay rate.
- **Efficiency scales down as reputation drops.** A bad shop pays more per customer, and those customers balk more. Bad money after bad, and the panel must show cost-per-cover so the player can see it happening.
- Marketing spend is weekly and lands with payroll, so the Sunday bill is *labour plus marketing* — two decisions arriving as one number.

---

## 9. Incidents

Roughly one every 2–3 game days. A reason to open the app and a reason to hold a cash buffer.

Fryer thermostat fails. Someone calls in sick. Cool room drifts overnight. Delivery short-picked. Health inspector visits. Gas bottle runs out mid-Saturday. **Automated equipment has its own failure profile** (§14.4).

**Hard rule:** incidents degrade, they never destroy, and they never require a response inside a time window. An unattended incident costs more the longer it runs. Twice a day should feel clever, not rescued.

---

## 10. No losing, real consequences

Never a game-over, in any act. Escalating states:

1. **Cash negative** → overdraft, interest, bank emails with declining warmth.
2. **Deep overdraft** → forced measures: sell equipment, close a venue for a week. Painful, reversible.
3. **Reputation below 2.5** → review-bomb event, demand floor drops, and a **Recovery Plan**: concrete objectives (seven days mean wait under 8 minutes, waste under 4%) that visibly accelerate repair. Dig-out ≈ **8 game days**, ~45 minutes of attentive play.

The worst outcome available is a slow, boring, unprofitable week. In later acts: a franchise terminated, a territory grounded, a colony quietly failing. Never a screen that says you lost.

---

## 11. Simulation LOD and performance

### 11.1 Fast sim

- On-screen venue at Tier 1/2: **full agent sim**.
- Off-screen, Tier 3, or offline: **fast sim** — closed-form queueing model from station capacity, staff skill, automation and layout walk-cost.
- **Gate, non-negotiable, in CI from M7:** over 7 simulated days × 20 seeds × 5 layouts, fast-sim revenue, waste and reputation land within **5%** of full sim.

**The fast sim is the foundation of Acts III–V.** A nation of 200 franchises and an orbital colony are both fast-sim-only entities. Treat it as a first-class deliverable with its own tests, not as an optimisation. §26.

### 11.2 Budget

Target a **mid-range Android from three years ago**. 60fps at Tier 2 with 40 customers and 12 staff visible. Profile on a throttled device. Develop in a fixed 390×844 viewport frame.

---

## 12. The spatial layer — portrait-native

**The screen is a cross-section of the shop, street at the bottom, back-of-house at the top.**

```
  ┌──────────────┐
  │  cool room   │  ← back of house
  │  prep · grill│
  │  fryer       │  food flows DOWN
  ├─────  PASS  ─┤  ← the pass: visual centre
  │  register    │
  │  queue       │  customers flow UP
  │  seating     │
  │  ▓▓ DOOR ▓▓  │  ← street
  └──────────────┘
```

| Venue | Grid (W×D) | Twist |
|---|---|---|
| **Leichhardt** | 9 × 15 | Home venue. Narrow terrace, structural column at (4,7) you cannot remove and will hate. Gas along the back wall only. Later the commissary anchor. |
| **Rosebery** | 7 × 22 | Absurdly long and deep. Walk distance brutal; rewards strict linear flow. Industrial: enormous lunch, dead dinner. Ambience barely matters. |
| **Neutral Bay** | 11 × 11 | Squat and wide. Roomy-feeling, tiny kitchen zone, savage rent. High spend per head, low tolerance for waits. Ambience and premium tier both pay. |
| **Venue 4** (unlock) | 9 × 9 over 9 × 9 | Two storeys stacked vertically on screen. Dumbwaiter with capacity and cycle time. A literal belt. |

**Renovate mode.** Separate fullscreen, entered deliberately: venue fit to screen, chunky handles, snap targets, ghost previews, red invalid states, live estimated-throughput delta *before* confirming. **No station dragging in the live service view.** Equipment sells back at 60%.

### 12.1 Design for the rebuild

Factory-game players build a mess first, then rebuild once they understand the constraints, and that recursive rebuild is where the genre's satisfaction lives.

- **The first kitchen should be allowed to be bad.** Don't prevent, warn about, or auto-correct it. Make its badness *visible* and let the player conclude.
- **Renovation affordable enough to attempt, costly enough to consider.** 60% resale plus a half-day closure: a rebuild costs a real trading day.
- **Named blueprints** from venue 2, so a solved floorplan can be adapted rather than re-solved.

**Generalise the placement system.** Acts IV and V place dark kitchens on a city map and modules in a colony volume. Same verbs, different substrate. Build placement against an abstract grid with abstract service-point requirements rather than against "restaurant floor". §26.

---

## 13. The bottleneck readout

Factory players describe their loop as moving bottleneck to bottleneck — find the binding constraint, fix it, find the next. That only works if the constraint is findable. In a 2D factory you look at where the belt backs up. In a restaurant, in portrait, at 4× speed, you cannot.

So the game names it. A persistent single line, always visible at Tier 1/2:

> **Grill is your constraint — 74% of service, costing ~18 covers/day**

- Computed from station utilisation, queue-age attribution and staff idle-waiting-on-input. Report the **binding** constraint, not the busiest: a grill at 100% with nothing waiting is fine; a grill at 80% with assembly starved is not.
- Must include non-station answers, because those are the interesting ones: *walk distance between grill and pass*, *not enough covers*, *front of house*, *short-staffed on Saturdays*, *demand is the constraint — you have capacity spare* (the signal to market).
- Always quantify in covers or dollars per day.
- Tapping opens the relevant overlay or panel.
- **"Yesterday's bottleneck" on the end-of-day card**, so the player carries one objective into the next session.

Build it in M2, in text, long before it's pretty. Gate: `bot:balanced` acting on the readout must outperform a variant ignoring it.

**This scales to every act and is the main UI thread through all five.** In Act II the answer becomes "Rosebery's Tuesday delivery window." In Act III, "franchisee variance in the western region." In Act V, "you are lifting mass you could be growing." Write it as a general constraint-attribution service over the sim, not as a kitchen-specific heuristic. §26.
---

## 14. The automation ladder

This is what makes it an automation game rather than a management game, and it is the spine that eventually produces the drone fleet.

### 14.1 The principle

Every station step has an **attention profile**: how much of a staff member's time it occupies versus how much is just elapsed cooking time.

```ts
type AttentionProfile = {
  setupSeconds: number;     // loading, pressing, dressing — always staffed
  tendSeconds: number;      // flipping, shaking, watching — automatable
  teardownSeconds: number;  // unloading, plating — automatable at higher tiers
  canLapse: boolean;        // if true, unattended overrun burns the item
};
```

A grill patty is 90 seconds of cooking but only ~22 seconds of human attention. **Automation buys back attention, not time.** An automated clamshell doesn't cook faster; it removes the flip and the watching, so one person runs three grills instead of one. Throughput doesn't jump — *labour per cover* falls, and the same staff can be pointed at the actual bottleneck.

That's what makes it feel like Factorio rather than a stat upgrade. You're not buying bigger numbers, you're removing a human from a link so the chain runs wider.

### 14.2 The ladder (all real equipment)

| Tier | Equipment | Removes | Cost profile |
|---|---|---|---|
| 1 | **Holding cabinet** | Nothing — extends freshness, enables par-cooking | Cheap, 1×1, low power |
| 1 | **Sauce dispenser / pump rail** | ~40% of assembly setup | Cheap, bench-top, needs refilling |
| 2 | **Clamshell grill** | The flip and the watching: `tendSeconds` → ~0 | Expensive, 2×1, heavy gas + power, *cannot* do custom cook levels |
| 2 | **Conveyor bun toaster** | The toast step entirely | Moderate, 2×1, continuous draw, toasts on a fixed cycle whether needed or not |
| 3 | **Automatic bun feeder** | Loading the toaster | Moderate, attaches to toaster, jams |
| 3 | **Auto-lift fryer** | Basket watching and pulling: `canLapse` → false | Expensive, 1×1, needs oil management |
| 3 | **Self-order kiosk** | Register staffing; raises accuracy | Moderate capex, 1×1 of *floor*, small satisfaction penalty with Regulars who liked being greeted |
| 4 | **Pass-through / conveyor** | Walk distance between adjacent stations | Expensive, occupies a lane, fixed direction — commits you to a flow |
| 4 | **Automated oil management** | Fryer downtime and a recurring incident class | High capex, back-of-house footprint |
| 5 | **Robotic fry station** | The fry station entirely | Enormous capex, 2×2, spectacular when it breaks |
| 6 | **Delivery drone** (Act IV) | Last-mile courier labour | Fleet capex, range, charge scheduling, weather, airspace approval |

### 14.3 Every machine must create a new problem

Non-negotiable, enforced in the audit. Each piece trades a labour cost for at least two of:

- **Capital** — cash, or financed debt with weekly repayments.
- **Floor space** — competing with kitchen, seating, ambience, storage.
- **Utilities** — continuous draw whether busy or not, so automation is *worse* than staff on a dead Monday.
- **Flexibility** — the clamshell locks out custom cook levels; the conveyor commits a flow direction and makes re-layout costlier.
- **Reliability** — a new incident class with its own failure rate and callout cost.

If a piece is strictly better than not having it, it's a stat upgrade in a costume. Cut it or add a cost.

### 14.4 Automation reliability

Failure rate proportional to run-hours, inverse to maintenance spend. A failed machine is *worse* than never automating: the staff you redeployed are elsewhere, the line has a hole, and the manual fallback is slower because you sold the old gear.

Preventive maintenance is a small recurring cost the player can skip. Skipping is correct in a cash crunch and expensive later. Good decision.

### 14.5 What automation must never do

- Never remove the last decision at a station. If a station becomes fully automatic *and* infinitely fast, delete it — it's no longer a system.
- Never make staff obsolete. Endgame target ~**labour 22–26%** heavily automated vs 30–34% without, alongside a much larger capex and utilities line. Cheaper, not free, and far more brittle.
- Never gate automation purely behind cash. Gate on ladder rungs and venue count.

---

## 15. Progression spine

With prestige removed, this carries the load alongside §16 and the act structure.

### 15.1 The ladder

Two rungs always in the HUD; the rest browsable.

**Early — learn the machine**
- Serve 50 covers in a day
- A full day with zero walkouts
- First $1,000 day
- Hire your second staff member
- Waste under 8% for a week

**Mid — run a business**
- Reach 4.0 stars
- A week with labour under 32%
- 100 covers in a day
- Run a special that sells out *without* 86'ing early
- First automated station running a full service unattended
- First week trading profitably after wages
- Buy venue 2 **with cash, not debt**

**Late — run a group**
- Three venues simultaneously above 4.0
- COGS under 30% pre-commissary
- A Saturday over 250 covers across the group
- A venue running a full service with fewer than three staff
- Commissary open and supplying all venues
- COGS under 27%

**Act III+ rungs are authored later** but the ladder system must support acts as a dimension from M5. §26.

**Never award a flat cash bonus** — award a *capability*, so the reward changes what the player can do rather than skipping a decision.

### 15.2 The daily headline

Every day ends on a one-line verdict above the P&L: *"Best Tuesday yet."* / *"Lost eleven customers to the queue."* / *"Waste ate your Wednesday."* Specific, from real data, never generic encouragement. For most sessions it's the thing the player remembers.

### 15.3 No dead zones

The genre's characteristic failure is the mid-game wall. Enforce as a testable property:

**Rule: `bot:balanced` must never go more than 3 game days without a meaningful decision available.** A **dead-zone detector** in the harness reports the longest decision-free gap per run. Any gap over 3 days fails the gate.

---

## 16. Contracts

Bounded, time-limited challenges are what retains long-running idle players once the core curve flattens. Ours are the hospitality version.

A contract is a **bounded external job with a fixed deadline, a specific requirement and a real reward.**

- **Function catering** — 80 burgers to a single pickup at 6pm Friday. Enormous prep-ahead load against normal service.
- **Festival stall** — a week at a temporary location with a stripped menu, borrowed equipment and staff pulled off your roster. Your venues run short all week.
- **Corporate lunch account** — 40 covers every weekday at noon for a fortnight, discounted. Guaranteed revenue, guaranteed lunch bottleneck, crowds out walk-ins.
- **Food truck day** — one venue's staff and stock diverted. Good money; the shop trades badly that day.
- **Influencer visit** — no revenue. Tight service buys a large temporary awareness spike; otherwise a very public bad review.

Rules:

- **One active contract maximum.**
- **Always optional and declinable** with no penalty. A player mid-recovery must be able to say no.
- **Rewards are capabilities and reputation**, not just cash.
- **Deadlines in game days, never real time.**
- Unlock at "4.0 stars", roughly a week in; one offered every 4–6 game days after.

Contracts answer "what do I do when the venue runs well" — a question that otherwise arrives around day 20 and ends the run. Later acts re-skin them: regional launches, government airspace trials, resupply windows.

---

## 17. The supply meta — Act II

Volume-tiered supplier pricing: 200kg of beef weekly across the group drops price per kg. But deliveries run on schedules (supplier X does Tuesday and Friday), each venue has finite cool-room and dry-store capacity in *tiles* competing with kitchen, seating and ambience, and stock spoils: produce 4 days, mince 3, buns 2. Running out mid-service **86s the item** — orders can't be taken, customers balk hard, reviews name it.

Then the real meta: buy a **commissary** (Leichhardt is the natural anchor). Purchase at top tier, prep centrally, run **trucks** on routes with capacity, travel time and running cost. A small vehicle-routing problem where the objective is COGS% and the failure mode is a venue dry at 7pm Saturday.

Target: a good player moves COGS from ~34% to ~26%. Headline number.

### 17.1 Delegation — the Act II control surface

When you can no longer watch every kitchen, you stop issuing commands and start issuing standing instructions. This is the player-facing form of the policy layer (§26.3) and it is what Act II's verb actually feels like.

Per site, the player sets:

- **Par levels** — how much of each prepped item to hold ready, per daypart. Too low and the rush starves; too high and you bin it. This is par-cooking (§7.3) promoted from a moment-to-moment judgement to a standing policy, which is exactly the right escalation.
- **Reorder points** — stock level at which the site pulls from the commissary or raises a supplier order.
- **Staffing floors** — minimum bodies on per daypart. The site hires casuals to meet it, at cost.
- **Service targets** — a target mean wait the site optimises toward, trading batch efficiency against speed.
- **Trading hours** — including the genuine question of whether Sunday is worth opening given penalty rates.

Policies are authored in a single screen per site, take effect next trading day, and are visible on the city tier as a compact summary so the player can compare three sites at a glance.

**The failure mode is intentional and instructive:** a policy that was correct in week one is wrong by week four, and nothing tells you except the numbers drifting. Good delegation means revisiting. The bottleneck readout (§13) is what surfaces it.

**Build routing generically.** Act IV's drone fleet and Act V's lift schedule are the same problem with different vehicles, ranges and costs. A `Route<Vehicle, Node>` abstraction now is nearly free; a truck-specific one is a rewrite. §26.

---

## 18. Weekly specials

High N' Dry runs weekly specials. They're a real lever in the real business and the best-fitting mechanic in this document.

Each Monday the player picks a special from an unlocking pool. It runs the week.

- **Demand uplift** on a named day (Wing Wednesday spikes Wednesday dinner, not the whole week).
- **Shared stations.** A fryer-heavy special in a chips-heavy week is a self-inflicted bottleneck.
- **Prep-ahead requirement.** Under-prep and you 86 it mid-rush — worse than never running it, because you drew the crowd and disappointed them. Over-prep and you bin it.
- **Ingredient exposure.** Some specials use an ingredient nothing else uses.

Three-sided decision every Monday: what draws people, what your kitchen can produce at volume, what you can prep without eating the waste.

---

## 19. Retention shape

Benchmarks: mobile games average ~26–28% day-1 retention, ~8% day-7, under 3% day-30; well-paced idle titles reach 10–15% at day 7. The failure signature is high D1 with low D7.

**Hook — first 30 minutes.** Watch food get made, understand the chain, see one bottleneck named, complete one ladder rung. §20.

**Habit — days 1 to 7.** One new system per session, never two. Order: expedite → hiring → marketing → Renovate → specials → first automation → contracts. By day 7 the player owns a mental model of the tension loop and has been burnt by over-marketing at least once. **The first automation purchase must land in this window** — it's the moment the game reveals what it is.

**Hobby — week 2 onward.** Venue 2, city tier, supply, commissary — and beyond that, the act structure itself is the long-tail retention mechanism. Each act is a new game announcement that costs no marketing.

Target roughly **60% of progress from idle accrual, 40% from active decisions.**

---

## 20. The first ninety seconds

**0–20s.** One grill, one staffer, one customer, no HUD except cash. The player watches a single burger made end to end at Tier 1. No input required. The production model is legible before a number appears.

**20–45s.** Three more customers. Ticket rail fades in. First ticket goes amber. Player taps it. Something visibly happens. Expedite taught in one gesture, no tooltip.

**45–90s.** Day one closes. End-of-day card: covers, revenue, one sentence, **and the first bottleneck line**. First ladder rung lights: *serve 50 covers in a day.*

Nothing else introduced. Every later system arrives one per session via ladder rungs, never a tutorial script. **Never two new systems in one session.** No modal tutorials, no tap-here arrows, no text block over one sentence. If a mechanic can't be taught by watching it happen, fix the mechanic.

---

## 21. Spectacle — the visual escalation curve

This section is as load-bearing as the economy. The player's felt sense of progress comes from the screen, not the balance sheet — and in an idle game where the sim runs itself, **watching is the primary verb**. If buying something doesn't visibly change what's on screen, it didn't happen.

The target arc: **day one is quiet enough to watch one patty cook. Day sixty is manic.** And the player got there in small, legible steps, each one of which they can point at.

### 21.1 The density curve

Six designed stages. This is a curve to *hit*, not an emergent side effect — tune content unlocks against it and check it in playtesting.

| Stage | Roughly | On screen | Feel |
|---|---|---|---|
| **0 — Quiet** | Day 1 | 1 staffer, 1 grill, 2–3 customers, one heat source, one steam wisp | Almost sleepy. You can follow a single patty end to end. Deliberately underwhelming — this is the floor the whole curve is measured from. |
| **1 — A line** | First hire + fryer | 2 staff whose paths cross, 2 heat sources, tickets start queueing | The first time it looks like a *kitchen* rather than a diagram. Paths crossing is the whole point. |
| **2 — Rhythm** | First automation | A machine enters with a fixed mechanical cycle against irregular human motion | The single most important visual beat in the game. §21.5. |
| **3 — Service** | ~6 staff, full menu | Ticket rail full and cycling, queue reaching the door, 4+ particle sources, constant carry traffic | Busy. Readable, but you're now scanning rather than watching. |
| **4 — Machine** | Heavy automation, 10–12 staff | Conveyor lanes running, robotic fry station, kiosks, the pass under continuous load, steam haze | **Manic.** The screen is doing more than a person can track, and that's correct — this is what the overlays and the bottleneck line are for. |
| **5 — Network** | Act II city tier | Venues as living miniatures, trucks moving between them, each card visibly busy | Zoomed out and still alive. Every venue is a small version of stage 4. |

**Test:** screenshots at day 1, day 20 and day 60 should look like three different games. If they don't, the curve failed.

**The zoom-in reward never expires.** At any stage, the player can drop to Tier 1 and watch one patty cook exactly as they did on day one. That contrast — *I built this, and I can still see the individual burger* — is the emotional core of the whole thing. Never LOD away the ability to go back down.

### 21.2 Every purchase has a visible signature

**Hard rule, audited: no purchasable item ships without a distinct on-screen presence the player can point at.** Not a stat line, not a badge — a thing on the floor that looks different, moves differently, and changes the texture of the scene.

Three tiers of signature, all required:

1. **Install beat.** A one-time arrival animation. The unit drops in with weight — shadow, 2px shake, a puff of dust, power-on. Two seconds, once, never repeated. This is the purchase's payoff moment and it's cheap to build.
2. **Idle signature.** How it looks doing nothing. Pilot lights, a slow fan, a temperature readout, a drip. Equipment should feel *on* even when unused, so a fitted-out kitchen looks fitted-out at rest.
3. **Working signature.** Its motion and particle contribution under load, distinct enough to identify from Tier 2 without reading a label.

Same applies to staff (arrive through the door on their first shift, walk to their station), to décor (changes the colour temperature of the room), and to menu unlocks (new item shapes moving through the line).

**Corollary: if you cannot design a visible signature for an upgrade, that upgrade is a spreadsheet entry and should be cut.** This is a genuinely useful design filter — it kills exactly the boring linear upgrades §24 already bans.

### 21.3 Legibility under density

The trap in "manic" is illegible. A screen doing more than the player can parse is only good if the player has tools to *choose* what to parse. As density rises, the game must add filtering at the same rate it adds noise.

- **The bottleneck line (§13) is the primary legibility tool** and it earns its keep exactly here. At stage 4 the player stops reading the floor and starts reading one sentence.
- **Overlays are the second.** Congestion, walk distance, utilisation, queue age. Each one drops visual noise to near-zero and renders a single dimension in false colour. They should become *more* prominent in the HUD as density rises — surface them automatically once entity count crosses a threshold.
- **Colour hierarchy is fixed and inviolable.** Ticket amber/red and the raw→burnt food ramp own their hues. No decorative element may use them. As the screen fills, this is the only thing keeping the critical signals findable.
- **Motion budget is inverse to density.** More entities means *less* individual animation, not more: at stage 4, individual staff idle-fidgets are culled and replaced by aggregate flow. Per-entity flourish is an early-game luxury. Design the flourishes so their absence reads as *busy*, not as broken.
- **Audio does not scale.** Twelve sizzle loops is noise. Above stage 3, collapse to a single mixed kitchen ambience whose intensity tracks load. (Assume muted anyway — §22.4.)

### 21.4 Responsiveness rules

Non-negotiable, checked every milestone:

- **Every tap acknowledges within 100ms**, even if the result is asynchronous. Press states, ripples, a number that starts moving. No dead taps, ever.
- **No blocking spinners in the main view.** The sim never stops for the UI.
- **Optimistic UI on purchases**: deduct, animate, install. Reconcile behind it.
- **Numbers tween, never jump.** A value that changes without motion reads as a bug.
- **Every state change has a transition.** Panels spring in, they don't appear.
- **Nothing important lives in a hover state.** There are no hovers. Tap-and-hold is the inspect gesture, and it must be discoverable without instruction.
- **Thumb zone.** Primary actions in the bottom third. Nothing critical in the top corners.
- **60fps is a correctness requirement, not a polish goal.** A dropped frame during a rush is the moment the player stops believing the simulation.

### 21.5 The mechanical/human contrast

Machines move on fixed rhythms. People move irregularly. That single distinction does more visual work than any other decision in this document, and it should be exaggerated deliberately:

- Human motion: variable speed, pauses, small course corrections, occasional idle fidget.
- Machine motion: metronomic, identical every cycle, no hesitation.

A kitchen transitioning from stage 1 to stage 4 therefore *visibly* changes character from organic to mechanical, and the player watches their business become a factory without being told. It's the automation ladder rendered as motion, and it's free.

It also sets up the late acts: by Act IV a drone fleet is pure rhythm, and the few remaining humans stand out.

### 21.6 Build order — visuals are not a milestone

**Delete the idea of an "art milestone."** A five-milestone stretch of grey rectangles followed by one giant beautification pass is how projects die: no feedback loop, no early sense of whether the game is fun, and a single enormous risk-laden milestone at the end.

Instead, from M1 onward **every milestone ships something visibly better than the last**, and each milestone's gate includes a visual Definition of Done (§25.4). The render layer grows alongside the sim.

M0 remains headless — it's the sim core and it's a day or two of work. Everything after it is visible.

---

## 22. Staff, look and feel

### 22.1 Staff as characters

```ts
type Staff = {
  id: string;
  name: string;
  portrait: PortraitSeed;                // parametric, code-drawn
  traits: TraitId[];
  skill: Record<StationType, number>;    // log curve on hours worked
  stamina: number;
  morale: number;
  type: 'casual' | 'partTime' | 'fullTime';
  hourlyRate: Money;
  availability: Availability;
  role: StaffRole;                       // extends to areaManager, franchisee later
};
```

| Trait | Effect |
|---|---|
| Fast hands | +15% assembly speed |
| Grill dog | Learns grill 2× faster, refuses front of house |
| Slow starter | First game-hour of any shift at 70% |
| Steady | Fatigue accumulates 40% slower |
| Chatty | +8% satisfaction at register, −10% register speed |
| Weekend warrior | Unavailable Mon–Thu, no penalty-rate premium |
| Clean freak | −30% incident rate at their station |
| Green | Cheap, high error rate, learns fastest |
| Machine whisperer | −50% automated equipment failure at their station |

**Morale and quitting.** Down from repeated closes, no breaks, consecutive slammed shifts, understaffing, being moved off a preferred station, and being replaced by a machine. Up from adequate staffing, consistent rosters, pay above award, high-morale colleagues.

Staff quit, with notice, at low morale. A long-serving staffer has high skill across several stations and is disproportionately valuable. A consequence that isn't a loss state, and the most honest mechanic in the game.

**Staff must persist across acts.** The person you hired in week one becomes an area manager in Act III and the name on a franchise in Act IV. This is the cheapest possible way to keep the late game warm, and it only works if `Staff` was never venue-scoped. §26.

**Barks.** Text only, ~one per staff member per five minutes, weighted to meaningful moments.

Slammed: *"I'm drowning."* / *"Who ordered eleven chips."*
Idle: *"Anyone need anything? No? Grand."*
Low morale: *"That's five closes."*
Error: *"That one's on me."*
New machine arrives: *"So what happens to me, then."*
Quitting: *"Can I have a word after service."*

### 22.2 Render approach

**No raster assets. Everything drawn from code.** Every state here is continuous, so raw → seared → perfect → burnt is a colour interpolation rather than four sprite frames. Resolution independence across three zoom tiers and every phone. This also means Acts III–V cost no additional art pipeline — a drone and a colony module are shapes in the same registry.

**Projection: top-down with a shallow oblique lean. Not isometric.** Grid axes match thumb axes, portrait depth reads as up-screen, no depth-sort hell.

**Technique.** Draw each shape once into a `RenderTexture` at boot, then instance sprites. Only genuinely dynamic geometry redraws per frame. A `ShapeRegistry` owns every primitive.

**Direction.** Flat vector shapes, hard edges, strong silhouettes, colour carrying all information. Warm sodium-lamp interior against a cool blue-grey street, so the shop reads as a warm box in a cold city and the light spilling from the door is literally where the customers come from. **Silhouettes must read at 12px.**

Type: heavy condensed display for headline numbers and signage, clean geometric grotesque for UI body, **monospace tabular for all money and metrics**. Palette from High N' Dry brand; `src/config/brand.ts` with named tokens and TODOs for real hexes.

**Signature element: the pass.**

### 22.3 Motion

Numbers tween, never jump. Panels spring. Money rolls and flashes. **Sizzle:** steam particles and the raw→burnt ramp readable from Tier 2. **Tickets physically travel**, ageing white → amber → red — the most important glanceable signal in the game. **Customer mood** through posture and emote. **Payday is a moment.** **Automation has its own motion vocabulary** — machines move on fixed rhythms, people move irregularly, so a heavily automated kitchen visibly *looks* mechanical. That contrast is the reward for building it, and it's the visual seed of the entire late game.

Respect `prefers-reduced-motion`.

### 22.4 Design for silence

**Assume sound is off.** Every audio cue has a visual twin carrying the same information alone. Sound is pleasure, never a channel of information. The audit includes playing a full service muted.

### 22.5 Portrait HUD

- **Top bar:** cash, star rating, clock/day.
- **Bottleneck line:** under the top bar, always visible. §13.
- **Ticket rail:** ordered by age; the expedite tap target.
- **Middle:** the venue, scrollable and pinch-zoomable.
- **Ladder chip:** current rung, one line, tappable.
- **Bottom bar:** Renovate, Staff, Menu, Marketing, Supply.
- **Drawer:** wait time, queue length, balk rate, labour%, COGS%, utilities.

End-of-day card: daily headline, yesterday's bottleneck, P&L, covers, waste%, COGS%, labour%, capex/finance, top complaint, best seller.

### 22.6 Expedite

Tap a ticket to expedite. **It reorders work; it does not create throughput.** The ticket moves to front, everything else shifts back by exactly as much. Capacity unchanged — can't be exploited, needs no cooldown, never punishes a player who isn't looking.

The skill is knowing *which* ticket to save. Mid-game unlock **Expo** adds a capped speed boost on a cooldown.

**Expedite is the affordance later acts take away.** Losing it in Act II should feel like a loss. Make it good enough that it does.

---

## 23. Zoom tiers

**Tier 1 — Station (1.4×–2.5×).** Individual items. Patties searing, smoke rising, basket shaking. Default view for the first twenty minutes.

**Tier 2 — Floor (0.6×–1.4×).** Whole venue. Customers with tickets and mood, staff pathing. Overlay toggles (buttons, not hovers): congestion, walk distance, utilisation, queue age.

**Tier 3 — City (0.15×–0.6×).** Venues as living cards on a map, supply trucks moving, aggregate P&L, alert badges.

Smoothly interpolated, never hard-cut. **Build the camera as an N-tier system, not a 3-tier one.** Acts III–V add region, nation and orbital tiers. §26.

---

## 24. Settled decisions — do not relitigate

| Decision | Settled |
|---|---|
| Platform | Desktop browser for development, **mobile is the real target** |
| Orientation | **Portrait**, locked |
| Art | **Code-drawn geometry, zero raster assets** |
| Projection | Top-down shallow oblique, **not isometric** |
| Scope | **Five acts: shop → group → nation → world → orbit.** Ship Acts I–II |
| Act rule | Each act adds a verb, adds a constraint, and **removes an affordance** |
| Growth model | **Stacked S-curves, no exponential treadmill, no prestige** |
| Offline | **One trading day per gap, two per real day**, 75% efficiency, never purchasable |
| Automation | **Buys back attention, not time.** Every machine creates a new problem |
| Player input during service | **Tap a ticket to expedite** — reorders only |
| Staff | **Named characters** with traits, morale, barks. Persist across acts |
| Ambience | Third claimant on floor space, drives patience and spend |
| Branding | Real High N' Dry venues, menu, colours |
| Reputation | **Keyed map of channels**, not scalar fields |
| Contracts | One active maximum, always declinable, deadlines in game days only |
| Tone | Played straight at every scale. Never wink |
| Visuals | **No art milestone.** Visual DoD at every gate; density curve from quiet to manic |
| Upgrades | No purchasable item ships without a visible on-screen signature |
| Sound | Assume off. Every cue has a visual twin |
| Lose state | None, ever, in any act |

### 24.1 Anti-goals

- No lose state, no fail screen, no run reset, **no prestige**.
- No exponential unbounded numbers. If a stat needs scientific notation, the design is wrong.
- No mechanic requiring presence at a specific real-world moment.
- No IAP scaffolding, no ad hooks, no energy timers.
- **Never monetise or gate the player's ability to be away.** Offline caps are fixed and transparent.
- No storage limit that punishes idling.
- No 3D. No raster assets. No isometric.
- No infinite linear upgrade lists. If an upgrade doesn't change a decision, cut it.
- **No upgrade whose only evidence is a number changing.** If you can't design a visible signature for it, cut it.
- **No deferred art pass. No milestone that ships grey rectangles.**
- No automation piece that is strictly better than its absence.
- No decorative element using ticket amber/red or the food colour ramp. Those hues are reserved signal.
- No dark-pattern notification hooks. One daily notification maximum, and only if something actually broke.
- No station dragging in the live service view.
- No modal tutorials, no forced tap-here arrows.
- No ladder reward that is purely cash. Rewards are capabilities.
- No more than one active contract.
- No blocking spinner in the main view. The sim never stops for the UI.

---

## 25. Tech, harness, milestones

### 25.1 Stack

```
TypeScript + Vite
PixiJS v8          — Graphics → RenderTexture → instanced sprites
React 18           — HUD, panels, menus over canvas
Zustand            — UI state; sim state lives in sim, mirrored per frame
seedrandom         — determinism
Vitest             — tests
Web Worker         — sim off main thread from M7
```

```
src/
  sim/                 # pure TS, zero imports from pixi/react. Node-runnable.
    world.ts
    entities/          # customer, staff, station, machine, item, order, site
    systems/           # arrivals, tasking, production, automation, service,
                       # reviews, economy, morale, incidents, specials,
                       # contracts, ladder, bottleneck, routing, supply
    fastsim/           # first-class: foundation of Acts III–V
    policy/            # delegation layer — see §26.3
    rng.ts
  config/
    economy.ts recipes.ts stations.ts automation.ts sites.ts staff.ts
    traits.ts customers.ts specials.ts contracts.ts suppliers.ts
    incidents.ts ladder.ts ambience.ts jurisdictions.ts brand.ts
  render/
    shapes/ scene/ camera/ particles/
  ui/
  save/                # versioned migrations, IndexedDB
  telemetry/
  harness/             # headless balance runner + policy bots
```

**Hard rule:** `sim/` never imports from `render/` or `ui/`. The whole simulation runs headless in Node.

### 25.2 Balance harness

- `bot:naive` — buys cheapest, markets constantly. Should visibly spiral.
- `bot:balanced` — holds a target wait, markets only with spare capacity, **acts on the bottleneck readout**.
- `bot:tightarse` — minimum staff, maximum margin, never automates.
- `bot:roboboss` — automates aggressively on finance, minimum staff. **Viable but brittle** — good margins, catastrophic on failure.
- `bot:idle` — nothing after day 1. Must survive; plateaus, never dies.

**Session model, required.** Bots play three 8-minute sessions per real day with offline gaps and a 9-hour overnight, obeying §5.2 caps.

Report per bot over 90 game days: cash, all reputation channels, COGS%, labour%, capex and utilities, waste%, mean wait, balk rate, staff turnover, machine failures, specials run vs 86'd, contracts taken vs failed, venues owned, **longest decision-free gap**.

**Targets:**
- `bot:balanced` reaches venue 2 at game day 45–60 ≈ **7–9 real days** at three sessions daily.
- `bot:naive` bottoms below 3.0 stars by day 30, recoverable by day 55 if switched.
- `bot:idle` stays cash-positive, never reaches venue 2.
- `bot:tightarse` and `bot:roboboss` finish within 25% of `bot:balanced` on cash — **neither strategy may dominate.**
- Labour% 28–34% unautomated, 22–26% heavily automated, capex+utilities absorbing most of the difference.
- COGS% 30–36% pre-commissary, under 27% with solved supply.
- Longest decision-free gap under 3 game days for every bot except `bot:idle`.

Never hand-tune balance by playing. Tune with the harness, verify by playing.

### 25.3 Telemetry

Debug overlay and event log from M2. Every purchase with timestamp and cash position, every ladder rung with time-to-complete, session length, where the player was when they closed the app, every 86, walkout, incident, machine failure, contract accepted or declined. Local-only, exportable JSON.

### 25.4 Milestones

Every milestone from M1 onward has a **Visual DoD** alongside its systems work, and the gate fails if the visual DoD is unmet. There is no art milestone. See §21.6.

**M0 — Headless core.** Sim loop, one site, one recipe, arrivals, one station, one staffer, day report to console. Harness skeleton with `bot:idle`.
*Gate:* `npm run sim -- --days 7 --seed 42` stable; identical seed byte-identical.
*Visual DoD:* none. This is the only headless milestone.

**M1 — Space, and the first thing worth watching.** Grid, placement with service-point constraints, pathfinding, walk time affecting throughput. Full recipe DAG with batching, buffers, attention profiles.
*Visual DoD:* **Stage 0 of the density curve is playable and pleasant.** ShapeRegistry exists, oblique projection is in, and a single burger can be watched end to end at Tier 1 — patty on, colour ramp, off, assembled, passed. Staff visibly walk and visibly carry. Not pretty; alive.
*Gate:* Moving the grill 6 tiles from the pass measurably drops throughput — show the numbers. Someone unfamiliar can watch for 30 seconds and correctly describe what's happening without being told.

**M2 — Economy and the bottleneck readout.** Cash as typed Money, COGS, ingredient tiers, waste, payroll via jurisdiction ruleset, rent, utilities, capex and financing, hiring/firing, buy/sell, end-of-day P&L, save/load, telemetry. **Bottleneck readout in text.**
*Visual DoD:* **Stage 1.** Buying anything produces an install beat. Money tweens and flashes. The end-of-day card exists as a real screen with real motion. Tap acknowledgement under 100ms everywhere.
*Gate:* All bots run 90 days without crashing; P&L reconciles to the cent. `bot:balanced` acting on the readout beats a variant ignoring it — prove it. Every purchasable item in config has a documented visible signature (§21.2).

**M3 — The tension, made visible.** Customer archetypes, ambience, satisfaction, reviews, reputation channel map, marketing, balking, errors, fatigue, incidents, Recovery Plan.
*Visual DoD:* Ticket rail with the white→amber→red age ramp. Customer mood through posture and emote. Archetypes distinguishable by silhouette. **A walkout is legible before the stat moves.** Décor visibly changes the room's colour temperature.
*Gate:* `bot:naive` demonstrably spirals and recovers when switched — ship the chart. A muted observer can identify an over-marketed service from the screen alone.

**M4 — Automation, and the rhythm beat.** Attention profiles wired through, full equipment ladder, machine reliability and maintenance, financing, the labour/capex tradeoff.
*Visual DoD:* **Stage 2 — the mechanical/human motion contrast (§21.5) is unmistakable.** Machines are metronomic, people are irregular, and the difference reads at Tier 2. Each machine has idle and working signatures. A machine failure is visible before it's notified.
*Gate:* `bot:roboboss` and `bot:tightarse` finish within 25% of `bot:balanced`. Every machine has a documented new problem — list them. A player can tell an automated kitchen from a manual one at a glance, muted, without labels.

**M5 — Ambition.** Ladder with act dimension, daily headline, unlock gating, weekly specials with prep-ahead and 86'ing, contracts.
*Visual DoD:* **Stage 3.** Full service under load stays readable. Ladder rung completion has a celebration proportional to the achievement. Overlays exist and auto-surface past an entity-count threshold. Motion budget degradation implemented — individual fidgets cull as density rises.
*Gate:* Dead-zone detector reports no gap over 3 game days for any active bot. A special can be under- and over-prepped and the harness shows the cost of each. A contract can be failed without the run becoming unrecoverable. A stage-3 service is parseable by a first-time observer within 10 seconds using the overlays.

**M6 — Density and polish.** Tier 1 detail pass, particle systems, sound with visual twins, Renovate mode, blueprints, expedite, named staff with portraits, traits, morale, barks. **The first ninety seconds (§20).**
*Visual DoD:* **Stage 4 — manic.** Conveyor lanes, robotic fry station, kiosks, continuous pass load, steam haze. Legible under the §21.3 rules. The zoom-in reward still works: dropping to Tier 1 in a stage-4 kitchen and watching one patty is still satisfying.
*Gate:* 60fps at Tier 2 with 40 customers and 12 staff **on a throttled mid-range device**. Every shape readable at 12px. A full service played muted loses no information. A new player reaches their first ladder rung untold. **Day 1, day 20 and day 60 screenshots look like three different games.**

**M7 — Act II: scale.** Sites 2 and 3, city tier, fast-sim LOD, sim into a Web Worker, offline with the "While you were out" card, delegation via role preferences and par levels, policy layer (§26.3).
*Visual DoD:* **Stage 5.** Venue cards on the city map are living miniatures, not static tiles — each visibly busy in proportion to its actual load. Zoom transitions between all three tiers are continuous and the HUD morphs rather than pops.
*Gate:* Fast sim within 5% of full sim. Three sites at 4× holds 60fps on target device. **Site 1 still contributes more than 15% of group revenue at three sites** — the anti-obsolescence check. Losing expedite at Act II feels like a loss (§22.6).

**M8 — Act II: the network.** Suppliers, volume tiers, storage, spoilage, 86'ing at scale, commissary, generic routing, delivery platforms and the delivery reputation channel.
*Visual DoD:* Trucks visibly move between venues on the city tier and arriving stock visibly lands in cool rooms. An 86'd item is loud and obvious. The supply network is watchable in its own right — the city tier should reward idling on it the way Tier 1 rewards idling on a grill.
*Gate:* A competent supply solution moves COGS from 34% to under 27% in the harness. **The §26 checklist passes in full** — the last cheap moment to fix it.

M6 remains the fattest milestone even with art distributed. If it thrashes, split it: Tier 1 detail and particles first, then people and onboarding.
---

## 26. Forward compatibility



Acts III–V are not being built now. These decisions must nonetheless be correct now, because each one is cheap today and a rewrite later. **Verify every item at every milestone gate.**

### 26.1 Never hardcode

| Thing | Wrong | Right |
|---|---|---|
| **Currency** | `cash: number` | `cash: Money` — typed value with a currency unit. Act III crosses borders. |
| **Wage rules** | Penalty rates as constants in the payroll system | `jurisdictions.ts` ruleset, selected per site |
| **Reputation** | `dineInRep`, `deliveryRep` fields | `Map<ReputationChannel, ReputationState>` with channels declared in config |
| **The site** | `Venue`, assuming a restaurant | `Site` with a type: venue, dark kitchen, commissary, colony module |
| **Placement** | Restaurant floor grid | Abstract grid + abstract service-point requirements. Cities and colonies are grids too. |
| **Routing** | Truck-specific delivery | `Route<Vehicle, Node>` — trucks, drones and lifters are vehicles with range, capacity, cost, downtime |
| **Camera** | 3 tiers | N-tier stack, tiers declared in config |
| **The trading day** | 11:00–22:00 hardcoded | Per-site trading calendar. Colonies don't have Tuesdays. |
| **Staff scope** | Staff belong to a venue | Staff belong to the *company*, assigned to a site. They must survive Act I to become Act III. |
| **The ladder** | Flat rung list | Rungs tagged by act, with act as a first-class progression dimension |
| **Bottleneck logic** | Kitchen-specific heuristics | General constraint-attribution service over the sim graph |
| **Distance and time** | Assumed instant or assumed metres | Explicit transit model with latency. Act V needs light-lag; Act IV needs flight time. |

### 26.2 The fast sim is not an optimisation

It is the substrate on which Acts III–V run. A nation of 200 franchises and an orbital colony are fast-sim-only entities that never instantiate an agent. Give it its own test suite, its own calibration gate, and treat any divergence from full sim as a P1 bug — because by Act III the fast sim *is* the game.

### 26.3 Build a policy layer at M7

The moment you have three sites, the player stops issuing commands and starts issuing standing instructions: role preferences, par levels, reorder points, "close early on Mondays". Model these explicitly as a **policy object attached to a site**, evaluated by the sim each tick.

This is the single most important forward-compatibility investment in the document. Act III's playbooks, Act IV's fleet doctrine and Act V's decision trees are all the same object with a richer grammar. If delegation is implemented as ad-hoc UI toggles reading directly into systems, Acts III–V require rebuilding the entire control layer.

```ts
type Policy = {
  siteId: SiteId;
  rules: PolicyRule[];        // condition → action
  authoredAt: GameTime;
  effectiveFrom: GameTime;    // Act V: authored now, effective in 40 minutes
};
```

Note `effectiveFrom`. Ship it inert in M7. It costs one field and it is the whole of Act V.

### 26.4 Save format

Versioned migrations from M2, with a schema that tolerates unknown site types, unknown reputation channels and unknown vehicle classes. Players who start in Act I must carry that save to Act V. **A save wipe between acts would break the single most important promise the game makes** — that progress is permanent and this is one continuous business.
## 27. Adversarial audit — run at every gate

Answer in writing before reporting a milestone complete.

1. Name a decision the player makes this milestone where **both options are defensible**. If you can't, the milestone added no gameplay.
2. Is there any stat that can be maximised with no downside? Name it or confirm none.
3. Did anything added this milestone become strictly better than its absence? Especially automation.
4. Can the player state their next two goals without opening a menu?
5. Is the current bottleneck nameable, quantified, and correct? Spot-check three scenarios by hand.
6. What is the longest decision-free gap in the harness this milestone?
7. **Did you hardcode anything on the §26 forbidden list?** Check it item by item.
8. Did any number get hardcoded outside `src/config/`? List and fix.
9. Does `sim/` import from `render/` or `ui/`? It must not.
10. Same seed, same output? Verify, don't assume.
11. Does every new UI element work with a thumb, in portrait, at 390px, with no hover state?
12. Does every new shape read at 12px?
13. Play a full service **muted**. Was anything missed?
14. Does any new system reward opening the app more than twice a day? It must not.
15. Does the oldest venue still matter?
16. What's the most boring 60 seconds of play right now, and what would fix it?
17. Is the newest system *visible*? If the player can't see it working, it may as well not exist.
18. Does every item added this milestone have an install beat, an idle signature and a working signature? Name them.
19. Which density stage (§21.1) is the game at, and does it match the milestone's target?
20. Screenshot the game at three points in a run. Do they look like different games?
21. Any tap anywhere that doesn't acknowledge within 100ms? Any dropped frames during a rush on the target device?
22. As density rose this milestone, what filtering did you add to keep it legible?
18. What did you build that nobody asked for? Justify it or delete it.

---

## Appendix A — the escalation in one table

| | Act I | Act II | Act III | Act IV | Act V |
|---|---|---|---|---|---|
| **Scope** | One shop | The group | The nation | The world | Orbit |
| **Verb** | Place | Route | Delegate | Saturate | Doctrine |
| **Constraint** | Floor tiles | Truck capacity, spoilage clock | Variance and local taste | Airspace, range, charge | Light-lag, lift cost |
| **You control** | Every station | Roles and routes | Standards and playbooks | Fleet doctrine and territory | Charter and cargo |
| **You see** | Everything, live | Three venues, one at a time | Aggregates and exceptions | Dashboards | News, hours late |
| **Failure** | Bad service | A venue runs dry Saturday 7pm | Variance blows out, brand slides | Overreach, regulatory ban | A colony starves quietly |
| **Unlocks at** | Start | 3 venues | 8 venues, 4.3 stars | National saturation | Post-launch, if earned |
| **Build phase** | M0–M6 | M7–M8 | Expansion 1 | Expansion 2 | Expansion 3 |

Every act keeps the same P&L. COGS%, labour%, waste%, reputation. You are still an operator watching the same four numbers when you are running drones over Osaka, and that is both the joke and the reason it holds together as one game.

---

## Appendix B — research sources informing v4 and v5

- Anthony Pecorella, *The Math of Idle Games* I–III (Kongregate / Game Developer, 2016) — exponential cost vs polynomial production, and the "newest generator dominates" trap §1.3 designs against.
- *Quest for Progress*, GDC Europe 2016 — genre terminology and the role of prestige.
- Retention benchmarks and the Hook / Habit / Hobby framing — mobile idle retention analyses, 2024–2026.
- Factorio community design writing — the bottleneck-to-bottleneck loop and the spaghetti → main bus → modular blocks progression behind §11.1 and §13.
- PlateUp! — layout as a first-class system, décor raising customer patience (§5.4).
- Egg Inc — contracts as long-tail retention (§16); also the cautionary case of monetising longer idle windows, which §4.3 forbids.
- Universal Paperclips — the canonical proof that phase-shifting scope, played entirely straight, outperforms escalating numbers.
- QSR automation equipment sources (Antunes, Aniai, FCSI, restaurant equipment trade press) — the real machines behind §14.
