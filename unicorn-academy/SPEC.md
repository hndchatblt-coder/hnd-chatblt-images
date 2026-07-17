# Unicorn Academy — full specification

<mission>
Build **Unicorn Academy**: a complete, premium-quality educational game for a four-year-old girl,
as a single self-contained HTML file (`game.html`). Quality bar: the best kids' titles on the App
Store (Khan Academy Kids, Toca Boca, Sago Mini). Every feature shipped must be fully implemented
and working. No placeholders, no TODOs, no stub functions. Never ask the user questions — decide,
log in DECISIONS.md, build.
</mission>

<player>
She is four. She recognises most letters and their sounds and counts past 10. She cannot read
words, so **she can never be required to read text to know what to do**. She plays independently
on an iPad in Safari, landscape or portrait. She is clever, easily delighted, easily discouraged —
the game must be impossible to get stuck in and must never make her feel she failed.
Australian English throughout (colour, mum); prefer an en-AU voice, then en-GB, then en-US.
</player>

<scope>
The full spec is the goal. A smaller game where everything works perfectly beats a bigger one with
anything broken. In a project session you verify as you go, so plan to build everything; the cut
list below exists for genuine emergencies and cuts must be recorded in DECISIONS.md.

MVP core (never cut): map hub, unicorn companion with personality, first-run flow, narration
system, music engine, adaptive difficulty engine, reward core (praise + gems + rainbow meter +
Sparkle Boutique ≥8 items), autosave, resilience layer, dev mode — and three zones: Letter Meadow
(R1–R3), Number Mountain (M1–M4 minimum), Memory Clouds (P1, P4, peek-a-boo). Eight activity
types minimum.

Cut list, bottom-up, each item self-contained: silly event days → unicorn kitchen → music meadow
→ hide-and-seek babies → unicorn stable (if cut, babies still roam the map, named, ungrowing) →
memory book keepsakes → rare surprise events → day/night cycle → daily gift → unicorn eggs →
sticker album → Crystal Castle → mazes (P5) → jigsaws (P2) → Puzzle Falls zone (contains only
P2, P3, P5, P6) → Word Garden zone (reading then ends at R3). The dress-up mirror, story-framed
narration, conductable celebrations, and baby naming (whenever eggs ship) are engine-cheap
and never cut independently.

**Canonical build priority order** (the one order every other document means): Letter Meadow →
Number Mountain → Memory Clouds → Word Garden → Puzzle Falls → Crystal Castle. Build and verify
zones in exactly this order.
</scope>

<constraints>
- **One HTML file.** All CSS, JS, art inline. No external files, no CDN, no network requests, no
  image or audio files — art is inline SVG/CSS, sound is synthesised. Works offline forever.
- **Touch-first.** Pointer events. Touch targets ≥80×80px, ≥24px from screen edges
  (home-indicator and edge-swipe zones eat edge taps). `touch-action: manipulation` +
  `user-select: none` everywhere; `touch-action: none` + `setPointerCapture` on draggables so iOS
  scroll panning can't cancel a drag. Lock the page: `overscroll-behavior: none`,
  `position: fixed` + `overflow: hidden` on body, `preventDefault` on document `touchmove` — no
  pull-to-refresh, no rubber-banding. Viewport meta with `viewport-fit=cover`; pad with
  `env(safe-area-inset-*)`. Use `100dvh`/`innerHeight`, never `100vh`. No hover-dependent
  interactions. Drag-and-drop snaps within ~60px.
- **Speech narration** (Web Speech API). Every instruction, letter sound, word, number and
  celebration is spoken.
  - One speak-helper everywhere: `cancel()`, wait ~100ms (iOS swallows immediate `speak()` after
    `cancel()`), then `speak()`.
  - Don't wait solely on `voiceschanged` (often never fires on iOS): poll `getVoices()` up to ~2s
    then fall back to any English voice. Rate ~0.9; pitch ~1.1 for the unicorn.
  - Chunk all narration under ~10s per utterance (iOS cuts long ones off).
  - On `visibilitychange`/`pageshow`: `resume()`, cancel zombie utterances, re-speak the current
    instruction (iOS leaves speech stuck-paused after screen lock).
  - First screen is a giant "tap to start" rainbow button; its handler fires a first utterance and
    a WebAudio `resume()` (iOS unlocks audio only in a user gesture).
  - Big speaker "hear it again" button on every activity screen.
  - **Phoneme rule (critical):** never pass IPA/slash notation to TTS; never let it say letter
    *names* for letter *sounds*. Hand-tuned per-letter table of pronounceable approximations
    (m→"mmm", s→"sss", a→"a as in apple", c→"k"); where TTS can't render a sound, use
    word-anchored phrasing ("the sound at the start of **moon**"). Blending: stretched sounds from
    the table, then the whole word ("mmm… aaa… t — mat!").
  - If speech is genuinely unavailable, hide the intrinsically audio-dependent activities and
    substitute visual siblings; everything remaining stays playable silently.
- **Music engine** (WebAudio, procedural): looping pentatonic ambient bed, distinct key/timbre per
  zone, run through a mix bus: music ducks ~60–70% under narration and swells back; celebration
  stingers layer over the bed; SFX on top. Three toggles (voice/effects/music) in grown-ups'
  corner; ducking is one system.
- **SFX** synthesised: gentle chime (correct), soft boop (incorrect — never harsh), sparkly
  arpeggios (rewards), fanfares (milestones). `navigator.vibrate()` optional garnish (no-op on
  iPad; never depend on it).
- **Persistence**: `localStorage` in try/catch with in-memory fallback. Autosave after every
  answer, purchase, unlock. Resume = same zone/activity/difficulty, greeted by name, always a
  fresh question. Never serialise mid-question state.
- **No `alert`/`confirm`/`prompt`. No external links. Nothing leaves the device.**
- 60fps via transform/opacity animations only; snappy on an older iPad.
</constraints>

<architecture>
- **One generic activity engine, not 23 bespoke screens.** A single question-loop engine
  (present → answer → feedback → score/streak/gems → next) drives a small set of reusable
  interaction widgets: tap-the-right-choice, drag-to-slot, tap-each-object, tap-sequence,
  flip-pairs. Every stage (R1–R8, M1–M9, P1–P6) is a data-table entry choosing a widget and
  supplying content — a new activity costs ~30 lines of data, not 300 of code. Write the data
  schemas and engine skeleton FIRST, before any screen.
- **Engine-wide robustness (implement once):**
  - Tapped answer locks the question until feedback resolves (no double-crediting from mashing).
  - During screen transitions, navigation taps are ignored; one transition at a time.
  - Home button stays live during drags/animations/celebrations; tapping it cleanly cancels
    what's in flight (nothing counted wrong) and returns to the map.
  - Save before ceremony: rewards hit storage *before* their celebration plays.
  - Level-down floor: never below the stage's placement level (sibling-proof).
  - Save loading wraps JSON.parse + shape check; corrupt saves silently start fresh.
  - Idle/pacing timers compute from wall-clock timestamps re-checked on
    `visibilitychange`/`pageshow`; a 30-minute screen lock must not dump stale prompts. Daily gift
    evaluates once per map load against a stored date string.
  - Petting and repeatable delights are debounced (~200ms) and share the speak-helper.
  - Rare events are single-use with a hard cooldown — unfarmable.
- **Blessed cheap approximations** (spend budget on content, not invisible polish): 2–3 oscillator
  pentatonic loop with per-zone transposition satisfies the music spec; one parameterised wipe
  varying colour/icon per destination satisfies transitions; 3 discrete gradient presets off
  `getHours()` satisfy day/night; boutique items attach to a single fixed anchor layer; mood may
  be 2 states (calm/excited) swapping idle sets, voice modulation optional.
</architecture>

<resilience_and_dev>
- **Global error handler** (`window.onerror` + `unhandledrejection`): log to the dev panel,
  recover to the map with the unicorn saying "Oops! Let's fly home!" — never a white screen, never
  a frozen state. State machine resets to a known-good screen.
- **Save schema version**: the save object carries `v: 1`. On load, an unknown/older version keeps
  durable progress (gems, stars, unlocks, name) and resets only session position. Never crash on
  old saves.
- **Dev mode** — hidden unless the URL has `?dev=1`: a collapsible panel with current state
  (zone/stage/level/streak/gems/stars), level-jump controls, an auto-answer bot
  (correct / wrong / random, with speed multiplier), a simulate-session-boundary button (bumps
  the session counter — makes plateau logic testable), a skip-celebrations toggle, TTS mute, and an
  event log (errors, saves, engine transitions). This is how the progression curve gets verified
  in minutes instead of hours. Invisible and unreachable in normal play.
</resilience_and_dev>

<test_contract>
Stable `data-testid` attributes so verify.js can drive the game: `start-button`,
`unicorn-colour-{n}` (body swatches), `mane-colour-{n}` (mane swatches — distinct from body),
`unicorn-name-option` (each name in the spoken list), `name-keyboard`, `name-done`,
`story-skip`, `map`, `zone-{id}` (letter-meadow, number-mountain, memory-clouds, word-garden,
puzzle-falls, crystal-castle), `activity`, `answer-option` (every tappable answer),
`home-button`, `hear-again`, `rainbow-meter`, `gem-counter`, `boutique`, `keep-playing`,
`rest-now`, `dev-panel`, and inside the dev panel: `dev-jump`, `dev-bot-correct`,
`dev-bot-wrong`, `dev-skip-celebrations`, `dev-tts-mute`, `dev-session-boundary`, plus
`toy-stable`, `toy-kitchen`, `toy-music`, `toy-dressup`, and `egg` (a tappable unhatched egg).
Add them as elements are built.
At startup, `console.info` the chosen TTS voice (or "no voices available") — headless test
browsers usually have zero voices, so the harness needs to see which audio path it exercised.
</test_contract>

<art_system>
**Platform emoji are banned as rendered game art.** Any emoji in this spec is shorthand for a
bespoke SVG in the house style.

- **Tier 1 — bespoke rigged SVG**: the unicorn, baby unicorns (recoloured/scaled variants of the
  same rig), castle, map landmarks, all UI icons, all boutique items. House style: flat sticker
  look; 2–5 shapes per object; soft plum `#5C4A66` ~3px outlines, rounded joins; one shared pastel
  palette as CSS variables; dot eyes with white highlight; optional blush. Unicorn rig: separate
  groups for body, head, snout, ear, horn, 3-layer mane, wing, tail, each leg; named anchors
  (head-top, back, neck, tail-base) for boutique items; animations for blink, idle-breathe, trot,
  leap, nuzzle, sad-tilt, celebrate-spin.
- **Tier 2 — the sprite pack** (`assets/sprite-pack.svg.html`, 68 palette-harmonised `<symbol>`s
  derived from OpenMoji, CC BY-SA 4.0) supplies every learning-content picture. Inline it as the
  first child of `<body>` programmatically; reference via `<svg><use href="#p-cat"/></svg>`.
  Never draw these nouns; never retype the pack. Manifest:
  `cat dog sun hat bed pig bus hen web bug van cap bat cup pen box bell log fish ship shell chick
  duck bath chips sock moon star snake tree key egg milk banana lion monkey elephant umbrella
  orange apple strawberry rabbit flower balloon cupcake frog bee butterfly cow horse sheep mouse
  owl turtle bird fox bear ball boat car train kite drum gift icecream pizza watermelon carrot`.
  Every pictured word in content tables must come from this manifest or Tier 1. Add "Artwork
  includes OpenMoji sprites (openmoji.org), CC BY-SA 4.0" to the grown-ups' corner.
- **Tier 3 — procedural scenery**: parametric SVG generators — `flower(x,y,size,petals,colours)`,
  `cloud`, `tree`, `butterfly`, `sparkle`, `hills`, `rainbow(arcs)` — with randomised parameters.
  All map scenery, particles and ambient life are generated, never hand-placed: the map blooms as
  stars are earned (higher densities, richer palettes) and day/night is different palette inputs.
</art_system>

<world>
**Quest:** the Rainbow Kingdom's colours have faded; only a clever child can restore them. Every
star restores visible colour — rainbow arcs fill in, flowers multiply, castle windows light up,
hatched babies roam. The 0% map and the late-game map must look unmistakably different; progress
lives in the world, not just in star icons. Endgame: full colour and a Crystal Castle coronation.

Map hub: pastel hills with 2–3 parallax layers, rainbow overhead, drifting clouds; everything
tappable invites tapping (bounce/glow). **Day/night** via device clock (3 gradient presets +
stars/fireflies after dark; occasional glitter shower). **Rare surprise events** (≥5, unfarmable,
never during a question): tappable shooting star (+3 gems), glitter sneeze, bunny peeking,
butterfly landing on the horn, heart-shaped cloud.

**Hide-and-seek:** once babies are hatched, sometimes one is hiding on the map — a mane poking
out from behind the castle, a tail in the flowers — with a giggle when found. The map becomes a
place she searches, not just a menu she selects from.

Zones (distinct palette, music key, activities):

| Zone | Content | Activities |
|---|---|---|
| Letter Meadow | letters & sounds | R1–R3 |
| Word Garden | blending & words | R4–R8 |
| Number Mountain | counting & maths | M1–M9 |
| Puzzle Falls | logic & spatial | P2, P3, P5, P6 |
| Memory Clouds | memory & shapes | P1, P4, peek-a-boo clouds ("where was the star?") |
| Crystal Castle | endgame | royal challenges mixing every mastered skill |

Locked zones are visible in sparkly mist; tapping one, the unicorn states the real remaining
requirement.

**Unlocks:** Letter Meadow, Number Mountain, Memory Clouds open at start. Word Garden at 3 stars
in Letter Meadow. Puzzle Falls at 3 stars total. Crystal Castle at 12 total stars with ≥2 stars in
every other shipped zone.

**Endgame — after the coronation the game must not die:** unlock **Rainbow Royale** mode — a
daily rotating "royal challenge" set remixing her mastered skills at their top levels, earning
rare rainbow gems for a final tier of boutique items; the unicorn refers to her as Champion; the
fully-restored map stays alive with all ambient systems.
</world>

<companion>
The unicorn is a friend, not a mascot. Reactions with anticipation (crouch before leap); a simple
persistent mood (calm/excited minimum) driving idle sets; memory referenced unprompted (favourite
zone, days played, return-after-absence, last milestone); **petting** — tapping/stroking her
anywhere outside a question gives giggles, nuzzles, sparkle shivers, occasional rare reactions;
no rewards attached; debounced.

Voice: the robotic TTS is embraced in-fiction — she learned to talk from the stars, so she speaks
"a little like magic". Never fight the voice; write lines that sound charming when spoken flatly
(short, rhythmic, exclamatory).

**Comedy reel:** the unicorn has actual comic timing, played in idle moments and toy corners —
chases a butterfly and faceplants into a flowerbed, sneezes glitter at the worst moment, snores
dramatically when idle long enough, occasionally tells a terrible four-year-old joke ("What does
a cow say? MOO! What does a unicorn say? …SPARKLE!"). **Guardrail: wrong answers never trigger
the funniest animations** — feedback comedy stays gentle so she can't farm wrong answers for
laughs; the big comedy lives outside questions.
</companion>

<first_run>
Order matters: the first 20 seconds must be low-effort delight, not a 26-key spelling task.
1. Giant "tap to start" (audio unlock). This button is the literal first pixel painted — inline
   critical CSS so it renders before any JS or voice-polling runs; never a blank flash.
2. **Create-a-unicorn first**: body colour (6 pastel swatches), mane colour, then the unicorn's
   name from a spoken tappable list (Sparkle, Rosie, Star, Moonbeam) or the letter keyboard.
   Instant, easy, delightful choices — she's bonded with "her" unicorn before any harder task.
3. **Then her name**, as a stealth letter game: huge uppercase alphabet keyboard + big spoken
   backspace; each letter spoken; cap 10 letters; green tick confirms; bare tick → "Superstar".
   Her name is spoken everywhere after; mangled TTS pronunciation is acceptable; the name is
   never required for any interaction.
4. Quest story over the faded map (~15s, chunked, tap-skippable via a visible sparkle-button),
   then fly to Letter Meadow.
Returning sessions skip all of it: "Welcome back, [name]! [Unicorn] missed you!"
</first_run>

<content_data>
All content lives in data tables the engine walks. Include generous content — weeks of play.

**Story framing:** narration templates wrap every question in a zone-themed micro-story with a
tiny stake — not "which one starts with mmm?" but "the babies are STARVING! Feed the one whose
food starts with mmm!"; not "how many planks?" but "the bridge needs 7 planks — count them on!"
Same engine, same data; the frame is what makes a question feel like playing instead of testing.
Each zone gets 3–4 rotating story frames per activity type.

**Reading ladder (synthetic phonics order):**

| Stage | Skill | Activity |
|---|---|---|
| R1 | Letter recognition | "Find the letter B!" — 3 → 4 → 6 options; introduce in SATPIN order (s a t p i n, m d g o c k…), not alphabetical |
| R2 | Letter sounds | "Which letter makes the sound mmm… like the start of **moon**?" (phoneme rule) |
| R3 | Beginning sounds | "Which one starts with sss?" — pictures from the pack |
| R4 | CVC blending | Word sounded slowly, tap the matching picture. Early items use continuant sounds (s m f n l r) before stop sounds (t p b d) that tempt a "buh" schwa |
| R5 | CVC building | Drag letters into slots for a shown picture; each dropped letter speaks its sound; the completed word blends aloud |
| R6 | Digraphs | sh, ch, th, ck like R4/R5. Bank: fish, ship, shell, chick, duck, bath, chips, sock |
| R7 | High-frequency words, two kinds taught differently | Tricky (whole-word): the, I, to, my, go, said, was, you, of. Decodable (blend them): it, in, at, is, can, and, up, we |
| R8 | First sentences | 3-word rebus sentences ("The [cat sprite] sat.") read word-by-word as she taps |

Placement starts at R2–R3 (R1 available for warm-up wins); placement sets the starting stage only.

CVC bank (all pictured from the pack): cat, dog, sun, hat, bed, pig, bus, hen, web, bug, van, cap,
bat, cup, pen, log. "fox"/"box" end in /ks/ — not CVC; use those sprites for counting/sorting.
**Picture rule:** a word appears in picture-matching only if a stranger aged four would name its
sprite correctly.

**Maths ladder:**

| Stage | Skill | Activity |
|---|---|---|
| M1 | Subitising 1–5 | Dot/dice/ten-frame flashes ~1.5s → tap the number (display-time limit, never answer-time) |
| M2 | Counting 1–10, one-to-one | Tap each object once; it highlights and its number is spoken. Never glance-and-guess |
| M3 | Number recognition 1–20 | "Find the number 7!" |
| M4 | Comparing | Quantity (more/fewer), size and length (big/small, longer ribbon) |
| M5 | Order & position | 1st/2nd/3rd in a race; in/on/under/next to; first/last |
| M6 | Number bonds | Ten-frame part-whole: "5 is 3 and…?" — bonds to 5, then 10 |
| M7 | Addition | To 5 then 10, always countable on-screen objects, never bare symbols |
| M8 | Subtraction to 5 | "3 bunnies, 1 hops away…" with a real hop-away animation |
| M9 | Patterns & skip counting | Continue colour patterns; count by 2s with frog jumps |

Placement starts at M1–M2; normal 3-in-a-row level-ups carry her up fast.

**Puzzle ladder:**

| Stage | Skill | Activity |
|---|---|---|
| P1 | Shapes — naming, not just matching | "Find the TRIANGLE!" hunts (circle, square, triangle, star, rectangle, heart, all spoken) + drag-into-hole rounds |
| P2 | Jigsaws | Unicorn scenes 2 → 4 → 6 → 9 pieces; tap-piece-then-tap-slot; pieces are rectangular `viewBox`-cropped tiles |
| P3 | Patterns | AB → ABC → AABB bead patterns |
| P4 | Memory match | 4 → 6 → 8 → 12 cards, pack-sprite faces |
| P5 | Mazes | Tap successive glowing waypoints (not finger-tracing), 3 sizes |
| P6 | Odd one out & sorting | Which is different; sort by size, colour, kind |
</content_data>

<difficulty_engine>
Definitions (use these words consistently): a **round** is 5 questions of one activity; a
**perfect round** is all 5 first-try correct; a **streak** is consecutive first-try corrects
within an activity; each stage has internal **levels** (as many as its activity needs) and **3
star checkpoints**. Default checkpoint formula for a stage with N levels: stars at levels
⌈N/3⌉, ⌈2N/3⌉, and N. Explicit pins override the formula (jigsaw stars at 4/6/9 pieces; counting
at counts of 5/8/10). Stars = checkpoints passed; 3 stars = stage mastered.

Rules: streak of 3 → level up (mini-fanfare). 2 misses on one question → gentle hint (wrong
options fade; unicorn re-explains). 3 misses → warm reveal ("Here it is! Let's do it together"),
play moves on — muted feedback, **no gems, no streak, no star credit** (failing must never pay
like succeeding). Sustained struggle → quiet level-down (never announced, floored at placement
level). Wrong answers never punished: wiggle, soft boop, "almost — try again!". No red X, no
buzzer, nothing lost, ever.

**Spaced review:** ~1 question in 5 is a "sparkle review" from a mastered stage (marked with a
sparkle, +1 bonus gem); each session opens with a 2–3 question warm-up from mastered content.
**Cross-session plateau:** no checkpoint progress in a stage across 3 sessions (tracked by a
session counter in the save; the dev panel's simulate-session-boundary button makes this
testable in minutes) → change
presentation (sibling activity, extra modelled example, or a sideways session on an adjacent
skill) — never repeat the identical drill for days. **Interleaving:** after ~2 consecutive rounds
of one activity, the unicorn suggests (never forces) another zone.
</difficulty_engine>

<rewards>
Layered time-scales — something good is always about to happen:
1. **Instant:** burst at the tap point, unicorn leaps, chime, spoken praise from 15+ phrases using
   her name, never repeating consecutively. **Growth-mindset rule:** praise names effort, strategy,
   persistence ("You worked that out!", "You kept trying!"); the words "smart", "clever", "genius"
   are banned game-wide.
2. **Per round:** 2–4 gems, +1 for a perfect round, flying-gem animation.
3. **Rainbow meter:** fills with corrects; when full (~10), don't play a cutscene *at* her —
   hand her the party: ~15 seconds where every tap launches a firework she aims and the unicorn
   dances to the rhythm of her taps. Being the cause of the spectacle beats watching it.
   Tap-skippable like everything; then the meter resets.
4. **Sparkle Boutique — economy tuned to the full game length.** Earn rate is ~75–90 gems/hour;
   the static sink must last 10+ hours, not 4. ~30 items in three price tiers: starter (5–15
   gems, available day one, first item affordable within ~10 minutes), fancy (20–40 gems, tier
   unlocks with Word Garden/Puzzle Falls), and royal (50–80 gems, unlocks with Crystal Castle
   progress — something big to save for). All items are real SVG layers on the unicorn. Two-step
   purchase: tap to try on (free preview), separate "keep it!" button spends — mashing can't
   empty her balance. **Plus a bottomless renewable sink:** treats (3–5 gems — feed her unicorn a
   strawberry or cupcake from the pack sprites for a unique happy animation) and garden seeds
   (10 gems — plant a flower patch that visibly grows on the map by the next session). Gems must
   never become meaningless.
5. **Unicorn eggs — spread across the whole arc:** 6 eggs awarded at star milestones 6, 15, 27,
   40, 54, and 69 (tap-tap-tap-crack!) — 69 is every star in the game (23 stages × 3) — each hatching a baby unicorn. The final egg hatches the
   coronation companion. Never let the collection complete in the first quarter of the game.
   - **She names every baby** on hatch — reuse the first-run naming widget (spoken name list or
     the alphabet keyboard): more ownership, more stealth letter practice.
   - **Babies grow up.** Three life stages — baby → young → grown — same rig, scaled with
     baby-proportions tweaks (bigger head, stubby legs). Growth is driven by stars earned since
     hatch AND treats fed to that baby in the stable (nurture visibly matters — this is what the
     treat gem-sink is *for*; treats fed anywhere else are pure delight, no growth effect).
     Each growth moment is a small ceremony and, if the Memory Book shipped, a keepsake
     ("Moonbeam grew up!").
     Grown unicorns join rainbow-meter dance parties.
6. **Sticker album:** page per zone; sticker per completed round, occasionally rare-sparkly;
   empty silhouette slots show what's uncollected; page completion gets its own celebration.
7. **Daily gift:** first launch each day, present on the map, small gem bonus.
8. **Milestone ceremonies** (distinct from routine feedback): true firsts — first star, each
   zone's first mastery, first purchase, each hatch, each rainbow arc restored — get a unique
   one-off full-screen ceremony (confetti cannon, her name in sparkles, personalised line), saved
   as replayable keepsakes in the **Memory Book** on the map. (If the Memory Book is cut,
   every ceremony still plays in full — only the keepsake-saving drops.)
Everything autosaves immediately (before its ceremony plays).
</rewards>

<fun_layer>
The rewards system makes her *come back*; this layer makes her *love it*. Fun here means agency,
silliness, and safe mischief — play with no questions and no grades.

**Toy corners** — sandbox spaces on the map where nothing is ever asked of her:
1. **The Unicorn Stable 🛖:** a barn where all her hatched unicorns live. They wander about,
   munch hay, nap in the straw, nuzzle each other, and react to petting. She can feed treats
   (the gem sink — feeding here is what grows them), and each unicorn has one personality quirk
   (one always sleeps, one chases her finger, one sneezes). Visiting costs nothing and asks
   nothing: it's *her* barn. Names float gently above each unicorn (text + spoken on tap).
   The stable is visible from day one as a cosy empty barn with a waiting nest — anticipation
   is content — and the first hatch triggers a tiny barn-warming moment.
2. **Dress-up mirror:** every owned boutique item freely try-on-able; the unicorn strikes poses.
3. **Unicorn kitchen:** stack any pack sprites into a "cake"; the unicorn eats it and reacts —
   strawberry-cupcake cake gets bliss, fish-and-sock cake gets a magnificent theatrical
   "BLEURGH!" Secretly a vocabulary and sorting toy; openly a comedy machine.
4. **Music meadow:** flowers are pentatonic notes (reuse the music engine); anything she taps
   sounds like a song. A tap-record-replay butterfly lets her hear her own tune back.

**Silly event days:** occasionally the game wakes up weird — Sock Day (everything wears socks),
Upside-Down Day (butterflies fly backwards), Echo Day (the unicorn says her name three silly
ways). Rare (roughly weekly), surprising, breakfast-table reportable.

Rules: toy corners are always open (never misted, no unlock thresholds); the map beacon only
ever points at learning zones. Session pacing counts toy-corner time — screen time is screen
time. Toy corners never issue questions, never award gems (except being where treats are spent),
and are reachable straight from the map — they're where she goes when she's tired of questions
but not tired of the game. All fun-layer content obeys the same UX laws (spoken, no reading, no
fail states).
</fun_layer>

<game_feel>
Never a hard cut: every screen change is a themed 300–500ms transition (one parameterised wipe
varying colour/icon is fine). Pop-ins overshoot and settle (spring cubic-bezier). Anticipation →
payoff: crouch before leap, wobble before crack, inhale before gems land. One reusable
DOM/CSS-transform particle system for confetti/sparkles/glitter at 60fps. Every tap gives visible
feedback within 100ms. Celebrations tap-skippable; input never locked >1s. Ambient life
everywhere, transform/opacity only. Pastel palette, huge rounded corners, chunky shapes, rounded
system font stack.
</game_feel>

<ux_laws>
Violating any of these is a bug:
1. Every screen speaks its purpose on entry; repeatable via the speaker button.
2. Nothing requires reading; text appears only with audio + visual redundancy.
3. One clear action per screen.
4. Consistent home button, same corner, every screen — live even mid-drag/celebration.
5. Everything tappable looks tappable; nothing dead looks tappable. Idle 10s → relevant area
   pulses; 20s → unicorn repeats the instruction.
6. No time pressure anywhere (subitising limits display time, never answer time).
7. No fail states; every path leads forward.
8. Any animation is tap-interruptible.
9. Multi-touch safe: first pointer wins, others ignored, no crashes.
10. Rotation-safe both orientations; below ~375px width, scale the layout proportionally or show
    a friendly no-text "make me bigger" visual.
11. Gentle session pacing: after ~20 min or 2 meter fills, the unicorn yawns and offers — never
    forces — a rest ("I'll keep your stars safe!"). One tap continues. No lockout, no guilt.
</ux_laws>

<ux_excellence>
What separates top-notch from merely good — every item here is required. Triage lever: under
real budget pressure, items 2, 5, and 10 may be *simplified* (never skipped) before any content
floor is touched — log the simplification in DECISIONS.md like a cut:
1. **Worked example before question 1 of every new widget type.** The first time drag-to-slot,
   tap-sequence, or flip-pairs ever appears, the unicorn demonstrates (~3s hoof-demo performing a
   correct answer while narrating) before the first real question. She learns the mechanic by
   watching, never by guessing.
2. **Drag feel:** on pickup the item scales ~1.15×, offsets *above* the fingertip (her finger
   must not hide it) and gains a growing drop shadow; as it nears the right slot, the slot glows
   with a magnetic pre-snap highlight before she releases.
3. **Map beacon:** on map load the unicorn trots toward and sparkle-points at the recommended
   next zone (lowest-progress / least-recently-visited). Dismissable by tapping anything else;
   never forced. A pre-reader must never stare at six equally-inviting zones with no guidance.
4. **Transitions are comprehension aids:** the zone transition originates at the icon she tapped
   and resolves into that zone's scene — cause → effect is spatially legible, not decorative.
5. **Gate the "go" signal, not the tap:** answer options render immediately (spatial
   predictability) but sit visually quiet (lower opacity, no glow) until narration reaches the key
   word, then light up with a small staggered pop as the non-verbal "now" cue. An early tap still
   counts — no time pressure in either direction.
6. **One feedback-sound grammar game-wide:** the correct-chime, try-again-boop, round-complete
   flourish, and milestone fanfare are the *same sounds* in every zone and every widget. Zone
   music varies; feedback vocabulary never does.
7. **Re-speak on in-app returns too:** coming back to an in-flight question via the home button
   (not just OS lock/switch) replays the instruction — every context switch gets a restart cue.
8. **The rest screen is a real choice:** "keep playing" and "rest now" buttons have equal size,
   prominence, and cheerfulness. Choosing rest gets a calm wind-down beat (map dims, sleepy
   unicorn, "night night!") — never an abrupt stop, never guilt.
9. **No blank paint, ever:** the start button is inline-critical-CSS and paints first; zone
   scenes finish building procedural SVG *within* the transition's duration so she never arrives
   at a half-built screen.
10. **Quiet chrome during questions:** gem counter, rainbow meter, and hear-again visually recede
    (smaller, desaturated, not animating) while a question is live; they animate only in reward
    moments. One-channel attention gets one channel.
11. **Zone identity everywhere:** each zone's colour/icon frame carries through all its activity
    screens, so "where am I" always has a non-text answer mid-session.
</ux_excellence>

<parents>
Quiet "For grown-ups" link (bottom corner, deliberately boring, never spoken or hinted). Adult
gate: three digits shown as written text ("Tap 3, then 7, then 5") over a keypad — unreadable to a
pre-reader. Inside: progress dashboard (per-skill stage/stars, accuracy trend, totals, time this
week, current review items); voice/effects/music toggles + master volume; "reset all progress"
requiring an additional 3-second hold; OpenMoji attribution line; tip: "For fullscreen, use Add to
Home Screen. To lock her in, use Guided Access (triple-click the top button)."
</parents>

<verification>
**verify.js is a floor, not the definition of done.** It automates the fast checks below; the
rest of this list must be verified manually by driving the game with `?dev=1` (auto-answer bot,
level jumps) and by looking at screenshots of every zone. Making verify.js print green while the
manual items are unproven is a failed build. Expected `game.html` size is roughly 0.5–1.5 MB
including the sprite pack; investigate anything over 3 MB (duplication) or under 300 KB
(missing features).

Done means all of these:
- `game.html` complete and valid; zero console errors; zero external requests.
- Sprite pack inlined (symbol `#p-cat` resolves); no platform emoji rendered as game art.
- First tap unlocks audio; narration speaks on every screen, chunked <10s; music ducks and
  recovers; playable start-to-finish by a non-reader; no stuck states.
- Engine rules observable in dev mode: level-up at streak 3, hint at 2 misses, reveal at 3 with no
  credit; sparkle reviews ~1 in 5 after mastery; level-down floor holds under 20 deliberate wrongs.
- Reload mid-game resumes (zone/activity/level, gems, stars intact, fresh question); corrupt save
  starts fresh without crashing; save schema carries `v`.
- All shipped features complete; no references to anything cut; cuts logged in DECISIONS.md.
- Both orientations OK; no scroll/bounce/pull-to-refresh; multi-touch mash-safe; grown-ups' gate
  requires reading; reset requires gate + hold.
- Eggs hatch at their milestones with naming; growth stages trigger (use dev
  simulate-session-boundary + bot); toy corners open from the map, issue no questions, award no
  gems; hide-and-seek baby is findable; treats grow babies only in the stable.
</verification>
