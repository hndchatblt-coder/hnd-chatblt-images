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

HUD buttons: 🔁 replays the sounds/word, 🔊/🔇 toggles sound.

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

Edit [`src/words.js`](./src/words.js) — each entry is a CVC word plus an emoji
used as the picture reward. They're grouped by vowel so you can focus on one
vowel family at a time. No image files needed.

## Project layout

```
unicorn-reading-game/
  index.html              app shell + start screen + HUD
  manifest.webmanifest    PWA metadata
  service-worker.js       offline caching
  src/
    main.js               three.js scene, blending logic, celebration
    words.js              CVC word list + TTS phoneme hints
    audio.js              recorded-audio-first audio manager (TTS fallback)
    style.css             HUD / start screen styles
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
