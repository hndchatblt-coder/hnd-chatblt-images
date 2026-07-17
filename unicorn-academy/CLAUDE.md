# Unicorn Academy — working agreements

You are building a premium single-file HTML educational game for a four-year-old. The complete
specification is in `SPEC.md`. Read it fully before writing any code. These agreements govern
*how* you work; SPEC.md governs *what* you build.

## The prime directive

The deliverable is `game.html` — one self-contained file, everything the spec describes, fully
working, verified by you. "Done" means `node verify.js` passes, the SPEC `<verification>` checklist
is green, and you have personally looked at screenshots of every zone.

## How to work

1. **Read SPEC.md end to end first.** Then write `PROGRESS.md` with your build plan (ordered
   milestones, one line each) before any code.
2. **Build order is fixed:**
   a. Data schemas + the generic activity engine + save system (the skeleton everything hangs on)
   b. Narration/speech helper + audio mix bus (test on every screen from day one)
   c. Map hub + the unicorn rig + first-run flow
   d. Zones, in the canonical build priority order defined in SPEC `<scope>` (Letter Meadow →
      Number Mountain → Memory Clouds → Word Garden → Puzzle Falls → Crystal Castle) —
      **verify after each zone before starting the next**
   e. Reward systems, ceremonies, boutique, eggs + naming + growth
   f. Fun layer: toy corners (stable, kitchen, music meadow, dress-up mirror), hide-and-seek
   g. Polish tiers (procedural scenery upgrades, day/night, surprise events, Memory Book,
      silly event days)
3. **Verify relentlessly.** After every milestone: run `node verify.js`, read its output, open the
   screenshots it saves in `shots/` and actually look at them. Fix what you see before moving on.
   Broken-but-moving-forward is how this project fails. **verify.js is a floor, not "done"** —
   the SPEC `<verification>` items it can't automate (engine rules, ceremonies, boutique, adult
   gate) you prove manually via `?dev=1` before declaring anything finished. Check Playwright
   first with `node -e "require('playwright')"` — it's usually preinstalled; only `npm i
   playwright` if that fails. Note: headless test browsers usually have **zero TTS voices**, so
   verify.js exercises the no-voice path — reason about the speech code path separately and check
   the startup `console.info` voice log on a real device.
4. **Assemble, don't hand-copy, the sprite pack.** Author your working file as
   `game.template.html` containing the literal marker `<!-- SPRITE_PACK_HERE -->` as the first
   child of `<body>`, referencing sprites via `<use href="#p-…">`. Produce the deliverable with
   the build step (re-run it after every template change; keep `build-game.js` and the template
   in the folder — they're scaffolding, not shipped):

   ```js
   // build-game.js
   const fs = require('fs');
   const pack = fs.readFileSync('assets/sprite-pack.svg.html', 'utf8');
   fs.writeFileSync('game.html',
     fs.readFileSync('game.template.html', 'utf8').replace('<!-- SPRITE_PACK_HERE -->', pack));
   ```

   Never retype sprite data by hand. verify.js checks the marker is gone from `game.html` and
   that symbols resolve.
5. **Log decisions, don't ask questions.** No one is watching this session. When the spec leaves
   room for judgment, make the call a thoughtful senior game developer would make, record it in
   `DECISIONS.md` (one line: decision + why), and keep building. Never stop to ask.
6. **No stubs, ever.** A `// TODO` or a function that pretends is worse than a feature honestly
   removed via the SPEC cut list. If you trim, record it in DECISIONS.md and remove every
   reference to the trimmed feature.
7. **Keep PROGRESS.md current** (tick milestones as they verify). If the session is interrupted,
   the next session resumes from PROGRESS.md + DECISIONS.md without re-deciding anything.
8. **Test contract:** every interactive element the harness needs carries a `data-testid`
   (SPEC `<test_contract>`). Add them as you build, not at the end.

## Quality bar

Khan Academy Kids / Toca Boca — not a web demo. When choosing between shipping another feature
and making an existing one feel wonderful, choose wonderful. The blessed cheap approximations in
SPEC §architecture are encouraged; invisible over-engineering is not.

**North star for every judgment call:** protect what she'll actually notice. A four-year-old
will remember whether the unicorn feels like a living friend and whether every zone she opens
works start to finish — she will never notice a missed pre-snap glow or an undetected
three-session plateau. If a content floor (an MVP zone, a stage minimum) and a systemic polish
rule are both at risk, save the content floor and simplify the polish rule; log the
simplification in DECISIONS.md like any other cut.

## Hard boundaries

- One file. No network requests, no CDNs, no external assets, no build dependencies in the
  final `game.html`.
- Never use platform emoji as rendered game art (SPEC `<art_system>`).
- Nothing in the game may require reading. Nothing may frighten, shame, or trap a four-year-old.
- Do not weaken `verify.js` to make it pass. Fix the game instead.

## Harness self-test

If verify.js ever seems wrong, prove the harness itself first: `node verify.js stub-game.html`
must pass with 0 failures (1 size warning is expected for the stub). If that fails, the harness
broke — fix verify.js, not the game.
