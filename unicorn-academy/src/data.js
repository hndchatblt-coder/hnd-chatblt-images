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
  { t: ['The', ['fox'], 'ran.'], say: 'The fox ran.' },
  { t: ['The', ['owl'], 'sat.'], say: 'The owl sat.' },
  { t: ['I', 'see', ['a', 'kite']], say: 'I see a kite.' },
  { t: ['I', 'see', ['a', 'ball']], say: 'I see a ball.' },
  { t: ['My', ['cup'], 'is red.'], say: 'My cup is red.' },
  { t: ['My', ['van'], 'is big.'], say: 'My van is big.' },
  { t: ['The', ['cow'], 'is up.'], say: 'The cow is up.' },
  { t: ['The', ['bee'], 'can go.'], say: 'The bee can go.' },
  { t: ['The', ['frog'], 'hid.'], say: 'The frog hid.' },
  { t: ['We', 'see', ['a', 'boat']], say: 'We see a boat.' },
  { t: ['We', 'see', ['a', 'train']], say: 'We see a train.' },
  { t: ['The', ['mouse'], 'ran.'], say: 'The mouse ran.' },
  { t: ['The', ['bird'], 'is in.'], say: 'The bird is in.' },
  { t: ['The', ['bear'], 'sat.'], say: 'The bear sat.' },
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

/* ---------- praise (growth mindset; ability-labelling words are banned game-wide) ---------- */
UA.PRAISE = [
  'You worked that out, %NAME%!', 'You kept trying and you got it!', 'Wow %NAME%, you found it!',
  'You listened so carefully!', 'That was tricky, and you did it!', 'Look at you go, %NAME%!',
  'You never gave up!', 'What careful eyes, %NAME%!', 'Super sounding out!',
  'That took real thinking!', 'You did it all by yourself!', 'Hooray, %NAME%! You tried and tried!',
  'Beautiful work, %NAME%!', 'You looked so closely!', 'Your practising is working!',
  'Yes! You figured it out!', 'Great trying, %NAME%!', 'You are getting stronger at this!',
  'You tried a new way, %NAME%!', 'You stuck with it, %NAME%, and got there!',
  'Great strategy, %NAME%!', 'You did not give up, %NAME%!',
  'Your hard work paid off!', 'Well tried, %NAME%! You got there!',
];
UA.TRY_AGAIN = [
  'Almost! Try again!', 'Ooh, so close! Have another go!', 'Not that one — you can find it!', 'Keep looking, %NAME%!',
  'Oopsie! Give it another try!', 'So close! Have another peek!', 'Not quite — try once more!', 'Nearly! You can find it, %NAME%!',
];
UA.REVEAL_LINES = [
  'Here it is! Let’s do it together!', 'This one! Let’s look at it together!', 'Here! We found it together!',
  'Look, here it is! We found it together!', 'This is the one! Let’s try it together!', 'Here it is, safe and sound! Together now!',
];

/* ---------- unicorn & baby names (spoken tappable list) ---------- */
UA.UNI_NAMES = ['Sparkle', 'Rosie', 'Star', 'Moonbeam', 'Petal', 'Twinkle', 'Clover', 'Sunny', 'Pearl', 'Poppy'];
UA.BABY_QUIRKS = ['sleepy', 'chaser', 'sneezy', 'bouncy', 'singer', 'spinner'];

/* ---------- story frames: %Q is the core question line ---------- */
UA.FRAMES = {
  'letter-meadow': [
    'The flowers are hiding letters! %Q',
    'A little bee needs help! %Q',
    'The meadow butterflies are playing a game! %Q',
    'Ooh, the tall grass is whispering! %Q',
    'A fairy dropped her letter basket! %Q',
    'The daisies are giggling with a secret! %Q',
    'Buzz buzz! The bees need a helper! %Q',
    'The meadow gate opens for just one letter! %Q',
  ],
  R1: [
    'The flower fairies painted letters! %Q',
    'A ladybird landed on a letter! %Q',
    'The letters are playing hide and seek! %Q',
    'A snail is looking for its letter home! %Q',
    'The bee left letter footprints in the dew! %Q',
    'Sunbeams are shining on the letters! %Q',
    'A caterpillar is munching towards a letter! %Q',
  ],
  R2: [
    'Listen! A flower is singing a sound! %Q',
    'The wind is whooshing a letter sound! %Q',
    'A baby bird is practising a sound! %Q',
    'The bees are humming a tune! %Q',
    'A cricket is chirping a sound for you! %Q',
    'The meadow echo wants to copy a sound! %Q',
    'Shh, a little seed is whispering its sound! %Q',
  ],
  R3: [
    'The picnic basket spilled! %Q',
    'The babies are so hungry! %Q',
    'The meadow shop needs sorting! %Q',
    'A hungry duckling waddled over! %Q',
    'The basket tipped over in the breeze! %Q',
    'Snack time — but which one goes first? %Q',
    'The bunny is looking for its lunch! %Q',
  ],
  R4: [
    'The talking flower is sounding out a word! %Q',
    'The garden gnome is stretching out the sounds! %Q',
    'A seed is slowly waking up into a word! %Q',
    'Listen close — the vine is spelling it out loud! %Q',
    'The gnome is blending sounds like magic soup! %Q',
  ],
  R5: [
    'The word garden needs its letters planted! %Q',
    'The gnome dropped his letter blocks! %Q',
    'Help the seed grow into a whole word! %Q',
    'The flower pot is missing its letters! %Q',
    'Plant the sounds and watch the word bloom! %Q',
  ],
  R6: [
    'The gnome found a tricky double sound! %Q',
    'Two letters are holding hands and singing! %Q',
    'The garden pond is rippling with a sound! %Q',
    'A funny sound is hiding in the leaves! %Q',
    'The flower whispered a sneaky sound duo! %Q',
  ],
  R7: [
    'The gnome keeps this word in his special jar! %Q',
    'This word grows in every garden bed! %Q',
    'The seed packet has a word on it! %Q',
    'A word butterfly landed on the fence! %Q',
    'The garden sign needs its word back! %Q',
  ],
  'number-mountain': [
    'The mountain goats need help! %Q',
    'We are climbing higher! %Q',
    'The snow sprites are counting! %Q',
    'A goat is stuck on a rocky ledge! %Q',
    'The snow sprites dropped their snowballs! %Q',
    'Up, up the mountain we go! %Q',
    'The climbing rope needs counting first! %Q',
  ],
  M1: [
    'Quick! The snow sprite flashed a number! %Q',
    'Blink and you will miss it — look fast! %Q',
    'The goats hopped into a little group! %Q',
    'A snowflake pattern twinkled on the mountain! %Q',
    'The sprite is testing your quick eyes! %Q',
  ],
  M2: [
    'The bridge needs planks — count them on! %Q',
    'The picnic needs treats! %Q',
    'The baby goats are lining up! %Q',
    'Tap each one so it does not get lost! %Q',
    'The snow sprites are counting their footprints! %Q',
    'One by one, help them cross the bridge! %Q',
    'The mountain train needs its carriages counted! %Q',
  ],
  M3: [
    'The mountain sign is missing a number! %Q',
    'A goat is standing by the wrong number! %Q',
    'The snow sprites carved numbers in the ice! %Q',
    'Find the number before the giggly avalanche! %Q',
    'The climbing flags each show a number! %Q',
  ],
  M4: [
    'Which goat has more snowballs? %Q',
    'The sprites are comparing their icicles! %Q',
    'One ribbon is longer on the mountain path! %Q',
    'The goats are lining up by size! %Q',
    'Look closely — which pile is bigger? %Q',
  ],
  M6: [
    'The ten-frame is only half full! %Q',
    'Some snowflakes are hiding in the mountain mist! %Q',
    'The goats split into two little groups! %Q',
    'Part of the number is hiding behind the peak! %Q',
    'The sprites shared their snowballs into two piles! %Q',
  ],
  M7: [
    'More friends came to the party! %Q',
    'The basket got fuller! %Q',
    'Snack time on the mountain! %Q',
    'More snowflakes floated down to join! %Q',
    'The goats invited a few more friends! %Q',
    'Look, even more sprites arrived to play! %Q',
    'The pile keeps growing — how many now? %Q',
  ],
  M8: [
    'Some bunnies hopped away! %Q',
    'Whoosh! Some flew off! %Q',
    'Munch munch — some got eaten! %Q',
    'A few snowballs melted in the sun! %Q',
    'Some goats wandered off to nap! %Q',
    'Some sprites flew home for supper! %Q',
    'The wind blew a few snowflakes away! %Q',
  ],
  M9: [
    'The mountain path follows a pattern! %Q',
    'The frogs are jumping by twos up the rocks! %Q',
    'Snow sprites lined up in a colourful pattern! %Q',
    'What comes next on the climbing trail? %Q',
    'The goats are hopping to a beat! %Q',
  ],
  'memory-clouds': [
    'The clouds are playing peek-a-boo! %Q',
    'Shhh — the sky is hiding things! %Q',
    'The stars tucked themselves in! %Q',
    'A cloud puffed up and hid a surprise! %Q',
    'Twinkle twinkle — remember where the star went! %Q',
    'The sky is playing a sneaky little game! %Q',
    'Watch closely before the clouds drift by! %Q',
  ],
  PK: [
    'Peek-a-boo! The clouds are hiding a friend! %Q',
    'Ready or not, the stars are hiding! %Q',
    'The moon is playing peek-a-boo tonight! %Q',
    'Which cloud is puffing its cheeks with a secret? %Q',
    'Shh, the sky is counting to hide! %Q',
  ],
  P1: [
    'A cloud is shaped like something special! %Q',
    'The stars are hiding in different shapes! %Q',
    'Which shape is floating by tonight? %Q',
    'The moon drew a shape in the sky! %Q',
    'A fluffy cloud shifted into a shape! %Q',
  ],
  P4: [
    'The clouds hid two matching friends! %Q',
    'Peek-a-boo! Find the matching pair! %Q',
    'The stars are playing a matching game! %Q',
    'Two clouds are hiding the same secret! %Q',
    'Remember where the twinkly pair went! %Q',
  ],
  'word-garden': [
    'A word seed is sprouting! %Q',
    'The garden gnome mixed up his labels! %Q',
    'The talking rose has a riddle! %Q',
    'The vines are curling around a word! %Q',
    'A ladybird is reading — well, nearly! %Q',
    'The gnome tipped his wheelbarrow of words! %Q',
    'The garden fountain is bubbling with sounds! %Q',
  ],
  'puzzle-falls': [
    'The waterfall splashed the puzzle apart! %Q',
    'The river fish love this game! %Q',
    'Drip drop — a puzzle appeared! %Q',
    'The splashes scattered pieces everywhere! %Q',
    'A fish nudged a puzzle piece downstream! %Q',
    'The waterfall is giggling with bubbles! %Q',
    'Splish splash — put it back together! %Q',
  ],
  P2: [
    'The waterfall scattered the picture into pieces! %Q',
    'The river fish nudged the pieces around! %Q',
    'Splash! Help put the picture back together! %Q',
    'A piece floated downstream — catch it! %Q',
    'The falls washed the puzzle apart! %Q',
  ],
  P3: [
    'The river fish are swimming in a pattern! %Q',
    'Beads bounced down the waterfall in order! %Q',
    'What splashes next in the pattern? %Q',
    'The falls are dripping in a rhythm! %Q',
    'The fish are lining up just so! %Q',
  ],
  P5: [
    'The river winds through the falls — follow it! %Q',
    'Hop along the stepping stones! %Q',
    'The fish need a path through the splashes! %Q',
    'Follow the glowing trail through the falls! %Q',
    'Which way does the little stream go? %Q',
  ],
  P6: [
    'One fish does not belong in this splash! %Q',
    'Sort the pebbles before the falls wash them away! %Q',
    'Which one is different by the riverbank? %Q',
    'The waterfall mixed everything up — sort it! %Q',
    'One little drop looks a bit different! %Q',
  ],
  'crystal-castle': [
    'A royal challenge, %NAME% the hero! %Q',
    'The crystal throne is glowing! %Q',
    'The kingdom is watching, champion! %Q',
    'The royal trumpets are sounding! %Q',
    'A crystal challenge sparkles before you! %Q',
    'The champions’ hall awaits your turn! %Q',
    'The crown jewels twinkle for this challenge! %Q',
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
  'What does a duck say when it buys lipstick? Put it on my BILL! Quack quack!',
  'Why did the sheep cross the road? To get to the baa-baa shop! Baa!',
  'What do you call a sleepy unicorn? ... A snoozicorn! Zzzzz!',
  'Knock knock! Who is there? Boo. Boo who? Aww, do not cry, it is only a joke!',
  'What does a bee say on a hot day? ... Buzz buzz, phew!',
  'Why did the little pig bring a blanket? Because it wanted to be a snug-bug! Oink oink!',
  'What did the horse say to the carrot? ... Nothing, horses cannot talk! Neigh! Hee hee!',
  'What do you call a dancing unicorn? ... A dizzy-corn! Wheee!',
];

/* ---------- unicorn kitchen (toy corner): stack sprites into a "cake" ---------- */
UA.KITCHEN_YUM = [
  'Mmmmm! %ITEMS% cake is the best cake ever!',
  'Yum yum yum! That was delicious!',
  'Ooh, %ITEMS%! My favourite flavour!',
  'Nom nom nom! More please!',
  'That cake made my whole tail sparkle!',
  'Yummy! %ITEMS% taste like sunshine!',
  'Slurp! Best cake in the whole meadow!',
  'Mmm, so sweet! Bake me another one!',
  'That was scrumptious, %ITEMS% and all!',
  'Happy tummy! Let us make more cake!',
];
UA.KITCHEN_YUCK = [
  'A sock in my cake? BLEURGH! Hee hee, do it again!',
  'Ooh, %ITEMS%?! BLEURGH! That tickled my tongue!',
  'A fish cake?! BLEURGH! Ha ha, so silly!',
  'Ick, a drum in my cake! BLEURGH! Make another one!',
  'Whoa, %ITEMS%! BLEURGH! Hee hee, again again!',
  'That fizzed and popped! BLEURGH! So funny!',
  'Bleurgh, that was wobbly and weird! Hee hee!',
  'My whole face went squiggly! BLEURGH! Do it again!',
  'Yikes, %ITEMS% cake! BLEURGH! What a giggle!',
  'That was the silliest cake yet! BLEURGH! More please!',
];

/* ---------- petting reactions (no rewards attached; debounced) ---------- */
UA.PET_LINES = [
  'Giggle! That tickles!',
  'Ooh, sparkle shivers!',
  'Hee hee, right there!',
  'Nuzzle nuzzle, %NAME%!',
  'That feels lovely!',
  'Hee hee, again please!',
  'Sparkles everywhere! Giggle!',
  'You give the best pats, %NAME%!',
  'Ooh, my mane feels tingly!',
  'Snuggle time, %NAME%! Hee hee!',
];

/* ---------- adult gate codes ---------- */
UA.GATE_DIGITS = () => { const d = []; while (d.length < 3) { const n = 1 + UA.rand(9); if (!d.includes(n)) d.push(n); } return d; };
