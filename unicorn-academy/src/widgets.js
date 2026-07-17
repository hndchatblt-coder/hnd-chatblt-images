/* ================= Unicorn Academy — interaction widgets =================
   Each widget renders a question into the activity areas and reports answers
   through UA.engine.answer(id, el, point). Non-discrete widgets install
   q.hintFn / q.revealFn so the engine's 2-miss hint and 3-miss reveal work
   everywhere. All touch targets >=80px; drags use pointer capture. */
'use strict';
(() => {
UA.widgets = {};
const $ = (sel, root) => (root || document).querySelector(sel);
const el = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };
const optBtn = (o, size) => {
  const b = document.createElement('button');
  b.className = 'option-card answer';
  b.dataset.testid = 'answer-option';
  b.dataset.opt = o.id;
  if (size) b.style.setProperty('--card-size', size + 'px');
  b.innerHTML = o.html + (o.cap ? `<span class="cap">${o.cap}</span>` : '');
  return b;
};
const tapPoint = (ev) => ({ x: ev.clientX || 0, y: ev.clientY || 0 });
// first pointer wins: one live pointerId at a time per question
let livePointer = null;
document.addEventListener('pointerdown', (e) => { if (livePointer === null) livePointer = e.pointerId; }, true);
document.addEventListener('pointerup', (e) => { if (livePointer === e.pointerId) livePointer = null; }, true);
document.addEventListener('pointercancel', (e) => { if (livePointer === e.pointerId) livePointer = null; }, true);
const firstPointer = (e) => livePointer === null || e.pointerId === livePointer;

/* ---------- tap the right choice ---------- */
UA.widgets.tapChoice = {
  demo: 'tap',
  render (q, area) {
    const grid = el('<div class="options-grid"></div>');
    const size = q.cardSize || (q.options.length > 4 ? 170 : 210);
    q.options.forEach(o => {
      const b = optBtn(o, size);
      b.addEventListener('pointerdown', (e) => {
        if (!firstPointer(e)) return;
        if (o.saySelf && !UA.engine.locked) UA.audio.speak(o.saySelf, { interrupt: true });
        UA.engine.answer(o.id, b, tapPoint(e));
      });
      grid.appendChild(b);
    });
    area.appendChild(grid);
  },
};

/* ---------- tap each object once (one-to-one counting) ----------
   Phase 1: tap every object (no fail possible; each speaks its count).
   Phase 2: number options appear; misses only count there. */
UA.widgets.tapEach = {
  demo: 'tapeach',
  render (q, area) {
    const field = el('<div class="options-grid" style="gap:18px"></div>');
    let tapped = 0;
    const n = q.count;
    for (let i = 0; i < n; i++) {
      const b = optBtn({ id: 'obj' + i, html: UA.sprite(q.spriteName) }, 128);
      b.dataset.testid = 'answer-option';
      b.classList.add('count-obj');
      b.addEventListener('pointerdown', (e) => {
        if (b.dataset.done || UA.engine.locked || !firstPointer(e)) return;
        b.dataset.done = '1';
        tapped++;
        b.classList.add('correct-glow');
        UA.fx.burst(tapPoint(e), 'spark', 6);
        UA.audio.sfx.pop();
        UA.audio.speak(String(tapped), { interrupt: true });
        if (tapped === n) setTimeout(() => phase2(), 900);
      });
      field.appendChild(b);
    }
    area.appendChild(field);
    const phase2 = () => {
      if (!UA.engine.active || UA.engine.q !== q) return;
      UA.audio.speak(UA.engine.personalise(`${n}! How many ${q.plural}? Tap the number!`));
      const numbers = el('<div class="options-grid"></div>');
      q.options.forEach(o => {
        const b = optBtn(o, 150);
        b.addEventListener('pointerdown', (e) => firstPointer(e) && UA.engine.answer(o.id, b, tapPoint(e)));
        numbers.appendChild(b);
      });
      area.appendChild(numbers);
      numbers.querySelectorAll('.answer').forEach((b, i) => { b.classList.add('live'); b.style.animationDelay = (i * 70) + 'ms'; });
    };
  },
};

/* ---------- drag to slot (word building, shape holes, sorting) ---------- */
UA.widgets.dragToSlot = {
  demo: 'drag',
  render (q, area) {
    const field = el('<div class="drag-field" style="position:relative;width:100%;height:100%;min-height:380px"></div>');
    area.appendChild(field);
    const W = field.clientWidth || area.clientWidth || 800;
    const H = Math.max(field.clientHeight, 380);
    const slotW = q.slotSize || 120, gap = 18;
    const slots = [];
    const totalW = q.slots.length * (slotW + gap) - gap;
    q.slots.forEach((s, i) => {
      const d = el(`<div class="drop-slot" data-slot="${s.id}" style="width:${slotW}px;height:${slotW}px;
        left:${(W - totalW) / 2 + i * (slotW + gap)}px;top:${H * 0.12}px">${s.html || ''}</div>`);
      field.appendChild(d);
      slots.push({ def: s, el: d, count: 0, cap: s.cap || 1, get filled () { return this.count >= this.cap; } });
    });
    let remaining = q.pieces.filter(p => !!p.slot).length;
    const shuffled = UA.shuffle(q.pieces);
    const pw = q.pieceSize || 108;
    shuffled.forEach((p, i) => {
      const cols = Math.min(shuffled.length, Math.floor((W - 40) / (pw + 16)) || 1);
      const rowY = H * 0.55 + Math.floor(i / cols) * (pw + 18);
      const x0 = (W - Math.min(shuffled.length, cols) * (pw + 16)) / 2 + (i % cols) * (pw + 16);
      const d = el(`<div class="drag-item" data-piece="${p.id}" style="width:${pw}px;height:${pw}px;left:${x0}px;top:${rowY}px">${p.html}</div>`);
      field.appendChild(d);
      let sx, sy, ox, oy, dragging = false;
      d.addEventListener('pointerdown', (e) => {
        if (UA.engine.locked || d.dataset.placed || !firstPointer(e)) return;
        dragging = true;
        d.setPointerCapture(e.pointerId);
        d.classList.add('lifted');
        sx = e.clientX; sy = e.clientY;
        ox = parseFloat(d.style.left); oy = parseFloat(d.style.top);
        d.style.transform = 'scale(1.15) translateY(-46px)';   // above the fingertip
        if (p.saySelf) UA.audio.speak(p.saySelf, { interrupt: true });
      });
      d.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        d.style.left = (ox + e.clientX - sx) + 'px';
        d.style.top = (oy + e.clientY - sy) + 'px';
        const near = nearestSlot(d);
        slots.forEach(s => s.el.classList.toggle('magnet', s === near && !s.filled));
      });
      const drop = (e) => {
        if (!dragging) return;
        dragging = false;
        d.classList.remove('lifted');
        d.style.transform = '';
        slots.forEach(s => s.el.classList.remove('magnet'));
        const near = nearestSlot(d);
        if (near && !near.filled) {
          const ok = near.def.accept ? near.def.accept === p.id : p.slot === near.def.id;
          if (ok) {
            near.count++;
            d.dataset.placed = '1';
            const r = near.el.getBoundingClientRect(), fr = field.getBoundingClientRect();
            const jig = near.cap > 1 ? (near.count - 1) * 14 - (near.cap - 1) * 7 : 0;
            d.style.left = (r.left - fr.left + (r.width - pw) / 2 + jig) + 'px';
            d.style.top = (r.top - fr.top + (r.height - pw) / 2) + 'px';
            near.el.classList.add('filled');
            UA.audio.sfx.pop();
            if (p.onPlace) p.onPlace();
            remaining--;
            if (remaining === 0) {
              UA.engine.answer(q.correct, near.el, { x: r.left + r.width / 2, y: r.top });
            }
            return;
          }
          // wrong slot: count a miss, glide home
          UA.engine.answer('__wrong__' + p.id, d);
        }
        d.style.transition = 'left .3s ease, top .3s ease';
        d.style.left = ox + 'px'; d.style.top = oy + 'px';
        setTimeout(() => { d.style.transition = ''; }, 320);
      };
      d.addEventListener('pointerup', drop);
      d.addEventListener('pointercancel', drop);
    });
    const nearestSlot = (d) => {
      const r = d.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let best = null, bd = 1e9;
      slots.forEach(s => {
        if (s.filled) return;
        const sr = s.el.getBoundingClientRect();
        const dx = cx - (sr.left + sr.width / 2), dy = cy - (sr.top + sr.height / 2);
        const dist = Math.hypot(dx, dy);
        if (dist < bd) { bd = dist; best = s; }
      });
      return bd < 95 ? best : null;   // magnetic pre-snap radius; snap ~60px feel
    };
    // hint: glow the next open correct slot & its piece; reveal: auto-place remaining
    q.hintFn = () => {
      const open = slots.find(s => !s.filled);
      if (!open) return;
      open.el.classList.add('magnet');
      setTimeout(() => open.el.classList.remove('magnet'), 2600);
    };
    q.revealFn = () => {
      // glide every unplaced piece home to its target slot
      field.querySelectorAll('.drag-item').forEach((dd) => {
        if (dd.dataset.placed) return;
        const p = q.pieces.find(pp => pp.id === dd.dataset.piece);
        const s = p && slots.find(ss => (ss.def.accept ? ss.def.accept === p.id : p.slot === ss.def.id));
        if (!s) { dd.style.opacity = '.25'; return; }   // distractor: fade out
        const r = s.el.getBoundingClientRect(), fr = field.getBoundingClientRect();
        dd.style.transition = 'left .6s ease, top .6s ease';
        dd.style.left = (r.left - fr.left + (r.width - pw) / 2) + 'px';
        dd.style.top = (r.top - fr.top + (r.height - pw) / 2) + 'px';
        dd.dataset.placed = '1';
        s.count++;
        s.el.classList.add('filled');
      });
    };
  },
};

/* ---------- tap sequence (rebus sentences, mazes, follow-the-order) ----------
   q.sequence: [{id, html, say, x?, y?}] in correct order. Free-position when
   x/y given (maze), otherwise a row. */
UA.widgets.tapSequence = {
  demo: 'tapseq',
  render (q, area) {
    const positioned = q.sequence.some(s => s.x != null);
    const field = el(positioned
      ? '<div style="position:relative;width:100%;height:100%;min-height:400px"></div>'
      : '<div class="options-grid"></div>');
    area.appendChild(field);
    let next = 0;
    q.sequence.forEach((s, i) => {
      const b = optBtn({ id: s.id, html: s.html }, q.cardSize || 140);
      if (positioned) {
        b.style.position = 'absolute';
        b.style.left = s.x + '%'; b.style.top = s.y + '%';
        b.style.transform = 'translate(-50%,-50%)';
      }
      b.addEventListener('pointerdown', (e) => {
        if (UA.engine.locked || b.dataset.done || !firstPointer(e)) return;
        if (i === next) {
          b.dataset.done = '1';
          next++;
          b.classList.add('correct-glow');
          UA.fx.burst(tapPoint(e), 'spark', 5);
          UA.audio.sfx.pop();
          if (s.say) UA.audio.speak(s.say, { interrupt: true });
          markNext();
          if (next === q.sequence.length) {
            setTimeout(() => UA.engine.answer(q.correct, b, tapPoint(e)), s.say ? 700 : 250);
          }
        } else {
          UA.engine.answer('__wrong__' + s.id, b);
        }
      });
      field.appendChild(b);
    });
    const markNext = () => {
      field.querySelectorAll('.seq-next').forEach(x => x.classList.remove('seq-next'));
      const nb = field.querySelectorAll('.answer')[next];
      if (nb && q.glowNext) nb.classList.add('seq-next');
    };
    if (q.glowNext) markNext();
    q.hintFn = () => {
      const nb = field.querySelectorAll('.answer')[next];
      if (nb) { nb.classList.add('seq-next'); setTimeout(() => !q.glowNext && nb.classList.remove('seq-next'), 2600); }
    };
    q.revealFn = () => {
      const rest = [...field.querySelectorAll('.answer')].slice(next);
      rest.forEach((b, j) => setTimeout(() => {
        b.classList.add('reveal-glow');
        const s = q.sequence.find(ss => ss.id === b.dataset.opt);
        if (s && s.say) UA.audio.speak(s.say, { interrupt: true });
      }, j * 650));
    };
  },
};

/* ---------- flip pairs (memory match) — one board per question ---------- */
UA.widgets.flipPairs = {
  demo: 'flip',
  render (q, area) {
    const grid = el('<div class="options-grid" style="max-width:900px"></div>');
    area.appendChild(grid);
    const size = q.pairs.length > 4 ? 150 : 176;
    const faces = UA.shuffle(q.pairs.flatMap(p => [p, p]).map((p, i) => ({ key: p.key, html: p.html, i })));
    let open = [], matched = 0, busy = false;
    faces.forEach(f => {
      const c = el(`<button class="flip-card answer" data-testid="answer-option" data-opt="${f.key}" style="--card-size:${size}px">
        <div class="flip-inner">
          <div class="flip-face front">${UA.sparkleSVG('#FFF9F5')}</div>
          <div class="flip-face back">${f.html}</div>
        </div></button>`);
      c.addEventListener('pointerdown', (e) => {
        if (busy || c.classList.contains('flipped') || UA.engine.locked || !firstPointer(e)) return;
        c.classList.add('flipped');
        UA.audio.sfx.pop();
        open.push({ c, f });
        if (open.length === 2) {
          busy = true;
          const [a, b] = open;
          if (a.f.key === b.f.key) {
            setTimeout(() => {
              a.c.classList.add('matched'); b.c.classList.add('matched');
              UA.audio.sfx.chime();
              UA.fx.burst(tapPoint(e), 'spark', 8);
              matched++;
              open = []; busy = false;
              if (matched === q.pairs.length) UA.engine.answer(q.correct, b.c, tapPoint(e));
            }, 450);
          } else {
            setTimeout(() => {
              a.c.classList.remove('flipped'); b.c.classList.remove('flipped');
              open = []; busy = false;
            }, 850);
          }
        }
      });
      grid.appendChild(c);
    });
    q.hintFn = () => { /* flash one unmatched pair briefly */
      const cards = [...grid.querySelectorAll('.flip-card')].filter(c => !c.classList.contains('matched'));
      const k = cards[0] && cards[0].dataset.opt;
      const pair = cards.filter(c => c.dataset.opt === k).slice(0, 2);
      pair.forEach(c => c.classList.add('flipped'));
      setTimeout(() => pair.forEach(c => !c.classList.contains('matched') && c.classList.remove('flipped')), 1400);
    };
    q.revealFn = () => {
      grid.querySelectorAll('.flip-card').forEach(c => c.classList.add('flipped', 'matched'));
    };
  },
};

/* ---------- jigsaw: tap a piece, then tap its slot ---------- */
UA.widgets.jigsaw = {
  demo: 'jigsaw',
  render (q, area) {
    // q.scene (svg string), q.cols, q.rows
    const wrap = el(`<div style="display:flex;gap:36px;align-items:center;justify-content:center;flex-wrap:wrap;width:100%"></div>`);
    area.appendChild(wrap);
    const W = 360, H = 300;
    const cols = q.cols, rows = q.rows, n = cols * rows;
    const board = el(`<div style="position:relative;width:${W}px;height:${H}px;background:rgba(255,255,255,.5);
      border-radius:18px;box-shadow:inset 0 0 0 4px rgba(92,74,102,.25)"></div>`);
    const tray = el('<div style="display:flex;flex-wrap:wrap;gap:14px;max-width:420px;justify-content:center"></div>');
    wrap.appendChild(board); wrap.appendChild(tray);
    const tile = (i, forTray) => {
      const c = i % cols, r = Math.floor(i / cols);
      const tw = W / cols, th = H / rows;
      return `<svg viewBox="${c * 360 / cols} ${r * 300 / rows} ${360 / cols} ${300 / rows}"
        width="${forTray ? tw * .9 : tw}" height="${forTray ? th * .9 : th}" style="border-radius:10px;pointer-events:none">${q.scene}</svg>`;
    };
    let picked = null, placed = 0;
    for (let i = 0; i < n; i++) {
      const slot = el(`<div class="drop-slot" data-slot="${i}" style="position:absolute;left:${(i % cols) * (100 / cols)}%;
        top:${Math.floor(i / cols) * (100 / rows)}%;width:${100 / cols}%;height:${100 / rows}%;border-radius:10px"></div>`);
      slot.addEventListener('pointerdown', (e) => {
        if (!picked || UA.engine.locked || slot.dataset.done || !firstPointer(e)) return;
        if (+picked.dataset.idx === i) {
          slot.dataset.done = '1';
          slot.innerHTML = tile(i, false);
          slot.classList.add('filled');
          picked.remove(); picked = null;
          placed++;
          UA.audio.sfx.pop();
          UA.fx.burst(tapPoint(e), 'spark', 5);
          if (placed === n) UA.engine.answer(q.correct, slot, tapPoint(e));
        } else {
          UA.engine.answer('__wrong__' + i, slot);
        }
      });
      board.appendChild(slot);
    }
    UA.shuffle([...Array(n).keys()]).forEach(i => {
      const p = el(`<button class="answer" data-testid="answer-option" data-opt="piece${i}" data-idx="${i}"
        style="border:none;background:var(--cream);border-radius:12px;padding:6px;cursor:pointer;
        box-shadow:0 5px 0 var(--shadow)">${tile(i, true)}</button>`);
      p.addEventListener('pointerdown', (e) => {
        if (UA.engine.locked || !firstPointer(e)) return;
        tray.querySelectorAll('.answer').forEach(x => x.style.outline = '');
        picked = p;
        p.style.outline = '6px solid var(--gold)';
        UA.audio.sfx.pop();
      });
      tray.appendChild(p);
    });
    q.hintFn = () => {
      const empty = board.querySelector('.drop-slot:not(.filled)');
      if (empty) { empty.classList.add('magnet'); setTimeout(() => empty.classList.remove('magnet'), 2400); }
    };
    q.revealFn = () => {
      board.querySelectorAll('.drop-slot').forEach((s, i) => {
        if (!s.dataset.done) { s.dataset.done = '1'; s.innerHTML = tile(i, false); s.classList.add('filled'); }
      });
      tray.innerHTML = '';
    };
  },
};
})();
