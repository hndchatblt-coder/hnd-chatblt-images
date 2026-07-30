# CLAUDE.md — High N' Dry: Clicker

`BUILD_BRIEF.md` is the source of truth. Read it in full before writing any code.
`GAME.md` is the restatement of it (drift between the two is a bug — fix the drift, don't
quietly diverge). `economy.config.json` holds every number. `DESIGN_TOKENS.md` holds the art
direction. `PROGRESS.md` is the append-only iteration log.

## The shape of this project

One screen. One number. One thumb. Cookie Clicker's exact skeleton, High N' Dry's skin and
voice. **A second gameplay screen means you've gone wrong** (brief §0). Scope discipline is the
point: one prototype finished to a high bar, not a bigger game half-finished.

**This is not Burger Warlord / Global Domination.** That project (`../high-n-dry-global-domination/`)
is parked. Don't import from it, don't reuse its balance, don't resurrect its layers.

## Hard rules (from the brief, repeated because they're the ones that get broken)

1. **Config is law.** Every number lives in `economy.config.json`. No numeric literals in engine
   code except `0`, `1`, and array indices. Need a value that isn't there? Add it to config and
   flag it in the iteration note.
2. **Headless engine first.** All economy logic in pure TS with zero DOM imports — tick,
   purchase, multiplier resolution, prestige, offline settlement. The UI reads state and
   dispatches intents. Nothing else.
3. **Deterministic.** Seeded RNG throughout. Same seed + same input tape = same result, or the
   playbot is worthless.
4. **The game never punishes.** No loss of progress, ever. Failure costs wasted seconds or
   wasted cash, never regression. (The Health Inspector halves production for 60s — it never
   destroys anything.)
5. **One change per iteration.** Never batch fixes. Highest-severity finding only.
6. **Never weaken an assertion or delete a test to get a gate green.** If an assertion is wrong,
   stop and tell Ben. Do not fix it yourself. This is a hard stop-and-ask trigger.
7. **No dark patterns.** No forced ads, no timers designed to pull him back, no fake urgency.
8. Canvas for the patty scene and particles; DOM for everything else. Never the whole UI in canvas.

## Milestones and gates

M0 engine+sim (G3) → **M1 FEEL GATE 1** → M2 ladder (G3+G4) → **M3 FEEL GATE 2** → M4 systems
(G4+G6) → M5 prestige/offline (G3+G6) → **M6 FEEL GATE 3** → M7 run the loop to exit.

**Stop at every FEEL GATE.** Do not proceed past one without Ben's sign-off. The loop can certify
"not broken, not slow, not ugly by rubric, not boring by the numbers" — it cannot tell whether
the game is fun. That's Ben's call.

## Commands

```
npm run typecheck     # G1
npm test              # G2
npm run sim:assert    # G3 — economy assertions
npm run playbot       # → reports/pacing.json (G4 inputs)
npm run gates         # G1 + G2 + G3
npm run dev           # M1+ UI
npm run build         # single-file bundle for phone playtests
```

## Delivery to Ben (learned the hard way on the last project)

Ben plays on an iPhone. Two things that do **not** work: the in-chat file preview (it renders
markup but does not execute JavaScript, so the game looks frozen and half-drawn), and asking him
to download an `.html` and open it from Files.

What works: **commit the built file and give him a `raw.githack.com` URL** to open in Safari.
Always verify with Playwright *touch* emulation (`hasTouch: true`, `isMobile: true`) before
sending — a desktop `click()` passing is not evidence a tap works. Never gate the game behind a
single start button; if that one tap doesn't register, nothing runs.

## Voice

Dry Australian hospo humour, deadpan, specific, one notch past reality. Never zany. The joke is
always about something real. No explaining the joke, no puns flagged as puns, no emoji in game
copy, no exclamation marks except in brand-voice achievement names.
