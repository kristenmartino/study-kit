# Engine inventory and differences (Nov 23, 2026)

All entries Measured unless tagged. Sources read at: inspect-adapt 8830fa8 (its build is byte-identical to live V32, sha256 d7b650d5…), going-concern 5ed5ef2 (its build is byte-identical to live V27, sha256 06d8a42f…), critical-path 9fb1d70. Diffs made function by function after renaming Going Concern's `fx*` identifiers to Inspect & Adapt's names (script kept in the session, not committed; the cross-check script `tools/crosscheck.js` is committed).

## Where each copy lives

| Engine | Inspect & Adapt | Going Concern | Critical Path |
|---|---|---|---|
| Craft page code | `index.src.html` lines 1594–1883 | `src/app.js` lines 3099–3335 (port, `fx*` names) | Delivery Packets: a separate engine in `build/template.html` (not a copy; see below) |
| Craft packet parser | `craft-build.js` (Node) | `tools/build_craft.py` (Python port) | `spec/validate_packets.py` (own format) |
| Save helper (`canonJSON` and store) | two copies: Craft (`cr*`, 1604–1652) and Simulations (`sm*`, 1890–1925) | one copy (`fx*`, 3107–3158) | none needed: writes on action through a queue, no snapshot listener (Read) |
| Simulations run | `index.src.html` 1927–2021, `sims-build.js`, `sims-run.js` | — (its pricing and go-to-market sims in `src/sims.js` are a different, seeded model) | Project Runs: scored items with meters in `template.html` (different engine, Read) |
| Role-play | `index.src.html` 2022–2102, `sims-roleplay.js` | Negotiation cases, `src/app.js` ~1540–1600: a different design (3 fixed turns, approved rubrics, private brief) | `template.html` 959–1001 (`rpSystem`, `rpClean`, `rpNorm`, `rpVerified`, `rpEnd`) |
| Width checks | `test.js` `overflow()`, 360/390/414; dark only at 390 | `tools/test.js` `overflow()`, 360/390/414 × light and dark | `test/ui_test.js`, `packet_test.js`: 360 light, 390 dark, 414 light |
| Idle-write check | `test.js` 1078–1105 (sorted-key mock, craft and sims) | `tools/test.js` ~2905–2930 (craft) | none |

## 1. Craft engine: Inspect & Adapt vs Going Concern

Identical after renaming (10): `crRound`, `crMerge`, `crLoadLocal`, `crSaveLocal`, `canonJSON`, `crFlush`, `stageStatus`, `packetDone`, `sectionsText`, `craftSavedText`.

Only in Inspect & Adapt (13): `crSlug`, `STBYSLUG`, `briefSections`, `modelText`, `packetLink`, `stageLink`, `craftHeader`, `openCraft`, `renderCraft` (list screen), `keyHTML`, `keyText`, `FB` (separate declaration), `fbErrCopy`.

Only in Going Concern (2): `CRAFT_LIST`, `PKBYID` (its packet map, `FXP`).

Differences in the 28 shared functions:

| # | Where | Inspect & Adapt | Going Concern |
|---|---|---|---|
| C1 | Saved-answer keys | slug: `cf-1-1` | raw id: `FX-1.1` |
| C2 | localStorage key | `inspect-adapt:craft:v1` | `going-concern:craft:v1` |
| C3 | `crSchedule` | does not repaint the saved line | repaints the saved line on every schedule |
| C4 | Snapshot re-render | only on the list or packet screen | on `craft` or `cstage`, and only if `snapshotRenders()` (not while a textarea or input has focus) |
| C5 | Screens | `craft` (list), `packet`, `stage` | `craft` (= packet), `cstage`; no list screen |
| C6 | Set items (`brief`, `keyFor`) | supported: a set item sees only its draft and key | not supported |
| C7 | `stageWord` ("Stage" / "Item") | yes | always "Stage" |
| C8 | Lesson links on a stage | yes | no |
| C9 | Copy link to packet; routes `#packet-…`, `#stage-…` | yes | no address routing |
| C10 | Clear feedback history button | yes | no |
| C11 | Grader prompt domain | "product management" | "finance operations" |
| C12 | Facts point wording in the grader rules | "the company, product, people or data" | "the company, its figures or its people" |
| C13 | Second-round rule | includes ", or now advise against something you suggested before," | lacks that clause |
| C14 | `fbParse` error code | `bad_reply` | `shape` |
| C15 | Shortest answer graded | 20 characters; toast | any non-empty; inline message |
| C16 | Unchanged answer | toast | inline message |
| C17 | Sampling | global `SAMPLE`, nulled on 5 permanent codes | `sampleFn()` lazy, `SAMPLE_OFF`, 7 permanent codes (adds `images_unavailable`, `tools_unavailable`) |
| C18 | Sampler options | `{ cache: false, signal }` | adds `modelTier: 'complex'` |
| C19 | Error copy | own `fbErrCopy` per code | app-wide `sampleCopy(code)` |
| C20 | Stop | shows "Stopped." | shows nothing |
| C21 | Done panel copy | "No changes are needed. Anything marked optional is a matter of taste." | none |
| C22 | Missing packet | returns to the list | falls back to the first packet |
| C23 | Heading focus | in the `stage` action | in `openFxStage` |
| C24 | Packet page | id, kind and Draft chips in a `qmeta` row; Draft note on the list | kind and id in an eyebrow line; Draft note on the packet page |
| C25 | Self-check | toast if empty | no empty check (button hidden until drafted) |
| C26 | Typing | saves 1.2 s after the last keystroke | saves on every keystroke |
| C27 | CSS classes | `cchip`, `pk`, `pktbl`, `srows`, `fbx`, `fblist`, `fbst`… | `fxchip`, `fxpk`, `fxtbl`, `fxrows`, `fxfb`, `fxlist`, `st`… |
| C28 | Element ids and actions | `craft-text`, `craft-saved`; `stage`, `fb-ask`… | `fx-text`, `fx-saved`; `fx-stage`, `fx-ask`… |

Packet parsers: on Nov 23 both parsers gave identical output for all nine packets (CF-1 to CF-8 and FX-1). Validation differs: Inspect & Adapt checks numbered-list order, known lessons, Draft status, set sections and `stageWord`; Going Concern requires the facts point in every checklist, refuses unknown `## ` parts and lines that start with whitespace, and checks task parts in numeric order (Inspect & Adapt sorts them as text, so a packet with 10 or more task parts would be refused wrongly; no packet has that many today).

## 2. Save helper (`canonJSON`)

`canonJSON` is character-for-character identical in all three copies (two in Inspect & Adapt, one in Going Concern). The stores around it differ:

| # | Inspect & Adapt Craft | Inspect & Adapt Simulations | Going Concern Craft |
|---|---|---|---|
| S1 | field `stages` | field `sims` | field `stages` |
| S2 | repaints saved line after a write | does not | repaints |
| S3 | status: Saving… / Saved / Saved on this device | status: Saved / Saved on this device (no Saving…) | as Inspect & Adapt Craft |
| S4 | normalize checks every field | keeps any entry with a numeric `ts` | as Inspect & Adapt Craft |

## 3. Role-play: Inspect & Adapt vs Critical Path

| # | Point | Inspect & Adapt | Critical Path |
|---|---|---|---|
| R1 | Counterpart rules | none beyond "never coach … or mention scoring" | blunt questions get guarded answers; no coaching; no unprompted better offer (approved and published Nov 22 per its status doc) |
| R2 | Reply format line | none | "as plain text, with no quotation marks around the reply and no speaker label" |
| R3 | Reply clean-up | strips a leading "You:" | `rpClean`: strips "You:" or "Counterpart:" and one pair of wrapping straight or curly quotes |
| R4 | Sentence count | "1 to 4 sentences" | "1-4 sentences" |
| R5 | "Reached" | scorer's word | only when scorer says reached AND overall ≥ 3; prompt says "true only if the transcript ends at or near the strong resolution" |
| R6 | Uncovered facts | plain strings | `{fact, quote}`; kept only if the quote (8+ normalized characters) appears in the counterpart's own replies (`rpVerified`) |
| R7 | Score clean-up | clamps points and overall to 1–4, rounds | no clamping |
| R8 | Non-JSON fallback | parses text if `SAMPLE.json` is missing | assumes `SAMPLE.json` |
| R9 | Errors | 5 permanent codes switch sampling off | only `not_granted` |
| R10 | Saving | `data/users/<id>/sims` entry `{ts, best, last, at}` | items collection, key `rp:<id>`, `{best, last, at}` |
| R11 | Learner label | Product Owner | project manager |
| R12 | Screen | bubbles, rubric fold-out, score panel | avatars, typing dots, "teach" panel |

## 4. Width checks

| # | Point | Inspect & Adapt | Going Concern | Critical Path |
|---|---|---|---|---|
| W1 | Excused parent | overflow-x auto, scroll **or hidden** | auto or scroll only | none (page scroll width only) |
| W2 | Tolerance | 1 px | 0.5 px | reports the number |
| W3 | Assertion | fails the suite | fails the suite | prints only; does not fail (Read) |
| W4 | Themes | light at all widths; dark screenshot at 390 | light and dark at all three | one theme per width |

## Not inventoried

Gap Analysis's intake packets (where Inspect & Adapt's Craft came from) and Dry Run's "Score with Claude" are graded-writing engines too. They were outside this request and were not read.
