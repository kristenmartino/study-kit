# Migration plans (proposed; nothing migrated)

The engine decisions were approved Nov 23 (v0.2.0). Each plan below still needs Kristen's approval, app by app.

One app at a time, each on its own branch with a pull request, only after Kristen approves that app's plan. Each migration pins a study-kit tag, copies `dist/study-kit.js` and `dist/study-kit.css` into the app's build, deletes the app's own copy of the engine, and must pass the app's full suite. Before publishing, compare the build with the live page. After publishing, check that saved answers still load on the live page with the real database.

## 1. Inspect & Adapt (first; lowest risk)

**What changes**
- `index.src.html` loses the Craft section (1594–1883) and the Simulations section (1884–2102), about 500 lines. A host object (about 40 lines) wires its existing `render`, `keepScroll`, `backHeader`, `craftHeader`, `toast`, `confirmSheet`, `copyText`, `LBYID`, `fmtDate` and `SAMPLE` into the kit.
- `craft-build.js` and `sims-build.js` become thin calls to the kit's `loadCraft` and `validateSims` (prefixes CF, RN, RL).
- Config: `keyStyle: 'slug'`, `appKey: 'inspect-adapt'`, `domain: 'product management'`, `roleplay.learner: 'Product Owner'`, `runNoun: 'PI run'`, `rpHeading: 'Product Owner role-plays'`, plus the current list intro and RN-1's `blurb`, `predNote` and `endLabel`.
- Role-play: turn on all of Critical Path's rules (decided by Kristen, Nov 23, 21:25 ET): `roleplay.rules: ['guarded', 'noCoaching', 'noUnpromptedOffer']`, `roleplay.scoring: ['outcomeAgreesWithScore', 'verifiedQuotes']`.
- Behaviour changes users would see: decisions 2, 3, 7, 13 and 18. The counterpart prompt gains the plain-text clause and Critical Path's three rules, so counterparts hold facts back from blunt questions, stop coaching and stop improving their offers unasked. Replies lose wrapping quotation marks. "Reached" shows only with an overall of 3 or more, and uncovered facts need the counterpart's own words. RL-1 to RL-3 should get a live run each after the migration.

**What could break**
- Saved Craft answers: none expected. Same document (`data/users/<id>/craft`), same field (`stages`), same slug keys, same localStorage key. Measured: the kit's parser gives byte-identical packets to `craft-build.js`.
- Saved Simulations state: same document, field and keys.
- `test.js` selectors: the element ids stay (`craft-text`, `craft-saved`, `craft-actions`, `craft-fb`). The stage heading id changes from `stage-h` to `craft-stage-h`. Lines 1078–1105 (idle-write) should pass unchanged.
- `a11y.js`: classes are unchanged; rerun it.
- Tabs left open on an older version keep their own code until reloaded (same as V32).

**Published ids at risk:** none if the routes are kept. The kit routes `#craft`, `#packet-cf-<n>`, `#stage-cf-<n>-<m>`, `#sims`, `#run-rn-1` and `#rp-rl-<n>` use the same formats. Measured: the kit's ids for the current content equal `published-ids.json` exactly (47 craft ids, 19 simulation ids). `build.js` keeps refusing a dropped id.

## 2. Going Concern

**What changes**
- `src/app.js` loses lines 3099–3335. The host wires `backHeader`, `sampleFn`/`SAMPLE_OFF`, `fmtWhen` and `keepScroll`.
- `tools/build_craft.py` is replaced by a Node step calling the kit's `loadCraft` with `idPrefix: 'FX'`, `factsPoint` (token `FACTS`, its finance wording) and `strictParts: true`. Its build becomes Python plus one Node step. Node is already required for its tests.
- Config: `keyStyle: 'id'`, `appKey: 'going-concern'`, `domain: 'finance operations'`, `factsSubject: 'its figures or its people'`, `modelTier: 'complex'`, `act: 'fx-'` (keeps `fx-packet` and `fx-stage`; the others become `fx-fb-ask`, `fx-fb-stop`, `fx-stage-reveal`, `fx-stage-self`, `fx-pk-key`), `ids: 'fx'` (keeps `fx-text`, `fx-saved`).
- Visible changes: a Craft list screen appears (today the tile opens FX-1 directly), the Clear feedback history button, the "Stopped." line, a 20-character minimum before grading, saving 1.2 s after typing stops instead of on every keystroke, and Inspect & Adapt's CSS classes (`cchip`, `pk`, `fbx`…). Going Concern's styles for `fxchip`, `fxpk` and the rest go away, so `dist/study-kit.css` must be added and checked in both themes.
- The grader's round-2 prompt gains the "advise against" clause (decision 6).

**What could break**
- Saved FX-1 answers: none expected with `keyStyle: 'id'`. Same document, field and localStorage key. Measured: the kit's parser matches `build_craft.py` on FX-1.
- `tools/test.js` craft section: class selectors (`.fxfb`, `.fxlist`, `.fxchip`) and the screen name `cstage` change, so those assertions need rewriting. The idle-write check (~2905–2930) should pass as is.
- Screen names: the kit uses `craft`, `packet` and `stage`. Going Concern uses `craft` for the packet page, so its `render()` switch and its `snapshotRenders()` need updating.

**Published ids at risk:** none today, because Going Concern has no address routing (other apps cannot link to FX-1). The migration would add `#packet-fx-1` and `#stage-fx-1-<n>` routes. From then on they are published and go in a `published-ids.json`, which Going Concern does not have yet (proposed: add one in the same pull request).

## 3. Critical Path (role-play only; optional)

**What changes (if approved)**
- `rpSystem`, `rpClean`, `rpNorm`, `rpVerified` and the scoring part of `rpEnd` in `build/template.html` are replaced by the kit's `roleplay.js` functions, with config `learner: 'project manager'`, `rules: ['guarded', 'noCoaching', 'noUnpromptedOffer']` and `scoring: ['outcomeAgreesWithScore', 'verifiedQuotes']`. Critical Path keeps its own role-play screen (avatars, typing dots) and its own saving (`items/rp:<id>`). It uses the kit's prompt and scoring functions only, not `sims.create()`.
- The only prompt change: "1-4 sentences" becomes "1 to 4 sentences" (Measured: otherwise identical on all 6 role-plays). Scores gain clamping to 1–4.

**What could break**
- Best scores: none expected, because saving stays Critical Path's.
- `rp_mock_test.js` checks the verified-quote behaviour. The kit's `verifyUncovered` gives the same output as `rpVerified` on the cross-check cases (Measured); rerun the suite.
- Critical Path builds with Python into a template. The kit's role-play functions would be inlined by `build.py` from the pinned `dist/study-kit.js`, which needs a small build change.

**Published ids at risk:** none. Role-play ids RP-1 to RP-6 are not routed.

**Not proposed:** moving Critical Path's Delivery Packets onto the kit's Craft engine. They grade against figures checked in code and save per stage in the items collection, a different design. Its `#packet-foxmere` and `#packet-tamarind` routes would also clash with the kit's `#packet-<id>` form unless the kit's `act` and route prefix were changed.

## Order

Inspect & Adapt first (no data or route changes, and its suite is the base of the kit's). Then Going Concern, which gains the most from the kit (a list screen, set support and routing). Critical Path last, and only for the prompt functions, since the PMP is on hold.
