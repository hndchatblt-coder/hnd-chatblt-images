// CVC (consonant-vowel-consonant) words for blending practice.
//
// Each word has:
//   word   - the letters (lowercase). Tap them one at a time to hear each sound.
//   emoji  - the picture reward shown when the word is blended (no image files needed).
//   label  - spoken/displayed name (usually same as word).
//
// We deliberately use simple, picturable CVC words a 4-year-old can decode.
// Words are grouped by vowel so you can introduce one vowel family at a time.

export const WORDS = [
  // short 'a'
  { word: 'cat', emoji: '🐱' },
  { word: 'hat', emoji: '🎩' },
  { word: 'bat', emoji: '🦇' },
  { word: 'map', emoji: '🗺️' },
  { word: 'van', emoji: '🚐' },
  { word: 'jam', emoji: '🍓' },
  { word: 'bag', emoji: '🎒' },

  // short 'e'
  { word: 'bed', emoji: '🛏️' },
  { word: 'hen', emoji: '🐔' },
  { word: 'web', emoji: '🕸️' },
  { word: 'jet', emoji: '✈️' },
  { word: 'red', emoji: '🟥' },

  // short 'i'
  { word: 'pig', emoji: '🐷' },
  { word: 'pin', emoji: '📌' },
  { word: 'fin', emoji: '🐟' },
  { word: 'lip', emoji: '👄' },
  { word: 'six', emoji: '6️⃣' },
  { word: 'wig', emoji: '👱' },

  // short 'o'
  { word: 'dog', emoji: '🐶' },
  { word: 'fox', emoji: '🦊' },
  { word: 'box', emoji: '📦' },
  { word: 'log', emoji: '🪵' },
  { word: 'pot', emoji: '🍲' },
  { word: 'mop', emoji: '🧽' },

  // short 'u'
  { word: 'sun', emoji: '☀️' },
  { word: 'bus', emoji: '🚌' },
  { word: 'cup', emoji: '☕' },
  { word: 'bug', emoji: '🐛' },
  { word: 'mug', emoji: '🍺' },
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
