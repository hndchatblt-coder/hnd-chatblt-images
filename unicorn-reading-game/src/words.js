// The reading journey: a sequence of STAGES the child works through.
//
// Pedagogy (synthetic phonics): practise ONE short-vowel family at a time until
// blending it is comfortable, then move on to the next. Every word is cleanly
// "sound-out-able" — no silent letters, no digraphs — each letter makes its own
// sound. Because the PICTURES are how she wins, every emoji must read as exactly
// its word to a 4-year-old, and no two pictures in a stage may be confusable.
//
// Each stage:
//   id     - stable key (used in saved progress)
//   label  - kid-friendly name shown on the map and goal banner
//   focus  - the teaching focus (for a grown-up)
//   token  - the collectible shown while playing this stage (visual variety)
//   cheer  - said/shown when the stage is completed
//   words  - { word, emoji } list to blend
//
// Everything is free to play — stages simply unlock in order so the journey
// feels like an adventure, and she can revisit any family she's reached.

export const STAGES = [
  {
    id: 'a', label: "The 'a' family", focus: 'Short a', token: '⭐',
    cheer: 'You read all the a-words!',
    words: [
      { word: 'cat', emoji: '🐱' },
      { word: 'hat', emoji: '🎩' },
      { word: 'bag', emoji: '🎒' },
      { word: 'ant', emoji: '🐜' },
      { word: 'rat', emoji: '🐀' },
      { word: 'pan', emoji: '🍳' },
    ],
  },
  {
    id: 'e', label: "The 'e' family", focus: 'Short e', token: '🌷',
    cheer: 'Your e-garden bloomed!',
    words: [
      { word: 'hen', emoji: '🐔' },
      { word: 'bed', emoji: '🛏️' },
      { word: 'web', emoji: '🕸️' },
      { word: 'pen', emoji: '🖊️' },
      { word: 'leg', emoji: '🦵' },
      { word: 'net', emoji: '🥅' },
    ],
  },
  {
    id: 'i', label: "The 'i' family", focus: 'Short i', token: '🧁',
    cheer: 'Yummy — i-picnic time!',
    words: [
      { word: 'pig', emoji: '🐷' },
      { word: 'pin', emoji: '📌' },
      { word: 'lip', emoji: '👄' },
      { word: 'six', emoji: '6️⃣' },
      { word: 'bin', emoji: '🗑️' },
    ],
  },
  {
    id: 'o', label: "The 'o' family", focus: 'Short o', token: '💎',
    cheer: 'You found the o-treasure!',
    words: [
      { word: 'dog', emoji: '🐶' },
      { word: 'fox', emoji: '🦊' },
      { word: 'box', emoji: '📦' },
      { word: 'pot', emoji: '🍲' },
      { word: 'log', emoji: '🪵' },
    ],
  },
  {
    id: 'u', label: "The 'u' family", focus: 'Short u', token: '🎈',
    cheer: 'Up, up and away with u!',
    words: [
      { word: 'bug', emoji: '🐛' },
      { word: 'sun', emoji: '☀️' },
      { word: 'bus', emoji: '🚌' },
      { word: 'cup', emoji: '☕' },
      { word: 'nut', emoji: '🥜' },
    ],
  },
  {
    id: 'mix', label: 'Reading star', focus: 'Mixed review', token: '💖',
    cheer: "You're a reading star!",
    words: [
      { word: 'cat', emoji: '🐱' },
      { word: 'hen', emoji: '🐔' },
      { word: 'pig', emoji: '🐷' },
      { word: 'dog', emoji: '🐶' },
      { word: 'sun', emoji: '☀️' },
      { word: 'box', emoji: '📦' },
    ],
  },
];

// Flat list of every word across all stages (used by the recording studio and
// as a pool for picture distractors). De-duplicated by word.
export const WORDS = (() => {
  const seen = new Set();
  const all = [];
  for (const s of STAGES) {
    for (const w of s.words) {
      if (seen.has(w.word)) continue;
      seen.add(w.word);
      all.push(w);
    }
  }
  return all;
})();

// Friendly, kid-pronounceable name for each letter sound, used ONLY as the
// text-to-speech fallback when a recorded phoneme file is missing. These nudge
// the browser voice toward the pure SOUND ("mmm") rather than the letter NAME
// ("em"). Recorded audio (see the studio) always sounds better and takes priority.
export const PHONEME_HINTS = {
  a: 'aaa', b: 'buh', c: 'kuh', d: 'duh', e: 'ehh', f: 'ffff',
  g: 'guh', h: 'huh', i: 'ihh', j: 'juh', k: 'kuh', l: 'llll',
  m: 'mmmm', n: 'nnnn', o: 'ohh', p: 'puh', q: 'kwuh', r: 'rrrr',
  s: 'ssss', t: 'tuh', u: 'uhh', v: 'vvvv', w: 'wuh', x: 'ks',
  y: 'yuh', z: 'zzzz',
};
