# SPEC.md — Game Spec

**World:** One facility, 4 zones — Loading Dock (sparse, tutorial-ish) → Warehouse
(verticality, boxes, lockers) → Laboratory (cameras, laser sensors, keycards L1–L3) →
Comms Tower (finale, heavy patrols). Layout defined as data, not hardcoded meshes.
Locked isometric camera, hold-key peek rotation.

**Player verbs:** walk/run/crouch/crawl, wall-press + corner peek, knock-on-wall,
cardboard box (near-invisible stationary, blown if seen moving), tranq pistol
(12 darts, sleep 60s, headshot instant), CQC grab → choke or throw, drag bodies,
stuff bodies in lockers, hide in lockers, ration heal, chaff grenade (cameras dead
15s, radar jammed).

**Guard FSM (the soul):**
`PATROL → SUSPICIOUS → INVESTIGATE → ALERT → EVASION → CAUTION → PATROL`

- PATROL: waypoints, head-sweep, idle chatter bubbles.
- SUSPICIOUS (partial sight ≥0.4s / faint sound): "?", stare at stimulus 3s,
  escalate on confirm else return.
- INVESTIGATE (strong sound / footprints / open door): walk to stimulus,
  expanding-arc search 8s.
- ALERT (confirmed sight ≥0.8s / body found / gunshot): "!", sting, radio call,
  zone guards converge, reinforcements spawn at zone door (max +3) *(director module — pending)*, radar jams.
- EVASION (sight lost): converge on last-known-position, coordinated 30s sweep.
- CAUTION: 45s heightened — wider cones, tighter routes, pairs — then decay.
- Guards also notice: sleeping/dead colleagues, missed 40s radio check-ins *(director module — pending)* from
  patrol buddies, doors left open, spent darts.

**Vision:** 70° cone, 14m, raycast vs walls, staggered per tick. Detection is a fill
meter. Modifiers: crouch −40%, crawl −70%, darkness −50%, stationary box −95%.

**Sound:** emit radii — run 8m, walk 3m, crouch 1m, knock 10m, dart impact 5m, body
drop 6m, locker 4m. Walls attenuate 50% each.

**Soliton radar (top-right):** live top-down of current zone — walls, player, guards
+ live cones, cameras + cones. Static during ALERT/EVASION and under chaff. The
iconic element; make it gorgeous.

**Music state machine:** procedural WebAudio — sneak ambient → alert sting → combat
loop → evasion tension → caution pads → resolve. Crossfades only.

**Codec:** overlay, two procedural pixel-art portraits, scrolling text + per-character
blip, frequency dial flavor. Calls: mission open, first body, first alert, low darts.

**HUD:** MGS1-style — life top-left, item box bottom-right, weapon box bottom-left,
alert-phase indicator, zone name cards.

**Win state v1:** extract from Comms Tower roof. Rank screen (time, alerts, kills,
darts) — "BIG BOSS" for no-alert no-kill.
