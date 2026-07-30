# HIGH N' DRY: CLICKER — Build Brief
**For Claude Code · Owner: Ben Kagan · Drop this in repo root, reference it from CLAUDE.md**

---

## 0. How to use this document

Read this whole file before writing any code. Then:

1. Write `GAME.md` (your restatement of the spec, so drift is visible), `economy.config.json`, and `DESIGN_TOKENS.md` (§4).
2. Build to Milestone 0 (§7).
3. Run the loop in §6 until the exit criteria fire.
4. Stop at every **FEEL GATE**. Do not proceed past one without Ben's sign-off.

**This is not Burger Warlord.** That project is a three-layer idle/empire/war game with a real-time expeditor layer, and it is parked. This is deliberately smaller and purer: **one screen, one number, one thumb, Cookie Clicker's exact skeleton, High N' Dry's skin and voice.** If you find yourself adding a second gameplay screen, you have gone wrong. Scope discipline is the whole point — the goal is one prototype finished to a high bar, not a bigger game half-finished.

---

## 1. The premise

High N' Dry is a real burger bar group: three Sydney venues (Leichhardt, Rosebery, Neutral Bay), flame-grilled beef, weekly specials, ~25 staff. The game starts with one grill and one pair of tongs and ends with beef futures and orbital flame-grilling. The comedy is dry, specific and lived-in — real hospo texture, not "Cooking Fever" fantasy.

**Core loop:** tap the patty → cash → buy staff/venues/infrastructure that make cash without tapping → buy upgrades that multiply both → hit a wall → sell the business (prestige) → do it again faster.

That's it. Don't improve on it. Cookie Clicker's loop is load-bearing; your job is execution quality, not invention.

---

## 2. DEFINITION OF DONE — "high-definition prototype"

This is the goal state the loop in §6 is driving toward. The prototype is done when **every** box is ticked and verified, not asserted.

**Feel**
- [ ] Every tap produces, within one frame: patty squash, flame flare, grease particles, a rising number, a layered click sound, and haptic on mobile.
- [ ] Buying anything has a distinct, satisfying confirmation — sound, motion, and a permanent visible change on screen.
- [ ] Crossing a power threshold (10th of a generator, an upgrade, a golden patty) is *unmistakable* without reading text.
- [ ] The number counter animates and never just snaps.

**Performance**
- [ ] Sustained 60fps at 390×844, with 4× CPU throttling, during a golden-patty frenzy with all generators owned.
- [ ] No frame > 20ms in a 60-second stress capture.
- [ ] Cold load to first interactive tap < 2s on throttled 4G.
- [ ] Bundle < 1.5MB gzipped.

**Content depth**
- [ ] 12 generators, ~60 upgrades, 40 achievements, 60+ ticker lines.
- [ ] First prestige reachable in 45–120 minutes of casual play; no dead stretch longer than 90 seconds where nothing is affordable and nothing is happening.
- [ ] Second run is measurably faster and the player can feel why.

**Craft floor**
- [ ] Save/load, autosave every 10s, offline earnings, export/import save string.
- [ ] Settings: sound, music, reduced motion, number notation (short vs scientific), hard reset with confirmation.
- [ ] Stats page with real numbers (total taps, best run, lifetime revenue, burgers per second).
- [ ] Visible keyboard focus, `prefers-reduced-motion` honoured, no layout shift, works one-handed in portrait.
- [ ] Zero placeholder assets, zero lorem, zero emoji standing in for icons.

**Art & sound**
- [ ] Executed against the token system in §4, not a default framework look.
- [ ] Ambient grill sizzle bed, layered click, tier-up stinger, golden-patty fanfare. Sound is not optional — it is most of "high definition."

---

## 3. Game spec

### 3.1 Currency and the click
One currency: **cash ($)**. The tracked vanity stat is **burgers sold**.

The tappable object is a **flame-grilled patty on the grill**, centre screen, occupying the thumb zone (lower 60% of a 390×844 portrait viewport). It is the hero and the signature element — it should look good enough to screenshot. Tapping = one burger served = cash.

### 3.2 Generators (12, cost growth 1.15)

| # | Name | Flavour |
|---|---|---|
| 1 | Second pair of tongs | You bought a second pair of tongs. You still do all the work. |
| 2 | Fryer | Chips sell themselves. |
| 3 | Grill hand | Turns up. Mostly. |
| 4 | Front of house | Someone else takes the orders now. |
| 5 | Uber Eats listing | Strangers, at scale, with opinions. |
| 6 | Rosebery | Second venue. |
| 7 | Neutral Bay | Third venue. Different POS, don't ask. |
| 8 | Ghost kitchen | A burger shop that isn't anywhere. |
| 9 | Franchise program | Other people's rent. |
| 10 | Patty factory | 8mm then 6mm, forever. |
| 11 | Cattle station | Now employs more people than the burger shop. |
| 12 | Beef futures desk | You are, technically, a commodities trader. |

Each generator gets tiered ×2 upgrades at 10/25/50/100/150 owned, plus a synergy upgrade or two that ties it to a neighbour.

### 3.3 Upgrades
Three families: **click multipliers** (better tongs, the STPP patty formula, double-grind), **generator multipliers** (tiered, above), **global multipliers** (weekly special board, Lightspeed integration, ticket printer, hiring a manager called Archie, a reel that goes viral). Some upgrades convert a portion of generator output into click power and vice versa — that's what keeps active play meaningful.

### 3.4 Golden Patty
Spawns on a randomised timer, drifts across screen, tappable for ~13s. Effects, weighted:
- **Frenzy** — ×7 production for 77s
- **Lucky** — instant cash equal to 15% of bank or 900s of production, whichever is lower
- **Service bell** — ×777 click power for 13s
- **Health inspector** (rare, negative) — production halved for 60s. Never destroys anything. **The game never takes progress away.**

### 3.5 News ticker
A single line above the patty, cycling every ~10s, pulling from pools gated by progress. Voice: dry, specific, deadpan, one notch past reality — never zany. The joke is always about something real.

Samples to set the register (write 60+ in this voice):
- Table 4 asked if the flame-grilled burger comes flame-grilled.
- A regular has ordered the same burger 400 times and still reads the menu.
- The fryer is making a noise. It is a new noise.
- Someone has reviewed a burger they did not order.
- Staff member called in sick via the venue's own Instagram story.
- Your 3pm delivery arrived at 3pm. Enjoy this. It will not happen again.
- A man in Rosebery has described the patty as "structurally honest."
- The new special sold out in nine minutes. Prep for it begins tomorrow.
- Health inspector visited. Left with a burger and no notes.
- Late-game: the cattle station has unionised and their demands are reasonable.

Rules: no explaining the joke, no puns flagged as puns, no emoji, no exclamation marks except in the brand-voice achievement names.

### 3.6 Prestige
**Sell the business.** Converts lifetime revenue into **Goodwill**, a permanent global multiplier, spent on a small perk tree (faster golden patties, stronger openings, offline rate). Threshold tuned so the first sale lands at 45–120 min. The sell screen is a moment: make it land.

### 3.7 Achievements
40, dry names, real triggers. ("Owner-operator" — 10,000 manual taps. "Understaffed" — reach $10k with zero generators. "Trading down" — buy a beef futures desk before a fryer.)

### 3.8 Offline
Earn at a reduced rate while away, capped at 8 hours, with a plain welcome-back summary. No dark patterns, no timers you must return for, no punishment for leaving.

---

## 4. Art & sound direction

**Do the two-pass design process before you write UI code.** First write `DESIGN_TOKENS.md`: 4–6 named hex values, a display face + body face + numeric/utility face, a layout concept as an ASCII wireframe, and one named signature element. Then critique that plan against this brief and revise anything that reads like a default, saying what you changed.

Constraints:
- The subject's own world is the source material: menu boards, ticket rails, heat lamps, char marks, laminated specials, service dockets, grease. Steal from *that*, not from mobile-game convention.
- **Forbidden defaults:** cream background with a high-contrast serif and terracotta accent; near-black with one acid-green accent; broadsheet hairline rules. Also forbidden: generic "casual mobile game" — no bubbly rounded gradient buttons, no cartoon starbursts, no purple-to-pink.
- High N' Dry's own brand voice is loud and irreverent. The UI can be loud. It cannot be sloppy.
- Spend boldness in one place — the patty and its reaction to being hit. Everything else stays disciplined.
- Screenshot your own work at 390×844 and look at it. A picture is worth a thousand tokens.

Sound: Tone.js or short samples. Ambient sizzle bed under everything, pitch-varied layered click (never the same sample twice in a row), tier-up stinger, golden-patty fanfare. Everything duckable and mutable.

---

## 5. Architecture

- Single-page React + Vite, TypeScript strict. Portrait-first, mobile-shaped, one screen with slide-over panels.
- **Headless engine first.** All economy logic in a pure TS module with zero DOM: tick, purchase, multiplier resolution, prestige, offline settlement. The UI reads state and dispatches intents. Nothing else.
- **Config is law.** Every number lives in `economy.config.json`. No numeric literals in engine code except 0, 1, and array indices. If you need a value that isn't in config, add it to config and flag it in your iteration note.
- **Deterministic.** Seeded RNG throughout. Same seed + same input tape = same result, or the playbot in §6 is worthless.
- Storage behind an adapter interface. Save format versioned with a migration path from day one.
- Canvas for the patty scene and particles; DOM for everything else. Do not put the whole UI in canvas.

---

## 6. THE LOOP

This is the engine of the project. One iteration = one change. Run it until the exit criteria fire.

### `loop.sh` — one iteration

```
1. npm run gates          # G1–G6, below. Any red → fix that, iteration over.
2. npm run playbot        # headless simulated playthroughs → reports/pacing.json
3. npm run shots          # Playwright screenshots of 6 named states → reports/shots/
4. AUDIT                  # adversarial subagent, fresh context (see below)
5. FIX ONE                # highest-severity finding only. Exactly one.
6. LOG                    # append to PROGRESS.md: finding, change, gate deltas. Commit.
```

### The gates (machine-verifiable)

- **G1** — typecheck + lint clean.
- **G2** — unit tests pass.
- **G3 — economy assertions.** No generator is ever strictly dominated (each must be the best $/output for some window). Cost curve holds. Idle-only play reaches prestige without softlock. Active play yields 2.0–3.0× idle over 30 minutes. No single upgrade produces more than a 25× step. First prestige lands in 45–120 min at the casual profile.
- **G4 — pacing.** From `pacing.json`: no window longer than 90s where nothing is affordable and nothing is happening; every generator gets bought by every profile; no generator goes unbought for 20+ minutes after unlock; purchase events are spaced without a cliff.
- **G5 — performance.** The §2 numbers, measured, not estimated.
- **G6 — craft floor.** Save/load round-trips exactly. Offline earnings correct across a simulated 8-hour gap and across a clock change. Reduced-motion path renders. Focus visible. No console errors.

**Playbot profiles:** `idle` (zero taps), `casual` (2 taps/sec for 20s per minute, catches half the golden patties), `tryhard` (8 taps/sec, catches all). Run each for 3 simulated hours.

### The auditor

Spawn a **fresh subagent with no build context**. Give it: this brief, `GAME.md`, `reports/pacing.json`, and the screenshots. **Do not give it the source code** — it is playing the role of a hostile playtester, not a reviewer.

It writes to `AUDIT.md`: findings with severity **P0** (broken/unshippable) → **P3** (polish), each with a repro or a specific screenshot reference. It must either file findings or explicitly certify the build against the §2 checklist. Its instruction: *be uncharitable. Assume the thing is boring and prove it.*

Visual rubric for the auditor: does this look like a designed product or a framework demo? Does the hero element earn the screen? Is the type doing work? Is there a single memorable thing? Would a screenshot of this stop a thumb?

### Exit criteria

Stop the loop and hand over when **all** of:
- Every §2 box is ticked and verified.
- All gates green.
- Two consecutive auditor passes with zero P0 or P1 findings.

Then build, and write `PLAYTEST.md`: what changed since the last playtest, and **three specific questions** for Ben — not "how does it feel," but "does the 10-owned threshold read without the toast," "is the first 90 seconds too quiet," "is the sell-the-business screen worth the wall it follows."

### Stop-and-ask triggers (hard)

Halt and ask Ben if any of these hit:
- The same finding survives three iterations.
- A gate can only be passed by changing a design pillar.
- 25 iterations elapse without exit.
- **You are tempted to weaken an assertion or delete a test to get green.** Never do this. If an assertion is wrong, stop and say so — do not fix it yourself.
- The scope creeps toward a second gameplay screen.

### What the loop cannot do

It cannot tell whether the game is fun. It can only certify: not broken, not slow, not ugly by rubric, not boring by the numbers. Fun is Ben's call at the feel gates, and the loop is deliberately built to end at one rather than to run forever.

---

## 7. Milestones

| # | Deliverable | Gate |
|---|---|---|
| M0 | Headless engine, config, sim harness. No UI. | G3 green |
| M1 | One screen: patty, tap, cash, one generator, save/load. | **FEEL GATE 1** — is the tap right? Nothing else matters yet. |
| M2 | Full 12-generator ladder, upgrade families, cost curve. | G3 + G4 |
| M3 | Juice pass: particles, number pops, screen feel, full sound. | **FEEL GATE 2** — is it satisfying for 5 straight minutes? |
| M4 | Golden Patty, ticker, achievements, stats, settings. | G4 + G6 |
| M5 | Prestige, Goodwill perks, offline earnings. | G3 + G6 |
| M6 | Art direction executed to §2 and §4. | **FEEL GATE 3** — would you screenshot this? |
| M7 | Run §6 to exit criteria. | Exit criteria |

---

## 8. Rules of engagement

- **One change per iteration**, one direction change per version. Never batch fixes.
- **Present options, let Ben steer.** His instincts have beaten the first proposal every round on the last project. When he says something's wrong, diagnose structurally before proposing a tune.
- **The game never punishes.** No loss of progress, ever. Failure costs wasted seconds or wasted cash, never regression.
- **No dark patterns.** No forced ads, no timers designed to pull him back, no fake urgency.
- Don't ask permission for things this brief already decided. Ask about things it didn't.
- Ben's style is terse. Write iteration notes the same way.
