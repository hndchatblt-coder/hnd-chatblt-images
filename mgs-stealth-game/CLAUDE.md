# CLAUDE.md — Loop Brain (auto-loaded every session)

**Fresh session? Read PROGRESS.md, BACKLOG.md, FEEDBACK.md, run `git log --oneline -5`
and `node test.js`, then execute exactly one cycle (Option B) or chain cycles
(interactive).**

This is a Metal Gear Solid-inspired stealth game, one distributable `game.html`,
improved forever in cycles. No finished state. Disk beats memory, always.

## The Cycle (execute exactly one)

1. **READ** PROGRESS.md, BACKLOG.md, FEEDBACK.md. FEEDBACK items → backlog at top
   priority (human playtest outranks yours; never delete their notes — move processed
   items under `## Processed (cycle N)`).
2. **SELECT** top item, rotating feature → bugfix → polish → content. Split L items
   into S/M before selection. Item must cite a DESIGN.md pillar.
3. **DESIGN** brief ≤300 words: what, module(s), acceptance criteria, tests required.
4. **BUILD** via subagents. Task packet = goal + the one module file + dependency
   contracts only + acceptance tests + "Do not modify any other module. Do not modify
   existing tests." Sonnet: features/FSM/vision/refactors. Haiku: boilerplate,
   procedural assets, test scaffolds, docs, level data. Review diffs (`git diff`),
   never whole files.
5. **VERIFY** — real commands, real exit codes:
   - `node build.js && node test.js` — all green, ≥1 new test added this cycle.
   - `node sim.js` — headless playtest bot asserts guard-behavior outcomes.
   - Smoke test (in test.js): boot headless, spawn, 60 ticks movement, zero errors.
   - Perf: full sim tick, 10 active guards, <4ms in node.
   - Every 5 cycles or after render changes: Playwright screenshots of 3 fixed
     scenes → open each PNG with Read and actually look.
6. **PLAYTEST** — roleplay one full infiltration. Exactly 3 problems + 3 delights →
   TESTLOG.md; problems become backlog candidates.
7. **UPDATE** — PROGRESS.md changelog + version, reprioritize BACKLOG.md. Every 10
   cycles: snapshot `releases/v0.N.html`, regenerate PLAYME.md.
8. **COMMIT** `cycle N: <item>` only if green; else `git checkout` to last good
   commit and log why in TESTLOG.md. Never leave HEAD broken.
9. Report ONE line: `[CYCLE n] [item] [result] [tests: x/x] [next]` — then exit
   (loop.sh) or next cycle (interactive).

**Backlog refill:** below 8 items → generate 10, each citing a pillar (wells: sewer/
heliport/freezer zones, patrol-mech boss, sniper duel, European Extreme, VR Missions,
NG+, heavies/dogs, rain, photo mode, codec easter eggs, speedrun timer, colorblind
radar palettes).

**Audit cycle:** every 20th cycle — no building. Fresh Sonnet subagent: "Find what is
rotten: dead code, contract violations, tests that assert nothing, module leakage,
pillar drift. Report findings only." Findings → backlog. Commit `cycle N: audit`.

## Ratchet rules — non-negotiable

1. No cycle ends red. Green tests + playable artifact + updated ledger + commit, or
   full revert.
2. Tests are append-only. Never delete/skip/weaken a test to pass it. Fixed bugs →
   permanent named test in `tests/regressions/`. A wrong test is replaced by a
   stricter one + ledger entry.
3. `game.html` is a build artifact: never hand-edit, never read. Rebuild it.
4. FEEDBACK.md is law.

## Forbidden

- Editing or reading game.html. Editing tests to make them pass. Committing red.
- `THREE` outside render modules (logic modules are pure JS — that's what makes
  node test.js/sim.js real).
- ES import/export in src/ (breaks concatenation — use the UMD-lite Game-namespace
  pattern; see any existing src file).
- Scope creep mid-cycle (write it to BACKLOG.md, stay on the item).
- "Tests should pass" without running them. Verification is commands, not vibes.

## Architecture (fixed)

- `src/*.js` modules → `node build.js` → `game.html` (self-contained, Three.js r128
  CDN, zero external assets, opens from cold file://).
- Modules: boot, rng, world, player, guardAI, vision, soundEvents, items, director,
  saveState, radar, hud, codec, music, render. Each starts with an interface-contract
  comment block declaring its public API.
- Fixed-timestep 60Hz sim, render decoupled, engine owns truth. Seeded RNG single
  source (rng.js) — replays = seed + input log.
- Music wrapped: any WebAudio failure logs and no-ops; audio exempt from headless
  tests, can never crash the game.
- Boot self-test: test suite runs in-browser pre-title; failures render overlay and
  block start.

## When confused

Stop. `git status`, `git log --oneline -5`, re-read PROGRESS.md, run `node test.js`.
Reorient from ground truth, then resume. Never fix forward from confusion.
