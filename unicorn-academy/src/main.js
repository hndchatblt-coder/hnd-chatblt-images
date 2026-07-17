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

/* The giant start button: audio unlock + entry.
   iOS grants audio/speech activation on touch RELEASE, never on pointerdown —
   so the unlock and the first utterance must run from `click` (which fires
   after touchend with real user activation). pointerdown gives instant visual
   feedback only. */
const startBtn = document.getElementById('start-btn');
let started = false;
startBtn.addEventListener('pointerdown', () => { startBtn.style.transform = 'scale(.95)'; });
startBtn.addEventListener('click', () => {
  if (started) return;
  started = true;
  UA.audio.init();
  UA.audio.setToggles(UA.S.settings);
  UA.beginSession();
  UA.audio.speak(UA.S.created ? `Welcome back!` : `Welcome to Unicorn Academy!`);
  UA.ui.begin();
});
/* safety net: if the context is still locked (or iOS re-suspends it), any
   touch release re-attempts the unlock until it sticks */
document.addEventListener('touchend', () => { if (started) UA.audio.init(); }, { passive: true });
document.addEventListener('click', () => { if (started) UA.audio.init(); });

UA.ui.updateHUD();
})();
