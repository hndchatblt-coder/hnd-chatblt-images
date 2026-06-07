// Persistent progress, saved to localStorage so a child sees her stars and her
// collection of magical friends grow across days (and a parent can see it too).

const KEY = 'unicorn-reading-progress-v1';

const DEFAULTS = {
  stars: 0,          // total stars ever earned
  unlocked: 0,       // number of friends collected (first N of FRIENDS)
  questIndex: 0,     // which quest variation is active
  questProgress: 0,  // tokens filled in the current quest
};

export function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...saved };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      stars: p.stars, unlocked: p.unlocked,
      questIndex: p.questIndex, questProgress: p.questProgress,
    }));
  } catch (_) { /* ignore (e.g. private mode) */ }
}
