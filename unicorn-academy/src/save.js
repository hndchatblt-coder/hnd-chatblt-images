/* ================= Unicorn Academy — persistence =================
   localStorage in try/catch with in-memory fallback; autosave after every
   mutation; schema carries v; corrupt/old saves keep durable progress only. */
'use strict';
(() => {
const KEY = 'unicorn-academy';
let memoryFallback = null;

const fresh = () => ({
  v: 1,
  created: false,                 // first-run finished?
  name: '',                       // her name (uppercase letters)
  uni: { name: 'Sparkle', body: 0, mane: 0 },
  gems: 0,
  rainbowGems: 0,                 // Rainbow Royale currency
  stars: {},                      // stageId -> 0..3 (checkpoints passed)
  levels: {},                     // stageId -> current internal level (1-based)
  floors: {},                     // stageId -> placement floor (level-down never goes below)
  rounds: {},                     // stageId -> completed round count
  stickers: {},                   // zoneId -> [{stage, rare}]
  owned: [],                      // boutique item ids
  equipped: [],                   // subset of owned (one per anchor enforced at equip time)
  babies: [],                     // [{id, name, body, mane, quirk, starsAtHatch, treats, growth:0|1|2}]
  eggsAwarded: 0,                 // how many EGG_MILESTONES reached & eggs granted
  eggPending: false,              // an egg is waiting on the map to be tapped/hatched
  garden: [],                     // planted patches [{day, slot, kind}]
  meter: 0, meterFills: 0,
  sessions: 1,                    // bumped per real session (and by dev button)
  sessionStamp: 0,                // wall-clock of session start
  lastSeenDay: '', lastGiftDay: '',
  daysPlayed: 0,
  firsts: [],                     // ceremony ids already played
  memoryBook: [],                 // [{id, title, line, day}]
  zoneVisits: {},                 // zoneId -> count (favourite-zone memory)
  lastZone: '', lastStage: '',
  history: {},                    // stageId -> {answers:[0/1 recent 20], starSession: n}
  answered: 0, correct: 0,        // lifetime totals (dashboard)
  weekLog: {},                    // dayString -> minutes played (dashboard, pruned to 8 days)
  settings: { voice: 1, sfx: 1, music: 1, vol: 1 },
  sillyDay: { day: '', kind: '' },
  surprises: {},                  // eventId -> lastFiredDay (hard cooldown)
  royale: { day: '', done: 0, crowned: false },
  hideSeek: { day: '', found: 0 },
});

// shape check: durable fields we insist on; anything else falls back to defaults
const load = () => {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { raw = memoryFallback; }
  if (!raw) return fresh();
  let d;
  try { d = JSON.parse(raw); } catch (e) { return fresh(); }
  if (!d || typeof d !== 'object' || typeof d.v !== 'number') return fresh();
  const base = fresh();
  if (d.v !== 1) {
    // unknown/older schema: keep durable progress, reset session position
    const keep = ['name', 'uni', 'gems', 'rainbowGems', 'stars', 'owned', 'equipped', 'babies',
      'eggsAwarded', 'created', 'firsts', 'memoryBook', 'daysPlayed', 'settings'];
    for (const k of keep) if (k in d) base[k] = d[k];
    return base;
  }
  // v1: merge over defaults so missing keys never crash
  for (const k in base) if (k in d) base[k] = d[k];
  // sanity: types of the fields the engine indexes into
  for (const k of ['stars', 'levels', 'floors', 'rounds', 'stickers', 'history', 'zoneVisits', 'weekLog', 'surprises'])
    if (!base[k] || typeof base[k] !== 'object' || Array.isArray(base[k])) base[k] = {};
  for (const k of ['owned', 'equipped', 'babies', 'garden', 'firsts', 'memoryBook'])
    if (!Array.isArray(base[k])) base[k] = [];
  return base;
};

UA.S = load();

UA.save = () => {
  try {
    const json = JSON.stringify(UA.S);
    try { localStorage.setItem(KEY, json); } catch (e) { memoryFallback = json; }
  } catch (e) { /* never let saving crash play */ }
  if (UA.dev) UA.dev.log('save');
};

UA.resetAll = () => {
  UA.S = fresh();
  try { localStorage.removeItem(KEY); } catch (e) { memoryFallback = null; }
  UA.save();
};

/* ---------- derived helpers used across the game ---------- */
UA.totalStars = (S = UA.S) => Object.values(S.stars).reduce((a, b) => a + b, 0);
UA.zoneStars = (S, zoneId) => { if (typeof S === 'string') { zoneId = S; S = UA.S; }
  const z = UA.zoneById(zoneId); if (!z) return 0;
  return z.stages.reduce((a, st) => a + (S.stars[st] || 0), 0); };
UA.zoneUnlocked = (zoneId) => { const z = UA.zoneById(zoneId); return !z.lock || z.lock(UA.S); };
UA.stageMastered = (stageId) => (UA.S.stars[stageId] || 0) >= 3;
UA.masteredStages = () => Object.keys(UA.S.stars).filter(id => UA.S.stars[id] >= 3);
UA.todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

/* session bookkeeping: a new session = new page load OR >45 min gap re-check */
UA.beginSession = () => {
  const S = UA.S;
  S.sessions += 1;
  S.sessionStamp = Date.now();
  const today = UA.todayStr();
  if (S.lastSeenDay !== today) { S.daysPlayed += 1; S.lastSeenDay = today; }
  // prune weekLog to the last 8 entries
  const days = Object.keys(S.weekLog);
  if (days.length > 8) days.slice(0, days.length - 8).forEach(d => delete S.weekLog[d]);
  UA.save();
};
})();
