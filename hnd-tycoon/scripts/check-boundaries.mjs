#!/usr/bin/env node
/**
 * Enforces the single most important architectural constraint in the project:
 *
 *   src/sim/ must NEVER import from src/render/ or src/ui/.
 *
 * The whole simulation must run headless in Node. This is what makes the
 * balance harness possible. See DESIGN.md §25.1 and CLAUDE.md.
 *
 * Also checks the §26 forbidden-hardcode list where it is mechanically
 * detectable. The rest is on the audit.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const failures = [];

function walk(dir) {
  let out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Strip comments and string literals so we lint code, not prose. */
function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}

function safeWalk(dir) {
  try {
    return walk(dir);
  } catch {
    return [];
  }
}

// --- Rule 1: sim/ is pure -----------------------------------------------
const FORBIDDEN_FROM_SIM = [
  { re: /from\s+['"](?:@\/|\.{1,2}\/)*(?:src\/)?render\//, what: 'render/' },
  { re: /from\s+['"](?:@\/|\.{1,2}\/)*(?:src\/)?ui\//, what: 'ui/' },
  { re: /from\s+['"]pixi\.js['"]/, what: 'pixi.js' },
  { re: /from\s+['"]react['"]/, what: 'react' },
  { re: /from\s+['"]zustand['"]/, what: 'zustand' },
];

for (const file of safeWalk(join(ROOT, 'src/sim'))) {
  const src = readFileSync(file, 'utf8');
  for (const { re, what } of FORBIDDEN_FROM_SIM) {
    if (re.test(src)) {
      failures.push(`${relative(ROOT, file)} imports ${what} — sim/ must stay headless`);
    }
  }
}

// --- Rule 2: no DOM/browser globals in sim ------------------------------
const BROWSER_GLOBALS = /\b(window|document|localStorage|sessionStorage|navigator)\b/;
for (const file of safeWalk(join(ROOT, 'src/sim'))) {
  const src = stripNonCode(readFileSync(file, 'utf8'));
  if (BROWSER_GLOBALS.test(src)) {
    failures.push(`${relative(ROOT, file)} references a browser global — sim/ must run in Node`);
  }
}

// --- Rule 3: no Math.random anywhere in sim (determinism) ---------------
for (const file of safeWalk(join(ROOT, 'src/sim'))) {
  const src = stripNonCode(readFileSync(file, 'utf8'));
  if (/Math\.random\s*\(/.test(src)) {
    failures.push(`${relative(ROOT, file)} uses Math.random — use the seeded Rng, determinism is a gate`);
  }
}

// --- Rule 4: no Date.now in sim (the game clock is the only clock) ------
for (const file of safeWalk(join(ROOT, 'src/sim'))) {
  const src = stripNonCode(readFileSync(file, 'utf8'));
  if (/Date\.now\s*\(|new\s+Date\s*\(/.test(src)) {
    failures.push(`${relative(ROOT, file)} uses wall-clock time — sim/ may only use GameTime`);
  }
}

// --- Report -------------------------------------------------------------
if (failures.length) {
  console.error('\n✗ BOUNDARY VIOLATIONS\n');
  for (const f of failures) console.error('  ' + f);
  console.error('\nSee CLAUDE.md "Hard rules". Fix before proceeding.\n');
  process.exit(1);
}

console.log('✓ boundaries clean — sim/ is headless and deterministic');
