# ADVERSARIAL AUDIT

Run this against your own work at the end of every step, **before** reporting
the step complete. Answer in writing in your session summary. Fix what it finds
first, then report.

The point of this is to catch the failure modes that look like success. Answer
honestly — "I couldn't name one" is a useful answer and a signal to redesign.

## Gameplay

1. Name a decision the player makes as a result of this step where **both
   options are defensible**. If you can't, the step added no gameplay.
2. Is there any stat that can now be maximised with no downside? Name it or
   confirm none.
3. Did anything added this step become strictly better than its absence?
   Especially automation.
4. Can the player state their next two goals without opening a menu?
5. Is the current bottleneck nameable, quantified, and correct? Spot-check
   three scenarios by hand against the readout.
6. What is the longest decision-free gap in the harness this step?

## Architecture

7. Did you hardcode anything on the DESIGN.md §26 forbidden list? Check it
   item by item — currency, wage rules, reputation, site type, placement,
   routing, camera tiers, trading day, staff scope, ladder, bottleneck logic,
   distance/latency.
8. Did any number get hardcoded outside `src/config/`? List and fix.
9. Does `sim/` import from `render/` or `ui/`? (`npm run boundaries`.)
10. Same seed, same output? Verify by running it, don't assume.

## Presentation

11. Does every item added this step have an install beat, an idle signature and
    a working signature? Name them.
12. Which density stage (DESIGN.md §21.1) is the game at, and does it match
    this step's target?
13. Screenshot the game at three points in a run. Do they look like different
    games?
14. Does every new UI element work with a thumb, in portrait, at 390px wide,
    with no hover state?
15. Does every new shape read at 12px?
16. Play a full service **muted**. Was anything missed?
17. Any tap anywhere that doesn't acknowledge within 100ms? Any dropped frames
    during a rush on the target device?
18. As density rose this step, what filtering did you add to keep it legible?

## Discipline

19. Does any new system reward opening the app more than twice a day? It must not.
20. Does the oldest venue still matter?
21. What's the most boring 60 seconds of play right now, and what would fix it?
22. Is the newest system *visible*? If the player can't see it working, it may
    as well not exist.
23. What did you build that nobody asked for? Justify it or delete it.
