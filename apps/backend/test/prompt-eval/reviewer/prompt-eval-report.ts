import { z } from 'zod';

const count = z.number().int().nonnegative();
const conversationTurn = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export type EvalConversationTurn = z.infer<typeof conversationTurn>;
const evalCall = z.object({
  name: z.string(),
  args: z
    .record(z.string(), z.unknown())
    .transform((args) => JSON.stringify(args, null, 2)),
});

const evalRun = z.object({
  text: z.string(),
  calls: z.array(evalCall),
  refused: z.array(evalCall).optional(),
  unscripted: z.array(z.string()),
  routedTools: z.array(z.string()).nullish(),
  error: z.string().nullish(),
  usage: z.object({
    inputTokens: count.optional(),
    outputTokens: count.optional(),
    costUsd: z.number().nonnegative().optional(),
  }),
  durationMs: z.number().nonnegative().optional(),
  retries: count.optional(),
  contextTokens: count.nullish(),
  failures: z.array(z.object({ check: z.string(), reason: z.string() })),
});

export const reportMetadata = z.object({
  model: z.string(),
  routing: z.boolean(),
  commit: z.string(),
  startedAt: z.iso.datetime({ offset: true }),
  runsPerScenario: count.positive(),
  scoringVersion: z.string().optional(),
});

export const promptEvalReport = z.object({
  meta: reportMetadata,
  scenarios: z.array(
    z
      .object({
        id: z.string(),
        area: z.string(),
        message: z.string().optional(),
        history: z.array(conversationTurn).optional(),
        summary: z.string().nullable().optional(),
        passed: count,
        runs: z.tuple([evalRun], evalRun),
      })
      .refine(
        ({ runs, passed }) =>
          passed === runs.filter((run) => !run.failures.length).length,
        { message: 'The pass count disagrees with the saved check outcomes.' },
      ),
  ),
});

type SavedReport = z.infer<typeof promptEvalReport>;
export type FixtureSource = 'committed-fixture' | 'current-fixture';
export type PromptEvalScenario = SavedReport['scenarios'][number] & {
  messageSource?: FixtureSource;
  historySource?: FixtureSource;
  summarySource?: FixtureSource;
};
export type PromptEvalReport = Omit<SavedReport, 'scenarios'> & {
  scenarios: PromptEvalScenario[];
};
export type PromptEvalRun = PromptEvalScenario['runs'][number];
export type PromptEvalBaseline = {
  meta: PromptEvalReport['meta'];
  scenarios: { id: string; passed: number; total: number }[];
};

export const LATEST_REPORT = 'results/latest.json';
export const BASELINE_REPORT = 'baseline.json';

export type PromptEvalReview = {
  archives: { id: string; startedAt: string }[];
  issues: string[];
  baseline: PromptEvalBaseline | null;
  selected:
    | { status: 'ready'; report: PromptEvalReport }
    | { status: 'missing' | 'invalid'; message: string };
};
