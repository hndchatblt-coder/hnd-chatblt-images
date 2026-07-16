// build.js — concatenates src/*.js in dependency order into game.html.
// game.html is a BUILD ARTIFACT: never hand-edit it, never read it. Rebuild it.
const fs = require("fs");
const path = require("path");

// Dependency order. Logic modules first (pure JS, no THREE), render layer last.
// Files not yet written are skipped; unknown files in src/ are an error so nothing
// silently drops out of the artifact.
const ORDER = [
  "rng.js",
  "world.js",
  "player.js",
  "soundEvents.js",
  "vision.js",
  "guardAI.js",
  "items.js",
  "director.js",
  "saveState.js",
  "engine.js",
  "tests.js",
  "music.js",
  "radar.js",
  "hud.js",
  "codec.js",
  "render.js",
  "boot.js",
];

const srcDir = path.join(__dirname, "src");
const present = fs.readdirSync(srcDir).filter((f) => f.endsWith(".js"));
const unknown = present.filter((f) => !ORDER.includes(f));
if (unknown.length) {
  console.error("build.js: files in src/ missing from ORDER:", unknown.join(", "));
  process.exit(1);
}

const parts = [];
for (const f of ORDER) {
  const p = path.join(srcDir, f);
  if (!fs.existsSync(p)) continue;
  parts.push(`// ==== src/${f} ====\n` + fs.readFileSync(p, "utf8"));
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SHADOW LOOP</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; padding: 0; background: #000; overflow: hidden; }
  #app { position: fixed; inset: 0; }
  canvas { display: block; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
</head>
<body>
<div id="app"></div>
<script>
${parts.join("\n")}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, "game.html"), html);
console.log(
  `build.js: wrote game.html (${(html.length / 1024).toFixed(1)} KB, ` +
    `${parts.length} modules)`
);
