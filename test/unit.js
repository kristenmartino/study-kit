// Node checks for the engines' pure parts: saving, the packet parser, the grader prompt, the run engine and the
// role-play prompts and scoring. No browser. Run: node test/unit.js
'use strict';
const fs = require('fs');
const path = require('path');
const { canonJSON, createStore } = require('../src/save.js');
const craft = require('../src/craft.js');
const sims = require('../src/sims.js');
const RP = require('../src/roleplay.js');
const { loadCraft } = require('../src/build/craft-parse.js');

let pass = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fails.push(m); console.log('FAIL', m); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
const root = path.join(__dirname, '..');

// ---------------------------------------------------------------- the database stand-in
// Returns fields with keys sorted at every depth, as the live database did on Nov 22, 2026, and counts writes.
function mockDb() {
  const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {}) : v;
  const docs = {}, sets = {}, refs = {};
  const mk = p => { const ls = []; const snap = () => ({ exists: !!docs[p], data: () => docs[p] ? JSON.parse(JSON.stringify(docs[p])) : undefined });
    return { set: async d => { sets[p] = (sets[p] || 0) + 1; docs[p] = sortKeys(JSON.parse(JSON.stringify(d))); setTimeout(() => ls.forEach(f => f(snap())), 5); }, onSnapshot: next => { ls.push(next); setTimeout(() => next(snap()), 10); return () => {}; } }; };
  return { docs, sets, doc: p => refs[p] || (refs[p] = mk(p)) };
}
const memStorage = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };

// The pre-fix comparison (plain JSON.stringify), kept here only as a control: the mock must catch it.
function oldStore(db, uid, delay) {
  let data = {}, ref = null, saving = false, dirty = false, timer = null;
  async function flush() { if (!ref || saving || !dirty) return; saving = true; dirty = false; await ref.set({ v: 1, ts: Date.now(), stages: JSON.parse(JSON.stringify(data)) }); saving = false; }
  ref = db.doc('data/users/' + uid + '/craft');
  ref.onSnapshot(snap => {
    const remote = snap.exists ? (snap.data() || {}).stages || {} : {};
    const out = Object.assign({}, data); for (const k in remote) if (!out[k] || (remote[k].ts || 0) > (out[k].ts || 0)) out[k] = remote[k]; data = out;
    if (JSON.stringify(data) !== JSON.stringify(remote) && Object.keys(data).length) { dirty = true; clearTimeout(timer); timer = setTimeout(flush, delay); }
  });
  return { put(k, v) { data[k] = v; dirty = true; clearTimeout(timer); timer = setTimeout(flush, delay); } };
}

(async () => {
  // ---------------------------------------------------------------- canonJSON
  ok(canonJSON({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }) === canonJSON({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }), 'canonJSON ignores key order at every depth');
  ok(canonJSON([1, 2]) !== canonJSON([2, 1]), 'canonJSON keeps array order');
  ok(canonJSON({ a: 1 }) !== canonJSON({ a: 2 }), 'canonJSON sees value changes');

  // ---------------------------------------------------------------- idle-write check
  {
    const db = mockDb();
    const st = createStore({ localKey: 'k', doc: 'craft', field: 'stages', storage: memStorage(), delayMs: 20, retryMs: 50 });
    st.attach(db, 'u1');
    await wait(30);
    st.put('dm-1-1', { text: 'An answer with fields in this order', ts: Date.now(), self: '', rounds: [] });
    await wait(300);
    const n1 = db.sets['data/users/u1/craft'] || 0;
    await wait(400);
    const n2 = db.sets['data/users/u1/craft'] || 0;
    ok(n1 >= 1, 'idle-write: the change was written (' + n1 + ')');
    ok(n2 === n1, 'idle-write: no further writes once idle (' + n1 + ' then ' + n2 + ')');
    ok(st.statusText() === 'Saved to your account', 'idle-write: status settles to saved (' + st.statusText() + ')');
  }
  {
    // Control: the same mock catches the old comparison, so the check above can fail.
    const db = mockDb();
    const st = oldStore(db, 'u2', 20);
    await wait(30);
    st.put('dm-1-1', { text: 'An answer with fields in this order', ts: Date.now(), self: '', rounds: [] });
    await wait(300);
    const n1 = db.sets['data/users/u2/craft'] || 0;
    await wait(400);
    const n2 = db.sets['data/users/u2/craft'] || 0;
    ok(n2 > n1, 'idle-write control: the pre-fix comparison keeps writing under this mock (' + n1 + ' then ' + n2 + ')');
  }
  {
    // Two devices: a remote entry merges in by ts and the newer local entry is written back once.
    const db = mockDb();
    db.docs['data/users/u3/sims'] = { v: 1, ts: 1, sims: { 'DP-1': { ts: 100, best: 2, last: 2 } } };
    const st = createStore({ localKey: 'k2', doc: 'sims', field: 'sims', storage: memStorage(), delayMs: 20 });
    st.loadLocal(); st.put('DR-1', { ts: 200, i: 1 });
    st.attach(db, 'u3');
    await wait(400);
    const d = db.docs['data/users/u3/sims'].sims;
    ok(d['DP-1'] && d['DP-1'].best === 2 && d['DR-1'] && d['DR-1'].i === 1, 'merge: both devices’ entries end up in the document');
    const n1 = db.sets['data/users/u3/sims']; await wait(300);
    ok(db.sets['data/users/u3/sims'] === n1, 'merge: no writes once settled');
  }
  {
    // A failed write retries, then stops after maxFails.
    let calls = 0;
    const db = { doc: () => ({ set: async () => { calls++; throw new Error('down'); }, onSnapshot: n => setTimeout(() => n({ exists: false }), 5) }) };
    const st = createStore({ localKey: 'k3', doc: 'craft', field: 'stages', storage: memStorage(), delayMs: 10, retryMs: 20, maxFails: 3 });
    st.attach(db, 'u4'); await wait(20); st.put('a', { ts: 1 });
    await wait(300);
    ok(calls === 3, 'retry: three attempts, then it stops (' + calls + ')');
    ok(st.statusText() === 'Saving to your account…', 'retry: status still shows unsaved');
  }

  // ---------------------------------------------------------------- packet parser
  const fx = path.join(__dirname, 'fixtures');
  const C = loadCraft(require(path.join(fx, 'craft-stages.js')), { dir: path.join(fx, 'craft'), idPrefix: 'DM' });
  ok(!C.errors.length, 'parser: fixtures load (' + C.errors.join('; ') + ')');
  ok(C.ids.join() === 'DM-1,DM-1.1,DM-1.2,DM-2,DM-2.1,DM-2.2', 'parser: ids ' + C.ids.join());
  const P1 = C.packets[0], P2 = C.packets[1];
  const tbl = P1.sections[0].blocks[0].table;
  ok(tbl && tbl.head.length === 5 && tbl.rows.length === 2, 'parser: five-column table');
  ok(P1.sections[1].blocks[0].quote === 'Every customer we lost asked for calendar sync.\n\nI want two-way sync shipped this quarter.', 'parser: a bare ">" is a blank line inside a quote');
  ok(P1.taskList.length === 2 && P1.planted.indexOf('one claim') === 0, 'parser: task list and planted line');
  ok(P2.stageWord === 'Item' && P2.stages[0].brief.join() === 'Draft A: Sprint Goal' && P2.stages[0].keyFor.join() === 'Draft A flaw', 'parser: set items keep their own brief and key');
  {
    const bad = loadCraft([{ id: 'DM-9', file: 'dm-1-lantern.md', stages: [{ id: 'DM-9.1', title: 't', parts: [1, 2], model: ['Stage 1'], checklist: ['a', 'b', 'c', 'd', 'e'] }] }], { dir: path.join(fx, 'craft'), idPrefix: 'DM', factsPoint: { token: 'FACTS', text: 'facts point' } });
    ok(bad.errors.some(e => /facts point/.test(e)), 'parser: factsPoint option requires the point');
    const tmp = path.join(require('os').tmpdir(), 'sk-bad.md');
    fs.writeFileSync(tmp, fs.readFileSync(path.join(fx, 'craft', 'dm-1-lantern.md'), 'utf8').replace('## Grading notes', '## Notes'));
    const b2 = loadCraft([{ id: 'DM-9', file: path.basename(tmp), stages: [] }], { dir: path.dirname(tmp), idPrefix: 'DM', strictParts: true });
    ok(b2.errors.some(e => /unknown part Notes/.test(e)) && b2.errors.some(e => /Grading notes/.test(e)), 'parser: strictParts refuses an unknown part');
    fs.writeFileSync(tmp, fs.readFileSync(path.join(fx, 'craft', 'dm-1-lantern.md'), 'utf8').replace('1. Sort', '3. Sort'));
    const b3 = loadCraft([{ id: 'DM-9', file: path.basename(tmp), stages: [] }], { dir: path.dirname(tmp), idPrefix: 'DM' });
    ok(b3.errors.some(e => /out of order/.test(e)), 'parser: numbered list out of order is an error');
    // Stages covering parts 1..10: the order check is numeric (a text sort put 10 before 2).
    const parts = Array.from({ length: 10 }, (_, k) => k + 1);
    fs.writeFileSync(tmp, fs.readFileSync(path.join(fx, 'craft', 'dm-1-lantern.md'), 'utf8').replace('1. Sort the evidence from the opinions and work out the renewal rate change.\n2. Recommend what to investigate first, with one question for Priya.', parts.map(n => n + '. Part ' + n).join('\n')));
    const b4 = loadCraft([{ id: 'DM-9', file: path.basename(tmp), stages: parts.map(n => ({ id: 'DM-9.' + n, title: 't' + n, parts: [n], model: ['Stage 1'], checklist: ['a', 'b', 'c', 'd', 'e'] })) }], { dir: path.dirname(tmp), idPrefix: 'DM' });
    ok(!b4.errors.some(e => /cover each task part/.test(e)), 'parser: ten task parts are checked in numeric order (' + b4.errors.join('; ') + ')');
  }

  // ---------------------------------------------------------------- grader prompt and feedback
  {
    const s = P1.stages[0];
    const q = craft.gradePrompt(P1, s, 'my answer', null, {});
    ok(q.indexOf('You grade a product management writing exercise') === 0, 'grader: default domain');
    ok(q.indexOf('about the company, product, people or data that the packet does not say') !== -1, 'grader: default facts subject');
    ok(/x5 in checklist order/.test(q) && /- Leave changed_mind empty\./.test(q), 'grader: checklist count and first-round rule');
    const prev = { text: 'old', fb: { items: [{ status: 'meets', rewrite: '' }, { status: 'partly', rewrite: 'X' }] } };
    const q2 = craft.gradePrompt(P1, s, 'new', prev, { domain: 'finance operations', factsSubject: 'its figures or its people' });
    ok(q2.indexOf('finance operations writing exercise') !== -1 && q2.indexOf('its figures or its people that the packet') !== -1, 'grader: domain and facts subject options');
    ok(q2.indexOf('or now advise against something you suggested before') !== -1 && q2.indexOf('2=partly (you suggested: X)') !== -1, 'grader: second-round rules and previous grades');
    const si = P2.stages[1], q3 = craft.gradePrompt(P2, si, 'a', null, {});
    ok(q3.indexOf('This is item 2 of 2: OKR. Only this item is shown below.') !== -1 && q3.indexOf('DRAFT A: SPRINT GOAL') === -1 && q3.indexOf('DRAFT B FLAW') !== -1 && q3.indexOf('DRAFT A FLAW') === -1, 'grader: a set item sees only its own draft and key');
    const fb = craft.parseFeedback({ items: [{ status: 'Meets', rewrite: 'x' }, { status: 'PARTLY' }, { status: '??' }] }, 5);
    ok(fb.items.map(i => i.status).join() === 'meets,partly,misses,misses,misses' && fb.items[0].rewrite === '' && fb.items[4].why === 'Not graded; ask again.', 'feedback: statuses normalized and padded to the checklist');
    let threw = null; try { craft.parseFeedback({}, 3); } catch (e) { threw = e; }
    ok(threw && threw.code === 'bad_reply', 'feedback: no items is bad_reply');
    const c = { text: 'abc', self: '', rounds: [{ text: 'abc', fb: { items: Array(5).fill({ status: 'meets' }) } }] };
    ok(craft.stageStatusOf(c, s).k === 'done', 'status: all met on the same text is done');
    ok(craft.stageStatusOf(Object.assign({}, c, { text: 'abcd' }), s).label === 'Edited since feedback', 'status: edited since feedback');
    ok(craft.stageStatusOf({ text: 'abc', self: craft.selfMark('abc'), rounds: [] }, s).k === 'self', 'status: self-checked');
    ok(craft.slug('CF-1.2') === 'cf-1-2', 'slug: CF-1.2 -> cf-1-2');
  }

  // ---------------------------------------------------------------- run engine
  {
    const f = require(path.join(fx, 'sims.js')), r = f.runs[0];
    let x = sims.runFresh(r);
    ok(r.meters.every(k => x.meters[k] === 70) && x.pv.planned === 10, 'run: fresh state');
    sims.runApply(r, x, 0);
    ok(x.meters.flow === 60 && x.meters.morale === 55 && x.flags.join() === 'overtime' && x.missed.join() === 'DR-1-01', 'run: a choice moves meters, sets a flag and records a miss');
    sims.runApply(r, x, 1);
    ok(x.picks['DR-1-01'] === 0, 'run: a step already answered is left alone');
    x.i = 1; sims.runApply(r, x, 0);
    ok(x.pv.actual === 7 && x.pv.planned === 10 && sims.runPred(x) === 70, 'run: business value and predictability (7 of 10 = 70%)');
    x = sims.runFresh(r); r.steps.forEach((s, i) => { x.i = i; sims.runApply(r, x, s.answer); }); x.i = r.steps.length;
    const e = sims.runEnding(r, x);
    ok(x.missed.length === 0 && e.avg === 76 && e.ending.title === 'A clean launch' && sims.runPred(x) === 100, 'run: keyed path ends at average 76, a clean launch, 100% (got ' + e.avg + ')');
    const m = sims.runFresh(r); m.meters.trust = 100; sims.runApply(r, Object.assign(m, { i: 2 }), 1);
    ok(m.meters.trust === 100, 'run: meters stay within 0 to 100');
  }

  // ---------------------------------------------------------------- role-play
  {
    const x = require(path.join(fx, 'sims.js')).roleplays[0];
    const turns = [{ role: 'them', text: x.opening }, { role: 'me', text: 'What does Harbor Co need the export for?' }];
    const base = RP.counterpartRules(x, { learner: 'Product Owner', plainText: false });
    ok(/\nYour walk-away limit: [^\n]+\nStay in character, reply in 1 to 4 sentences of natural speech, never coach the Product Owner or mention scoring\.$/.test(base), 'role-play: with no rules and no plain-text line the instructions are Inspect & Adapt’s wording');
    ok(RP.counterpartRules(x, {}).indexOf('as plain text, with no quotation marks around the reply and no speaker label, never coach') !== -1, 'role-play: plain-text line on by default');
    ok(RP.counterpartRules(x, {}).indexOf('Rules:') === -1, 'role-play: Critical Path’s three counterpart rules are off by default');
    const all = RP.counterpartRules(x, { learner: 'project manager', rules: ['guarded', 'noCoaching', 'noUnpromptedOffer'] });
    // Critical Path's rules sentence (build/template.html at 9fb1d70, rpSystem), copied:
    const cp = 'Rules: a blunt, dismissive or hostile question is not earning a fact; answer it guardedly and reveal nothing private until the project manager shows respect, acknowledges your position or makes a fair offer. Never tell the project manager what to ask, propose or do next, never list example questions or name the kinds of question you would answer, and never suggest the solution yourself. Never improve your own offer or position unless the project manager asks you to or makes a counter-offer. Stay in character, reply in 1-4 sentences of natural speech as plain text, with no quotation marks around the reply and no speaker label, never coach the project manager or mention scoring.';
    ok(all.indexOf(cp.replace('1-4', '1 to 4')) !== -1, 'role-play: all three rules on reproduce Critical Path’s rules sentence (apart from "1-4" written "1 to 4")');
    ok(all.indexOf('Role-play for a project manager\'s interview practice.') === 0, 'role-play: learner label');
    const cpOne = RP.counterpartRules(x, { rules: ['noCoaching'] });
    ok(cpOne.indexOf('\nRules: Never tell the Product Owner') !== -1, 'role-play: a single rule turns on alone');
    const pr = RP.counterpartPrompt(x, turns, {});
    ok(/Conversation so far:\nYou: I need the custom export[^\n]*\nProduct Owner: What does Harbor Co need/.test(pr) && /Reply as yourself with your next line only\.$/.test(pr), 'role-play: conversation block');
    // rpClean cases (Critical Path's five unit checks, rebuilt)
    const cl = [['"Fine. Monthly works."', 'Fine. Monthly works.'], ['“Fine.”', 'Fine.'], ['You: Fine.', 'Fine.'], ['Counterpart: "Fine."', 'Fine.'], ['She said "fine" to me.', 'She said "fine" to me.']];
    ok(cl.every(([a, b]) => RP.cleanReply(a) === b), 'role-play: cleanReply strips one label and one pair of wrapping quotes only');
    const sp = RP.scorePrompt(x, turns, {});
    ok(sp.indexOf('"uncovered": ["<private facts the Product Owner actually drew out>"]') !== -1 && sp.indexOf('(true only if') === -1, 'score prompt: base shape is Inspect & Adapt’s');
    const sq = RP.scorePrompt(x, turns, { scoring: ['outcomeAgreesWithScore', 'verifiedQuotes'] });
    ok(sq.indexOf('(true only if the transcript ends at or near the strong resolution)') !== -1 && sq.indexOf('"quote": "<the counterpart\'s own words stating it') !== -1, 'score prompt: options add Critical Path’s wording');
    const said = [{ role: 'them', text: 'Honestly, they only need the data once a month.' }, { role: 'me', text: 'Your quarter closes on the 28th, right?' }];
    const v = RP.verifyUncovered([
      { fact: 'Monthly', quote: 'only need the data once a month' },
      { fact: 'Curly', quote: 'they only need the data once a month' },
      { fact: 'From PM', quote: 'quarter closes on the 28th' },
      { fact: 'Invented', quote: 'we have a board meeting' },
      'bare string'
    ], said);
    ok(v.length === 2 && /^Monthly/.test(v[0]) && /^Curly/.test(v[1]), 'role-play: verified quotes keep only the counterpart’s own words (' + v.join(' | ') + ')');
    const raw = { points: [{ point: 'a', score: 4 }, { point: 'b', score: 4 }, { point: 'c', score: 3 }, { point: 'd', score: 4 }], overall: 3, reached: true, uncovered: ['x'], tip: 't' };
    const r1 = RP.readScore(raw, said, {});
    ok(r1.overall === 3 && r1.reached && r1.uncovered.join() === 'x', 'score: default keeps Claude’s overall and reached');
    ok(RP.readScore(raw, said, { overall: 'mean' }).overall === 4, 'score: overall "mean" gives the rounded mean of the points (3.75 -> 4)');
    ok(!RP.readScore(Object.assign({}, raw, { overall: 2 }), said, { scoring: ['outcomeAgreesWithScore'] }).reached && RP.readScore(Object.assign({}, raw, { overall: 2 }), said, {}).reached, 'score: outcomeAgreesWithScore hides "reached" under 3');
    ok(RP.readScore({ points: [{ score: 9 }, { score: -2 }], overall: 'x' }, said, {}).points.map(p => p.score).join() === '4,1', 'score: points clamped to 1-4');
  }

  // ---------------------------------------------------------------- dist is current
  {
    const before = fs.readFileSync(path.join(root, 'dist', 'study-kit.js'), 'utf8');
    require('child_process').execFileSync(process.execPath, [path.join(root, 'tools', 'bundle.js')]);
    ok(fs.readFileSync(path.join(root, 'dist', 'study-kit.js'), 'utf8') === before, 'dist/study-kit.js matches the sources');
    ok(before.indexOf('study-kit ' + require('../package.json').version + ' ') !== -1, 'dist carries the package version');
  }

  console.log(pass + ' passed, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
