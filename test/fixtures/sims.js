// Test fixture: one three-step run and one role-play, invented for study-kit's tests.
const eff = (a, b, c, d) => [a, b, c, d];
module.exports = {
  runs: [{
    id: 'DR-1', status: 'Draft', title: 'Lantern launch week', role: 'Product manager',
    blurb: 'Three decisions in a launch week. Each choice moves four meters.',
    briefing: 'You run the launch of Lantern’s booking page. Engineering has three people this week; support has asked for a help article before launch.',
    meters: ['flow', 'quality', 'morale', 'trust'],
    meterLabels: { flow: 'Flow', quality: 'Quality', morale: 'Morale', trust: 'Trust' },
    start: { planned: 10, actual: 10 },
    steps: [
      { id: 'DR-1-01', phase: 'Plan', stem: 'Sales asks for a fourth feature in launch week. What do you do?',
        options: ['Add it and ask the team to work late', 'Hold scope and offer it for the next release with a date', 'Swap it for the help article', 'Ask engineering to estimate it before deciding'],
        answer: 1, whyNot: { 0: 'Overtime trades quality and morale for a feature nobody planned.', 2: 'The help article was a support commitment.', 3: 'An estimate delays the answer sales needs today.' },
        effects: eff({ flow: -10, morale: -15 }, { trust: 5 }, { trust: -10 }, { flow: -5 }), sets: { 0: 'overtime' },
        why: 'Holding scope with a date keeps the plan and gives sales an answer.', lesson: 'Say no to scope with a date, not a maybe.' },
      { id: 'DR-1-02', phase: 'Build', stem: 'A test finds a booking bug two days before launch.', update: 'Support is still waiting for the help article.', updateIf: { overtime: 'The team is tired after the late nights.' },
        options: ['Ship and patch later', 'Fix it and move the launch a day', 'Fix it and drop the help article', 'Ask QA to retest everything'],
        answer: 1, whyNot: { 0: 'A known booking bug at launch costs trust.', 2: 'Dropping the article breaks a commitment.', 3: 'A full retest is more than the risk needs.' },
        effects: eff({ trust: -15 }, { quality: 10 }, { trust: -5 }, { flow: -10 }), pv: { 0: { actual: -3 } },
        why: 'A one-day move protects quality and keeps the article.', lesson: 'Protect quality; move a date in the open.' },
      { id: 'DR-1-03', phase: 'Review', stem: 'After launch, how do you report results?',
        options: ['Share only the wins', 'Share results against the plan, including the moved day', 'Wait a month', 'Let sales report'],
        answer: 1, whyNot: { 0: 'Hiding the move costs trust later.', 2: 'A month is too late to act on.', 3: 'Sales cannot report engineering’s side.' },
        effects: eff({ trust: -10 }, { trust: 10 }, { flow: -5 }, { trust: -5 }),
        why: 'Reporting against the plan keeps trust.', lesson: 'Report against the plan, including what moved.' }
    ],
    endings: [
      { min: 75, title: 'A clean launch', text: 'The page shipped one day late with no booking bug.' },
      { min: 0, title: 'A rough launch', text: 'The launch went out, but trust took a hit.' }
    ]
  }],
  roleplays: [{
    id: 'DP-1', status: 'Draft', title: 'The sales lead wants a custom export',
    role: 'Dana Ruiz, head of sales',
    brief: 'Dana wants a custom export built for one large prospect before the end of the month. Your roadmap is full, and the export would serve one customer. You need to find out what is really driving the request and reach an outcome that protects the roadmap without losing the deal. You have up to eight messages before the conversation is scored against four rubric points.',
    persona: 'Direct, under quota pressure, friendly once she feels heard.',
    hidden: ['The prospect only needs the data once a month', 'Dana’s quarter closes on the 28th'],
    walkaway: 'She will accept a manual monthly export if it is promised in writing.',
    opening: 'I need the custom export for Harbor Co by the 28th. Can you make that happen?',
    goodOutcome: 'A manual monthly export for Harbor Co, promised in writing, with the custom export left on the backlog.',
    rubric: ['Asks what the customer needs before answering', 'Separates the person from the problem', 'Offers an option that protects the roadmap', 'Confirms the agreement clearly'],
    lessons: []
  }]
};
