# How to launch the build

## Option A — Claude project session (recommended)

1. Open this folder in a Cowork task or Claude Code session.
2. Send exactly this message:

   > Read CLAUDE.md and SPEC.md in full, then build the complete game per the working
   > agreements. Work zone by zone, run `node verify.js` after every milestone and look at the
   > screenshots it saves, and do not stop or ask me anything until verify.js passes clean and
   > the SPEC verification checklist is green. Log all judgment calls in DECISIONS.md.

3. Walk away. Come back to `game.html`, a `shots/` folder of screenshots, `PROGRESS.md`, and
   `DECISIONS.md`.
4. AirDrop or share `game.html` to the iPad, open it in Safari, then Add to Home Screen.
   Optional: turn on Guided Access (Settings → Accessibility) to lock her into the game.

## Option B — chat one-shot (fallback)

Use `unicorn-academy-one-shot-prompt.md` (the chat-paste version): paste it into a Claude chat,
then replace the `<!-- SPRITE_PACK_HERE -->` marker in the returned HTML with the contents of
`assets/sprite-pack.svg.html`. Then still run `node verify.js path/to/game.html` on the
assembled file and check the screenshots — Option B skips the build-time verification loop, so
this final check is the only one it gets. Riskier than Option A (single-response limits), but
works without a project session.

## Source of truth

`SPEC.md` is canonical. `unicorn-academy-one-shot-prompt.md` is the same spec in chat-paste form —
if you ever edit one, mirror the change into the other (Option B runs with the weakest
verification, so silent drift hurts it most).

## What's in this folder

- `CLAUDE.md` — working agreements the build session follows
- `SPEC.md` — the full game specification (the product of ~8 critique passes)
- `assets/sprite-pack.svg.html` — 68 palette-harmonised learning-content sprites (OpenMoji-derived, CC BY-SA 4.0)
- `verify.js` — Playwright harness: drives the game, screenshots it, fails on console errors,
  missing sprites, external requests, broken flows (`npm i playwright` first if needed)
- `PROGRESS.md` / `DECISIONS.md` — created and maintained by the build session
