/**
 * `npm run balance` — the harness (§14). Runs every bot headless and prints the table the brief
 * asks for. CSV alongside, so curves can be looked at rather than guessed at.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bots } from "../harness/bots.js";
import { runSessions } from "../harness/session.js";
import { createWorld } from "../sim/world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const days = Number(arg("days", "90"));
const seed = arg("seed", "42");
const staffCount = Number(arg("staff", "2"));

const rows: string[] = [
  "bot,day,covers,balked,served,revenue,cogs,wages,meanWaitMin,reputation,cash",
];

console.log(`balance harness — ${days} days, seed ${seed}, ${staffCount} staff\n`);
console.log(
  ["bot", "cash", "rep", "cogs%", "labour%", "balk%", "wait"].map((s) => s.padEnd(12)).join(""),
);

for (const bot of bots) {
  const world = createWorld({ seed, staffCount });
  runSessions(world, bot, days);

  for (const d of world.history) {
    const served = d.ordersCompleted;
    rows.push(
      [
        bot.id,
        d.day,
        d.covers,
        d.balked,
        served,
        d.revenue.toFixed(2),
        d.cogs.toFixed(2),
        d.wagesAccrued.toFixed(2),
        (served > 0 ? d.waitSecondsTotal / served / 60 : 0).toFixed(2),
        d.reputationAtClose.toFixed(3),
        "",
      ].join(","),
    );
  }

  const t = world.history.reduce(
    (a, d) => ({
      rev: a.rev + d.revenue,
      cogs: a.cogs + d.cogs,
      wages: a.wages + d.wagesAccrued,
      served: a.served + d.ordersCompleted,
      wait: a.wait + d.waitSecondsTotal,
      covers: a.covers + d.covers,
      balked: a.balked + d.balked,
    }),
    { rev: 0, cogs: 0, wages: 0, served: 0, wait: 0, covers: 0, balked: 0 },
  );

  const cell = (s: string): string => s.padEnd(12);
  console.log(
    [
      cell(bot.id),
      cell(`$${world.cash.toFixed(0)}`),
      cell(world.reputation.toFixed(2)),
      cell(`${((t.rev > 0 ? t.cogs / t.rev : 0) * 100).toFixed(1)}%`),
      cell(`${((t.rev > 0 ? t.wages / t.rev : 0) * 100).toFixed(1)}%`),
      cell(`${((t.covers + t.balked > 0 ? t.balked / (t.covers + t.balked) : 0) * 100).toFixed(1)}%`),
      cell(`${(t.served > 0 ? t.wait / t.served / 60 : 0).toFixed(1)}m`),
    ].join(""),
  );
}

const out = join(ROOT, "reports", "balance.csv");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, rows.join("\n") + "\n");
console.log(`\ncsv → ${out.replace(ROOT + "/", "")}`);
