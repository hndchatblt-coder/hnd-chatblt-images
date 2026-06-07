# 🦄 Unicorn Reading

A magical little phone game that helps a young child take the step from
*sounding out single letters* to **blending those sounds into words**.

Each round shows a short word (like `cat`) as colourful letter cards. The child
taps the cards left-to-right, hearing each sound, then the cards slide together,
the whole word is spoken, and a unicorn celebrates with the matching picture and
a shower of sparkles. A star is earned for every word.

Built with [three.js](https://threejs.org) (vendored locally) as an installable
**PWA** — add it to the home screen and it runs full-screen and offline.

## Play it

It uses ES modules and a service worker, so it must be served over `http(s)`
(not opened as a `file://`). From this folder:

```bash
# any static server works, e.g.:
npx serve .
# or
python3 -m http.server 8080
```

Then open the URL on your computer, or — to play on the phone — host the folder
(see "Hosting" below) and open it on the phone, then **Add to Home Screen**.

## How a round works

1. The next letter card glows. Tap it → hear its **sound** (e.g. `c` → "kuh").
2. Tap the rest in order. (Tapping the wrong one just nudges the glowing card.)
3. After the last letter, the cards slide together and the **whole word** plays.
4. 🦄 jumps, sparkles burst, the picture pops up, and you earn a ⭐.
5. Tap anywhere (or the → button) for the next word.

HUD buttons: 🎒 opens the friends collection, 🔁 replays the sounds/word,
🔊/🔇 toggles sound.

## Rewards (built to keep a 4-year-old coming back)

Reading words is rewarded on three timescales so there's always something to
look forward to:

- **Every word** → a ⭐ (the total is saved and grows over days) plus a token
  that flies up into the quest tray, with a little chime.
- **Every quest** → finishing a quest of 5 words triggers a fanfare, a shower of
  themed confetti, and **unlocks a new magical friend** for the collection
  (🦄🦋🐝🐠 …). Quests rotate through a few **variations of the goal** —
  *Catch the stars*, *Grow the garden*, *Unicorn picnic*, *Find the treasure*,
  *Fill the sky*, *Spread the love* — so each mission feels new.
- **Over time** → the 🎒 **collection** of magical friends fills up (locked
  silhouettes show what's still to discover).

All progress (stars, friends, current quest) is saved on the device, so it's
still there next time. Quests and friends live in
[`src/quests.js`](./src/quests.js); progress storage is in
[`src/progress.js`](./src/progress.js).

## Sound

Decided approach: **recorded phoneme audio** for the best phonics experience,
with a **text-to-speech fallback** so it works before any recordings exist.

- Drop recordings into [`audio/`](./audio/README.md) — pure letter sounds in
  `audio/phonemes/` and whole words in `audio/words/`.
- Recording your own voice is lovely here. See
  [`audio/README.md`](./audio/README.md) for the naming convention and phonics
  recording tips (record the **sound** "mmm", not the letter **name** "em").
- Until a file exists, the phone's built-in voice is used automatically.

## Changing the words

Edit [`src/words.js`](./src/words.js) — a curated set of ~25 cleanly
sound-out-able CVC words, each with an emoji used as the picture reward. They're
grouped by vowel (five per vowel) so you can focus on one vowel family at a time.
No image files needed.

## Project layout

```
unicorn-reading-game/
  index.html              app shell + start screen + HUD
  manifest.webmanifest    PWA metadata
  service-worker.js       offline caching
  src/
    main.js               three.js scene, blending logic, celebration
    words.js              CVC word list + TTS phoneme hints
    quests.js             quest variations + collectible friends
    progress.js           saves stars/friends/quest to localStorage
    audio.js              recorded-audio-first audio manager (TTS fallback)
    style.css             HUD / start screen / quest / collection styles
  vendor/three.module.js  three.js (local, for offline)
  icons/                  PWA icons (generated from icon.svg)
  audio/                  your recordings go here (see its README)
```

## Hosting (so it installs on the phone)

Any static host works (the game is just files). Easy options:

- **GitHub Pages** — serve this folder; open the URL on the phone → Add to Home
  Screen.
- **Netlify / Vercel / Cloudflare Pages** — drag-and-drop or connect the repo,
  set the publish directory to `unicorn-reading-game`.

A PWA needs `https` to install (GitHub Pages and the above all provide it).
