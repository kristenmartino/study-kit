# Changelog

## v0.2.3 (Nov 24, 2026): confirm dialog that works in the artifact frame

`examples/host.js` confirmed with `window.confirm`. The claude.ai artifact frame refuses native dialogs and the call returns false at once, so every confirmed action did nothing there: Craft's "Clear feedback history" in any host copied from the example, and in Throughput the mock's Submit and Abandon (Measured on Throughput's live page, Nov 24). The example host now shows an in-page `alertdialog` (focus starts on Cancel; Escape, Cancel or a click outside cancels; Tab stays inside), styled by new `.cfm` rules in `css/shell.css`. `test/page.js` used to accept native dialogs, which hid this; it now fails on any native dialog and checks the in-page one at every width and theme (179 passed; with the v0.2.2 host the new check fails). No engine change: the engines already call `host.confirm`.

## v0.2.2 (Nov 24, 2026): saved answers that arrive late

When an answer saved on another device arrived from the account after its stage was already open, the stage kept showing an empty box, and typing one character replaced the saved answer and kept its old feedback (Measured on Going Concern's migration build with a stand-in database; Inspect & Adapt V42 runs the same code). `craft` now redraws an open stage when its data changes, unless text is being typed in the box. An empty box that has focus is redrawn and keeps its focus. Three page checks cover it; all three fail on v0.2.1. No other change.

## v0.2.1 (Nov 24, 2026): links with dots

`craft.route` now slugs the id in a link before matching, so `#stage-cf-1.1` and `#packet-CF-1` open the same screens as `#stage-cf-1-1` and `#packet-cf-1`. Before this, a link written with the id's own dots returned false. Found in Inspect & Adapt, whose host carried a workaround regex; that workaround can come out once the app vendors v0.2.1. No other change.

## v0.2.0 (Nov 23, 2026): approved

Kristen approved all 26 decisions in `docs/DECISIONS.md` as proposed (21:15 ET) and confirmed Critical Path's role-play fixes are approved. No code change from v0.1.0; the version string and the decisions record changed. First tag an app may pin.

## v0.1.0 (Nov 23, 2026): proposal

First version, built from Inspect & Adapt V32 (inspect-adapt 8830fa8) with the differences from Going Concern (5ed5ef2) and Critical Path (9fb1d70) resolved as listed in `docs/DECISIONS.md`. No app uses it yet.

Checks, all Measured on Nov 23, 2026:
- `test/unit.js`: 56 passed, 0 failed. Includes the idle-write check against a database stand-in that sorts keys like the server, and a control showing the pre-fix comparison keeps writing under the same stand-in.
- `test/page.js`: 147 passed, 0 failed. Every Craft and Simulations screen at 360, 390 and 414 px in light and dark, grading and role-play with a stand-in for Claude, the no-Claude paths, and the idle-write check in the browser.
- `tools/crosscheck.js`, all same: the parser matches Inspect & Adapt's `craft-build.js` (8 packets, 47 ids) and Going Concern's `build_craft.py` (FX-1). The grader prompt matches Inspect & Adapt's on 39 of 39 stages (rounds 1 and 2) and Going Concern's on 5 of 5 in round 1; in round 2 the only difference is the "advise against" clause. Role-play prompts match Inspect & Adapt's (3 of 3, plain-text line off). The counterpart rules match Critical Path's on 6 of 6 apart from "1-4" written "1 to 4". `cleanReply` and `verifyUncovered` match `rpClean` and `rpVerified`.
- The kit's ids for Inspect & Adapt's content equal its `published-ids.json` (47 craft, 19 simulation).
