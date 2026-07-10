// Persistent progress — save schema v2.
//
// THE RULE THAT MAKES THIS SAFE TO GROW: progress references content by stable
// string IDs (stage ids, friend ids, cosmetic ids), never by array position or
// count. Content can be added, reordered or retired in content.js and an old
// save still means exactly what it meant. The blob carries `saveVersion`;
// `migrate()` chains old saves forward one version at a time, so no update
// (or restored backup) ever resets a child's place.

import { STAGES, FRIENDS } from './content.js';

const KEY = 'unicorn-reading-progress-v1'; // storage key is historical; version lives INSIDE the blob
const LEGACY_LETTERS_KEY = 'unicorn-reading-letters';
export const SAVE_VERSION = 2;

const DEFAULTS = () => ({
  saveVersion: SAVE_VERSION,
  coins: 0,               // spendable balance (earned by reading, spent in the shop)
  starsEarned: 0,         // lifetime total ever earned (drives adaptive difficulty)
  currentStage: STAGES[0].id,
  stageProgress: 0,       // words read toward completing the current stage
  clearedStages: [],      // stage ids fully completed
  friends: [FRIENDS[0].id], // owned friends; the unicorn is always owned
  buddy: FRIENDS[0].id,   // the active on-screen character
  cosmetics: [],          // owned cosmetic ids
  equipped: {},           // slot -> cosmetic id, e.g. { head: 'cos.flower' }
  wish: null,             // cosmetic id she is saving toward (shop meter)
  items: {},              // per-item learning stats: { [key]: {seen, correct} } — keys like 'l.a', 'w.cat'
  lettersHeard: [],       // letters met in the explore grid
});

// The order FRIENDS held when saves were positional (v1). Frozen forever so old
// counters keep mapping to the same creatures; never edit this list.
const V1_FRIEND_ORDER = [
  'friend.unicorn', 'friend.butterfly', 'friend.bee', 'friend.ladybird',
  'friend.fish', 'friend.turtle', 'friend.bunny', 'friend.cat',
  'friend.puppy', 'friend.chick', 'friend.owl', 'friend.mushroom',
  'friend.dolphin', 'friend.flamingo', 'friend.peacock', 'friend.penguin',
  'friend.koala', 'friend.fox', 'friend.panda', 'friend.star',
];
const V1_STAGE_ORDER = ['a', 'e', 'i', 'o', 'u', 'mix'];

// v1 (positional integers) -> v2 (IDs + coins). Her stars become spendable
// coins, so day one of the shop she arrives with savings — a nice moment.
function migrateV1(s) {
  const out = DEFAULTS();
  out.coins = Math.max(0, s.stars | 0);
  out.starsEarned = Math.max(0, s.stars | 0);
  out.stageProgress = Math.max(0, s.stageProgress ?? s.questProgress ?? 0) | 0;
  const stageIdx = Math.min(Math.max(0, s.stage | 0), V1_STAGE_ORDER.length - 1);
  out.currentStage = V1_STAGE_ORDER[stageIdx];
  out.clearedStages = V1_STAGE_ORDER.slice(0, Math.max(0, s.cleared | 0));
  const owned = Math.min(Math.max(1, s.unlocked | 0), V1_FRIEND_ORDER.length);
  out.friends = V1_FRIEND_ORDER.slice(0, owned);
  out.buddy = V1_FRIEND_ORDER[Math.min(Math.max(0, s.buddy | 0), owned - 1)] || V1_FRIEND_ORDER[0];
  // letters heard used to live under its own key
  try {
    const heard = JSON.parse(localStorage.getItem(LEGACY_LETTERS_KEY) || '[]');
    if (Array.isArray(heard)) out.lettersHeard = heard.filter(l => typeof l === 'string');
    localStorage.removeItem(LEGACY_LETTERS_KEY);
  } catch (_) { /* ignore */ }
  return out;
}

// Chain of one-way upgrades; step N transforms version N -> N+1.
const MIGRATIONS = { 1: migrateV1 };

export function migrate(raw) {
  let s = raw;
  if (!s || typeof s !== 'object') return DEFAULTS();
  // v1 blobs had no saveVersion field at all
  let v = s.saveVersion || 1;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return DEFAULTS(); // unknown gap — start fresh rather than guess
    s = step(s);
    v = s.saveVersion || v + 1;
  }
  // merge over defaults so newly-added fields appear on older v2 saves
  const p = { ...DEFAULTS(), ...s };
  // sanity: referenced IDs must exist in content (a retired ID falls back safely)
  if (!STAGES.some(st => st.id === p.currentStage)) p.currentStage = STAGES[0].id;
  p.clearedStages = p.clearedStages.filter(id => STAGES.some(st => st.id === id));
  p.friends = [...new Set(p.friends.filter(id => FRIENDS.some(f => f.id === id)))];
  if (!p.friends.length) p.friends = [FRIENDS[0].id];
  if (!p.friends.includes(p.buddy)) p.buddy = p.friends[0];
  return p;
}

export function loadProgress() {
  try {
    return migrate(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch (_) {
    return DEFAULTS();
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      saveVersion: SAVE_VERSION,
      coins: p.coins, starsEarned: p.starsEarned,
      currentStage: p.currentStage, stageProgress: p.stageProgress,
      clearedStages: p.clearedStages,
      friends: p.friends, buddy: p.buddy,
      cosmetics: p.cosmetics, equipped: p.equipped, wish: p.wish,
      items: p.items, lettersHeard: p.lettersHeard,
    }));
  } catch (_) { /* ignore (e.g. private mode) */ }
}

// Wipe saved progress and return fresh defaults. Recordings (IndexedDB) and
// the parent's voice settings are intentionally NOT touched.
export function resetProgress() {
  try { localStorage.removeItem(KEY); } catch (_) {}
  return DEFAULTS();
}

// --- lightweight learning stats (the "brain" reads these) ---
export function bumpItem(p, key, correct) {
  const it = p.items[key] || (p.items[key] = { seen: 0, correct: 0 });
  it.seen++;
  if (correct) it.correct++;
}
export function itemAccuracy(p, key) {
  const it = p.items[key];
  return it && it.seen ? it.correct / it.seen : null; // null = never tried
}
