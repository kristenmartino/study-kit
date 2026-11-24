// Simulations: a stepped run (choices move four meters, set flags that come back later as knock-ons, and add to
// planned and achieved business value) and live role-plays (see roleplay.js).
//
// Origin: Inspect & Adapt V32 index.src.html, "simulations" section, unchanged in behaviour except where
// docs/DECISIONS.md says otherwise. Run and role-play state share one document, data/users/<id>/sims.
'use strict';
const { createStore, mergeByTs } = require('./save.js');
const RP = require('./roleplay.js');

// ---------------------------------------------------------------- run engine (pure)
function runFresh(r) { const m = {}; r.meters.forEach(k => { m[k] = 70; }); return { ts: 0, i: 0, picks: {}, meters: m, pv: { planned: r.start.planned, actual: r.start.actual }, flags: [], missed: [] }; }
function runAvg(r, x) { return Math.round(r.meters.reduce((a, k) => a + x.meters[k], 0) / r.meters.length); }
// Predictability: business value achieved ÷ planned, as a percentage to one decimal.
function runPred(x) { return x.pv.planned ? Math.round(1000 * x.pv.actual / x.pv.planned) / 10 : 0; }
// Applies choice j at the current step to x (mutates and returns x). A step already answered is left alone.
function runApply(r, x, j) {
  const s = r.steps[x.i];
  if (!s || x.picks[s.id] !== undefined) return x;
  const before = Object.assign({}, x.meters), e = s.effects[j] || {};
  r.meters.forEach(k => { x.meters[k] = Math.max(0, Math.min(100, x.meters[k] + (e[k] || 0))); });
  const pv = { planned: 0, actual: 0 }, add = d => { if (d) { pv.planned += d.planned || 0; pv.actual += d.actual || 0; } };
  add((s.pv || {})[j]);
  for (const f in (s.pvIf || {})) if (x.flags.indexOf(f) !== -1) add(s.pvIf[f][j]);
  x.pv.planned += pv.planned; x.pv.actual += pv.actual;
  const f = (s.sets || {})[j]; if (f && x.flags.indexOf(f) === -1) x.flags.push(f);
  if (j !== s.answer) x.missed.push(s.id);
  x.picks[s.id] = j; x.last = { before, pv };
  return x;
}
function runEnding(r, x) { const avg = runAvg(r, x); return { avg, ending: r.endings.find(e => avg >= e.min) }; }

// ---------------------------------------------------------------- the engine on a page
// cfg:
//   runs, roleplays   from build/sims-validate.js
//   appKey            localStorage prefix: state lives under '<appKey>:sims:v1'
//   intro             note at the top of the list
//   runNoun           label for a run on the list ('PI run')
//   per run (optional): blurb (list note), predNote (after the predictability line), endLabel (last Next button)
//   rpHeading         heading over the role-plays ('Product Owner role-plays')
//   roleplay          { learner, rules, scoring, plainText, overall }, see roleplay.js
//   act               data-act prefix ('')
//   host              see README "Host interface"
function create(cfg) {
  const C = Object.assign({ appKey: 'study-kit', runNoun: 'Run', rpHeading: 'Role-plays', act: '', roleplay: {} }, cfg);
  const H = C.host, esc = H.esc, A = n => C.act + n;
  const RUNS = C.runs || [], RPS = C.roleplays || [], R = Object.assign({}, RP.DEFAULTS, C.roleplay);
  const ids = new Set(RUNS.map(r => r.id).concat(RPS.map(x => x.id)));
  function normalize(x) {
    const o = {};
    if (!x || typeof x !== 'object') return o;
    for (const k in x) { const v = x[k]; if (ids.has(k) && v && typeof v === 'object' && typeof v.ts === 'number') o[k] = JSON.parse(JSON.stringify(v)); }
    return o;
  }
  const store = createStore({
    localKey: C.appKey + ':sims:v1', doc: 'sims', field: 'sims', normalize, storage: C.storage,
    onRemote() { const sc = H.screen(); if (sc === 'sims' || sc === 'run') H.render(); },
    onStatus() { if (typeof document === 'undefined') return; const el = document.getElementById('sims-saved'); if (el) el.textContent = store.statusText(); }
  });
  const runGet = r => { const x = store.get(r.id); return x && x.meters ? x : runFresh(r); };
  const runPut = (r, x) => { x.ts = Date.now(); store.put(r.id, x); };
  const draft = o => o.status ? '<span class="cchip draft">' + esc(o.status) + '</span>' : '';

  function meterRow(r, m, before) {
    return '<div class="smeters">' + r.meters.map(k => {
      const v = m[k], d = before ? v - before[k] : 0, cls = v >= 60 ? 'ok' : v >= 40 ? 'warn' : 'bad';
      return '<div class="smeter"><span class="mlab">' + esc(r.meterLabels[k]) + '</span><span class="mval">' + v + (d ? ' <em class="' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '+' : '') + d + '</em>' : '') + '</span>' +
        '<span class="mbar" aria-hidden="true"><i class="' + cls + '" style="width:' + v + '%"></i></span></div>';
    }).join('') + '</div>';
  }
  function renderList() {
    const runs = RUNS.map(r => {
      const x = runGet(r), done = x.i >= r.steps.length;
      return '<div class="trow"><div class="top"><b>' + esc(r.title) + '</b>' + draft(r) + '</div>' +
        '<div class="qmeta"><span>' + esc(C.runNoun) + ' · you are the ' + esc(r.role) + '</span><span class="qid">' + (done ? 'Finished · predictability ' + runPred(x) + '%' : x.i ? 'Step ' + (x.i + 1) + ' of ' + r.steps.length : r.steps.length + ' steps') + '</span></div>' +
        (r.blurb ? '<p class="note">' + esc(r.blurb) + '</p>' : '') +
        '<div class="row"><button class="btn btn-small btn-primary" data-act="' + A('run') + '" data-id="' + r.id + '">' + (done ? 'See the result' : x.i ? 'Continue' : 'Start the run') + '</button></div></div>';
    }).join('');
    const rps = RPS.map(x => {
      const s = store.get(x.id);
      return '<div class="trow"><div class="top"><b>' + esc(x.title) + '</b>' + draft(x) + '</div>' +
        '<div class="qmeta"><span>Role-play · ' + esc(x.role) + '</span><span class="qid">' + (s && s.best ? 'Best ' + s.best + ' of 4' : '') + '</span></div>' +
        '<div class="row"><button class="btn btn-small btn-primary" data-act="' + A('rp') + '" data-id="' + x.id + '">Open</button></div></div>';
    }).join('');
    H.paint(H.listHeader('Simulations') + '<main class="wrap">' +
      '<p class="note">' + esc(C.intro || 'Practice that runs over time. A run is a sequence of steps, where earlier choices come back later. In a role-play, Claude plays a stakeholder with facts and limits you have to uncover; you have up to 8 messages, then a score.') + '</p>' +
      (RUNS.length ? '<section aria-labelledby="srh"><div class="section-h"><h2 id="srh">' + esc(C.runNoun) + '</h2></div><div class="stack">' + runs + '</div></section>' : '') +
      (RPS.length ? '<section aria-labelledby="sph"><div class="section-h"><h2 id="sph">' + esc(C.rpHeading) + '</h2><span class="hint">Needs Claude</span></div><div class="stack">' + rps + '</div></section>' : '') +
      '<p class="note"><b>Draft</b> means you have not reviewed the scenario, its key or its rubric yet. Simulations do not count toward Readiness or the daily review. <span id="sims-saved">' + store.statusText() + '</span>.</p>' +
      '</main>');
  }
  function renderRun() {
    const r = RUNS.find(x => x.id === H.view().run); if (!r) { H.go('sims', {}); return; }
    const x = runGet(r);
    let h = '<details class="more"' + (x.i === 0 && x.picks[r.steps[0].id] === undefined ? ' open' : '') + '><summary>The briefing</summary><p>' + esc(r.briefing) + '</p></details>';
    if (x.i >= r.steps.length) {
      const { avg, ending } = runEnding(r, x), pred = runPred(x);
      const missed = r.steps.filter(s => x.missed.indexOf(s.id) !== -1);
      h += '<article class="card"><div class="qmeta"><span class="cchip kind">Ending · average meter ' + avg + '</span>' + draft(r) + '</div><h2 id="stem" tabindex="-1">' + esc(ending.title) + '</h2>' + meterRow(r, x.meters) + '<p>' + esc(ending.text) + '</p>' +
        '<div class="fbblock"><h3>Predictability</h3><p><b>' + pred + '%</b>: business value achieved ' + x.pv.actual + ' ÷ planned ' + x.pv.planned + ' for committed objectives.' + (r.predNote ? ' ' + esc(r.predNote) : '') + '</p></div></article>' +
        '<section aria-labelledby="llh"><div class="section-h"><h2 id="llh">Lessons-learned register</h2><span class="hint">' + (missed.length ? missed.length + ' to revisit' : 'Every step on the key') + '</span></div><article class="card">' +
        (missed.length ? '<ol class="checklist">' + missed.map(s => '<li><b>' + esc(s.phase) + ':</b> ' + esc(s.lesson) + '</li>').join('') + '</ol>' : '<p>You chose the keyed option at every step.</p>') + '</article></section>' +
        '<div class="row"><button class="btn" data-act="' + A('run-replay') + '" data-id="' + r.id + '">Play again from the start</button><button class="btn btn-quiet" data-act="' + A('sims') + '">Back to Simulations</button></div>';
      H.paint(H.header(r.title, A('sims'), '', 'Back to Simulations', 'Done') + '<main class="wrap">' + h + '</main>');
      return;
    }
    const s = r.steps[x.i], picked = x.picks[s.id], ans = picked !== undefined;
    const knock = Object.keys(s.updateIf || {}).filter(f => x.flags.indexOf(f) !== -1).map(f => '<p class="note"><b>Knock-on:</b> ' + esc(s.updateIf[f]) + '</p>').join('');
    h += meterRow(r, x.meters, ans && x.last ? x.last.before : null);
    h += '<article class="card"><div class="qmeta"><span class="cchip kind">' + esc(s.phase) + '</span>' + draft(r) + '<span class="qid">' + s.id + '</span></div>' +
      (s.update ? '<p class="note">' + esc(s.update) + '</p>' : '') + knock +
      '<h2 id="stem" class="stem" tabindex="-1">' + esc(s.stem) + '</h2>' +
      '<div class="opts" role="group" aria-label="Your choice">' + s.options.map((o, j) => {
        const cls = ans ? (j === s.answer ? ' is-correct' : j === picked ? ' is-wrong' : '') : '';
        return '<button class="opt' + cls + '" data-act="' + A('run-pick') + '" data-j="' + j + '"' + (ans ? ' disabled' : '') + '><span class="key" aria-hidden="true">' + 'ABCD'[j] + '</span><span>' + esc(o) +
          (ans && j === s.answer ? '<span class="tag">Keyed choice</span>' : ans && j === picked ? '<span class="tag">Your choice</span>' : '') + '</span></button>';
      }).join('') + '</div>';
    if (ans) {
      const ok = picked === s.answer, pv = x.last && x.last.pv, icon = H.icon || {};
      h += '<div class="fb"><p class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? (icon.ok || '') + 'The keyed choice' : (icon.bad || '') + 'Not the keyed choice') + '</p>' +
        (pv && (pv.planned || pv.actual) ? '<p class="note">Business value: ' + (pv.planned ? 'planned ' + (pv.planned > 0 ? '+' : '') + pv.planned + ' ' : '') + (pv.actual ? 'delivered ' + (pv.actual > 0 ? '+' : '') + pv.actual : '') + '.</p>' : '') +
        ((s.sets || {})[picked] ? '<p class="note">This choice comes back later in the run.</p>' : '') +
        '<div class="fbblock"><h3>Why</h3><p>' + esc(s.why) + '</p></div>' +
        (!ok ? '<div class="fbblock"><h3>Why your choice falls short</h3><p>' + esc(s.whyNot[picked]) + '</p></div>' : '') +
        '<div class="fbblock"><h3>Lesson</h3><p>' + esc(s.lesson) + '</p></div></div>';
    }
    h += '</article>';
    if (ans) h += '<div class="row"><button class="btn btn-primary" data-act="' + A('run-next') + '" data-id="' + r.id + '">' + (x.i + 1 < r.steps.length ? 'Next step' : esc(r.endLabel || 'See how it ended')) + '</button></div>';
    h += '<p class="note">' + store.statusText() + '. One choice per step; play again from the start to try other paths.</p>';
    H.paint(H.header(r.title, A('sims'), '', 'Back to Simulations', (x.i + 1) + '/' + r.steps.length) + '<main class="wrap">' + h + '</main>');
  }

  // Role-play state lives in memory; only the best and last score are saved.
  let T = { turns: [], busy: false, err: '', score: null, draft: '' };
  const who = x => String(x.role).split(/[,(]/)[0].trim();
  function rpErr(e) {
    const c = e && e.code;
    if (c === 'not_granted' || c === 'sampling_disabled' || c === 'not_declared' || c === 'capability_disabled' || c === 'capability_removed') { H.samplerGone(); return 'Asking Claude is not available here.'; }
    return c === 'rate_limited' ? 'Claude is busy or your usage limit was reached. Try again in a minute.' : 'Couldn’t reach Claude just now. Try again.';
  }
  const repaint = () => { if (H.screen() === 'rp') H.keepScroll(); };
  async function rpSay() {
    const x = RPS.find(q => q.id === H.view().rp), fn = H.sampler(), el = typeof document !== 'undefined' && document.getElementById('rp-input'), msg = (el ? el.value : T.draft || '').trim();
    if (!x || !msg || T.busy || !fn) return;
    T.turns.push({ role: 'me', text: msg }); T.draft = ''; T.busy = true; T.err = ''; H.keepScroll();
    try { const r = await fn(RP.counterpartPrompt(x, T.turns, R), { cache: false }); T.turns.push({ role: 'them', text: RP.cleanReply(r && r.text) }); }
    catch (e) { T.err = rpErr(e); T.turns.pop(); T.draft = msg; }
    T.busy = false; repaint();
  }
  async function rpEnd() {
    const x = RPS.find(q => q.id === H.view().rp), fn = H.sampler(); if (!x || T.busy || !fn) return;
    T.busy = true; T.scoring = true; T.err = ''; H.keepScroll();
    try {
      const p = RP.scorePrompt(x, T.turns, R);
      let v;
      if (typeof fn.json === 'function') v = await fn.json(p, { cache: false });
      else { const r = await fn(p, { cache: false }), t = String((r && r.text) || ''); v = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }
      T.score = RP.readScore(v, T.turns, R);
      const n = T.score.overall, s = store.get(x.id) || { best: 0 };
      store.put(x.id, { ts: Date.now(), best: Math.max(s.best || 0, n), last: n, at: Date.now() });
    } catch (e) { T.err = e && e.code ? rpErr(e) : 'The score did not come back in a usable form. Try again.'; }
    T.busy = false; T.scoring = false; repaint();
  }
  function renderRp() {
    const x = RPS.find(q => q.id === H.view().rp); if (!x) { H.go('sims', {}); return; }
    const w = who(x), mine = T.turns.filter(t => t.role === 'me').length;
    const lessons = (x.lessons || []).map(id => { const t = H.lessonTitle && H.lessonTitle(id); return t ? '<button class="btn btn-small" data-act="lesson" data-id="' + esc(id) + '">' + esc(t) + '</button>' : ''; }).join('');
    let h = '<article class="card"><div class="qmeta"><span class="cchip kind">Role-play</span>' + draft(x) + '<span class="qid">' + x.id + '</span></div><h2>' + esc(x.title) + '</h2>' +
      '<p class="note">' + esc(x.role) + '</p><p>' + esc(x.brief) + '</p>' +
      (lessons ? '<div class="fbblock"><h3>Lessons on this</h3><div class="row">' + lessons + '</div></div>' : '') + '</article>';
    if (!H.sampler()) {
      h += '<p class="note">The live role-play uses Claude, which works when this page is open in Claude and you allow it to ask Claude. You can still practise: say your reply to the opening line out loud, then compare with the rubric.</p>' +
        '<article class="card"><div class="fbblock"><h3>' + esc(w) + ' opens with</h3><p>' + esc(x.opening) + '</p></div><div class="fbblock"><h3>You are scored on</h3><ol class="checklist">' + x.rubric.map(p => '<li>' + esc(p) + '</li>').join('') + '</ol></div>' +
        '<details class="more"><summary>What a strong resolution looks like</summary><p>' + esc(x.goodOutcome) + '</p></details></article>';
    } else {
      h += '<div class="chat" aria-live="polite">' + T.turns.map(t => '<div class="bubble ' + (t.role === 'me' ? 'me' : 'them') + '"><span class="who">' + (t.role === 'me' ? 'You' : esc(w)) + '</span>' + esc(t.text) + '</div>').join('') +
        (T.busy && !T.scoring ? '<div class="bubble them"><span class="who">' + esc(w) + '</span>…</div>' : '') + '</div>';
      if (T.score) {
        const sc = T.score;
        h += '<section class="fbx" aria-live="polite"><p class="eyebrow">Claude’s score</p><p><b>' + sc.overall + ' of 4 · ' + (sc.reached ? 'good outcome reached' : 'good outcome not reached') + '</b></p>' +
          '<ol class="fblist">' + sc.points.map(p => '<li class="' + (p.score >= 3 ? 'meets' : p.score === 2 ? 'partly' : 'misses') + '"><span class="fbst">' + p.score + ' of 4</span><span class="fbck">' + esc(p.point) + '</span>' + (p.comment ? '<span class="fbwhy">' + esc(p.comment) + '</span>' : '') + '</li>').join('') + '</ol>' +
          (sc.uncovered.length ? '<p class="note"><b>You uncovered:</b> ' + sc.uncovered.map(esc).join('; ') + '</p>' : '') + (sc.tip ? '<p class="note"><b>Tip:</b> ' + esc(sc.tip) + '</p>' : '') +
          '<details class="more"><summary>What ' + esc(w) + ' was holding back</summary><ul class="plain">' + x.hidden.map(f => '<li>' + esc(f) + '</li>').join('') + '</ul><p><b>Walk-away:</b> ' + esc(x.walkaway) + '</p><p><b>A strong resolution:</b> ' + esc(x.goodOutcome) + '</p></details>' +
          '<p class="note">Scored by Claude from the transcript and the rubric; a second opinion, not a verdict.</p></section>' +
          '<div class="row"><button class="btn btn-primary" data-act="' + A('rp') + '" data-id="' + x.id + '">Try again</button><button class="btn btn-quiet" data-act="' + A('sims') + '">Back to Simulations</button></div>';
      } else if (T.scoring) h += '<p class="note" role="status">Scoring…</p>';
      else {
        h += '<section class="answer"><label for="rp-input" class="eyebrow">Your reply · ' + (8 - mine) + ' left</label><textarea id="rp-input" rows="4" maxlength="1500"' + (T.busy ? ' disabled' : '') + '>' + esc(T.draft || '') + '</textarea></section>' +
          '<div class="row"><button class="btn btn-primary" data-act="' + A('rp-say') + '"' + (T.busy || mine >= 8 ? ' disabled' : '') + '>Send</button><button class="btn" data-act="' + A('rp-end') + '"' + (T.busy || !mine ? ' disabled' : '') + '>End and score</button></div>' +
          '<details class="more"><summary>You are scored on</summary><ol class="checklist">' + x.rubric.map(p => '<li>' + esc(p) + '</li>').join('') + '</ol></details>';
      }
      if (T.err) h += '<p class="note" role="status">' + esc(T.err) + '</p>';
    }
    H.paint(H.header(x.title, A('sims'), '', 'Back to Simulations', mine + '/8') + '<main class="wrap">' + h + '</main>');
  }

  function openList() { H.go('sims', {}); return true; }
  function openRun(id) { if (!RUNS.find(x => x.id === id)) return false; H.go('run', { run: id }); return true; }
  function openRp(id) { const x = RPS.find(q => q.id === id); if (!x) return false; T = { turns: [{ role: 'them', text: x.opening }], busy: false, err: '', score: null, draft: '' }; H.go('rp', { rp: id }); return true; }
  const focusStem = () => { if (typeof document === 'undefined') return; const st = document.getElementById('stem'); if (st) st.focus(); };
  const actions = {
    [A('sims')]() { openList(); },
    [A('run')](el) { openRun(el.dataset.id); },
    [A('run-pick')](el) { const r = RUNS.find(x => x.id === H.view().run); if (!r) return; const x = runApply(r, runGet(r), Number(el.dataset.j)); runPut(r, x); H.keepScroll(); },
    [A('run-next')](el) { const r = RUNS.find(x => x.id === el.dataset.id); if (!r) return; const x = runGet(r); x.i++; x.last = null; runPut(r, x); H.render(); if (typeof window !== 'undefined') window.scrollTo(0, 0); focusStem(); },
    [A('run-replay')](el) { const r = RUNS.find(x => x.id === el.dataset.id); if (!r) return; runPut(r, runFresh(r)); H.render(); if (typeof window !== 'undefined') window.scrollTo(0, 0); },
    [A('rp')](el) { openRp(el.dataset.id); },
    [A('rp-say')]() { rpSay(); },
    [A('rp-end')]() { rpEnd(); }
  };
  function onInput(e) { if (e.target && e.target.id === 'rp-input') { T.draft = e.target.value; return true; } return false; }
  // Links: #sims, #run-<id>, #rp-<id>, matched without regard to case.
  function route(hash) {
    const h = String(hash || '').replace(/^#/, '').toLowerCase();
    if (h === 'sims') return openList();
    let m;
    if ((m = /^run-(.+)$/.exec(h))) { const r = RUNS.find(x => x.id.toLowerCase() === m[1]); return r ? openRun(r.id) : false; }
    if ((m = /^rp-(.+)$/.exec(h))) { const x = RPS.find(q => q.id.toLowerCase() === m[1]); return x ? openRp(x.id) : false; }
    return false;
  }
  const linkIds = () => RUNS.reduce((a, r) => a.concat([r.id], r.steps.map(s => s.id)), []).concat(RPS.map(x => x.id));
  return {
    screens: { sims: renderList, run: renderRun, rp: renderRp },
    actions, onInput, route, linkIds,
    start() { store.loadLocal(); },
    attach: (db, uid) => store.attach(db, uid),
    store, runGet, _rp: () => T
  };
}

module.exports = { create, runFresh, runAvg, runPred, runApply, runEnding, mergeByTs };
