import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
import { ObservabilityService } from '../../src/infra/observability';
import type { MemoryFactDecisionService } from '../../src/modules/memories/memory-fact-decision.service';
import { MemoryPolicyService } from '../../src/modules/memories/memory-policy.service';
import {
  EVIDENCE_SELECTION_FIXTURES,
  EVIDENCE_SELECTION_FIXTURE_VERSION,
  type EvidenceSelectionFixture,
} from './evidence-selection.fixtures';

/**
 * Runs memory evidence selection on the owner-approved cases with the
 * configured main model (BACKEND_MODEL_NAME), the model live ingestion uses.
 *
 *   EVIDENCE_SELECTION_ENABLED=true EVIDENCE_SELECTION_REPORT=/tmp/x.json \
 *     node --env-file=.env --experimental-vm-modules node_modules/jest/bin/jest.js \
 *     --config ./jest.config.mjs --runInBand --testPathPatterns=evidence-selection
 */
const enabled = process.env.EVIDENCE_SELECTION_ENABLED === 'true';
const RUNS = Number(process.env.EVIDENCE_SELECTION_RUNS ?? 3);
const reportPath = process.env.EVIDENCE_SELECTION_REPORT ?? '';

type Span = { quote: string; permissionQuote: string | null };

function failure(
  fixture: EvidenceSelectionFixture,
  spans: Span[],
): string | null {
  if (!fixture.expect.length)
    return spans.length ? 'selected evidence where none qualifies' : null;
  const lower = (text: string) => text.toLocaleLowerCase('id-ID');

  if (
    !spans.some(({ quote }) =>
      fixture.expect.every((fragment) =>
        lower(quote).includes(lower(fragment)),
      ),
    )
  )
    return `no quote contains ${fixture.expect.join(' + ')}`;
  if (
    fixture.permission &&
    !spans.some(({ permissionQuote }) =>
      lower(permissionQuote ?? '').includes(lower(fixture.permission!)),
    )
  )
    return `remember request "${fixture.permission}" not recorded`;

  return null;
}

(enabled ? describe : describe.skip)('Memory evidence selection', () => {
  test('selects complete user evidence for every approved case', async () => {
    if (
      !isAbsolute(reportPath) ||
      !relative(resolve(process.cwd(), '../..'), reportPath).startsWith('..')
    )
      throw new Error(
        'EVIDENCE_SELECTION_REPORT must be an absolute path outside the repository',
      );

    const policy = new MemoryPolicyService(
      new OpenRouterLanguageModel(
        new ConfigService(process.env),
        ObservabilityService.disabled(),
      ),
      {} as MemoryFactDecisionService,
    );

    const rows: Array<{
      id: string;
      run: number;
      spans: Span[];
      failure: string | null;
    }> = [];

    for (let run = 0; run < RUNS; run++)
      for (const fixture of EVIDENCE_SELECTION_FIXTURES) {
        const content = fixture.messages.join('\n\n');
        const review = await policy.approveEvidence(
          'evidence-selection',
          content,
          fixture.mode === 'requested'
            ? {
                messages: [...fixture.messages],
                requestedFact: fixture.requestedFact!,
              }
            : undefined,
        );

        rows.push({
          id: fixture.id,
          run,
          spans: review.spans,
          failure: failure(fixture, review.spans),
        });
      }

    const failures = rows
      .filter((row) => row.failure)
      .map(({ id, run, failure, spans }) => ({ id, run, failure, spans }));

    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          fixtureVersion: EVIDENCE_SELECTION_FIXTURE_VERSION,
          model: process.env.BACKEND_MODEL_NAME,
          runs: RUNS,
          failures,
          rows,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(failures, null, 2));

    expect(failures).toEqual([]);
  }, 1_800_000);
});
