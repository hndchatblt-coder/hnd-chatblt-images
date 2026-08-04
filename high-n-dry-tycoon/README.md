# High N' Dry Tycoon

A burger-shop tycoon sim. Customers come in off the street, order, and wait. You buy equipment,
hire staff, and lay out a physical kitchen so food gets out fast. Marketing brings more customers;
capacity decides whether that was a good idea.

Built to `docs/BRIEF_v2.md`, milestone by milestone, gate by gate.

## Commands

```
npm run sim -- --days 7 --seed 42    # headless sim, day report to console
npm run balance                       # policy bots over 90 days, table + reports/balance.csv
npm run test                          # unit, determinism and architecture tests
npm run typecheck
npm run gate                          # typecheck + tests + the current milestone gate
```

## The one architectural rule

`src/sim` never imports from `src/render` or `src/ui`. The whole simulation runs headless in
Node. This is what makes the balance harness possible, and a test asserts it rather than trusting
it — along with "no `Math.random` in the sim", "no wall clock in the sim", and "no tunable numbers
outside `src/config`".

## Where things live

```
src/config/   every tunable. Zero magic numbers in simulation code.
src/sim/      pure TypeScript, Node-runnable, deterministic
src/harness/  policy bots, the session model, parameter sweeps
src/cli/      sim, balance and gate entry points
```

## Status

**M0 — headless core. Gate green.** See `PROGRESS.md`.
