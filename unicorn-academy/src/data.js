/* ================= Unicorn Academy — data tables =================
   Everything the engine walks lives here. UA is the single global namespace. */
'use strict';
window.UA = window.UA || {};

/* ---------- utilities used by data gens ---------- */
UA.rand = (n) => Math.floor(Math.random() * n);
UA.pick = (arr) => arr[UA.rand(arr.length)];
UA.shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = UA.rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// pick avoiding the immediately previous choice (per-key memory)
UA._lastPick = {};
UA.pickFresh = (key, arr) => {
  if (arr.length < 2) return arr[0];
  let v; do { v = UA.pick(arr); } while (v === UA._lastPick[key]);
  UA._lastPick[key] = v; return v;
};

/* ---------- palette ---------- */
UA.PALETTE = {
  plum: '#5C4A66', cream: '#FFF9F5',
  pinks: ['#FFD6E8', '#FF9EC7', '#FF7FB2'],
  bodies: ['#FFD6E8', '#E9DDFF', '#D3ECFF', '#D2F5DC', '#FFF3C4', '#FFE0CC'],
  bodyNames: ['pink', 'purple', 'blue', 'green', 'yellow', 'peach'],
  manes: ['#FF7FB2', '#9A7BE8', '#4FA3E0', '#4CBB74', '#F5B940', '#F08A4B'],
  maneNames: ['rose', 'violet', 'ocean', 'clover', 'gold', 'sunset'],
  rainbow: ['#FF9EC7', '#FFB37A', '#FFD97A', '#9DE0B0', '#8FD0FF', '#B79CFF'],
};

/* ---------- zones ---------- */
UA.ZONES = [
  { id: 'letter-meadow', name: 'Letter Meadow', stages: ['R1', 'R2', 'R3'], key: 0,
    col: '#9DE0B0', col2: '#D2F5DC', icon: 'meadow', x: 22, y: 62,
    hello: 'Welcome to Letter Meadow! Letters live in the flowers here!' },
  { id: 'number-mountain', name: 'Number Mountain', stages: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'], key: 4,
    col: '#8FD0FF', col2: '#D3ECFF', icon: 'mountain', x: 50, y: 34,
    hello: 'Welcome to Number Mountain! Let us count to the top!' },
  { id: 'memory-clouds', name: 'Memory Clouds', stages: ['P1', 'P4', 'PK'], key: 7,
    col: '#B79CFF', col2: '#E9DDFF', icon: 'cloud', x: 78, y: 24,
    hello: 'Welcome to Memory Clouds! The clouds love to play peek-a-boo!' },
  { id: 'word-garden', name: 'Word Garden', stages: ['R4', 'R5', 'R6', 'R7', 'R8'], key: 5,
    col: '#FF9EC7', col2: '#FFD6E8', icon: 'garden', x: 30, y: 30,
    hello: 'Welcome to Word Garden! Sounds grow into words here!',
    lock: (S) => UA.zoneStars(S, 'letter-meadow') >= 3,
    lockSay: 'Word Garden opens when you earn three stars in Letter Meadow! You can do it!' },
  { id: 'puzzle-falls', name: 'Puzzle Falls', stages: ['P2', 'P3', 'P5', 'P6'], key: 9,
    col: '#7FD8D0', col2: '#D3F4F1', icon: 'falls', x: 72, y: 66,
    lock: (S) => UA.totalStars(S) >= 3,
    lockSay: 'Puzzle Falls opens when you earn three stars anywhere! Nearly there!',
    hello: 'Welcome to Puzzle Falls! Splishy sploshy puzzles!' },
  { id: 'crystal-castle', name: 'Crystal Castle', stages: ['CC'], key: 2,
    col: '#FFD97A', col2: '#FFF3C4', icon: 'castle', x: 55, y: 12,
    lock: (S) => UA.totalStars(S) >= 12 && UA.ZONES.filter(z => z.id !== 'crystal-castle')
      .every(z => UA.zoneStars(S, z.id) >= 2),
    lockSay: 'The Crystal Castle opens when you earn twelve stars, with two in every land! Keep going, hero!',
    hello: 'The Crystal Castle! Royal challenges await, your highness!' },
];
UA.zoneById = (id) => UA.ZONES.find(z => z.id === id);

/* ---------- letters & phonics ---------- */
UA.SATPIN = ['s', 'a', 't', 'p', 'i', 'n', 'm', 'd', 'g', 'o', 'c', 'k', 'e', 'u', 'r', 'h', 'b', 'f', 'l', 'j', 'v', 'w', 'x', 'y', 'z', 'q'];
UA.ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

/* Phoneme table — TTS-pronounceable approximations. NEVER letter names, never IPA.
   say: what TTS speaks for the letter SOUND; anchor: word-anchored phrasing fallback;
   stretch: blending form. */
UA.PHON = {
  a: { say: 'ah', anchor: 'apple', stretch: 'aaa' }, b: { say: 'buh', anchor: 'ball', stretch: 'b' },
  c: { say: 'kuh', anchor: 'cat', stretch: 'k' }, d: { say: 'duh', anchor: 'dog', stretch: 'd' },
  e: { say: 'eh', anchor: 'egg', stretch: 'eee' }, f: { say: 'fff', anchor: 'fish', stretch: 'fff' },
  g: { say: 'guh', anchor: 'gift', stretch: 'g' }, h: { say: 'huh', anchor: 'hat', stretch: 'h' },
  i: { say: 'ih', anchor: 'insect', stretch: 'iii' }, j: { say: 'juh', anchor: 'jam', stretch: 'j' },
  k: { say: 'kuh', anchor: 'kite', stretch: 'k' }, l: { say: 'lll', anchor: 'log', stretch: 'lll' },
  m: { say: 'mmm', anchor: 'moon', stretch: 'mmm' }, n: { say: 'nnn', anchor: 'nest', stretch: 'nnn' },
  o: { say: 'oh o', anchor: 'orange', stretch: 'ooo' }, p: { say: 'puh', anchor: 'pig', stretch: 'p' },
  q: { say: 'kwuh', anchor: 'queen', stretch: 'kw' }, r: { say: 'rrr', anchor: 'rabbit', stretch: 'rrr' },
  s: { say: 'sss', anchor: 'sun', stretch: 'sss' }, t: { say: 'tuh', anchor: 'turtle', stretch: 't' },
  u: { say: 'uh', anchor: 'umbrella', stretch: 'uuu' }, v: { say: 'vvv', anchor: 'van', stretch: 'vvv' },
  w: { say: 'wuh', anchor: 'watermelon', stretch: 'w' }, x: { say: 'ks', anchor: 'box, at the end', stretch: 'ks' },
  y: { say: 'yuh', anchor: 'yellow', stretch: 'y' }, z: { say: 'zzz', anchor: 'zip', stretch: 'zzz' },
  sh: { say: 'shh', anchor: 'ship', stretch: 'shhh' }, ch: { say: 'chuh', anchor: 'chick', stretch: 'ch' },
  th: { say: 'thh', anchor: 'bath', stretch: 'thh' }, ck: { say: 'kuh', anchor: 'duck, at the end', stretch: 'k' },
};
UA.soundOf = (ch) => UA.PHON[ch] || { say: ch, anchor: ch, stretch: ch };

/* CVC bank — every word pictured from the pack. cont = starts with a continuant
   (safe early blending); vowel groups drive R4/R5 levels. */
UA.CVC = [
  { w: 'sun', cont: true }, { w: 'log', cont: true }, { w: 'van', cont: true }, { w: 'web', cont: true },
  { w: 'cat' }, { w: 'hat' }, { w: 'bat' }, { w: 'cap' }, { w: 'dog' }, { w: 'pig' },
  { w: 'bus' }, { w: 'hen' }, { w: 'bug' }, { w: 'cup' }, { w: 'pen' }, { w: 'bed' },
];
UA.DIGRAPH_WORDS = [
  { w: 'fish', d: 'sh' }, { w: 'ship', d: 'sh' }, { w: 'shell', d: 'sh' }, { w: 'chick', d: 'ch' },
  { w: 'duck', d: 'ck' }, { w: 'bath', d: 'th' }, { w: 'chips', d: 'ch' }, { w: 'sock', d: 'ck' },
];
UA.HFW_TRICKY = ['the', 'I', 'to', 'my', 'go', 'said', 'was', 'you', 'of'];
UA.HFW_DECODE = ['it', 'in', 'at', 'is', 'can', 'and', 'up', 'we'];

/* R8 rebus sentences: 3 tokens, middle token is a pack sprite. */
UA.SENTENCES = [
  { t: ['The', ['cat'], 'sat.'], say: 'The cat sat.' },
  { t: ['The', ['dog'], 'ran.'], say: 'The dog ran.' },
  { t: ['The', ['pig'], 'sat.'], say: 'The pig sat.' },
  { t: ['The', ['hen'], 'ran.'], say: 'The hen ran.' },
  { t: ['I', 'see', ['a', 'bus']], say: 'I see a bus.' },
  { t: ['I', 'see', ['a', 'star']], say: 'I see a star.' },
  { t: ['The', ['sun'], 'is up.'], say: 'The sun is up.' },
  { t: ['My', ['hat'], 'is big.'], say: 'My hat is big.' },
  { t: ['The', ['duck'], 'can go.'], say: 'The duck can go.' },
  { t: ['The', ['bug'], 'is in.'], say: 'The bug is in.' },
];

/* Beginning-sounds pool for R3: word -> sprite exists, first sound distinct. */
UA.FIRST_SOUND_POOL = [
  'sun', 'cat', 'dog', 'moon', 'pig', 'hat', 'bus', 'log', 'van', 'web', 'key', 'bed',
  'fox', 'box', 'milk', 'lion', 'duck', 'tree', 'star', 'frog', 'bee', 'cow', 'owl', 'kite',
  'ball', 'boat', 'car', 'gift', 'drum', 'egg', 'fish', 'monkey', 'rabbit', 'turtle', 'banana',
];

/* Counting / sorting object sprites (bright, nameable). */
UA.COUNT_SPRITES = ['apple', 'strawberry', 'star', 'flower', 'balloon', 'butterfly', 'cupcake', 'egg', 'gift', 'ball'];

/* ---------- shapes (P1) — Tier 1 bespoke ---------- */
UA.SHAPES = ['circle', 'square', 'triangle', 'star', 'rectangle', 'heart'];

/* ---------- praise (growth mindset; "smart/clever/genius" banned game-wide) ---------- */
UA.PRAISE = [
  'You worked that out, %NAME%!', 'You kept trying and you got it!', 'Wow %NAME%, you found it!',
  'You listened so carefully!', 'That was tricky, and you did it!', 'Look at you go, %NAME%!',
  'You never gave up!', 'What careful eyes, %NAME%!', 'Super sounding out!',
  'That took real thinking!', 'You did it all by yourself!', 'Hooray, %NAME%! You tried and tried!',
  'Beautiful work, %NAME%!', 'You looked so closely!', 'Your practising is working!',
  'Yes! You figured it out!', 'Great trying, %NAME%!', 'You are getting stronger at this!',
];
UA.TRY_AGAIN = ['Almost! Try again!', 'Ooh, so close! Have another go!', 'Not that one — you can find it!', 'Keep looking, %NAME%!'];
UA.REVEAL_LINES = ['Here it is! Let’s do it together!', 'This one! Let’s look at it together!', 'Here! We found it together!'];

/* ---------- unicorn & baby names (spoken tappable list) ---------- */
UA.UNI_NAMES = ['Sparkle', 'Rosie', 'Star', 'Moonbeam', 'Petal', 'Twinkle'];
UA.BABY_QUIRKS = ['sleepy', 'chaser', 'sneezy', 'bouncy', 'singer', 'spinner'];

/* ---------- story frames: %Q is the core question line ---------- */
UA.FRAMES = {
  'letter-meadow': [
    'The flowers are hiding letters! %Q',
    'A little bee needs help! %Q',
    'The meadow butterflies are playing a game! %Q',
    'Ooh, the tall grass is whispering! %Q',
  ],
  R1: [
    'The flower fairies painted letters! %Q',
    'A ladybird landed on a letter! %Q',
    'The letters are playing hide and seek! %Q',
  ],
  R2: [
    'Listen! A flower is singing a sound! %Q',
    'The wind is whooshing a letter sound! %Q',
    'A baby bird is practising a sound! %Q',
  ],
  R3: [
    'The picnic basket spilled! %Q',
    'The babies are so hungry! %Q',
    'The meadow shop needs sorting! %Q',
  ],
  'number-mountain': [
    'The mountain goats need help! %Q',
    'We are climbing higher! %Q',
    'The snow sprites are counting! %Q',
  ],
  M2: [
    'The bridge needs planks — count them on! %Q',
    'The picnic needs treats! %Q',
    'The baby goats are lining up! %Q',
  ],
  M7: [
    'More friends came to the party! %Q',
    'The basket got fuller! %Q',
    'Snack time on the mountain! %Q',
  ],
  M8: [
    'Some bunnies hopped away! %Q',
    'Whoosh! Some flew off! %Q',
    'Munch munch — some got eaten! %Q',
  ],
  'memory-clouds': [
    'The clouds are playing peek-a-boo! %Q',
    'Shhh — the sky is hiding things! %Q',
    'The stars tucked themselves in! %Q',
  ],
  'word-garden': [
    'A word seed is sprouting! %Q',
    'The garden gnome mixed up his labels! %Q',
    'The talking rose has a riddle! %Q',
  ],
  'puzzle-falls': [
    'The waterfall splashed the puzzle apart! %Q',
    'The river fish love this game! %Q',
    'Drip drop — a puzzle appeared! %Q',
  ],
  'crystal-castle': [
    'A royal challenge, %NAME% the hero! %Q',
    'The crystal throne is glowing! %Q',
    'The kingdom is watching, champion! %Q',
  ],
};
UA.frameFor = (stageId, zoneId) => {
  const pool = (UA.FRAMES[stageId] || []).concat(UA.FRAMES[zoneId] || []);
  return pool.length ? UA.pickFresh('frame-' + stageId, pool) : '%Q';
};

/* ---------- boutique (~30 items, 3 tiers) + treats + seeds ----------
   anchor: head | neck | back | tail | horn | feet. Art in art.js COSMETICS. */
UA.BOUTIQUE = [
  // starter 5–15
  { id: 'bow-pink', name: 'Pink Bow', tier: 0, price: 5, anchor: 'head' },
  { id: 'flower-clip', name: 'Flower Clip', tier: 0, price: 6, anchor: 'head' },
  { id: 'bell-collar', name: 'Jingle Bell', tier: 0, price: 8, anchor: 'neck' },
  { id: 'scarf-mint', name: 'Minty Scarf', tier: 0, price: 9, anchor: 'neck' },
  { id: 'tail-ribbon', name: 'Tail Ribbon', tier: 0, price: 7, anchor: 'tail' },
  { id: 'sun-hat', name: 'Sunny Hat', tier: 0, price: 12, anchor: 'head' },
  { id: 'daisy-chain', name: 'Daisy Chain', tier: 0, price: 10, anchor: 'neck' },
  { id: 'socks-spotty', name: 'Spotty Socks', tier: 0, price: 14, anchor: 'feet' },
  { id: 'star-clip', name: 'Star Clip', tier: 0, price: 11, anchor: 'head' },
  { id: 'heart-charm', name: 'Heart Charm', tier: 0, price: 15, anchor: 'neck' },
  // fancy 20–40 (unlocks with Word Garden or Puzzle Falls)
  { id: 'flower-crown', name: 'Flower Crown', tier: 1, price: 20, anchor: 'head' },
  { id: 'fairy-wings', name: 'Fairy Wings', tier: 1, price: 32, anchor: 'back' },
  { id: 'rainbow-scarf', name: 'Rainbow Scarf', tier: 1, price: 26, anchor: 'neck' },
  { id: 'party-hat', name: 'Party Hat', tier: 1, price: 22, anchor: 'head' },
  { id: 'saddle-plush', name: 'Plush Saddle', tier: 1, price: 30, anchor: 'back' },
  { id: 'horn-star', name: 'Star Horn Tip', tier: 1, price: 24, anchor: 'horn' },
  { id: 'cape-sky', name: 'Sky Cape', tier: 1, price: 36, anchor: 'back' },
  { id: 'pearl-necklace', name: 'Pearl Necklace', tier: 1, price: 28, anchor: 'neck' },
  { id: 'butterfly-bow', name: 'Butterfly Bow', tier: 1, price: 34, anchor: 'head' },
  { id: 'socks-rainbow', name: 'Rainbow Socks', tier: 1, price: 40, anchor: 'feet' },
  // royal 50–80 (unlocks with Crystal Castle progress)
  { id: 'crown-gold', name: 'Golden Crown', tier: 2, price: 60, anchor: 'head' },
  { id: 'crown-crystal', name: 'Crystal Tiara', tier: 2, price: 55, anchor: 'head' },
  { id: 'wings-gold', name: 'Golden Wings', tier: 2, price: 70, anchor: 'back' },
  { id: 'cape-royal', name: 'Royal Cape', tier: 2, price: 65, anchor: 'back' },
  { id: 'horn-rainbow', name: 'Rainbow Horn Swirl', tier: 2, price: 58, anchor: 'horn' },
  { id: 'gem-necklace', name: 'Gem Necklace', tier: 2, price: 52, anchor: 'neck' },
  { id: 'moon-crown', name: 'Moon Crown', tier: 2, price: 68, anchor: 'head' },
  { id: 'sparkle-saddle', name: 'Sparkle Saddle', tier: 2, price: 75, anchor: 'back' },
  { id: 'star-cape', name: 'Starry Cape', tier: 2, price: 80, anchor: 'back' },
  { id: 'bells-royal', name: 'Royal Bells', tier: 2, price: 50, anchor: 'neck' },
  // rainbow-gem tier (Rainbow Royale endgame currency)
  { id: 'aurora-mane', name: 'Aurora Shimmer', tier: 3, price: 3, anchor: 'back', royale: true },
  { id: 'comet-trail', name: 'Comet Trail', tier: 3, price: 4, anchor: 'tail', royale: true },
  { id: 'champion-crown', name: 'Champion Crown', tier: 3, price: 6, anchor: 'head', royale: true },
];
UA.TREATS = [
  { id: 'strawberry', name: 'Strawberry', price: 3 }, { id: 'cupcake', name: 'Cupcake', price: 4 },
  { id: 'apple', name: 'Apple', price: 3 }, { id: 'icecream', name: 'Ice Cream', price: 5 },
  { id: 'watermelon', name: 'Watermelon', price: 4 }, { id: 'carrot', name: 'Carrot', price: 3 },
];
UA.SEED_PRICE = 10;

/* ---------- eggs: awarded at total-star milestones ---------- */
UA.EGG_MILESTONES = [6, 15, 27, 40, 54, 69];
UA.BABY_BODIES = ['#FFE0CC', '#D2F5DC', '#D3ECFF', '#FFF3C4', '#E9DDFF', '#FFD6E8'];
UA.BABY_MANES = ['#F08A4B', '#4CBB74', '#4FA3E0', '#F5B940', '#9A7BE8', '#FF7FB2'];

/* ---------- surprise events (rare, unfarmable) ---------- */
UA.SURPRISES = ['shooting-star', 'glitter-sneeze', 'bunny-peek', 'butterfly-horn', 'heart-cloud'];

/* ---------- silly event days ---------- */
UA.SILLY_DAYS = ['sock-day', 'upside-down-day', 'echo-day'];

/* ---------- jokes for the comedy reel ---------- */
UA.JOKES = [
  'What does a cow say? MOO! What does a unicorn say? ... SPARKLE!',
  'Why did the banana go to the doctor? It was not peeling well!',
  'What do you call a unicorn with no horn? ... A pony! Hee hee!',
  'Knock knock! Who is there? Moo. Moo who? No silly, cows go moo, owls go who!',
];

/* ---------- adult gate codes ---------- */
UA.GATE_DIGITS = () => { const d = []; while (d.length < 3) { const n = 1 + UA.rand(9); if (!d.includes(n)) d.push(n); } return d; };
