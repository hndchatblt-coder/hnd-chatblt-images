# High N' Dry Tycoon

A portrait-mobile idle automation game about running a burger bar. Customers
arrive, you lay out a kitchen, hire staff, automate the line, and try not to
market yourself into a queue you can't serve.

Built on real hospitality operations. You cannot lose — you can only make
expensive mistakes.

## Quick start

```bash
npm install
npm run gate                        # boundaries + typecheck + tests + balance
npm run sim -- --days 7 --seed 42   # headless simulation run
```

## Documents

- **`CLAUDE.md`** — operating instructions. Read first.
- **`docs/DESIGN.md`** — the full design spec. Source of truth.
- **`docs/BUILD_PLAN.md`** — 20 steps to a complete Act I.
- **`docs/STATE.md`** — where the build currently is.
- **`docs/AUDIT.md`** — the per-step adversarial audit.
- **`docs/DECISIONS.md`** — deviations from spec, with reasons.
- **`docs/QUESTIONS.md`** — open design questions. Ben answers, Claude Code adds.
- **`docs/REAL_NUMBERS.md`** — fill-in template for actual operating figures.
- **`docs/KICKOFF.md`** — the first message to paste into Claude Code.

## The one architectural rule

`src/sim/` never imports from `src/render/` or `src/ui/`. The entire simulation
runs headless in Node, which is what makes the balance harness possible.
`npm run boundaries` enforces it and the build fails if you break it.

## Status

Step 1 of 20 complete, plus a Step 0 foundations pass. Phase A (headless
engine) in progress.

- 40 tests passing, 32 pending gates awaiting their step.
- `src/sim/types.ts` makes the spec's forbidden-hardcode list a compile error.
- CI runs the gate and asserts byte-identical simulation output.
