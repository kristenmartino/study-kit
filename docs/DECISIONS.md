# How study-kit resolves the differences

**Approved by Kristen, Nov 23, 2026, 21:15 ET: all 26, as written below** (v0.2.0). She also confirmed that Critical Path's role-play fixes are approved; under decisions 15–17 they stay off by default in the kit, and each app turns on the ones it wants.

Proposed in v0.1.0. Base: Inspect & Adapt V32. Codes in brackets point to rows in `docs/INVENTORY.md`. "Option" means an app chooses in its config; the default is what a new app (Blast Radius) gets.

## Craft

1. **Saved-answer keys [C1]:** option `keyStyle`, default `slug` (Inspect & Adapt). Going Concern sets `id` so its saved FX-1 answers are still found.
2. **Saved line repaints on every change [C3, S2]:** taken from Going Concern. The line can no longer show "Saved" while a write is pending.
3. **No redraw while typing [C4]:** taken from Going Concern. A change from another device redraws the list or packet page, but not while a text box has focus.
4. **List screen, set items, Item/Stage wording, lesson links, copy-link button, Clear feedback history [C5–C10]:** all kept from Inspect & Adapt. Going Concern would gain them on migration.
5. **Grader wording [C11, C12]:** options `domain` (default "product management") and `factsSubject` (default "product, people or data"). With Going Concern's values the round-1 prompt is identical to Going Concern's (Measured, 5 of 5 stages).
6. **Second-round "advise against" clause [C13]:** kept (Inspect & Adapt). Going Concern's round-2 prompt would gain the clause; that is the only prompt change for Going Concern (Measured).
7. **Short or unchanged answers [C15, C16, C25]:** at least 20 characters (option `minChars`), shown as an inline message under the buttons (Going Concern's style) instead of a toast. The self-check still uses a toast when the answer is empty.
8. **Sampling [C17, C18, C19]:** the host supplies `sampler()` and `samplerGone()`. The kit switches Claude off on Inspect & Adapt's 5 permanent codes and uses Inspect & Adapt's error copy. `modelTier` is an option, unset by default; Going Concern sets `complex`. Not adopted: Going Concern's two extra permanent codes (`images_unavailable`, `tools_unavailable`), which Craft never triggers.
9. **Stop shows "Stopped." [C20]:** Inspect & Adapt.
10. **Typing saves 1.2 s after the last keystroke [C26]:** Inspect & Adapt. This means fewer writes than Going Concern's write on every keystroke.
11. **Classes, element ids and action names [C27, C28]:** Inspect & Adapt's names. Element ids get an `ids` prefix (default `craft`) and actions get an `act` prefix (default none), so an app that already uses an action called `packet` can avoid a clash. Going Concern's screen and its tests change on migration.
12. **Packet parser:** Inspect & Adapt's `craft-build.js` with Going Concern's checks as options: `factsPoint` (require the facts point) and `strictParts` (refuse unknown parts). Lines that start with whitespace are now refused in every app (Going Concern's rule; no current packet has one, Measured). Task parts are now checked in numeric order. The old text sort would have wrongly refused a packet with 10 or more task parts; none exists today.

## Saving

13. **One store for Craft and Simulations [S1–S4]:** the two near-copies in Inspect & Adapt become one `createStore`. Simulations' saved line now also shows "Saving to your account…" while a write is pending [S3]. Simulations still keeps any entry with a numeric `ts` [S4].
14. **`canonJSON`:** unchanged. It is the same text in all three copies.

## Role-play

15. **Critical Path's three counterpart rules [R1]** (guarded answers to blunt questions, no coaching, no unprompted better offers): in the kit, **off by default**, per your note. Each one is a single entry in `roleplay.rules` (`guarded`, `noCoaching`, `noUnpromptedOffer`). With all three on and the learner set to "project manager", the instructions are identical to Critical Path's, except that Critical Path writes "1-4" where the kit writes "1 to 4" (Measured, 6 of 6 role-plays).
16. **"Reached" must agree with the score [R5]:** off by default; `roleplay.scoring: ['outcomeAgreesWithScore']`.
17. **Verified quotes for uncovered facts [R6]** (Critical Path's fifth rule, published with the other four on Nov 22): off by default; `roleplay.scoring: ['verifiedQuotes']`. It is a separate switch so you can approve it separately.
18. **Plain-text reply line and `rpClean` [R2, R3]:** **on by default** (option `plainText`; the clean-up always runs). This changes Inspect & Adapt's counterpart prompt by one clause. It is not among the four fixes you held back, so I treated it as display clean-up. Say if you want it off.
19. **Overall score:** option `overall`, default `claude`, which keeps Claude's own overall as today. `mean` computes the rounded mean of the four points (open decision 18 in the portfolio review).
20. **Score clean-up and errors [R7–R9]:** Inspect & Adapt's (points and overall clamped to 1–4, a non-JSON fallback, 5 permanent codes).
21. **Learner label [R11]:** option `roleplay.learner`, default "Product Owner". Transcript labels capitalise it.

## Simulations run

22. **Run text:** the list intro, the run's label, its list note, the predictability note and the last button label become options (`intro`, `runNoun`, and per run `blurb`, `predNote`, `endLabel`). Inspect & Adapt passes its current SAFe wording on migration.

## Width checks

23. **Excused parents [W1]:** only overflow-x `auto` or `scroll` (Going Concern). Inspect & Adapt also excused `hidden`, which can let clipped text pass.
24. **Tolerance [W2]:** 1 px (Inspect & Adapt).
25. **Coverage [W3, W4]:** every engine screen at 360, 390 and 414 px in both light and dark, and the check fails the suite. Critical Path's suites only print the overflow number.

## Versioning

26. **Tags:** `v0.1.0` is the proposal; `v0.2.0` records the approval and is the first tag an app may pin. Apps pin a tag and copy `dist/study-kit.js` and `dist/study-kit.css` into their build. They never pull from `main`.
