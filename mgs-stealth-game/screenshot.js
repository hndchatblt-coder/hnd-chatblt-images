// screenshot.js — Playwright visual check. Loads game.html from cold file://,
// captures the fixed scenes into shots/, and fails on any page error. Run every
// 5 cycles or after any render-layer change, then OPEN each PNG and look at it —
// logic tests can't see a black screen.
//
// Scenes are named waits/inputs; more are appended as the game grows (append-only,
// like tests). Usage: node screenshot.js
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const SCENES = [
  // { name, setup(page) } — setup drives the game into the scene before capture.
  { name: "01-boot-title", setup: async (page) => page.waitForTimeout(1500) },
  {
    name: "02-ingame-patrol",
    setup: async (page) => {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      // CODEC (new — see src/codec.js's "missionOpen" trigger): the very
      // first frame of any playthrough now opens a COMMANDER briefing call,
      // and src/boot.js freezes the engine entirely while it's up — so this
      // scene has to dismiss it before it can drive movement, or it would
      // just capture the codec overlay instead of ordinary gameplay (see the
      // dedicated "04-codec" scene below for that shot). Space/Enter both
      // advance/dismiss (src/boot.js routes either to codec.advance()); per
      // src/codec.js's advance() contract each press either force-reveals
      // the current line (if still typing) or moves to the next one, so a
      // freshly-opened line can take TWO presses to actually clear (reveal,
      // then advance) — this cycle's missionOpen call is 6 lines, so up to
      // 12 presses to fully dismiss it. Alternates Enter/Space to exercise
      // both keys, with a generous press count over that worst case; extra
      // presses after it's already closed just fall through to ordinary
      // (harmless, unbound) key handling.
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press(i % 2 === 0 ? "Enter" : "Space");
        await page.waitForTimeout(70);
      }
      // Safety net, not the primary mechanism: if the press budget above
      // ever falls short (a future longer call, a slower CI frame rate
      // delaying the type-in clock), force-dismiss directly so this scene
      // never silently degrades into capturing a codec overlay instead of
      // gameplay.
      await page.evaluate(() => {
        var dbg = window.Game._debug;
        if (dbg && dbg.codec && dbg.codec.isOpen()) dbg.codec.dismiss();
      });
      await page.waitForTimeout(500);
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(600);
      await page.keyboard.up("KeyW");
      await page.waitForTimeout(400);
    },
  },
  {
    name: "03-alert",
    setup: async (page) => {
      // Teleport the player to a spot ~3m ahead of guard 0's facing so the
      // render smoke test can capture the ALERT state (red cone + "!") without
      // waiting out a real patrol route.
      await page.evaluate(() => {
        var dbg = window.Game._debug;
        var guard = dbg.engine.guards[0];
        var ahead = 3;
        dbg.engine.player.x = guard.x + Math.cos(guard.facing) * ahead;
        dbg.engine.player.y = guard.y + Math.sin(guard.facing) * ahead;
      });
      await page.waitForTimeout(1200);
      // CODEC (new): this teleport-into-LOS trick is itself this
      // playthrough's first ALERT — src/codec.js's "firstAlert" trigger
      // fires from it same as a real chase would, popping a COMMANDER call
      // right over the shot. Dismiss it (same press budget + dismiss()
      // safety net as scene 02 above) so this capture still shows the
      // intended ALERT visuals (red cone / vignette / HUD), not the overlay
      // — the engine stays parked in ALERT throughout (nothing here un-sees
      // the player), so the alert visuals are still fully present once the
      // call closes.
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press(i % 2 === 0 ? "Enter" : "Space");
        await page.waitForTimeout(70);
      }
      await page.evaluate(() => {
        var dbg = window.Game._debug;
        if (dbg && dbg.codec && dbg.codec.isOpen()) dbg.codec.dismiss();
      });
      await page.waitForTimeout(300);
    },
  },
  {
    name: "04-codec",
    setup: async (page) => {
      // Dedicated codec shot: both of this playthrough's real triggers
      // (missionOpen, firstAlert) are already spent by scenes 02/03 above,
      // so rather than engineer a THIRD real trigger (firstBody/lowDarts,
      // which would require landing an actual tranq/CQC hit or draining
      // ammo — disruptive this late in the fixed scene list), open a
      // throwaway call directly on the live view via the debug hook,
      // exactly like scene 03 above already teleports the player directly
      // instead of walking a real patrol route. A FRESH Game.createCodecDirector()
      // is created just to synthesize a well-formed call object (its very
      // first update() is always "missionOpen" — see src/codec.js's
      // contract) — this never touches the real playthrough's own
      // codecDirector or its one-shot trigger memory.
      await page.evaluate(() => {
        var dbg = window.Game._debug;
        var scratchDirector = window.Game.createCodecDirector();
        var call = scratchDirector.update([], {});
        dbg.codec.open(call);
      });
      // Long enough for several lines' worth of type-in animation and a
      // couple of mouth-flap toggles to be caught mid-motion, short enough
      // to still be mid-call (not auto-dismissed -- nothing here presses
      // advance).
      await page.waitForTimeout(1400);
    },
  },
];

(async () => {
  fs.mkdirSync(path.join(__dirname, "shots"), { recursive: true });
  // Sandboxed CI/dev environments often route outbound HTTPS through a proxy;
  // pass it through so the Three.js CDN <script> resolves headless too.
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    proxy: proxy ? { server: proxy } : undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  // Sandboxed environments may block the CDN at the network-policy layer.
  // Fulfill the Three.js CDN request from the vendored dev dependency so the
  // visual check is hermetic; the shipped game.html is untouched.
  await page.route("**/three.js/r128/three.min.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: fs.readFileSync(
        path.join(__dirname, "node_modules/three/build/three.min.js"),
        "utf8"
      ),
    })
  );

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("file://" + path.join(__dirname, "game.html"));

  for (const scene of SCENES) {
    await scene.setup(page);
    const out = path.join(__dirname, "shots", scene.name + ".png");
    await page.screenshot({ path: out });
    console.log("  shot " + out);
  }

  await browser.close();

  if (errors.length) {
    console.error("screenshot.js: page errors:\n  " + errors.join("\n  "));
    process.exit(1);
  }
  console.log("screenshot.js: " + SCENES.length + " scene(s), zero page errors");
})();
