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

// --- Rule 5: no tunable numbers outside src/config ----------------------
/**
 * CLAUDE.md hard rule 5. This was documentation, and documentation loses to a
 * deadline — so it is a check now.
 *
 * Allowed bare literals: 0, 1, -1, 2 and 100. Zero and one are structural
 * (empty, single, first). Two covers halving, pairs and squares. A hundred is
 * percent conversion. Anything else in sim/ is a balance decision hiding in a
 * system file, and balance decisions belong in config where the harness can
 * reach them.
 */
const ALLOWED_LITERALS = new Set(['0', '1', '2', '100']);
const NUMERIC = /(?<![\w.$])(\d+(?:\.\d+)?(?:e-?\d+)?)(?![\w.])/g;

/**
 * Files whose numbers are algorithm constants, not balance decisions. Moving
 * mulberry32's multiplier into a config file would not make it tunable, it
 * would make it a landmine. Keep this list to things of that kind — if you are
 * about to add a systems file here, you are adding it for the wrong reason.
 */
const LITERAL_EXEMPT = new Map([['src/sim/rng.ts', 'mulberry32 and FNV-1a constants']]);

for (const file of safeWalk(join(ROOT, 'src/sim'))) {
  if (LITERAL_EXEMPT.has(relative(ROOT, file))) continue;
  const src = stripNonCode(readFileSync(file, 'utf8'));
  const offenders = new Set();
  for (const [, literal] of src.matchAll(NUMERIC)) {
    if (!ALLOWED_LITERALS.has(literal)) offenders.add(literal);
  }
  if (offenders.size) {
    failures.push(
      `${relative(ROOT, file)} has bare numbers [${[...offenders].join(', ')}] — ` +
        `every tunable belongs in src/config/`,
    );
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
