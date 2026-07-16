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
//       jammed: boolean,      // true iff engine.squad.phase is "ALERT" or
//                             // "EVASION". CHAFF HOOK: a future jamming
//                             // item/device should OR its own boolean into
//                             // this same expression (jammed = phaseJam ||
//                             // chaffActive) rather than adding a second
//                             // signal elsewhere -- this line is the single
//                             // place the view checks "static vs live".
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
//       blinking "ALERT" text overlay (visibility toggles on
//       engine.tickCount, see BLINK_TICKS).
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

  // ---- pure model -----------------------------------------------------------

  function copyRect(r) {
    return { x: r.x, y: r.y, w: r.w, h: r.h };
  }

  function radarModel(engine) {
    var squad = engine.squad;
    var zone = engine.zone;
    var player = engine.player;

    var jammed = squad.phase === "ALERT" || squad.phase === "EVASION";

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

    return {
      jammed: jammed,
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

  function drawStatic(ctx, w, h, tickCount) {
    var cell = RADAR.STATIC_CELL;
    var cols = Math.ceil(w / cell);
    var rows = Math.ceil(h / cell);
    var noiseKey = tickCount >> 2; // crawls every 4 ticks (~15/s), deterministic
    for (var ry = 0; ry < rows; ry++) {
      for (var rx = 0; rx < cols; rx++) {
        var idx = ry * cols + rx;
        var n = hash2(idx, noiseKey) % 100;
        var v = 18 + (n % 55); // 18..72 brightness band
        ctx.fillStyle = "rgba(18," + v + "," + Math.round(v * 0.55) + ",0.92)";
        ctx.fillRect(rx * cell, ry * cell, cell, cell);
      }
    }
  }

  function drawBlinkText(ctx, w, h, tickCount) {
    var on = Math.floor(tickCount / RADAR.BLINK_TICKS) % 2 === 0;
    if (!on) return;
    ctx.fillStyle = "rgba(255, 45, 64, 0.94)";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ALERT", w / 2, h / 2);
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

      // exit, pulsing brightness driven by engine.time (deterministic)
      var pulse = 0.45 + 0.45 * Math.sin((engine.time / RADAR.PULSE_PERIOD_S) * Math.PI * 2);
      ctx.fillStyle = "rgba(57,255,106," + pulse.toFixed(3) + ")";
      ctx.fillRect(model.exit.x * scale, model.exit.y * scale, model.exit.w * scale, model.exit.h * scale);

      // panel border
      ctx.strokeStyle = "#39ff6a";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, widthCss - 1, heightCss - 1);

      if (model.jammed) {
        drawStatic(ctx, widthCss, heightCss, engine.tickCount);
        drawBlinkText(ctx, widthCss, heightCss, engine.tickCount);
        return;
      }

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
