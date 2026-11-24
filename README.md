# study-kit

Shared engines for Kristen's study apps (Inspect & Adapt, Going Concern, Critical Path, and the planned executive apps, starting with Blast Radius):

- **Craft**: graded written packets. Claude grades each stage against a fixed checklist (Meets / Partly / Misses) and adds a "Change to" line. The worked answer and checklist always work without Claude.
- **Simulations**: stepped runs (four meters, flags that come back later, predictability) and live role-plays (Claude plays a counterpart for up to 8 messages, then scores four rubric points).
- **Save helper**: a per-user document mirrored to localStorage and merged by timestamp. It is written back only when it differs from the database's copy, compared key-order-free (`canonJSON`), so an idle page never rewrites its document.
- **Width checks**: Playwright overflow checks at 360, 390 and 414 px in light and dark.

Built from Inspect & Adapt V32 as the base. `docs/INVENTORY.md` lists every difference found between the copies, `docs/DECISIONS.md` says how each one is resolved (for approval), and `docs/MIGRATION.md` holds the per-app plans. No existing app uses study-kit yet.

## Layout

| Path | What |
|---|---|
| `src/save.js` | `canonJSON`, `mergeByTs`, `createStore` |
| `src/craft.js` | Craft engine: grader prompt, feedback parsing, stage status, screens, actions, routes |
| `src/sims.js` | Run engine (`runFresh`, `runApply`, `runPred`, `runEnding`) and the Simulations screens |
| `src/roleplay.js` | Counterpart and scorer prompts, optional rules, `cleanReply`, `verifyUncovered`, `readScore` |
| `src/build/craft-parse.js` | Node: reads packet markdown and stage definitions; refuses anything malformed |
| `src/build/sims-validate.js` | Node: checks runs and role-plays |
| `dist/study-kit.js`, `dist/study-kit.css` | What apps inline: one IIFE that sets `window.StudyKit`, and the engine styles |
| `css/shell.css` | Inspect & Adapt's app shell (variables, themes, cards, buttons), a starting point for new apps |
| `examples/host.js` | The smallest app shell that runs both engines. Start new apps here |
| `test/unit.js`, `test/page.js`, `test/widths.js` | Node checks, Playwright checks, and the reusable width helper |
| `tools/bundle.js`, `tools/demo.js` | Build `dist/` and the demo page the tests use |
| `tools/crosscheck.js` | Compares the kit with the three apps' own code (needs the sibling repos) |

## Use in an app

1. Pin a tag. Copy `dist/study-kit.js` and `dist/study-kit.css` from that tag into the app's build. Never build from `main`.
2. At build time, read packets with `loadCraft(defs, { dir, idPrefix, lessonIds, takenIds })` and check runs and role-plays with `validateSims(...)`. Refuse to build on any error. Add `craft.linkIds()` and `sims.linkIds()` to the app's `published-ids.json`.
3. In the page:

```js
const craft = StudyKit.craft.create({ packets: BANK.craft, appKey: 'blast-radius', host });
const sims = StudyKit.sims.create({ runs: BANK.runs, roleplays: BANK.roleplays, appKey: 'blast-radius', host,
  roleplay: { learner: 'CIO' } });
Object.assign(SCREENS, craft.screens, sims.screens);   // craft, packet, stage, sims, run, rp
Object.assign(ACT, craft.actions, sims.actions);
document.addEventListener('input', e => { craft.onInput(e) || sims.onInput(e); });
document.addEventListener('toggle', e => craft.onToggle(e), true);
window.addEventListener('pagehide', () => craft.onPageHide());
craft.start(); sims.start();                          // load from localStorage
craft.route(location.hash) || sims.route(location.hash);
// once the db and user capabilities resolve:
craft.attach(db, uid); sims.attach(db, uid);
```

### Host interface

The app passes `host` with: `esc(s)`, `screen()`, `view()` (the mutable view object), `go(screen, view)`, `render()`, `keepScroll()`, `paint(html)` (writes the main area), `header(title, backAct, backId, backLabel, meta)`, `listHeader(title)`, `sampler()` (Claude's sample function or null), `samplerGone()`, `toast(msg)`, `confirm(title, body, okLabel, onOk)`, `copy(text, okMsg)`, `linkBase` (omit to hide the copy-link button), `lessonTitle(id)` (null hides the link), `fmtDate(ts)` and, for runs, `icon.ok` and `icon.bad`. `examples/host.js` implements all of it.

### Options

Craft: `keyStyle` (`slug` or `id`), `domain`, `factsSubject`, `minChars` (20), `maxChars` (12000), `rounds` (4), `act` (action prefix), `ids` (element id prefix, `craft`), `modelTier`.

Simulations: `intro`, `runNoun`, `rpHeading`, `act`. Per run: `blurb`, `predNote`, `endLabel`.

Role-play (`roleplay: {...}`): `learner`, `plainText` (on), `overall` (`claude` or `mean`), `rules` (any of `guarded`, `noCoaching`, `noUnpromptedOffer`, all off), `scoring` (any of `outcomeAgreesWithScore`, `verifiedQuotes`, all off). Critical Path's rules are already written. Adopting one is a config line, not a code change.

Saved data: `data/users/<uid>/craft` (field `stages`) and `data/users/<uid>/sims` (field `sims`), plus localStorage `<appKey>:craft:v1` and `<appKey>:sims:v1`.

## Test

```sh
npm test          # bundle, demo page, test/unit.js, test/page.js
node tools/crosscheck.js ../inspect-adapt ../inspect-adapt/build/index.html ../going-concern <going-concern built page> ../critical-path
```

`test/page.js` uses Playwright from a local install, or else the copy preinstalled in the Claude workspace. It covers every Craft and Simulations screen at 360, 390 and 414 px in light and dark. The test packets, run and role-play in `test/fixtures/` are invented.

## Versioning

Semantic tags (`v0.1.0`, …). Each tag records its changes in `CHANGELOG.md`. Each app records the tag it pins in its status doc.
