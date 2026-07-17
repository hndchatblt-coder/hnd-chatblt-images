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
- Ceremony cards get z-index above their sibling veil — a statically positioned card under a
  z-indexed veil made every ceremony button untappable (found by driving the rest screen).
- First-pointer guard adopts a new finger after 2.5s — a pointerdown that never delivers its
  pointerup (interrupted gesture) must not brick all input forever.
- Jigsaw scenes are unwrapped from their outer <svg> before viewBox-cropping into tiles — a nested
  svg ignores the crop and rendered blank boards.
- Boutique/mirror thumbnails render a mini unicorn WEARING each item — cosmetics live in rig-local
  coordinates so no generic crop can frame them, and "what it looks like on" reads better at four.
- q.afterCorrect wired in the engine (replaces praise line when present) so built words blend aloud
  and completed sentences read back, per R5/R8.
- Adult gate digits are displayed as WORDS (three, seven, five) — she can recognise numerals (M3),
  so numeral prompts would not actually gate a pre-reader.
- Resume interpretation: her place is preserved (stage/level per zone + greeted by name on the map)
  rather than auto-teleporting into the last activity — the map IS the resume surface at four.
- Sticker album lives as the second tab of the Memory Book (both are "look what we did" surfaces);
  pages hold 12 stickers, page completion celebrates and keeps a keepsake.
- Polish round 2: full-bleed procedural zone scenes behind every activity with a translucent
  readability panel; the wipe now carries the tapped zone's landmark (comprehension aid, per SPEC).
- Kokoro-82M baked-narration pipeline: tools/make-voice-lines.js extracts 220 fixed atoms (letter
  sounds/names, numbers, words, fixed lines); tools/generate-voice.py renders them with the
  bf_isabella British voice ON THE PARENT'S MAC (this sandbox cannot reach the model weights);
  build-game.js embeds any clips found in assets/voice/; audio.js plays exact-match clips and
  falls back to device TTS for everything else (story frames, lines with her name).
- Egg arrival moved to the next map visit — a star ceremony and an egg no longer stack.
- Sparkle review is a deterministic every-5th-question counter, not a 20% dice roll.
- Rotation mid-question re-renders the live question (engine state kept, layout recomputed).
- Grown-ups' corner gained a copy/paste backup-and-restore code — iOS may purge localStorage.
- Pages workflow now also publishes unicorn-academy/game.html as /academy.html for URL testing.
- iPhone round: audio unlock moved to click/touchend — iOS grants user activation on touch RELEASE,
  never pointerdown, which is why the phone had no sound at all; a safety net re-tries unlock on
  every touch release until the context runs.
- Full fluid-layout pass: all fixed px sizes became clamp()/vmin scales (cards, HUD, keyboard,
  prompts, ceremonies, drag slots/pieces, jigsaw board); activity area scrolls as a last resort
  rather than ever clipping an answer.
- Phone map: facilities collapse into a 2x3 bottom dock (scattered spots fell under touch size);
  the unicorn stands above it; the rainbow meter hides in places (it is a question-time thing).
- New tools/phone-audit.cjs harness: three iPhone viewports, screenshots + programmatic checks
  for clipped answers, viewport overflow, sub-60px map targets and chrome collisions.
