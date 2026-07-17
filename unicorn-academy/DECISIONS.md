# Decisions log

_One line per judgment call: decision + why. Maintained by the build session._

- Harness environment: `verify.js` runs as `NODE_PATH=/opt/node22/lib/node_modules node verify.js`
  (Playwright is preinstalled globally in this sandbox, not locally) — environment fact, not a
  harness change; verify.js itself untouched.
- build-game.js extended beyond the CLAUDE.md snippet: it also inlines `src/*.js` and
  `src/style.css` via `<!-- INCLUDE:name -->` markers in the template — same assemble-don't-copy
  principle as the sprite pack; the deliverable is still one self-contained game.html and the
  sprite marker behaviour is exactly as specified.
- Global namespace `UA` with plain concatenated scripts (no ES modules) — file:// + single-file
  target makes module loaders pointless; concatenation order is the dependency graph.
- Sources split into src/{style.css,data.js,art.js,audio.js,save.js,engine.js,widgets.js,stages.js,screens.js,main.js};
  build-game.js inlines them. audio.js authored by a Sonnet subagent against a strict contract.
- PK (peek-a-boo clouds) and CC (royal challenges) run the same engine loop but award NO stars:
  the 69-star egg cap is exactly R1-R8+M1-M9+P1-P6 x3 per SPEC; they pay gems and delight instead.
- R1/R2 letter case ramp: levels 1-4 uppercase, 5-6 lowercase, 7-8 both (Aa) — she confuses cases,
  so both must appear before mastery; SPEC leaves case unspecified.
- M2 tap-each runs two phases: tap-every-object (unfailable, spoken counting) then pick-the-number;
  misses only count in phase 2 — glance-and-guess stays impossible, no fail state in the tapping.
- Infinite CSS animations moved OFF tappable elements onto inner children (start button, seq-glow):
  Playwright's stability check (and squirmy real buttons) can't tap a box that never stops moving.
- Kid-name screen: the bare-tick confirm sits at the exact screen centre — reachable by a centre tap,
  matching the "bare tick -> Superstar" path and the harness's tolerant walk.
- Worked-example demo overlays the already-rendered question (options visible but quiet beneath) so
  the screen is never empty during the demo; narration begins after the demo closes.
- Dev bot answers via the engine API (E.answer with q.correct) rather than simulating widget touches —
  it exercises engine rules at full speed, which is what the dev panel is for.
