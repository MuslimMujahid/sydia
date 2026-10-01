import type { TurnDecisionInput } from '../../src/modules/conversations/services/turn-decision.service';
import type { ToolGroup } from '../../src/modules/conversations/services/tool-groups';

// Draft expectations for review. Passing these fixtures does not establish a
// calibrated 99% release gate or authorize broad enablement.
export const OPTIMIZATION_FIXTURE_VERSION =
  'synthetic-independent-selection-draft-v2';
export type TurnDecisionFixture = {
  id: string;
  input: TurnDecisionInput;
  expected: { recall: boolean; groups: ToolGroup[] };
};
const turn: TurnDecisionInput = {
  latest: '',
  recent: [],
  summary: '',
  locale: 'en',
  timezone: 'Asia/Makassar',
  channel: 'web',
  attachments: [],
  recallEligible: true,
};

export const TURN_DECISION_FIXTURES: TurnDecisionFixture[] = [
  {
    id: 'generic-question-en',
    input: { ...turn, latest: 'What is photosynthesis?' },
    expected: { recall: false, groups: [] },
  },
  {
    id: 'task-en',
    input: { ...turn, latest: 'Create a task to buy milk tomorrow.' },
    expected: { recall: false, groups: ['tasks'] },
  },
  {
    id: 'reminder-id',
    input: {
      ...turn,
      locale: 'id',
      latest: 'Ingatkan saya minum air besok jam 9 pagi.',
    },
    expected: { recall: false, groups: ['reminders'] },
  },
  {
    id: 'personal-preference-id',
    input: {
      ...turn,
      locale: 'id',
      latest: 'Apa minuman yang biasanya saya suka?',
    },
    expected: { recall: true, groups: ['memory'] },
  },
  {
    id: 'contextual-follow-up',
    input: {
      ...turn,
      latest: 'Use my usual preference.',
      recent: [{ role: 'user', content: 'Help me choose lunch for tomorrow.' }],
    },
    expected: { recall: true, groups: ['memory'] },
  },
  {
    id: 'file-person-multi-domain',
    input: {
      ...turn,
      latest: 'Find my invoice PDF and send that file to my contact Mira.',
    },
    expected: { recall: false, groups: ['documents', 'contacts'] },
  },
  {
    id: 'calendar-contact',
    input: {
      ...turn,
      latest: 'Schedule a meeting with my contact Sam tomorrow at 10.',
    },
    expected: { recall: false, groups: ['calendar', 'contacts'] },
  },
  {
    id: 'forget-explicit-id',
    input: {
      ...turn,
      locale: 'id',
      latest: 'Lupakan kota lama saya dari memori.',
    },
    expected: { recall: true, groups: ['memory'] },
  },
  {
    id: 'unsupported-capability',
    input: {
      ...turn,
      latest: 'Browse the live web and email these results to my boss.',
    },
    expected: { recall: false, groups: [] },
  },
  {
    id: 'irrelevant-attachment',
    input: {
      ...turn,
      latest: 'What is photosynthesis?',
      attachments: [{ name: 'invoice.pdf', mimeType: 'application/pdf' }],
    },
    expected: { recall: false, groups: [] },
  },
  {
    id: 'save-attachment',
    input: {
      ...turn,
      latest: 'Save the attached invoice PDF for later.',
      attachments: [{ name: 'invoice.pdf', mimeType: 'application/pdf' }],
    },
    expected: { recall: false, groups: ['documents'] },
  },
  {
    id: 'tasks-and-contacts',
    input: {
      ...turn,
      latest:
        'List my unfinished tasks and find the phone number of my contact Mira.',
    },
    expected: { recall: false, groups: ['tasks', 'contacts'] },
  },
];
export const MEMORY_ELIGIBILITY_FIXTURES = [
  { id: 'greeting', content: 'Hello, thanks!', eligible: false },
  {
    id: 'durable-id',
    content: 'Saya lebih suka jawaban singkat dalam bahasa Indonesia.',
    eligible: true,
  },
  {
    id: 'hypothetical',
    content: 'If I moved to Tokyo, would I like it?',
    eligible: false,
  },
  {
    id: 'mixed-durable',
    content: 'Thanks! By the way I always drink tea instead of coffee.',
    eligible: true,
  },
  {
    id: 'sensitive-no-permission',
    content: 'I have a chronic health condition.',
    eligible: false,
  },
  {
    id: 'sensitive-permission',
    content: 'Please remember that I have a chronic health condition.',
    eligible: true,
  },
] as const;
export const EXTRACTOR_FIXTURES = [
  {
    id: 'language',
    evidence: 'Saya lebih suka jawaban singkat dalam bahasa Indonesia.',
    query: 'What language and reply length does the user prefer?',
  },
  {
    id: 'negation',
    evidence: 'I do not drink coffee. I prefer tea.',
    query: 'Does the user drink coffee, and what drink do they prefer?',
  },
  {
    id: 'routine',
    evidence: 'I usually exercise every Monday morning.',
    query: 'When does the user usually exercise?',
  },
] as const;
