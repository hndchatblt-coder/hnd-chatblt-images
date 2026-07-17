// Extracts every fixed narration atom worth baking into real audio and writes
// tools/voice-lines.json: { key: "text to speak" }. Keys are stable — the game
// looks clips up by these keys. Run: node tools/make-voice-lines.js
// Dynamic lines (her name, story frames) are NOT baked; they stay on TTS.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// load data.js standalone (it only needs a UA global and window)
const ctx = { window: {}, Math, console };
ctx.UA = ctx.window.UA = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/data.js'), 'utf8'), ctx);
const UA = ctx.window.UA;

const lines = {};
const add = (key, text) => { lines[key] = text; };

// letter SOUNDS (the worst TTS offenders) and letter NAMES
for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
  add('snd_' + ch, UA.PHON[ch].say + '.');
  add('str_' + ch, UA.PHON[ch].stretch + '.');
  add('ltr_' + ch, ch.toUpperCase() + '.');
}
for (const d of ['sh', 'ch', 'th', 'ck']) { add('snd_' + d, UA.PHON[d].say + '.'); add('str_' + d, UA.PHON[d].stretch + '.'); }

// numbers 0-20
for (let n = 0; n <= 20; n++) add('num_' + n, String(n) + '.');

// every pictured / taught word
const words = new Set();
UA.CVC.forEach(c => words.add(c.w));
UA.DIGRAPH_WORDS.forEach(c => words.add(c.w));
UA.HFW_TRICKY.forEach(w => words.add(w));
UA.HFW_DECODE.forEach(w => words.add(w));
UA.FIRST_SOUND_POOL.forEach(w => words.add(w));
UA.COUNT_SPRITES.forEach(w => words.add(w));
UA.SHAPES.forEach(w => words.add(w));
['strawberry', 'cupcake', 'apple', 'icecream', 'watermelon', 'carrot', 'banana', 'orange', 'pizza'].forEach(w => words.add(w));
for (const w of words) add('w_' + w.replace(/\W/g, ''), w + '.');

// fixed spoken lines with no %NAME% (praise/retry/reveal keep TTS when they
// carry her name; the plain ones are baked)
UA.PRAISE.filter(t => !t.includes('%NAME%')).forEach((t, i) => add('praise_' + i, t));
UA.TRY_AGAIN.filter(t => !t.includes('%NAME%')).forEach((t, i) => add('try_' + i, t));
UA.REVEAL_LINES.forEach((t, i) => add('reveal_' + i, t));
UA.ZONES.forEach(z => add('hello_' + z.id, z.hello));
add('levelup', 'Level up! You are getting stronger!');
add('perfect', 'A perfect round! Every single one!');
add('sparklebonus', 'Sparkle bonus!');

fs.writeFileSync(path.join(__dirname, 'voice-lines.json'), JSON.stringify(lines, null, 1));
console.log('wrote tools/voice-lines.json with', Object.keys(lines).length, 'lines');
