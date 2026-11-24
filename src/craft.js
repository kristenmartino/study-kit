// Craft: written practice. A packet (brief, data, stakeholder notes) handed back one stage at a time; Claude grades
// each stage against a fixed checklist (Meets / Partly / Misses) with a "Change to" line, and the worked answer and
// checklist always work without Claude. A "set" is a packet of short drafts, fixed one item at a time.
//
// Origin: Inspect & Adapt V32 index.src.html, "craft packets" section (base). Going Concern V27 carries a port
// (fx* names); its differences are resolved here and listed in docs/DECISIONS.md.
'use strict';
const { createStore } = require('./save.js');

const PERMANENT = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
const ERR_COPY = {
  rate_limited: 'Claude is busy or your usage limit was reached. Try again later.',
  session_expired: 'Sign in to Claude again, then retry.',
  refused: 'Claude declined this request. Edit your answer and try again.',
  empty_completion: 'No feedback came back. Try again.',
  prompt_too_large: 'Your answer is too long to review. Shorten it and try again.'
};

const slug = id => String(id).toLowerCase().replace(/\./g, '-');

// ---------------------------------------------------------------- pure helpers (no page needed)
function blocksText(blocks) {
  return (blocks || []).map(b => {
    if (b.p) return b.p;
    if (b.ul) return b.ul.map(x => '- ' + x).join('\n');
    if (b.ol) return b.ol.map((x, i) => (i + 1) + '. ' + x).join('\n');
    if (b.quote) return b.quote;
    if (b.table) return b.table.head.join(' | ') + '\n' + b.table.rows.map(r => r.join(' | ')).join('\n');
    return '';
  }).join('\n');
}
function sectionsText(secs) { return secs.map(s => s.h.toUpperCase() + '\n' + blocksText(s.blocks)).join('\n\n'); }
function briefSections(p, s) { return s && s.brief && s.brief.length ? p.sections.filter(x => s.brief.indexOf(x.h) !== -1) : p.sections; }
function packetText(p, s) { return blocksText(p.lead) + '\n\n' + sectionsText(briefSections(p, s)) + '\n\nTASK\n' + p.taskLead + '\n' + p.taskList.map((t, i) => (i + 1) + '. ' + t).join('\n'); }
function keyText(p, s) { return sectionsText(s && s.keyFor && s.keyFor.length ? p.key.filter(x => s.keyFor.indexOf(x.h) !== -1) : p.key); }
function modelText(s) { return s.model.map(m => m.h + '\n' + blocksText(m.blocks)).join('\n\n'); }
function selfMark(text) { return text.length + ':' + text.slice(0, 40); }

// Reads a grader reply into a fixed shape; throws { code: 'bad_reply' } when it has no items.
function parseFeedback(v, n) {
  if (!v || !Array.isArray(v.items)) throw { code: 'bad_reply' };
  const items = v.items.slice(0, n).map(it => {
    let st = String((it && it.status) || '').toLowerCase();
    st = st.indexOf('meet') === 0 ? 'meets' : st.indexOf('part') === 0 ? 'partly' : 'misses';
    return { status: st, why: String((it && it.why) || '').slice(0, 300), rewrite: st === 'meets' ? '' : String((it && it.rewrite) || '').slice(0, 1200) };
  });
  while (items.length < n) items.push({ status: 'misses', why: 'Not graded; ask again.', rewrite: '' });
  return { items, works: String(v.works || '').slice(0, 400), optional: String(v.optional || '').slice(0, 400), changed_mind: String(v.changed_mind || '').slice(0, 500) };
}

// The grader prompt. `domain` names the field ('product management'); `factsSubject` names what an answer may not
// invent ('product, people or data'). Everything else is Inspect & Adapt's wording, unchanged.
function gradePrompt(p, s, text, prev, cfg) {
  const c = Object.assign({ domain: 'product management', factsSubject: 'product, people or data', maxChars: 12000 }, cfg);
  let q = 'You grade a ' + c.domain + ' writing exercise against a fixed checklist. You are consistent: the same answer always gets the same grades, and you never ask for changes the checklist does not require.\n\n' +
    'EXERCISE BRIEF:\nPACKET GIVEN TO THE LEARNER (' + p.title + '). ' + (s.brief && s.brief.length ? 'The learner fixes one draft at a time. This is item ' + s.n + ' of ' + p.stages.length + ': ' + s.title + '. Only this item is shown below.' : 'The learner is the ' + p.role + ' and hands back working notes one stage at a time. This is stage ' + s.n + ' of ' + p.stages.length + ': ' + s.title + '.') + '\n\n' + packetText(p, s) +
    '\n\nPLANTED ITEMS KEY (for grading only; the learner has not seen it; ids like G1 or C1 in the checklist refer to it):\n' + keyText(p, s) +
    '\n\nNOTES ON THE WHOLE PACKET (context only; the checklist below is the only grading standard):\n' + p.grading.map(g => '- ' + g).join('\n') +
    '\n\nTASK FOR THIS STAGE:\n' + s.task +
    '\n\nCHECKLIST (the only grading standard):\n' + s.checklist.map((x, i) => (i + 1) + '. ' + x).join('\n') +
    (s.optional.length ? '\n\nOPTIONAL (never required; never lowers a grade):\n- ' + s.optional.join('\n- ') : '') +
    '\n\nONE ACCEPTABLE REFERENCE ANSWER (for calibration only; many wordings pass, and differing from it is never a reason to lower a grade):\n' + modelText(s) +
    '\n\nTHE LEARNER\'S ANSWER:\n' + text.slice(0, c.maxChars);
  if (prev) q += '\n\nYOUR PREVIOUS ROUND (on their earlier draft):\nEarlier draft:\n' + prev.text.slice(0, 8000) + '\nYour grades then: ' + prev.fb.items.map((it, i) => (i + 1) + '=' + it.status + (it.rewrite ? ' (you suggested: ' + it.rewrite + ')' : '')).join('; ');
  q += '\n\nRULES:\n' +
    '- Grade each checklist point literally: "meets" if the answer satisfies it in substance, even if worded differently from the reference; "partly" if it is attempted but incomplete; "misses" if absent or wrong.\n' +
    '- Give a rewrite ONLY for points graded partly or misses. The rewrite is the exact replacement line(s) for their answer that would make that point meet, changing nothing else.\n' +
    '- For the point about facts tracing to the packet: proposals, recommendations, questions and arithmetic on the packet\'s figures are not facts that need a label. Lower that point only when the answer states as fact something about the company, ' + c.factsSubject + ' that the packet does not say, and quote that statement in "why".\n' +
    '- Style preferences, extra detail, and anything not in the checklist never lower a grade. You may mention at most one such idea under "optional", or leave it empty.\n' +
    (prev ? '- Stay consistent with your previous round. A point you graded meets stays meets unless the learner changed the text it depends on or you find a definite error. If the learner applied your suggested rewrite, that point meets unless the rewrite itself was wrong. Whenever you change a grade without the learner changing the related text, or now advise against something you suggested before, explain it plainly in "changed_mind"; otherwise leave changed_mind empty.\n' : '- Leave changed_mind empty.\n') +
    '\nReturn JSON only: {"items":[{"status":"meets|partly|misses","why":"under 20 words","rewrite":"<only when not meets, else empty>"} x' + s.checklist.length + ' in checklist order], "works":"one sentence on what is strong", "optional":"<one optional idea or empty>", "changed_mind":"<see rules>"}';
  return q;
}

// A stage's progress label.
function stageStatusOf(c, s) {
  const text = (c.text || '').trim(), last = c.rounds[c.rounds.length - 1];
  if (!text) return { k: 'none', label: '' };
  if (last) {
    const met = last.fb.items.filter(i => i.status === 'meets').length, n = s.checklist.length, same = last.text.trim() === text;
    if (met === n && same) return { k: 'done', label: 'Completed' };
    if (same) return { k: 'fb', label: 'Feedback: ' + met + ' of ' + n };
  }
  if (c.self && c.self === selfMark(text)) return { k: 'self', label: 'Self-checked' };
  return last ? { k: 'fb', label: 'Edited since feedback' } : { k: 'draft', label: 'Drafted' };
}

// ---------------------------------------------------------------- the engine on a page
// cfg:
//   packets     from build/craft-parse.js
//   appKey      localStorage prefix: answers live under '<appKey>:craft:v1'
//   keyStyle    'slug' (Inspect & Adapt: entries keyed 'cf-1-1') or 'id' (Going Concern: 'FX-1.1'). Keep an app's
//               existing style, or its saved answers will not be found.
//   domain, factsSubject   grader wording (see gradePrompt)
//   minChars    shortest answer sent for grading (20)
//   maxChars, rounds       12000 characters, 4 rounds kept
//   act         prefix for data-act names, so an app with its own "packet" action can avoid a clash ('')
//   ids         element id prefix ('craft')
//   modelTier   passed to the sampler when set (Going Concern passes 'complex')
//   host        the app's side; see README "Host interface"
function create(cfg) {
  const C = Object.assign({ appKey: 'study-kit', keyStyle: 'slug', minChars: 20, maxChars: 12000, rounds: 4, act: '', ids: 'craft', modelTier: null }, cfg);
  const H = C.host, esc = H.esc;
  const PACKETS = C.packets, PK = new Map(), ST = new Map(), STK = new Map();
  const keyOf = id => C.keyStyle === 'id' ? String(id) : slug(id);
  PACKETS.forEach(p => { PK.set(p.id, p); p.stages.forEach(s => { s.packet = p.id; ST.set(s.id, s); STK.set(keyOf(s.id), s); }); });
  const A = n => C.act + n, I = n => C.ids + '-' + n;

  function roundOf(r) {
    if (!r || typeof r !== 'object' || typeof r.ts !== 'number' || !r.fb || !Array.isArray(r.fb.items)) return null;
    return { ts: r.ts, text: String(r.text || '').slice(0, C.maxChars), fb: parseFeedback(r.fb, r.fb.items.length) };
  }
  function normalize(x) {
    const o = {};
    if (!x || typeof x !== 'object') return o;
    for (const k in x) {
      const r = x[k];
      if (!STK.has(k) || !r || typeof r !== 'object') continue;
      o[k] = { text: String(r.text || '').slice(0, C.maxChars), ts: Number(r.ts) || 0, self: String(r.self || '').slice(0, 80), rounds: (Array.isArray(r.rounds) ? r.rounds : []).map(roundOf).filter(Boolean).slice(-C.rounds) };
    }
    return o;
  }
  const store = createStore({
    localKey: C.appKey + ':craft:v1', doc: 'craft', field: 'stages', normalize, storage: C.storage,
    // A remote change redraws the list or packet page, but never the screen being typed on.
    onRemote() { const sc = H.screen(); if ((sc === 'craft' || sc === 'packet') && !typing()) H.render(); },
    onStatus: paintSaved
  });
  function typing() { if (typeof document === 'undefined') return false; const el = document.activeElement; return !!(el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')); }

  const get = s => store.get(keyOf(s.id)) || { text: '', ts: 0, self: '', rounds: [] };
  const put = (s, patch) => { const k = keyOf(s.id); store.put(k, Object.assign({ text: '', self: '', rounds: [] }, store.get(k), patch, { ts: Date.now() })); };
  const status = s => stageStatusOf(get(s), s);
  const packetDone = p => p.stages.filter(s => { const k = status(s).k; return k === 'done' || k === 'self'; }).length;

  // -------------------------------------------------- rendering
  const chip = st => st.k === 'none' ? '' : '<span class="cchip ' + (st.k === 'done' ? 'ok' : st.k === 'self' ? 'self' : 'draft') + '">' + esc(st.label) + '</span>';
  const draftChip = p => p.status ? '<span class="cchip draft">' + esc(p.status) + '</span>' : '';
  // A two-column table stays a table. Wider ones become stacked rows, which fit a phone without sideways scrolling.
  function blocksHTML(blocks) {
    return (blocks || []).map(b => {
      if (b.p) return '<p>' + esc(b.p) + '</p>';
      if (b.ul) return '<ul>' + b.ul.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
      if (b.ol) return '<ol>' + b.ol.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>';
      if (b.quote) return '<blockquote>' + b.quote.split('\n').map(l => l ? '<p>' + esc(l) + '</p>' : '').join('') + '</blockquote>';
      if (b.table) {
        const t = b.table;
        if (t.head.length === 2 && t.rows.every(r => String(r[1]).length <= 24)) return '<table class="pktbl"><thead><tr>' + t.head.map(h => '<th scope="col">' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + t.rows.map(r => '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>').join('') + '</tbody></table>';
        return '<div class="srows">' + t.rows.map(r => '<div class="srow"><p class="srow-h">' + esc(r[0]) + '</p><dl>' + r.slice(1).map((c, j) => '<div><dt>' + esc(t.head[j + 1]) + '</dt><dd>' + esc(c) + '</dd></div>').join('') + '</dl></div>').join('') + '</div>';
      }
      return '';
    }).join('');
  }
  const sectionsHTML = (secs, tag) => secs.map(s => '<' + tag + '>' + esc(s.h) + '</' + tag + '>' + blocksHTML(s.blocks)).join('');
  const packetHTML = (p, tag) => '<div class="pk">' + blocksHTML(p.lead) + sectionsHTML(p.sections, tag) + '</div>';
  const keyHTML = p => sectionsHTML(p.key, 'h3') + '<h3>What a strong hand-back does</h3><ul>' + p.grading.map(g => '<li>' + esc(g) + '</li>').join('') + '</ul>';
  const savedText = () => store.statusText();
  function paintSaved() { if (typeof document === 'undefined') return; const el = document.getElementById(I('saved')); if (el) el.textContent = savedText(); }
  const draftNote = '<p class="note"><b>Draft</b> means you have not reviewed the packet, its key or its checklists yet. Craft work does not count toward Readiness or the daily review.</p>';

  function renderList() {
    const rows = PACKETS.map(p => {
      const d = packetDone(p);
      return '<div class="trow"><div class="top"><b>' + esc(p.title) + '</b>' + draftChip(p) + '</div>' +
        '<div class="qmeta"><span>' + esc(p.kind) + (p.stageWord === 'Stage' ? ' · you are the ' + esc(p.role) : '') + '</span><span class="qid">' + d + ' of ' + p.stages.length + ' ' + p.stageWord.toLowerCase() + 's done</span></div>' +
        '<p class="note">' + esc(p.blurb) + '</p>' +
        '<div class="row"><button class="btn btn-small btn-primary" data-act="' + A('packet') + '" data-id="' + p.id + '">Open the packet</button></div></div>';
    }).join('');
    H.paint(H.listHeader('Craft') + '<main class="wrap">' +
      '<p class="note">Written practice. A packet is a brief with data and notes from stakeholders who do not agree; you hand back your working notes one stage at a time. A set is a group of short drafts to fix, one item at a time. Each stage or item is checked against a fixed checklist.</p>' +
      '<section aria-labelledby="' + I('ch') + '"><div class="section-h"><h2 id="' + I('ch') + '">Packets and sets</h2><span class="hint">' + PACKETS.length + ' in all</span></div><div class="stack">' + rows + '</div></section>' +
      (PACKETS.some(p => p.status) ? draftNote : '') + '</main>');
  }
  function renderPacket() {
    const p = PK.get(H.view().packet); if (!p) { H.go('craft', {}); return; }
    const stages = p.stages.map(s => '<button class="strow" data-act="' + A('stage') + '" data-id="' + s.id + '"><span class="n">' + s.n + '</span><span class="nm">' + esc(s.title) + '</span>' + chip(status(s)) + '</button>').join('');
    H.paint(H.header(p.title, A('craft'), '', 'Back to Craft', '') + '<main class="wrap">' +
      '<article class="card pkcard"><div class="qmeta"><span class="cchip kind">' + esc(p.kind) + '</span>' + draftChip(p) + '<span class="qid">' + p.id + '</span></div>' +
      '<h2>' + esc(p.title) + '</h2><p>' + esc(p.blurb) + '</p>' +
      '<div class="fbblock"><h3>Your task</h3><p>' + esc(p.taskLead) + '</p><ol class="tasklist">' + p.taskList.map(t => '<li>' + esc(t) + '</li>').join('') + '</ol></div>' +
      '<p class="note"><b>Planted in this packet:</b> ' + esc(p.planted) + '</p></article>' +
      '<section aria-labelledby="' + I('sh') + '"><div class="section-h"><h2 id="' + I('sh') + '">' + p.stageWord + 's</h2><span class="hint">' + packetDone(p) + ' of ' + p.stages.length + ' done · each gets its own feedback</span></div><div class="strows">' + stages + '</div></section>' +
      '<section aria-labelledby="' + I('ph') + '"><div class="section-h"><h2 id="' + I('ph') + '">The packet</h2></div><article class="card">' + packetHTML(p, 'h3') + '</article></section>' +
      '<section aria-labelledby="' + I('kh') + '"><div class="section-h"><h2 id="' + I('kh') + '">Key</h2></div>' +
      (H.view().key ? '<article class="card"><div class="pk">' + keyHTML(p) + '</div></article>' :
        '<p class="note">The key lists every planted contradiction, gap and trap, with the arithmetic. Open it after your last stage.</p><div class="row"><button class="btn" data-act="' + A('pk-key') + '">Show the key</button></div>') + '</section>' +
      (H.linkBase !== undefined ? '<div class="row"><button class="btn btn-small" data-act="' + A('copy-packet-link') + '" data-id="' + p.id + '">Copy link to this packet</button></div>' : '') +
      (p.status ? draftNote : '') +
      '</main>');
  }

  let FB = { busy: false, id: null, err: '', ctrl: null };
  function fbStop() { if (FB.ctrl) { try { FB.ctrl.abort(); } catch (e) { /* already settled */ } } }
  function fbPanelHTML(s) {
    const c = get(s), rounds = c.rounds, last = rounds[rounds.length - 1], n = s.checklist.length;
    if (FB.busy && FB.id === s.id) return '<section class="fbx" aria-live="polite"><p class="eyebrow">Claude’s feedback</p><p>Checking your answer against the ' + n + '-point checklist…</p></section>';
    let h = '';
    if (FB.err && FB.id === s.id) h += '<p class="note" role="status">' + esc(FB.err) + '</p>';
    if (!last) return h;
    const r = last.fb, met = r.items.filter(i => i.status === 'meets').length, done = met === n;
    h += '<section class="fbx' + (done ? ' done' : '') + '" aria-live="polite"><p class="eyebrow">Claude’s feedback · round ' + rounds.length + ' · ' + esc(H.fmtDate(last.ts)) + '</p>' +
      '<p><b>' + (done ? 'Done. Your answer meets all ' + n + ' checklist points.' : met + ' of ' + n + ' checklist points met.') + '</b>' + (done ? ' No changes are needed. Anything marked optional is a matter of taste.' : ' Fix only the points marked Partly or Misses; the rest already pass.') + '</p>';
    if ((c.text || '').trim() && c.text.trim() !== last.text.trim()) h += '<p class="note">You have edited your answer since this round. Ask again to grade the new version.</p>';
    if (r.changed_mind) h += '<p class="note"><b>Change from last round:</b> ' + esc(r.changed_mind) + '</p>';
    h += '<ol class="fblist">' + r.items.map((it, i) => {
      const lab = it.status === 'meets' ? 'Meets' : it.status === 'partly' ? 'Partly' : 'Misses';
      return '<li class="' + it.status + '"><span class="fbst">' + lab + '</span><span class="fbck">' + esc(s.checklist[i] || '') + '</span>' +
        (it.why ? '<span class="fbwhy">' + esc(it.why) + '</span>' : '') + (it.status !== 'meets' && it.rewrite ? '<span class="fbrw"><b>Change to:</b> ' + esc(it.rewrite) + '</span>' : '') + '</li>';
    }).join('') + '</ol>';
    if (r.works) h += '<p><b>What works:</b> ' + esc(r.works) + '</p>';
    if (r.optional) h += '<p class="note"><b>Optional, not required:</b> ' + esc(r.optional) + '</p>';
    h += '<p class="note">Written by Claude from the packet, its key and this checklist. The grades are a second opinion: compare with the worked answer.</p>' +
      '<div class="row"><button class="btn btn-small btn-quiet" data-act="' + A('fb-reset') + '">Clear feedback history</button></div></section>';
    return h;
  }
  function actionsHTML(s) {
    const busy = FB.busy && FB.id === s.id, can = !!H.sampler();
    let h = '<div class="row">';
    if (busy) h += '<button class="btn" data-act="' + A('fb-stop') + '">Stop</button>';
    else if (can) h += '<button class="btn btn-primary" data-act="' + A('fb-ask') + '">Get Claude’s feedback</button>';
    if (!H.view().reveal) h += '<button class="btn" data-act="' + A('stage-reveal') + '">Show worked answer and checklist</button>';
    h += '</div>';
    if (!can) h += '<p class="note">Claude’s feedback appears when this page is open in Claude and you allow it to ask Claude. The worked answer and checklist always work.</p>';
    return h;
  }
  function paintStageParts() {
    if (H.screen() !== 'stage' || typeof document === 'undefined') return;
    const s = ST.get(H.view().stage); if (!s) return;
    const a = document.getElementById(I('actions')), f = document.getElementById(I('fb'));
    if (a) a.innerHTML = actionsHTML(s);
    if (f) f.innerHTML = fbPanelHTML(s);
  }
  function renderStage() {
    const V = H.view(), s = ST.get(V.stage); if (!s) { H.go('craft', {}); return; }
    const p = PK.get(s.packet), c = get(s), st = status(s);
    const prev = p.stages[s.n - 2], next = p.stages[s.n];
    let h = '<article class="card stagecard"><div class="qmeta"><span class="cchip kind">' + p.stageWord + ' ' + s.n + ' of ' + p.stages.length + '</span>' + draftChip(p) + '<span class="qid">' + s.id + '</span></div>' +
      '<h2 id="' + I('stage-h') + '" tabindex="-1">' + esc(s.title) + '</h2>' +
      '<p><b>Your task' + (s.parts.length > 1 ? ' (parts ' + s.parts.join(' and ') + ' of ' + p.taskList.length + ')' : ' (part ' + s.parts[0] + ' of ' + p.taskList.length + ')') + ':</b> ' + esc(s.task) + '</p>' +
      (s.brief && s.brief.length ? '<div class="pk">' + blocksHTML(p.lead) + sectionsHTML(briefSections(p, s), 'h3') + '</div>' :
        '<details class="more" data-pk' + (V.pkOpen ? ' open' : '') + '><summary>The packet: brief, data and notes</summary>' + packetHTML(p, 'h3') + '</details>');
    const lessons = (s.lessons || []).map(id => { const t = H.lessonTitle && H.lessonTitle(id); return t ? '<button class="btn btn-small" data-act="lesson" data-id="' + esc(id) + '" data-from="stage:' + s.id + '">' + esc(t) + '</button>' : ''; }).join('');
    if (lessons) h += '<div class="fbblock"><h3>Lessons on this</h3><div class="row">' + lessons + '</div></div>';
    h += '</article>';
    h += '<section class="answer"><label for="' + I('text') + '" class="eyebrow">Your answer</label><textarea id="' + I('text') + '" class="sk-answer" rows="14" maxlength="' + C.maxChars + '" spellcheck="true">' + esc(c.text || '') + '</textarea>' +
      '<p class="saved" id="' + I('saved') + '" role="status">' + savedText() + '</p></section>';
    h += '<div id="' + I('actions') + '" class="stackgap">' + actionsHTML(s) + '</div>';
    h += '<div id="' + I('fb') + '" class="stackgap">' + fbPanelHTML(s) + '</div>';
    if (V.reveal) {
      h += '<section aria-labelledby="' + I('wh') + '"><div class="section-h"><h2 id="' + I('wh') + '">Worked answer</h2><span class="hint">One answer that passes; yours can differ</span></div><article class="card"><div class="pk">' + sectionsHTML(s.model, 'h3') + '</div></article></section>' +
        '<section aria-labelledby="' + I('clh') + '"><div class="section-h"><h2 id="' + I('clh') + '">Checklist</h2><span class="hint">' + s.checklist.length + ' points</span></div><article class="card"><ol class="checklist">' + s.checklist.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>' +
        (s.optional.length ? '<div class="fbblock"><h3>Optional (does not affect the grade)</h3><ul class="plain">' + s.optional.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') + '</article>';
      if (st.k === 'draft' || st.k === 'self') h += '<div class="row"><button class="btn btn-small" data-act="' + A('stage-self') + '" aria-pressed="' + (st.k === 'self') + '">' + (st.k === 'self' ? 'Undo self-check' : 'I checked my answer against this list') + '</button></div>';
      h += '</section>';
    }
    h += '<div class="row">' + (prev ? '<button class="btn" data-act="' + A('stage') + '" data-id="' + prev.id + '">← ' + p.stageWord + ' ' + prev.n + '</button>' : '') +
      (next ? '<button class="btn" data-act="' + A('stage') + '" data-id="' + next.id + '">' + p.stageWord + ' ' + next.n + ' →</button>' : '') +
      '<button class="btn btn-quiet" data-act="' + A('packet') + '" data-id="' + p.id + '">Back to the packet</button></div>';
    H.paint(H.header(p.title, A('packet'), p.id, 'Back to the packet', s.n + '/' + p.stages.length) + '<main class="wrap">' + h + '</main>');
  }

  async function fbAsk() {
    const s = ST.get(H.view().stage), fn = H.sampler(); if (!s || !fn || FB.busy) return;
    const text = (get(s).text || '').trim();
    const say = msg => { FB = { busy: false, id: s.id, err: msg, ctrl: null }; paintStageParts(); };
    if (text.length < C.minChars) { say('Write your answer first.'); return; }
    const rounds = get(s).rounds, prev = rounds[rounds.length - 1] || null;
    if (prev && prev.text.trim() === text) { say('No changes since the last round, so the grades would be the same.'); return; }
    const prompt = gradePrompt(PK.get(s.packet), s, text, prev, C), ctrl = new AbortController();
    FB = { busy: true, id: s.id, err: '', ctrl }; paintStageParts();
    try {
      const opts = { cache: false, signal: ctrl.signal };
      if (C.modelTier) opts.modelTier = C.modelTier;
      let v;
      if (typeof fn.json === 'function') v = await fn.json(prompt, opts);
      else { const r = await fn(prompt, opts), t = String((r && r.text) || ''); v = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }
      const fb = parseFeedback(v, s.checklist.length);
      put(s, { rounds: get(s).rounds.concat([{ ts: Date.now(), text: text.slice(0, C.maxChars), fb }]).slice(-C.rounds) });
      FB = { busy: false, id: s.id, err: '', ctrl: null };
    } catch (e) {
      const code = e && e.code;
      let err;
      if (PERMANENT.indexOf(code) !== -1) { H.samplerGone(); err = ''; H.toast('Claude’s feedback is not available here. The worked answer still is.'); }
      else if (code === 'aborted' || code === 'cancelled' || (e && e.name === 'AbortError')) err = 'Stopped.';
      else err = code === 'bad_reply' || e instanceof SyntaxError ? 'The feedback came back in a form the app could not read. Try again.' : (ERR_COPY[code] || 'Feedback did not finish. Try again.');
      FB = { busy: false, id: s.id, err, ctrl: null };
    }
    paintStageParts();
  }

  function focusHeading() { if (typeof document === 'undefined') return; const h = document.getElementById(I('stage-h')); if (h) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } } }
  function openList() { fbStop(); H.go('craft', {}); return true; }
  function openPacket(id) { if (!PK.has(id)) return false; fbStop(); H.go('packet', { packet: id }); return true; }
  function openStage(id) { if (!ST.has(id)) return false; fbStop(); H.go('stage', { stage: id }); focusHeading(); return true; }
  const keepPkOpen = () => { if (typeof document === 'undefined') return; const d = document.querySelector('details[data-pk]'); H.view().pkOpen = !!(d && d.open); };

  const actions = {
    [A('craft')]() { openList(); },
    [A('packet')](el) { openPacket(el.dataset.id); },
    [A('stage')](el) { openStage(el.dataset.id); },
    [A('pk-key')]() { H.view().key = true; H.keepScroll(); },
    [A('copy-packet-link')](el) { const p = PK.get(el.dataset.id); if (p) H.copy(link('packet', p.id), 'Link copied.'); },
    [A('stage-reveal')]() { keepPkOpen(); H.view().reveal = true; H.keepScroll(); },
    [A('stage-self')]() {
      const s = ST.get(H.view().stage); if (!s) return;
      const c = get(s), t = (c.text || '').trim();
      if (!t) { H.toast('Write your answer first.'); return; }
      put(s, { self: c.self === selfMark(t) ? '' : selfMark(t) }); keepPkOpen(); H.keepScroll();
    },
    [A('fb-ask')]() { fbAsk(); },
    [A('fb-stop')]() { fbStop(); },
    [A('fb-reset')]() { const s = ST.get(H.view().stage); if (s) H.confirm('Clear feedback history?', 'Your answer is kept. The earlier rounds of feedback for this stage are removed.', 'Clear', () => { put(s, { rounds: [] }); FB.err = ''; paintStageParts(); }); }
  };
  // Typing updates the answer at once and saves 1.2 s after the last keystroke.
  let draftT = null;
  function onInput(e) {
    if (!e.target || e.target.id !== I('text') || H.screen() !== 'stage') return false;
    const s = ST.get(H.view().stage); if (!s) return false;
    const k = keyOf(s.id);
    store.set(k, Object.assign({ self: '', rounds: [] }, store.get(k), { text: e.target.value.slice(0, C.maxChars), ts: Date.now() }));
    clearTimeout(draftT); draftT = setTimeout(() => { store.touch(); paintSaved(); paintStageParts(); }, 1200);
    return true;
  }
  function onToggle(e) { if (e.target && e.target.matches && e.target.matches('details[data-pk]')) { H.view().pkOpen = e.target.open; return true; } return false; }
  function onPageHide() { if (Object.keys(store.all()).length) store.saveLocal(); }
  // Links: #craft, #packet-<slug>, #stage-<slug>, matched without regard to case.
  // The id may also be written with dots (#stage-cf-1.1); route() slugs it before matching.
  function link(kind, id) { return (H.linkBase || '') + '#' + kind + (id ? '-' + slug(id) : ''); }
  function route(hash) {
    const h = String(hash || '').replace(/^#/, '').toLowerCase();
    if (h === 'craft') return openList();
    let m;
    if ((m = /^packet-(.+)$/.exec(h))) { const p = PACKETS.find(x => slug(x.id) === slug(m[1])); return p ? openPacket(p.id) : false; }
    if ((m = /^stage-(.+)$/.exec(h))) { const s = Array.from(ST.values()).find(x => slug(x.id) === slug(m[1])); return s ? openStage(s.id) : false; }
    return false;
  }
  // Every id this engine publishes as a link target, for the app's published-ids.json.
  const linkIds = () => PACKETS.reduce((a, p) => a.concat([p.id], p.stages.map(s => s.id)), []);

  return {
    screens: { craft: renderList, packet: renderPacket, stage: renderStage },
    actions, onInput, onToggle, onPageHide, route, link, linkIds,
    start() { store.loadLocal(); },
    attach: (db, uid) => store.attach(db, uid),
    store, status, packetDone, get, put,
    stop: fbStop, _fb: () => FB
  };
}

module.exports = { create, slug, parseFeedback, gradePrompt, stageStatusOf, selfMark, blocksText, sectionsText, packetText, keyText, modelText, PERMANENT, ERR_COPY };
