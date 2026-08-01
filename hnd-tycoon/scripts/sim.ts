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
import { World } from '@/sim/world';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const days = Number(arg('days', '7'));
const seedRaw = arg('seed', '42');
const seed = Number.isNaN(Number(seedRaw)) ? seedRaw : Number(seedRaw);

const world = new World({ seed });

// Systems register here as they are built. Step 1 has none.
// world.register(new ArrivalsSystem()).register(new ProductionSystem()) ...

world.runDays(days);

const lines: string[] = [];
lines.push(`HIGH N' DRY TYCOON — headless run`);
lines.push(`seed=${seed} days=${days}`);
lines.push(''.padEnd(52, '-'));
for (const r of world.dayReports) {
  const cells = Object.entries(r.lines)
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');
  lines.push(`D${String(r.dayIndex).padStart(3)}  dow=${r.dayOfWeek}  hours=${r.tradingHours}  ${cells}`);
}
lines.push(''.padEnd(52, '-'));
lines.push(`days reported: ${world.dayReports.length}`);
lines.push(`clock: ${world.clock.format()}`);

console.log(lines.join('\n'));
