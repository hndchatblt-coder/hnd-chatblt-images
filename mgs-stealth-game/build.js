// build.js — concatenates src/*.js in dependency order into game.html.
// game.html is a BUILD ARTIFACT: never hand-edit it, never read it. Rebuild it.
const fs = require("fs");
const path = require("path");

// stripCommentLines(source): remove full-line comments conservatively.
// - Removes lines whose trimmed form starts with //, but keeps trailing comments.
// - Does not touch block comments /* */ (build breaks if they're corrupted).
// - Collapses runs of 3+ blank lines to 1.
// NOTE: screenshot.js (boot gate 257/257 in-browser) is the stripping-correctness
// gate: if any test count drops or errors appear, stripping broke a template literal
// or other edge case—fix or revert to conservative skip.
function stripCommentLines(source) {
  const lines = source.split("\n");
  const stripped = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    // Remove lines that are purely comments (trimmed form starts with //)
    if (trimmed.startsWith("//")) {
      // Full-line comment: skip it (don't add to stripped)
      continue;
    }
    // Keep everything else (code with trailing comments, blank lines, block comments)
    stripped.push(line);
  }
  // Collapse runs of 3+ blank lines to 1
  const result = [];
  let consecutiveBlanks = 0;
  for (const line of stripped) {
    if (line.trim() === "") {
      consecutiveBlanks++;
      if (consecutiveBlanks <= 1) {
        result.push(line);
      }
    } else {
      consecutiveBlanks = 0;
      result.push(line);
    }
  }
  return result.join("\n");
}

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
let strippedBytes = 0;
// Concatenate src modules in ORDER, but exclude boot.js (it must run after all tests register).
for (const f of ORDER) {
  if (f === "boot.js") continue; // boot.js is appended last, after test files
  const p = path.join(srcDir, f);
  if (!fs.existsSync(p)) continue;
  const originalContent = fs.readFileSync(p, "utf8");
  const stripped = stripCommentLines(originalContent);
  strippedBytes += originalContent.length - stripped.length;
  parts.push(`// ==== src/${f} ====\n` + stripped);
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
      const originalContent = fs.readFileSync(p, "utf8");
      const content = stripCommentLines(originalContent);
      strippedBytes += originalContent.length - content.length;
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
  const originalContent = fs.readFileSync(bootPath, "utf8");
  const stripped = stripCommentLines(originalContent);
  strippedBytes += originalContent.length - stripped.length;
  parts.push(`// ==== src/boot.js ====\n` + stripped);
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
const strippedKB = (strippedBytes / 1024).toFixed(1);
// Percentage of original source files (before concatenation) that was stripped
const originalContentSize = strippedBytes + html.length;
const strippedPercent = ((strippedBytes / originalContentSize) * 100).toFixed(1);
console.log(
  `build.js: wrote game.html (${(html.length / 1024).toFixed(1)} KB, ` +
    `stripped ${strippedKB} KB of comments [${strippedPercent}%]), ` +
    `${moduleCount} modules + ${testFileCount} test files)`
);
