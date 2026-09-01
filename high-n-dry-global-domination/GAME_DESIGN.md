# HIGH N' DRY: GLOBAL DOMINATION — Game Design Document
**Version 0.3 · July 2026 · Owner: Ben Kagan**

> An idle empire game where flame-grilled burgers fund world domination. Start running the pass in one Sydney suburb; end with your flag over five continents, an army fed on beef, and a fleet of burger drones. Cynical, lived-in hospo comedy escalating deliberately into absurdist military satire.

**STATUS: direction validated, feel NOT final.** The active layer went through seven playable prototypes (see PROTOTYPE_NOTES.md — read it before writing any gameplay code, it documents the dead ends so you don't rediscover them). Ben's verdict on v7, the best version: *"the closest we've been, but still not good enough."* Treat every feel value as open. Every milestone with player-facing gameplay has a **feel gate**: Ben plays it and signs off before you proceed. Sim assertions govern the idle economy; thumbs govern the active layer.

---

## 0. Non-negotiable design pillars

1. **You can never lose anything.** No venue loss, no territory loss, no offline losses. Failure = wasted resources or wasted seconds, never regression.
2. **Economy first, war second.** The war layer is a sink for economic output.
3. **The lived-in texture is the differentiator.** Wages, no-shows, tradie crews, Friday rush, flopped specials. Real hospo cynicism, not "Cooking Fever" fantasy.
4. **Simulation-verified idle balance.** Every idle-economy value lives in `economy.config.json` and must pass the assertion suite. Active-layer values also live in config but are gated by playtest, not sim.
5. **Escalation into absurdity is deliberate and phased** (suburb → city → national → global military-burger complex), with explicit tone gates.
6. **Every attention state needs a verb.** Rush = triage. Lull = investment (prep, flyers, research). Always = garnish (coins). There is never a moment without a meaningful tap, and no tap is ever mandatory.

## 1. Platform & technical direction

- v1: browser HTML, **React/DOM UI + one 2D canvas scene** (the venue). three.js reserved exclusively for the eventual world-map globe. Mobile portrait-first (390×844); end state is a Capacitor-wrapped mobile app.
- Persistence via a storage adapter interface (in-memory in previews, real storage in builds).
- **Headless engine first for the idle economy.** The idle sim (demand curves, staffed production, offline settlement, war resolution) is a pure TS package, unit-tested, no DOM. The active layer is necessarily UI-coupled (it's real-time input), but its *rules* (order generation, patience, stock, serve resolution, tips, surge effects) still live in the engine package and are deterministic given an input log — replayable and testable.

## 2. The two-clock architecture

This is the load-bearing decision that fixed the pacing problems of prototypes v1–v5:

- **Economy clock (gmin):** 1 real sec = 2 game minutes. Drives the day/week cycle, daypart labels, night tint, idle earnings, offline settlement, and the war layer's weekly rhythm. All idle-economy math from v0.2 still runs on this clock.
- **Active clock (real seconds):** patience, cook progress, surges, cooldowns, wave gaps. Tuned for thumbs, bounded so play is never dead and never impossible, regardless of what the economy clock says. The economy clock's daypart only sets wave *intensity* (lunch busier than 3pm), never raw spawn floods.

Active play should out-earn idle at equivalent progression (target ~2–3×, open question) — playing is always worth it, idling is always fine.

## 3. Layer 1 — The Expeditor (active core loop)

**Fantasy: you're the owner running the pass.** You don't cook — you make calls. The reference implementation is `reference/prototype-v7.jsx`; it is the spec for feel until superseded.

### 3.1 The scene is the controller
A 2D canvas venue: stations along the back, stock on the pass, a queue of customers, street traffic outside. Customers carry their order in a bubble and a patience ring. **The core verb: tap a customer to serve them.** Ring glows green when the pass covers their order; tap → everything flies to them at once, cash + possible tip. Tap someone unservable → they shake and only the missing items flash. The scene teaches; there are no tutorials.

### 3.2 Stations & stock
Stations self-produce into small buffers (visible items on the pass, dimmed slots showing cap). Tapping a station pad adds ~1/3 cook progress — a boost, never a gate. Hires (per lane, cheapest first: Sammy→Tash→Deano) multiply auto-rate ×3 and appear as sprites at their station. Upgrades per lane: cook speed and pass space, both **capped by venue size**; renovations (Shopfront → Corner Site → Flagship) visibly widen the venue, lengthen the queue, and raise every cap.

### 3.3 Orders & triage
Balanced order mix (~50% include a burger; a fifth are drink-only quickies) so no station monopolises attention. The **tradie crew** is the rare whale: huge order, price tag overhead, shorter fuse — the standing triage dilemma. Tips pay out for serving anyone in their top 40% of patience: the skill being rewarded is *reading the room*, not tap speed.

### 3.4 Wave pacing
Customers arrive in bursts of 1–3 with breathing room, denser at lunch/dinner. Surges (ads, banger specials) push intensity above dinner peak and bias orders bigger. Walk-outs when the queue is full stride past the window — the renovation sales pitch, wordless.

### 3.5 Downtime verbs
- **Specials R&D 🧪:** tap-to-fill (~35 taps). 20% banger → named 60s surge; 80% flop → small cash + a one-liner (the humour engine — flop copy is content, write lots of it). Later this graduates into the menu-R&D tech tree that unlocks map demographics (§8).
- **Prep 🔪:** taps bank mise en place (capped by venue size); while prep lasts, all stations cook +60%, burning one per item. Downtime converts directly into rush firepower.
- **Flyers:** tap a passerby, ~55% convert, the rest say "nah mate."
- **Coins:** ~30% of happy customers drop a fading 🪙. Garnish.
- **Boost Socials 📣:** $200 (×1.3/use, 60s cooldown) → 45s AD BLITZ surge. Priced to profit only if the wave is served well.

### 3.6 Events
The no-show: a hired lane's staffer doesn't appear ("No text. No call. Classic Deano."), choose pay-cover or work the lane yourself. Event frequency low; events are one-tap decisions with flavour, never chores. The event system is data-driven — more event types come from content rows, not code.

## 4. The automation arc (active → idle)

The long game gradually promotes the player from the pass to the office, without ever removing the option to jump back on the tools:

1. **All lanes staffed** → stations keep pace with normal waves; you triage and run downtime verbs.
2. **Shift supervisor** (new hire tier) → auto-serves customers whose orders are in stock, at a rate below your manual ceiling and **never earning tips** — manual play stays strictly better, idle play stays viable. This is the bridge to the idle game.
3. **Venue manager** → the v0.2 idle model takes over this venue entirely: it earns on the economy clock per the staffed-capacity sim, offline settlement included. You get dragged back for events, records, and because it's fun.

Idle earnings per venue derive from the v0.2 economy sim (demand curve × staffed capacity × margins) — all v0.2 config sections remain the source of truth for that layer, including offline caps (Egg Inc model, no losses, transparent).

## 5. Layer 2 — The Empire

Unchanged in structure from v0.2: venues as tier generators on map tiles (venue N costs 50,000 × 3.5^N), each new venue restarts the Expeditor loop in a new demographic — prestige-feel without reset. New venues can be played actively (you're on the pass at Rosebery while Leichhardt idles) or staffed straight to idle. Regions unlock area managers and shared upgrades. Currencies unchanged: **Cash** (regional) / **Reputation** (specials, events, service) / **Influence** (global, permanent, √(lifetime profit), no reset — split between economy multipliers and war assets).

## 6. Layer 3 — The War

Unchanged from v0.2 §8: hex map, authored Sydney start (seed content shipped in /content), rivals who expand into neutral tiles but **never attack yours**, deterministic transparent battles resolved at Friday peak, supply lines through butcher tiles, four escalation phases with tone gates ending in burger drones and annexation. The war layer consumes Influence and Cash; the Expeditor layer is what makes earning them fun.

## 7. Pacing targets

**Idle economy (sim-asserted, unchanged from v0.2):** manager/venue/rival/capture/domination beats per `pacingTargets` in config — re-verify after the automation-arc hires are added to the sim.

**Active layer (feel-gated, measured in playtest):** first hire within ~3 minutes of play; all three lanes staffed by ~10; first renovation ~8–12; a lunch rush should feel *nearly* unmanageable solo and comfortable with two hires; no dead air longer than ~8 seconds; downtime verbs should each get organic use (a verb Ben ignores gets cut).

## 8. Content is data

All content in /content JSON validated by zod schemas: tiles, managers, rivals, specials (drives both R&D names and map demographics), warAssets, upgrades — plus new files for **event types** and **flop lines**. The agent loop contract (CLAUDE.md) still applies: content iterations add rows, run validation + idle assertions + drift check, never touch engine.

## 9. UI surfaces (v1)

1. **The Floor** — the Expeditor scene + station pads + downtime row (built; iterate from prototype-v7)
2. **Back office** — hires, upgrades, renovation, stats (currently inline; becomes a drawer)
3. **Empire dashboard** — venue list, currencies, managers (Layer 2)
4. **Map** — 2D hexes, then the globe (Phase 3+)
5. **Battle planner & settlement screens** — per v0.2
6. **Milestone beats** — full-screen moments for hires, renovations, phase gates

## 10. Out of scope v1
Monetisation, multiplayer, cloud saves, push notifications, localisation, achievements. **Sound is now IN scope for v1** (Tone.js): sizzle scaling with cook activity, serve cha-ching, tip chime, surge sting — the prototypes made clear feel is the product, and sound is a third of feel.

## Appendix A — Design lineage
Idle math (exponential costs, config-driven balance, milestone bonuses): Cookie Clicker/AdCap/Idle Idol practice. Managers-as-automation-milestones and new-markets-as-ecosystems: AdVenture Capitalist. Transparent offline caps: Egg Inc. Influence: Angels/Soul Eggs minus the reset. The Expeditor loop: original, arrived at through seven prototypes — its lineage is documented failure (PROTOTYPE_NOTES.md).
