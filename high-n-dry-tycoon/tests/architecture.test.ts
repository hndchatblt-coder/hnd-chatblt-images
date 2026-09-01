/**
 * "sim/ never imports from render/ or ui/ — the single most important architectural constraint in
 * this document" (§13). Asserted, not trusted.
 *
 * Also enforces that nothing in the sim reaches for Math.random or the wall clock, either of
 * which would silently break determinism in a way no other test would catch.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
};

const simFiles = walk("src/sim");

/**
 * Source with comments removed. Without this the checks trip over their own documentation —
 * rng.ts explains that `Math.random` appears nowhere in the sim, and that sentence contains the
 * string it is banning.
 */
const code = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

describe("architecture", () => {
  it("has sim files to check", () => {
    expect(simFiles.length).toBeGreaterThan(5);
  });

  it("never imports render or ui from sim", () => {
    const offenders = simFiles.filter((f) => {
      const src = code(f);
      return /from\s+["'][^"']*\/(render|ui)\//.test(src) || /from\s+["']\.\.\/(render|ui)/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("never uses Math.random in the sim", () => {
    const offenders = simFiles.filter((f) => code(f).includes("Math.random"));
    expect(offenders).toEqual([]);
  });

  it("never reads the wall clock in the sim", () => {
    const offenders = simFiles.filter((f) => {
      const src = code(f);
      return src.includes("Date.now") || /new Date\(/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("keeps tunable numbers out of the sim", () => {
    // Not a perfect check, but it catches the obvious slide: a bare decimal literal appearing in
    // simulation code instead of in src/config (§0.3). Small integers and 0/1 are fine.
    const offenders: string[] = [];
    for (const file of simFiles) {
      code(file)
        .split("\n")
        .forEach((line, i) => {
          const matches = line.match(/(?<![\w.])\d+\.\d+/g);
          if (matches) offenders.push(`${file}:${i + 1} ${matches.join(",")}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
