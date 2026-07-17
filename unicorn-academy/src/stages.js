/* ================= Unicorn Academy — stage data tables =================
   Every stage picks a widget and supplies content. A stage is data, not code:
   { id, zone, name, widget, levels, start, pins?, roundLen?, stars?:false, gen(level) }
   gen returns { core, hint?, prompt?, options/correct | widget fields, ... }.
   PK (peek-a-boo) and CC (royal challenges) are delight stages: they play the
   same loop but award no stars — the 69-star total is exactly R1-R8 + M1-M9 +
   P1-P6 at 3 stars each (SPEC egg milestones). */
'use strict';
(() => {
const L = (id) => UA.letterCard(id);
const num = (n) => ({ id: 'n' + n, html: UA.numberCard(n), saySelf: String(n) });
const numOpts = (correct, lo, hi, n) => {
  const set = new Set([correct]);
  let guard = 0;
  while (set.size < n && guard++ < 90) {
    const v = lo + UA.rand(hi - lo + 1);
    if (Math.abs(v - correct) <= (hi - lo < 6 ? 9 : 5) || true) set.add(v);
  }
  return UA.shuffle([...set]).map(num);
};
const sndSay = (ch) => { const p = UA.soundOf(ch); return `${p.say}, like the start of ${p.anchor}`; };
const splitUnits = UA.splitUnits = (w) => {
  const out = []; let i = 0;
  while (i < w.length) {
    const two = w.slice(i, i + 2);
    if (['sh', 'ch', 'th', 'ck'].includes(two)) { out.push(two); i += 2; }
    else if (w[i] === w[i + 1]) { out.push(w[i]); i += 2; }   // shell's ll
    else { out.push(w[i]); i += 1; }
  }
  return out;
};
const blendSay = (w) => splitUnits(w).map(u => UA.soundOf(u).stretch).join('... ') + `... ${w}!`;
const PLURALS = { apple: 'apples', strawberry: 'strawberries', star: 'stars', flower: 'flowers',
  balloon: 'balloons', butterfly: 'butterflies', cupcake: 'cupcakes', egg: 'eggs', gift: 'gifts', ball: 'balls' };
const spriteOpt = (w, cap) => ({ id: w, html: UA.sprite(w), saySelf: w, cap: cap ? w : undefined });
const wordOpt = (w) => ({ id: w, html: UA.wordCard(w), saySelf: w });

UA.STAGES = {};
const def = (o) => { UA.STAGES[o.id] = o; };

/* ================= READING LADDER ================= */

def({ id: 'R1', zone: 'letter-meadow', name: 'Find the letter', skill: 'Letter recognition',
  widget: 'tapChoice', levels: 8, start: 1,
  gen (l) {
    const pool = UA.SATPIN.slice(0, Math.min(26, 6 + (l - 1) * 3));
    const nOpts = l < 3 ? 3 : l < 6 ? 4 : 6;
    const lower = l >= 5 && l < 7;         // 1-4 uppercase, 5-6 lowercase, 7-8 both shown
    const both = l >= 7;
    const picks = UA.shuffle(pool).slice(0, nOpts);
    const target = picks[0];
    const options = UA.shuffle(picks.map(ch => ({
      id: ch, html: both ? UA.bigSmallCard(ch) : UA.letterCard(ch, undefined, lower),
    })));
    return { core: `Find the letter ${target.toUpperCase()}!`, options, correct: target,
      hint: `We are looking for ${target.toUpperCase()}!` };
  } });

def({ id: 'R2', zone: 'letter-meadow', name: 'Letter sounds', skill: 'Letter sounds',
  widget: 'tapChoice', levels: 8, start: 1,
  gen (l) {
    const pool = UA.SATPIN.slice(0, Math.min(26, 6 + (l - 1) * 3));
    const nOpts = l < 3 ? 3 : l < 6 ? 4 : 6;
    const picks = UA.shuffle(pool).slice(0, nOpts);
    const target = picks[0];
    return {
      core: `Which letter makes the sound ${sndSay(target)}?`,
      options: UA.shuffle(picks.map(ch => ({ id: ch, html: UA.letterCard(ch, undefined, l >= 5) }))),
      correct: target,
      hint: `Listen: ${UA.soundOf(target).stretch}. ${sndSay(target)}!`,
    };
  } });

def({ id: 'R3', zone: 'letter-meadow', name: 'Beginning sounds', skill: 'Beginning sounds',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    const nOpts = l < 4 ? 3 : 4;
    const picks = [];
    const used = new Set();
    for (const w of UA.shuffle(UA.FIRST_SOUND_POOL)) {
      const s = splitUnits(w)[0];
      if (!used.has(s)) { used.add(s); picks.push(w); }
      if (picks.length === nOpts) break;
    }
    const target = picks[0];
    const s = splitUnits(target)[0];
    return {
      core: `Which one starts with ${UA.soundOf(s).stretch}?`,
      options: UA.shuffle(picks.map(w => spriteOpt(w))),
      correct: target,
      hint: `${UA.soundOf(s).stretch}... ${UA.soundOf(s).stretch}... ${target}!`,
    };
  } });

def({ id: 'R4', zone: 'word-garden', name: 'Sound it out', skill: 'CVC blending',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    const bank = l < 3 ? UA.CVC.filter(c => c.cont) : UA.CVC;
    const nOpts = l < 5 ? 3 : 4;
    const target = UA.pick(bank).w;
    // distractors share the vowel when possible — a curated set she must
    // actually listen to, not random asset filler
    const pool = UA.CVC.filter(c => c.w !== target);
    const sameVowel = pool.filter(c => c.w[1] === target[1]);
    const source = (l >= 4 && sameVowel.length >= nOpts - 1) ? sameVowel : pool;
    const others = UA.shuffle(source).slice(0, nOpts - 1);
    const options = UA.shuffle([spriteOpt(target), ...others.map(o => spriteOpt(o.w))]);
    return {
      core: `Listen! ${blendSay(target)} Tap the ${target}!`,
      options, correct: target,
      hint: blendSay(target),
      slowNext: true,
    };
  } });

def({ id: 'R5', zone: 'word-garden', name: 'Build the word', skill: 'CVC building',
  widget: 'dragToSlot', levels: 6, start: 1,
  gen (l) {
    const bank = l < 3 ? UA.CVC.filter(c => c.cont) : UA.CVC;
    const target = UA.pick(bank).w;
    const letters = target.split('');
    const nDistract = l < 3 ? 0 : l < 5 ? 1 : 2;
    const distract = UA.shuffle(UA.ALPHABET.filter(c => !letters.includes(c))).slice(0, nDistract);
    const pieces = letters.map((ch, i) => ({
      id: 'L' + i + ch, slot: 's' + i, html: UA.letterCard(ch, '#9DE0B0', true),
      saySelf: UA.soundOf(ch).say,
      onPlace: () => UA.audio.speakSound(ch),
    })).concat(distract.map((ch, i) => ({
      id: 'D' + i + ch, slot: null, html: UA.letterCard(ch, '#FFB37A', true), saySelf: UA.soundOf(ch).say,
    })));
    return {
      core: `Can you build the word ${target}? ${blendSay(target)}`,
      prompt: `<div class="prompt-card">${UA.sprite(target)}</div>`,
      slots: letters.map((ch, i) => ({ id: 's' + i })),
      pieces, correct: 'built',
      hint: `The word is ${target}. ${blendSay(target)}`,
      afterCorrect: () => UA.audio.speakBlend(target),
      slowNext: true,
    };
  } });

def({ id: 'R6', zone: 'word-garden', name: 'Sh! Ch! Th!', skill: 'Digraphs',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    const item = UA.pick(UA.DIGRAPH_WORDS);
    if (l % 2 === 1) {                        // odd levels: hear it, tap the picture
      const others = UA.shuffle(UA.DIGRAPH_WORDS.filter(d => d.w !== item.w)).slice(0, l < 4 ? 2 : 3);
      return {
        core: `Listen! ${blendSay(item.w)} Tap the ${item.w}!`,
        options: UA.shuffle([spriteOpt(item.w), ...others.map(o => spriteOpt(o.w))]),
        correct: item.w, hint: blendSay(item.w), slowNext: true,
      };
    }
    // even levels: build it — the digraph is ONE tile
    const units = splitUnits(item.w);
    const distract = l >= 4 ? [UA.pick(['sh', 'ch', 'th', 'ck'].filter(d => !units.includes(d)))] : [];
    return {
      widget: 'dragToSlot',
      core: `Build ${item.w}! ${blendSay(item.w)}`,
      prompt: `<div class="prompt-card">${UA.sprite(item.w)}</div>`,
      slots: units.map((u, i) => ({ id: 's' + i })),
      pieces: units.map((u, i) => ({
        id: 'U' + i + u, slot: 's' + i, html: UA.wordCard(u, u.length > 1 ? '#B79CFF' : '#9DE0B0'),
        saySelf: UA.soundOf(u).say, onPlace: () => UA.audio.speakSound(u),
      })).concat(distract.map((u, i) => ({
        id: 'X' + i + u, slot: null, html: UA.wordCard(u, '#FFB37A'), saySelf: UA.soundOf(u).say,
      }))),
      correct: 'built', hint: blendSay(item.w), slotSize: 130, pieceSize: 120, slowNext: true,
    };
  } });

def({ id: 'R7', zone: 'word-garden', name: 'Special words', skill: 'High-frequency words',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    const tricky = UA.rand(2) === 0;
    const bank = tricky ? UA.HFW_TRICKY : UA.HFW_DECODE;
    const nOpts = l < 4 ? 3 : 4;
    const picks = UA.shuffle(bank).slice(0, nOpts);
    const target = picks[0];
    const core = tricky
      ? `This is a special word we just remember. It says "${target}". Find "${target}"!`
      : `Sound it out! ${blendSay(target)} Find "${target}"!`;
    return {
      core, options: UA.shuffle(picks.map(wordOpt)), correct: target,
      hint: tricky ? `The word says "${target}". Look for it!` : blendSay(target),
    };
  } });

def({ id: 'R8', zone: 'word-garden', name: 'First sentences', skill: 'Reading sentences',
  widget: 'tapSequence', levels: 4, start: 1, roundLen: 4,
  gen () {
    const s = UA.pickFresh('R8', UA.SENTENCES);
    const sequence = s.t.map((tok, i) => {
      if (Array.isArray(tok)) {
        const word = tok[tok.length - 1];
        const pre = tok.length > 1 ? tok[0] + ' ' : '';
        return { id: 'w' + i, say: pre + word,
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            ${pre ? `<span style="font-size:26px;font-weight:800">${pre}</span>` : ''}${UA.sprite(word)}</div>` };
      }
      return { id: 'w' + i, say: tok.replace('.', ''), html: UA.wordCard(tok.replace('.', '')) };
    });
    return {
      core: `Let us read together! Tap each word, left to right!`,
      sequence, correct: 'sent', glowNext: true, cardSize: 170,
      hint: 'Start at this side, and tap each one!',
      afterCorrect: () => UA.audio.speak(s.say + ' You read it!'),
      slowNext: true,
    };
  } });

/* ================= MATHS LADDER ================= */

def({ id: 'M1', zone: 'number-mountain', name: 'Quick peek numbers', skill: 'Subitising',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    const max = l < 3 ? 3 : 5;
    const n = 1 + UA.rand(max);
    const kind = l < 2 ? 'dots' : l < 4 ? 'dice' : UA.pick(['dots', 'dice', 'frame']);
    const art = kind === 'dots' ? UA.dotCloud(n) : kind === 'dice' ? UA.diceFace(n) : UA.tenFrame(n);
    const q = {
      core: `Quick! Peek at the sparkles, then tap how many you saw!`,
      prompt: `<div class="prompt-card flash-card" style="min-width:220px;min-height:150px">${art}</div>`,
      options: numOpts(n, 1, max + 1, 3), correct: 'n' + n,
      hint: `Have another quick peek!`,
      flashy: true,
    };
    q.afterNarrate = () => {                   // display-time limit, never answer-time
      const c = document.querySelector('.flash-card');
      if (c) setTimeout(() => c.classList.add('flash-hidden'), 1500);
    };
    q.reFlash = () => {
      const c = document.querySelector('.flash-card');
      if (c) { c.classList.remove('flash-hidden'); setTimeout(() => c.classList.add('flash-hidden'), 1500); }
    };
    return q;
  } });

def({ id: 'M2', zone: 'number-mountain', name: 'Count them all', skill: 'Counting 1-10',
  widget: 'tapEach', levels: 6, start: 1, pins: [2, 4, 6],
  gen (l) {
    const count = [3, 5, 6, 8, 9, 10][l - 1];
    const s = UA.pick(UA.COUNT_SPRITES);
    return {
      core: `Tap every ${s} to count them, one at a time!`,
      count, spriteName: s, plural: PLURALS[s],
      options: numOpts(count, Math.max(1, count - 3), count + 3, 3),
      correct: 'n' + count,
      hint: `Tap each one just once, and count out loud with me!`,
    };
  } });

def({ id: 'M3', zone: 'number-mountain', name: 'Find the number', skill: 'Numbers 1-20',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    const hi = l < 3 ? 10 : l < 5 ? 15 : 20;
    const n = 1 + UA.rand(hi);
    const nOpts = l < 5 ? 3 : 4;
    return {
      core: `Find the number ${n}!`,
      options: numOpts(n, Math.max(1, n - 5), Math.min(hi, n + 5), nOpts),
      correct: 'n' + n, hint: `We want ${n}!`,
    };
  } });

def({ id: 'M4', zone: 'number-mountain', name: 'More or fewer', skill: 'Comparing',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    const kind = l < 3 ? 'more' : UA.pick(['more', 'fewer', 'big', 'long']);
    if (kind === 'big') {
      const s = UA.pick(UA.COUNT_SPRITES);
      const big = UA.rand(2) === 0;
      return {
        core: `Tap the ${big ? 'BIG' : 'little'} ${s}!`,
        options: UA.shuffle([
          { id: 'big', html: `<div style="transform:scale(1.25)">${UA.sprite(s)}</div>` },
          { id: 'small', html: `<div style="transform:scale(.55)">${UA.sprite(s)}</div>` },
        ]),
        correct: big ? 'big' : 'small', hint: big ? 'The really big one!' : 'The tiny little one!',
      };
    }
    if (kind === 'long') {
      const long = UA.rand(2) === 0;
      const ribbon = (w, col) => `<svg viewBox="0 0 160 60"><rect x="${(160 - w) / 2}" y="24" width="${w}" height="14" rx="7" fill="${col}" stroke="#5C4A66" stroke-width="3"/></svg>`;
      return {
        core: `Tap the ${long ? 'LONGER' : 'shorter'} ribbon!`,
        options: UA.shuffle([
          { id: 'long', html: ribbon(140, '#FF9EC7') },
          { id: 'short', html: ribbon(64, '#8FD0FF') },
        ]),
        correct: long ? 'long' : 'short', hint: long ? 'The one that stretches longest!' : 'The little short one!',
      };
    }
    const a = 2 + UA.rand(l < 3 ? 3 : 5), bDelta = 1 + UA.rand(2);
    const b = UA.rand(2) === 0 ? a + bDelta : Math.max(1, a - bDelta);
    const s1 = UA.pick(UA.COUNT_SPRITES), s2 = UA.pick(UA.COUNT_SPRITES.filter(x => x !== s1));
    const group = (n, s) => `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;max-width:170px">
      ${Array(n).fill(0).map(() => `<span style="width:44px;height:44px;display:inline-block">${UA.sprite(s)}</span>`).join('')}</div>`;
    const wantMore = kind === 'more';
    return {
      core: `Which side has ${wantMore ? 'MORE' : 'FEWER'}? Count and tap!`,
      options: UA.shuffle([
        { id: 'a', html: group(a, s1) }, { id: 'b', html: group(b, s2) },
      ]),
      cardSize: 230,
      correct: (wantMore ? (a > b) : (a < b)) ? 'a' : 'b',
      hint: `Count each side with your finger, then tap the side with ${wantMore ? 'more' : 'fewer'}!`,
    };
  } });

def({ id: 'M5', zone: 'number-mountain', name: 'First, second, third', skill: 'Order & position',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    if (l % 2 === 1) {                        // race ordinals
      const animals = UA.shuffle(['rabbit', 'turtle', 'fox', 'mouse', 'frog']).slice(0, 3);
      const ord = UA.pick(l < 3 ? ['first', 'last'] : ['first', 'second', 'third', 'last']);
      const idx = { first: 0, second: 1, third: 2, last: 2 }[ord];
      return {
        core: `The ${animals.join(', the ')} are racing to the flag! Who came ${ord.toUpperCase()}?`,
        prompt: `<div class="prompt-card" style="gap:6px">
          ${animals.map((a, i) => `<span style="width:${86 - i * 10}px;height:${86 - i * 10}px;display:inline-block">${UA.sprite(a)}</span>`).join('')}
          <svg viewBox="0 0 40 80" width="44" height="88"><rect x="16" y="8" width="6" height="66" rx="3" fill="#C89A6B" stroke="#5C4A66" stroke-width="2"/><path d="M22 10 L38 18 L22 26Z" fill="#FF7FB2" stroke="#5C4A66" stroke-width="2.5"/></svg>
        </div>`,
        options: UA.shuffle(animals.map(a => spriteOpt(a))),
        correct: animals[idx],
        hint: `${ord} means ${ord === 'first' ? 'closest to the flag — the front of the line' : ord === 'last' ? 'the very end of the line' : 'count the places: first, second, third'}!`,
      };
    }
    // positions: in / on / under / next to
    const pos = UA.pick(l < 4 ? ['on', 'under'] : ['in', 'on', 'under', 'next to']);
    const animal = UA.pick(['bird', 'cat', 'mouse', 'frog']);
    const posCard = (p) => {
      const box = '<use href="#p-box" x="24" y="48" width="72" height="72"/>';
      const bird = (x, y, s) => `<use href="#p-${animal}" x="${x}" y="${y}" width="${s}" height="${s}"/>`;
      const layers = {
        in: bird(36, 30, 48) + box,
        on: box + bird(36, 6, 48),
        under: `<use href="#p-box" x="24" y="10" width="72" height="72"/>` + bird(36, 74, 44),
        'next to': box + bird(0, 66, 48),
      }[p];
      return `<svg viewBox="0 0 120 124" aria-hidden="true">${layers}</svg>`;
    };
    const opts = UA.shuffle(['in', 'on', 'under', 'next to']).slice(0, 3);
    if (!opts.includes(pos)) opts[0] = pos;
    return {
      core: `Where is the ${animal} ${pos.toUpperCase()} the box? Tap that picture!`,
      options: UA.shuffle(opts.map(p => ({ id: p, html: posCard(p) }))),
      correct: pos,
      hint: `${pos} the box. Look carefully at where the ${animal} is!`,
    };
  } });

def({ id: 'M6', zone: 'number-mountain', name: 'Number bonds', skill: 'Number bonds',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    const whole = l < 4 ? 5 : 10;
    const part = 1 + UA.rand(whole - 1);
    const need = whole - part;
    return {
      core: `${whole} is ${part} and... how many more? Count the empty spots!`,
      prompt: `<div class="prompt-card" style="min-width:260px">${UA.tenFrame(part, [part, 0])}</div>`,
      options: numOpts(need, 0, whole, 3),
      correct: 'n' + need,
      hint: `Count the empty holes in the frame: it needs ${need} more to make ${whole}!`,
    };
  } });

def({ id: 'M7', zone: 'number-mountain', name: 'Adding up', skill: 'Addition',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    const max = l < 4 ? 5 : 10;
    const a = 1 + UA.rand(max - 2), b = 1 + UA.rand(Math.max(1, max - a - 1));
    const s = UA.pick(UA.COUNT_SPRITES);
    const group = (n) => Array(n).fill(0).map(() =>
      `<span style="width:46px;height:46px;display:inline-block">${UA.sprite(s)}</span>`).join('');
    return {
      core: `${a} and ${b} more came along! Count them ALL — how many altogether?`,
      prompt: `<div class="prompt-card" style="gap:14px;max-width:640px;flex-wrap:wrap">
        <span style="display:flex;flex-wrap:wrap;gap:3px;max-width:250px">${group(a)}</span>
        <span style="font-size:44px;font-weight:900">+</span>
        <span style="display:flex;flex-wrap:wrap;gap:3px;max-width:250px">${group(b)}</span></div>`,
      options: numOpts(a + b, Math.max(1, a + b - 3), a + b + 3, 3),
      correct: 'n' + (a + b),
      hint: `Count every single one on the screen, then tap that number!`,
    };
  } });

def({ id: 'M8', zone: 'number-mountain', name: 'Hop away', skill: 'Subtraction to 5',
  widget: 'tapChoice', levels: 4, start: 1,
  gen (l) {
    const start = 2 + UA.rand(l < 3 ? 2 : 3) + 1;   // 3..5
    const away = 1 + UA.rand(start - 1);
    const left = start - away;
    const q = {
      core: `${start} bunnies! But ${away} ${away === 1 ? 'hops' : 'hop'} away... how many are left?`,
      prompt: `<div class="prompt-card" style="gap:8px">${Array(start).fill(0).map((_, i) =>
        `<span class="${i < away ? 'hop-away-target' : ''}" style="width:72px;height:72px;display:inline-block">${UA.sprite('rabbit')}</span>`).join('')}</div>`,
      options: numOpts(left, 0, start, 3),
      correct: 'n' + left,
      hint: `Count only the bunnies still here!`,
    };
    q.afterNarrate = () => {                        // a real hop-away moment
      document.querySelectorAll('.hop-away-target').forEach((b, i) =>
        setTimeout(() => b.classList.add('hop-away'), i * 320));
    };
    return q;
  } });

def({ id: 'M9', zone: 'number-mountain', name: 'Patterns & jumps', skill: 'Patterns & skip counting',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    if (l % 2 === 1) {                        // continue the colour pattern
      const kinds = l < 3 ? ['AB'] : l < 5 ? ['AB', 'ABC'] : ['AB', 'ABC', 'AABB'];
      const pat = UA.pick(kinds);
      const cols = UA.shuffle(['#FF9EC7', '#8FD0FF', '#9DE0B0', '#FFD97A', '#B79CFF']).slice(0, 3);
      const seq = { AB: [0, 1, 0, 1, 0], ABC: [0, 1, 2, 0, 1], AABB: [0, 0, 1, 1, 0] }[pat];
      const nextI = { AB: 1, ABC: 2, AABB: 0 }[pat];
      const bead = (ci) => `<svg viewBox="0 0 60 60" width="52" height="52"><circle cx="30" cy="30" r="22" fill="${cols[ci]}" stroke="#5C4A66" stroke-width="3"/><circle cx="23" cy="22" r="5" fill="#fff" opacity=".7"/></svg>`;
      return {
        core: `Look at the bead pattern! Which bead comes NEXT?`,
        prompt: `<div class="prompt-card">${seq.map(bead).join('')}<span style="font-size:44px;font-weight:900">?</span></div>`,
        options: UA.shuffle([0, 1, 2].map(ci => ({ id: 'c' + ci, html: bead(ci) }))),
        correct: 'c' + nextI,
        hint: `Say the colours out loud — the pattern tells you what comes next!`,
      };
    }
    const start = UA.pick([2, 4, 6]);
    return {
      core: `The frog jumps by twos! ${start - 2 >= 0 ? '' : ''}${start}... then... which number comes next?`,
      prompt: `<div class="prompt-card">${UA.sprite('frog')}<span style="font-size:44px;font-weight:900">${start - 2 > 0 ? (start - 2) + ', ' : ''}${start}, ?</span></div>`,
      options: numOpts(start + 2, start, start + 5, 3),
      correct: 'n' + (start + 2),
      hint: `Jump two more: ${start}... ${start + 1} is one... ${start + 2} is two!`,
    };
  } });

/* ================= PUZZLE LADDER ================= */

def({ id: 'P1', zone: 'memory-clouds', name: 'Shape spotting', skill: 'Shapes',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    if (l % 2 === 0) {                        // drag-into-hole rounds
      const shapes = UA.shuffle(UA.SHAPES).slice(0, l < 4 ? 2 : 3);
      return {
        widget: 'dragToSlot',
        core: `Pop each shape into its matching hole!`,
        slots: shapes.map(s => ({ id: s, html: `<div style="opacity:.35;filter:grayscale(1)">${UA.shapeSVG(s)}</div>` })),
        pieces: UA.shuffle(shapes.map(s => ({ id: 'p' + s, slot: s, html: UA.shapeSVG(s), saySelf: s }))),
        correct: 'built', hint: 'Match each shape to its grey shadow!',
      };
    }
    const nOpts = l < 3 ? 3 : 4;
    const picks = UA.shuffle(UA.SHAPES).slice(0, nOpts);
    const target = picks[0];
    return {
      core: `Find the ${target.toUpperCase()}!`,
      options: UA.shuffle(picks.map(s => ({ id: s, html: UA.shapeSVG(s), saySelf: s }))),
      correct: target, hint: `A ${target}${{ circle: ' is round like a ball', square: ' has four sides all the same', triangle: ' has three pointy corners', star: ' twinkles with five points', rectangle: ' is like a stretched square', heart: ' is like a love heart' }[target]}!`,
    };
  } });

def({ id: 'P2', zone: 'puzzle-falls', name: 'Jigsaw time', skill: 'Jigsaws',
  widget: 'jigsaw', levels: 4, start: 1, pins: [2, 3, 4], roundLen: 2,
  gen (l) {
    const dims = [[2, 1], [2, 2], [3, 2], [3, 3]][l - 1];
    return {
      core: `The picture broke into pieces! Tap a piece, then tap where it goes!`,
      scene: UA.jigsawScene(1 + UA.rand(99999)),
      cols: dims[0], rows: dims[1], correct: 'done',
      hint: 'Tap a piece at the side first, then tap its home in the frame!',
      slowNext: true,
    };
  } });

def({ id: 'P3', zone: 'puzzle-falls', name: 'Bead patterns', skill: 'Patterns',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    const kinds = l < 3 ? ['AB'] : l < 5 ? ['AB', 'ABC'] : ['ABC', 'AABB'];
    const pat = UA.pick(kinds);
    const sprites = UA.shuffle(['star', 'flower', 'shell', 'butterfly']).slice(0, 3);
    const seq = { AB: [0, 1, 0, 1], ABC: [0, 1, 2, 0, 1], AABB: [0, 0, 1, 1, 0] }[pat];
    const nextI = { AB: 0, ABC: 2, AABB: 0 }[pat];
    const b = (i) => `<span style="width:56px;height:56px;display:inline-block">${UA.sprite(sprites[i])}</span>`;
    return {
      core: `The waterfall beads make a pattern! What comes NEXT?`,
      prompt: `<div class="prompt-card">${seq.map(b).join('')}<span style="font-size:44px;font-weight:900">?</span></div>`,
      options: UA.shuffle(sprites.map((s, i) => ({ id: 's' + i, html: UA.sprite(s), saySelf: s }))),
      correct: 's' + nextI,
      hint: 'Say the pattern out loud — it sings what comes next!',
    };
  } });

def({ id: 'P4', zone: 'memory-clouds', name: 'Matching pairs', skill: 'Memory match',
  widget: 'flipPairs', levels: 4, start: 1, pins: [2, 3, 4], roundLen: 1,
  gen (l) {
    const nPairs = [2, 3, 4, 6][l - 1];
    const faces = UA.shuffle(UA.COUNT_SPRITES.concat(['fish', 'duck', 'owl', 'bear'])).slice(0, nPairs);
    return {
      core: `Flip the clouds and find the matching pairs!`,
      pairs: faces.map(f => ({ key: f, html: UA.sprite(f) })),
      correct: 'board', hint: 'Flip two at a time — remember what hides where!',
      slowNext: true,
    };
  } });

def({ id: 'P5', zone: 'puzzle-falls', name: 'Sparkle mazes', skill: 'Mazes',
  widget: 'tapSequence', levels: 3, start: 1, roundLen: 3,
  gen (l) {
    const n = [4, 6, 8][l - 1];
    const seq = [];
    let x = 12, y = 78;
    for (let i = 0; i < n; i++) {
      seq.push({ id: 'wp' + i, x, y,
        html: i === n - 1 ? UA.sprite('gift') : UA.sparkleSVG(i % 2 ? '#8FD0FF' : '#FFD97A') });
      x += (76 / (n - 1)) * (1 + (UA.rand(3) - 1) * .12);
      y += (i % 2 === 0 ? -1 : 1) * (18 + UA.rand(16)) * (i === n - 2 ? .4 : 1);
      y = Math.max(14, Math.min(84, y));
    }
    return {
      core: `Follow the sparkle path to the present! Tap the glowing sparkle each time!`,
      sequence: seq, correct: 'maze', glowNext: true, cardSize: 96,
      hint: 'Tap the sparkle that glows!',
    };
  } });

def({ id: 'P6', zone: 'puzzle-falls', name: 'Odd one out', skill: 'Sorting & logic',
  widget: 'tapChoice', levels: 6, start: 1,
  gen (l) {
    if (l % 2 === 0) {                        // sorting into bins
      const kind = UA.pick(['size', 'kind']);
      if (kind === 'size') {
        const s = UA.pick(UA.COUNT_SPRITES);
        const pieces = UA.shuffle([1.15, 1.05, .55, .45].map((sc, i) => ({
          id: 'p' + i, slot: sc > .8 ? 'big' : 'small',
          html: `<div style="transform:scale(${sc})">${UA.sprite(s)}</div>`,
        })));
        return {
          widget: 'dragToSlot',
          core: `Sorting time! Big ones in the BIG box, little ones in the little box!`,
          slots: [
            { id: 'big', cap: 2, html: '<span style="font-size:30px;font-weight:900">BIG</span>' },
            { id: 'small', cap: 2, html: '<span style="font-size:20px;font-weight:900">little</span>' },
          ],
          pieces, correct: 'built', slotSize: 170,
          hint: 'Look how big each one is, then pick its box!',
        };
      }
      const animals = UA.shuffle(['cat', 'dog', 'pig', 'cow']).slice(0, 2);
      const foods = UA.shuffle(['apple', 'banana', 'cupcake', 'watermelon']).slice(0, 2);
      return {
        widget: 'dragToSlot',
        core: `Sort them out! Animals with the paw, yummy food with the apple!`,
        slots: [
          { id: 'animal', cap: 2, html: UA.sprite('cat') },
          { id: 'food', cap: 2, html: UA.sprite('apple') },
        ],
        pieces: UA.shuffle(animals.map((a, i) => ({ id: 'a' + i, slot: 'animal', html: UA.sprite(a), saySelf: a }))
          .concat(foods.map((f, i) => ({ id: 'f' + i, slot: 'food', html: UA.sprite(f), saySelf: f })))),
        correct: 'built', slotSize: 170,
        hint: 'Is it an animal, or something to eat?',
      };
    }
    const same = UA.pick(UA.COUNT_SPRITES);
    const odd = UA.pick(UA.COUNT_SPRITES.filter(s => s !== same));
    const n = l < 3 ? 3 : 4;
    const options = UA.shuffle(Array(n - 1).fill(0).map((_, i) => ({ id: 'same' + i, html: UA.sprite(same) }))
      .concat([{ id: 'odd', html: UA.sprite(odd) }]));
    return {
      core: `One of these is not like the others! Tap the different one!`,
      options, correct: 'odd',
      hint: `Most of them are ${PLURALS[same] || same + 's'} — find the one that is NOT!`,
    };
  } });

/* ---------- peek-a-boo clouds (Memory Clouds delight — no stars) ---------- */
def({ id: 'PK', zone: 'memory-clouds', name: 'Peek-a-boo clouds', skill: 'Watching & remembering',
  widget: 'tapChoice', levels: 6, start: 1, stars: false,
  gen (l) {
    const n = l < 3 ? 3 : l < 5 ? 4 : 5;
    const hideIn = UA.rand(n);
    const cloudCard = (i) => `<svg viewBox="0 0 120 90" aria-hidden="true">
      <g class="peek-star" style="${i === hideIn ? '' : 'display:none'}">
        <polygon points="60,6 66,22 84,23 70,34 74,52 60,42 46,52 50,34 36,23 54,22" fill="#FFD97A" stroke="#5C4A66" stroke-width="3" stroke-linejoin="round"/>
      </g>
      ${UA.gen.cloud(60, 62, 1.15, '#fff')}
      <circle cx="48" cy="58" r="3.4" fill="#5C4A66"/><circle cx="70" cy="58" r="3.4" fill="#5C4A66"/>
      <path d="M52 70 Q60 76 68 70" stroke="#5C4A66" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
    const q = {
      core: `Watch closely! The star is hiding behind a cloud... where WAS the star?`,
      options: Array(n).fill(0).map((_, i) => ({ id: 'cl' + i, html: cloudCard(i) })),
      correct: 'cl' + hideIn,
      hint: 'Think back — which cloud did the star sink behind?',
    };
    q.afterNarrate = () => {
      setTimeout(() => document.querySelectorAll('.peek-star').forEach(s => { s.style.display = 'none'; }),
        l < 3 ? 1600 : 1100);                  // display-time limit only
    };
    return q;
  } });

/* ---------- Crystal Castle: royal challenges remixing mastered skills ---------- */
def({ id: 'CC', zone: 'crystal-castle', name: 'Royal challenge', skill: 'Everything together',
  widget: 'tapChoice', levels: 6, start: 1, stars: false,
  gen (l) {
    const mastered = UA.masteredStages().filter(id => !['CC', 'PK'].includes(id));
    const pool = mastered.length ? mastered : ['R1', 'M1'];
    const src = UA.STAGES[UA.pick(pool)];
    const q = src.gen(Math.min(src.levels, Math.max(1, src.levels - UA.rand(2))));
    q.widget = q.widget || src.widget;
    q.core = 'A royal challenge! ' + (q.core || '');
    return q;
  } });
})();
