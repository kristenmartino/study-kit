// Cross-checks study-kit against the apps it was taken from, using their own built pages and sources.
// Not part of `npm test` (it needs the sibling repos and their builds). Run from a folder holding the clones:
//   node study-kit/tools/crosscheck.js <inspect-adapt> <ia build/index.html> <going-concern> <gc built index.html> <critical-path>
// Prints one line per check and exits 1 on any mismatch.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/npm-tools/node_modules/playwright'); } })();
const craft = require('../src/craft.js');
const RP = require('../src/roleplay.js');
const { loadCraft } = require('../src/build/craft-parse.js');
const [IA, IAPAGE, GC, GCPAGE, CP] = process.argv.slice(2).map(p => path.resolve(p));
let bad = 0;
const line = (good, msg) => { if (!good) bad++; console.log((good ? 'SAME ' : 'DIFF ') + msg); };

function firstDiff(a, b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i === a.length && i === b.length ? null : { at: i, a: a.slice(Math.max(0, i - 60), i + 120), b: b.slice(Math.max(0, i - 60), i + 120) }; }

(async () => {
  // 1. Packet parser: study-kit's loadCraft against Inspect & Adapt's craft-build.js, on all its packets.
  {
    const errs = [];
    const lids = new Set(require(path.join(IA, 'craft-stages.js')).flatMap(d => d.stages.flatMap(s => s.lessons || [])));
    const theirs = require(path.join(IA, 'craft-build.js'))(IA, lids, new Set(), errs);
    const ours = loadCraft(require(path.join(IA, 'craft-stages.js')), { dir: path.join(IA, 'craft'), idPrefix: 'CF', lessonIds: lids });
    line(!errs.length && !ours.errors.length && JSON.stringify(theirs.packets) === JSON.stringify(ours.packets) && theirs.ids.join() === ours.ids.join(),
      'parser vs Inspect & Adapt craft-build.js: ' + ours.packets.length + ' packets, ' + ours.ids.length + ' ids');
  }
  // 2. Same, against Going Concern's Python parser output in its built bank, with Going Concern's options.
  let gcPackets = null;
  {
    const d = JSON.parse(fs.readFileSync(path.join(GC, 'drafts', 'craft', 'stages.json'), 'utf8'));
    const FACTS = 'Every fact stated about the company, its figures or its people traces to the packet or is labelled an assumption';
    const ours = loadCraft(d.packets, { dir: path.join(GC, 'drafts', 'craft'), idPrefix: 'FX', factsPoint: { token: 'FACTS', text: FACTS }, strictParts: true });
    const py = JSON.parse(require('child_process').execFileSync('python3', ['-I', '-c', 'import sys,json,importlib.util;s=importlib.util.spec_from_file_location("b",sys.argv[1]+"/tools/build_craft.py");m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.build(sys.argv[1])))', GC]).toString());
    gcPackets = py.packets;
    // Going Concern's packets carry no stageWord, lessons, brief or keyFor; study-kit adds them with empty defaults.
    const strip = ps => JSON.parse(JSON.stringify(ps, (k, v) => ['stageWord', 'lessons', 'brief', 'keyFor'].indexOf(k) !== -1 ? undefined : v));
    line(!ours.errors.length && JSON.stringify(strip(ours.packets)) === JSON.stringify(strip(py.packets)),
      'parser vs Going Concern build_craft.py: ' + ours.packets.length + ' packet, ' + ours.ids.length + ' ids (after dropping the fields study-kit adds: stageWord, lessons, brief, keyFor)' + (ours.errors.length ? ' errors: ' + ours.errors.join('; ') : ''));
  }

  const browser = await chromium.launch();
  // Both apps wrap their code in one function, so a copy of the page gets a line before its end that hands the
  // functions under test to window.__x. The page itself is not changed.
  const open = async (file, expose) => {
    const src = fs.readFileSync(file, 'utf8'), at = src.lastIndexOf('})();');
    const tmp = path.join(require('os').tmpdir(), 'sk-cross-' + path.basename(path.dirname(file)) + '.html');
    fs.writeFileSync(tmp, src.slice(0, at) + 'window.__x = ' + expose + ';\n' + src.slice(at));
    const ctx = await browser.newContext(); await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    const p = await ctx.newPage(); await p.goto('file://' + tmp); await p.waitForFunction(() => !!window.__x); return p;
  };

  // 3. Grader prompt: Inspect & Adapt's fbPrompt in its own page, against study-kit's gradePrompt, every stage,
  //    first round and a second round.
  {
    const page = await open(IAPAGE, '{ BANK, fbPrompt, STBYID, rpPrompt, rpScorePrompt, setRP: v => { RP = v; } }');
    const res = await page.evaluate(() => {
      const { BANK, fbPrompt, STBYID } = window.__x, out = [];
      const prevFor = s => ({ text: 'An earlier draft.', fb: { items: s.checklist.map((_, i) => ({ status: i % 3 === 0 ? 'meets' : i % 3 === 1 ? 'partly' : 'misses', rewrite: i % 3 ? 'Rewrite ' + i : '' })) } });
      for (const p of BANK.craft) for (const s of p.stages) {
        const st = STBYID.get(s.id);
        out.push({ id: s.id, a: fbPrompt(st, 'A learner answer.', null), b: fbPrompt(st, 'A learner answer.', prevFor(st)) });
      }
      return { out, bank: BANK.craft };
    });
    let same = 0; const diffs = [];
    for (const r of res.out) {
      const p = res.bank.find(x => x.stages.some(s => s.id === r.id)), s = p.stages.find(x => x.id === r.id);
      const prev = { text: 'An earlier draft.', fb: { items: s.checklist.map((_, i) => ({ status: i % 3 === 0 ? 'meets' : i % 3 === 1 ? 'partly' : 'misses', rewrite: i % 3 ? 'Rewrite ' + i : '' })) } };
      const a = craft.gradePrompt(p, s, 'A learner answer.', null, {}), b = craft.gradePrompt(p, s, 'A learner answer.', prev, {});
      if (a === r.a && b === r.b) same++; else diffs.push(r.id + ' ' + JSON.stringify(firstDiff(a === r.a ? b : a, a === r.a ? r.b : r.a)));
    }
    line(same === res.out.length, 'grader prompt vs Inspect & Adapt fbPrompt: ' + same + ' of ' + res.out.length + ' stages identical, rounds 1 and 2' + (diffs.length ? '\n  ' + diffs.slice(0, 3).join('\n  ') : ''));
    // 3b. Role-play counterpart and score prompts against Inspect & Adapt's rpPrompt / rpScorePrompt.
    const rp = await page.evaluate(() => window.__x.BANK.roleplays.map(x => { const { rpPrompt, rpScorePrompt } = window.__x; window.__x.setRP({ turns: [{ role: 'them', text: x.opening }, { role: 'me', text: 'What is driving the date?' }], busy: false, err: '', score: null }); return { x, a: rpPrompt(x), b: rpScorePrompt(x) }; }));
    let rs = 0; const rd = [];
    for (const r of rp) {
      const turns = [{ role: 'them', text: r.x.opening }, { role: 'me', text: 'What is driving the date?' }];
      const a = RP.counterpartPrompt(r.x, turns, { learner: 'Product Owner', plainText: false }), b = RP.scorePrompt(r.x, turns, { learner: 'Product Owner' });
      if (a === r.a && b === r.b) rs++; else rd.push(r.x.id + ' ' + JSON.stringify(firstDiff(a === r.a ? b : a, a === r.a ? r.b : r.a)));
    }
    line(rs === rp.length, 'role-play prompts vs Inspect & Adapt rpPrompt and rpScorePrompt (plain-text line off): ' + rs + ' of ' + rp.length + ' identical' + (rd.length ? '\n  ' + rd.join('\n  ') : ''));
  }

  // 4. Grader prompt against Going Concern's port, with its wording options. Expected: one difference, the clause
  //    "or now advise against something you suggested before", which Going Concern's port does not have.
  {
    const page = await open(GCPAGE, '{ CRAFT_LIST, FXS, fxPrompt }');
    const res = await page.evaluate(() => { const { CRAFT_LIST, FXS, fxPrompt } = window.__x; return CRAFT_LIST.flatMap(p => p.stages.map(s => {
      const st = FXS.get(s.id), prev = { text: 'An earlier draft.', fb: { items: s.checklist.map((_, i) => ({ status: i % 2 ? 'partly' : 'meets', rewrite: i % 2 ? 'Rewrite ' + i : '' })) } };
      return { id: s.id, a: fxPrompt(st, 'A learner answer.', null), b: fxPrompt(st, 'A learner answer.', prev) };
    })); });
    let same1 = 0, same2 = 0, sameMinus = 0;
    for (const r of res) {
      const p = gcPackets.find(x => x.stages.some(s => s.id === r.id)), s = p.stages.find(x => x.id === r.id);
      const prev = { text: 'An earlier draft.', fb: { items: s.checklist.map((_, i) => ({ status: i % 2 ? 'partly' : 'meets', rewrite: i % 2 ? 'Rewrite ' + i : '' })) } };
      const cfg = { domain: 'finance operations', factsSubject: 'its figures or its people' };
      const a = craft.gradePrompt(Object.assign({ stageWord: 'Stage' }, p), Object.assign({ brief: [], keyFor: [] }, s), 'A learner answer.', null, cfg);
      const b = craft.gradePrompt(Object.assign({ stageWord: 'Stage' }, p), Object.assign({ brief: [], keyFor: [] }, s), 'A learner answer.', prev, cfg);
      if (a === r.a) same1++;
      if (b === r.b) same2++;
      if (b.replace(', or now advise against something you suggested before,', ',') === r.b) sameMinus++;
    }
    line(same1 === res.length, 'grader prompt vs Going Concern fxPrompt, round 1: ' + same1 + ' of ' + res.length + ' identical');
    line(sameMinus === res.length, 'grader prompt vs Going Concern fxPrompt, round 2: ' + same2 + ' of ' + res.length + ' identical; ' + sameMinus + ' of ' + res.length + ' identical once the "advise against" clause is removed');
  }
  await browser.close();

  // 5. Critical Path: rpSystem, rpClean and rpVerified, read from build/template.html and run here.
  {
    const t = fs.readFileSync(path.join(CP, 'build', 'template.html'), 'utf8');
    const grab = n => { const m = t.match(new RegExp('function ' + n + '\\([^)]*\\) \\{[^\\n]*\\}\\n')); return m ? m[0] : null; };
    const env = new Function(grab('rpSystem') + grab('rpClean') + grab('rpNorm') + grab('rpVerified') + 'return { rpSystem, rpClean, rpVerified };')();
    const rps = JSON.parse(fs.readFileSync(path.join(CP, 'items', 'roleplay.json'), 'utf8'));
    const list = Array.isArray(rps) ? rps : rps.roleplays || rps.items;
    let same = 0, onlyDash = 0;
    for (const x of list) {
      const a = env.rpSystem(x), b = RP.counterpartRules(x, { learner: 'project manager', rules: ['guarded', 'noCoaching', 'noUnpromptedOffer'] });
      if (a === b) same++;
      if (a.replace('1-4 sentences', '1 to 4 sentences') === b) onlyDash++;
    }
    line(onlyDash === list.length, 'counterpart rules (all three on) vs Critical Path rpSystem: ' + same + ' of ' + list.length + ' identical; ' + onlyDash + ' of ' + list.length + ' identical apart from "1-4" written "1 to 4"');
    const cases = ['"Fine."', '“Fine.”', 'You: Fine.', 'Counterpart: "Fine."', 'She said "fine".', '  "a" and "b"  '];
    line(cases.every(c => env.rpClean(c) === RP.cleanReply(c)), 'cleanReply vs Critical Path rpClean on ' + cases.length + ' cases');
    const turnsCP = [{ role: 'assistant', content: 'We only need the data once a month.' }, { role: 'user', content: 'Your quarter closes on the 28th.' }];
    const turnsK = [{ role: 'them', text: 'We only need the data once a month.' }, { role: 'me', text: 'Your quarter closes on the 28th.' }];
    const u = [{ fact: 'A', quote: 'only need the data once a month' }, { fact: 'B', quote: 'quarter closes on the 28th' }, { fact: 'C', quote: 'short' }, 'x'];
    line(JSON.stringify(env.rpVerified(u, turnsCP)) === JSON.stringify(RP.verifyUncovered(u, turnsK)), 'verifyUncovered vs Critical Path rpVerified');
  }
  console.log(bad ? bad + ' MISMATCHES' : 'ALL SAME');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
