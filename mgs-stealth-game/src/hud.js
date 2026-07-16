// src/hud.js
// PUBLIC API:
//   Game.HUD — tunable constants:
//     {
//       MARGIN: 16,             // css px, gap from screen edges for every corner element
//       LIFE_BAR_W: 160,        // css px, LIFE segmented bar width
//       LIFE_BAR_H: 14,         // css px, LIFE segmented bar height
//       LIFE_SEGMENTS: 10,      // number of discrete segments in the LIFE bar
//       BOX_W: 150,             // css px, weapon/item box width
//       BOX_H: 64,              // css px, weapon/item box height
//       ZONE_CARD_FADE_S: 3,    // seconds the zone-name card takes to fade to 0 alpha
//       PHASE_PULSE_PERIOD_S: 1.2, // seconds per ALERT box brightness pulse cycle
//       VIGNETTE_HEIGHT: 160,   // css px, depth of the top detection-vignette gradient
//       VIGNETTE_MAX_ALPHA: 0.25, // max alpha of the vignette at maxDetection === 1
//     }
//
//   Game.hudModel(engine) -> plain, JSON-safe object (no functions, no
//   undefined fields anywhere in the tree — every field is a primitive or a
//   plain object):
//     {
//       life: number 0..1,      // engine.player.hp if it exists (FORWARD HOOK —
//                               // no health/damage system exists yet, see
//                               // items/director TODOs) else 1.0 (full health
//                               // assumed). The instant a future module adds
//                               // player.hp, this line picks it up with no
//                               // hud.js change required.
//       phase: string,          // engine.squad.phase, one of "INFILTRATION" |
//                               // "ALERT" | "EVASION" | "CAUTION" (mirrors
//                               // guardAI.js's squad.phase verbatim)
//       phaseTime: number,      // engine.squad.phaseTime, seconds in phase
//       phaseRemaining: number|null,
//                               // Game.GUARD.EVASION_S - phaseTime while phase
//                               // is EVASION, Game.GUARD.CAUTION_S - phaseTime
//                               // while CAUTION, else null (INFILTRATION/ALERT
//                               // have no countdown — ALERT persists exactly
//                               // as long as any guard has LOS, no timer; see
//                               // guardAI.js's squad.tick contract)
//       alertCount: number,      // engine.squad.alertCount, copied
//       zoneName: string,        // engine.zone.name
//       time: number,            // engine.time, the mission clock (seconds)
//       weapon: { name: "TRANQ", ammo: number },
//                               // REAL as of this cycle (was a placeholder —
//                               // shape unchanged, see the old note this
//                               // replaces): mirrors engine.inventory when
//                               // present — name is always "TRANQ" (the only
//                               // weapon this cycle), ammo is
//                               // engine.inventory.darts. Falls back to the
//                               // original placeholder { name: "---", ammo:
//                               // null } if engine.inventory is absent (e.g.
//                               // a bespoke test engine-shaped object that
//                               // predates items.js) so this stays backward
//                               // compatible with anything not wiring up an
//                               // inventory. The view grays the content text
//                               // out when ammo === 0 (see drawWeaponBox).
//       item: { name: "RATION", count: number },
//                               // REAL as of this cycle (was the "---"/null
//                               // placeholder -- see the old note this
//                               // replaces, and tests/hud.test.js's own
//                               // ratchet-rule-2 NOTE on the one assertion
//                               // that changed): mirrors engine.inventory
//                               // when present -- name is always "RATION"
//                               // (the item slot shows rations; chaff has no
//                               // HUD slot this cycle, see BACKLOG), count is
//                               // engine.inventory.rations. Falls back to the
//                               // original placeholder { name: "---", count:
//                               // null } if engine.inventory is absent (e.g.
//                               // a bespoke test engine-shaped object that
//                               // predates items.js), same backward-compat
//                               // rationale as `weapon` above. The view grays
//                               // the content text out when count === 0 (see
//                               // drawItemBox), reusing the exact same
//                               // DEPLETED_COLOR gate as the weapon box.
//       status: "DRAGGING" | "HIDDEN" | "BOX" | null,
//                               // ADDITIVE field, separate from `item` above
//                               // by design (see the note on `item` — this
//                               // is what keeps every cycle backward
//                               // compatible with tests/hud.test.js's own
//                               // assertions on `item`). "HIDDEN" while
//                               // engine.playerHidden, else "DRAGGING" while
//                               // engine.dragging, else "BOX" (new -- box/
//                               // chaff/ration cycle) while
//                               // engine.inventory.boxOn, else null. Falls
//                               // back to null when engine exposes none of
//                               // playerHidden/dragging/inventory (e.g. a
//                               // bespoke test engine-shaped object predating
//                               // this cycle), same backward-compat rationale
//                               // as the `weapon` placeholder fallback above.
//                               // The three are mutually exclusive in
//                               // practice (see src/items.js's BOX / DRAG /
//                               // LOCKER INTERACTION MATRIX), so this
//                               // priority order never actually has to
//                               // arbitrate a real conflict -- it's just a
//                               // defensive read order.
//       maxDetection: number 0..1,
//                               // max over engine.guards[i].meter (0 if no
//                               // guards). Drives the screen-edge detection
//                               // vignette — a guard in ALERT has meter
//                               // pinned at 1 (see guardAI.js's ALERT
//                               // contract), so maxDetection reads 1.0 for the
//                               // full duration of an active chase.
//     }
//   Pure function of engine state, no DOM/THREE/Date/Math.random — runs
//   headless in node (tests/hud.test.js exercises this half only).
//
//   Game.createHud({ container }) -> hud (BROWSER ONLY — uses document/canvas
//   2D; never call from node)
//     container: DOM element the HUD's own <canvas> is appended into. This
//       module creates exactly one canvas, absolutely positioned to cover the
//       full container (inset:0), pointer-events:none (never intercepts
//       input — matches src/radar.js's own canvas, which the HUD shares
//       screen space with), transparent background (only draws its own
//       panels/text, never a full-screen fill). devicePixelRatio-aware sizing
//       so text/lines stay crisp, resized every render() call against
//       window.innerWidth/innerHeight (cheap no-op comparison when unchanged
//       — no separate resize listener needed, matching how src/radar.js keys
//       its own resize off zone dims every render() call instead of wiring
//       its own "resize" listener).
//     radar.js occupies the TOP-RIGHT corner (Game.RADAR.WIDTH=220 css px +
//       Game.RADAR.MARGIN=14 css px margin from each edge — see src/radar.js).
//       This view NEVER draws in that region: top-left (LIFE/clock/alert
//       counter), top-center (phase indicator), bottom-left (weapon box),
//       bottom-right (item box), center-left (zone card) — all clear of the
//       radar's top-right footprint by construction.
//     hud.render(engine) — computes Game.hudModel(engine) and draws it to the
//       canvas. MGS1-flavored palette: dark translucent (#041008cc) bordered
//       panels, bright-green (#39ff6a) accents/borders matching src/radar.js,
//       monospace text, crisp 1px borders.
//       - Top-left: "LIFE" label + segmented bar (green->amber->red by value),
//         mission clock (mm:ss) below it, "ALERT xN" counter beneath that when
//         alertCount > 0.
//       - Top-center: nothing while INFILTRATION; a red pulsing box reading
//         "ALERT" while ALERT (pulse driven by engine.time, deterministic —
//         no Date/Math.random, matching src/radar.js's exit-pulse technique);
//         a purple box reading "EVASION" + a whole-second countdown from
//         phaseRemaining while EVASION; an amber box reading "CAUTION" + the
//         same style countdown while CAUTION.
//       - Bottom-left: weapon box, bordered rounded rect ~150x64, "WEAPON"
//         label + content ("TRANQ  xN" once engine.inventory exists, grayed
//         out once darts hit 0; the original grayed "---" placeholder
//         content only when engine.inventory is absent).
//       - Bottom-right: item box, same shape, "ITEM" / "---".
//       - Status tag (new — CQC/locker cycle): a small pill drawn just above
//         the item box, reading "DRAGGING" (amber) or "HIDDEN" (blue) per
//         model.status; drawn nothing at all when model.status is null. The
//         item box itself is never touched by this (see hudModel's `status`
//         field note above).
//       - Zone-name card: shown center-left whenever model.zoneName differs
//         from the LAST zoneName this view actually rendered (tracked in a
//         closure var, seeded to null so the very first render() call always
//         counts as "different" and shows the card) — big monospace zone name
//         with a thin underline, fading out over Game.HUD.ZONE_CARD_FADE_S
//         seconds of engine.time elapsed SINCE THE TICK THE CHANGE WAS
//         DETECTED (a stored engine.time, not wall-clock Date.now() — so the
//         fade is exactly as deterministic/replay-safe as everything else in
//         this codebase).
//       - Detection vignette: while model.maxDetection > 0, a faint
//         white-to-transparent gradient hugging the top edge, alpha scaling
//         linearly with maxDetection up to Game.HUD.VIGNETTE_MAX_ALPHA (0.25)
//         at maxDetection === 1.
//     THREE is never referenced anywhere in this file (canvas 2D only).
//
// Pure logic (hudModel) + browser view (createHud) in one file, split so the
// model half is fully node-testable (see tests/hud.test.js's own header,
// which self-requires this module the same way tests/radar.test.js does since
// test.js's LOGIC_ORDER is fixed and does not list hud.js); the view half is
// browser-only and untested headless by design — screenshot.js is what
// verifies the rendered canvas actually looks right (open
// shots/02-ingame-patrol.png and shots/03-alert.png and look).
(function (Game) {
  var HUD = {
    MARGIN: 16,
    LIFE_BAR_W: 160,
    LIFE_BAR_H: 14,
    LIFE_SEGMENTS: 10,
    BOX_W: 150,
    BOX_H: 64,
    ZONE_CARD_FADE_S: 3,
    PHASE_PULSE_PERIOD_S: 1.2,
    VIGNETTE_HEIGHT: 160,
    VIGNETTE_MAX_ALPHA: 0.25,
  };

  var PANEL_BG = "rgba(4, 16, 8, 0.80)";
  var BORDER = "#39ff6a";

  var PHASE_STYLE = {
    ALERT: { fill: "rgba(198, 40, 40,", border: "#ff5a4a", label: "ALERT" },
    EVASION: { fill: "rgba(106, 27, 154,", border: "#c07bff", label: "EVASION" },
    CAUTION: { fill: "rgba(239, 143, 0,", border: "#ffc04d", label: "CAUTION" },
  };

  // New (CQC/locker cycle) — see hudModel's `status` field note above.
  // BOX (new -- box/chaff/ration cycle): cardboard-brown, matching
  // src/render.js's box-mesh color family.
  var STATUS_STYLE = {
    DRAGGING: { fill: "rgba(239, 143, 0, 0.85)", border: "#ffc04d" },
    HIDDEN: { fill: "rgba(70, 130, 180, 0.85)", border: "#9fd8ff" },
    BOX: { fill: "rgba(139, 90, 43, 0.88)", border: "#d9a066" },
  };

  // ---- pure model -------------------------------------------------------

  function hudModel(engine) {
    var squad = engine.squad;
    var phase = squad.phase;
    var phaseTime = squad.phaseTime;

    var phaseRemaining = null;
    if (phase === "EVASION") {
      phaseRemaining = Game.GUARD.EVASION_S - phaseTime;
    } else if (phase === "CAUTION") {
      phaseRemaining = Game.GUARD.CAUTION_S - phaseTime;
    }

    var maxDetection = 0;
    for (var i = 0; i < engine.guards.length; i++) {
      if (engine.guards[i].meter > maxDetection) maxDetection = engine.guards[i].meter;
    }

    return {
      life: engine.player.hp !== undefined ? engine.player.hp : 1.0,
      phase: phase,
      phaseTime: phaseTime,
      phaseRemaining: phaseRemaining,
      alertCount: squad.alertCount,
      zoneName: engine.zone.name,
      time: engine.time,
      weapon: engine.inventory
        ? { name: "TRANQ", ammo: engine.inventory.darts }
        : { name: "---", ammo: null },
      item: engine.inventory
        ? { name: "RATION", count: engine.inventory.rations }
        : { name: "---", count: null },
      status: engine.playerHidden
        ? "HIDDEN"
        : engine.dragging
          ? "DRAGGING"
          : engine.inventory && engine.inventory.boxOn
            ? "BOX"
            : null,
      maxDetection: maxDetection,
    };
  }

  // ---- browser view -------------------------------------------------------

  function lifeColor(t) {
    // t in 0..1: green (>0.5) -> amber (0.25..0.5) -> red (<0.25).
    if (t > 0.5) return "#39ff6a";
    if (t > 0.25) return "#ffc04d";
    return "#ff4a4a";
  }

  function formatClock(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    return (mm < 10 ? "0" + mm : "" + mm) + ":" + (ss < 10 ? "0" + ss : "" + ss);
  }

  function drawPanel(ctx, x, y, w, h) {
    ctx.fillStyle = PANEL_BG;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawLifeAndClock(ctx, model, m) {
    var w = HUD.LIFE_BAR_W;
    var h = HUD.LIFE_BAR_H;
    var panelH = 24 + h + 20 + (model.alertCount > 0 ? 18 : 0);
    drawPanel(ctx, m, m, w + 16, panelH);

    ctx.fillStyle = "#9fffb8";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("LIFE", m + 8, m + 6);

    var barX = m + 8;
    var barY = m + 22;
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, barY + 0.5, w - 1, h - 1);

    var segN = HUD.LIFE_SEGMENTS;
    var filled = Math.round(model.life * segN);
    var gap = 2;
    var segW = (w - gap * (segN - 1)) / segN;
    var color = lifeColor(model.life);
    for (var i = 0; i < segN; i++) {
      if (i >= filled) continue;
      ctx.fillStyle = color;
      ctx.fillRect(barX + i * (segW + gap), barY, segW, h);
    }

    ctx.fillStyle = "#d8ffe4";
    ctx.font = "12px monospace";
    ctx.fillText(formatClock(model.time), m + 8, barY + h + 6);

    if (model.alertCount > 0) {
      ctx.fillStyle = "#ff5a4a";
      ctx.font = "bold 11px monospace";
      ctx.fillText("ALERT x" + model.alertCount, m + 8, barY + h + 24);
    }
  }

  function drawPhaseIndicator(ctx, model, widthCss) {
    if (model.phase === "INFILTRATION") return;
    var style = PHASE_STYLE[model.phase];
    if (!style) return;

    var text = style.label;
    if (model.phaseRemaining !== null) {
      text += "  " + Math.ceil(model.phaseRemaining) + "s";
    }

    var boxW = 150;
    var boxH = 34;
    var x = (widthCss - boxW) / 2;
    var y = HUD.MARGIN;

    var pulse = 0.55 + 0.35 * Math.sin((model.time / HUD.PHASE_PULSE_PERIOD_S) * Math.PI * 2);
    ctx.fillStyle = style.fill + pulse.toFixed(3) + ")";
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = style.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + boxW / 2, y + boxH / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  function drawBox(ctx, x, y, label, content, contentColor) {
    var w = HUD.BOX_W;
    var h = HUD.BOX_H;
    drawPanel(ctx, x, y, w, h);

    ctx.fillStyle = "#9fffb8";
    ctx.font = "bold 11px monospace";
    ctx.fillText(label, x + 8, y + 6);

    ctx.fillStyle = contentColor || "rgba(216, 255, 228, 0.45)";
    ctx.font = "bold 18px monospace";
    ctx.fillText(content, x + 8, y + 26);
  }

  // Grayed content color when a weapon/item is fully depleted (ammo/count
  // === 0 — NOT null, which means "no ammo concept at all," e.g. the item
  // box's placeholder; see hudModel's weapon/item shapes above).
  var DEPLETED_COLOR = "rgba(120, 120, 120, 0.55)";

  function drawWeaponBox(ctx, model, widthCss, heightCss) {
    var x = HUD.MARGIN;
    var y = heightCss - HUD.BOX_H - HUD.MARGIN;
    var content = model.weapon.name + (model.weapon.ammo !== null ? "  x" + model.weapon.ammo : "");
    var color = model.weapon.ammo === 0 ? DEPLETED_COLOR : undefined;
    drawBox(ctx, x, y, "WEAPON", content, color);
  }

  function drawItemBox(ctx, model, widthCss, heightCss) {
    var x = widthCss - HUD.BOX_W - HUD.MARGIN;
    var y = heightCss - HUD.BOX_H - HUD.MARGIN;
    var content = model.item.name + (model.item.count !== null ? "  x" + model.item.count : "");
    drawBox(ctx, x, y, "ITEM", content);
  }

  // Status tag (new — CQC/locker cycle, see file header/hudModel note) — a
  // small pill drawn just above the item box; drawn only while
  // model.status is non-null. Never touches the item box itself.
  function drawStatusTag(ctx, model, widthCss, heightCss) {
    if (!model.status) return;
    var style = STATUS_STYLE[model.status];
    if (!style) return;

    var tagH = 20;
    var tagW = HUD.BOX_W;
    var x = widthCss - HUD.BOX_W - HUD.MARGIN;
    var y = heightCss - HUD.BOX_H - HUD.MARGIN - tagH - 6;

    ctx.fillStyle = style.fill;
    ctx.fillRect(x, y, tagW, tagH);
    ctx.strokeStyle = style.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, tagW - 1, tagH - 1);

    ctx.fillStyle = "#0a0f0a";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(model.status, x + tagW / 2, y + tagH / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  function drawZoneCard(ctx, model, widthCss, heightCss, zoneState) {
    if (zoneState.shownAt === null) return;
    var elapsed = model.time - zoneState.shownAt;
    var alpha = 1 - elapsed / HUD.ZONE_CARD_FADE_S;
    if (alpha <= 0) return;
    if (alpha > 1) alpha = 1;

    var text = model.zoneName;
    ctx.font = "bold 28px monospace";
    var textW = ctx.measureText(text).width;
    var cardW = textW + 48;
    var cardH = 64;
    var x = 0;
    var y = (heightCss - cardH) / 2;

    ctx.fillStyle = "rgba(4, 16, 8," + (0.78 * alpha).toFixed(3) + ")";
    ctx.fillRect(x, y, cardW, cardH);
    ctx.fillStyle = "rgba(57, 255, 106," + alpha.toFixed(3) + ")";
    ctx.fillRect(x, y + cardH - 3, cardW, 2);

    ctx.fillStyle = "rgba(216, 255, 228," + alpha.toFixed(3) + ")";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x + 24, y + cardH / 2 + 10);
    ctx.textBaseline = "top";
  }

  function drawDetectionVignette(ctx, model, widthCss, heightCss) {
    if (model.maxDetection <= 0) return;
    var alpha = HUD.VIGNETTE_MAX_ALPHA * model.maxDetection;
    var grad = ctx.createLinearGradient(0, 0, 0, HUD.VIGNETTE_HEIGHT);
    grad.addColorStop(0, "rgba(255,255,255," + alpha.toFixed(3) + ")");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, widthCss, HUD.VIGNETTE_HEIGHT);
  }

  function createHud(opts) {
    opts = opts || {};
    var container = opts.container;

    var canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:25;";
    container.appendChild(canvas);
    var ctx = canvas.getContext("2d");

    var widthCss = 0;
    var heightCss = 0;

    function ensureSize() {
      var w = (typeof window !== "undefined" && window.innerWidth) || widthCss;
      var h = (typeof window !== "undefined" && window.innerHeight) || heightCss;
      if (w === widthCss && h === heightCss) return;
      widthCss = w;
      heightCss = h;
      var dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
      canvas.width = Math.round(widthCss * dpr);
      canvas.height = Math.round(heightCss * dpr);
      canvas.style.width = widthCss + "px";
      canvas.style.height = heightCss + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Zone-card fade tracking — private to this view instance (see file
    // header): lastZoneName seeded null so the first render() call always
    // counts as "different" and shows the card; shownAt is the engine.time at
    // the render() call the change was detected, driving a deterministic
    // engine-time fade (never wall-clock).
    var zoneState = { lastZoneName: null, shownAt: null };

    function render(engine) {
      var model = Game.hudModel(engine);
      ensureSize();

      if (model.zoneName !== zoneState.lastZoneName) {
        zoneState.lastZoneName = model.zoneName;
        zoneState.shownAt = model.time;
      }

      ctx.clearRect(0, 0, widthCss, heightCss);

      drawDetectionVignette(ctx, model, widthCss, heightCss);
      drawLifeAndClock(ctx, model, HUD.MARGIN);
      drawPhaseIndicator(ctx, model, widthCss);
      drawWeaponBox(ctx, model, widthCss, heightCss);
      drawItemBox(ctx, model, widthCss, heightCss);
      drawStatusTag(ctx, model, widthCss, heightCss);
      drawZoneCard(ctx, model, widthCss, heightCss, zoneState);
    }

    return { render: render, canvas: canvas };
  }

  Game.HUD = HUD;
  Game.hudModel = hudModel;
  Game.createHud = createHud;
  if (typeof module !== "undefined")
    module.exports = { hudModel: hudModel, createHud: createHud, HUD: HUD };
})(typeof window !== "undefined"
  ? (window.Game = window.Game || {})
  : (global.Game = global.Game || {}));
