// build-game.js — assembles game.html from game.template.html.
// Replaces <!-- SPRITE_PACK_HERE --> with the sprite pack (never hand-copied) and
// <!-- INCLUDE:file --> markers with the contents of src/<file>. The output is a
// single self-contained file; this script and the template are scaffolding only.
const fs = require('fs');
const pack = fs.readFileSync('assets/sprite-pack.svg.html', 'utf8');
let html = fs.readFileSync('game.template.html', 'utf8');
html = html.replace('<!-- SPRITE_PACK_HERE -->', pack);
html = html.replace(/<!-- INCLUDE:([\w.-]+) -->/g, (_, f) => fs.readFileSync('src/' + f, 'utf8'));

// baked narration: embed assets/voice/*.mp3 (with their manifest text) when present
if (fs.existsSync('assets/voice') && fs.existsSync('tools/voice-lines.json')) {
  const lines = JSON.parse(fs.readFileSync('tools/voice-lines.json', 'utf8'));
  const clips = {};
  for (const key of Object.keys(lines)) {
    const p = 'assets/voice/' + key + '.mp3';
    if (fs.existsSync(p))
      clips[key] = { t: lines[key], d: 'data:audio/mpeg;base64,' + fs.readFileSync(p).toString('base64') };
  }
  const n = Object.keys(clips).length;
  if (n) {
    html = html.replace('/* VOICE_PACK_JSON */{}', JSON.stringify(clips));
    console.log('embedded ' + n + ' voice clips');
  }
}
const leftovers = html.match(/<!-- (SPRITE_PACK_HERE|INCLUDE:[\w.-]+) -->/);
if (leftovers) { console.error('Unresolved marker: ' + leftovers[0]); process.exit(1); }
fs.writeFileSync('game.html', html);
console.log('game.html written (' + (html.length / 1048576).toFixed(2) + ' MB)');
