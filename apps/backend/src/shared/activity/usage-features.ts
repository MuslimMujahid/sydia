/**
 * The product features model spend and user activity are attributed to. One
 * source of truth for the usage ledger, the admin analytics SQL and their tests.
 */
export const USAGE_FEATURES = [
  'chat',
  'notes',
  'memory',
  'tasks',
  'reminders',
  'documents',
  'calendar',
  'contacts',
  'proactive',
  'overhead',
  'other',
] as const;

export type UsageFeature = (typeof USAGE_FEATURES)[number];

/**
 * Tool-name patterns, checked in order. A tool no rule matches belongs to no
 * feature: its step falls back to the feature that step serves (see
 * `allocateStepCosts`).
 */
export const TOOL_FEATURE_RULES: ReadonlyArray<
  readonly [RegExp, UsageFeature]
> = [
  [
    /^(update_plan|load_skill|get_current_datetime|get_work_context|respond_to_action)$/,
    'overhead',
  ],
  [/reminder/, 'reminders'],
  [/calendar/, 'calendar'],
  [/contact/, 'contacts'],
  [/memor/, 'memory'],
  [/(task|categor)/, 'tasks'],
  [/(document|attached_files|send_file)/, 'documents'],
  [/(note|record|_rows?$|folder)/, 'notes'],
  [/secret/, 'other'],
];

export function toolFeature(name: string): UsageFeature | null {
  for (const [pattern, feature] of TOOL_FEATURE_RULES)
    if (pattern.test(name)) return feature;

  return null;
}

/** Background queues whose spend belongs to one feature. */
const JOB_FEATURES: Readonly<Record<string, UsageFeature>> = {
  'conversation-summaries': 'chat',
  'memory-dreams': 'memory',
  documents: 'documents',
  'note-organizations': 'notes',
  'daily-note-indexes': 'notes',
  briefings: 'proactive',
  'follow-ups': 'proactive',
  secretary: 'proactive',
  reminders: 'reminders',
  'calendar-reminders': 'calendar',
  'calendar-sync': 'calendar',
};

/** Caller stages (after `normalizeStage`), matched by prefix. */
const STAGE_FEATURES: ReadonlyArray<readonly [string, UsageFeature]> = [
  ['decision.', 'overhead'],
  ['conversation-summary', 'chat'],
  ['media.', 'chat'],
  ['memory', 'memory'],
  ['hindsight', 'memory'],
  ['note', 'notes'],
  ['daily-note', 'notes'],
  ['document', 'documents'],
  ['briefing', 'proactive'],
  ['assistant.background', 'proactive'],
];

/**
 * The feature a whole provider call belongs to. A stage that names its purpose
 * wins over the queue it ran in; an unlabelled message-time call is chat and an
 * embedding outside a feature queue is retrieval overhead.
 */
export function usageFeature(input: {
  stage: string;
  job: string | null;
  kind: string;
}): UsageFeature {
  for (const [prefix, feature] of STAGE_FEATURES)
    if (input.stage === prefix || input.stage.startsWith(prefix))
      return feature;

  const byJob = input.job ? JOB_FEATURES[input.job] : undefined;
  if (byJob) return byJob;
  if (input.stage === 'embedding') return 'overhead';
  if (input.kind === 'message') return 'chat';

  return 'other';
}

export type GenerationStep = {
  /** Billed cost of the step; unknown steps contribute nothing. */
  costUsd?: number;
  /** Tools the model called in this step. */
  tools: readonly string[];
};

/**
 * Splits a multi-step generation's cost across features. A step that calls
 * tools is charged evenly to their features. A step without tool calls (the
 * reply that reads the results) is charged to the features of the step before
 * it, and otherwise to chat. Returns only features with spend.
 */
export function allocateStepCosts(
  steps: readonly GenerationStep[],
): Partial<Record<UsageFeature, number>> {
  const costs: Partial<Record<UsageFeature, number>> = {};
  let previous: UsageFeature[] = [];

  for (const step of steps) {
    const own = [
      ...new Set(
        step.tools.map((name) => toolFeature(name) ?? ('chat' as const)),
      ),
    ];

    const features: UsageFeature[] = own.length
      ? own
      : previous.length
        ? previous
        : ['chat'];

    const cost = step.costUsd ?? 0;

    if (cost > 0)
      for (const feature of features)
        costs[feature] = (costs[feature] ?? 0) + cost / features.length;

    previous = own;
  }

  return costs;
}
