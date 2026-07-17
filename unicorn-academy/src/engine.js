/* ================= Unicorn Academy — generic activity engine =================
   One question loop (present -> answer -> feedback -> score/streak/gems -> next)
   drives every stage via a small set of widgets. Stage data lives in stages.js.

   Engine-wide robustness (SPEC <architecture>): answer lock until feedback
   resolves; home stays live and cancels cleanly; save before ceremony;
   level-down floored at placement; reveal pays nothing. */
'use strict';
(() => {
const E = UA.engine = {
  active: false,        // an activity is running
  zone: null, stage: null,
  q: null,              // current question object
  locked: false,        // answer lock during feedback
  roundQ: 0, roundFirstTry: 0, roundLen: 5,
  consecRounds: 0,      // consecutive rounds of the same stage (interleaving nudge)
  warmupLeft: 0,
  streak: 0, misses: 0,
  isReview: false,      // current question is a sparkle review
  reviewStage: null,
  timers: [],           // everything cleared on stop()
  qToken: 0,            // invalidates async continuations after stop()/next
};

const T = (fn, ms) => { const t = setTimeout(fn, ms); E.timers.push(t); return t; };
const clearTimers = () => { E.timers.forEach(clearTimeout); E.timers = []; };

/* ---------- stage state helpers ---------- */
const stageDef = (id) => UA.STAGES[id];
E.levelOf = (id) => UA.S.levels[id] || stageDef(id).start || 1;
const starPins = (def) => def.pins || [Math.ceil(def.levels / 3), Math.ceil(def.levels * 2 / 3), def.levels];
const historyOf = (id) => {
  if (!UA.S.history[id]) UA.S.history[id] = { answers: [], starSession: 0 };
  return UA.S.history[id];
};

/* which stage should this zone run? lowest not-yet-mastered, else rotate all */
E.pickStage = (zoneId) => {
  const z = UA.zoneById(zoneId);
  const open = z.stages.filter(s => UA.STAGES[s]);
  const un = open.filter(s => !UA.stageMastered(s) && UA.STAGES[s].stars !== false);
  return un[0] || UA.pick(open);
};

/* ---------- plateau: no star progress in a stage across 3 sessions ---------- */
const plateauSwap = (stageId) => {
  const h = historyOf(stageId);
  if (!h.starSession) { h.starSession = UA.S.sessions; return stageId; }
  if (UA.S.sessions - h.starSession < 3) return stageId;
  // change the presentation: sibling stage in the same zone (prev if exists, else next)
  const z = UA.zoneById(stageDef(stageId).zone);
  const i = z.stages.indexOf(stageId);
  const sib = z.stages[i - 1] || z.stages[i + 1];
  if (sib && UA.STAGES[sib]) {
    h.starSession = UA.S.sessions; // reset the clock so we alternate, not exile
    UA.dev && UA.dev.log('plateau: ' + stageId + ' -> ' + sib);
    return sib;
  }
  return stageId;
};

/* ---------- start / stop ---------- */
E.start = (zoneId, stageId, opts = {}) => {
  const S = UA.S;
  E.zone = UA.zoneById(zoneId);
  stageId = stageId || E.pickStage(zoneId);
  stageId = plateauSwap(stageId);
  E.stage = stageDef(stageId);
  E.active = true;
  E.roundQ = 0; E.roundFirstTry = 0; E.streak = 0; E.misses = 0;
  E.roundLen = E.stage.roundLen || 5;
  if (S.lastStage === stageId) E.consecRounds++; else E.consecRounds = 0;
  S.lastZone = zoneId; S.lastStage = stageId;
  // session warm-up: 2-3 easy questions from mastered content, once per session
  if (!E.warmedThisSession && UA.masteredStages().length) {
    E.warmupLeft = 2 + UA.rand(2);
    E.warmedThisSession = true;
  }
  UA.save();
  UA.ui.showActivity(E.zone, E.stage);
  E.introSay = opts.hello || '';
  E.next();
};

E.stop = () => {           // home tap mid-anything: cancel cleanly, count nothing
  E.active = false;
  E.qToken++;
  clearTimers();
  UA.audio.stopSpeech();
  E.q = null; E.locked = false;
};

/* worked example the first time a widget type ever appears */
E.demoIfNew = async () => {
  const w = E.stage.widget;
  const seen = UA.S.history['demo-' + w];
  if (seen) return;
  UA.S.history['demo-' + w] = { answers: [1] };
  UA.save();
  await UA.ui.workedExample(w, E.stage);
};

/* ---------- question construction (warm-up + sparkle review injection) ---------- */
const buildQuestion = () => {
  const mastered = UA.masteredStages().filter(id => id !== E.stage.id);
  E.isReview = false; E.reviewStage = null;
  let def = E.stage, level = E.levelOf(def.id);
  if (E.warmupLeft > 0 && mastered.length) {
    E.warmupLeft--;
    E.isReview = 'warmup';
    E.reviewStage = stageDef(UA.pick(mastered));
    def = E.reviewStage; level = Math.max(1, starPins(def)[0]);
  } else if (mastered.length && UA.rand(5) === 0) {
    E.isReview = 'sparkle';
    E.reviewStage = stageDef(UA.pick(mastered));
    def = E.reviewStage; level = E.levelOf(def.id);
  }
  const q = def.gen(level, UA.S);
  q.stage = def; q.level = level;
  q.say = UA.frameFor(def.id, def.zone).replace('%Q', q.core || q.say || '');
  return q;
};

E.next = () => {
  if (!E.active) return;
  clearTimers();
  if (E.roundQ >= E.roundLen) return roundEnd();
  const token = ++E.qToken;
  E.q = buildQuestion();
  E.misses = 0; E.locked = false;
  UA.ui.renderQuestion(E.q, E.isReview === 'sparkle');   // options exist immediately (quiet)
  // the worked-example overlay (first time a widget type appears) plays ABOVE
  // the rendered question, then narration begins
  E.demoIfNew().then(() => { if (token === E.qToken) { narrateQuestion(token); armIdleTimers(token); } });
};

const narrateQuestion = (token) => {
  const q = E.q;
  UA.ui.quietChrome(true);
  UA.ui.setOptionsQuiet(true);
  const prefix = E.introSay ? E.introSay + ' ' : '';
  E.introSay = '';
  UA.audio.speak(prefix + personalise(q.say)).then(() => {
    if (token !== E.qToken) return;
    UA.ui.setOptionsQuiet(false);            // the non-verbal "now" cue
    if (q.afterNarrate) q.afterNarrate();
  });
};
const personalise = (s) => (s || '').replaceAll('%NAME%', UA.S.name || 'superstar')
  .replaceAll('%UNI%', UA.S.uni.name);
E.personalise = personalise;

E.repeat = () => {          // the hear-again button
  if (!E.q) return;
  const token = E.qToken;
  if (E.q.reFlash) E.q.reFlash();
  UA.audio.speak(personalise(E.q.say));
  armIdleTimers(token);
};

/* idle: 10s -> pulse the options; 20s -> unicorn repeats the instruction */
const armIdleTimers = (token) => {
  T(() => { if (token === E.qToken && !E.locked) UA.ui.pulseOptions(); }, 10000);
  T(() => { if (token === E.qToken && !E.locked) E.repeat(); }, 20000);
};

/* ---------- answering ---------- */
E.answer = (id, el, pt) => {
  if (!E.active || E.locked || !E.q) return;
  const q = E.q;
  const correct = Array.isArray(q.correct) ? q.correct.includes(id) : id === q.correct;
  if (correct) return onCorrect(el, pt);
  return onWrong(id, el);
};

const record = (firstTry) => {
  const S = UA.S;
  S.answered++; if (firstTry) S.correct++;
  if (!E.isReview) {
    const h = historyOf(E.stage.id);
    h.answers.push(firstTry ? 1 : 0);
    if (h.answers.length > 20) h.answers.shift();
  }
  const day = UA.todayStr();
  S.weekLog[day] = (S.weekLog[day] || 0) + 0.2; // ~12s per answer, minutes
};

const onCorrect = (el, pt) => {
  E.locked = true;
  clearTimers();
  const firstTry = E.misses === 0;
  record(firstTry);
  E.roundQ++;
  if (firstTry) E.roundFirstTry++;
  UA.ui.feedbackCorrect(el, pt);
  UA.audio.sfx.chime();
  let praised = UA.pickFresh('praise', UA.PRAISE);
  if (E.isReview === 'sparkle') { UA.reward.gems(1, el); praised = 'Sparkle bonus! ' + praised; }
  UA.audio.speak(personalise(praised), { interrupt: true });
  const q = E.q;
  const done = () => { if (!E.active) return; postCorrect(firstTry); };
  T(done, q.slowNext ? 1900 : 1100);
};

const postCorrect = (firstTry) => {
  if (E.isReview) { UA.reward.meterTick(); E.next(); return; }
  const S = UA.S, id = E.stage.id;
  UA.reward.meterTick();
  if (firstTry) E.streak++; else E.streak = 0;
  if (E.streak >= 3) {
    E.streak = 0;
    return levelUp();
  }
  maybeLevelDown();
  E.next();
};

const onWrong = (id, el) => {
  E.misses++;
  E.streak = 0;
  UA.audio.sfx.boop();
  UA.ui.feedbackWrong(el);
  const token = E.qToken;
  if (E.misses === 1) {
    UA.audio.speak(personalise(UA.pickFresh('tryagain', UA.TRY_AGAIN)));
  } else if (E.misses === 2) {
    // gentle hint: fade some wrong options, unicorn re-explains
    UA.ui.hintFade(E.q);
    const hint = E.q.hint || E.q.say;
    UA.audio.speak(personalise(hint));
  } else {
    // warm reveal: no gems, no streak, no star credit; play moves on
    E.locked = true;
    clearTimers();
    record(false);
    E.roundQ++;
    UA.ui.revealCorrect(E.q);
    UA.audio.speak(personalise(UA.pick(UA.REVEAL_LINES)));
    T(() => { if (!E.active) return; maybeLevelDown(true); E.next(); }, 2100);
  }
  if (E.misses < 3) armIdleTimers(token);
};
E.forceReveal = () => { E.misses = 3; onWrong(null, null); }; // widgets with no discrete wrong tap

/* ---------- levels, stars, level-down ---------- */
const levelUp = () => {
  const S = UA.S, id = E.stage.id, def = E.stage;
  const cur = E.levelOf(id);
  const pins = starPins(def);
  const stars = S.stars[id] || 0;
  // crossing a checkpoint?
  let newStars = stars;
  for (let k = stars; k < 3; k++) if (cur >= pins[k]) newStars = k + 1;
  const gained = newStars - stars;
  if (gained > 0) {
    S.stars[id] = newStars;
    historyOf(id).starSession = S.sessions;
    UA.save();                                  // save BEFORE the ceremony
    UA.reward.starEarned(id, newStars, () => afterLevelUp(cur, def));
    return;
  }
  afterLevelUp(cur, def);
};
const afterLevelUp = (cur, def) => {
  if (!E.active) return;
  const S = UA.S;
  if (cur < def.levels) {
    S.levels[def.id] = cur + 1;
    UA.save();
    UA.audio.sfx.flourish();
    UA.audio.speak(personalise('Level up! You are getting stronger, %NAME%!'));
    T(() => E.active && E.next(), 1400);
  } else {
    E.next();
  }
};

const maybeLevelDown = (fromReveal) => {
  const id = E.stage.id;
  const h = historyOf(id).answers;
  const last6 = h.slice(-6);
  if (last6.length >= 6 && last6.reduce((a, b) => a + b, 0) <= 2) {
    const floor = UA.S.floors[id] || stageDef(id).start || 1;
    const cur = E.levelOf(id);
    if (cur > floor) {
      UA.S.levels[id] = cur - 1;               // quiet: never announced
      historyOf(id).answers = [];
      UA.save();
      UA.dev && UA.dev.log('level-down ' + id + ' -> ' + (cur - 1));
    }
  }
};

/* ---------- round end ---------- */
const roundEnd = () => {
  const S = UA.S, id = E.stage.id;
  S.rounds[id] = (S.rounds[id] || 0) + 1;
  const perfect = E.roundFirstTry >= E.roundLen;
  const gems = 2 + UA.rand(3) + (perfect ? 1 : 0);
  // sticker per completed round
  const zid = E.stage.zone;
  if (!S.stickers[zid]) S.stickers[zid] = [];
  const rare = UA.rand(8) === 0;
  S.stickers[zid].push({ stage: id, rare });
  UA.save();                                    // rewards hit storage before celebration
  E.roundQ = 0; E.roundFirstTry = 0;
  if (UA.world && UA.world.roundHook(id)) return;   // coronation takes over the flow
  UA.ui.roundCelebration({ gems, perfect, rare, onDone: () => {
    if (!E.active) return;
    UA.reward.gems(gems);
    UA.pacing.roundDone();
    // interleaving: after ~2 consecutive rounds of one activity, suggest another zone
    if (E.consecRounds >= 2 && UA.rand(2) === 0) {
      E.consecRounds = 0;
      UA.ui.suggestElsewhere();
    } else {
      E.next();
    }
  } });
};

/* ---------- rewards core (gems + meter + stars glue) ---------- */
UA.reward = {
  gems (n, fromEl) {
    UA.S.gems += n;
    UA.save();
    UA.ui.gemFly(n, fromEl);
  },
  rainbowGems (n) { UA.S.rainbowGems += n; UA.save(); UA.ui.updateHUD(); },
  meterTick () {
    UA.S.meter++;
    if (UA.S.meter >= 10) {
      UA.S.meter = 0; UA.S.meterFills++;
      UA.save();
      UA.ui.updateHUD();
      UA.ui.meterParty();                       // hand her the party
    } else { UA.save(); UA.ui.updateHUD(); }
  },
  starEarned (stageId, nth, then) {
    UA.ui.updateHUD();
    const total = UA.totalStars();
    UA.ui.starCeremony(stageId, nth, () => {
      // egg milestones ride on total stars; queue at most one at a time
      if (UA.S.eggsAwarded < UA.EGG_MILESTONES.length && total >= UA.EGG_MILESTONES[UA.S.eggsAwarded] && !UA.S.eggPending) {
        UA.S.eggPending = true;
        UA.save();
        UA.ui.eggArrives(then);
      } else then && then();
    });
  },
};

/* ---------- session pacing (screen time is screen time) ---------- */
UA.pacing = {
  fillsAtStart: 0,
  offered: false,
  roundDone () {
    const mins = (Date.now() - UA.S.sessionStamp) / 60000;
    const fills = UA.S.meterFills - this.fillsAtStart;
    if (!this.offered && (mins >= 20 || fills >= 2)) {
      this.offered = true;
      UA.ui.restOffer();
    }
  },
  reset () { this.fillsAtStart = UA.S.meterFills; this.offered = false; },
};
})();
