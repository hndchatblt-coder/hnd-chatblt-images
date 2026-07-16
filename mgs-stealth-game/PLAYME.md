# PLAYME.md — v0.30 (regenerated at cycle 30)

Open `game.html` (or `releases/v0.30.html`) — double-click, no server. ENTER
to start. **The game is now winnable: reach the Comms Tower helipad and
extract for a rank. BIG BOSS = zero alerts, zero kills.**

## Controls

WASD/arrows move · SHIFT run · C crouch · Z crawl · E knock · F tranq dart
Q CQC (from behind) · G drag body / stuff in locker / hide in locker · B box
R ration · X chaff grenade · F5 save · F9 load (continues count against rank)

## New since v0.20 (cycles 21–30)

- **The full facility:** Laboratory (keycard doors L1→L2→L3, timed laser
  grids, 3 cameras — the L1 keycard hides in the warehouse's dark corner) and
  the Comms Tower finale (4 interlocking patrols, wide-sweep searchlight
  cameras, extraction at the north helipad).
- **Security cameras** — sweeping cones, alerts that send guards to come
  find you; chaff blinds them 15s. Lasers don't care about chaff or the box.
- **Codec calls** — COMMANDER (140.85) and MEI (141.12) with procedural
  pixel portraits; briefing at start, advice on your first alert, first
  takedown, low darts. SPACE/ENTER to advance.
- **Win state + rank screen** — TIME/ALERTS/KILLS/DARTS/CQC/RATIONS/
  CONTINUES, ranks ELEPHANT → JACKAL → DOBERMAN → HOUND → FOX → BIG BOSS.
- **Save/load** — F5/F9, full sim state, byte-identical resume.
- The cardboard box no longer lets you fire or CQC from inside it (that was
  a bug, not a feature).

## Things to try

1. **Go for BIG BOSS:** the ghost route exists — the test suite walks one
   every run. Dark zones, knocks, and patience.
2. **Chaff the lab's east wing** — its camera watches the L3 keycard with no
   geometric dodge; the bonus chaff in that wing is your refund.
3. **Save before the tower** (F5), try the 4-guard gauntlet loud, F9, try it
   quiet. Continues count against your rank — the pressure is intentional.
4. **Split the pair:** miss a dart on purpose near the warehouse's far guard
   and watch the two patrols pull apart to investigate.

## New since v0.10 (cycles 11–20)

- **It can kill you now.** Guards fire during ALERT (grace beat, then every
  1.5s; moving and standing make you easier to hit). MISSION FAILED → ENTER
  retries. Rations (R, x3) heal.
- **Soliton radar** top-right — live cones; jams to static during ALERT/
  EVASION; chaff (X) jams it blue for 15s (the pop is loud — tradeoff).
- **Full MGS1-style HUD** — life, mission clock, alert counter, phase banner
  with EVASION/CAUTION countdowns, TRANQ/RATION boxes, zone name cards.
- **Procedural music** — sneak ambient, the "!" sting, combat, evasion pulse,
  caution pads, resolve motif. All synthesized, crossfades only.
- **Tranq pistol** (F, 12 darts) — unaware guards drop instantly; alerted
  ones stagger 3s. Missed darts make noise where they land (use it!).
- **CQC** (Q) from behind. **Drag** sleepers (G), **stuff them in lockers**
  (G at a locker) before their friends find them — a spotted body is an
  instant zone-wide ALERT at the body's position.
- **Hide in lockers** (G) or under the **cardboard box** (B) — near-invisible
  while still; blown the moment you move in a cone.
- **The Warehouse** — second zone through the north exit: shelving-aisle
  maze, two guards on interlocking patrols, dark aisle ends. Can't change
  zones mid-alert.

## Things to try

1. **The full cleanup:** dart the warehouse's center-aisle guard, drag him
   into a locker, and watch his buddy's patrol cross the empty lane, none
   the wiser.
2. **Fail loudly on purpose:** miss a dart into a far wall and watch the
   guard investigate the impact point instead of you.
3. **Box camp** in a patrol lane; hold your nerve while the cone sweeps you.
4. **Survive a firefight:** get seen, eat a hit, chaff, break contact, and
   outlast EVASION→CAUTION from inside a locker.

## Not yet in

Laboratory + Comms Tower zones (cameras/keycards/finale), codec calls,
saves, win state + rank screen, reinforcements/radio check-ins. Known gap
(audit A1): firing/CQC from inside the box isn't blocked yet — honor system.
