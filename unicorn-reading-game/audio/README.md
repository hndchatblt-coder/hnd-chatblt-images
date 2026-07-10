# Audio — the shipped default sounds

These are the sounds **every install gets out of the box**, before any parent
records anything on their own device. Until these are filled in, the game
falls back to the phone's built-in text-to-speech voice, so it's fully
playable right now — but bundled recordings are what make the phonics
actually correct (and identical) for every family from the very first launch.

A parent's own in-app recording (via the 🎙️ studio / guided flow, saved on
their device) always wins over these when present — this folder is just the
shared default underneath that.

## How it works

Playback order for every letter sound and word: **1)** this device's own
recording (if the parent made one) → **2)** the bundled file here → **3)**
text-to-speech. So filling this folder in raises the floor for every family,
without touching anyone's personal recordings.

## The easiest way to fill it in

You don't need to hand-produce audio files yourself — reuse the recording
studio that's already built into the app:

1. Open the app → ⚙️ (long-press) → **✨ Guided recording** and record all 26
   letter sounds (and any words you like) in one sitting.
2. Tap **⬇️ Backup** to export everything as one file.
3. Send that backup file over — it gets decoded and baked into this folder
   (in whatever format your browser actually recorded, e.g. `.webm`) plus a
   filled-in `manifest.json`, and committed so every install ships with it.

No manual audio conversion needed — whatever format the phone recorded in is
what ships.

## Where files end up

```
audio/
  phonemes/   ← the pure SOUND of a single letter
    a.webm  b.webm  c.webm  ...  z.webm   (extension depends on what was recorded)
  words/      ← the whole word, said normally
    cat.webm  dog.webm  sun.webm  ...
    cheer.webm   ← (optional) a "yay! you did it!" praise clip
```

`manifest.json` lists which letters/words have a bundled file and the shared
file extension, e.g. `{ "ext": "webm", "phonemes": ["c","a","t"], "words":
["cat"], "cheer": false }`. (Deleting `manifest.json` makes the game
auto-detect `.mp3` files on demand instead — handy if you ever hand-supply
real `.mp3`s from elsewhere.)

## Recording tips (phonics matters here!)

The single most important thing: record the **sound**, not the letter **name**.

- ✅ `m` → "mmm"   ❌ "em"
- ✅ `s` → "sss"   ❌ "ess"
- ✅ `c` → "kuh" (short, no big "uh" tail)   ❌ "see"
- Stretch the letters that can be stretched (m, s, f, l, n, r, v, z, vowels).
- For "stop" sounds (b, c/k, d, g, p, t) keep them short and crisp.
- Record somewhere quiet, trim silence at the start/end, keep it warm and happy.

## After adding or changing audio

Bump `CACHE_VERSION` in `../service-worker.js` so installed phones pick up the
new files.
