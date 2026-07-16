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
    var BODY_W = 0.8; // box footprint, x and z

    var PERIMETER_H = 2.2;
    var INTERIOR_H = 1.6;

    var FLOOR_COLOR = 0x1a2028;
    var DARKZONE_COLOR = 0x0c1218;
    var WALL_PERIMETER_COLOR = 0x3a4a3f;
    var WALL_INTERIOR_COLOR = 0x4d6152;
    var WALL_EDGE_COLOR = 0x11150f;
    var EXIT_COLOR = 0x00ff66;
    var PLAYER_COLOR = 0x4682b4; // steel blue
    var GUARD_COLOR = 0x6b8e23; // olive drab
    // CARDBOARD BOX (new — box/chaff/ration cycle, see file header BOX
    // DISGUISE note below): cardboard-brown, matching src/hud.js's BOX
    // status-pill color family.
    var BOX_COLOR = 0x8b5a2b;
    var BOX_HEIGHT = 1.0; // world units — a fixed crate height, stance-independent
    var BOX_FOOTPRINT_SCALE = 1.45; // "slightly larger than the player" (BODY_W * this)
    var NOSE_COLOR = 0xf2f2f2;
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

    var METER_MAX_W = 2.0;
    var METER_H = 0.32;

    // SLEEPING pose (scale trick — see file header): the standing body mesh
    // (BoxGeometry(BODY_W, 1, BODY_W), normally scaled to (1, height, 1) and
    // sat at y = height/2 by placeActor) is instead scaled to lie flat along
    // local +X (the direction the group's rotation.y already points it, so a
    // sleeping body reads as lying in the direction it was facing when it
    // went down) at a low, floor-hugging profile.
    var SLEEP_LENGTH = STAND_H; // lying "length" ~= a standing guard's height
    var SLEEP_THICKNESS = 0.4; // low profile, floor-hugging
    var SLEEP_Y = SLEEP_THICKNESS / 2;

    var TRACER_DURATION_S = 0.25;
    var TRACER_Y = 0.6; // roughly muzzle height

    // PLAYER HIDDEN dim/blink (see file header) — cycles/sec-ish for the
    // opacity sine while engine.playerHidden is true.
    var HIDDEN_BLINK_HZ = 1.4;
    var TWO_PI_R = Math.PI * 2;

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

    // ---- static scene (built once per zone) -------------------------------------

    var built = false;
    // Every THREE.Object3D added by buildStatic(), so a zone change can remove
    // + dispose them all without hunting through `scene.children` (see
    // disposeStatic below and the ZONE CHANGES note in the file header).
    var staticObjects = [];

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
      var floorMat = new THREE.MeshLambertMaterial({ color: FLOOR_COLOR });
      addStatic(buildFlatQuad(0, 0, zone.bounds.w, zone.bounds.h, 0, floorMat));

      var darkMat = new THREE.MeshLambertMaterial({ color: DARKZONE_COLOR });
      (zone.darkZones || []).forEach(function (dz) {
        addStatic(buildFlatQuad(dz.x, dz.y, dz.w, dz.h, 0.01, darkMat));
      });

      (zone.walls || []).forEach(function (wall) {
        var perimeter = isPerimeterWall(wall);
        var h = perimeter ? PERIMETER_H : INTERIOR_H;
        var geo = new THREE.BoxGeometry(wall.w, h, wall.h);
        var mat = new THREE.MeshLambertMaterial({
          color: perimeter ? WALL_PERIMETER_COLOR : WALL_INTERIOR_COLOR,
        });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(wall.x + wall.w / 2, h / 2, wall.y + wall.h / 2);
        addStatic(mesh);

        var edges = new THREE.EdgesGeometry(geo);
        var line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: WALL_EDGE_COLOR })
        );
        line.position.copy(mesh.position);
        addStatic(line);
      });

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
    }

    // ---- dynamic actors (player, guards) ---------------------------------------

    function makeNose(color) {
      var geo = new THREE.ConeGeometry(0.16, 0.5, 8);
      geo.rotateZ(-Math.PI / 2); // point along local +X
      var mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: color }));
      return mesh;
    }

    function makeActor(bodyColor, noseColor) {
      var group = new THREE.Group();
      var bodyGeo = new THREE.BoxGeometry(BODY_W, 1, BODY_W);
      var body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: bodyColor }));
      group.add(body);
      var nose = makeNose(noseColor);
      group.add(nose);
      scene.add(group);
      return { group: group, body: body, nose: nose };
    }

    function placeActor(actor, x, y, facing, height) {
      actor.group.position.set(x, 0, y);
      actor.group.rotation.y = -facing;
      // Explicit full reset (not just scale.y) so an actor that was posed
      // SLEEPING (see placeSleepingActor below) on a previous frame doesn't
      // carry over its lying-flat scale/rotation once it's awake again.
      actor.body.scale.set(1, height, 1);
      actor.body.rotation.set(0, 0, 0);
      actor.body.position.set(0, height / 2, 0);
      actor.nose.visible = true;
      actor.nose.position.set(BODY_W / 2 + 0.1, height * 0.55, 0);
    }

    // SLEEPING pose (see file header) — guards only, never the player. Lies
    // the body mesh flat along local +X via a scale trick (no rotation
    // needed): the mesh's own local X axis already points the direction the
    // group's rotation.y turns it, so a sleeping body reads as lying in the
    // direction it was facing when it went down.
    function placeSleepingActor(actor, guard) {
      actor.group.position.set(guard.x, 0, guard.y);
      actor.group.rotation.y = -guard.facing;
      actor.body.scale.set(SLEEP_LENGTH / BODY_W, SLEEP_THICKNESS, 1);
      actor.body.rotation.set(0, 0, 0);
      actor.body.position.set(0, SLEEP_Y, 0);
      actor.nose.visible = false;
    }

    var playerActor = null;

    var guardActors = {}; // id -> { group, body, nose, marker (Sprite), cone (Mesh) }

    function ensureGuardActor(guard) {
      var existing = guardActors[guard.id];
      if (existing) return existing;

      var base = makeActor(GUARD_COLOR, NOSE_COLOR);

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

      var actor = {
        group: base.group,
        body: base.body,
        nose: base.nose,
        marker: marker,
        cone: coneMesh,
        coneEdge: coneEdge,
        zzz: zzz,
      };
      guardActors[guard.id] = actor;
      return actor;
    }

    // Removes + disposes every live guard actor (see ZONE CHANGES in the file
    // header — a zone change means a brand-new guard roster with different
    // ids, e.g. loadingDock's "g1" vs warehouse's "w1"/"w2", so the old
    // actors would otherwise sit around invisible-but-never-freed forever).
    // body/nose geometry+material and cone/coneEdge geometry are each owned
    // exclusively by their actor (fresh THREE.Material/Geometry per
    // makeActor()/updateVisionCone() call) and are disposed here; cone/
    // coneEdge MATERIALS and the marker's material come from the shared
    // CONE_MATERIALS/EDGE_MATERIALS/MARKER_MATERIALS maps (keyed by guard
    // state, reused across every guard and every zone) and must NOT be
    // disposed, or the next zone's guards would render with dead materials.
    // zzz likewise shares ZZZ_MATERIAL (see file header) — only removed from
    // the scene here, never disposed.
    function disposeGuardActors() {
      Object.keys(guardActors).forEach(function (id) {
        var actor = guardActors[id];
        scene.remove(actor.group, actor.marker, actor.cone, actor.coneEdge, actor.zzz);
        actor.body.geometry.dispose();
        actor.body.material.dispose();
        actor.nose.geometry.dispose();
        actor.nose.material.dispose();
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
          built = false;
        }
        clearTracers(); // old zone's coordinates are meaningless in the new one
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
        playerActor = makeActor(PLAYER_COLOR, NOSE_COLOR);
        // Marked transparent up front (see file header PLAYER HIDDEN note)
        // so the per-frame opacity write below never has to toggle
        // .transparent itself — a one-time cost, not per-frame churn.
        playerActor.body.material.transparent = true;
        playerActor.nose.material.transparent = true;
      }
      var player = engine.player;
      placeActor(playerActor, player.x, player.y, player.facing, stanceHeight(player.stance));

      // BOX DISGUISE (see file header) — re-skins the SAME body/nose meshes
      // placeActor just posed above; runs every frame so taking the box off
      // reliably reverts to the normal color/scale/nose-visible, not just a
      // one-time swap when boxOn first flips true.
      var boxOn = !!(engine.inventory && engine.inventory.boxOn);
      if (boxOn) {
        // BOX_FOOTPRINT_SCALE scales BODY_W directly (the body mesh's own
        // scale is relative to its unscaled BODY_W x 1 x BODY_W geometry,
        // same convention placeActor's `1` X/Z scale already relies on).
        playerActor.body.scale.set(BOX_FOOTPRINT_SCALE, BOX_HEIGHT, BOX_FOOTPRINT_SCALE);
        playerActor.body.position.set(0, BOX_HEIGHT / 2, 0);
        playerActor.body.material.color.setHex(BOX_COLOR);
        playerActor.nose.visible = false; // a box gives no external facing hint
      } else {
        playerActor.body.material.color.setHex(PLAYER_COLOR);
      }

      // PLAYER HIDDEN dim/blink (see file header) — deterministic sine of
      // engine.time, never Date.now. Full opacity (1) whenever not hidden.
      var playerOpacity = engine.playerHidden
        ? 0.42 + 0.18 * Math.sin(engine.time * HIDDEN_BLINK_HZ * TWO_PI_R)
        : 1;
      playerActor.body.material.opacity = playerOpacity;
      playerActor.nose.material.opacity = playerOpacity;

      for (var i = 0; i < engine.guards.length; i++) {
        var guard = engine.guards[i];
        var actor = ensureGuardActor(guard);
        if (guard.state === "SLEEPING") {
          placeSleepingActor(actor, guard);
          actor.cone.visible = false;
          actor.coneEdge.visible = false;
          actor.marker.visible = false;
          actor.zzz.visible = true;
          var bob = Math.sin(engine.time * 2.2) * 0.12;
          actor.zzz.position.set(guard.x, SLEEP_Y + 1.1 + bob, guard.y);
        } else {
          placeActor(actor, guard.x, guard.y, guard.facing, STAND_H);
          actor.cone.visible = true;
          actor.coneEdge.visible = true;
          actor.zzz.visible = false;
          updateVisionCone(actor, guard, engine.world, engine.squad);
          updateGuardMarker(actor, guard);
        }
      }

      updateTracers(engine);
      updateMeter(engine);
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
