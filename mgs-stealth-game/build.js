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
// Concatenate src modules in ORDER, but exclude boot.js (it must run after all tests register).
for (const f of ORDER) {
  if (f === "boot.js") continue; // boot.js is appended last, after test files
  const p = path.join(srcDir, f);
  if (!fs.existsSync(p)) continue;
  parts.push(`// ==== src/${f} ====\n` + fs.readFileSync(p, "utf8"));
}

// Recursively collect test files from tests/ and tests/regressions/, wrapped so they work in browser.
// Matches the order used by test.js: reads each dir sorted, recurses into subdirs in sorted order.
let testFileCount = 0;
function collectTestFiles(dir, relPath = "") {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    const rel = relPath ? path.join(relPath, f) : f;
    if (f.endsWith(".js")) {
      const content = fs.readFileSync(p, "utf8");
      // Wrap test file so it works in browser: global.Game becomes window.Game in browser.
      parts.push(
        `// ==== tests/${rel} ====\n` +
          `(function (global) {\n` +
          content +
          `\n})(typeof window !== "undefined" ? window : global);`
      );
      testFileCount++;
    } else if (fs.statSync(p).isDirectory()) {
      collectTestFiles(p, rel);
    }
  }
}
collectTestFiles(path.join(__dirname, "tests"));

// Finally, append boot.js which runs Game.selfTests after all tests have registered.
const bootPath = path.join(srcDir, "boot.js");
if (fs.existsSync(bootPath)) {
  parts.push(`// ==== src/boot.js ====\n` + fs.readFileSync(bootPath, "utf8"));
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
const moduleCount = ORDER.length - 1; // Exclude boot.js from module count (it's appended after tests)
console.log(
  `build.js: wrote game.html (${(html.length / 1024).toFixed(1)} KB, ` +
    `${moduleCount} modules + ${testFileCount} test files)`
);
