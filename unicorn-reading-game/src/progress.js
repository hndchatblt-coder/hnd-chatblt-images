// Persistent progress, saved to localStorage so a child sees her stars and her
// collection of magical friends grow across days (and a parent can see it too).

const KEY = 'unicorn-reading-progress-v1';

const DEFAULTS = {
  stars: 0,          // total stars ever earned
  unlocked: 1,       // creatures owned (first N of FRIENDS); the unicorn is owned from the start
  questIndex: 0,     // which quest variation is active
  questProgress: 0,  // tokens filled in the current quest
  buddy: 0,          // index into FRIENDS of the active on-screen character
};

export function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const p = { ...DEFAULTS, ...saved };
    p.unlocked = Math.max(1, p.unlocked | 0); // the unicorn is always owned
    return p;
  } catch (_) {
    return { ...DEFAULTS };
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      stars: p.stars, unlocked: p.unlocked,
      questIndex: p.questIndex, questProgress: p.questProgress,
      buddy: p.buddy,
    }));
  } catch (_) { /* ignore (e.g. private mode) */ }
}
