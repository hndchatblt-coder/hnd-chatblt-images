# HIGH N' DRY TYCOON — THE FIRST 20 STEPS

Companion to `hnd-tycoon-build-prompt.md` (v5). That document is the **what**. This is the **order**.

Each step is one Claude Code working session ending in a commit. Do not start a step until the previous one's exit criteria pass. Section references (§) point at the spec.

**Steps 1–20 deliver a complete, shippable Act I** — one venue, fully playable, visually escalating from quiet to manic, balanced by harness, with onboarding. Act II (steps 21–28) is sketched at the end so nothing in Act I paints it into a corner.

---

## Phase A — The engine (steps 1–4)

Headless. No pixels. The goal is a simulation you can argue with.

### Step 1 — Skeleton and clock
Vite + TypeScript + Vitest. `sim/` with zero render imports, enforced by an ESLint boundary rule that fails the build. Fixed 10 Hz tick loop, seeded RNG, game clock with a per-site trading calendar (§26 — do not hardcode 11:00–22:00). `npm run sim -- --days 7 --seed 42`.
**Exit:** identical seed produces byte-identical output across two runs. Clock advances correctly across a week including Sunday 23:00.

### Step 2 — One customer, one burger
Poisson arrivals on a flat rate. One recipe as a step DAG with batching, one station, one staff agent. Orders created, worked, served. Console day report: covers, mean wait.
**Exit:** a 7-day run shows plausible covers and wait times. Doubling the station's speed halves mean wait. The DAG resolves dependencies correctly — verify by hand on one order.

### Step 3 — The floor
Tile grid with abstract service-point requirements (`Site`, not `Venue`). Station footprints, placement validity, A* pathing, walk time charged against staff availability. Leichhardt's 9×15 with the column at (4,7).
**Exit:** **moving the grill six tiles from the pass measurably drops throughput.** Print the delta. This is the single most important number in the project — if layout doesn't matter, the game doesn't exist.

### Step 4 — Attention profiles and buffers
Split every step into setup / tend / teardown (§14.1). Buffers with freshness windows and quality decay. Waste on expiry. Multi-station, multi-staff task assignment by priority queue with nearest-preference.
**Exit:** par-cooking ahead of a simulated rush measurably improves wait *and* measurably increases waste. Both effects visible in the day report. The core tension exists in text.

---

## Phase B — First light (steps 5–7)

The first pixels. From here, every step ships something watchable.

### Step 5 — ShapeRegistry and the first watchable burger
PixiJS. `ShapeRegistry` drawing primitives once into RenderTextures, then instancing. Oblique top-down projection. Portrait 390×844 dev frame. Render the floor, stations, staff walking and carrying, and the food colour ramp raw → seared → perfect → burnt.
**Exit:** **density stage 0.** Someone unfamiliar watches for 30 seconds and correctly describes what's happening, unprompted. You want to keep watching it. If you don't, stop and fix it before proceeding — everything downstream assumes this is pleasant.

### Step 6 — Money and the P&L
`Money` as a typed value with a currency unit. COGS including waste, ingredient tiers, rent, utilities on equipment run-hours. Payroll accruing hourly against a **jurisdiction ruleset** with Australian penalty rates, paid Sunday 23:00 as a lump. End-of-day report as data.
**Exit:** P&L reconciles to the cent across a 90-day run. Sunday trade is a genuinely marginal decision at baseline staffing — check by running the same week with and without.

### Step 7 — Buying things, and the install beat
Equipment catalogue, buy/sell at 60% resale, capex vs financing over 12/24/36 game months. Hiring and firing. The **install beat** (§21.2): drop-in with shadow, 2px shake, dust, power-on. Idle signatures — pilot lights, fans, readouts. Money tweens and flashes. Every tap acknowledges under 100ms.
**Exit:** **density stage 1.** Buying a fryer feels good. Every item in `config` has a documented install, idle and working signature — list them. No dead taps anywhere.

---

## Phase C — The tension (steps 8–11)

Where it becomes a game rather than a toy.

### Step 8 — The bottleneck readout
General constraint-attribution service over the sim graph (§13) — not kitchen-specific heuristics. Reports the **binding** constraint with a cost in covers/day, including non-station answers: walk distance, covers, front-of-house, short-staffed Saturdays, *demand is the constraint*. Text form first, in the HUD.
**Exit:** hand-check three constructed scenarios against the readout and get the right answer in all three. Build `bot:balanced` to act on it and prove it beats a variant ignoring it.

### Step 9 — Satisfaction, reviews, reputation
Satisfaction from wait × quality × accuracy. Review generation with angry-skew. **Reputation as `Map<ReputationChannel, ReputationState>`**, not fields. 10-day half-life, 3.8-star prior at weight 15. Errors, fatigue, remakes.
**Exit:** a deliberately bad week visibly tanks reputation and takes 8–10 trading days of good trade to recover. Channel map handles two channels with only config changes.

### Step 10 — Demand, pricing, marketing, balking
Full demand formula including `competitorPressure` pinned at zero (§6.1). Daypart and day-of-week curves. Customer archetypes with distinct silhouettes. Balking with the ambience modifier. Pricing UI with a live fair-price band (§8.2). Marketing channels with cost-per-cover surfaced (§8.3). Ticket rail with the white → amber → red age ramp. Customer mood through posture.
**Exit:** **a walkout is legible on screen before the stat moves.** A muted observer identifies an over-marketed service from the screen alone. `bot:naive` demonstrably spirals — ship the chart.

### Step 11 — Incidents, ambience, recovery
Incident system (degrade only, never timed). Ambience as a third claimant on floor tiles, driving patience and spend. Recovery Plan on reputation below 2.5. Overdraft with the increasingly passive-aggressive bank.
**Exit:** `bot:naive` recovers when switched to balanced by ~day 55. The dig-out is ~8 game days and the player can always see the next objective. No state is unrecoverable.

---

## Phase D — The automation game (steps 12–13)

### Step 12 — The equipment ladder
Tiers 1–5 from §14.2, each wired through attention profiles. Machine reliability proportional to run-hours, preventive maintenance as a skippable recurring cost, a new incident class per machine type. **Every machine trades labour for at least two of: capital, floor space, utilities, flexibility, reliability.**
**Exit:** `bot:roboboss` and `bot:tightarse` both finish within 25% of `bot:balanced` — **neither strategy may dominate.** Document the new problem each machine creates; any machine without one gets cut or costed.

### Step 13 — The rhythm beat
The mechanical/human motion contrast (§21.5), exaggerated deliberately. Machines metronomic, people irregular. Working signatures per machine. A machine failure visible before it's notified.
**Exit:** **density stage 2.** A player distinguishes an automated kitchen from a manual one at a glance, muted, with no labels. This is the game's best visual moment — do not rush it.

---

## Phase E — Ambition (steps 14–16)

### Step 14 — The ladder and the daily headline
Progression rungs tagged by act (§15.1). Two always visible in the HUD. Capability rewards only — **never flat cash**. Unlock gating so systems arrive one per session. The daily headline: one specific line of plain English drawn from real data.
**Exit:** dead-zone detector in the harness reports **no decision-free gap over 3 game days** for any active bot. The headline is specific and never generic — read twenty of them and cut any that could apply to any day.

### Step 15 — Weekly specials
Monday selection from an unlocking pool. Named-day demand uplift, shared stations, prep-ahead requirement, ingredient exposure. 86'ing mid-rush with its outsized reputation cost.
**Exit:** the harness shows a measurable cost for both under-prepping and over-prepping. 86'ing a promoted special is demonstrably worse than never running it.

### Step 16 — Contracts
One active maximum, always declinable with no penalty, deadlines in **game days only**. Function catering, festival stall, corporate lunch account, food truck day, influencer visit. Capability and reputation rewards.
**Exit:** a contract can be failed without the run becoming unrecoverable. A player mid-recovery can decline indefinitely and still progress.

---

## Phase F — Manic (steps 17–18)

### Step 17 — Density and legibility
Tier 1 detail pass. Particle systems with pooling. Steam, haze, conveyor motion. Overlays (congestion, walk distance, utilisation, queue age) auto-surfacing past an entity-count threshold. **Motion budget degradation** — individual fidgets cull as density rises. Reserved-hue enforcement: nothing decorative uses ticket amber/red or the food ramp. Sound with visual twins.
**Exit:** **density stage 4 — manic.** 60fps with 40 customers and 12 staff **on a throttled mid-range Android**. Every shape readable at 12px. A full service played muted loses no information. **Dropping to Tier 1 in a stage-4 kitchen and watching one patty is still satisfying** — the zoom-in reward must survive.

### Step 18 — Staff as people
Named characters, parametric portraits, traits, skill learning on a log curve, stamina, morale, quitting with notice. Barks — roughly one per staffer per five minutes, weighted to meaningful moments. **`Staff` owned by the company, never venue-scoped** (§26).
**Exit:** losing a two-year staffer hurts. Read the bark list aloud; cut anything that isn't funny or true. A machine arriving triggers *"So what happens to me, then."*

---

## Phase G — Shippable (steps 19–20)

### Step 19 — Renovate, blueprints, expedite, onboarding
Renovate as a separate fullscreen mode with chunky handles, snap targets, ghost previews and a live throughput delta before confirming. **No station dragging in the live view.** Named blueprints. Expedite as pure reordering. **The first ninety seconds (§20)** — one burger, one tap, one card, one rung. No modal tutorials, no arrows.
**Exit:** a first-time player reaches their first ladder rung **without being told anything**. Test on three people who have never seen it. Expedite is good enough that losing it in Act II will feel like a loss.

### Step 20 — Balance, save, ship
Full harness pass against every target in §25.2. Versioned save migrations tolerating unknown site types, reputation channels and vehicle classes. Telemetry export. Offline accrual with the "While you were out" card showing the arithmetic. `prefers-reduced-motion`. Final §26 forward-compatibility checklist.
**Exit criteria — all must hold:**
- `bot:balanced` reaches the venue-2 threshold at game day 45–60.
- Labour 28–34% unautomated, 22–26% automated, with capex and utilities absorbing the difference.
- COGS 30–36%. Longest decision-free gap under 3 game days.
- No strategy dominates; no stat maximises without a downside.
- **Day 1, day 20 and day 60 screenshots look like three different games.**
- A save created at step 6 still loads.

---

## What comes after (steps 21–28, Act II — do not build yet)

Listed only so nothing in steps 1–20 forecloses them.

21. Fast sim as a first-class module with its own calibration test suite.
22. Sites 2 and 3 with distinct daypart profiles and floorplans.
23. City tier with living venue miniatures — density stage 5.
24. Sim into a Web Worker; LOD switching between full and fast sim.
25. **The policy layer** (§26.3) with `effectiveFrom` shipped inert — par levels, reorder points, staffing floors, service targets.
26. Suppliers, volume tiers, storage competing for tiles, spoilage, 86'ing at scale.
27. Commissary and generic `Route<Vehicle, Node>` routing.
28. Delivery platforms and the delivery reputation channel.

---

## Standing rules for every step

1. Run the adversarial audit (§27) before reporting the step complete. Fix what it finds first.
2. Zero magic numbers outside `src/config/`.
3. `sim/` never imports from `render/` or `ui/`. The build fails if it does.
4. Check the §26 forbidden-hardcode list every step, not just at the end.
5. Never hand-tune balance by playing. Tune with the harness, verify by playing.
6. If a step's exit criteria don't pass, do not proceed. Say so and stop.
7. If two steps' worth of work is landing in one commit, split it.
