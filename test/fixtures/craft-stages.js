// Test fixture: stage definitions for the two invented packets.
const FACTS = 'Every fact stated about the company, product or people traces to the packet or is labelled an assumption';
module.exports = [
  {
    id: 'DM-1', file: 'dm-1-lantern.md', status: 'Draft', kind: 'Product packet', title: 'Lantern Tools: a renewal dip', role: 'Product manager',
    stages: [
      { id: 'DM-1.1', title: 'Evidence sort', parts: [1], model: ['Stage 1'], checklist: ['Sorts the renewal table and ticket counts as data', 'Sorts Priya’s “every customer” as opinion', 'Works out 85.0% to 75.0%, a 10.0 point drop', 'Sets “every customer” against the 12 inactive accounts (C1)', FACTS], optional: ['A table is optional'] },
      { id: 'DM-1.2', title: 'What to investigate', parts: [2], model: ['Stage 2'], checklist: ['Names the 12 inactive accounts as the first thing to investigate', 'Asks Priya one question that tests her claim', 'Does not commit to two-way sync before the evidence is in', 'Keeps the recommendation to one or two lines', FACTS] }
    ]
  },
  {
    id: 'DM-2', file: 'dm-2-fixes.md', status: '', kind: 'Fix the flaw', stageWord: 'Item', title: 'Two drafts to fix', role: 'Product Owner',
    stages: [
      { id: 'DM-2.1', title: 'Sprint Goal', parts: [1], model: ['Draft A fixed'], brief: ['Draft A: Sprint Goal'], keyFor: ['Draft A flaw'], checklist: ['States an outcome', 'Drops the ticket list', 'Names who benefits', 'Fits one sentence', FACTS] },
      { id: 'DM-2.2', title: 'OKR', parts: [2], model: ['Draft B fixed'], brief: ['Draft B: OKR'], keyFor: ['Draft B flaw'], checklist: ['Key result has a number', 'Key result has a date', 'Keeps the growth intent', 'Drops “work hard”', FACTS] }
    ]
  }
];
