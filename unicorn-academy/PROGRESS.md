# Build progress

_Maintained by the build session. Milestones ticked as they verify._

Build plan (canonical order per CLAUDE.md §2 / SPEC <scope>):

- [x] 0. Harness self-test (`node verify.js stub-game.html` → 0 failures) — DONE 2026-07-17
- [x] 1. Skeleton: template + build step, app shell, screen manager, error handler, save system,
       data schemas, generic activity engine + 5 widgets (tap-choice, drag-to-slot, tap-each,
       tap-sequence, flip-pairs)
- [x] 2. Speech helper (phoneme table, chunking, iOS resume) + music engine (pentatonic bed,
       mix bus, ducking) + SFX grammar (chime/boop/flourish/fanfare)
- [x] 3. Map hub + unicorn rig + first-run flow (create-a-unicorn → her name → story) + dev panel
- [x] 4. Zone: Letter Meadow (R1–R3) → verify
- [x] 5. Zone: Number Mountain (M1–M9) → verify
- [x] 6. Zone: Memory Clouds (P1, P4, peek-a-boo) → verify
- [x] 7. Zone: Word Garden (R4–R8) → verify
- [x] 8. Zone: Puzzle Falls (P2, P3, P5, P6) → verify
- [x] 9. Zone: Crystal Castle (royal challenges) + Rainbow Royale endgame → verify
- [x] 10. Rewards: gems, praise, rainbow-meter party, Sparkle Boutique (~30 items + treats +
       seeds), sticker album, daily gift, milestone ceremonies + Memory Book,
       eggs + naming + growth
- [x] 11. Fun layer: stable, kitchen, music meadow, dress-up mirror, hide-and-seek
- [x] 12. Polish: day/night, map bloom, surprise events, silly event days, session pacing,
       grown-ups' corner + adult gate, interleaving/plateau/spaced review proofs
- [x] 13. Final: verify.js clean, all manual SPEC <verification> items proven via ?dev=1,
       every screenshot in shots/ reviewed

All milestones verified 2026-07-17. Final state: `node verify.js` = 0 failures / 0 warnings;
25/25 stages bot-driven at min+max levels with zero console errors; engine rules, eggs+naming,
growth-by-treats, meter party, rest offer, boutique two-step, adult gate + dashboard, coronation,
Rainbow Royale payout, hide-and-seek, silly days, surprise events and corrupt-save recovery all
proven via ?dev=1 scripts; real pointer interactions proven for drag / flip-pairs / jigsaw /
tap-each / maze. Remaining real-device items (headless has no TTS voices): narration quality,
music ducking feel, and touch feel on the actual iPad.

Polish round 2 (2026-07-17, all verified — verify.js 0/0, 25/25 stage sweep, engine-rules,
life-systems, real-touch all green): zone scenes + icon-carrying transitions; Kokoro baked-voice
pipeline (tools/ + audio clip layer, TTS fallback); content expansion (frames 6-8 per key + 16 new
stage keys, 24 sentences, 12 jokes, 24 praise, kitchen/pet line tables); host reactivity + maze
trail + 4 jigsaw compositions; egg-on-map, deterministic reviews, rotation re-render, parent
backup codes, /academy.html deploy.
