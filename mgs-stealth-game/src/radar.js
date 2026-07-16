// src/radar.js
// PUBLIC API:
//   Game.RADAR — tunable constants:
//     {
//       WIDTH: 220,             // css px, canvas width (height derived from zone aspect)
//       MARGIN: 14,             // css px, gap from the container's top-right corner
//       PULSE_PERIOD_S: 1.6,    // seconds per exit-block brightness pulse cycle
//       SWEEP_PERIOD_S: 2.6,    // seconds per background scan-line sweep cycle
//       STATIC_CELL: 9,         // css px, jammed-state noise cell size
//       BLINK_TICKS: 18,        // engine ticks per jammed "ALERT" text blink half-cycle
//     }
//
//   Game.radarModel(engine) -> plain, JSON-safe object (no functions, no
//   undefined fields anywhere in the tree — every field is a primitive, a
//   plain object, or an array of those):
//     {
//       jammed: boolean,      // true iff phaseJam || chaffActive (see both
//                             // below) -- this is the single place the view
//                             // checks "static vs live".
//       phaseJam: boolean,    // true iff engine.squad.phase is "ALERT" or
//                             // "EVASION".
//       chaffActive: boolean, // CHAFF HOOK (fulfilled -- src/items.js/
//                             // src/engine.js's CHAFF VERB): true iff
//                             // engine.chaffUntil > engine.time (an absolute
//                             // sim-time deadline set by throwing a chaff
//                             // grenade, see engine.js's CHAFF VERB
//                             // contract). Falls back to false when
//                             // engine.chaffUntil is absent (a bespoke test
//                             // engine-shaped object predating this cycle),
//                             // same backward-compat rationale as hud.js's
//                             // weapon/item placeholder fallbacks. Exposed
//                             // as its own field (rather than folded silently
//                             // into `jammed`) so the view can render a
//                             // chaff-only jam differently from a phase-
//                             // driven ALERT/EVASION blackout -- see
//                             // drawStatic/drawBlinkText below. CAMERA HOOK
//                             // (not this cycle -- the Laboratory zone's
//                             // cameras don't exist yet): whenever a camera
//                             // entity exists, it is expected to gate its
//                             // own perception off this SAME chaffActive
//                             // signal, not a second parallel timer.
//       zone: { w, h },       // engine.zone.bounds, copied
//       walls: [ {x,y,w,h}, ... ],      // engine.zone.walls, copied
//       darkZones: [ {x,y,w,h}, ... ],  // engine.zone.darkZones, copied
//       exit: { x, y, w, h },           // engine.zone.exit, copied
//       player: { x, y, facing, stance },
//       guards: [ { id, x, y, facing, state, fovDeg, range }, ... ]
//         // EMPTY when jammed (the model must not leak guard positions
//         // during ALERT/EVASION -- that's the whole gameplay point of the
//         // radar going dark). Otherwise one entry per engine.guards, in the
//         // same order. fovDeg/range mirror the REAL perception guardAI.js
//         // is using this tick: VISION.FOV_DEG/VISION.RANGE normally, or
//         // VISION.FOV_DEG*GUARD.CAUTION_FOV_MULT /
//         // VISION.RANGE*GUARD.CAUTION_RANGE_MULT whenever
//         // engine.squad.phase === "CAUTION" (regardless of the individual
//         // guard's own state -- see guardAI.js's contract: the whole squad
//         // is extra alert while CAUTION holds). This is a MIRROR of
//         // guardAI's own perception widening, not an independent
//         // re-derivation -- if guardAI.js's CAUTION widening rule ever
//         // changes, this must change with it.
//       cameras: [ { x, y, facing, fovDeg, range, disabled, meter }, ... ]
//         // NEW (director cycle -- see src/director.js contract, the
//         // fulfilled "CAMERA HOOK"). EMPTY when jammed, same rationale as
//         // `guards` above (a camera's live sweep direction is exactly the
//         // kind of tactical intel the radar going dark is supposed to
//         // deny -- and jammed is already true whenever chaffActive is,
//         // since chaffActive is OR'd into it, so a chaff-disabled camera
//         // is never the reason this array is non-empty-but-dark; see
//         // `disabled` below). Otherwise one entry per engine.director.
//         // cameraStates(), same order, straight passthrough of that
//         // contract's own fields (x/y/fovDeg/range copied verbatim; `facing`
//         // here IS that contract's `panAngle` -- the camera's CURRENT pan
//         // direction, not its static mount-center facing, since that's
//         // what the view actually draws the wedge along). `disabled` and
//         // `meter` are exposed so the view can pick NORMAL/ALERT/DISABLED
//         // styling exactly like src/render.js's own cameraStyleKey (pale
//         // cyan normally, red once meter >= VISION.SUSPICIOUS_AT, dark grey
//         // while disabled) -- kept as an honest per-camera field rather
//         // than folded into `jammed` because a real future desync between
//         // chaffUntil-driven camera disable and squad-phase jam is exactly
//         // what this field exists to represent, even though with the
//         // current director both conditions happen to coincide today.
//         // engine.director may be absent on a bespoke pre-cycle test engine
//         // object -- falls back to [], same backward-compat posture as
//         // chaffActive's own fallback above.
//       doors: [ { x, y, w, h, lock, open }, ... ]
//         // NEW (Laboratory cycle) -- one entry per engine.zone.doors, same
//         // order, `open` from engine.world.isDoorOpen(id) (read fresh every
//         // render() call), x/y/w/h/lock copied through verbatim. UNLIKE
//         // guards/cameras this is NOT emptied while jammed -- a door's
//         // lock color/open-state is structural level geometry, not moment-
//         // to-moment tactical intel the same way a live guard/camera
//         // position is, so it stays visible even mid-ALERT (matching how
//         // `walls`/`darkZones` themselves are never hidden by `jammed`
//         // either). engine.zone.doors/engine.world may be absent on a
//         // bespoke pre-cycle test engine -- falls back to [].
//       lasers: [ { x1, y1, x2, y2, active }, ... ]
//         // NEW (Laboratory cycle) -- one entry per engine.director.
//         // laserStates(), same order, straight passthrough (x1/y1/x2/y2
//         // copied verbatim, `active` is that contract's own field). EMPTY
//         // when jammed, same rationale as `guards`/`cameras` above -- a
//         // live laser's on/off duty-cycle phase is exactly the kind of
//         // real-time tactical read the radar going dark is supposed to
//         // deny. engine.director may be absent on a bespoke pre-cycle test
//         // engine -- falls back to [].
//       pickups: [ { x, y, item }, ... ]
//         // NEW (Laboratory cycle) -- one entry per engine.zone.pickups NOT
//         // already reflected as held in engine.inventory.keycards (a
//         // collected keycard stops glowing; see the chaff HONEST GAP note
//         // at this field's construction site for the one known cosmetic
//         // exception). NOT emptied while jammed, same "structural, not
//         // tactical" rationale as doors above.
//     }
//   Pure function of engine state, no DOM/THREE/Date/Math.random -- runs
//   headless in node (tests/radar.test.js exercises this half only).
//
//   Game.createRadar({ container }) -> radar (BROWSER ONLY -- uses
//   document/canvas 2D; never call from node)
//     container: DOM element the radar's own <canvas> is appended into.
//       This module creates exactly one canvas, absolutely positioned via
//       inline style top-right within `container`; it adds no other DOM and
//       never queries the document for anything outside what it created.
//     radar.render(engine) — computes Game.radarModel(engine) and draws it
//       to the canvas. Re-reads engine.zone every call (canvas is resized to
//       match if the zone's bounds/aspect ever changes -- zones change
//       later). MGS-aesthetic top-down tactical map:
//         - near-black green-tinted panel background (~0.85 alpha)
//         - 1px bright-green (#39ff6a) panel border
//         - walls: slightly-lighter-green filled rects
//         - darkZones: barely-darker patches
//         - exit: pulsing bright block, driven by engine.time (deterministic
//           sine, no Date) so it reads as "active" without ever flashing
//           erratically
//         - player: white triangle pointing along facing
//         - guards: red-orange triangles, each with its vision cone drawn as
//           a translucent filled arc using THAT guard's own fovDeg/range
//           from the model (never re-derived here) and colored by state
//           (PATROL green / SUSPICIOUS yellow / INVESTIGATE orange / CAUTION
//           amber, matching src/render.js's CONE_STYLE palette)
//         - a faint background scan-line sweep for texture, driven by
//           engine.time (deterministic, purely cosmetic, never obscures
//           entities)
//       JAMMED (model.jammed === true): entities are NOT drawn at all.
//       Instead: animated static -- a grid of cells, each cell's brightness
//       a deterministic hash of (cellIndex, engine.tickCount >> 2) so it
//       visibly crawls over time without ever calling Math.random -- plus a
//       blinking text overlay (visibility toggles on engine.tickCount, see
//       BLINK_TICKS). CHAFF LOOKS DIFFERENT FROM ALERT (new -- see
//       radarModel's chaffActive field above): while model.phaseJam is true
//       the static renders in the usual green tint with a blinking red
//       "ALERT" label (unchanged from before); while jammed only because
//       model.chaffActive is true (phaseJam false -- squad is still
//       INFILTRATION, just chaff-blinded), the static renders in a bluish
//       tint instead and the blinking label reads "CHAFF" in blue -- same
//       deterministic hash/blink mechanics, different palette/text, so a
//       glance at the radar tells you WHY it's dark (a squad actually onto
//       you vs. a self-inflicted few seconds of blindness you chose to
//       trade for a distracted guard -- see engine.js's CHAFF VERB "the
//       tradeoff is the point" note).
//     THREE is never referenced anywhere in this file (canvas 2D only).
//
// Pure logic (radarModel) + browser view (createRadar) in one file, split so
// the model half is fully node-testable (see file header note above); the
// view half is browser-only and untested headless by design (canvas pixels
// aren't asserted against -- see tests/radar.test.js's own header).
(function (Game) {
  var RADAR = {
    WIDTH: 220,
    MARGIN: 14,
    PULSE_PERIOD_S: 1.6,
    SWEEP_PERIOD_S: 2.6,
    STATIC_CELL: 9,
    BLINK_TICKS: 18,
  };

  var CONE_STYLE = {
    PATROL: "rgba(46, 125, 50, 0.35)",
    SUSPICIOUS: "rgba(249, 168, 37, 0.40)",
    INVESTIGATE: "rgba(239, 108, 0, 0.40)",
    ALERT: "rgba(198, 40, 40, 0.45)",
    EVASION: "rgba(106, 27, 154, 0.40)",
    CAUTION: "rgba(255, 143, 0, 0.35)",
  };

  // CAMERA cone palette (see file header cameras note) -- pale cyan
  // normally, red once meter reaches SUSPICIOUS_AT, dark grey while
  // disabled -- matching src/render.js's CAMERA_CONE_STYLE 3-state scheme.
  var CAMERA_CONE_STYLE = {
    NORMAL: "rgba(128, 222, 234, 0.32)",
    ALERT: "rgba(255, 82, 82, 0.42)",
    DISABLED: "rgba(102, 102, 102, 0.18)",
  };

  // DOOR lock-color coding (new -- Laboratory cycle, see file header):
  // L1 blue, L2 amber, L3 red (escalating danger the deeper the
  // progression), null (unlocked) a neutral grey-green.
  var DOOR_LOCK_COLOR = {
    L1: "rgba(80, 140, 255, 0.55)",
    L2: "rgba(255, 176, 60, 0.55)",
    L3: "rgba(255, 70, 70, 0.6)",
  };
  var DOOR_UNLOCKED_COLOR = "rgba(150, 190, 160, 0.4)";
  var DOOR_OPEN_COLOR = "rgba(150, 190, 160, 0.18)"; // dim -- open doors barely read as a slab at all
  var LASER_COLOR = "rgba(255, 40, 40, 0.95)";

  // ---- pure model -----------------------------------------------------------

  function copyRect(r) {
    return { x: r.x, y: r.y, w: r.w, h: r.h };
  }

  function radarModel(engine) {
    var squad = engine.squad;
    var zone = engine.zone;
    var player = engine.player;

    var phaseJam = squad.phase === "ALERT" || squad.phase === "EVASION";
    // CHAFF HOOK (fulfilled -- see file header): OR'd into the same `jammed`
    // expression the view checks, exactly as the original hook comment
    // asked for. engine.chaffUntil may be absent on a bespoke pre-cycle test
    // engine -- falls back to false, never throws.
    var chaffActive = typeof engine.chaffUntil === "number" && engine.chaffUntil > engine.time;
    var jammed = phaseJam || chaffActive;

    var guards = jammed
      ? []
      : engine.guards.map(function (g) {
          var caution = squad.phase === "CAUTION";
          return {
            id: g.id,
            x: g.x,
            y: g.y,
            facing: g.facing,
            state: g.state,
            fovDeg: caution ? Game.VISION.FOV_DEG * Game.GUARD.CAUTION_FOV_MULT : Game.VISION.FOV_DEG,
            range: caution ? Game.VISION.RANGE * Game.GUARD.CAUTION_RANGE_MULT : Game.VISION.RANGE,
          };
        });

    // CAMERAS (new -- see file header). Same "empty when jammed" rule as
    // guards above. engine.director may be absent on a bespoke pre-cycle
    // test engine -- falls back to [], never throws (same posture as
    // chaffActive's own engine.chaffUntil fallback above).
    var cameraStates = (engine.director && engine.director.cameraStates()) || [];
    var cameras = jammed
      ? []
      : cameraStates.map(function (c) {
          return {
            x: c.x,
            y: c.y,
            facing: c.panAngle,
            fovDeg: c.fovDeg,
            range: c.range,
            disabled: c.disabled,
            meter: c.meter,
          };
        });

    // DOORS (new -- Laboratory cycle, see file header). NOT emptied while
    // jammed -- see file header note. engine.world may be absent on a
    // bespoke pre-cycle test engine -- falls back to isOpen: false rather
    // than throwing.
    var doors = (zone.doors || []).map(function (d) {
      return {
        x: d.x,
        y: d.y,
        w: d.w,
        h: d.h,
        lock: d.lock,
        open: !!(engine.world && engine.world.isDoorOpen(d.id)),
      };
    });

    // LASERS (new -- Laboratory cycle, see file header). Same "empty when
    // jammed" rule as guards/cameras above.
    var laserStates = (engine.director && engine.director.laserStates()) || [];
    var lasers = jammed
      ? []
      : laserStates.map(function (l) {
          return { x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, active: l.active };
        });

    // PICKUPS (new -- Laboratory cycle, see file header/schema note): a
    // keycard already collected (engine.inventory.keycards[level] true) is
    // filtered out -- once picked up, it shouldn't keep glowing on the
    // radar. HONEST GAP: a "chaff" pickup has no persistent per-index
    // collected flag exposed outside engine.js's own private bookkeeping
    // (see src/engine.js's PICKUPS step), so it keeps showing here even
    // after collection -- cosmetic only, tracked in BACKLOG.md, not a
    // gameplay bug (inventory.collectPickup itself is correctly idempotent-
    // safe either way). NOT emptied while jammed -- same "structural level
    // geometry" rationale as doors above.
    var keycardsHeld = (engine.inventory && engine.inventory.keycards) || {};
    var pickups = (zone.pickups || [])
      .filter(function (p) {
        if (p.item === "keycardL1") return !keycardsHeld.L1;
        if (p.item === "keycardL2") return !keycardsHeld.L2;
        if (p.item === "keycardL3") return !keycardsHeld.L3;
        return true;
      })
      .map(function (p) {
        return { x: p.x, y: p.y, item: p.item };
      });

    return {
      jammed: jammed,
      phaseJam: phaseJam,
      chaffActive: chaffActive,
      zone: { w: zone.bounds.w, h: zone.bounds.h },
      walls: zone.walls.map(copyRect),
      darkZones: zone.darkZones.map(copyRect),
      exit: copyRect(zone.exit),
      player: {
        x: player.x,
        y: player.y,
        facing: player.facing,
        stance: player.stance,
      },
      guards: guards,
      cameras: cameras,
      doors: doors,
      lasers: lasers,
      pickups: pickups,
    };
  }

  // ---- browser view -----------------------------------------------------------

  // Small deterministic integer hash (xorshift-ish mix) -- same (a,b) always
  // yields the same result, no Math.random/Date anywhere.
  function hash2(a, b) {
    var h = (a * 2654435761) ^ (b * 2246822519);
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return (h ^ (h >>> 14)) >>> 0;
  }

  function drawTriangle(ctx, cx, cy, facing, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(facing);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, size * 0.55);
    ctx.lineTo(-size * 0.6, -size * 0.55);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawCone(ctx, scale, g) {
    var fill = CONE_STYLE[g.state] || CONE_STYLE.PATROL;
    var halfFov = ((g.fovDeg * Math.PI) / 180) / 2;
    var r = g.range * scale;
    var gx = g.x * scale;
    var gy = g.y * scale;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.arc(gx, gy, r, g.facing - halfFov, g.facing + halfFov);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // CAMERA cone wedge -- same arc-fan draw as drawCone above, but keyed by
  // the 3-state disabled/meter styling instead of a guard's FSM state (see
  // file header CAMERA_CONE_STYLE / cameraRadarStyleKey).
  function cameraRadarStyleKey(c) {
    if (c.disabled) return "DISABLED";
    if (c.meter >= Game.VISION.SUSPICIOUS_AT) return "ALERT";
    return "NORMAL";
  }

  function drawCameraCone(ctx, scale, c) {
    var fill = CAMERA_CONE_STYLE[cameraRadarStyleKey(c)];
    var halfFov = ((c.fovDeg * Math.PI) / 180) / 2;
    var r = c.range * scale;
    var cx = c.x * scale;
    var cy = c.y * scale;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, c.facing - halfFov, c.facing + halfFov);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // CAMERA dot -- a small square marker (distinct from the guard/player
  // triangles: a camera is fixed hardware, not a moving actor with a facing
  // "point"), dimmed to a dark grey while disabled, cyan/red otherwise
  // matching the cone's own NORMAL/ALERT split.
  function drawCameraDot(ctx, cx, cy, size, disabled, alerted) {
    ctx.fillStyle = disabled ? "rgba(102,102,102,0.7)" : alerted ? "#ff5252" : "#80deea";
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  }

  // chaffOnly (new -- see file header CHAFF LOOKS DIFFERENT FROM ALERT):
  // true renders a bluish static tint (chaff-blinded, squad still
  // INFILTRATION) instead of the usual green-tinted phase-jam static, by
  // swapping which channel `v` (the deterministic per-cell brightness)
  // drives -- same hash/crawl mechanics, different palette.
  function drawStatic(ctx, w, h, tickCount, chaffOnly) {
    var cell = RADAR.STATIC_CELL;
    var cols = Math.ceil(w / cell);
    var rows = Math.ceil(h / cell);
    var noiseKey = tickCount >> 2; // crawls every 4 ticks (~15/s), deterministic
    for (var ry = 0; ry < rows; ry++) {
      for (var rx = 0; rx < cols; rx++) {
        var idx = ry * cols + rx;
        var n = hash2(idx, noiseKey) % 100;
        var v = 18 + (n % 55); // 18..72 brightness band
        var dim = Math.round(v * 0.55);
        ctx.fillStyle = chaffOnly
          ? "rgba(18," + dim + "," + v + ",0.92)" // bluish: B channel dominant
          : "rgba(18," + v + "," + dim + ",0.92)"; // green: G channel dominant
        ctx.fillRect(rx * cell, ry * cell, cell, cell);
      }
    }
  }

  // chaffOnly (new -- see file header): swaps the blinking label's text and
  // color from red "ALERT" to blue "CHAFF" -- same blink cadence/mechanics.
  function drawBlinkText(ctx, w, h, tickCount, chaffOnly) {
    var on = Math.floor(tickCount / RADAR.BLINK_TICKS) % 2 === 0;
    if (!on) return;
    ctx.fillStyle = chaffOnly ? "rgba(80, 160, 255, 0.94)" : "rgba(255, 45, 64, 0.94)";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(chaffOnly ? "CHAFF" : "ALERT", w / 2, h / 2);
  }

  function createRadar(opts) {
    opts = opts || {};
    var container = opts.container;

    var canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:absolute;top:" + RADAR.MARGIN + "px;right:" + RADAR.MARGIN + "px;" +
      "pointer-events:none;z-index:20;";
    container.appendChild(canvas);
    var ctx = canvas.getContext("2d");

    var widthCss = 0;
    var heightCss = 0;
    var lastZoneKey = null;

    function ensureSize(zone) {
      var key = zone.w + "x" + zone.h;
      if (key === lastZoneKey) return;
      lastZoneKey = key;
      widthCss = RADAR.WIDTH;
      heightCss = RADAR.WIDTH * (zone.h / zone.w);
      var dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
      canvas.width = Math.round(widthCss * dpr);
      canvas.height = Math.round(heightCss * dpr);
      canvas.style.width = widthCss + "px";
      canvas.style.height = heightCss + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function render(engine) {
      var model = Game.radarModel(engine);
      ensureSize(model.zone);

      ctx.clearRect(0, 0, widthCss, heightCss);

      // panel background
      ctx.fillStyle = "rgba(2, 24, 10, 0.85)";
      ctx.fillRect(0, 0, widthCss, heightCss);

      // faint scan-line sweep -- cosmetic only, drawn under everything else
      var sweepT = (engine.time % RADAR.SWEEP_PERIOD_S) / RADAR.SWEEP_PERIOD_S;
      var sweepY = sweepT * heightCss;
      var sweepGrad = ctx.createLinearGradient(0, sweepY - 18, 0, sweepY + 18);
      sweepGrad.addColorStop(0, "rgba(57,255,106,0)");
      sweepGrad.addColorStop(0.5, "rgba(57,255,106,0.09)");
      sweepGrad.addColorStop(1, "rgba(57,255,106,0)");
      ctx.fillStyle = sweepGrad;
      ctx.fillRect(0, 0, widthCss, heightCss);

      var scale = widthCss / model.zone.w;

      // darkZones (barely darker than the panel)
      ctx.fillStyle = "rgba(0,0,0,0.30)";
      model.darkZones.forEach(function (d) {
        ctx.fillRect(d.x * scale, d.y * scale, d.w * scale, d.h * scale);
      });

      // walls (slightly lighter green)
      ctx.fillStyle = "rgba(94, 214, 134, 0.38)";
      model.walls.forEach(function (w) {
        ctx.fillRect(w.x * scale, w.y * scale, w.w * scale, w.h * scale);
      });

      // doors (new -- Laboratory cycle, see file header): distinct colored
      // slabs, lock-color coded, dimmed once open (see DOOR_OPEN_COLOR).
      // Drawn even while jammed (see radarModel's own note -- structural
      // level geometry, not moment-to-moment tactical intel).
      model.doors.forEach(function (d) {
        ctx.fillStyle = d.open ? DOOR_OPEN_COLOR : DOOR_LOCK_COLOR[d.lock] || DOOR_UNLOCKED_COLOR;
        ctx.fillRect(d.x * scale, d.y * scale, d.w * scale, d.h * scale);
      });

      // pickups (new -- Laboratory cycle, see file header): glowing gold
      // diamonds, pulsing gently (deterministic, engine.time-driven, same
      // convention as the exit block's own pulse above) -- drawn even while
      // jammed (structural, see radarModel's own note).
      var pickupPulse = 0.6 + 0.4 * Math.sin((engine.time / RADAR.PULSE_PERIOD_S) * Math.PI * 2);
      model.pickups.forEach(function (p) {
        var px = p.x * scale;
        var py = p.y * scale;
        var r = 4;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "rgba(255, 240, 150," + pickupPulse.toFixed(3) + ")";
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
      });

      // exit, pulsing brightness driven by engine.time (deterministic)
      var pulse = 0.45 + 0.45 * Math.sin((engine.time / RADAR.PULSE_PERIOD_S) * Math.PI * 2);
      ctx.fillStyle = "rgba(57,255,106," + pulse.toFixed(3) + ")";
      ctx.fillRect(model.exit.x * scale, model.exit.y * scale, model.exit.w * scale, model.exit.h * scale);

      // panel border
      ctx.strokeStyle = "#39ff6a";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, widthCss - 1, heightCss - 1);

      if (model.jammed) {
        // chaffOnly: chaff-blinded while the squad is still INFILTRATION
        // (phaseJam false) -- see file header CHAFF LOOKS DIFFERENT FROM
        // ALERT. If phaseJam is ALSO true (e.g. chaff thrown mid-firefight),
        // the phase-jam ALERT/EVASION styling wins -- that's the more
        // urgent, more informative state to show.
        var chaffOnly = model.chaffActive && !model.phaseJam;
        drawStatic(ctx, widthCss, heightCss, engine.tickCount, chaffOnly);
        drawBlinkText(ctx, widthCss, heightCss, engine.tickCount, chaffOnly);
        return;
      }

      // CAMERAS drawn UNDER guards (cones first, then dots, then the player
      // triangle on top -- same layering convention already used for guards
      // below), so a camera's static dot never gets buried by a moving
      // guard's own triangle.
      model.cameras.forEach(function (c) {
        drawCameraCone(ctx, scale, c);
      });
      model.cameras.forEach(function (c) {
        drawCameraDot(ctx, c.x * scale, c.y * scale, 6, c.disabled, c.meter >= Game.VISION.SUSPICIOUS_AT);
      });

      // LASERS (new -- Laboratory cycle, see file header): bright red beam
      // lines, blinking on/off with the SAME duty-cycle phase driving the
      // real gameplay hazard (model.lasers only ever contains `active`
      // entries worth caring about -- see the draw skip below), not a
      // separate cosmetic-only blink.
      model.lasers.forEach(function (l) {
        if (!l.active) return;
        ctx.strokeStyle = LASER_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(l.x1 * scale, l.y1 * scale);
        ctx.lineTo(l.x2 * scale, l.y2 * scale);
        ctx.stroke();
        ctx.lineWidth = 1;
      });

      model.guards.forEach(function (g) {
        drawCone(ctx, scale, g);
      });
      model.guards.forEach(function (g) {
        drawTriangle(ctx, g.x * scale, g.y * scale, g.facing, 5, "#ff5a1f");
      });
      drawTriangle(ctx, model.player.x * scale, model.player.y * scale, model.player.facing, 5.5, "#ffffff");
    }

    return { render: render, canvas: canvas };
  }

  Game.RADAR = RADAR;
  Game.radarModel = radarModel;
  Game.createRadar = createRadar;
  if (typeof module !== "undefined")
    module.exports = { radarModel: radarModel, createRadar: createRadar, RADAR: RADAR };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
