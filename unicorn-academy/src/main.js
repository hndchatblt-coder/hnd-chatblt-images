/* ================= Unicorn Academy — boot & resilience ================= */
'use strict';
(() => {
/* global error handler: never a white screen, never a frozen state */
let recovering = false;
const recover = (msg) => {
  UA.dev && UA.dev.log('ERROR ' + String(msg).slice(0, 120));
  if (recovering) return;
  recovering = true;
  try {
    UA.engine.stop();
    const cel = document.querySelector('#celebrate-layer');
    if (cel) { cel.classList.remove('show'); cel.innerHTML = ''; }
    document.querySelectorAll('.veil').forEach(v => v.parentElement === document.body && v.remove());
    UA.enterMap && UA.enterMap();
    UA.audio.speak('Oops! Let us fly home!');
  } catch (e) { /* last resort: leave whatever is on screen */ }
  setTimeout(() => { recovering = false; }, 1500);
};
window.addEventListener('error', (e) => recover(e.message));
window.addEventListener('unhandledrejection', (e) => recover(e.reason));

/* lock the page: no scroll, no rubber-band, no pinch */
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

/* iOS: returning from lock/switch leaves speech stuck — resume + re-speak */
UA.audio.onReturn(() => {
  if (UA.engine.active && UA.engine.q) UA.engine.repeat();
});

/* the giant start button: audio unlock + entry */
const startBtn = document.getElementById('start-btn');
let started = false;
startBtn.addEventListener('pointerdown', () => {
  if (started) return;
  started = true;
  UA.audio.init();
  UA.audio.setToggles(UA.S.settings);
  UA.beginSession();
  UA.audio.speak(UA.S.created ? `Welcome back!` : `Welcome to Unicorn Academy!`);
  UA.ui.begin();
});

UA.ui.updateHUD();
})();
