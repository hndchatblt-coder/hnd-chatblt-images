# DECISIONS.md

One line each: decision + why. Per CLAUDE.md — log judgment calls, don't stop to ask.

- **Kept the game's underlying design (economy, content, active-layer feel) unchanged from the
  imported "Burger Warlord v0.3" bundle; only renamed player-facing brand text.** The tile data
  already matches Ben's real venues (Leichhardt tile #1, Rosebery, Neutral Bay), so the design
  clearly *is* High N' Dry's game — "Burger Warlord" was a working codename, not a different
  game to merge or reconcile.
- **Renamed brand strings only** (`GAME_DESIGN.md`/`CLAUDE.md` titles, the on-screen wordmark and
  component name in `reference/prototype-v7.jsx`). Left "Deano"/"Sammy"/"Tash", rival names
  (Grillzilla, PATTY CVLT), and all balance numbers untouched — those are content/flavour, not
  branding, and changing them wasn't asked for.
- **Fixed the hardcoded absolute path in `sim/sanity_sim.py`** (`/home/claude/burger-empire/...`)
  to resolve relative to the script's own location, so it runs from this repo without editing.
  Pure portability fix, no behavioural change.
- **Restructured into the `/engine /content /sim /ui /reference` layout CLAUDE.md specifies**,
  rather than leaving the flat zip layout. The build-rules doc already prescribes this structure;
  matching it now avoids a reshuffle later.
- **Built M1 (engine skeleton) but stopped before M2.** M1's contents (two-clock model, config
  loader, seeded RNG, save/load, replay harness) are sim/unit-testable and carry no feel gate.
  M2 ports the Expeditor onto real UI and explicitly ends in "Ben plays it on his phone" per
  CLAUDE.md's milestone list — that can't be satisfied autonomously, so M2 is left for a session
  where Ben can actually playtest a build.
- **Did not touch the "still not good enough" balance/feel problem** flagged throughout
  GAME_DESIGN.md and PROTOTYPE_NOTES.md (nor the stale pacing-target mismatch in
  `sim/sanity_sim.py`, see PROGRESS.md). Both are explicitly Ben's calls per the design docs'
  own feel-gate process, not something to guess at without a playtest.
- **M2 built as a standalone bright Canvas2D playtest build (`ui/play.html`), not yet wired to
  the engine.** Feel iteration needs fast turnaround on a hosted URL; wiring every change through
  the TS engine would slow the loop. The engine (M1) remains the path for the real app; the
  prototype's numbers are mirrored back into `economy.config.json` so the source of truth stays
  honest.
- **Art direction: bright warm burger-joint + hand-drawn Canvas2D characters/food**, replacing
  the dark night-kitchen and all emoji game art — per Ben's feel-gate ("a bit doom and gloom",
  "draw characters instead of emojis").
- **Balance (Ben's feel-gate call): Deano/burger hire $900 → $600; Boost Socials $200/×1.3 →
  $150/×1.25.** Mirrored into economy.config.json. These are active-layer feel knobs (config
  marks them provisional/playtest-gated), so they don't touch the sim-asserted idle pacing.
