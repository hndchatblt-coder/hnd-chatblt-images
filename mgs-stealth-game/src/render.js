// src/render.js
// PUBLIC API:
//   Game.createRenderer({ container, zone }) -> renderer
//     container — DOM element the canvas is appended into (boot owns the
//                 element; this module never queries the document for it).
//     zone      — a Game.ZONES.* zone (src/world.js shape: bounds, walls,
//                 darkZones, exit, waypoints, playerSpawn) used to build the
//                 STATIC scene (floor/walls/darkzones/exit) and size the
//                 camera frustum. Defaults to Game.ZONES.loadingDock.
//
//   renderer.syncScene(engine) — builds the static scene once (floor, walls,
//     darkZone overlays, exit quad) on first call, then updates every DYNAMIC
//     object (player, guards, vision cones, marker sprites, detection meter)
//     from the live engine state. Safe to call every frame; the "build once"
//     part is idempotent (guarded by an internal flag), the "update" part is
//     not (it always re-reads engine.player/engine.guards/engine.squad).
//
//   SLEEPING GUARDS (new — see src/guardAI.js's SLEEPING contract): a guard
//   with state === "SLEEPING" is posed lying flat (a scale trick on the same
//   body mesh every other guard uses — no separate geometry/model), its nose
//   cone and vision cone/cone-edge hidden (a sleeping guard perceives
//   nothing, so nothing to draw), and a bobbing "Zzz" sprite (a CanvasTexture
//   glyph, same technique as the existing "?"/"!" state markers) floats above
//   it — the bob is driven by engine.time (deterministic, no Date.now, same
//   rule as every other animation in this file).
//
//   STUNNED GUARDS (new — CQC THROW cycle, see src/guardAI.js's STUNNED
//   contract): UNLIKE a SLEEPING guard, a STUNNED one is still upright on its
//   feet — dazed, not unconscious — so it keeps the normal standing body pose
//   (placeActor, STAND_H) rather than SLEEPING's lying-flat scale trick, just
//   with a small side-to-side rotation.z WOBBLE (a deterministic sine of
//   engine.time, same "no Date.now" rule as every other animation here) so it
//   visibly reads as swaying on its feet. Vision cone/cone-edge and the usual
//   "?"/"!" state marker are hidden (a stunned guard perceives nothing, same
//   as SLEEPING — nothing to draw), replaced by a bobbing yellow "dizzy dots"
//   sprite (a CanvasTexture glyph, same technique as the ZZZ sprite above)
//   floating above its head. The actual displacement/collision-sliding that
//   put the guard here is entirely engine-side (src/engine.js's THROW VERB,
//   world.moveCircle) — this module only ever reads guard.x/guard.y/
//   guard.state and draws whatever it finds, exactly like every other guard
//   pose in this file.
//
//   DART TRACER (new — see src/items.js/src/engine.js's fire-verb contract):
//   a thin bright line from the player's muzzle to the dart's impact point,
//   fading out over TRACER_DURATION_S (~0.25s). CONTRACT NOTE: this is
//   spawned by reading engine.events for a "tranqFired" event (which carries
//   `impact`, see src/engine.js's tranqFired event shape) INSIDE syncScene —
//   engine.events holds only the MOST RECENT tick()'s events (cleared at the
//   top of every tick(), per src/engine.js's own contract), and boot.js's
//   frame loop calls renderer.render() (which calls syncScene) once per
//   ANIMATION FRAME, AFTER draining however many fixed-timestep ticks that
//   frame's accumulator called for — so this only sees a tranqFired event
//   that happened on the LAST tick of a given frame's catch-up loop. A player
//   mashing fire fast enough to trigger it more than once inside a single
//   animation frame (input is edge-triggered to begin with, so this requires
//   an extreme frame hitch) could miss a tracer spawn; an honest, documented
//   gap, not a silent one, same shape as this file's own zone-change/actor-
//   rebuild contract notes elsewhere.
//
//   PLAYER HIDDEN (new — CQC/locker cycle, see src/engine.js's LOCKER VERB
//   contract): while engine.playerHidden is true, the player's own body/nose
//   meshes are dimmed and made to blink — opacity driven by a deterministic
//   sine of engine.time (same "no Date.now" rule as every other animation in
//   this file), oscillating roughly 0.25-0.6 alpha rather than snapping to a
//   single fixed dim value, so it visibly reads as "blinking," not just
//   "dimmer." Both materials are marked transparent:true once, at actor
//   creation, so this per-frame opacity write is the only cost — no new
//   geometry/material churn. RADAR NOTE: src/radar.js is NOT touched this
//   cycle (out of scope for this file's own change set — see this cycle's
//   design brief) — the radar view keeps drawing the player triangle at full
//   brightness while hidden; only THIS (the 3D scene) reflects playerHidden.
//   A dragged (SLEEPING) guard's actor needs no special-casing here at all:
//   it already renders every frame from guard.x/guard.y via the normal
//   SLEEPING pose path below, and src/engine.js's DRAG VERB overwrites those
//   same x/y every tick to trail the player — so a dragged body is already
//   drawn "following the player" for free, with zero render.js changes.
//
//   BOX DISGUISE (new — box/chaff/ration cycle, see src/engine.js's BOX VERB
//   contract): while engine.inventory.boxOn is true, the player's actor is
//   drawn as a cardboard-brown crate instead of its normal steel-blue body —
//   a pure cosmetic re-skin of the SAME body mesh every other pose already
//   uses (no new geometry, same trick as the SLEEPING pose's scale-and-
//   reposition above): scaled up slightly on X/Z (BOX_FOOTPRINT_SCALE,
//   "slightly larger than the player") and to a fixed BOX_HEIGHT regardless
//   of stance (a box has no crouch/crawl pose), body.material.color swapped
//   to BOX_COLOR, and the nose (facing wedge) HIDDEN — a box gives no
//   external hint which way the player inside it is actually facing. This
//   override runs AFTER placeActor() every frame (placeActor's own
//   stance-driven scale/nose-visible writes are for the un-boxed case) and
//   is unconditionally reset to the normal PLAYER_COLOR/nose-visible
//   whenever boxOn is false, so a single frame right after taking the box
//   off never shows a stale brown tint. Purely cosmetic — see
//   src/engine.js's BOX VERB contract for the actual perception-discount
//   mechanics this has no bearing on.
//
//   SECURITY CAMERAS (director cycle, see src/director.js contract): each
//   engine.director.cameraStates() entry gets a small dark wall-mounted
//   housing (never re-posed — cameras are fixed hardware) plus a pivoting
//   cone fan, same raycast-clipped-fan technique as a guard's own vision
//   cone (see updateCameraCone below), recolored every frame. NEW
//   (readability polish, cycle 18 backlog item — camera meter visibility):
//   grey/dim while camState.disabled (chaff), otherwise a CONTINUOUS cyan ->
//   amber -> red ramp keyed by camState.meter, via the SAME pure helper
//   Game.radarCameraColor(meter) src/radar.js's own 2D camera cone/dot uses
//   (radar.js loads before render.js in both build.js's ORDER and test.js's
//   LOGIC_ORDER — see both files' own module lists — so Game.
//   radarCameraColor is always defined here) — replaces the old 3-state
//   discrete NORMAL/ALERT/DISABLED palette (pale cyan / red / grey) with a
//   continuously-interpolated color, so a camera visibly warming up toward a
//   sighting reads exactly like the radar's own meter does, not just a
//   binary flip once SUSPICIOUS_AT is crossed. Each camera actor now owns
//   its OWN cone/edge materials (rather than sharing one of three fixed
//   materials keyed by state) since a continuous ramp means every camera can
//   sit at its own distinct color at any given frame — see
//   ensureCameraActor/updateCameraCone below. Rebuilt/disposed on a zone
//   change exactly like guard actors (disposeCameraActors, called alongside
//   disposeGuardActors — see ZONE CHANGES below).
//
//   DOORS / LASERS / PICKUPS (new — Laboratory cycle, see src/world.js's
//   doors/lasers/pickups schema notes and src/engine.js's own DOORS/PICKUPS
//   contract):
//     - DOORS: one lock-color-coded slab per zone.doors entry (L1 blue, L2
//       amber, L3 red, unlocked a neutral grey-green — same palette family
//       src/radar.js uses), rebuilt/disposed on a zone change exactly like
//       guard/camera actors. Re-colored (dimmed) every frame once
//       engine.world.isDoorOpen(id) reads true — the slab stays in the
//       scene (so its footprint/lock-color history is still legible) but
//       reads as "open" rather than physically vanishing, matching the
//       same "structural, not momentary" posture src/radar.js's own door
//       styling note explains.
//     - LASERS: a bright red THREE.Line per zone.lasers entry, visibility
//       toggled straight off director.laserStates()[i].active every frame —
//       since `active` itself already flips on/off with the duty cycle,
//       this simple visibility toggle IS the "blinking with duty cycle"
//       the spec calls for, no separate blink timer needed.
//     - PICKUPS: a small glowing gold box per zone.pickups entry, visibility
//       toggled off once collected (keycard pickups only — inferred from
//       engine.inventory.keycards[level], same HONEST GAP as
//       src/radar.js's own pickups field: a "chaff" pickup has no
//       persistent per-index collected flag exposed outside engine.js's
//       private bookkeeping, so its actor keeps glowing after collection;
//       cosmetic only, tracked in BACKLOG.md).
//
//   HIT FLASH (new — feedback cycle, see src/engine.js's playerHit event
//   contract): a full-viewport translucent red overlay + a red tint pulse on
//   the player mesh, both driven by the same timer. On seeing a "playerHit"
//   event in engine.events (same same-tick-event pattern as DART TRACER
//   above), a closure var hitFlashStart is SET to engine.time (not pushed
//   onto a list) — a second hit before the first has faded just resets the
//   clock rather than stacking/adding, per this cycle's design brief ("stacks
//   sanely", i.e. doesn't). alpha ramps from HIT_FLASH_ALPHA_MAX down to 0
//   linearly over HIT_FLASH_DURATION_S, computed every frame from
//   engine.time - hitFlashStart (deterministic, no Date.now — same rule as
//   every other animation in this file). The overlay itself is a plane
//   parented to `camera` (see "scene.add(camera)" below — a camera normally
//   never needs to be IN the scene graph, but making it so lets a child mesh
//   sit at a fixed camera-local offset and be scaled to exactly (camera.right
//   - camera.left) x (camera.top - camera.bottom) every frame, which for an
//   ORTHOGRAPHIC camera means it exactly fills the viewport regardless of
//   resize — no perspective divide to fight). depthTest:false plus always
//   being the object nearest the camera (local z = -1, versus every world
//   object being many units away) keeps it drawn on top of everything else.
//   The player-mesh tint reuses whatever base color the BOX DISGUISE block
//   above just set (PLAYER_COLOR or BOX_COLOR) and lerps it toward
//   PLAYER_HIT_TINT_COLOR by the same normalized alpha, so a boxed player
//   still visibly flinches red on a hit.
//
//   KNOCK / FOOTSTEP RIPPLES (new — BACKLOG 6d, Readability pillar: "show the
//   player their own noise"): expanding, fading ring outlines (THREE.LineLoop,
//   same raycast-free circle-of-points technique as the cone rims, just not
//   raycast-clipped) drawn at CONE_Y-ish height. Two producers:
//     - KNOCK: a "knock" event (engine.events, same same-tick pattern as
//       above) spawns one ring at the event's x/y, growing 0 -> Game.SOUND.
//       RADII.knock over RIPPLE_STYLE.knock.duration.
//     - FOOTSTEPS: NOT event-driven — engine.player.noiseRadius() is
//       continuous per-tick STATE (see src/player.js contract), so this reads
//       it every frame and throttles new spawns with closure timestamps
//       (lastRunRippleAt/lastWalkRippleAt) compared against engine.time
//       (deterministic, no setInterval). >=8 (running) spawns a ring growing
//       to Game.SOUND.RADII.run every ~0.5s; >=3 and <8 (walking) spawns a
//       fainter ring growing to Game.SOUND.RADII.walk every ~0.7s; <3
//       (crouch 1 / crawl 0 / stationary) spawns nothing, per the design
//       brief. Suppressed entirely while engine.gameOver (a dead player makes
//       no footsteps).
//   HONEST SIMPLIFICATION (documented, not silent): every ring's radius is
//   the NOMINAL Game.SOUND.RADII value for that sound kind — it does NOT run
//   soundEvents.js's wallsBetween/effectiveRadius attenuation, so a ring can
//   visually reach through a wall a guard on the other side would not
//   actually hear through as far. This is deliberate: the ring's job is to
//   show the PLAYER an honest "this is how far this sound kind nominally
//   travels" reference (matching Game.SOUND.RADII exactly, so the visual
//   never lies about the base radius), not to re-derive full per-guard
//   geometry every frame. See BACKLOG.md's existing wallsBetween/
//   effectiveRadius note for the same caveat already documented for guards'
//   own hearing.
//   POOLING: up to RIPPLE_MAX_LIVE (6) THREE.LineLoop meshes are created ONCE
//   (ripplePool) and reused — their geometry's position BufferAttribute is
//   overwritten in place every frame (needsUpdate = true) for whichever data
//   ripple currently occupies that pool slot, rather than disposing/
//   recreating geometry per spawn (unlike the dart tracer's simpler "rebuild
//   fresh every frame" approach, which this cycle's design brief explicitly
//   asked to avoid for ripples: "keep a small pooled set of ring meshes").
//
//   ZONE CHANGES (new): syncScene tracks engine.zone.id in a closure var. When
//   it differs from the last-seen id (an engine.js zone transition happened —
//   see src/engine.js's "ZONE TRANSITIONS" tick step), the OLD static scene
//   (floor/walls/wall-edges/darkzones/exit quad) and every guard actor
//   (body/nose/marker/vision-cone/cone-edge — the old zone's guard roster,
//   e.g. loadingDock's "g1", is a different set of ids than warehouse's
//   "w1"/"w2") are removed from the scene and their owned geometries AND
//   materials disposed (see disposeStatic/disposeGuardActors below — nothing
//   from the old zone is kept around leaking GPU resources), the camera is
//   re-centered on the new zone's bounds, and the static scene is rebuilt
//   fresh for the new zone before any dynamic sync happens this call. The
//   player actor is NOT rebuilt (its mesh isn't zone-specific, only its
//   position/stance are) — it's simply repositioned like any other frame.
//   renderer.render(engine) — syncScene(engine) then draws exactly one frame.
//   renderer.resize() — re-reads container.clientWidth/clientHeight, resizes
//     the WebGL canvas and recomputes the orthographic frustum so the whole
//     zone keeps fitting with margin regardless of aspect ratio. Boot is
//     responsible for calling this from a window "resize" listener; this
//     module does not add one itself (it only touches the container it was
//     given).
//
//   COORDINATE MAPPING: world (x, y) meters (+x right, +y down, per
//   src/world.js) -> THREE (x, 0, y) — i.e. world y becomes THREE z directly
//   (no sign flip). A world facing angle f (0 = +x, PI/2 = +y, same atan2
//   convention as player.facing/guard.facing) maps to a THREE Y-axis rotation
//   of -f (verify: THREE's rotation-about-Y maps local +X to
//   (cos(-f), 0, -sin(-f)) = (cos f, 0, sin f), i.e. exactly the world
//   direction (cos f, sin f) carried into (x, 0, y) — so mesh.rotation.y =
//   -facing turns an actor to visually face the same way its world facing
//   angle says it does).
//
//   CAMERA: fixed, locked, orthographic isometric-ish top-down. Positioned at
//   (zoneCenter.x, 26, zoneCenter.y + 14) looking at (zoneCenter.x, 0,
//   zoneCenter.y) — i.e. directly above the zone center, offset south
//   (+z/+world-y) and tilted down, giving a classic MGS-style tilted top-down
//   read without any perspective distortion (no controls this cycle; picking
//   THIS particular offset over a more diagonal iso angle because the zone is
//   wide (40x30) and a purely-vertical-with-slight-tilt view keeps every wall
//   AABB's footprint legible without a 45-degree rotation making near/far
//   walls overlap each other on screen).
//
//   THREE IS REFERENCED ONLY IN THIS FILE, and only from inside
//   createRenderer (never at module load / top-level scope) — node's test
//   loader never requires render.js, but if it ever did, or if this file is
//   evaluated before the THREE <script> tag runs, calling createRenderer
//   without THREE defined throws a clear Error instead of a bare
//   ReferenceError.
//
// Zero external assets: every mesh is a THREE primitive; the only "texture"
// assets (guard state glyphs/dots) are 2D-canvas-generated CanvasTextures
// built once at renderer creation, not loaded from disk/network.
(function (Game) {
  function createRenderer(opts) {
    if (typeof THREE === "undefined") {
      throw new Error(
        "Game.createRenderer: THREE is not defined (render.js must run in a " +
          "browser page that has loaded the Three.js <script> before boot " +
          "runs) — cannot create the renderer."
      );
    }

    opts = opts || {};
    var container = opts.container;
    var zone = opts.zone || (Game.ZONES && Game.ZONES.loadingDock);

    // ---- tunables ------------------------------------------------------------

    var STAND_H = 1.7;
    var CROUCH_H = 1.0;
    var CRAWL_H = 0.5;
    var BODY_W = 0.8; // box-disguise footprint, x and z (unrelated to the humanoid figure's own width)

    // HUMANOID BODY PLAN (new — box-to-silhouette upgrade): every character
    // (player + guard) is a small THREE.Group of primitives — two legs, a
    // torso, a head, two arms — instead of a single scaled box. Proportions
    // are fractions of a target total height (STAND_H normally, CROUCH_H
    // when crouched) so the SAME layout math produces a shorter, bent-legged
    // figure for crouch "for free" (see poseUpright below) — only the
    // forward torso tilt is a stance-specific extra. Prone (CRAWL_H, and a
    // SLEEPING guard) is NOT built from these fractions at a squashed
    // height — see poseProne below, which lays a full STAND_H-proportioned
    // figure down on its side by rotating the whole figureGroup, so a prone
    // body reads as "a full-height person lying down" (correct anatomy —
    // lying length ~= standing height) rather than a shrunken doll.
    // Sized a bit bolder than strict human proportion (wider hip spread,
    // thicker limbs) — at gameplay zoom (the whole ~40x30m zone visible at
    // once, so roughly 1 world meter =~ 20px) true-to-life limb thickness
    // anti-aliases into a single blob; these values were tuned by rendering
    // and visually checking shots/02-ingame-patrol.png + evidence screenshots
    // until legs/head/arms read as separate shapes at that zoom.
    var HEAD_R = 0.17;
    var NECK_GAP = 0.03;
    var TORSO_W = 0.42; // shoulder-to-shoulder (local Z, the character's side axis)
    var TORSO_D = 0.24; // front-to-back (local X, the character's forward axis)
    var HIP_W = 0.38; // hip width (Z) — narrower than the shoulders
    var LEG_W = 0.17; // each leg box, X/Z
    var ARM_W = 0.13; // each arm box, X/Z
    var LEG_FRAC = 0.46; // fraction of totalH that is leg length (also sets hip height)
    var TORSO_FRAC = 0.34; // fraction of totalH that is hip-to-shoulder torso length
    var CROUCH_TILT = 0.32; // radians, forward torso lean while crouched
    var VISOR_FWD = 0.6; // fraction of HEAD_R the facing-visor sits forward of head center

    // WALK / RUN ANIMATION (new): leg/arm swing is a sine of a per-actor
    // PHASE accumulated from distance traveled (engine.time-free, per file
    // header's "no wall clock" rule elsewhere) — see updateWalkCycle below.
    // Running only widens the swing (player.running); the swing already
    // cycles faster on its own the more ground is covered per frame, since
    // phase accumulates by distance, not by time.
    var WALK_PHASE_PER_METER = 5.5;
    var WALK_SWING_RAD = (25 * Math.PI) / 180;
    var ARM_SWING_RATIO = 0.85; // arm amplitude relative to the leg amplitude
    var RUN_SWING_MULT = 1.6;
    var STILL_EPS = 1e-5; // world units of frame-to-frame displacement below which a figure is "not moving"
    var PRONE_SWING_RAD = (14 * Math.PI) / 180; // subtle crawl-stroke leg/arm wag

    var PERIMETER_H = 2.2;
    var INTERIOR_H = 1.6;

    var FLOOR_COLOR = 0x1a2028;
    var DARKZONE_COLOR = 0x0c1218;
    var WALL_PERIMETER_COLOR = 0x3a4a3f;
    var WALL_INTERIOR_COLOR = 0x4d6152;
    var WALL_EDGE_COLOR = 0x11150f;
    var EXIT_COLOR = 0x00ff66;

    // PER-ZONE PALETTES (materials/atmosphere cycle, Readability + Consequence
    // pillars — a zone should read as itself at a glance, not just "the same
    // grey box with different guards in it"): floor base / structural
    // (perimeter) wall base / interior-wall (container/crate) variant / the
    // EdgesGeometry outline color, per zone.id. Only these 4 slots are
    // themed — darkZones, the exit quad, doors, lasers, and pickups keep
    // their own fixed functional colors untouched everywhere below (lock
    // colors stay color-coded, exit stays green — see file header). Unknown
    // zone ids (defensive only; every real zone in src/world.js has an
    // entry here) fall back to DEFAULT_PALETTE, i.e. the original flat
    // colors this file used before this cycle.
    var DEFAULT_PALETTE = {
      floor: FLOOR_COLOR,
      wallPerimeter: WALL_PERIMETER_COLOR,
      wallInterior: WALL_INTERIOR_COLOR,
      edge: WALL_EDGE_COLOR,
    };
    var ZONE_PALETTES = {
      // loadingDock — rusty/warm grays + amber accent (shipping-yard grime).
      loadingDock: {
        floor: 0x2b241c,
        wallPerimeter: 0x4a3a2c,
        wallInterior: 0x6e4a2a,
        edge: 0x1c130a,
      },
      // warehouse — neutral industrial, cooler shadows than the dock.
      warehouse: {
        floor: 0x1b2126,
        wallPerimeter: 0x39434a,
        wallInterior: 0x46545c,
        edge: 0x10151a,
      },
      // laboratory — cold blue-white walls, cleaner (less grimy) floor.
      laboratory: {
        floor: 0x232b33,
        wallPerimeter: 0x4d6472,
        wallInterior: 0x5d7986,
        edge: 0x121a20,
      },
      // commsTower — darker night-navy + red accent (interior partitions
      // carry the red into the crate/container variant).
      commsTower: {
        floor: 0x141018,
        wallPerimeter: 0x241a2c,
        wallInterior: 0x4a2230,
        edge: 0x0a0610,
      },
    };
    // Hazard-stripe accent colors (see hazardStripes below) — a fixed
    // caution amber/near-black pair, same convention regardless of zone
    // (real-world hazard tape doesn't change color by room).
    var HAZARD_COLOR_A = 0xffb300;
    var HAZARD_COLOR_B = 0x1c1c1c;
    var PLAYER_COLOR = 0x4682b4; // steel blue
    var GUARD_COLOR = 0x6b8e23; // olive drab
    // CARDBOARD BOX (new — box/chaff/ration cycle, see file header BOX
    // DISGUISE note below): cardboard-brown, matching src/hud.js's BOX
    // status-pill color family.
    var BOX_COLOR = 0x8b5a2b;
    var BOX_HEIGHT = 1.0; // world units — a fixed crate height, stance-independent
    var BOX_FOOTPRINT_SCALE = 1.45; // "slightly larger than the player" (BODY_W * this)
    // VISOR (new — replaces the old free-standing "nose" cone as the facing
    // readout): a small dark band on the front of the head, one shade darker
    // than that character's own body color, same "reads at a glance without
    // extra UI" spirit the nose cone had, just built into the silhouette.
    var GUARD_VISOR_COLOR = 0x2f3a24;
    var PLAYER_VISOR_COLOR = 0x24313d;
    var BG_COLOR = 0x05070a;

    var CONE_SEGMENTS = 24;
    var CONE_Y = 0.02;
    // Fill uses additive blending (fine against the dark floor), each state's
    // color/opacity tuned so the green -> yellow -> orange -> red progression
    // reads as an obvious escalation instead of a wash of similar green-ish
    // blobs. The crisp edge outline (see EDGE_STYLE below) is what makes the
    // cone boundary legible even where the fill itself stays subtle.
    var CONE_STYLE = {
      PATROL: { color: 0x43a047, opacity: 0.32 },
      SUSPICIOUS: { color: 0xffca28, opacity: 0.4 },
      INVESTIGATE: { color: 0xff7043, opacity: 0.34 },
      ALERT: { color: 0xe53935, opacity: 0.48 },
      EVASION: { color: 0xab47bc, opacity: 0.34 },
      CAUTION: { color: 0xffa726, opacity: 0.3 },
    };
    // Bright, near-opaque outline drawn along the cone's two straight edges +
    // arc (a LineLoop over the exact same raycast-clipped fan points), so the
    // boundary stays crisp regardless of how subtle the additive fill reads
    // against a given patch of floor.
    var EDGE_STYLE = {
      PATROL: { color: 0x81c784, opacity: 0.85 },
      SUSPICIOUS: { color: 0xffe082, opacity: 0.9 },
      INVESTIGATE: { color: 0xffab91, opacity: 0.9 },
      ALERT: { color: 0xff8a80, opacity: 1.0 },
      EVASION: { color: 0xce93d8, opacity: 0.85 },
      CAUTION: { color: 0xffd180, opacity: 0.85 },
    };

    // CAMERAS (new — director cycle, see src/director.js contract): small
    // dark wall-mounted housing + a pivoting cone fan, same raycast-clipped
    // fan TECHNIQUE as the guard cones above (see buildCameraConeFan below)
    // but its own geometry/materials — cameras are a distinct entity type,
    // not guards, so they get their own actor bookkeeping (see
    // ensureCameraActor/disposeCameraActors below).
    var CAMERA_HOUSING_COLOR = 0x20262b; // small dark box, reads as hardware not a guard
    var CAMERA_HOUSING_W = 0.35;
    var CAMERA_HOUSING_H = 0.28;
    var CAMERA_MOUNT_Y = 2.0; // world units — wall-mounted height, above head height
    // DISABLED-only style (dead hardware while chaffed, no ramp) — the
    // NORMAL/ALERT case is no longer a discrete style: it's the continuous
    // Game.radarCameraColor(meter) ramp applied directly to each camera
    // actor's OWN cone/edge material every frame (see updateCameraCone
    // below), replacing the old CAMERA_CONE_STYLE/CAMERA_EDGE_STYLE 3-key
    // maps + shared materials.
    var CAMERA_CONE_DISABLED = { color: 0x666666, opacity: 0.1 };
    var CAMERA_EDGE_DISABLED = { color: 0x888888, opacity: 0.35 };
    var CAMERA_CONE_OPACITY = 0.3; // fixed fill alpha for the ramp (color carries the "how alarmed" signal, same convention as src/radar.js's CAMERA_CONE_ALPHA)
    var CAMERA_EDGE_OPACITY = 0.9;
    var CAMERA_EDGE_LIGHTEN = 0.35; // edge is a brightened (toward-white) tint of the same ramp color, for a crisp glow outline distinct from the additive fill

    // DOORS / LASERS / PICKUPS (new — Laboratory cycle, see file header).
    var DOOR_HEIGHT = 2.0; // world units — reads as a full slab, distinct from a low wall
    var DOOR_LOCK_COLOR = {
      L1: 0x508cff,
      L2: 0xffb03c,
      L3: 0xff4646,
    };
    var DOOR_UNLOCKED_COLOR = 0x96bea0;
    var LASER_COLOR = 0xff2828;
    var LASER_Y = 0.9; // roughly waist height — a real tripwire beam
    var PICKUP_COLOR = 0xfff096;
    var PICKUP_SIZE = 0.4;
    var PICKUP_Y = 0.5;

    var METER_MAX_W = 2.0;
    var METER_H = 0.32;

    // PRONE pose (new — replaces the old single-box scale trick; see
    // poseProne below and the file header SLEEPING GUARDS / new CRAWL
    // notes): a full STAND_H-proportioned figure is laid out exactly like
    // poseUpright, then the whole figureGroup is rotated -90 degrees about
    // local Z around its own origin (which sits at the character's
    // mid-height center, not the feet — see poseProne's own comment) so
    // "up" becomes "forward": the head/torso end up ahead of the anchor
    // point, the legs trail behind it, and the figure's vertical profile
    // collapses from STAND_H down to roughly a torso's depth — a low,
    // floor-hugging silhouette with zero extra geometry, same "no new
    // mesh, just a transform" spirit the old scale trick had.
    var PRONE_LIFT = 0.16; // world units the whole prone figureGroup is raised so it doesn't clip the floor
    var PRONE_ARM_ROTATION = Math.PI; // arm pivot rest angle for "arms forward" (crawl) instead of hanging down

    var TRACER_DURATION_S = 0.25;
    var TRACER_Y = 0.6; // roughly muzzle height

    // STUNNED wobble / dizzy-dots bob (new — CQC THROW cycle, see file
    // header STUNNED GUARDS note) — a deterministic sine of engine.time,
    // same "no Date.now" rule as every other animation in this file.
    var STUN_WOBBLE_AMPLITUDE = 0.14; // radians, +/- rotation.z sway
    var STUN_WOBBLE_HZ = 1.1;
    var STUN_DIZZY_Y_OFFSET = 1.5; // world units above STAND_H, before the bob
    var STUN_DIZZY_BOB_HZ = 3.0;
    var STUN_DIZZY_BOB_AMPLITUDE = 0.1;

    // PLAYER HIDDEN dim/blink (see file header) — cycles/sec-ish for the
    // opacity sine while engine.playerHidden is true.
    var HIDDEN_BLINK_HZ = 1.4;
    var TWO_PI_R = Math.PI * 2;

    // HIT FLASH (see file header) — decaying screen-edge flash + player tint
    // on a "playerHit" event.
    var HIT_FLASH_ALPHA_MAX = 0.35;
    var HIT_FLASH_DURATION_S = 0.4;
    var HIT_FLASH_COLOR = 0xb71c1c;
    var PLAYER_HIT_TINT_COLOR = 0xff1744;
    var HIT_FLASH_Z = -1; // local units in front of `camera` (camera looks down local -Z)

    // KNOCK / FOOTSTEP RIPPLES (see file header) — pooled ring meshes, one
    // style per producer kind. maxR is filled in per-instance from
    // Game.SOUND.RADII (read at spawn time, not baked in here, so this stays
    // in sync with soundEvents.js's own tunables rather than duplicating
    // them).
    var RIPPLE_MAX_LIVE = 6;
    var RIPPLE_SEGMENTS = 32;
    var RIPPLE_Y = CONE_Y + 0.01; // just above cone fills, avoid z-fighting the floor
    var RIPPLE_STYLE = {
      knock: { color: 0xfff59d, opacity: 0.95, duration: 0.6 },
      run: { color: 0xb3e5fc, opacity: 0.5, duration: 0.5 },
      walk: { color: 0xb3e5fc, opacity: 0.25, duration: 0.7 },
    };
    var RUN_NOISE_THRESHOLD = 8; // player.noiseRadius() >= this -> "running" ripple
    var WALK_NOISE_THRESHOLD = 3; // >= this (and < run threshold) -> "walking" ripple
    var RUN_RIPPLE_INTERVAL_S = 0.5;
    var WALK_RIPPLE_INTERVAL_S = 0.7;

    // ---- renderer / scene / camera --------------------------------------------

    var webgl = new THREE.WebGLRenderer({ antialias: true });
    webgl.setPixelRatio(
      typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1
    );
    container.appendChild(webgl.domElement);

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(10, 24, 8);
    scene.add(sun);

    var zoneCenter = { x: zone.bounds.w / 2, y: zone.bounds.h / 2 };

    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    camera.position.set(zoneCenter.x, 26, zoneCenter.y + 14);
    camera.lookAt(zoneCenter.x, 0, zoneCenter.y);
    // Added to the scene graph (new — HIT FLASH, see file header) purely so a
    // camera-local CHILD mesh (the hit-flash overlay quad below) renders at
    // all — WebGLRenderer only traverses `scene`'s own graph, and the camera
    // itself draws nothing visible, so this has no effect beyond enabling
    // that child.
    scene.add(camera);

    // ---- small local helpers ---------------------------------------------------

    function isPerimeterWall(wall) {
      return (
        wall.x <= 0 ||
        wall.y <= 0 ||
        wall.x + wall.w >= zone.bounds.w ||
        wall.y + wall.h >= zone.bounds.h
      );
    }

    function stanceHeight(stance) {
      if (stance === "crouch") return CROUCH_H;
      if (stance === "crawl") return CRAWL_H;
      return STAND_H;
    }

    // Canvas-generated glyph/dot textures for guard state markers — built
    // once, reused across every guard and every frame.
    function makeGlyphTexture(text, color) {
      var size = 128;
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      ctx.font = "bold 92px sans-serif";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, size / 2, size / 2 + 6);
      var tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    }

    function makeDotTexture(color) {
      var size = 64;
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      var tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    }

    // ---- procedural canvas textures (materials/atmosphere cycle) -------------
    // Zero external assets: every "material" below is a small (256px) 2D
    // canvas drawn once and wrapped in a THREE.CanvasTexture, RepeatWrapping
    // so it tiles across a floor/wall's world footprint (see cloneTiled).
    // Deterministic: noise/cracks/scratches are seeded from a fixed hash of
    // the zone id (hashSeed below) plus a small per-texture-kind offset —
    // NEVER Math.random, same "no wall clock / no nondeterminism" rule this
    // file already follows for animation (engine.time-driven, not Date.now).
    // CACHED by (kind, baseColor, seed) in textureCache so every surface
    // that wants "concrete, loadingDock's rust-grey" shares one drawn
    // canvas — buildStatic clones the cached texture per surface (cheap:
    // shares the canvas image, only gets its own .repeat) so grain density
    // stays consistent regardless of that surface's size; only those
    // per-surface CLONES are disposed on a zone change (see staticTextures/
    // disposeStatic below) — the cached base textures live for the
    // renderer's lifetime, same posture as MARKER_TEXTURES/CONE_MATERIALS
    // elsewhere in this file (shared, built lazily, never torn down since
    // this module has no explicit "destroy renderer" hook).
    var TEXTURE_SIZE = 256;
    var TEXTURE_TILE_METERS = 4; // world meters one texture tile covers before repeat

    // Deterministic string -> uint32 hash (a fixed function of the zone id —
    // "loadingDock" always seeds the same grain/crack/scratch layout every
    // run; not a source of randomness, just a stable seed derivation).
    function hashSeed(str) {
      var h = 0;
      for (var i = 0; i < str.length; i++) {
        h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
      }
      return h >>> 0;
    }

    function hexToRgb(hex) {
      return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
    }
    function rgbCss(rgb, alpha) {
      return "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + (alpha == null ? 1 : alpha) + ")";
    }
    function shadeRgb(rgb, delta) {
      return {
        r: Math.max(0, Math.min(255, rgb.r + delta)),
        g: Math.max(0, Math.min(255, rgb.g + delta)),
        b: Math.max(0, Math.min(255, rgb.b + delta)),
      };
    }

    var textureCache = {};

    function cachedTexture(kind, cacheColor, seed, painter) {
      var key = kind + "|" + cacheColor + "|" + (seed || 0);
      var existing = textureCache[key];
      if (existing) return existing;
      var canvas = document.createElement("canvas");
      canvas.width = TEXTURE_SIZE;
      canvas.height = TEXTURE_SIZE;
      var ctx = canvas.getContext("2d");
      painter(ctx, TEXTURE_SIZE, Game.createRng((seed || 0) >>> 0));
      var tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      textureCache[key] = tex;
      return tex;
    }

    // concreteTexture(baseColor, seed): subtle noise grain + a few darker
    // blotches (stains) + faint hairline cracks — used for the floor and
    // perimeter (structural) walls.
    function concreteTexture(baseColor, seed) {
      return cachedTexture("concrete", baseColor, seed, function (ctx, size, rng) {
        var base = hexToRgb(baseColor);
        ctx.fillStyle = rgbCss(base);
        ctx.fillRect(0, 0, size, size);

        var grains = 2200;
        for (var i = 0; i < grains; i++) {
          var gx = rng.next() * size;
          var gy = rng.next() * size;
          var shade = (rng.next() - 0.5) * 34;
          ctx.fillStyle = rgbCss(shadeRgb(base, shade), 0.5);
          ctx.fillRect(gx, gy, 1.4, 1.4);
        }

        var blotches = 5;
        for (var b = 0; b < blotches; b++) {
          var bx = rng.next() * size;
          var by = rng.next() * size;
          var br = 14 + rng.next() * 26;
          var grad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
          grad.addColorStop(0, "rgba(0,0,0,0.22)");
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
        }

        var cracks = 4;
        for (var c = 0; c < cracks; c++) {
          ctx.strokeStyle = "rgba(0,0,0,0.28)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          var cx = rng.next() * size;
          var cy = rng.next() * size;
          ctx.moveTo(cx, cy);
          var segs = 3 + Math.floor(rng.next() * 3);
          for (var s = 0; s < segs; s++) {
            cx += (rng.next() - 0.5) * 46;
            cy += (rng.next() - 0.5) * 46;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }
      });
    }

    // metalTexture(baseColor, seed): vertical ridge lines (shipping-
    // container/crate panelling) + a few subtle scratches — used for
    // interior walls, which per src/world.js's own wall comments ARE the
    // containers/crates/shelving ("shipping container, west", "center
    // crate stack", ...) — the only boxy geometry in this game big enough
    // to read as "container", distinct from the perimeter's structural
    // concrete.
    function metalTexture(baseColor, seed) {
      return cachedTexture("metal", baseColor, seed, function (ctx, size, rng) {
        var base = hexToRgb(baseColor);
        ctx.fillStyle = rgbCss(base);
        ctx.fillRect(0, 0, size, size);

        var ridgeGap = size / 10;
        for (var x = ridgeGap * 0.5; x < size; x += ridgeGap) {
          var jitter = (rng.next() - 0.5) * 3;
          ctx.strokeStyle = rgbCss(shadeRgb(base, 26), 0.55);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + jitter, 0);
          ctx.lineTo(x + jitter, size);
          ctx.stroke();
          ctx.strokeStyle = rgbCss(shadeRgb(base, -28), 0.5);
          ctx.beginPath();
          ctx.moveTo(x + jitter + 1.5, 0);
          ctx.lineTo(x + jitter + 1.5, size);
          ctx.stroke();
        }

        var scratches = 10;
        for (var i = 0; i < scratches; i++) {
          var sx = rng.next() * size;
          var sy = rng.next() * size;
          var len = 10 + rng.next() * 24;
          var ang = (rng.next() - 0.5) * 0.9;
          ctx.strokeStyle = rgbCss(shadeRgb(base, 45), 0.3);
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
          ctx.stroke();
        }
      });
    }

    // hazardStripes(colorA, colorB): 45-degree diagonal caution stripes —
    // NOT seeded (a striped pattern, not noise; deterministic by
    // construction already) — applied sparingly (see buildStatic's
    // hazard-wall selection below) to a couple of low crates per zone, a
    // small accent, never to functional elements (exit/doors keep their
    // own color-coded materials untouched — see file header).
    function hazardStripes(colorA, colorB) {
      return cachedTexture("hazard", colorA + "_" + colorB, 0, function (ctx, size) {
        ctx.fillStyle = rgbCss(hexToRgb(colorB));
        ctx.fillRect(0, 0, size, size);
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate(Math.PI / 4);
        ctx.translate(-size, -size);
        ctx.fillStyle = rgbCss(hexToRgb(colorA));
        var stripeW = size / 8;
        for (var x = -size; x < size * 3; x += stripeW * 2) {
          ctx.fillRect(x, -size, stripeW, size * 4);
        }
        ctx.restore();
      });
    }

    // Clones a cached base texture and gives the clone its own .repeat,
    // scaled to the world-space footprint it's about to cover — so grain/
    // ridge/stripe density stays visually consistent whether it's tiling
    // across a 40x30 floor or a 3x3 crate, instead of one giant stretched
    // texel. The clone shares the base's canvas image (cheap); callers are
    // responsible for tracking + disposing the clone (see trackTexture /
    // disposeStatic below) since, unlike the cached base, it's genuinely
    // per-zone-build.
    function cloneTiled(baseTex, worldW, worldH) {
      var tex = baseTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(
        Math.max(1, Math.round(worldW / TEXTURE_TILE_METERS)),
        Math.max(1, Math.round(worldH / TEXTURE_TILE_METERS))
      );
      return tex;
    }

    var MARKER_TEXTURES = {
      SUSPICIOUS: makeGlyphTexture("?", "#f9a825"),
      ALERT: makeGlyphTexture("!", "#e53935"),
      INVESTIGATE: makeDotTexture("#ef6c00"),
      EVASION: makeDotTexture("#8e24aa"),
      CAUTION: makeDotTexture("#ff8f00"),
    };

    var MARKER_MATERIALS = {};
    Object.keys(MARKER_TEXTURES).forEach(function (state) {
      MARKER_MATERIALS[state] = new THREE.SpriteMaterial({
        map: MARKER_TEXTURES[state],
        transparent: true,
        depthTest: false,
      });
    });

    // "Zzz" sprite for SLEEPING guards (see file header) — built once, shared
    // (like MARKER_MATERIALS) across every guard actor and every zone; never
    // disposed by a zone change, only individual actors' USE of it toggles.
    var ZZZ_TEXTURE = makeGlyphTexture("Zzz", "#9fd8ff");
    var ZZZ_MATERIAL = new THREE.SpriteMaterial({
      map: ZZZ_TEXTURE,
      transparent: true,
      depthTest: false,
    });

    // "Dizzy dots" sprite for STUNNED guards (new — CQC THROW cycle, see file
    // header) — a small ring of yellow dots (a classic "seeing stars" glyph),
    // same CanvasTexture technique/sharing posture as ZZZ_MATERIAL above.
    function makeDizzyTexture(color) {
      var size = 128;
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = color;
      var cx = size / 2;
      var cy = size / 2;
      var ringR = size * 0.32;
      var dotR = size * 0.1;
      var dots = 5;
      for (var i = 0; i < dots; i++) {
        var angle = (i / dots) * Math.PI * 2;
        var dx = cx + Math.cos(angle) * ringR;
        var dy = cy + Math.sin(angle) * ringR;
        ctx.beginPath();
        ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      var tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    }
    var DIZZY_TEXTURE = makeDizzyTexture("#ffd54f");
    var DIZZY_MATERIAL = new THREE.SpriteMaterial({
      map: DIZZY_TEXTURE,
      transparent: true,
      depthTest: false,
    });

    var CONE_MATERIALS = {};
    Object.keys(CONE_STYLE).forEach(function (state) {
      var s = CONE_STYLE[state];
      CONE_MATERIALS[state] = new THREE.MeshBasicMaterial({
        color: s.color,
        transparent: true,
        opacity: s.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    });

    var EDGE_MATERIALS = {};
    Object.keys(EDGE_STYLE).forEach(function (state) {
      var s = EDGE_STYLE[state];
      EDGE_MATERIALS[state] = new THREE.LineBasicMaterial({
        color: s.color,
        transparent: true,
        opacity: s.opacity,
        depthWrite: false,
      });
    });

    // CAMERA cone/edge materials (see file header CAMERAS note): UNLIKE
    // CONE_MATERIALS/EDGE_MATERIALS above, these are NOT a shared
    // state-keyed map — the continuous meter ramp means each camera actor
    // needs its OWN mutable material instance (color/opacity written fresh
    // every frame in updateCameraCone below, not swapped between fixed
    // materials). See ensureCameraActor for where these get created, one
    // pair per camera.
    function makeCameraConeMaterial() {
      return new THREE.MeshBasicMaterial({
        color: 0x80deea,
        transparent: true,
        opacity: CAMERA_CONE_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }
    function makeCameraEdgeMaterial() {
      return new THREE.LineBasicMaterial({
        color: 0xb2ebf2,
        transparent: true,
        opacity: CAMERA_EDGE_OPACITY,
        depthWrite: false,
      });
    }
    // Brightens an {r,g,b} (0..255) toward white by `amount` (0..1) — used to
    // derive the camera cone edge's crisp glow-outline tint from the SAME
    // ramp color as its fill, instead of a second independent palette.
    function lightenTowardWhite(rgb, amount) {
      return {
        r: Math.round(rgb.r + (255 - rgb.r) * amount),
        g: Math.round(rgb.g + (255 - rgb.g) * amount),
        b: Math.round(rgb.b + (255 - rgb.b) * amount),
      };
    }

    // ---- static scene (built once per zone) -------------------------------------

    var built = false;
    // Every THREE.Object3D added by buildStatic(), so a zone change can remove
    // + dispose them all without hunting through `scene.children` (see
    // disposeStatic below and the ZONE CHANGES note in the file header).
    var staticObjects = [];
    // Every per-surface texture CLONE cloneTiled() produced this build (see
    // procedural canvas textures note above) — the cached BASE textures in
    // textureCache are intentionally not tracked/disposed here (shared
    // across zones, live for the renderer's lifetime); only these clones,
    // which exist solely to carry one surface's own .repeat, are torn down
    // on a zone change.
    var staticTextures = [];

    function trackTexture(tex) {
      staticTextures.push(tex);
      return tex;
    }

    function buildFlatQuad(x, y, w, h, yOffset, material) {
      var geo = new THREE.PlaneGeometry(w, h);
      var mesh = new THREE.Mesh(geo, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x + w / 2, yOffset, y + h / 2);
      return mesh;
    }

    function addStatic(obj) {
      scene.add(obj);
      staticObjects.push(obj);
      return obj;
    }

    function buildStatic() {
      // PER-ZONE PALETTE (see ZONE_PALETTES above) + a fixed seed derived
      // from the zone id — every texture drawn below for THIS zone uses it
      // (offset per texture kind so floor/perimeter/interior don't all draw
      // the identical grain), so re-entering a zone (or a fresh renderer)
      // always regenerates byte-identical canvases; no Math.random anywhere
      // in this file.
      var palette = ZONE_PALETTES[zone.id] || DEFAULT_PALETTE;
      var seed = hashSeed(zone.id || "default");

      var floorTex = trackTexture(
        cloneTiled(concreteTexture(palette.floor, seed), zone.bounds.w, zone.bounds.h)
      );
      var floorMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: floorTex });
      addStatic(buildFlatQuad(0, 0, zone.bounds.w, zone.bounds.h, 0, floorMat));

      // Dark zones stay flat/untextured on purpose (see file header): they
      // must read as SHADOW at a glance, not decoration — grain here would
      // fight that readability job, so no palette/texture involvement.
      var darkMat = new THREE.MeshLambertMaterial({ color: DARKZONE_COLOR });
      (zone.darkZones || []).forEach(function (dz) {
        addStatic(buildFlatQuad(dz.x, dz.y, dz.w, dz.h, 0.01, darkMat));
      });

      // Hazard-striped crates (see hazardStripes above): the one or two
      // SMALLEST interior walls (area-sorted, capped at a "small crate"
      // footprint) read as low, caution-taped crates instead of plain
      // metal — "use sparingly, 1-2 accents per zone", never the big
      // shipping-container-sized walls.
      var interiorWalls = (zone.walls || []).filter(function (w) {
        return !isPerimeterWall(w);
      });
      var hazardSet = interiorWalls
        .slice()
        .sort(function (a, b) {
          return a.w * a.h - b.w * b.h;
        })
        .slice(0, 2)
        .filter(function (w) {
          return w.w * w.h <= 12;
        });

      (zone.walls || []).forEach(function (wall) {
        var perimeter = isPerimeterWall(wall);
        var h = perimeter ? PERIMETER_H : INTERIOR_H;
        var geo = new THREE.BoxGeometry(wall.w, h, wall.h);

        var wallTex;
        if (perimeter) {
          // Structural walls: same concrete family as the floor, tinted to
          // this zone's wall base.
          wallTex = concreteTexture(palette.wallPerimeter, seed + 1);
        } else if (hazardSet.indexOf(wall) !== -1) {
          wallTex = hazardStripes(HAZARD_COLOR_A, HAZARD_COLOR_B);
        } else {
          // Interior obstacles are the containers/crates (see world.js's
          // own "shipping container"/"crate" wall comments) — metal ridges.
          wallTex = metalTexture(palette.wallInterior, seed + 2);
        }
        var mat = new THREE.MeshLambertMaterial({
          color: 0xffffff,
          map: trackTexture(cloneTiled(wallTex, wall.w, wall.h)),
        });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(wall.x + wall.w / 2, h / 2, wall.y + wall.h / 2);
        addStatic(mesh);

        // Edge-line treatment carries the readability (see file header) —
        // kept exactly as before, just recolored per palette.edge instead
        // of the old fixed WALL_EDGE_COLOR.
        var edges = new THREE.EdgesGeometry(geo);
        var line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: palette.edge })
        );
        line.position.copy(mesh.position);
        addStatic(line);
      });

      // Exit quad is a FUNCTIONAL element (do not retheme — see file
      // header): stays the same green regardless of zone palette.
      if (zone.exit) {
        var exitMat = new THREE.MeshLambertMaterial({
          color: 0x003318,
          emissive: EXIT_COLOR,
        });
        addStatic(
          buildFlatQuad(zone.exit.x, zone.exit.y, zone.exit.w, zone.exit.h, 0.03, exitMat)
        );
      }
    }

    // Removes + disposes every object buildStatic() created (geometry AND
    // material — none of these are shared with anything else, unlike the
    // guard actor materials handled by disposeGuardActors below).
    function disposeStatic() {
      staticObjects.forEach(function (obj) {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      staticObjects = [];
      // Per-surface texture CLONES only (see trackTexture above) — the
      // cached base textures in textureCache are shared across zones and
      // deliberately NOT disposed here.
      staticTextures.forEach(function (tex) {
        tex.dispose();
      });
      staticTextures = [];
    }

    // ---- dynamic actors (player, guards) ---------------------------------------

    // Builds one small humanoid rig: a THREE.Group ("group", world position +
    // facing) containing a "figureGroup" (torso/head/visor + 4 limb pivots)
    // whose OWN local transform is what poseUpright/poseProne below rewrite
    // every frame to express stance, walk-cycle, and prone poses — keeping
    // the split so BOX DISGUISE (see file header, below) can hide the
    // entire figure with one visibility flag while a separate crate mesh
    // (player only) takes its place. Every mesh's geometry is exclusively
    // owned by this actor (fresh THREE.Geometry per makeActor() call,
    // exactly like the old single-box actor); ALL body-colored parts share
    // ONE material (bodyMat) so a color/opacity write (box-disguise recolor,
    // hit-flash tint, playerHidden blink) touches every part in one write
    // instead of one per mesh. The visor gets its own material (visorMat)
    // so it stays a fixed dark accent rather than following those same
    // recolors (a boxed player's crate has no visor at all — see BOX
    // DISGUISE below).
    function makeActor(bodyColor, visorColor) {
      var group = new THREE.Group();
      var figureGroup = new THREE.Group();
      group.add(figureGroup);

      var bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
      var visorMat = new THREE.MeshLambertMaterial({ color: visorColor });

      var torso = new THREE.Mesh(new THREE.BoxGeometry(TORSO_D, 1, TORSO_W), bodyMat);
      var head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 10, 8), bodyMat);
      var visor = new THREE.Mesh(
        new THREE.BoxGeometry(HEAD_R * 0.9, HEAD_R * 0.55, HEAD_R * 1.25),
        visorMat
      );
      figureGroup.add(torso, head, visor);

      // A limb is a pivot Group (rotated for stance/walk-swing) holding a
      // unit-length box mesh offset half its scaled length below the pivot
      // — the same "unit BoxGeometry(w,1,w) scaled to (1, length, 1)" trick
      // the old single-body actor used for its whole torso, just per-limb.
      function makeLimb(w) {
        var pivot = new THREE.Group();
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 1, w), bodyMat);
        pivot.add(mesh);
        figureGroup.add(pivot);
        return { pivot: pivot, mesh: mesh };
      }
      var leftLeg = makeLimb(LEG_W);
      var rightLeg = makeLimb(LEG_W);
      var leftArm = makeLimb(ARM_W);
      var rightArm = makeLimb(ARM_W);

      scene.add(group);

      return {
        group: group,
        figureGroup: figureGroup,
        bodyMat: bodyMat,
        visorMat: visorMat,
        torso: torso,
        head: head,
        visor: visor,
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        leftArm: leftArm,
        rightArm: rightArm,
        // Every geometry this actor owns (for disposeGuardActors below) —
        // torso/head/visor plus each limb's mesh; pivots are bare Groups,
        // no geometry of their own.
        parts: [torso, head, visor, leftLeg.mesh, rightLeg.mesh, leftArm.mesh, rightArm.mesh],
        // Walk-cycle bookkeeping (see updateWalkCycle below) — per-actor,
        // persists frame to frame; null lastX/Y means "no previous frame
        // yet" (first sync, or just rebuilt after a zone change), so that
        // frame contributes no displacement/phase.
        lastX: null,
        lastY: null,
        phase: 0,
        // Player only — a separate crate mesh swapped in for BOX DISGUISE
        // (see file header + syncScene below); left null for guards.
        boxMesh: null,
      };
    }

    // Advances actor.phase by however far (x, y) moved since the last call
    // (0 on the first call — lastX/Y start null) and returns this frame's
    // swing amplitude in radians: 0 while not moving ("Standing still =
    // neutral pose"), otherwise baseSwingRad, widened by RUN_SWING_MULT
    // when `running` is true (player.running — guards have no equivalent
    // flag and always pass false, so their swing only ever "speeds up" via
    // phase accumulating faster the more ground they cover per frame, never
    // widens). engine.time is deliberately NOT used here — animation speed
    // is driven by distance traveled, matching how fast the character is
    // actually moving, per the file header's "no wall clock" rule.
    function updateWalkCycle(actor, x, y, baseSwingRad, running) {
      var dx = actor.lastX === null ? 0 : x - actor.lastX;
      var dy = actor.lastY === null ? 0 : y - actor.lastY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      actor.lastX = x;
      actor.lastY = y;
      if (dist <= STILL_EPS) return 0;
      actor.phase += dist * WALK_PHASE_PER_METER;
      return baseSwingRad * (running ? RUN_SWING_MULT : 1);
    }

    // Poses a STANDING or CROUCHED figure (guards only ever call this with
    // tilt=0 — they have no stance). `totalH` is the target total height
    // (STAND_H or CROUCH_H); the same fractional layout (LEG_FRAC/
    // TORSO_FRAC) is reused for both, so crouch's shorter legs fall out of
    // the math automatically — only the forward `tilt` (crouch's lean) is
    // stance-specific. `swingRad` is this frame's leg-swing amplitude (0 =
    // neutral, from updateWalkCycle); legs/arms swing in the usual
    // contra-lateral gait (left leg forward pairs with right arm forward).
    function poseUpright(actor, x, y, facing, totalH, tilt, phase, swingRad) {
      actor.group.position.set(x, 0, y);
      actor.group.rotation.y = -facing;
      actor.figureGroup.position.set(0, 0, 0);
      actor.figureGroup.rotation.set(0, 0, 0);
      actor.figureGroup.visible = true;

      var legLen = totalH * LEG_FRAC;
      var torsoH = totalH * TORSO_FRAC;
      var hipY = legLen;
      var shoulderY = hipY + torsoH;
      var headY = shoulderY + NECK_GAP + HEAD_R;

      actor.torso.scale.set(1, torsoH, 1);
      actor.torso.position.set(0, hipY + torsoH / 2, 0);
      actor.torso.rotation.set(0, 0, tilt);

      // Rides forward a hair with the torso's own lean so a crouched
      // figure's head doesn't look pinned straight above its hips.
      actor.head.position.set(Math.sin(tilt) * torsoH * 0.6, headY, 0);
      actor.visor.position.set(
        actor.head.position.x + HEAD_R * VISOR_FWD,
        actor.head.position.y - HEAD_R * 0.05,
        actor.head.position.z
      );
      actor.visor.rotation.set(0, 0, 0);
      actor.visor.visible = true;

      var legSwing = Math.sin(phase) * swingRad;
      var armSwing = Math.sin(phase) * swingRad * ARM_SWING_RATIO;

      actor.leftLeg.pivot.position.set(0, hipY, HIP_W / 2);
      actor.leftLeg.pivot.rotation.set(0, 0, legSwing);
      actor.leftLeg.mesh.scale.set(1, legLen, 1);
      actor.leftLeg.mesh.position.set(0, -legLen / 2, 0);
      actor.leftLeg.pivot.visible = true;

      actor.rightLeg.pivot.position.set(0, hipY, -HIP_W / 2);
      actor.rightLeg.pivot.rotation.set(0, 0, -legSwing);
      actor.rightLeg.mesh.scale.set(1, legLen, 1);
      actor.rightLeg.mesh.position.set(0, -legLen / 2, 0);
      actor.rightLeg.pivot.visible = true;

      var armLen = legLen * 0.92;
      actor.leftArm.pivot.position.set(0, shoulderY, TORSO_W / 2 + ARM_W * 0.6);
      actor.leftArm.pivot.rotation.set(0, 0, -armSwing);
      actor.leftArm.mesh.scale.set(1, armLen, 1);
      actor.leftArm.mesh.position.set(0, -armLen / 2, 0);
      actor.leftArm.pivot.visible = true;

      actor.rightArm.pivot.position.set(0, shoulderY, -(TORSO_W / 2 + ARM_W * 0.6));
      actor.rightArm.pivot.rotation.set(0, 0, armSwing);
      actor.rightArm.mesh.scale.set(1, armLen, 1);
      actor.rightArm.mesh.position.set(0, -armLen / 2, 0);
      actor.rightArm.pivot.visible = true;
    }

    // Poses a PRONE figure — SLEEPING guards, and the player's CRAWL stance
    // (see file header SLEEPING GUARDS note + new CRAWL note). Builds the
    // exact same STAND_H-proportioned layout poseUpright does (so a prone
    // body is a full-height person lying down, not a shrunken one), just
    // shifted so the figure's mid-height sits at figureGroup's own origin
    // (feet at local Y=-totalH/2, head at local Y=+totalH/2, instead of
    // poseUpright's feet-at-0/head-at-totalH), THEN rotates the whole
    // figureGroup -90 degrees about local Z. That single rotation maps
    // "up" (local +Y) to "forward" (local +X): the head/torso swing out
    // ahead of the anchor point and the legs swing out behind it (a mirror
    // of updateVisionCone's own convention of local +X = the direction the
    // group's rotation.y already points), while the small local-X extent of
    // a standing figure's parts (torso depth, mostly) becomes the prone
    // body's new, naturally low vertical profile — no separate "thickness"
    // constant to hand-tune. `armsForward` (crawl only — a sleeping guard's
    // arms stay at its sides) points the arm pivots up (+Y) instead of down
    // before the flip, so after it they end up reaching forward past the
    // head rather than trailing back alongside the legs.
    function poseProne(actor, x, y, facing, phase, swingRad, armsForward) {
      actor.group.position.set(x, 0, y);
      actor.group.rotation.y = -facing;

      var totalH = STAND_H;
      var legLen = totalH * LEG_FRAC;
      var torsoH = totalH * TORSO_FRAC;
      var hipY = legLen - totalH / 2; // shifted so hip sits relative to the figure's own mid-height
      var shoulderY = hipY + torsoH;
      var headY = shoulderY + NECK_GAP + HEAD_R;

      actor.torso.scale.set(1, torsoH, 1);
      actor.torso.position.set(0, hipY + torsoH / 2, 0);
      actor.torso.rotation.set(0, 0, 0);

      actor.head.position.set(0, headY, 0);
      actor.visor.position.set(HEAD_R * VISOR_FWD, headY - HEAD_R * 0.05, 0);
      actor.visor.rotation.set(0, 0, 0);
      actor.visor.visible = true;

      var legSwing = Math.sin(phase) * swingRad;
      actor.leftLeg.pivot.position.set(0, hipY, HIP_W / 2);
      actor.leftLeg.pivot.rotation.set(0, 0, legSwing);
      actor.leftLeg.mesh.scale.set(1, legLen, 1);
      actor.leftLeg.mesh.position.set(0, -legLen / 2, 0);
      actor.leftLeg.pivot.visible = true;

      actor.rightLeg.pivot.position.set(0, hipY, -HIP_W / 2);
      actor.rightLeg.pivot.rotation.set(0, 0, -legSwing);
      actor.rightLeg.mesh.scale.set(1, legLen, 1);
      actor.rightLeg.mesh.position.set(0, -legLen / 2, 0);
      actor.rightLeg.pivot.visible = true;

      var armLen = legLen * 0.92;
      var armRest = armsForward ? PRONE_ARM_ROTATION : 0;
      var armSwing = armsForward ? legSwing * 0.5 : 0;
      actor.leftArm.pivot.position.set(0, shoulderY, TORSO_W / 2 + ARM_W * 0.6);
      actor.leftArm.pivot.rotation.set(0, 0, armRest - armSwing);
      actor.leftArm.mesh.scale.set(1, armLen, 1);
      actor.leftArm.mesh.position.set(0, -armLen / 2, 0);
      actor.leftArm.pivot.visible = true;

      actor.rightArm.pivot.position.set(0, shoulderY, -(TORSO_W / 2 + ARM_W * 0.6));
      actor.rightArm.pivot.rotation.set(0, 0, armRest + armSwing);
      actor.rightArm.mesh.scale.set(1, armLen, 1);
      actor.rightArm.mesh.position.set(0, -armLen / 2, 0);
      actor.rightArm.pivot.visible = true;

      actor.figureGroup.position.set(0, PRONE_LIFT, 0);
      actor.figureGroup.rotation.set(0, 0, -Math.PI / 2);
      actor.figureGroup.visible = true;
    }

    var playerActor = null;

    var guardActors = {}; // id -> { group, figureGroup, bodyMat, ..., marker (Sprite), cone (Mesh) }

    function ensureGuardActor(guard) {
      var existing = guardActors[guard.id];
      if (existing) return existing;

      var actor = makeActor(GUARD_COLOR, GUARD_VISOR_COLOR);

      var marker = new THREE.Sprite(MARKER_MATERIALS.SUSPICIOUS);
      // Roughly doubled from the original 0.85 world-units so state glyphs
      // ("?"/"!") and dots stay legible at 720p against the tilted camera.
      marker.scale.set(1.8, 1.8, 1);
      marker.visible = false;
      scene.add(marker);

      var coneMesh = new THREE.Mesh(new THREE.BufferGeometry(), CONE_MATERIALS.PATROL);
      scene.add(coneMesh);

      var coneEdge = new THREE.LineLoop(new THREE.BufferGeometry(), EDGE_MATERIALS.PATROL);
      scene.add(coneEdge);

      var zzz = new THREE.Sprite(ZZZ_MATERIAL);
      zzz.scale.set(1.4, 1.4, 1);
      zzz.visible = false;
      scene.add(zzz);

      // "Dizzy dots" sprite for STUNNED guards (new — CQC THROW cycle, see
      // file header) — same shared-material posture as zzz above.
      var dizzy = new THREE.Sprite(DIZZY_MATERIAL);
      dizzy.scale.set(1.4, 1.4, 1);
      dizzy.visible = false;
      scene.add(dizzy);

      actor.marker = marker;
      actor.cone = coneMesh;
      actor.coneEdge = coneEdge;
      actor.zzz = zzz;
      actor.dizzy = dizzy;
      guardActors[guard.id] = actor;
      return actor;
    }

    // Removes + disposes every live guard actor (see ZONE CHANGES in the file
    // header — a zone change means a brand-new guard roster with different
    // ids, e.g. loadingDock's "g1" vs warehouse's "w1"/"w2", so the old
    // actors would otherwise sit around invisible-but-never-freed forever).
    // body/nose geometry+material and cone/coneEdge geometry are each owned
    // exclusively by their actor (fresh THREE.Material/Geometry per
    // makeActor()/updateVisionCone() call) and are disposed here — every
    // humanoid part (torso/head/visor/4 limb meshes, see actor.parts from
    // makeActor) plus the two materials all its body-colored parts share
    // (bodyMat) and the visor's own (visorMat); cone/coneEdge MATERIALS and
    // the marker's material come from the shared CONE_MATERIALS/
    // EDGE_MATERIALS/MARKER_MATERIALS maps (keyed by guard state, reused
    // across every guard and every zone) and must NOT be disposed, or the
    // next zone's guards would render with dead materials. zzz/dizzy
    // likewise share ZZZ_MATERIAL/DIZZY_MATERIAL (see file header) — only
    // removed from the scene here, never disposed.
    function disposeGuardActors() {
      Object.keys(guardActors).forEach(function (id) {
        var actor = guardActors[id];
        scene.remove(actor.group, actor.marker, actor.cone, actor.coneEdge, actor.zzz, actor.dizzy);
        actor.parts.forEach(function (part) {
          part.geometry.dispose();
        });
        actor.bodyMat.dispose();
        actor.visorMat.dispose();
        actor.cone.geometry.dispose();
        actor.coneEdge.geometry.dispose();
      });
      guardActors = {};
    }

    // Rebuilds a guard's vision-cone geometry this frame, clipped by
    // world.raycast so the fan never draws through a wall (the fan must show
    // what the guard can actually see — see file header / render contract).
    function updateVisionCone(actor, guard, world, squad) {
      var style = CONE_STYLE[guard.state] || CONE_STYLE.PATROL;
      actor.cone.material = CONE_MATERIALS[guard.state] || CONE_MATERIALS.PATROL;
      actor.coneEdge.material = EDGE_MATERIALS[guard.state] || EDGE_MATERIALS.PATROL;

      var caution = squad.phase === "CAUTION";
      var fovDeg = Game.VISION.FOV_DEG * (caution ? Game.GUARD.CAUTION_FOV_MULT : 1);
      var range = Game.VISION.RANGE * (caution ? Game.GUARD.CAUTION_RANGE_MULT : 1);
      var halfFov = (fovDeg * Math.PI) / 180 / 2;

      var segments = CONE_SEGMENTS;
      var positions = new Float32Array((segments + 2) * 3);
      positions[0] = guard.x;
      positions[1] = CONE_Y;
      positions[2] = guard.y;

      for (var i = 0; i <= segments; i++) {
        var angle = guard.facing - halfFov + (i * (2 * halfFov)) / segments;
        var farX = guard.x + Math.cos(angle) * range;
        var farY = guard.y + Math.sin(angle) * range;
        var hit = world.raycast(guard.x, guard.y, farX, farY);
        var px = hit ? hit.x : farX;
        var py = hit ? hit.y : farY;
        var idx = (i + 1) * 3;
        positions[idx] = px;
        positions[idx + 1] = CONE_Y;
        positions[idx + 2] = py;
      }

      var indices = [];
      for (var k = 0; k < segments; k++) {
        indices.push(0, k + 1, k + 2);
      }

      actor.cone.geometry.dispose();
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setIndex(indices);
      actor.cone.geometry = geo;

      // The fan boundary (apex -> arc point 0 -> ... -> arc point N) is
      // exactly the same vertex sequence already computed above; a LineLoop
      // over it closes N -> apex, tracing both straight edges plus the arc
      // in one pass — a crisp outline even where the additive fill is faint.
      actor.coneEdge.geometry.dispose();
      var edgePositions = positions.slice();
      // Nudge the outline a hair above the fill plane so it never z-fights
      // with it (both are depthWrite:false, but this keeps draw order moot).
      for (var e = 1; e < edgePositions.length; e += 3) edgePositions[e] = CONE_Y + 0.005;
      var edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
      actor.coneEdge.geometry = edgeGeo;
      // style read above only to keep the CONE_STYLE lookup obviously alive
      // for future tuning (e.g. per-state fov override); currently unused
      // beyond material selection.
      void style;
    }

    function updateGuardMarker(actor, guard) {
      var mat = MARKER_MATERIALS[guard.state];
      if (!mat) {
        actor.marker.visible = false;
        return;
      }
      actor.marker.visible = true;
      actor.marker.material = mat;
      var h = STAND_H; // guards have no stance; body is always "stand" height
      // The camera's tilt compresses vertical elevation on screen (only the
      // component of world-Y along the camera's up axis shows up as
      // screen-up), so the marker needs more world-space clearance above the
      // guard's head than a straight top-down camera would — otherwise it
      // reads as sitting on top of the guard rather than floating above it.
      // (Raised slightly further than the pre-polish 1.3 to keep clearance
      // now that the marker itself is twice as large.)
      actor.marker.position.set(guard.x, h + 1.5, guard.y);
    }

    // ---- security cameras (see file header CAMERAS note) -----------------------
    // Static wall-mounted housing (position/facing fixed at construction,
    // matching src/director.js's schema — cameras never move) + a pivoting
    // cone fan that DOES change every frame (panAngle sweeps, color reacts to
    // meter/disabled). One actor per index into engine.director.cameraStates()
    // — cameras have no persistent id the way guards do, so index IS the key
    // (stable for a zone's lifetime; a zone change discards the whole roster
    // and rebuilds fresh, same as disposeGuardActors below).

    var cameraActors = {}; // index -> { housing, cone, coneEdge }

    function ensureCameraActor(index, cam) {
      var existing = cameraActors[index];
      if (existing) return existing;

      var housingGeo = new THREE.BoxGeometry(CAMERA_HOUSING_W, CAMERA_HOUSING_H, CAMERA_HOUSING_W);
      var housingMat = new THREE.MeshLambertMaterial({ color: CAMERA_HOUSING_COLOR });
      var housing = new THREE.Mesh(housingGeo, housingMat);
      // The housing itself never re-poses after this (cameras are fixed,
      // wall-mounted hardware, unlike a guard's body) — position/orientation
      // set once here, at the camera's own static x/y and its FIRST-FRAME
      // panAngle (director.cameraStates() exposes panAngle, not the static
      // `facing` center — close enough for a cosmetic housing that only
      // needs to look roughly aimed the right way; the cone fan below is
      // what actually tracks the live pan every frame).
      housing.position.set(cam.x, CAMERA_MOUNT_Y, cam.y);
      housing.rotation.y = -cam.panAngle;
      scene.add(housing);

      // NEW (readability polish, cycle 18 backlog item): each camera actor
      // gets its OWN cone/edge material instance (not a shared state-keyed
      // one) since the continuous meter ramp means any two cameras can be
      // sitting at different colors on the same frame — see
      // updateCameraCone below, which mutates these in place every call.
      var coneMesh = new THREE.Mesh(new THREE.BufferGeometry(), makeCameraConeMaterial());
      scene.add(coneMesh);

      var coneEdge = new THREE.LineLoop(new THREE.BufferGeometry(), makeCameraEdgeMaterial());
      scene.add(coneEdge);

      var actor = { housing: housing, cone: coneMesh, coneEdge: coneEdge };
      cameraActors[index] = actor;
      return actor;
    }

    // Removes + disposes every live camera actor (see ZONE CHANGES in the
    // file header) — same rationale as disposeGuardActors above: a zone
    // change means a different (possibly empty) camera roster, so nothing
    // from the old zone should linger. Housing geometry/material and cone/
    // coneEdge geometry AND materials are each owned exclusively by their
    // own actor now (see ensureCameraActor's own note above — no more shared
    // state-keyed material maps to leave untouched), so every one of them is
    // disposed here.
    function disposeCameraActors() {
      Object.keys(cameraActors).forEach(function (index) {
        var actor = cameraActors[index];
        scene.remove(actor.housing, actor.cone, actor.coneEdge);
        actor.housing.geometry.dispose();
        actor.housing.material.dispose();
        actor.cone.geometry.dispose();
        actor.cone.material.dispose();
        actor.coneEdge.geometry.dispose();
        actor.coneEdge.material.dispose();
      });
      cameraActors = {};
    }

    // Rebuilds a camera's vision-cone geometry this frame, same
    // raycast-clipped-fan TECHNIQUE as updateVisionCone above (apex at the
    // camera's fixed position, arc points clipped to the first wall each ray
    // hits) but reading the camera's own CURRENT panAngle/fovDeg/range from
    // director.cameraStates() instead of a guard's live facing/CAUTION
    // widening.
    function updateCameraCone(actor, camState, world) {
      // COLOR (new — readability polish, cycle 18 backlog item): dark grey
      // while disabled (chaff — dead hardware regardless of whatever stale
      // meter value it's frozen at), otherwise the continuous
      // Game.radarCameraColor(meter) ramp — see file header CAMERAS note.
      // Mutated in place on this actor's OWN material every frame (no more
      // swapping between shared state-keyed materials).
      if (camState.disabled) {
        actor.cone.material.color.setHex(CAMERA_CONE_DISABLED.color);
        actor.cone.material.opacity = CAMERA_CONE_DISABLED.opacity;
        actor.coneEdge.material.color.setHex(CAMERA_EDGE_DISABLED.color);
        actor.coneEdge.material.opacity = CAMERA_EDGE_DISABLED.opacity;
      } else {
        var rgb = Game.radarCameraColor(camState.meter);
        actor.cone.material.color.setRGB(rgb.r / 255, rgb.g / 255, rgb.b / 255);
        actor.cone.material.opacity = CAMERA_CONE_OPACITY;
        var edgeRgb = lightenTowardWhite(rgb, CAMERA_EDGE_LIGHTEN);
        actor.coneEdge.material.color.setRGB(edgeRgb.r / 255, edgeRgb.g / 255, edgeRgb.b / 255);
        actor.coneEdge.material.opacity = CAMERA_EDGE_OPACITY;
      }

      var halfFov = (camState.fovDeg * Math.PI) / 180 / 2;
      var range = camState.range;

      var segments = CONE_SEGMENTS;
      var positions = new Float32Array((segments + 2) * 3);
      positions[0] = camState.x;
      positions[1] = CONE_Y;
      positions[2] = camState.y;

      for (var i = 0; i <= segments; i++) {
        var angle = camState.panAngle - halfFov + (i * (2 * halfFov)) / segments;
        var farX = camState.x + Math.cos(angle) * range;
        var farY = camState.y + Math.sin(angle) * range;
        var hit = world.raycast(camState.x, camState.y, farX, farY);
        var px = hit ? hit.x : farX;
        var py = hit ? hit.y : farY;
        var idx = (i + 1) * 3;
        positions[idx] = px;
        positions[idx + 1] = CONE_Y;
        positions[idx + 2] = py;
      }

      var indices = [];
      for (var k = 0; k < segments; k++) {
        indices.push(0, k + 1, k + 2);
      }

      actor.cone.geometry.dispose();
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setIndex(indices);
      actor.cone.geometry = geo;

      actor.coneEdge.geometry.dispose();
      var edgePositions = positions.slice();
      for (var e = 1; e < edgePositions.length; e += 3) edgePositions[e] = CONE_Y + 0.005;
      var edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
      actor.coneEdge.geometry = edgeGeo;
    }

    // ---- doors / lasers / pickups (see file header) ---------------------------

    var doorActors = {}; // door.id -> { mesh }
    var laserActors = {}; // index -> { line }
    var pickupActors = {}; // index -> { mesh }

    function ensureDoorActor(door) {
      var existing = doorActors[door.id];
      if (existing) return existing;
      var geo = new THREE.BoxGeometry(door.w, DOOR_HEIGHT, door.h);
      var mat = new THREE.MeshLambertMaterial({
        color: door.lock ? DOOR_LOCK_COLOR[door.lock] : DOOR_UNLOCKED_COLOR,
        transparent: true,
        opacity: 0.95,
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(door.x + door.w / 2, DOOR_HEIGHT / 2, door.y + door.h / 2);
      scene.add(mesh);
      var actor = { mesh: mesh };
      doorActors[door.id] = actor;
      return actor;
    }

    function disposeDoorActors() {
      Object.keys(doorActors).forEach(function (id) {
        var actor = doorActors[id];
        scene.remove(actor.mesh);
        actor.mesh.geometry.dispose();
        actor.mesh.material.dispose();
      });
      doorActors = {};
    }

    function ensureLaserActor(index, laser) {
      var existing = laserActors[index];
      if (existing) return existing;
      var positions = new Float32Array([laser.x1, LASER_Y, laser.y1, laser.x2, LASER_Y, laser.y2]);
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      var mat = new THREE.LineBasicMaterial({ color: LASER_COLOR, transparent: true, opacity: 0.95 });
      var line = new THREE.Line(geo, mat);
      scene.add(line);
      var actor = { line: line };
      laserActors[index] = actor;
      return actor;
    }

    function disposeLaserActors() {
      Object.keys(laserActors).forEach(function (index) {
        var actor = laserActors[index];
        scene.remove(actor.line);
        actor.line.geometry.dispose();
        actor.line.material.dispose();
      });
      laserActors = {};
    }

    function ensurePickupActor(index, pickup) {
      var existing = pickupActors[index];
      if (existing) return existing;
      var geo = new THREE.BoxGeometry(PICKUP_SIZE, PICKUP_SIZE, PICKUP_SIZE * 0.15);
      var mat = new THREE.MeshLambertMaterial({
        color: PICKUP_COLOR,
        emissive: PICKUP_COLOR,
        emissiveIntensity: 0.6,
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pickup.x, PICKUP_Y, pickup.y);
      scene.add(mesh);
      var actor = { mesh: mesh };
      pickupActors[index] = actor;
      return actor;
    }

    function disposePickupActors() {
      Object.keys(pickupActors).forEach(function (index) {
        var actor = pickupActors[index];
        scene.remove(actor.mesh);
        actor.mesh.geometry.dispose();
        actor.mesh.material.dispose();
      });
      pickupActors = {};
    }

    // Keycard already collected? Same HONEST GAP as src/radar.js's own
    // pickups field (chaff has no exposed collected flag) — see file header.
    function pickupCollected(item, engine) {
      var kc = engine.inventory && engine.inventory.keycards;
      if (!kc) return false;
      if (item === "keycardL1") return !!kc.L1;
      if (item === "keycardL2") return !!kc.L2;
      if (item === "keycardL3") return !!kc.L3;
      return false;
    }

    // ---- detection meter (two quads above the player) --------------------------

    var meterBg = null;
    var meterFill = null;

    function ensureMeter() {
      if (meterBg) return;
      meterBg = new THREE.Sprite(
        new THREE.SpriteMaterial({ color: 0x111111, transparent: true, opacity: 0.6, depthTest: false })
      );
      meterBg.scale.set(METER_MAX_W, METER_H, 1);
      meterFill = new THREE.Sprite(
        new THREE.SpriteMaterial({ color: 0x2e7d32, transparent: true, depthTest: false })
      );
      meterFill.scale.set(0.001, METER_H * 0.75, 1);
      scene.add(meterBg, meterFill);
    }

    // ---- dart tracer (see file header DART TRACER note) ------------------------

    var tracers = []; // { from:{x,y}, to:{x,y}, startTime } — pure data
    var tracerLines = []; // parallel THREE.Line objects currently in the scene

    function clearTracers() {
      tracerLines.forEach(function (line) {
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      });
      tracerLines = [];
      tracers = [];
    }

    function updateTracers(engine) {
      for (var i = 0; i < engine.events.length; i++) {
        var ev = engine.events[i];
        if (ev.type === "tranqFired" && ev.impact) {
          tracers.push({
            from: { x: engine.player.x, y: engine.player.y },
            to: { x: ev.impact.x, y: ev.impact.y },
            startTime: engine.time,
          });
        }
      }

      tracers = tracers.filter(function (t) {
        return engine.time - t.startTime < TRACER_DURATION_S;
      });

      // Rebuilt fresh every frame — the list is always tiny (a handful of
      // tracers alive at once, each lasting a quarter second), so this is
      // simpler and cheap enough versus reusing/pooling THREE.Line objects.
      tracerLines.forEach(function (line) {
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      });
      tracerLines = tracers.map(function (t) {
        var age = engine.time - t.startTime;
        var alpha = Math.max(0, 1 - age / TRACER_DURATION_S);
        var positions = new Float32Array([t.from.x, TRACER_Y, t.from.y, t.to.x, TRACER_Y, t.to.y]);
        var geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        var mat = new THREE.LineBasicMaterial({
          color: 0xbfffea,
          transparent: true,
          opacity: alpha,
          depthWrite: false,
        });
        var line = new THREE.Line(geo, mat);
        scene.add(line);
        return line;
      });
    }

    // ---- hit flash (see file header HIT FLASH note) ----------------------------

    // Small local color-lerp helper (0xRRGGBB ints, t clamped 0..1 by the
    // caller already always passing a valid alpha ratio) — no dependency on
    // THREE.Color for this, keeping it a plain number-in-number-out helper.
    function lerpHexColor(from, to, t) {
      var fr = (from >> 16) & 0xff,
        fg = (from >> 8) & 0xff,
        fb = from & 0xff;
      var tr = (to >> 16) & 0xff,
        tg = (to >> 8) & 0xff,
        tb = to & 0xff;
      var r = Math.round(fr + (tr - fr) * t);
      var g = Math.round(fg + (tg - fg) * t);
      var b = Math.round(fb + (tb - fb) * t);
      return (r << 16) | (g << 8) | b;
    }

    var hitFlashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: HIT_FLASH_COLOR,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        // DoubleSide defensively — this plane's visible face depends on
        // getting the camera-local -Z "faces the camera" orientation exactly
        // right; not worth a blank/invisible overlay bug over saving one
        // fill's worth of backface culling on a single full-screen quad.
        side: THREE.DoubleSide,
      })
    );
    hitFlashMesh.position.set(0, 0, HIT_FLASH_Z);
    hitFlashMesh.renderOrder = 999; // belt-and-braces on top of every other transparent draw
    hitFlashMesh.visible = false;
    camera.add(hitFlashMesh); // camera-local child — see "scene.add(camera)" above

    var hitFlashStart = null; // engine.time of the most recent playerHit event, null = never hit

    // Scans this tick's events (same same-tick pattern as updateTracers
    // above), resets (never stacks — see file header) the flash clock on a
    // fresh playerHit, and returns the current 0..HIT_FLASH_ALPHA_MAX alpha.
    // Called once per frame, BEFORE the player-mesh tint below so both read
    // the same alpha for the same frame.
    function computeHitFlashAlpha(engine) {
      for (var i = 0; i < engine.events.length; i++) {
        if (engine.events[i].type === "playerHit") {
          hitFlashStart = engine.time;
          break;
        }
      }
      if (hitFlashStart === null) return 0;
      var age = engine.time - hitFlashStart;
      if (age >= HIT_FLASH_DURATION_S) return 0;
      return HIT_FLASH_ALPHA_MAX * (1 - age / HIT_FLASH_DURATION_S);
    }

    function updateHitFlashMesh(alpha) {
      hitFlashMesh.material.opacity = alpha;
      hitFlashMesh.visible = alpha > 0.0005;
      // Exactly fills the orthographic frustum at this depth regardless of
      // aspect/resize — see file header note on why this only works because
      // the camera is orthographic (no perspective divide with depth).
      hitFlashMesh.scale.set(
        Math.max(0.001, camera.right - camera.left),
        Math.max(0.001, camera.top - camera.bottom),
        1
      );
    }

    // ---- knock / footstep ripples (see file header RIPPLES note) ---------------

    var ripples = []; // pure data: { x, y, startTime, duration, maxR, kind } — up to RIPPLE_MAX_LIVE alive
    var ripplePool = []; // fixed-size pool of THREE.LineLoop, built once, reused (see file header POOLING)
    var lastRunRippleAt = -Infinity;
    var lastWalkRippleAt = -Infinity;

    function ensureRipplePool() {
      while (ripplePool.length < RIPPLE_MAX_LIVE) {
        var positions = new Float32Array(RIPPLE_SEGMENTS * 3);
        var geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        var mat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        var line = new THREE.LineLoop(geo, mat);
        line.visible = false;
        scene.add(line);
        ripplePool.push(line);
      }
    }

    // Clears the pure ripple data (called on a zone change — see ZONE
    // CHANGES below — old-zone x/y are meaningless in the new one). The pool
    // meshes themselves are left in the scene (zone-agnostic, reused as-is);
    // the per-frame sync below hides every pool slot with no ripple assigned.
    function clearRipples() {
      ripples = [];
    }

    function spawnRipple(x, y, startTime, kind, maxR) {
      ripples.push({
        x: x,
        y: y,
        startTime: startTime,
        duration: RIPPLE_STYLE[kind].duration,
        maxR: maxR,
        kind: kind,
      });
    }

    function writeRingPositions(line, x, y, r) {
      var arr = line.geometry.attributes.position.array;
      for (var i = 0; i < RIPPLE_SEGMENTS; i++) {
        var a = (i / RIPPLE_SEGMENTS) * TWO_PI_R;
        arr[i * 3] = x + Math.cos(a) * r;
        arr[i * 3 + 1] = RIPPLE_Y;
        arr[i * 3 + 2] = y + Math.sin(a) * r;
      }
      line.geometry.attributes.position.needsUpdate = true;
    }

    function updateRipples(engine) {
      ensureRipplePool();

      // KNOCK (event-driven, same same-tick pattern as updateTracers above).
      for (var i = 0; i < engine.events.length; i++) {
        var ev = engine.events[i];
        if (ev.type === "knock") {
          spawnRipple(ev.x, ev.y, engine.time, "knock", Game.SOUND.RADII.knock);
        }
      }

      // FOOTSTEPS (continuous state, not an event — see file header): read
      // player.noiseRadius() every frame and throttle spawns off engine.time
      // deltas. Suppressed entirely once gameOver (a dead/frozen player makes
      // no footsteps) — mirrors player.js's own "dead player" freeze posture.
      if (!engine.gameOver) {
        var nr = engine.player.noiseRadius();
        if (nr >= RUN_NOISE_THRESHOLD) {
          if (engine.time - lastRunRippleAt >= RUN_RIPPLE_INTERVAL_S) {
            spawnRipple(engine.player.x, engine.player.y, engine.time, "run", Game.SOUND.RADII.run);
            lastRunRippleAt = engine.time;
          }
        } else if (nr >= WALK_NOISE_THRESHOLD) {
          if (engine.time - lastWalkRippleAt >= WALK_RIPPLE_INTERVAL_S) {
            spawnRipple(engine.player.x, engine.player.y, engine.time, "walk", Game.SOUND.RADII.walk);
            lastWalkRippleAt = engine.time;
          }
        }
        // crouch (1) / crawl (0) / stationary (0): no ripple, per design brief.
      }

      ripples = ripples.filter(function (r) {
        return engine.time - r.startTime < r.duration;
      });
      // Airtight pool contract: never let more ripples live than pool slots
      // exist (shouldn't happen given the spawn throttles above, but a static
      // knock spam edge case — e.g. many knock events landing extremely close
      // together — must degrade by dropping the OLDEST, not by overrunning
      // the pool array).
      if (ripples.length > RIPPLE_MAX_LIVE) {
        ripples = ripples.slice(ripples.length - RIPPLE_MAX_LIVE);
      }

      for (var p = 0; p < ripplePool.length; p++) {
        var line = ripplePool[p];
        var ripple = ripples[p];
        if (!ripple) {
          line.visible = false;
          continue;
        }
        var age = engine.time - ripple.startTime;
        var t = age / ripple.duration; // 0..1
        var style = RIPPLE_STYLE[ripple.kind];
        var r = Math.max(0.05, t * ripple.maxR); // 0 -> maxR, linear in time (deterministic)
        writeRingPositions(line, ripple.x, ripple.y, r);
        line.material.color.setHex(style.color);
        line.material.opacity = style.opacity * (1 - t); // fades out as it expands
        line.visible = true;
      }
    }

    function meterColor(v) {
      // green -> yellow (0..0.5), yellow -> red (0.5..1)
      var c1, c2, t;
      if (v <= 0.5) {
        c1 = { r: 0x2e, g: 0x7d, b: 0x32 };
        c2 = { r: 0xf9, g: 0xa8, b: 0x25 };
        t = v / 0.5;
      } else {
        c1 = { r: 0xf9, g: 0xa8, b: 0x25 };
        c2 = { r: 0xc6, g: 0x28, b: 0x28 };
        t = (v - 0.5) / 0.5;
      }
      var r = Math.round(c1.r + (c2.r - c1.r) * t);
      var g = Math.round(c1.g + (c2.g - c1.g) * t);
      var b = Math.round(c1.b + (c2.b - c1.b) * t);
      return (r << 16) | (g << 8) | b;
    }

    function updateMeter(engine) {
      var value = 0;
      for (var i = 0; i < engine.guards.length; i++) {
        if (engine.guards[i].meter > value) value = engine.guards[i].meter;
      }
      if (value <= 0.001) {
        if (meterBg) {
          meterBg.visible = false;
          meterFill.visible = false;
        }
        return;
      }
      ensureMeter();
      meterBg.visible = true;
      meterFill.visible = true;

      var player = engine.player;
      var y = stanceHeight(player.stance) + 0.55;
      meterBg.position.set(player.x, y, player.y);
      meterFill.position.set(player.x, y, player.y);
      meterFill.scale.set(Math.max(0.001, METER_MAX_W * value), METER_H * 0.75, 1);
      meterFill.material.color.setHex(meterColor(value));
    }

    // ---- per-frame sync ---------------------------------------------------------

    // Tracks the zone id the static scene was last built for (see ZONE
    // CHANGES in the file header). null until the first syncScene() call.
    var currentZoneId = null;

    function syncScene(engine) {
      if (engine.zone && engine.zone.id !== currentZoneId) {
        if (built) {
          disposeStatic();
          disposeGuardActors();
          disposeCameraActors();
          disposeDoorActors();
          disposeLaserActors();
          disposePickupActors();
          built = false;
        }
        clearTracers(); // old zone's coordinates are meaningless in the new one
        clearRipples(); // same reasoning — see file header RIPPLES note
        // The player actor itself is NOT rebuilt on a zone change (see file
        // header ZONE CHANGES note — its mesh isn't zone-specific), but its
        // walk-cycle lastX/Y ARE last zone's coordinates — without this
        // reset, the very next frame would see one huge bogus displacement
        // (old-zone x/y -> new-zone spawn x/y) and briefly flash a
        // full-amplitude leg/arm swing on the very first frame of the new
        // zone. null contributes zero displacement on that first frame,
        // same as a freshly-created actor.
        if (playerActor) {
          playerActor.lastX = null;
          playerActor.lastY = null;
        }
        zone = engine.zone;
        zoneCenter = { x: zone.bounds.w / 2, y: zone.bounds.h / 2 };
        camera.position.set(zoneCenter.x, 26, zoneCenter.y + 14);
        camera.lookAt(zoneCenter.x, 0, zoneCenter.y);
        resize(); // refit the orthographic frustum to the new zone's bounds
        currentZoneId = zone.id;
      }

      if (!built) {
        buildStatic();
        built = true;
      }

      if (!playerActor) {
        playerActor = makeActor(PLAYER_COLOR, PLAYER_VISOR_COLOR);
        // Marked transparent up front (see file header PLAYER HIDDEN note)
        // so the per-frame opacity write below never has to toggle
        // .transparent itself — a one-time cost, not per-frame churn.
        playerActor.bodyMat.transparent = true;
        playerActor.visorMat.transparent = true;
        // BOX DISGUISE crate (see file header) — a separate mesh, own
        // geometry/material, added as a child of the SAME group so it
        // inherits the player's position/facing for free; hidden until
        // boxOn first goes true (see the box-disguise block below).
        playerActor.boxMesh = new THREE.Mesh(
          new THREE.BoxGeometry(BODY_W, 1, BODY_W),
          new THREE.MeshLambertMaterial({ color: BOX_COLOR, transparent: true })
        );
        playerActor.boxMesh.visible = false;
        playerActor.group.add(playerActor.boxMesh);
      }
      var player = engine.player;
      if (player.stance === "crawl") {
        var proneSwing = updateWalkCycle(playerActor, player.x, player.y, PRONE_SWING_RAD, player.running);
        poseProne(playerActor, player.x, player.y, player.facing, playerActor.phase, proneSwing, true);
      } else {
        var totalH = stanceHeight(player.stance);
        var tilt = player.stance === "crouch" ? CROUCH_TILT : 0;
        var swingRad = updateWalkCycle(playerActor, player.x, player.y, WALK_SWING_RAD, player.running);
        poseUpright(playerActor, player.x, player.y, player.facing, totalH, tilt, playerActor.phase, swingRad);
      }

      // HIT FLASH (see file header) — computed once here (before the
      // box-disguise recolor below) so both the full-viewport overlay
      // (updateHitFlashMesh, called down with updateTracers/updateMeter) and
      // the player-mesh tint immediately below read the same frame's alpha.
      var hitFlashAlpha = computeHitFlashAlpha(engine);

      // BOX DISGUISE (see file header) — swaps in the crate mesh built
      // above and hides the ENTIRE humanoid figureGroup (torso/head/visor/
      // all four limbs in one visibility flag, see makeActor) rather than
      // re-skinning a single body mesh the old scale trick relied on; runs
      // every frame so taking the box off reliably reverts to the normal
      // figure, not just a one-time swap when boxOn first flips true.
      var boxOn = !!(engine.inventory && engine.inventory.boxOn);
      if (boxOn) {
        playerActor.figureGroup.visible = false;
        playerActor.boxMesh.visible = true;
        // BOX_FOOTPRINT_SCALE scales BODY_W directly (the crate's own
        // scale is relative to its unscaled BODY_W x 1 x BODY_W geometry).
        playerActor.boxMesh.scale.set(BOX_FOOTPRINT_SCALE, BOX_HEIGHT, BOX_FOOTPRINT_SCALE);
        playerActor.boxMesh.position.set(0, BOX_HEIGHT / 2, 0);
        playerActor.boxMesh.material.color.setHex(BOX_COLOR);
      } else {
        playerActor.boxMesh.visible = false;
        playerActor.bodyMat.color.setHex(PLAYER_COLOR);
      }

      // HIT FLASH player-mesh tint (see file header) — lerps whichever
      // object is actually visible right now (the crate, or the figure's
      // shared bodyMat) toward PLAYER_HIT_TINT_COLOR by the flash's own
      // normalized alpha, so a boxed player still visibly flinches red on a
      // hit. No-op (leaves the base color alone) once the flash has fully
      // decayed.
      if (hitFlashAlpha > 0) {
        var tintT = hitFlashAlpha / HIT_FLASH_ALPHA_MAX;
        var tintMat = boxOn ? playerActor.boxMesh.material : playerActor.bodyMat;
        tintMat.color.setHex(lerpHexColor(tintMat.color.getHex(), PLAYER_HIT_TINT_COLOR, tintT));
      }

      // PLAYER HIDDEN dim/blink (see file header) — deterministic sine of
      // engine.time, never Date.now. Full opacity (1) whenever not hidden.
      // Written to all three materials (figure body, visor, crate) — cheap,
      // and means whichever one is currently visible is always correct
      // without needing to branch on boxOn here too.
      var playerOpacity = engine.playerHidden
        ? 0.42 + 0.18 * Math.sin(engine.time * HIDDEN_BLINK_HZ * TWO_PI_R)
        : 1;
      playerActor.bodyMat.opacity = playerOpacity;
      playerActor.visorMat.opacity = playerOpacity;
      playerActor.boxMesh.material.opacity = playerOpacity;

      for (var i = 0; i < engine.guards.length; i++) {
        var guard = engine.guards[i];
        var actor = ensureGuardActor(guard);
        if (guard.state === "SLEEPING") {
          // No walk-cycle animation while unconscious (matches the original
          // static sleeping pose) — but lastX/Y still tracks guard.x/y (a
          // dragged sleeping guard's position changes every tick, see file
          // header) so a subsequent wake-and-walk doesn't see one giant
          // bogus displacement on its first animated frame.
          actor.lastX = guard.x;
          actor.lastY = guard.y;
          poseProne(actor, guard.x, guard.y, guard.facing, actor.phase, 0, false);
          actor.cone.visible = false;
          actor.coneEdge.visible = false;
          actor.marker.visible = false;
          actor.zzz.visible = true;
          actor.dizzy.visible = false;
          var bob = Math.sin(engine.time * 2.2) * 0.12;
          actor.zzz.position.set(guard.x, PRONE_LIFT + 1.2 + bob, guard.y);
        } else if (guard.state === "STUNNED") {
          // STUNNED (see file header) — still upright (STAND_H pose, unlike
          // SLEEPING's lying-flat prone pose), no walk-cycle (dazed, not
          // walking), just swaying: poseUpright's own figureGroup.rotation
          // reset runs first, then this overrides rotation.z with the
          // wobble (rotating the whole figure as one rigid body about its
          // own floor-level origin, near where its feet plant).
          actor.lastX = guard.x;
          actor.lastY = guard.y;
          poseUpright(actor, guard.x, guard.y, guard.facing, STAND_H, 0, actor.phase, 0);
          actor.figureGroup.rotation.z = STUN_WOBBLE_AMPLITUDE * Math.sin(engine.time * STUN_WOBBLE_HZ * TWO_PI_R);
          actor.cone.visible = false;
          actor.coneEdge.visible = false;
          actor.marker.visible = false;
          actor.zzz.visible = false;
          actor.dizzy.visible = true;
          var dizzyBob = Math.sin(engine.time * STUN_DIZZY_BOB_HZ * TWO_PI_R) * STUN_DIZZY_BOB_AMPLITUDE;
          actor.dizzy.position.set(guard.x, STAND_H + STUN_DIZZY_Y_OFFSET + dizzyBob, guard.y);
        } else {
          var guardSwing = updateWalkCycle(actor, guard.x, guard.y, WALK_SWING_RAD, false);
          poseUpright(actor, guard.x, guard.y, guard.facing, STAND_H, 0, actor.phase, guardSwing);
          actor.cone.visible = true;
          actor.coneEdge.visible = true;
          actor.zzz.visible = false;
          actor.dizzy.visible = false;
          updateVisionCone(actor, guard, engine.world, engine.squad);
          updateGuardMarker(actor, guard);
        }
      }

      // SECURITY CAMERAS (see file header CAMERAS note) — pure snapshot read
      // off engine.director.cameraStates() (see src/director.js contract);
      // engine.director is empty-safe (undefined check only matters for a
      // bespoke pre-cycle test engine that predates this module — every real
      // engine always has one, even on a zone with zero cameras).
      var cameraStates = (engine.director && engine.director.cameraStates()) || [];
      for (var ci = 0; ci < cameraStates.length; ci++) {
        var camState = cameraStates[ci];
        var camActor = ensureCameraActor(ci, camState);
        updateCameraCone(camActor, camState, engine.world);
      }

      // DOORS (see file header) — re-colored (dimmed) once open; slab stays
      // in the scene either way (see file header note).
      var doors = (engine.zone && engine.zone.doors) || [];
      for (var doi = 0; doi < doors.length; doi++) {
        var door = doors[doi];
        var doorActor = ensureDoorActor(door);
        var isOpen = !!(engine.world && engine.world.isDoorOpen(door.id));
        doorActor.mesh.material.opacity = isOpen ? 0.25 : 0.95;
      }

      // LASERS (see file header) — visibility straight off director.
      // laserStates()'s own active flag; that flag already carries the
      // duty-cycle blink, so no separate timer is needed here.
      var laserStates = (engine.director && engine.director.laserStates()) || [];
      for (var lsi = 0; lsi < laserStates.length; lsi++) {
        var laserActor = ensureLaserActor(lsi, laserStates[lsi]);
        laserActor.line.visible = laserStates[lsi].active;
      }

      // PICKUPS (see file header) — visibility off once collected.
      var pickups = (engine.zone && engine.zone.pickups) || [];
      for (var pui = 0; pui < pickups.length; pui++) {
        var pickup = pickups[pui];
        var pickupActor = ensurePickupActor(pui, pickup);
        pickupActor.mesh.visible = !pickupCollected(pickup.item, engine);
      }

      updateTracers(engine);
      updateMeter(engine);
      updateHitFlashMesh(hitFlashAlpha);
      updateRipples(engine);
    }

    function render(engine) {
      syncScene(engine);
      webgl.render(scene, camera);
    }

    function resize() {
      var w = (container && container.clientWidth) || 1;
      var h = (container && container.clientHeight) || 1;
      webgl.setSize(w, h);

      var aspect = w / h;
      var marginScale = 1.15;
      var neededHalfW = (zone.bounds.w / 2) * marginScale;
      var neededHalfH = (zone.bounds.h / 2) * marginScale;
      var halfH = Math.max(neededHalfH, neededHalfW / aspect);
      var halfW = halfH * aspect;

      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    }

    resize();

    return {
      syncScene: syncScene,
      render: render,
      resize: resize,
    };
  }

  Game.createRenderer = createRenderer;
  if (typeof module !== "undefined") module.exports = { createRenderer: createRenderer };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
