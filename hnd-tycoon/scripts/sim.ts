/**
 * Headless simulation runner.
 *
 *   npm run sim -- --days 7 --seed 42
 *
 * Output must be BYTE-IDENTICAL for a given seed. That is a gate, checked in
 * tests/determinism.test.ts. If you change system registration order or add a
 * new consumer of the shared RNG, this output changes — use world.rngFor(name)
 * to take a named stream instead.
 */
import { buildScenario } from '@/sim/scenario';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

function optionalNumber(name: string): number | null {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return null;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) ? value : null;
}

const days = Number(arg('days', '7'));
const seedRaw = arg('seed', '42');
const seed = Number.isNaN(Number(seedRaw)) ? seedRaw : Number(seedRaw);
const siteId = arg('site', 'leichhardt');
const arrivalsPerHour = optionalNumber('arrivals');

const world = buildScenario({ seed, siteId, arrivalsPerHour });
world.runDays(days);

const lines: string[] = [];
lines.push(`HIGH N' DRY TYCOON — headless run`);
lines.push(`site=${world.state.site.name} seed=${seed} days=${days}`);
lines.push(''.padEnd(72, '-'));
for (const r of world.dayReports) {
  const cells = Object.entries(r.lines)
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');
  lines.push(
    `D${String(r.dayIndex).padStart(3)}  dow=${r.dayOfWeek}  hours=${r.tradingHours}  ${cells}`,
  );
}
lines.push(''.padEnd(72, '-'));

const totalCovers = world.dayReports.reduce((sum, r) => sum + Number(r.lines['covers'] ?? 0), 0);
const totalArrived = world.dayReports.reduce((sum, r) => sum + Number(r.lines['arrived'] ?? 0), 0);
lines.push(`arrived: ${totalArrived}   covers: ${totalCovers}   days: ${world.dayReports.length}`);
lines.push(`clock: ${world.clock.format()}`);

console.log(lines.join('\n'));
