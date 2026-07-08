// Persistent progress, saved to localStorage so a child sees her stars and her
// collection of magical friends grow across days (and a parent can see it too).

const KEY = 'unicorn-reading-progress-v1';

const DEFAULTS = {
  stars: 0,          // total stars ever earned
  unlocked: 1,       // creatures owned (first N of FRIENDS); the unicorn is owned from the start
  stage: 0,          // which stage (vowel family) she is currently playing
  cleared: 0,        // how many stages she has fully completed (drives the map)
  stageProgress: 0,  // words read toward completing the current stage
  buddy: 0,          // index into FRIENDS of the active on-screen character
  lettersWins: 0,    // correct answers in Learn-the-Letters, toward the next friend
};

export function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const p = { ...DEFAULTS, ...saved };
    // Back-compat: an older save used questIndex/questProgress. Fold them in.
    if (saved.questProgress != null && saved.stageProgress == null) p.stageProgress = saved.questProgress;
    p.unlocked = Math.max(1, p.unlocked | 0); // the unicorn is always owned
    p.stage = Math.max(0, p.stage | 0);
    p.cleared = Math.max(0, p.cleared | 0);
    return p;
  } catch (_) {
    return { ...DEFAULTS };
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      stars: p.stars, unlocked: p.unlocked,
      stage: p.stage, cleared: p.cleared, stageProgress: p.stageProgress,
      buddy: p.buddy, lettersWins: p.lettersWins,
    }));
  } catch (_) { /* ignore (e.g. private mode) */ }
}

// Wipe saved progress (stars, friends, stage, buddy) and return fresh defaults.
// Recorded sounds live in IndexedDB and are intentionally NOT touched here.
export function resetProgress() {
  try { localStorage.removeItem(KEY); } catch (_) {}
  return { ...DEFAULTS };
}
