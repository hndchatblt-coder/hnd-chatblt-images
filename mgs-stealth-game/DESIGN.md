# DESIGN.md — The Five Pillars (Constitution)

This is the anti-drift mechanism. Every BACKLOG.md item must cite exactly one pillar
below. An item that serves no pillar gets rejected at selection time. Re-read this
file whenever a cycle feels unsure of itself — at cycle 80 this is why the game is
still MGS and not tower defense.

1. **Tension** — Being seen should spike the heart rate. Detection must feel like a
   real threat every time, never routine. Guard escalation should be sudden and loud;
   de-escalation should feel earned, not automatic.

2. **Readability** — The player can always predict what guards perceive. Cones,
   detection meters, sound radii, and state indicators must be legible at a glance.
   If a player can't explain *why* they were spotted, readability has failed.

3. **Expression** — 3+ valid routes/tactics exist for any given problem (a guard, a
   room, a locked door). Lethal, non-lethal, distraction, and avoidance must all be
   viable. A level with exactly one solution is a bug.

4. **Consequence** — Mistakes create recoverable chaos, not instant failure. Being
   spotted should escalate into a tense, winnable scramble — not a restart. Death and
   game-over exist, but they are the far end of a long consequence ladder, not the
   first rung.

5. **Toybox** — Systems interact (sound + AI + items + environment) to produce
   unscripted stories. A knock on a wall pulling a guard away from a sleeping
   colleague nobody has found yet is the kind of moment this pillar protects.

## Using this file

- BACKLOG.md items: `title | category | size | pillar | acceptance criteria`.
- DESIGN cycle brief (Section LOOP step 3) must name the pillar being served.
- If a proposed feature doesn't fit any pillar, it does not belong in this game —
  reject it, don't force a citation.
