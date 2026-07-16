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
