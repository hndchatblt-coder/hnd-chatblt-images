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
//
// Because the PICTURES are the win mechanic, every emoji must read as exactly
// its word to a 4-year-old (no "fin" shown as a whole fish, no "jet" that
// she'd call a plane) and no two pictures may be easily confused (no van+bus).

export const WORDS = [
  // short 'a'
  { word: 'cat', emoji: '🐱' },
  { word: 'hat', emoji: '🎩' },
  { word: 'bag', emoji: '🎒' },
  { word: 'ant', emoji: '🐜' },
  { word: 'rat', emoji: '🐀' },

  // short 'e'
  { word: 'hen', emoji: '🐔' },
  { word: 'bed', emoji: '🛏️' },
  { word: 'web', emoji: '🕸️' },
  { word: 'pen', emoji: '🖊️' },
  { word: 'leg', emoji: '🦵' },

  // short 'i'
  { word: 'pig', emoji: '🐷' },
  { word: 'pin', emoji: '📌' },
  { word: 'lip', emoji: '👄' },
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
  a: 'aaa', b: 'buh', c: 'kuh', d: 'duh', e: 'ehh', f: 'ffff',
  g: 'guh', h: 'huh', i: 'ihh', j: 'juh', k: 'kuh', l: 'llll',
  m: 'mmmm', n: 'nnnn', o: 'ohh', p: 'puh', q: 'kwuh', r: 'rrrr',
  s: 'ssss', t: 'tuh', u: 'uhh', v: 'vvvv', w: 'wuh', x: 'ks',
  y: 'yuh', z: 'zzzz',
};
