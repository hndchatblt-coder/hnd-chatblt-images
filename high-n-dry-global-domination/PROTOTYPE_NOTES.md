# PROTOTYPE_NOTES.md — What we tried, what died, and why

Seven playable prototypes were built and playtested by Ben in the design phase. This file exists so you (Fable/Claude Code) never resurrect a dead end. The surviving design is in GAME_DESIGN.md §3; the reference implementation is reference/prototype-v7.jsx.

## v1 — Passive idle Layer 1 (DEAD)
Classic idle panel: demand curve, buy stations, numbers rise. **Verdict: flat.** Between purchases there was nothing to want or do. Lesson: the sim was sound (kept, as the idle layer) but a sim is not a game.

## v2 — Canvas scene, capped upgrades, renovations (PARTIALLY SURVIVED)
Added the venue scene (customers, flames, walk-outs) + station caps + venue-size renovations. **Verdict: better but still a flat line — you watch, you don't play.** Survived: every upgrade tied to a visual, caps raised by renovation, the scene itself, the no-show event. Lesson: visibility ≠ interactivity.

## v3 — Ticket rail + tap-to-produce lanes (DEAD, instructive)
Ben's redirect: "you should almost always have something to click to speed things up." Orders as ticket cards, three tap pads producing items, per-lane hires. **Verdict: right philosophy, wrong execution — pure tap spam, no decisions.** Survived: per-lane hires cheapest-first (three relief moments), tap-still-useful-after-automation.

## v4 — Cook cooldowns (DEAD)
Taps start timed cooks. **Verdict: turned tapping into waiting.** The pads became alarms. Lesson: a cooldown on your only verb is a gate, and gates on the core verb feel bad on mobile.

## v5 — Micro-verbs: flip the patty, lift the basket, hold-to-fill (DEAD — the big failure, study this one)
Distinct gesture per lane + perfect windows + tips. Sounded great. Three fatal flaws found in playtest:
1. **Attention ping-pong:** two-stage flips made attention bounce between timers instead of flow.
2. **One thumb:** hold-to-fill physically blocked all other input. Multi-touch interaction model on a one-thumb device.
3. **Burger monopoly:** the order generator gave every order a burger + the grill had the longest, deepest verb → 90% of attention on one lane. Pacing fed the idle demand curve straight into real-time play → unwinnable lunch floods, dead 3pms.
Lessons (all structural, all now pillars): balanced order mix; no holds; single-stage everything; **decouple the two clocks** (economy gmin vs real-time waves).

## v6 — THE EXPEDITOR (BREAKTHROUGH — this is the game)
Reframe: you're the owner on the pass, not the line cook. Stations self-produce into buffers; station taps boost, never gate; **the core verb moved into the scene: tap a customer to serve them.** Green ring = servable; triage under patience pressure; tips reward fast reads; tradie crew as the whale; wave-based human pacing. Verdict: "our best version yet."

## v7 — Downtime economy (CURRENT BEST — "closest we've been, but still not good enough")
Added the attention-spectrum verbs: Specials R&D (tap-to-fill, 20% banger surge / 80% flop-with-a-joke), Prep (banks +60% cook speed for the next rush), tappable passersby (flyers), coin drops, paid Boost Socials (skill-gated: profits only if the wave is served). Starting cash $260 makes ad-vs-hire the first economic decision.

## Open problems v7 did NOT solve — your job
- **"Still not good enough."** Something is missing at the feel level. Candidates from the design discussions, unbuilt and untested: sound (now v1 scope — likely the biggest single lever), Friday-night-as-boss-fight with best-night records and a service report card, forecast/anticipation mechanics, combo/streak flow rewards, juicier serve feedback. Iterate WITH Ben — one addition per playtest, feel gate every time.
- **Verb count risk:** if any downtime verb goes unused in playtests, cut it without sentiment.
- **Active↔idle yield ratio** (~2–3× target) has no sim yet.
- **The automation arc** (shift supervisor → venue manager bridge, GDD §4) exists on paper only.

## Process rules that produced the breakthrough (keep them)
- One direction change per version; playtest between every version.
- When Ben says "back to the drawing board," diagnose structurally before proposing — the fix for v5 was a reframe, not tuning.
- Ben's design instincts have beaten the first proposal every round: manual-labor-until-hired (v3), caps + bigger venues (v2), micro-interactions (v5 — right instinct even though that execution died), always-something-to-click (v7). Present options, let him steer.
