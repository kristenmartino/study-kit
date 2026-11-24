// Role-play prompts and scoring: Claude plays a counterpart with private facts and a walk-away limit for up to 8
// messages, then scores four rubric points 1 to 4.
//
// Origin: Inspect & Adapt V32 (rpPrompt, rpScorePrompt, rpEnd) is the base. Critical Path (build/template.html at
// 9fb1d70: rpSystem, rpClean, rpNorm, rpVerified, rpEnd) runs the same format with extra counterpart and scorer
// rules. Those rules are in RULES and SCORING below, each OFF unless an app turns it on, so that adopting one is
// a one-line config change and a version bump, not a code change.
'use strict';

// Counterpart rules. {learner} is replaced by the learner's role (e.g. 'Product Owner', 'project manager').
// The wording is Critical Path's, word for word, so an app that turns all three on sends the same rules sentence
// Critical Path sends (checked in test/unit.js).
const RULES = {
  guarded: 'a blunt, dismissive or hostile question is not earning a fact; answer it guardedly and reveal nothing private until the {learner} shows respect, acknowledges your position or makes a fair offer.',
  noCoaching: 'Never tell the {learner} what to ask, propose or do next, never list example questions or name the kinds of question you would answer, and never suggest the solution yourself.',
  noUnpromptedOffer: 'Never improve your own offer or position unless the {learner} asks you to or makes a counter-offer.'
};
// Scorer options:
//   outcomeAgreesWithScore  "good outcome reached" only when the scorer says reached AND the overall is 3 or more,
//                           and the scorer is told reached means the transcript ends at or near the strong resolution
//   verifiedQuotes          the scorer must quote the counterpart's own words for each uncovered fact; the page keeps
//                           a fact only if that quote (8+ characters after normalizing) appears in the counterpart's replies
const SCORING = ['outcomeAgreesWithScore', 'verifiedQuotes'];

const DEFAULTS = { learner: 'Product Owner', rules: [], scoring: [], plainText: true, overall: 'claude' };

function fill(t, learner) { return t.replace(/\{learner\}/g, learner); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function transcript(turns, me, them) { return turns.map(t => (t.role === 'me' ? me : them) + ': ' + t.text).join('\n'); }

// The counterpart's instructions, without the conversation.
function counterpartRules(x, cfg) {
  const c = Object.assign({}, DEFAULTS, cfg), L = c.learner;
  const on = c.rules.filter(r => RULES[r]);
  let rules = '';
  if (on.length) rules = '\nRules: ' + on.map((r, i) => { const t = fill(RULES[r], L); return i === 0 ? t : cap(t); }).join(' ');
  return 'Role-play for a ' + L + '\'s interview practice. You are ' + x.role + '. Persona: ' + x.persona +
    '\nPrivate facts you know (reveal one only when the ' + L + ' earns it with a good question, empathy or a fair offer; never list them): ' + x.hidden.join(' | ') +
    '\nYour walk-away limit: ' + x.walkaway +
    rules +
    (on.length ? ' Stay' : '\nStay') + ' in character, reply in 1 to 4 sentences of natural speech' +
    (c.plainText ? ' as plain text, with no quotation marks around the reply and no speaker label' : '') +
    ', never coach the ' + L + ' or mention scoring.';
}
function counterpartPrompt(x, turns, cfg) {
  const L = Object.assign({}, DEFAULTS, cfg).learner;
  return counterpartRules(x, cfg) + '\n\nConversation so far:\n' + transcript(turns, cap(L), 'You') + '\n\nReply as yourself with your next line only.';
}

// Tidies a counterpart reply: drops a leading speaker label and one pair of wrapping quotation marks.
// Critical Path's rpClean, with Inspect & Adapt's "You:" strip folded in.
function cleanReply(t) {
  t = String(t || '').trim().replace(/^(You|Counterpart):\s*/, '');
  const m = t.match(/^["“]([\s\S]*)["”]$/);
  return m ? m[1].trim() : t;
}

function scorePrompt(x, turns, cfg) {
  const c = Object.assign({}, DEFAULTS, cfg), L = c.learner;
  const agree = c.scoring.indexOf('outcomeAgreesWithScore') !== -1, quotes = c.scoring.indexOf('verifiedQuotes') !== -1;
  return 'Score a ' + L + '\'s role-play. Counterpart: ' + x.role + '. Private facts the ' + L + ' could uncover: ' + x.hidden.join(' | ') + '. Counterpart\'s walk-away: ' + x.walkaway + '. A strong resolution: ' + x.goodOutcome +
    '\nRubric:\n' + x.rubric.map((p, i) => (i + 1) + '. ' + p).join('\n') + '\n\nTranscript:\n' + transcript(turns, cap(L), 'Counterpart') +
    '\n\nReturn JSON only: {"points": [{"point": "<rubric point, short>", "score": 1-4, "comment": "<one sentence citing what the ' + L + ' said>"}], "overall": 1-4, "reached": true|false' +
    (agree ? ' (true only if the transcript ends at or near the strong resolution)' : '') +
    ', "uncovered": ' + (quotes ? '[{"fact": "<private fact, short>", "quote": "<the counterpart\'s own words stating it, copied exactly from the transcript>"}]' : '["<private facts the ' + L + ' actually drew out>"]') +
    ', "tip": "<one sentence>"}. Scale: 1 Strong No Hire, 2 No Hire, 3 Hire, 4 Strong Hire.' +
    (quotes ? ' List a private fact in uncovered only if the counterpart stated it in the transcript; leave out facts the ' + L + ' said first, facts the counterpart refused, and hints.' : '') +
    ' Judge only the transcript.';
}

const norm = t => String(t || '').toLowerCase().replace(/[‘’]/g, '\'').replace(/[“”]/g, '"').replace(/[^a-z0-9$']+/g, ' ').trim();
// Keeps an uncovered fact only if its quote is in the counterpart's own replies. Critical Path's rpVerified.
function verifyUncovered(list, turns) {
  const said = norm(turns.filter(t => t.role === 'them').map(t => t.text).join(' '));
  return (Array.isArray(list) ? list : []).filter(u => u && typeof u === 'object' && typeof u.fact === 'string' && norm(u.quote).length >= 8 && said.includes(norm(u.quote)))
    .map(u => u.fact + ' (“' + String(u.quote).trim() + '”)');
}

const clamp = v => Math.max(1, Math.min(4, Math.round(Number(v) || 1)));
// Reads a scorer reply into a fixed shape.
function readScore(v, turns, cfg) {
  const c = Object.assign({}, DEFAULTS, cfg);
  const points = (Array.isArray(v.points) ? v.points : []).slice(0, 4).map(p => ({ point: String(p.point || ''), score: clamp(p.score), comment: String(p.comment || '') }));
  // overall: 'claude' keeps the scorer's own overall (Inspect & Adapt and Critical Path today);
  // 'mean' uses the rounded mean of the points, so the overall cannot disagree with them (open decision 18).
  const overall = c.overall === 'mean' && points.length ? clamp(points.reduce((a, p) => a + p.score, 0) / points.length) : clamp(v.overall);
  const agree = c.scoring.indexOf('outcomeAgreesWithScore') !== -1, quotes = c.scoring.indexOf('verifiedQuotes') !== -1;
  return {
    points, overall,
    reached: !!v.reached && (!agree || overall >= 3),
    uncovered: quotes ? verifyUncovered(v.uncovered, turns) : (Array.isArray(v.uncovered) ? v.uncovered : []).map(u => typeof u === 'string' ? u : String((u && u.fact) || '')).filter(Boolean),
    tip: String(v.tip || '')
  };
}

module.exports = { RULES, SCORING, DEFAULTS, counterpartRules, counterpartPrompt, cleanReply, scorePrompt, verifyUncovered, readScore, transcript, norm };
