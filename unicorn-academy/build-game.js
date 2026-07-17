// build-game.js — assembles game.html from game.template.html.
// Replaces <!-- SPRITE_PACK_HERE --> with the sprite pack (never hand-copied) and
// <!-- INCLUDE:file --> markers with the contents of src/<file>. The output is a
// single self-contained file; this script and the template are scaffolding only.
const fs = require('fs');
const pack = fs.readFileSync('assets/sprite-pack.svg.html', 'utf8');
let html = fs.readFileSync('game.template.html', 'utf8');
html = html.replace('<!-- SPRITE_PACK_HERE -->', pack);
html = html.replace(/<!-- INCLUDE:([\w.-]+) -->/g, (_, f) => fs.readFileSync('src/' + f, 'utf8'));
const leftovers = html.match(/<!-- (SPRITE_PACK_HERE|INCLUDE:[\w.-]+) -->/);
if (leftovers) { console.error('Unresolved marker: ' + leftovers[0]); process.exit(1); }
fs.writeFileSync('game.html', html);
console.log('game.html written (' + (html.length / 1048576).toFixed(2) + ' MB)');
