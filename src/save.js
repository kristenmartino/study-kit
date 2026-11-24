// Saving: a per-user document mirrored to localStorage, merged by entry timestamp, written back only when the
// merged copy differs from the database's.
//
// Origin: Inspect & Adapt V32 (crFlush / initCraftStore and smFlush / initSimsStore, two near-identical copies),
// and Going Concern V26 (fxFlush / initCraftStore). All three compared copies key-order-free since Nov 22, 2026:
// the database returns fields in its own order, and comparing plain JSON.stringify output made every snapshot
// look changed, so the page rewrote its document about once a second while open.
'use strict';

// Key-order-free JSON. Arrays keep their order; object keys are sorted at every depth.
function canonJSON(v) {
  return JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
    ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {})
    : x);
}

// Later entry wins, entry by entry, on its `ts`.
function mergeByTs(a, b) {
  const out = Object.assign({}, a);
  for (const k in b) if (!out[k] || (b[k].ts || 0) > (out[k].ts || 0)) out[k] = b[k];
  return out;
}

// opts:
//   localKey   localStorage key, e.g. 'blast-radius:craft:v1'
//   doc        document name under data/users/<uid>/, e.g. 'craft' or 'sims'
//   field      field holding the entries in the document, e.g. 'stages' or 'sims'
//   normalize  (raw) => entries; drops unknown ids and bad shapes
//   onRemote   () => void; called after a snapshot changed the local copy
//   onStatus   () => void; called whenever the saved/saving state may have changed
//   delayMs    debounce before a write (900)
//   retryMs    wait after a failed write (5000)
//   maxFails   stop retrying after this many failures in a row (3)
//   storage    localStorage stand-in for tests
function createStore(opts) {
  const o = Object.assign({ delayMs: 900, retryMs: 5000, maxFails: 3, normalize: x => x || {}, onRemote() {}, onStatus() {} }, opts);
  const storage = o.storage !== undefined ? o.storage : (typeof window !== 'undefined' ? window.localStorage : null);
  let data = {}, ref = null, saving = false, dirty = false, timer = null, fails = 0;

  function loadLocal() {
    try { const raw = storage && storage.getItem(o.localKey); data = raw ? o.normalize(JSON.parse(raw)) : {}; }
    catch (e) { data = {}; }
    return data;
  }
  function saveLocal() { try { if (storage) storage.setItem(o.localKey, JSON.stringify(data)); } catch (e) { /* storage unavailable */ } }
  function later(ms) { clearTimeout(timer); timer = setTimeout(flush, ms); }
  function schedule() { saveLocal(); o.onStatus(); if (!ref) return; dirty = true; later(o.delayMs); }
  async function flush() {
    if (!ref || saving || !dirty) return;
    saving = true; dirty = false;
    try { await ref.set({ v: 1, ts: Date.now(), [o.field]: JSON.parse(JSON.stringify(data)) }); fails = 0; }
    catch (e) { dirty = true; fails++; }
    saving = false;
    if (dirty && fails < o.maxFails) later(fails ? o.retryMs : o.delayMs);
    o.onStatus();
  }
  function attach(db, uid) {
    let r;
    try { r = db.doc('data/users/' + uid + '/' + o.doc); } catch (e) { return false; }
    if (!r || typeof r.onSnapshot !== 'function') return false;
    ref = r;
    try {
      r.onSnapshot(snap => {
        const remote = snap.exists ? o.normalize((snap.data() || {})[o.field]) : {};
        const before = canonJSON(data);
        data = mergeByTs(data, remote);
        const now = canonJSON(data);
        if (now !== before) { saveLocal(); o.onRemote(); }
        // Write back only what the database lacks. Compared key-order-free: see the note at the top.
        if (now !== canonJSON(remote) && Object.keys(data).length) { dirty = true; later(o.delayMs); }
        o.onStatus();
      }, () => { ref = null; o.onStatus(); });
    } catch (e) { ref = null; return false; }
    return true;
  }
  return {
    loadLocal, attach, flush,
    get: k => data[k],
    put(k, v) { data[k] = v; schedule(); },
    // Change an entry without saving yet (typing); call touch() to save.
    set(k, v) { data[k] = v; },
    touch: schedule,
    saveLocal,
    all: () => data,
    replaceAll(x) { data = o.normalize(x); schedule(); },
    online: () => !!ref,
    busy: () => dirty || saving,
    statusText: () => ref ? (dirty || saving ? 'Saving to your account…' : 'Saved to your account') : 'Saved on this device'
  };
}

module.exports = { canonJSON, mergeByTs, createStore };
