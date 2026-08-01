# CLAUDE.md — operating instructions

You are building **High N' Dry Tycoon**, a portrait-mobile idle automation game about running a burger bar. Read this file every session. It is the contract.

## The three documents

| File | What it is | When to read |
|---|---|---|
| `docs/DESIGN.md` | The full design spec. The **what** and the **why**. | Before any design or balance decision. Search it rather than guessing. |
| `docs/BUILD_PLAN.md` | The 20 steps in order, with exit criteria. The **when**. | Start of every session. |
| `docs/STATE.md` | Living progress log. The **where we are**. | Start of every session; update at the end. |

`docs/DESIGN.md` is the source of truth. If this file and the spec disagree, the spec wins — and tell me about the contradiction.

## Session protocol

1. Read `docs/STATE.md` to find the current step, and `docs/QUESTIONS.md` for
   anything unresolved that blocks it.
2. Read that step in `docs/BUILD_PLAN.md`, and the spec sections it references.
3. **Questions first.** Before writing any code, list every ambiguity you can
   see in this step, in one message. Then wait. See below.
4. Do **one step**. Not two. If you finish early, stop and say so.
5. Run `npm run gate`.
6. Run the adversarial audit (`docs/AUDIT.md`) against your own work. Fix what it finds.
7. Update `docs/STATE.md` — what shipped, what you learned, what's next, anything that surprised you.
8. Commit with a message describing **what is now playable**, not what files changed.

## Questions-first protocol

Ben wants to be asked on genuine ambiguity rather than have you guess. That
only works if you **batch**, so honour it like this:

- **Front-load.** Read the whole step, find every ambiguity, ask them together
  in one message before you start. Do not trickle questions mid-build — a
  question every twenty minutes is worse than a wrong call.
- **Ask well.** State the options, state your recommendation, state what each
  choice costs. "Should the grill be 2×1 or 3×1? I'd say 2×1 — 3×1 makes
  Rosebery's 7-wide floor nearly unbuildable" is answerable in five seconds.
  "How should stations be sized?" is not.
- **Never invent an answer to a design question and proceed quietly.** That is
  the specific failure this protocol exists to prevent.
- **If something surfaces mid-build and isn't blocking:** append it to
  `docs/QUESTIONS.md`, keep going, and raise it in your session summary.
- **If it IS blocking:** stop and ask. Stopping is a good outcome.
- Pure implementation choices are yours — file layout, helper names, test
  structure. Those are not ambiguities, they're your job.

Good: `step 3: layout now affects throughput — grill 6 tiles from pass costs 14% of covers`
Bad: `add pathfinding, update types, fix tests`

## Hard rules

These are not preferences. `npm run boundaries` enforces the first four automatically.

1. **`src/sim/` never imports from `src/render/` or `src/ui/`.** The whole simulation runs headless in Node. This is what makes the balance harness possible, and the harness is how this game gets tuned. It is the most important constraint in the project.
2. **No `Math.random` in `sim/`.** Use `world.rngFor('systemName')`. Determinism is a gate.
3. **No `Date.now()` or `new Date()` in `sim/`.** The game clock is the only clock. Real time enters only through offline accrual, which caps it before it touches anything.
4. **No browser globals in `sim/`.**
5. **Zero magic numbers outside `src/config/`.** If you are typing a number into a system file, it belongs in config. No exceptions, including "temporary" ones.
6. **Never `localStorage`/`sessionStorage`.** Saves go through `src/save/` to IndexedDB.
7. **Check `docs/DESIGN.md` §26 every step**, not just at the end. It is the forbidden-hardcode list, and every item on it is cheap today and a rewrite later.

## What "done" means

A step is done when its exit criteria in `BUILD_PLAN.md` **actually pass**, verified by running them.

Do not report a gate as passing without running it. Do not describe a criterion as "essentially met". If a criterion doesn't pass, say which one, say why, and stop. Stopping is a good outcome. Quietly proceeding is not.

If you disagree with a step's design, say so before building it, not after.

## Commands

```bash
npm run gate         # boundaries + typecheck + test + balance. Run before every commit.
npm run sim -- --days 7 --seed 42
npm run balance      # policy-bot harness
npm test             # vitest
npm run boundaries   # architecture enforcement
npm run typecheck
```

## Where things go

```
src/sim/          pure TypeScript, Node-runnable, zero render deps
  world.ts        tick orchestration + system registry
  clock.ts        the only clock
  rng.ts          seeded PRNG with named streams
  entities/       customer, staff, station, machine, item, order, site
  systems/        arrivals, tasking, production, automation, service, reviews,
                  economy, morale, incidents, specials, contracts, ladder,
                  bottleneck, routing, supply
  fastsim/        closed-form model — first-class, foundation of later acts
  policy/         delegation layer (step 25)
src/config/       ALL tunables. Every number in the game.
src/render/       PixiJS. shapes/ holds the ShapeRegistry.
src/ui/           React HUD over the canvas
src/save/         versioned migrations, IndexedDB
src/harness/      balance runner + policy bots
src/telemetry/    local event log, exportable JSON
scripts/          CLI entry points
tests/            vitest
```

## Design instincts to hold

Short version of the spec's spine. When a judgement call comes up, these are the tiebreakers.

- **Every dial must fight another dial.** If a stat can be maximised with no downside, the design is wrong.
- **Automation buys back attention, not time.** Every machine trades a labour problem for at least two of: capital, floor space, utilities, flexibility, reliability. A machine that is strictly better than its absence is a stat upgrade in a costume — cut it or cost it.
- **Every upgrade must show on screen.** Install beat, idle signature, working signature. If you can't design a visible signature for something, it shouldn't exist.
- **There is no art milestone.** From step 5 onward, every step ships something visibly better than the last.
- **The player can never lose.** No fail screen, no reset, no prestige. The worst available outcome is a slow, boring, unprofitable week.
- **Attention is rewarded, never required.** Nothing may ever require the player to be present at a specific real-world moment.
- **Never hand-tune balance by playing.** Tune with the harness, verify by playing.
- **Tone: affectionate, grimy, Australian hospitality, played straight.** Never wink. Nobody in this game says the word "army".

## Things that will tempt you and are wrong

- Adding an upgrade that just increases a number. It is banned by pillar and by audit.
- Deferring visuals to "a polish pass later". There is no later; the step gates on it.
- Putting a constant inline "just for now".
- Building two steps at once because they feel related.
- Reporting success on a gate you didn't execute.
- Reaching for `Venue` when the type is `Site`, or `number` when the type is `Money`. Later acts depend on these.
- Solving a spec ambiguity by picking silently. Ask, or note it in `STATE.md` and flag it.

## Working with the pending gates

`tests/gates.pending.test.ts` holds the exit criteria for every upcoming step,
written as `it.todo`. When you start a step:

1. Find its block and convert the todos into real failing tests.
2. Watch them fail. Confirm they fail for the right reason.
3. Make them pass.

This is deliberate. It converts a prose exit criterion into red/green and
removes the temptation to call a vague gate "essentially met". Do not delete a
pending gate because it's inconvenient — if a gate is wrong, change it
deliberately and log it in `docs/DECISIONS.md`.

## Acts III–V are confirmed, not hypothetical

Ben has confirmed the five-act scope (shop → group → nation → drone fleet →
orbit) is real intent, not a riff. This matters because the architecture in
`src/sim/types.ts` and DESIGN.md §26 carries genuine ceremony for it — typed
`Money`, generic `Route`, `Site` rather than `Venue`, `controlLatencyHours`
sitting inert until Act V.

**Do not simplify any of it, and do not propose simplifying it.** It looks like
over-engineering for a game about one burger shop. It is insurance on a
decision that has already been made, and each item is cheap now and a rewrite
later.

## Types that exist to stop you

`src/sim/types.ts` turns the §26 forbidden-hardcode list into compile errors.
Use them:

- `Money`, not `number`, for anything financial. Integer cents, currency-tagged,
  refuses to mix currencies. The P&L reconciling to the cent is a step 6 gate
  and float dollars will fail it.
- `Site` and `SiteKind`, not `Venue`. A venue is one kind of site.
- `ReputationMap`, not `dineInRep`/`deliveryRep` fields.
- `Route` and `VehicleClass`, not truck-specific code. Note `controlLatencyHours` —
  it's zero in Act II and it's the whole of Act V.
- `Tiles` and `GameTime` are branded. You cannot accidentally pass pixels or
  wall-clock milliseconds where they belong.

If you catch yourself widening one of these to `number` to make something
compile, stop — that is the error the type was placed there to catch.

## Real numbers pending

`src/config/` currently holds invented figures — prices, rents, prep times,
foot traffic. Ben is filling in `docs/REAL_NUMBERS.md` with actual High N' Dry
operating data.

Until that lands: build against the invented numbers, but **treat every one of
them as provisional**. Do not build anything that depends on a specific value
being what it currently is, and do not tune balance against them — the whole
economy shifts when the real figures arrive. Note in `STATE.md` which configs
are still invented.

## Current status

See `docs/STATE.md`. Step 1 is complete and verified — use it as the pattern for everything that follows: config-driven, tested, deterministic, documented at the top of the file with a spec reference.
