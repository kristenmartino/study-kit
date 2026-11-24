// Click-tests build/demo.html (the reference host on the fixtures) in headless Chrome at 360, 390 and 414 px, in
// light and dark: no horizontal overflow on any engine screen, no page errors, the grading and role-play flows with
// a stand-in for Claude, and the idle-write check against a database stand-in that sorts keys like the server.
// Run: node tools/bundle.js && node tools/demo.js && node test/page.js
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/npm-tools/node_modules/playwright'); } })();
const { overflow, shell, WIDTHS, SCHEMES } = require('./widths.js');

const SCRATCH = process.env.SCRATCH || require('os').tmpdir();
const file = path.join(SCRATCH, 'study-kit-demo.html');
fs.writeFileSync(file, shell(fs.readFileSync(path.join(__dirname, '..', 'build', 'demo.html'), 'utf8')));
const URL = 'file://' + file;

let pass = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fails.push(m); console.log('FAIL', m); } }

// A stand-in for Claude: grader replies, counterpart lines and a score.
const SAMPLER = () => {
  const calls = []; window.__calls = calls;
  const json = async (p) => {
    calls.push(p);
    if (/^Score a /.test(p)) return { points: [{ point: 'Asks first', score: 4, comment: 'Asked what Harbor Co needs.' }, { point: 'People', score: 3, comment: 'Stayed friendly.' }, { point: 'Options', score: 3, comment: 'Offered a monthly export.' }, { point: 'Confirms', score: 2, comment: 'Did not confirm in writing.' }], overall: 3, reached: true, uncovered: ['They only need it monthly'], tip: 'Confirm the agreement in writing.' };
    const n = (/x(\d+) in checklist order/.exec(p) || [])[1] | 0;
    return { items: Array.from({ length: n }, (_, i) => i === 1 ? { status: 'partly', why: 'Names the claim but not the 12 accounts.', rewrite: 'Priya’s “every customer” is an opinion: 12 of 65 lost accounts never logged in after month two.' } : { status: 'meets', why: 'Clear.' }), works: 'The arithmetic is right.', optional: '', changed_mind: '' };
  };
  const fn = async (p) => { calls.push(p); return { text: '"They really only need the numbers once a month, if I\'m honest."' }; };
  fn.json = json;
  window.claude = { use: async n => n === 'sample' ? fn : null };
};

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const newPage = async (opts, init) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, opts));
    await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage(); page.setDefaultTimeout(6000);
    page.on('pageerror', e => errs.push(String(e)));
    // The artifact frame refuses native dialogs, so a native one here is a bug: dismiss it and fail.
    page.on('dialog', d => { errs.push('native ' + d.type() + ' dialog: ' + d.message()); d.dismiss(); });
    return { ctx, page };
  };
  const act = (page, name, id) => page.locator('[data-act="' + name + '"]' + (id ? '[data-id="' + id + '"]' : '')).first().click();
  const fit = async (page, label) => { const r = await overflow(page); ok(r.ok, label + ': horizontal overflow ' + JSON.stringify(r)); };

  // ---- 1. every engine screen at three widths, in both themes, with the stand-in for Claude
  for (const scheme of SCHEMES) {
    for (const w of WIDTHS) {
      const L = w + ' ' + scheme;
      const { ctx, page } = await newPage({ viewport: { width: w, height: 800 }, colorScheme: scheme }, SAMPLER);
      await page.goto(URL + '#craft'); await page.waitForSelector('[data-act="packet"]');
      await fit(page, L + ' craft list');
      await act(page, 'packet', 'DM-1'); await page.waitForSelector('.strow');
      await fit(page, L + ' packet');
      ok(await page.locator('.srows .srow').count() === 2, L + ': five-column table shown as stacked rows');
      await act(page, 'pk-key'); await page.waitForSelector('.pk h3:has-text("What a strong hand-back does")');
      await fit(page, L + ' packet key');
      await act(page, 'stage', 'DM-1.1'); await page.waitForSelector('#craft-text');
      ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'craft-stage-h', L + ': stage heading takes focus');
      await page.locator('details[data-pk] summary').click();
      await fit(page, L + ' stage with packet open');
      await page.locator('#craft-text').fill('Data: the renewal table. Opinion: Priya. Renewal fell from 85.0% to 75.0%, a 10.0 point drop.');
      await page.waitForSelector('#craft-saved:has-text("Saved")');
      await page.waitForTimeout(1400);
      await act(page, 'fb-ask'); await page.waitForSelector('.fbx .fblist');
      ok(await page.locator('.fblist li.partly .fbrw').count() === 1 && /4 of 5 checklist points met/.test(await page.locator('.fbx').textContent()), L + ': feedback panel shows 4 of 5 with one Change to line');
      await fit(page, L + ' stage feedback');
      await page.locator('[data-act$="fb-reset"]').click(); await page.waitForSelector('.cfm');
      ok(await page.locator('.cfm').getAttribute('role') === 'alertdialog' && await page.evaluate(() => document.activeElement.dataset.cfm) === 'cancel', L + ': clear-feedback asks in an in-page dialog, focus on Cancel');
      await fit(page, L + ' confirm dialog');
      await page.keyboard.press('Escape');
      ok(await page.locator('.cfm').count() === 0 && await page.locator('.fbx .fblist').count() === 1, L + ': Escape cancels and keeps the feedback');
      await page.locator('[data-act$="fb-reset"]').click(); await page.locator('[data-cfm="ok"]').click();
      ok(await page.locator('.cfm').count() === 0 && await page.locator('.fbx .fblist').count() === 0, L + ': OK clears the feedback history');
      await act(page, 'fb-ask'); await page.waitForSelector('.fbx .fblist');
      await act(page, 'stage-reveal'); await page.waitForSelector('ol.checklist');
      ok(await page.locator('details[data-pk][open]').count() === 1, L + ': packet fold-out stays open after reveal');
      await fit(page, L + ' stage revealed');
      await act(page, 'packet', 'DM-1'); await page.waitForSelector('.strow');
      ok(/Feedback: 4 of 5/.test(await page.locator('.strow').first().textContent()), L + ': stage row shows the feedback chip');
      await page.goto(URL + '#stage-dm-2-1'); await page.waitForSelector('#craft-text');
      ok(await page.locator('details[data-pk]').count() === 0 && /Finish tickets 101 to 140/.test(await page.locator('.stagecard').textContent()) && !/work hard/.test(await page.locator('.stagecard').textContent()), L + ': a set item shows only its own draft');
      await fit(page, L + ' set item');
      await page.goto(URL + '#run-dr-1'); await page.waitForSelector('.opts');
      await fit(page, L + ' run step');
      for (let k = 0; k < 3; k++) {
        await page.locator('[data-act="run-pick"][data-j="' + (k === 0 ? 0 : 1) + '"]').click(); await page.waitForSelector('.fb');
        if (k === 0) { await fit(page, L + ' run feedback'); ok(/comes back later/.test(await page.locator('.fb').textContent()), L + ': flagged choice says it comes back'); }
        await act(page, 'run-next'); await page.waitForSelector(k < 2 ? '.opts' : '.fbblock');
        if (k === 0) ok(/Knock-on:/.test(await page.locator('.card').first().textContent()), L + ': knock-on shown after the flag');
      }
      await fit(page, L + ' run ending');
      ok(/Predictability/.test(await page.locator('main').textContent()) && await page.locator('ol.checklist li').count() === 1, L + ': ending with one lesson to revisit');
      await page.goto(URL + '#rp-dp-1'); await page.waitForSelector('#rp-input');
      await page.locator('#rp-input').fill('What does Harbor Co need the export for?');
      await act(page, 'rp-say'); await page.waitForSelector('.bubble.them >> nth=1');
      ok((await page.locator('.bubble.them').nth(1).textContent()).indexOf('"') === -1, L + ': counterpart reply shown without wrapping quotes');
      await fit(page, L + ' role-play chat');
      await act(page, 'rp-end'); await page.waitForSelector('.fbx .fblist');
      ok(/3 of 4 · good outcome reached/.test(await page.locator('.fbx').textContent()), L + ': role-play score shown');
      await fit(page, L + ' role-play score');
      await ctx.close();
    }
  }

  // ---- 1b. links written with the id's own dots and case reach the same screens (v0.2.1)
  {
    const { ctx, page } = await newPage({ viewport: { width: 360, height: 800 } });
    await page.goto(URL + '#stage-DM-1.2'); await page.waitForSelector('#craft-text');
    const h1 = await page.locator('#craft-stage-h').textContent();
    await page.goto(URL + '#craft'); await page.waitForSelector('.strow, details, h2');
    await page.goto(URL + '#stage-dm-1-2'); await page.waitForSelector('#craft-text');
    const h2 = await page.locator('#craft-stage-h').textContent();
    ok(h1 === h2 && h1.length > 0, 'route: #stage-DM-1.2 opens the same stage as #stage-dm-1-2');
    await page.goto(URL + '#packet-DM-1'); await page.waitForSelector('.strow');
    ok(await page.locator('.strow').count() > 0, 'route: #packet-DM-1 opens the packet');
    await ctx.close();
  }

  // ---- 2. without Claude: worked answer and spoken role-play practice still work
  {
    const { ctx, page } = await newPage({ viewport: { width: 360, height: 800 } });
    await page.goto(URL + '#stage-dm-1-2'); await page.waitForSelector('#craft-text');
    ok(await page.locator('[data-act="fb-ask"]').count() === 0 && /appears when this page is open in Claude/.test(await page.locator('#craft-actions').textContent()), 'no Claude: no feedback button, note shown');
    await page.locator('#craft-text').fill('Investigate the 12 inactive accounts first.');
    await page.waitForTimeout(1400);
    await act(page, 'stage-reveal'); await page.waitForSelector('ol.checklist');
    await act(page, 'stage-self'); await page.waitForSelector('[data-act="stage-self"][aria-pressed="true"]');
    await act(page, 'packet', 'DM-1'); await page.waitForSelector('.strow');
    ok(/Self-checked/.test(await page.locator('.strow').nth(1).textContent()), 'no Claude: self-check marks the stage');
    await page.goto(URL + '#rp-dp-1'); await page.waitForSelector('.fbblock');
    ok(/opens with/.test(await page.locator('main').textContent()) && await page.locator('#rp-input').count() === 0, 'no Claude: role-play shows the opening line and rubric');
    await fit(page, '360 role-play without Claude');
    await page.reload(); await page.goto(URL + '#craft'); await page.waitForSelector('[data-act="packet"]');
    ok(/1 of 2 stages done/.test(await page.locator('.trow').first().textContent()), 'no Claude: progress survives a reload (localStorage)');
    await ctx.close();
  }

  // ---- 3. saving settles: no writes while idle, against a database that returns keys sorted
  {
    const { ctx, page } = await newPage({}, () => {
      const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {}) : v;
      const docs = {}, sets = {}; window.__docs = docs; window.__sets = sets;
      const mkRef = p => { const ls = []; const snap = () => ({ exists: !!docs[p], data: () => docs[p] ? JSON.parse(JSON.stringify(docs[p])) : undefined });
        return { set: async d => { sets[p] = (sets[p] || 0) + 1; docs[p] = sortKeys(JSON.parse(JSON.stringify(d))); setTimeout(() => ls.forEach(f => f(snap())), 5); }, onSnapshot: next => { ls.push(next); setTimeout(() => next(snap()), 30); return () => {}; } }; };
      const refs = {}, db = { doc: p => refs[p] || (refs[p] = mkRef(p)) };
      window.claude = { use: async n => n === 'db' ? db : n === 'user' ? { id: async () => 'u_loop' } : null };
    });
    await page.goto(URL + '#stage-dm-1-1'); await page.waitForSelector('#craft-text');
    await page.locator('#craft-text').fill('Renewal fell from 85.0% to 75.0%.');
    await page.goto(URL + '#run-dr-1'); await page.waitForSelector('.opts');
    await page.locator('[data-act="run-pick"][data-j="1"]').click();
    await page.waitForTimeout(5000);
    const n = await page.evaluate(() => ({ craft: window.__sets['data/users/u_loop/craft'] || 0, sims: window.__sets['data/users/u_loop/sims'] || 0 }));
    await page.waitForTimeout(3000);
    const n2 = await page.evaluate(() => ({ craft: window.__sets['data/users/u_loop/craft'] || 0, sims: window.__sets['data/users/u_loop/sims'] || 0 }));
    ok(n.craft >= 1 && n.sims >= 1, 'idle-write: both documents were written (' + JSON.stringify(n) + ')');
    ok(n2.craft === n.craft && n2.sims === n.sims, 'idle-write: no further writes once idle (' + JSON.stringify(n) + ' then ' + JSON.stringify(n2) + ')');
    const d = await page.evaluate(() => window.__docs['data/users/u_loop/craft']);
    ok(d && d.stages && d.stages['dm-1-1'] && /85\.0%/.test(d.stages['dm-1-1'].text), 'idle-write: the answer is in the craft document under its slug key');
    await ctx.close();
  }

  // ---- 3b. an answer that arrives from the account after its stage is open is shown, and typing cannot replace it
  //          unseen (v0.2.2; found migrating Going Concern, Nov 24: an empty box, and one keystroke replaced the answer)
  {
    const { ctx, page } = await newPage({}, () => {
      const saved = { v: 1, ts: 5, stages: { 'dm-1-2': { text: 'SAVED ON ANOTHER DEVICE: investigate the 12 inactive accounts.', ts: 5, self: '', rounds: [{ ts: 5, text: 'SAVED ON ANOTHER DEVICE: investigate the 12 inactive accounts.', fb: { items: [{ status: 'meets', why: '', rewrite: '' }, { status: 'partly', why: '', rewrite: 'Name the owner.' }, { status: 'meets', why: '', rewrite: '' }, { status: 'meets', why: '', rewrite: '' }, { status: 'meets', why: '', rewrite: '' }], works: '', optional: '', changed_mind: '' } }] } } };
      const docs = { 'data/users/u_late/craft': saved };
      window.__release = null;
      const mkRef = p => { const ls = []; const snap = () => ({ exists: !!docs[p], data: () => docs[p] ? JSON.parse(JSON.stringify(docs[p])) : undefined });
        return { set: async d => { docs[p] = JSON.parse(JSON.stringify(d)); }, onSnapshot: next => { ls.push(next); if (/craft$/.test(p)) window.__release = () => next(snap()); else setTimeout(() => next(snap()), 30); return () => {}; } }; };
      const refs = {}, db = { doc: p => refs[p] || (refs[p] = mkRef(p)) };
      window.claude = { use: async n => n === 'db' ? db : n === 'user' ? { id: async () => 'u_late' } : null };
    });
    await page.goto(URL + '#stage-dm-1-2'); await page.waitForSelector('#craft-text');
    await page.waitForFunction(() => typeof window.__release === 'function');
    ok((await page.locator('#craft-text').inputValue()) === '', 'late data: the stage opens before the account answers');
    await page.evaluate(() => window.__release()); await page.waitForTimeout(200);
    ok(/SAVED ON ANOTHER DEVICE/.test(await page.locator('#craft-text').inputValue()) && await page.locator('.fbx').count() === 1, 'late data: the saved answer and its feedback appear when they arrive');
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage({}, () => {
      const docs = { 'data/users/u_late2/craft': { v: 1, ts: 5, stages: { 'dm-1-2': { text: 'SAVED ON ANOTHER DEVICE.', ts: 5, self: '', rounds: [] } } } };
      window.__release = null;
      const mkRef = p => { const ls = []; const snap = () => ({ exists: !!docs[p], data: () => docs[p] ? JSON.parse(JSON.stringify(docs[p])) : undefined });
        return { set: async d => { docs[p] = JSON.parse(JSON.stringify(d)); }, onSnapshot: next => { ls.push(next); if (/craft$/.test(p)) window.__release = () => next(snap()); else setTimeout(() => next(snap()), 30); return () => {}; } }; };
      const refs = {}, db = { doc: p => refs[p] || (refs[p] = mkRef(p)) };
      window.claude = { use: async n => n === 'db' ? db : n === 'user' ? { id: async () => 'u_late2' } : null };
    });
    await page.goto(URL + '#stage-dm-1-2'); await page.waitForSelector('#craft-text');
    await page.waitForFunction(() => typeof window.__release === 'function');
    await page.locator('#craft-text').focus();
    await page.evaluate(() => window.__release()); await page.waitForTimeout(200);
    ok(/SAVED ON ANOTHER DEVICE/.test(await page.locator('#craft-text').inputValue()), 'late data: an empty box that has focus still takes the saved answer');
    ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'craft-text', 'late data: and keeps focus');
    await page.locator('#craft-text').press('End'); await page.locator('#craft-text').type(' More.');
    ok(/SAVED ON ANOTHER DEVICE\. More\./.test(await page.locator('#craft-text').inputValue()), 'late data: typing adds to the saved answer instead of replacing it');
    await ctx.close();
  }
  {
    // A box with text being typed is never overwritten by a remote change.
    const { ctx, page } = await newPage({}, () => {
      const docs = { 'data/users/u_late3/craft': { v: 1, ts: 5, stages: { 'dm-1-2': { text: 'OLDER REMOTE TEXT.', ts: 5, self: '', rounds: [] } } } };
      window.__release = null;
      const mkRef = p => { const ls = []; const snap = () => ({ exists: !!docs[p], data: () => docs[p] ? JSON.parse(JSON.stringify(docs[p])) : undefined });
        return { set: async d => { docs[p] = JSON.parse(JSON.stringify(d)); }, onSnapshot: next => { ls.push(next); if (/craft$/.test(p)) window.__release = () => next(snap()); else setTimeout(() => next(snap()), 30); return () => {}; } }; };
      const refs = {}, db = { doc: p => refs[p] || (refs[p] = mkRef(p)) };
      window.claude = { use: async n => n === 'db' ? db : n === 'user' ? { id: async () => 'u_late3' } : null };
    });
    await page.goto(URL + '#stage-dm-1-2'); await page.waitForSelector('#craft-text');
    await page.waitForFunction(() => typeof window.__release === 'function');
    await page.locator('#craft-text').type('TYPING NOW');
    await page.evaluate(() => window.__release()); await page.waitForTimeout(200);
    ok((await page.locator('#craft-text').inputValue()) === 'TYPING NOW', 'late data: text being typed is left alone');
    await ctx.close();
  }

  await browser.close();
  ok(!errs.length, 'page errors: ' + errs.join(' | '));
  console.log(pass + ' passed, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
