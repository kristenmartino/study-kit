// Reference host: the smallest app shell that runs the Craft and Simulations engines. New apps (Blast Radius first)
// can start from this; existing apps keep their own shells and supply the same host functions.
// Expects in the page: <div id="app"></div>, a BANK object { craft, runs, roleplays } and window.StudyKit.
(function () {
  'use strict';
  const K = window.StudyKit, app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  const X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  let SCREEN = 'home', VIEW = {}, SAMPLE = null;

  const host = {
    esc,
    screen: () => SCREEN,
    view: () => VIEW,
    go(screen, view) { SCREEN = screen; VIEW = view || {}; render(); window.scrollTo(0, 0); },
    render: () => render(),
    keepScroll() { const y = window.scrollY; render(); window.scrollTo(0, y); },
    paint(html) { app.innerHTML = html; },
    header: (title, act, id, label, meta) => '<div class="playtop"><div class="wrap"><button class="iconbtn" data-act="' + act + '"' + (id ? ' data-id="' + esc(id) + '"' : '') + ' aria-label="' + esc(label) + '">' + X + '</button><h1 class="ttl">' + esc(title) + '</h1><span class="meta">' + esc(meta || '') + '</span></div></div>',
    listHeader: title => '<div class="playtop"><div class="wrap"><button class="iconbtn" data-act="home" aria-label="Back to start">' + X + '</button><h1 class="ttl">' + esc(title) + '</h1><span class="meta"></span></div></div>',
    sampler: () => SAMPLE,
    samplerGone() { SAMPLE = null; },
    toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); },
    // In-page dialog: the claude.ai artifact frame refuses window.confirm (it returns false at once), so a native
    // confirm would make every confirmed action silently do nothing there. Found on Throughput's live page, Nov 24.
    confirm(title, body, ok, cb) {
      const prev = document.activeElement, d = document.createElement('div');
      d.className = 'cfm'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'cfm-t'); d.setAttribute('aria-describedby', 'cfm-b');
      d.innerHTML = '<div class="cfm-box"><h2 id="cfm-t">' + esc(title) + '</h2><p id="cfm-b">' + esc(body) + '</p><div class="row"><button class="btn btn-primary" data-cfm="ok">' + esc(ok || 'OK') + '</button><button class="btn" data-cfm="cancel">Cancel</button></div></div>';
      const close = yes => { d.remove(); document.removeEventListener('keydown', key, true); if (prev && prev.focus) try { prev.focus(); } catch (e) {} if (yes) cb(); };
      const key = e => { if (e.key === 'Escape') { e.preventDefault(); close(false); } else if (e.key === 'Tab') { const b = d.querySelectorAll('button'); if (e.shiftKey ? document.activeElement === b[0] : document.activeElement === b[b.length - 1]) { e.preventDefault(); (e.shiftKey ? b[b.length - 1] : b[0]).focus(); } } };
      d.addEventListener('click', e => { const t = e.target.closest('[data-cfm]'); if (t) close(t.dataset.cfm === 'ok'); else if (e.target === d) close(false); });
      document.addEventListener('keydown', key, true); document.body.appendChild(d); d.querySelector('[data-cfm="cancel"]').focus();
    },
    copy(text, msg) { try { navigator.clipboard.writeText(text).then(() => host.toast(msg), () => host.toast(text)); } catch (e) { host.toast(text); } },
    linkBase: '',
    lessonTitle: () => null,
    fmtDate: ts => { try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; } }
  };

  const craft = K.craft.create({ packets: BANK.craft, appKey: 'study-kit-demo', host });
  const sims = K.sims.create({ runs: BANK.runs, roleplays: BANK.roleplays, appKey: 'study-kit-demo', runNoun: 'Run', rpHeading: 'Role-plays', host });
  const SCREENS = Object.assign({ home: renderHome }, craft.screens, sims.screens);
  const ACT = Object.assign({ home() { host.go('home', {}); } }, craft.actions, sims.actions);

  function renderHome() {
    app.innerHTML = '<main class="wrap"><h1 class="ttl">study-kit demo</h1><p class="note">Test fixture for the engines. Version ' + K.version + '.</p>' +
      '<div class="row"><button class="btn btn-primary" data-act="craft">Craft</button><button class="btn" data-act="sims">Simulations</button></div></main>';
  }
  function render() { (SCREENS[SCREEN] || renderHome)(); }

  document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (!t || t.disabled) return; const fn = ACT[t.dataset.act]; if (fn) fn(t, e); });
  document.addEventListener('input', e => { craft.onInput(e) || sims.onInput(e); });
  document.addEventListener('toggle', e => { craft.onToggle(e); }, true);
  window.addEventListener('pagehide', () => craft.onPageHide());
  window.addEventListener('hashchange', () => { craft.route(location.hash) || sims.route(location.hash); });

  craft.start(); sims.start();
  if (!(location.hash && (craft.route(location.hash) || sims.route(location.hash)))) render();

  // Claude capabilities, when the page runs inside Claude.
  (async () => {
    const C = window.claude;
    if (!C || typeof C.use !== 'function') return;
    try { const fn = await C.use('sample'); if (typeof fn === 'function') { SAMPLE = fn; render(); } } catch (e) { /* not granted */ }
    try {
      const db = await C.use('db'), user = await C.use('user'), uid = user && await user.id();
      if (db && uid) { craft.attach(db, uid); sims.attach(db, uid); }
    } catch (e) { /* saved on this device only */ }
  })();
  window.__kit = { craft, sims, host };
})();
