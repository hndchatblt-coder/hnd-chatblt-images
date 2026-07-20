# High N' Dry: Global Domination

An idle empire game where flame-grilled burgers fund world domination. Start running the pass
in one Sydney suburb (Leichhardt — where High N' Dry actually started); end with your flag over
five continents. Cynical, lived-in hospo comedy escalating deliberately into absurdist military
satire.

This folder is a standalone project. It shares no code, assets, or history with anything else
in this repo.

## Start here

1. `GAME_DESIGN.md` — the full spec. Read before touching gameplay code.
2. `PROTOTYPE_NOTES.md` — seven prototypes' worth of dead ends. Read before writing any active-layer code, so you don't rebuild one of them.
3. `CLAUDE.md` — the build rules and milestone plan (M1–M7) for whoever builds this next.
4. `PROGRESS.md` / `DECISIONS.md` — current status and the judgment calls made along the way.

## Structure

```
GAME_DESIGN.md         Full game design doc
CLAUDE.md               Build rules, repo structure, milestones, feel-gate process
PROTOTYPE_NOTES.md      What was tried across 7 playtested prototypes and why each died
PROGRESS.md             Milestone checklist
DECISIONS.md            Judgment-call log
economy.config.json     Single source of truth for every balance number, idle + active
engine/                 Headless TS engine (idle sim + active-layer rules). Zero DOM imports.
content/                Data-driven content: tiles, managers, rivals, specials
sim/                    Pacing/balance checks against economy.config.json
reference/              prototype-v7.jsx — the feel spec for the active layer (read-only)
ui/                     React + canvas UI (not started — lands in M2)
```

## Status

**M1 (engine skeleton) done and tested.** Two-clock model, config/content loaders (zod-validated),
seeded RNG, save/load round-trip, and a deterministic input-log replay harness — see
`engine/tests`. Run it:

```
cd engine
npm install
npm test
```

**M2 (the Expeditor — playable active layer + UI + sound) has not started.** It ends in a feel
gate: Ben needs to actually play a build on his phone before M3 starts. See `PROGRESS.md` for
the full milestone breakdown.
