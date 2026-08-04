# KICKOFF — paste this into Claude Code

Copy the block below as your first message to Claude Code, from inside the
project directory.

---

Read `CLAUDE.md`, then `docs/STATE.md`, then `docs/QUESTIONS.md`, then the
current step in `docs/BUILD_PLAN.md`.

Step 1 is complete and verified — use it as the pattern: config-driven,
deterministic, tested, with a comment at the top of each file citing the
relevant `docs/DESIGN.md` section.

Before you write anything, tell me:
1. Which step you're doing and what its exit criteria are.
2. Which spec sections you've read for it.
3. **Every ambiguity in this step, batched into one message**, each with the
   options, your recommendation and what each choice costs. I'd rather answer
   six questions once than one question six times.
4. Anything in the spec you disagree with.

Then wait for my answers before building.

Then build that one step. Run `npm run gate`. Run `docs/AUDIT.md` against your
own work and fix what it finds. Update `docs/STATE.md`. Commit.

Do not start step 3.

---

## If Claude Code drifts

These are the corrections you'll most likely need. Short and direct works best.

- *"That's two steps. Do step N only."*
- *"You reported the gate passing. Show me the output."*
- *"That number belongs in `src/config/`."*
- *"What new problem does that machine create? If none, cut it."*
- *"What does that look like on screen? If nothing, it doesn't ship."*
- *"Update STATE.md before you commit."*
- *"That's a design question. Ask it, don't guess it."*
- *"Batch that with the rest and ask me at the start of the next step."*
- *"That number is provisional — don't build around it."*
- *"Re-read DESIGN.md §26 and check this against it."*

## Rebuilding context after a reset

`docs/STATE.md` is the recovery file. If Claude Code loses the thread, point it
at STATE.md and CLAUDE.md and it should be able to resume without re-reading
the whole spec.

If STATE.md is stale, that's the real bug — it means a session ended without
updating it. Fix that habit early.
