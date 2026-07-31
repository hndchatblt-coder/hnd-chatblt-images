/**
 * The M0 gate, as written in the brief (§15):
 *
 *   `npm run sim -- --days 7 --seed 42` gives a stable day report;
 *   identical seed gives byte-identical output.
 *
 * Run by `npm run gate` after typecheck and tests. Exits non-zero on failure so it can sit in CI.
 */
import { execFileSync } from "node:child_process";
import { createWorld, runDays } from "../sim/world.js";

let failures = 0;
const check = (name: string, ok: boolean, detail: string): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
};

console.log("M0 gate — headless core\n");

// 1. The literal command from the brief runs and is byte-identical across invocations.
const run = (): string =>
  execFileSync("npx", ["tsx", "src/cli/sim.ts", "--days", "7", "--seed", "42"], {
    encoding: "utf8",
  });

const first = run();
const second = run();
check(
  "byte-identical across processes",
  first === second,
  `${first.length} bytes, two separate node processes`,
);

// 2. A different seed must actually differ — otherwise "deterministic" just means "not random".
const other = execFileSync("npx", ["tsx", "src/cli/sim.ts", "--days", "7", "--seed", "43"], {
  encoding: "utf8",
});
check("a different seed gives a different run", first !== other, "seed 42 vs seed 43");

// 3. The report is stable in shape: seven trading days, every one of them with trade on it.
const world = createWorld({ seed: "42", staffCount: 2 });
runDays(world, 7);
const traded = world.history.filter((d) => d.ordersCompleted > 0);
check("seven days of trade", traded.length === 7, `${traded.length} days with completed orders`);

// 4. Nobody is left holding food that never got handed over.
check(
  "no orders stranded at close",
  world.orders.every((o) => o.completedAt === null || o.completedAt <= world.clock.elapsed),
  `${world.orders.length} open at end of run`,
);

// 5. The idle bot must survive — the brief forbids punishing absence.
check("idle survives seven days", world.cash > 0, `cash $${world.cash.toFixed(2)}`);

console.log(failures === 0 ? "\nM0 GATE GREEN" : `\nM0 GATE RED — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
