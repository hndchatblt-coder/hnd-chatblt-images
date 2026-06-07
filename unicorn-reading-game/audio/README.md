# Audio — recorded sounds

The game sounds **best** with real recorded audio. Until you add files here, it
automatically falls back to the phone's built-in text-to-speech voice, so it is
fully playable right now — but recorded sounds (especially your own voice!) make
a big difference for learning to blend.

## How it works

When the game needs a sound it first looks for a recording. If the file isn't
here, it speaks using the browser voice instead. So you can add files gradually
— even just the words your daughter is working on this week.

## Where files go

```
audio/
  phonemes/   ← the pure SOUND of a single letter
    a.mp3  b.mp3  c.mp3  ...  z.mp3
  words/      ← the whole word, said normally
    cat.mp3  dog.mp3  sun.mp3  ...
    cheer.mp3   ← (optional) a "yay! you did it!" praise clip
```

- File names are **lowercase**, matching the letter or word, ending in `.mp3`.
- Words come from `src/words.js` — record any of those you want.
- After adding files, list them in [`manifest.json`](./manifest.json) so the
  game knows to use them, e.g.
  `{ "phonemes": ["c","a","t"], "words": ["cat"], "cheer": false }`.
  (Prefer the no-fuss route? Delete `manifest.json` and the game will just
  auto-detect whatever files are present.)

## Recording tips (phonics matters here!)

The single most important thing: record the **sound**, not the letter **name**.

- ✅ `m` → "mmm"   ❌ "em"
- ✅ `s` → "sss"   ❌ "ess"
- ✅ `c` → "kuh" (short, no big "uh" tail)   ❌ "see"
- Stretch the letters that can be stretched (m, s, f, l, n, r, v, z, vowels).
- For "stop" sounds (b, c/k, d, g, p, t) keep them short and crisp.
- Record somewhere quiet, trim silence at the start/end, keep it warm and happy.

You can record on your phone's voice memo app, export, convert to `.mp3`, and
drop them in. Any tool that exports `.mp3` works.

## After adding or changing audio

Bump `CACHE_VERSION` in `../service-worker.js` (e.g. `v1` → `v2`) so installed
phones pick up the new files.
