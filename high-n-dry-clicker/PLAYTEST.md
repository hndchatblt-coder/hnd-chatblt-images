# PLAYTEST.md — FEEL GATE 1

**Build:** M1. **Gate question: is the tap right?** Nothing else matters yet.

Open on your phone in Safari. It runs on load — no start screen, nothing to press first.

## What's in

- The patty on the grill under the heat lamp. Tap it.
- Every tap: patty squash, flame flare, grease spit, layered pitch-varied click, haptic, and a
  **docket that prints and flicks up onto the ticket rail** — that's the signature element, and
  it's the rising number's replacement (it's specific to the business, and the rail accumulates a
  visible record of the shift).
- The till readout eases toward the real number, never snaps.
- The heat lamp brightens as production rises, so the screen physically gets hotter as you grow.
- One generator (Second pair of tongs), the ticker, autosave every 10s, offline earnings.

## What's deliberately not in yet

The other eleven generators, all upgrades, golden patties, prestige, achievements UI, settings and
stats. They're M2–M5 and they're built in the engine already — M1 is only the tap.

## Three questions

1. **Is one tap worth $1 and one docket, or should a tap feel chunkier from the very first one?**
   Right now the opening is honest to Cookie Clicker (15 taps buys the first tongs). It's the
   cheapest thing to change and it sets the tone for everything after it.
2. **Does the docket-to-rail read as "a sale went through", or does it just read as clutter once
   the rail is full?** It replaces the floating `+$1`. If it isn't landing, the fallback is a
   rising number and the rail becomes decoration.
3. **Does the scene want to be looked at?** The brief's bar is "good enough to screenshot". Tell me
   if the patty is the hero or if the lamp/steel/rail around it is competing with it.

## Gates at this build

```
G1 typecheck   clean
G2 unit tests  35/35
G3 economy     6/6 GREEN
bundle         62 kB gzipped (budget 1.5 MB)
touch verified iPhone-shaped emulation: taps register, purchase works, save survives reload
```

Two things in PROGRESS.md need your eye when you have a minute — an interpretation call on the
active-vs-idle assertion, and a structural fix to a 294x upgrade cliff. Neither blocks this gate.
