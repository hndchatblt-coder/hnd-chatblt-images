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

// The alphabet, for the "Learn the Letters" foundation mode: meet each sound
// and both letter shapes (A a). keyword+emoji give a friendly picture cue; the
// pure SOUND is taught by the audio (recorded voice, or TTS fallback). Emojis
// are chosen to be nameable by a 4-year-old, starting with the letter's sound.
export const ALPHABET = [
  { letter: 'a', keyword: 'apple',    emoji: '🍎' },
  { letter: 'b', keyword: 'ball',     emoji: '⚽' },
  { letter: 'c', keyword: 'cat',      emoji: '🐱' },
  { letter: 'd', keyword: 'dog',      emoji: '🐶' },
  { letter: 'e', keyword: 'egg',      emoji: '🥚' },
  { letter: 'f', keyword: 'fish',     emoji: '🐟' },
  { letter: 'g', keyword: 'goat',     emoji: '🐐' },
  { letter: 'h', keyword: 'hat',      emoji: '🎩' },
  { letter: 'i', keyword: 'insect',   emoji: '🐞' },
  { letter: 'j', keyword: 'juice',    emoji: '🧃' },
  { letter: 'k', keyword: 'key',      emoji: '🔑' },
  { letter: 'l', keyword: 'lion',     emoji: '🦁' },
  { letter: 'm', keyword: 'moon',     emoji: '🌙' },
  { letter: 'n', keyword: 'net',      emoji: '🥅' },
  { letter: 'o', keyword: 'orange',   emoji: '🍊' },
  { letter: 'p', keyword: 'pig',      emoji: '🐷' },
  { letter: 'q', keyword: 'queen',    emoji: '👑' },
  { letter: 'r', keyword: 'rainbow',  emoji: '🌈' },
  { letter: 's', keyword: 'sun',      emoji: '☀️' },
  { letter: 't', keyword: 'tiger',    emoji: '🐯' },
  { letter: 'u', keyword: 'umbrella', emoji: '☂️' },
  { letter: 'v', keyword: 'van',      emoji: '🚐' },
  { letter: 'w', keyword: 'web',      emoji: '🕸️' },
  { letter: 'x', keyword: 'box',      emoji: '📦' },
  { letter: 'y', keyword: 'yo-yo',    emoji: '🪀' },
  { letter: 'z', keyword: 'zebra',    emoji: '🦓' },
];

// ----------------------------------------------------------------------------
// Rewards & economy. Every record below carries a stable string ID — saved
// progress references these IDs (never array positions), so content can be
// added, reordered or retired later without ever disturbing a child's save.
// ----------------------------------------------------------------------------

export const GOAL_SIZE = 5; // words to complete a stage

// Coins earned per correct action (the "earn" side of the economy).
export const COIN_REWARDS = {
  word: 2,        // blended a word and picked the right picture
  letter: 1,      // correct answer in the letters match game
  sound: 1,       // met a brand-new letter sound in explore
  stageBonus: 10, // completed a whole stage
};

// Magical friends unlocked one-by-one as stages complete. Order = unlock order.
// The `id` is forever; the emoji is just today's artwork for it.
export const FRIENDS = [
  { id: 'friend.unicorn',   emoji: '🦄' },
  { id: 'friend.butterfly', emoji: '🦋' },
  { id: 'friend.bee',       emoji: '🐝' },
  { id: 'friend.ladybird',  emoji: '🐞' },
  { id: 'friend.fish',      emoji: '🐠' },
  { id: 'friend.turtle',    emoji: '🐢' },
  { id: 'friend.bunny',     emoji: '🐰' },
  { id: 'friend.cat',       emoji: '🐱' },
  { id: 'friend.puppy',     emoji: '🐶' },
  { id: 'friend.chick',     emoji: '🐥' },
  { id: 'friend.owl',       emoji: '🦉' },
  { id: 'friend.mushroom',  emoji: '🍄' },
  { id: 'friend.dolphin',   emoji: '🐬' },
  { id: 'friend.flamingo',  emoji: '🦩' },
  { id: 'friend.peacock',   emoji: '🦚' },
  { id: 'friend.penguin',   emoji: '🐧' },
  { id: 'friend.koala',     emoji: '🐨' },
  { id: 'friend.fox',       emoji: '🦊' },
  { id: 'friend.panda',     emoji: '🐼' },
  { id: 'friend.star',      emoji: '🌟' },
];
export const friendById = (id) => FRIENDS.find(f => f.id === id);

// Cosmetics sold in Rosie's shop, priced in coins. Tiered so a small treat is
// a session away and grand treasures take real saving. `slot` is where it sits
// on the buddy: 'head' or 'back'. Artwork lives in art.js (COSMETIC_ART).
export const COSMETICS = [
  { id: 'cos.flower', name: 'Flower crown',  price: 15,  slot: 'head' },
  { id: 'cos.bow',    name: 'Pink bow',      price: 20,  slot: 'head' },
  { id: 'cos.star',   name: 'Star clip',     price: 25,  slot: 'head' },
  { id: 'cos.wings',  name: 'Fairy wings',   price: 90,  slot: 'back' },
  { id: 'cos.crown',  name: 'Sparkle crown', price: 120, slot: 'head' },
  { id: 'cos.cape',   name: 'Rainbow cape',  price: 500, slot: 'back' },
];
export const cosmeticById = (id) => COSMETICS.find(c => c.id === id);

// Per-unicorn-type "personality" for spoken DIALOGUE only (greetings, praise,
// "want to play with me?") — never for phoneme/word playback, which must
// always sound the same regardless of who's on screen, so a child never hears
// a letter's sound change depending on which friend she's with. Reuses the
// single device TTS voice already chosen in settings; only pitch/rate vary,
// so no extra recorded content is needed per character. Keyed by the same ids
// as UNICORN_TYPES in art.js. Unlisted types fall back to the default voice.
export const VOICE_PROFILES = {
  'type.blossom':   { pitch: 1.15, rate: 1.0  },
  'type.starlight': { pitch: 1.3,  rate: 0.95 }, // dreamy, a little slower
  'type.frost':     { pitch: 1.05, rate: 0.9  }, // cool and calm
  'type.clover':    { pitch: 1.2,  rate: 1.05 },
  'type.sunbeam':   { pitch: 1.35, rate: 1.15 }, // bright and quick
  'type.berry':     { pitch: 1.25, rate: 1.0  },
  'type.coral':     { pitch: 1.15, rate: 1.05 },
  'type.dream':     { pitch: 1.1,  rate: 0.9  },
  'type.stardust':  { pitch: 1.4,  rate: 0.95 }, // airy and light
  'type.honey':     { pitch: 1.2,  rate: 0.95 },
  'type.rosie':     { pitch: 1.1,  rate: 1.0  },
};

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
