# PLAYME.md — v0.10 (regenerated at cycle 10)

**The game is playable as of this release.** Double-click `game.html` (or
`releases/v0.10.html`) — no server needed. Press ENTER at the title.

## Controls

WASD / arrows — move · SHIFT — run · C — crouch · Z — crawl · E — knock on wall

## What's new (cycles 1–10)

- The Loading Dock: 40×30m yard, containers, crate stacks, guard hut, two
  shadow zones, exit gap at the north wall (glowing green).
- One guard walking a perimeter patrol with head-sweeps — full MGS FSM:
  PATROL → SUSPICIOUS ("?") → INVESTIGATE → ALERT ("!") → EVASION → CAUTION.
- Live vision cone drawn on the floor, honestly clipped by walls, colored by
  guard state (green/yellow/orange/red/purple/amber). Detection meter fills
  above your head when you're being seen.
- Sound: running is loud (8m), walking 3m, crouching 1m; walls halve every
  sound. E knocks on an adjacent wall (10m lure — guards come to INVESTIGATE).
- Stances change your visibility: crouch −40%, crawl −70%, shadows −50%.

## Things to try

1. **The lure:** crouch behind the west container, knock (E), watch the guard
   leave his route to investigate — then slip north through the shadow strip.
2. **Get seen on purpose:** stand in the open until the meter fills — "!" —
   then break line of sight and watch him hunt your last known position for
   30s before the zone cools down through CAUTION.
3. **Crawl the dark zone** west of the containers while his cone sweeps past.

## Not yet in

Radar, HUD, music, items (box/tranq/CQC), other 3 zones, codec, saves, win
state. The guard can catch you but can't hurt you yet — alerts are for pride.
