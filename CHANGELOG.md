# Changelog

## v0.2.0 (Nov 23, 2026): approved

Kristen approved all 26 decisions in `docs/DECISIONS.md` as proposed (21:15 ET) and confirmed Critical Path's role-play fixes are approved. No code change from v0.1.0; the version string and the decisions record changed. First tag an app may pin.

## v0.1.0 (Nov 23, 2026): proposal

First version, built from Inspect & Adapt V32 (inspect-adapt 8830fa8) with the differences from Going Concern (5ed5ef2) and Critical Path (9fb1d70) resolved as listed in `docs/DECISIONS.md`. No app uses it yet.

Checks, all Measured on Nov 23, 2026:
- `test/unit.js`: 56 passed, 0 failed. Includes the idle-write check against a database stand-in that sorts keys like the server, and a control showing the pre-fix comparison keeps writing under the same stand-in.
- `test/page.js`: 147 passed, 0 failed. Every Craft and Simulations screen at 360, 390 and 414 px in light and dark, grading and role-play with a stand-in for Claude, the no-Claude paths, and the idle-write check in the browser.
- `tools/crosscheck.js`, all same: the parser matches Inspect & Adapt's `craft-build.js` (8 packets, 47 ids) and Going Concern's `build_craft.py` (FX-1). The grader prompt matches Inspect & Adapt's on 39 of 39 stages (rounds 1 and 2) and Going Concern's on 5 of 5 in round 1; in round 2 the only difference is the "advise against" clause. Role-play prompts match Inspect & Adapt's (3 of 3, plain-text line off). The counterpart rules match Critical Path's on 6 of 6 apart from "1-4" written "1 to 4". `cleanReply` and `verifyUncovered` match `rpClean` and `rpVerified`.
- The kit's ids for Inspect & Adapt's content equal its `published-ids.json` (47 craft, 19 simulation).
