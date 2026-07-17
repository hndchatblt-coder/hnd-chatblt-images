# 🦄 UNICORN ACADEMY — AAA Edition One-Shot Build Prompt

> **How to use (two steps):**
> 1. Copy everything below the line and paste it as a single message. The build comes back as one HTML file containing the marker `<!-- SPRITE_PACK_HERE -->`.
> 2. Replace that marker with the entire contents of the companion sprite pack file (`assets/sprite-pack.svg.html` in the project folder; also distributed standalone as `unicorn-sprite-pack.html` — same content) in a single find-and-replace. Done — the game is complete and self-contained. This keeps the builder's whole output budget for game code instead of re-typing 80KB of sprite data.

---

Build me a complete, polished, **premium-quality** educational game called **Unicorn Academy** as a **single self-contained HTML file**. The quality bar is the best kids' titles on the App Store — Khan Academy Kids, Toca Boca, Sago Mini — not a web demo. This is a one-shot build: no placeholders, no TODOs, no "you could add...", no stub functions. Every feature you ship must be fully implemented and working when you finish.

**Builder directives:** never ask a clarifying question — where the spec leaves judgment room, make the call a senior kids' game developer would make and record it in a short comment block at the top of the file. Never leave a comment standing in for code ("// remaining activities follow this pattern" is a failure) — a stub is worse than an honest cut. Start your code with the data schemas and the generic activity engine skeleton (§2a) so the architecture is locked before any screen exists.

**Scope discipline (read this first):** this spec is large, and the full game is the goal. But a smaller game where every feature works perfectly beats a bigger one with anything broken. Built naively the full spec is on the order of 10,000+ lines and will lose coherence before it's done; built on the shared engine mandated in §2a, it's far smaller. There is a defined **MVP core** that must exist no matter what, and an **ordered cut list** for everything else.

**Commit to scope before you write a line of code.** You cannot sense your remaining output budget mid-stream, so do not plan to "cut as you go" — that produces truncated, broken files. Instead, first state (in one line) how far down the cut list you are building, based on your own honest estimate of what you can generate *coherently* in this response, then build exactly that. Cutting means: the feature doesn't exist, no map/dialogue/checklist reference to it survives, and the file stays valid.

- **MVP core (never cut):** the map hub, the unicorn companion with personality (§5), first-run flow, full narration system, background music engine, adaptive difficulty engine, reward core (praise + gems + rainbow meter + Sparkle Boutique with ≥8 items), autosave — and three zones: **Letter Meadow (R1–R3), Number Mountain (M1–M4 minimum, more if budget allows), Memory Clouds (P1 shapes, P4 memory match, peek-a-boo clouds)** — 8 activity types minimum.
- **Cut list — cut from the bottom up, each item self-contained:** silly event days → unicorn kitchen → music meadow → hide-and-seek babies → unicorn stable (if cut, babies still roam the map, named, ungrowing) → memory book keepsakes → rare surprise events → day/night cycle → daily gift → unicorn eggs → sticker album → Crystal Castle → mazes (P5) → jigsaws (P2) → Puzzle Falls zone (which contains only P2, P3, P5, P6 — cutting it cuts those and nothing else) → Word Garden zone (reading then ends at R3). The dress-up mirror, story-framed narration, conductable celebrations, and baby naming (whenever eggs ship) are engine-cheap and never cut independently.

## 1. The player

She is **four years old**. She recognises most letters and their sounds, and can count past 10. She cannot yet read words, so **she can never be required to read text to know what to do**. She will play **independently on an iPad in Safari**, landscape or portrait. She is clever, easily delighted, and easily discouraged — the game must be impossible to get "stuck" in and must never make her feel like she failed.

She is Australian: use **Australian English spelling** (colour, mum) and prefer an **en-AU voice**, falling back to en-GB then en-US.

## 2. Non-negotiable technical constraints

- **One HTML file.** All CSS, JavaScript, and art inline. No external files, no CDN, no network requests, no image or audio files — all art from inline SVG and CSS (see §2b — platform emoji are banned as game art); all sound synthesised. It must work offline forever.
- **Touch-first.** Pointer events. Minimum touch target 80×80px. `touch-action: manipulation` and `user-select: none` on everything; **`touch-action: none` + `setPointerCapture` on all draggables** so iOS scroll panning can't cancel a drag mid-move. Lock the page down completely: `overscroll-behavior: none`, `position: fixed` + `overflow: hidden` on body, `preventDefault` on document-level `touchmove` — no pull-to-refresh, no rubber-banding, ever. Viewport meta with `viewport-fit=cover`; pad the UI with `env(safe-area-inset-*)` and keep all interactive elements **≥24px from screen edges** (the home indicator and Safari's edge-swipe zones eat edge taps). Use `100dvh`/`innerHeight`, never `100vh`. No hover-dependent interactions. Drag-and-drop with generous fat-finger tolerance (snap if released within ~60px).
- **Full speech narration** via the Web Speech API. Every instruction, letter sound, word, number, and celebration is spoken. Rules:
  - `speechSynthesis.cancel()` before every new utterance so speech never queues or lags — but on iOS, `speak()` immediately after `cancel()` gets swallowed, so wait ~100ms between them (build one speak-helper used everywhere).
  - Voice selection: do **not** just wait for `voiceschanged` — on iOS it often never fires. Poll `getVoices()` for up to ~2s, then fall back to any English voice (prefer en-AU → en-GB → en-US; female if identifiable). Rate ~0.9; pitch ~1.1 for the unicorn's lines.
  - iOS cuts off long utterances: **chunk all narration into utterances under ~10 seconds**.
  - iOS leaves speech stuck-paused after screen lock or app switch: on `visibilitychange`/`pageshow`, call `speechSynthesis.resume()`, cancel any zombie utterance, and re-speak the current instruction.
  - iOS unlocks audio only after a user gesture: the first screen is a single giant "tap to start" rainbow button whose handler fires a first (possibly silent) utterance and a WebAudio `resume()`, unlocking both.
  - A large 🔊 "hear it again" button on every activity screen.
  - **Phoneme rule — critical for teaching reading correctly:** never pass IPA or slash notation to TTS (it reads "/m/" as "slash m slash") and never let it say letter *names* when you mean letter *sounds* ("cat" must never become "see-ay-tee"). Include a hand-tuned per-letter table of TTS-pronounceable sound approximations (m → "mmm", s → "sss", a → "a as in apple", c → "k"), and where TTS can't render a sound reliably, use word-anchored phrasing: "the sound at the start of **moon**". For blending, speak stretched sounds from the table, then the whole word: "mmm… aaa… t — mat!"
  - Speech may be genuinely unavailable. Detect this and **hide the intrinsically audio-dependent activities** (sound-matching, blending, spoken word finds), substituting their visual siblings. Everything that remains must be fully playable silently.
- **Background music engine** (WebAudio, fully procedural — no files): a gentle looping ambient bed built from oscillators playing a **pentatonic scale** (so nothing ever clashes), with a distinct key and timbre per zone (Letter Meadow warm and floaty; Number Mountain brighter and bouncier; Memory Clouds dreamy and slow; etc.). Run all audio through a **mix bus with priorities**: music automatically **ducks under narration** (drop ~60–70% while the voice speaks, swell back after), celebration stingers **layer over** the music bed rather than replacing it, and SFX sit on top. Three separate toggles (voice / effects / music) in the grown-ups' corner, but the ducking behaviour is one system, not three unrelated volumes.
- **Sound effects** synthesised with WebAudio: gentle chime for correct, soft neutral "boop" (never harsh) for incorrect, sparkly arpeggios for rewards, fanfares for milestones. Optionally add `navigator.vibrate()` for gentle haptic taps where supported — it's a silent no-op on iPad, so never depend on it.
- **Progress persistence** in `localStorage`, try/catch-wrapped with an in-memory fallback (private browsing must not crash). Autosave after every answer, purchase, and unlock — a four-year-old exits apps without warning. Resume means: **same zone, same activity, same difficulty level, greeted by name — always a fresh question.** Never serialise mid-question or mid-drag state.
- **No alerts, prompts, or confirm dialogs. No external links. Nothing leaves the device.**
- Smooth 60fps via CSS transforms/opacity only; snappy on an older iPad.

## 2a. Architecture — build it this way

This is the difference between shipping everything and shipping a truncated mess:

- **One generic activity engine, not 23 bespoke screens.** Build a single question-loop engine (present → answer → feedback → score/streak/gems → next) driving a small set of reusable interaction widgets: tap-the-right-choice, drag-to-slot, tap-each-object, tap-sequence, flip-pairs. **Every stage (R1–R8, M1–M9, P1–P6) is a data-table entry that picks a widget and supplies content** — a new activity type should cost ~30 lines of data, not 300 lines of code.
- **Robustness rules, engine-wide (implement once, in the engine):**
  - The instant an answer is tapped, that question locks — further taps are ignored until feedback resolves and the next question loads (no double-crediting from mashing).
  - During any screen transition, navigation taps are ignored; at most one transition runs at a time.
  - The 🏠 home button stays live during drags, animations, and celebrations; tapping it cleanly cancels whatever is in flight (nothing counted wrong, no partial state) and returns to the map.
  - **Save before ceremony:** gems/stars/keepsakes are written to storage *before* their celebration plays, so the app dying mid-fanfare never loses a reward.
  - Level-down has a floor: never below the stage's placement level, no matter how many misses (sibling-proof).
  - Loading a save wraps `JSON.parse` plus a shape-check in try/catch; a corrupt save silently starts fresh, never a blank screen.
  - All idle/pacing timers (10s pulse, 20s repeat, session yawn, daily gift) compute from wall-clock timestamps re-checked on `visibilitychange`/`pageshow` — a 30-minute screen-lock must not dump a burst of stale prompts, and the same unanswered question is simply still there on return. The daily gift is evaluated once per map load against a stored date string, never by a live timer.
  - Petting and any repeatable delight are debounced (~200ms) and use the one speech helper — 400 taps in a row must not glitch audio or grow memory.
  - Rare surprise events are single-use, despawn on tap or timeout, and share a hard cooldown — they cannot be farmed.
- **Blessed cheap approximations** (spend your budget on content, not on invisible polish): the music engine may be one 2–3 oscillator pentatonic loop with a per-zone transposition and filter change; screen transitions may be one parameterised wipe that varies colour/icon per destination; day/night may be 3 discrete gradient presets keyed off `getHours()`; boutique items may attach to a single fixed anchor layer on the unicorn (no per-pose re-registration); the mood system may be 2 states (calm/excited) swapping idle animation sets, with voice pitch/rate modulation optional. A four-year-old cannot tell these from the expensive versions.

## 2b. Art system — three tiers, zero emoji

**Platform emoji are banned as rendered game art.** They differ across devices, clash with the house style, and can't be animated or recoloured. Wherever this spec writes an emoji (🏠, 🔊, 💎, ✓, zone icons, 🔴🔵 patterns), that is shorthand for a bespoke SVG in the house style — build the icon.

- **Tier 1 — Bespoke rigged SVG** for hero assets: the unicorn, baby unicorns (recoloured/scaled variants of the same rig), the castle and map landmarks, all UI icons, all boutique items. **House style:** flat "sticker" look; 2–5 simple shapes per object; soft plum `#5C4A66` outlines ~3px with rounded joins/caps; one shared pastel palette declared once as CSS variables; dot eyes with a white highlight; optional blush. **The unicorn rig** has separate SVG groups for body, head, snout, ear, horn, 3-layer mane, wing, tail, and each leg; named anchor points (head-top, back, neck, tail-base) where boutique items attach; and animations for blink, idle-breathe, trot, leap, nuzzle, sad-tilt, and celebrate-spin.
- **Tier 2 — The embedded sprite pack** for every learning-content picture (nouns in phonics, counting, memory, sorting). A pre-made, palette-harmonised pack of 68 SVG `<symbol>`s (derived from OpenMoji, CC BY-SA 4.0) is pasted in after you finish. **Do not draw these nouns yourself and do not emit the pack**: put the marker comment `<!-- SPRITE_PACK_HERE -->` as the first child of `<body>` and reference sprites with `<svg><use href="#p-cat"/></svg>`. Every pictured word in your content tables must come from this manifest (or be a Tier-1 bespoke asset):
  `cat dog sun hat bed pig bus hen web bug van cap bat cup pen box bell log fish ship shell chick duck bath chips sock moon star snake tree key egg milk banana lion monkey elephant umbrella orange apple strawberry rabbit flower balloon cupcake frog bee butterfly cow horse sheep mouse owl turtle bird fox bear ball boat car train kite drum gift icecream pizza watermelon carrot`
  Add the line "Artwork includes OpenMoji sprites (openmoji.org), CC BY-SA 4.0" to the grown-ups' corner.
- **Tier 3 — Procedural scenery** for the whole world: parametric generator functions emitting SVG — `flower(x,y,size,petals,colours)`, `cloud(x,y,scale)`, `tree`, `butterfly`, `sparkle`, `hills`, `rainbow(arcs)` — with randomised parameters. Map scenery, particles, and ambient life are always generated, never hand-placed, so the map blooms as stars are earned (regenerate with higher densities, richer palettes) and day/night is just different palette inputs to the same generators.

## 2c. Resilience, dev mode, endgame

- **Global error handler** (`window.onerror` + `unhandledrejection`): recover to the map with the unicorn saying "Oops! Let's fly home!" — never a white screen or frozen state for a four-year-old.
- **Save schema version:** the save object carries `v: 1`. On an unknown version, keep durable progress (gems, stars, unlocks, name) and reset only session position — never crash on an old save.
- **Dev mode**, hidden unless the URL has `?dev=1`: a panel with current state (zone/stage/level/streak/gems/stars), level-jump controls, an auto-answer bot (correct/wrong/random with speed multiplier), a simulate-session-boundary button (bumps the session counter — makes plateau logic testable), skip-celebrations and TTS-mute toggles, and an event log. This is how anyone verifies a 20-hour progression curve in minutes. Invisible in normal play.
- **Test hooks:** stable `data-testid` attributes on key elements (`start-button`, `unicorn-colour-{n}`, `mane-colour-{n}`, `unicorn-name-option`, `name-keyboard`, `name-done`, `story-skip`, `map`, `zone-{id}`, `activity`, `answer-option`, `home-button`, `hear-again`, `rainbow-meter`, `gem-counter`, `boutique`, `keep-playing`, `rest-now`, `dev-panel`, `dev-jump`, `dev-bot-correct`, `dev-bot-wrong`, `dev-skip-celebrations`, `dev-tts-mute`, `dev-session-boundary`, `toy-stable`, `toy-kitchen`, `toy-music`, `toy-dressup`, `egg`) so automated checks can drive the game; at startup, `console.info` the chosen TTS voice or "no voices available" so automated checks can drive the game.
- **Endgame:** after the Crystal Castle coronation the game must not die — unlock **Rainbow Royale**: a daily rotating royal-challenge set remixing mastered skills at top level, earning rare rainbow gems for a final boutique tier; the unicorn calls her Champion; the restored map stays fully alive.

## 3. Story & world

**The quest (this is why she's playing):** the Rainbow Kingdom's colours have faded — the great rainbow over the map is grey and the kingdom is sleepy. Only a clever child can bring the colours back. **Every star she earns restores visible colour**: the rainbow's arcs fill in one by one as zones are mastered, flowers bloom, butterflies multiply, the castle windows light up, hatched baby unicorns roam the hills. The map at 0% and the map late-game must look dramatically different — her progress is legible in the *world*, not just in star icons. The endgame is the fully restored, riotously colourful kingdom and a Crystal Castle coronation.

The map hub: rolling pastel hills with **2–3 layers of parallax depth**, the rainbow overhead, drifting clouds, twinkling ambience. Everything tappable visibly invites tapping (gentle bounce/glow).

**Day/night:** read the device clock; morning/afternoon/evening each get their own sky gradient and lighting tint, with stars and fireflies after dark, plus the occasional gentle weather flourish (a drifting glitter shower, a passing rainbow gleam). CSS/SVG only.

**Rare surprise events** — the signature of premium kids' games. Implement at least 5 low-probability delights that never block or gate anything: a shooting star streaks by (tap it → +3 gems), the unicorn does a glitter sneeze, a bunny peeks out from a bush, a butterfly lands on the unicorn's horn, cloud shapes briefly form a heart. Roughly a few percent chance per idle minute on the map; never during an active question.

**Hide-and-seek:** once babies are hatched, sometimes one is hiding on the map — a mane poking out from behind the castle, a tail in the flowers — with a giggle when found. The map becomes a place she searches, not just a menu she selects from.

**Map zones** (each a distinct mini-land with its own palette, music key, and activities):

| Zone | Content | Activities |
|---|---|---|
| 1. Letter Meadow 🌸 | letters & sounds | R1–R3 |
| 2. Word Garden 🌈 | blending & words | R4–R8 |
| 3. Number Mountain ⛰️ | counting & maths | M1–M9 |
| 4. Puzzle Falls 💧 | logic & spatial | P2, P3, P5, P6 |
| 5. Memory Clouds ☁️ | memory & shapes | P1 (shapes), P4 (memory match), plus a "peek-a-boo clouds" variant (objects hide under clouds; "where was the star?") |
| 6. Crystal Castle 🏰 | endgame | royal challenges mixing every mastered skill |

Locked zones are visible, wrapped in friendly sparkly mist; tapping one makes the unicorn state the real remaining requirement ("Two more stars in Letter Meadow and the Word Garden will bloom!").

## 4. First run

1. Giant "tap to start" rainbow button (audio unlock — §2).
2. **Create your unicorn first** (the first 20 seconds must be low-effort delight, not a 26-key spelling task): body colour (6 pastel swatches), mane colour, and a name — tappable spoken list (Sparkle, Rosie, Star, Moonbeam) or the alphabet keyboard. She bonds with "her" unicorn before anything harder.
3. **Then her name, as a stealth letter game**: a large uppercase alphabet keyboard with huge keys **plus a big spoken backspace key** (mis-taps at four are certain). Each tapped letter is spoken. Cap at 10 letters. A big green ✓ confirms; bare ✓ defaults to "Superstar". Her name is used and spoken everywhere afterwards — a TTS-mangled pronunciation is acceptable, and the name is never required for any later interaction.
4. The unicorn tells the quest story over the grey, faded map (chunked utterances, ~15s total, skippable by tap), then flies her to Letter Meadow to earn her first colour.

Returning sessions skip all of this: "Welcome back, [name]! [Unicorn] missed you!"

## 5. The unicorn companion

Not a mascot — a **friend with a personality and a memory**:

- **Reactions:** leaps and sparkles when she's right; warm encouraging nuzzles when she's not; anticipation animations (crouches before jumping, winds up before celebrating).
- **Moods:** a simple persistent mood variable (sleepy / happy / excited / proud) driven by time of day, recent play, and milestones — mood changes the idle animation set and line delivery (pitch/rate tweaks).
- **Memory:** track and reference real history unprompted — favourite zone ("You always pick Number Mountain!"), days played, return-after-absence ("You're back! I counted the stars while I waited"), last milestone.
- **Petting — pure delight, no rewards:** tapping/stroking the unicorn anywhere outside a question triggers giggles, nuzzles, sparkle shivers, and the occasional rare reaction (a happy spin, a tiny rainbow burp). No gems attached. This must exist — it's the single biggest "alive" signal for this age.
- **Voice, in-fiction:** the iPad's TTS voice is robotic — embrace it rather than fight it. The unicorn "learned to talk from the stars", so she speaks a little like magic. Write her lines to sound charming when delivered flatly: short, rhythmic, exclamatory.
- **Comedy reel:** the unicorn has actual comic timing, played in idle moments and toy corners — chases a butterfly and faceplants into a flowerbed, sneezes glitter at the worst moment, snores dramatically when idle, occasionally tells a terrible four-year-old joke ("What does a cow say? MOO! What does a unicorn say? …SPARKLE!"). **Guardrail: wrong answers never trigger the funniest animations** — she must not be able to farm wrong answers for laughs.

## 6. Learning content — the three ladders

Structure all content as **data tables** (arrays of levels/items), not hard-coded screens, so the difficulty engine (§7) can move through them. Include generous content — weeks of play. Starter content below; expand it in the same spirit.

**Story framing:** narration templates wrap every question in a zone-themed micro-story with a tiny stake — not "which one starts with mmm?" but "the babies are STARVING! Feed the one whose food starts with mmm!"; not "how many planks?" but "the bridge needs 7 planks — count them on!" Same engine, same data; the frame makes a question feel like playing instead of testing. Each zone gets 3–4 rotating story frames per activity type.

### 6a. Reading ladder — follows synthetic phonics order

| Stage | Skill | Activity |
|---|---|---|
| R1 | Letter recognition | "Find the letter B!" — tap the right flower among 3 → 4 → 6. Introduce letters in **SATPIN order** (s a t p i n, then m d g o c k…), not alphabetical |
| R2 | Letter sounds | "Which letter makes the sound mmm… like the start of **moon**?" (phoneme rule, §2) |
| R3 | Beginning sounds | "Which one starts with sss?" — tap the right picture among distractors |
| R4 | CVC blending | Word sounded slowly ("mmm…aaa…t — mat!"), tap the matching picture. **Early items use stretchable continuant sounds (s m f n l r) before stop sounds (t p b d)** which tempt a "buh" schwa |
| R5 | CVC word building | Drag letters into slots for a shown picture; each dropped letter speaks its **sound**; the completed word blends aloud triumphantly |
| R6 | Digraphs | sh, ch, th, ck taught exactly like R4/R5. Word bank (all pictured from the pack): fish, ship, shell, chick, duck, bath, chips, sock |
| R7 | High-frequency words — **two kinds, taught differently** | **Tricky words** (irregular — taught whole-word, spoken then matched): the, I, to, my, go, said, was, you, of. **Decodable words** (taught by blending like any CVC): it, in, at, is, can, and, up, we |
| R8 | First sentences | 3-word rebus sentences ("The 🐱 sat.") read aloud word-by-word as she taps each word |

Since she knows most letters, **placement starts at R2–R3** (R1 stays available for warm-up wins). "Placement" means her starting stage — the engine still requires normal progression from there.

**CVC word bank** (every word pictured by its pack sprite, §2b): cat, dog, sun, hat, bed, pig, bus, hen, web, bug, van, cap, bat, cup, pen, log. Note "fox" ends in a /ks/ blend — it is **not** CVC; keep the fox sprite for counting/sorting games, not early blending ("box" has the same caveat — use it for vocabulary, not CVC blending). **Picture rule:** a word may only appear in a picture-matching question if its sprite would be named correctly by a stranger aged four; when in doubt, leave it out.

### 6b. Maths ladder

| Stage | Skill | Activity |
|---|---|---|
| M1 | Subitising 1–5 | Dot/dice/ten-frame patterns flash for ~1.5s → tap the matching number. Instant recognition, no counting aloud |
| M2 | Counting 1–10, one-to-one | "How many butterflies?" — she must **tap each object once**; it highlights and its number is spoken per tap. Never glance-and-guess |
| M3 | Number recognition 1–20 | "Find the number 7!" |
| M4 | Comparing | Quantity ("Which basket has MORE apples?") plus size and length ("Which ribbon is LONGER?", big/small) |
| M5 | Order & position words | 1st/2nd/3rd ("Who came FIRST in the race?"), in/on/under/next to ("Tap the bunny UNDER the tree"), first/last |
| M6 | Number bonds (part-whole) | Ten-frame or two-part visual: "5 is 3 and… ?" — bonds to 5, then to 10. Distinct from addition: parts of a whole, not "adding more" |
| M7 | Addition | To 5, then to 10 — always with countable on-screen objects ("2 stars and 1 more star — how many?"), never bare symbols |
| M8 | Subtraction to 5 | "3 bunnies, 1 hops away…" with a real hop-away animation |
| M9 | Patterns & skip counting | Continue 🔴🔵🔴🔵…; count by 2s with frog jumps |

Placement starts at M1–M2 (she counts past 10, so expect these to master fast — the engine's normal 3-in-a-row level-ups will carry her up quickly without special rules).

### 6c. Puzzle ladder

| Stage | Skill | Activity |
|---|---|---|
| P1 | Shapes — **naming, not just matching** | "Find the TRIANGLE!" hunts (circle, square, triangle, star, rectangle, heart — all spoken by name) plus drag-into-matching-hole rounds |
| P2 | Jigsaws | Unicorn scenes: 2 → 4 → 6 → 9 pieces. **Tap a piece, then tap its slot** (pieces are rectangular tiles of an SVG scene via `viewBox` cropping — no clip-path maths) |
| P3 | Patterns | Complete AB → ABC → AABB bead patterns |
| P4 | Memory match | Flip-card pairs: 4 → 6 → 8 → 12 cards, pack-sprite faces |
| P5 | Mazes | Lead the unicorn to the rainbow by **tapping successive glowing waypoints** (not finger-tracing), 3 growing sizes |
| P6 | Odd one out & sorting | "Which one is different?"; sort by size, colour, kind |

## 7. Difficulty progression engine

**Definitions used everywhere** (implement these words consistently):

- A **round** is 5 questions of one activity. A **perfect round** is all 5 correct on the first try.
- A **streak** is consecutive first-try correct answers within an activity.
- Each stage has a ladder of **internal levels** (as many as its activity needs — jigsaws have 4 piece-counts, memory has 4 sizes) and defines **3 star checkpoints** pinned to specific levels (e.g. jigsaw stars at 4, 6, and 9 pieces; counting stars at counts of 5, 8, 10). **Stars = checkpoints passed; 3 stars = stage mastered.**

The engine:

- **Streak of 3 → level up**, with a mini-fanfare.
- **2 misses on one question → gentle hint** (wrong options fade slightly; the unicorn re-explains).
- **3 misses → the unicorn warmly shows the answer** ("Here it is! Let's do it together") and play moves on — she can never be stuck. Assisted completions get warm but **muted** feedback (a soft sparkle, no fanfare) and award **no gems, no streak, no star progress**. Missing three times must never pay like succeeding.
- Struggling across several questions → quietly step the level down. Never announce it.
- Wrong answers are never punished: friendly wiggle, soft boop, "almost — try again!" No red X, no buzzer, no lost anything, ever.
- **Spaced review:** mastered stages don't vanish. Roughly **1 question in 5** is a "sparkle review" drawn from a previously mastered stage (marked with a little ✨ and worth +1 bonus gem), and each session opens with a 2–3 question warm-up from mastered content — easy wins that also fight skill decay.
- **Cross-session plateau handling:** if a stage gains no star checkpoint across 3 separate sessions (tracked by a session counter in the save; the dev panel's simulate-session-boundary button makes this testable in minutes), change the presentation — switch to a sibling activity for the same skill, add an extra modelled example before questions, or step sideways to an adjacent easier skill for a session. Never silently repeat the identical drill for days.
- **Interleaving:** after ~2 consecutive rounds of the same activity, the unicorn suggests (never forces) a different zone.
- **Zone unlocks:** Letter Meadow, Number Mountain, Memory Clouds open from the start. Word Garden opens at 3 total stars in Letter Meadow. Puzzle Falls opens at 3 total stars anywhere. **Crystal Castle opens at 12 total stars with at least 2 stars in every other zone you shipped** (so the rule still works at any cut depth).

## 8. Reward mechanics (the engagement engine)

Layered on different time-scales so something good is always about to happen:

1. **Instant (every answer):** stars/confetti burst at the tap point; the unicorn leaps; chime; spoken praise from a pool of 15+ phrases using her name, never repeating twice in a row. **Growth-mindset rule:** praise names effort, strategy, and persistence ("You worked that out!", "You kept trying!", "You listened so carefully!") — the words "smart", "clever", and "genius" are banned everywhere in the game.
2. **Per round (5 questions):** 2–4 **rainbow gems** 💎, +1 for a perfect round, with a flying-gem animation into her counter.
3. **Session meter:** a rainbow meter fills with correct answers; when full (~10 correct), don't play a cutscene *at* her — hand her the party: ~15 seconds where every tap launches a firework she aims and the unicorn dances to the rhythm of her taps (tap-skippable like everything). Then the meter resets.
4. **Sparkle Boutique 🎀 — economy tuned to the full game length.** Earn rate is ~75–90 gems/hour; the static sink must last 10+ hours of play, not 4. ~30 items in three price tiers: starter (5–15 gems, available day one, first item affordable within ~10 minutes), fancy (20–40 gems, unlocks with Word Garden/Puzzle Falls), royal (50–80 gems, unlocks with Crystal Castle progress — something big to save for). Manes, wings, crowns, sparkle trails, tutus, sunglasses, castle decorations — all real SVG layers on her unicorn everywhere (fixed-anchor overlay is fine, §2a). **Buying is two steps:** tap to try on (free preview), then a separate "keep it!" button spends — random mashing can never empty her balance. **Plus a bottomless renewable sink:** treats (3–5 gems — feed the unicorn a strawberry or cupcake from the pack sprites for a unique happy animation) and garden seeds (10 gems — plant a flower patch that visibly grows on the map by the next session). Gems must never become meaningless.
5. **Unicorn eggs 🥚 — spread across the whole arc:** 6 eggs awarded at star milestones 6, 15, 27, 40, 54, and 69 (tap-tap-tap-crack!) — 69 is every star in the game (23 stages × 3), each hatching a collectible **baby unicorn**; the final egg hatches the coronation companion. Never let the collection complete in the first quarter of the game. **She names every baby** on hatch (reuse the first-run naming widget — spoken list or alphabet keyboard: ownership plus stealth letter practice). **Babies grow up:** three life stages (baby → young → grown; same rig, scaled, baby proportions — bigger head, stubby legs), driven by stars earned since hatch AND treats fed to that baby in the stable (treats elsewhere are pure delight, no growth effect), so nurture visibly matters. Each growth moment is a small ceremony and, if the Memory Book shipped, a keepsake ("Moonbeam grew up!"); grown unicorns join the rainbow-meter dance parties.
6. **Sticker album 📖:** a page per zone; each completed round awards a sticker, occasionally a **rare sparkly one** (distinct shimmer treatment). The album shows **empty silhouette slots** for uncollected stickers — a pre-reader can see exactly what's still out there — and completing a page triggers its own celebration.
7. **Daily gift:** first launch each calendar day, a present on the map with a small gem bonus.
8. **Milestone ceremonies — distinct from routine feedback:** true firsts (first star ever, each zone's first mastery, first boutique purchase, each egg hatch, each rainbow arc restored) get a unique one-off full-screen ceremony — confetti cannon, her name in sparkles, a personalised spoken line — and are saved as keepsakes in a revisitable **Memory Book** 📔 on the map, where tapping a keepsake replays its moment. (If the Memory Book is cut, every ceremony still plays in full — only the keepsake-saving drops.)

Everything autosaves immediately.

## 8a. The fun layer — agency, silliness, safe mischief

The rewards system makes her *come back*; this layer makes her *love it*. Play with no questions and no grades.

**Toy corners** — sandbox spaces on the map where nothing is ever asked of her:
1. **The Unicorn Stable 🛖:** a barn where all her hatched unicorns live. They wander about, munch hay, nap in the straw, nuzzle each other, and react to petting. Feeding treats happens here (that's what grows them); each unicorn has one personality quirk (one always sleeps, one chases her finger, one sneezes). Names float gently above each unicorn — text plus spoken on tap. It's *her* barn. The stable is visible from day one as a cosy empty barn with a waiting nest — anticipation is content — and the first hatch triggers a tiny barn-warming moment.
2. **Dress-up mirror:** every owned boutique item freely try-on-able; the unicorn strikes poses.
3. **Unicorn kitchen:** stack any pack sprites into a "cake"; the unicorn eats it and reacts — strawberry-cupcake cake gets bliss, fish-and-sock cake gets a magnificent theatrical "BLEURGH!" Secretly a vocabulary and sorting toy; openly a comedy machine.
4. **Music meadow:** flowers are pentatonic notes (reuse the music engine); anything she taps sounds like a song. A tap-record-replay butterfly plays her own tune back.

**Silly event days:** occasionally the game wakes up weird — Sock Day (everything wears socks), Upside-Down Day (butterflies fly backwards), Echo Day (the unicorn says her name three silly ways). Rare (roughly weekly), surprising, breakfast-table reportable.

Rules: toy corners are always open (never misted, no unlock thresholds); the map beacon only ever points at learning zones; session pacing counts toy-corner time — screen time is screen time. Toy corners never issue questions, never award gems (except being where treats are spent), and are reachable straight from the map — they're where she goes when she's tired of questions but not tired of the game. All fun-layer content obeys the UX laws (spoken, no reading, no fail states).

## 9. Game feel — specifics, not adjectives

- **Never a hard cut:** every screen change is a choreographed transition themed to the destination (petal wipe into Letter Meadow, cloud iris into Memory Clouds, zoom-through-the-rainbow into activities), 300–500ms.
- **Easing:** UI pop-ins overshoot and settle (spring curves via CSS `cubic-bezier` or the Web Animations API). Nothing appears or vanishes instantly.
- **Anticipation → payoff:** big actions telegraph (the unicorn crouches before a celebration leap; an egg wobbles before it cracks; the gem counter inhales before gems land).
- **Particles:** one lightweight reusable particle system (DOM/CSS transform-based) drives confetti, sparkle trails, glitter bursts — tuned to stay 60fps.
- Every tap yields visible feedback within 100ms, even just a ripple. Any celebration is tap-skippable; input is never locked for more than a second.
- Ambient life everywhere (drifting clouds, butterflies, swaying flowers) — transform/opacity only, GPU-cheap.
- Pastel rainbow palette (soft pinks, lilacs, mints, sky blues, buttery yellow), huge rounded corners, chunky friendly shapes, big rounded system font stack.

## 10. UX laws for a pre-reader (violating any of these is a bug)

1. Every screen's purpose is spoken on entry, repeatable via 🔊.
2. Nothing requires reading. Text may appear (it aids literacy) but always with audio and visual redundancy.
3. One clear action per screen. Never two competing instructions.
4. A big consistent 🏠 home button in the same corner of every screen.
5. Everything tappable looks tappable; nothing that looks tappable is dead. Idle 10s → the relevant area pulses gently; idle 20s → the unicorn repeats the instruction.
6. No time pressure anywhere (the M1 subitising flash limits *display* time, never *answer* time).
7. No fail states. Every path leads forward.
8. Any animation is interruptible by tap.
9. Multi-touch safe (she will mash with three fingers): first pointer wins, others ignored, no crashes.
10. Rotation-safe: nothing cut off in either orientation. In a narrow Split View / Slide Over window (<~375px), scale the whole layout down proportionally so targets and the 🏠 button never clip — or show a friendly no-text visual (unicorn + "make me bigger" gesture icon).
11. **Gentle session pacing:** after ~20 minutes or 2 rainbow-meter fills, the unicorn yawns adorably and offers — never forces — "Want to keep playing, or shall we have a little rest? I'll keep your stars safe!" One tap continues play; no lockout, no guilt.

## 10a. UX excellence — required, not optional polish

Triage lever: under real budget pressure, items 2, 5, and 10 may be *simplified* (never skipped) before any content floor is touched — note the simplification in your decisions comment block.

1. **Worked example before question 1 of every new widget type:** the first time drag-to-slot, tap-sequence, or flip-pairs appears, the unicorn performs a ~3s demonstration (hoof-taps/drags a correct answer while narrating) before the first real question. She learns mechanics by watching, never guessing.
2. **Drag feel:** on pickup the item scales ~1.15×, offsets *above* the fingertip (her finger must not hide it), gains a growing drop shadow; the matching slot glows with a magnetic pre-snap highlight as she nears it.
3. **Map beacon:** on map load the unicorn trots toward and sparkle-points at the recommended next zone (lowest progress / least recently visited); dismissable, never forced.
4. **Transitions are comprehension aids:** zone transitions originate at the icon she tapped and resolve into that zone's scene — cause → effect stays spatially legible.
5. **Gate the "go" signal, not the tap:** answer options render immediately but sit visually quiet until narration reaches the key word, then light up with a staggered pop; an early tap still counts.
6. **One feedback-sound grammar game-wide:** correct-chime, try-again-boop, round flourish, milestone fanfare are identical in every zone and widget. Zone music varies; feedback vocabulary never does.
7. **Re-speak on in-app returns:** coming back to an in-flight question via the home button replays the instruction (not just after OS lock/switch).
8. **The rest screen is a real choice:** "keep playing" and "rest now" get equal size and cheer; choosing rest gets a calm wind-down beat (dim map, sleepy unicorn, "night night!"), never an abrupt stop.
9. **No blank paint, ever:** the start button is inline-critical-CSS and paints first; zone scenes finish building within the transition's duration.
10. **Quiet chrome during questions:** gem counter, meter, and hear-again recede (smaller, desaturated, static) while a question is live; they animate only in reward moments.
11. **Zone identity everywhere:** each zone's colour/icon frame carries through all its activity screens so "where am I" always has a non-text answer.

## 11. Grown-ups' corner

A small, quiet "For grown-ups" link on the map (bottom corner, deliberately boring, **never spoken aloud or hinted at by the unicorn**). It opens behind an adult gate a persistent four-year-old can't brute-force: three digits shown **as text** ("Tap 3, then 7, then 5") above a keypad — unreadable to a pre-reader, trivial for a parent. Inside:

- Progress dashboard: per-skill stage and stars, accuracy trend, total questions, time played this week, current review items.
- Toggles: voice / sound effects / music, master volume.
- "Reset all progress" additionally requires a 3-second press-and-hold (no confirm dialogs) — weeks of her progress live behind it.
- A parent tip: "For fullscreen, use Add to Home Screen. To lock her into the game, use iPad Guided Access (triple-click the top button)."

## 12. Final verification — check as you write, not by re-reading at the end

Everything above is the spec; verify it as you build each system (the detailed rules live in their sections). Before presenting, confirm only these load-bearing facts:

- [ ] The HTML file is complete and valid — not truncated, every `<script>` closed, no console errors on load.
- [ ] Zero external requests; first tap unlocks audio and narration works.
- [ ] The whole game is playable by someone who cannot read, with no screen she can ever be stuck on.
- [ ] Your declared cut-depth was honoured: everything you shipped is finished, and nothing references anything you cut.
- [ ] A full page reload mid-game resumes correctly (same zone/activity/level, gems and stars intact, fresh question).
- [ ] `<!-- SPRITE_PACK_HERE -->` sits as the first child of `<body>`; every learning picture is a `<use href="#p-…">` from the §2b manifest; no platform emoji glyph is rendered anywhere as game art.

**Scope reminder (this is the instruction that matters most):** first state how far down the cut list you are building — MVP core (map, unicorn companion, narration, music, difficulty engine, reward core, autosave, Letter Meadow R1–R3, Number Mountain M1–M4+, Memory Clouds P1/P4/peek-a-boo) is untouchable; the cut list runs memory book → surprise events → day/night → daily gift → eggs → sticker album → Crystal Castle → P5 → P2 → Puzzle Falls → Word Garden. Then build exactly that, completely.

Now build the complete game. Take as much space as you need — completeness and polish over brevity.
