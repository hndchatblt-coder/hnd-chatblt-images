// CVC (consonant-vowel-consonant) words for blending practice.
//
// Each word has:
//   word   - the letters (lowercase). Tap them one at a time to hear each sound.
//   emoji  - the picture reward shown when the word is blended (no image files).
//
// All of these are cleanly "sound-out-able": no silent letters, no tricky
// digraphs — each letter makes its own sound. They're grouped by vowel so you
// can introduce one vowel family at a time. ~25 words keeps plenty of variety
// for a young reader without repeating too soon.

export const WORDS = [
  // short 'a'
  { word: 'cat', emoji: '🐱' },
  { word: 'hat', emoji: '🎩' },
  { word: 'bag', emoji: '🎒' },
  { word: 'van', emoji: '🚐' },
  { word: 'map', emoji: '🗺️' },

  // short 'e'
  { word: 'hen', emoji: '🐔' },
  { word: 'bed', emoji: '🛏️' },
  { word: 'web', emoji: '🕸️' },
  { word: 'jet', emoji: '✈️' },
  { word: 'egg', emoji: '🥚' },

  // short 'i'
  { word: 'pig', emoji: '🐷' },
  { word: 'pin', emoji: '📌' },
  { word: 'fin', emoji: '🐟' },
  { word: 'six', emoji: '6️⃣' },
  { word: 'bin', emoji: '🗑️' },

  // short 'o'
  { word: 'dog', emoji: '🐶' },
  { word: 'fox', emoji: '🦊' },
  { word: 'box', emoji: '📦' },
  { word: 'pot', emoji: '🍲' },
  { word: 'log', emoji: '🪵' },

  // short 'u'
  { word: 'bug', emoji: '🐛' },
  { word: 'sun', emoji: '☀️' },
  { word: 'bus', emoji: '🚌' },
  { word: 'cup', emoji: '☕' },
  { word: 'nut', emoji: '🥜' },
];

// Friendly, kid-pronounceable name for each letter sound, used ONLY as the
// text-to-speech fallback when a recorded phoneme file is missing. These nudge
// the browser voice toward the pure SOUND ("mmm") rather than the letter NAME
// ("em"). Recorded audio (see /audio) always sounds better and takes priority.
export const PHONEME_HINTS = {
  a: 'aah', b: 'buh', c: 'kuh', d: 'duh', e: 'eh', f: 'fff',
  g: 'guh', h: 'huh', i: 'ih', j: 'juh', k: 'kuh', l: 'lll',
  m: 'mmm', n: 'nnn', o: 'oh', p: 'puh', q: 'kwuh', r: 'rrr',
  s: 'sss', t: 'tuh', u: 'uh', v: 'vvv', w: 'wuh', x: 'ks',
  y: 'yuh', z: 'zzz',
};
