import { describe, expect, jest, test } from '@jest/globals';
import type { LanguageModelGateway } from '../../infra/model-gateway';
import type { HindsightFact } from '../../infra/hindsight';
import { MemoryPolicyService } from './memory-policy.service';

const input = 'I prefer Indonesian replies. Remember my asthma diagnosis.';
const fact: HindsightFact = {
  id: 'fact',
  text: 'The user prefers Indonesian replies.',
  type: 'world',
  documentId: 'doc',
  sourceFactIds: [],
  metadata: {},
  mentionedAt: null,
  occurredStart: null,
};

function setup(output: unknown) {
  const generate = jest
    .fn<LanguageModelGateway['generate']>()
    .mockResolvedValue({ text: JSON.stringify(output), usage: {} });

  return {
    generate,
    policy: new MemoryPolicyService({
      generate,
    } as unknown as LanguageModelGateway),
  };
}

describe('MemoryPolicyService', () => {
  test('requires exact source spans and specific permission for sensitive evidence', async () => {
    const { policy } = setup({
      spans: [
        {
          quote: 'I prefer Indonesian replies.',
          sensitive: false,
          permissionQuote: null,
        },
        { quote: 'invented evidence', sensitive: false, permissionQuote: null },
        { quote: 'asthma diagnosis', sensitive: true, permissionQuote: null },
        {
          quote: 'asthma diagnosis',
          sensitive: true,
          permissionQuote: 'Remember my asthma diagnosis.',
        },
      ],
    });

    const result = await policy.approveEvidence('owner', input);
    expect(result.spans.map(({ quote }) => quote)).toEqual([
      'I prefer Indonesian replies.',
      'asthma diagnosis',
    ]);
  });

  test('never sends credential-bearing input to the review model', async () => {
    const { policy, generate } = setup({ spans: [] });
    expect(
      await policy.approveEvidence('owner', 'My password is abcdef123!'),
    ).toEqual({ spans: [] });
    expect(generate).not.toHaveBeenCalled();
  });

  test('rejects unsupported, duplicate, partial, or malformed fact verdicts', async () => {
    const verdict = {
      id: 'fact',
      grounded: true,
      durable: true,
      sensitive: false,
      permissionQuote: null,
      evidenceQuotes: ['I prefer Indonesian replies.'],
    };

    const source = JSON.stringify({
      sydiaSource: 1,
      userEvidence: input,
      approvedEvidence: ['I prefer Indonesian replies.'],
      permissionQuotes: [],
    });

    expect(
      await setup({ facts: [verdict] }).policy.approveFacts('owner', source, [
        fact,
      ]),
    ).toBe(true);
    expect(
      await setup({
        facts: [{ ...verdict, evidenceQuotes: ['I live in Bali.'] }],
      }).policy.approveFacts('owner', source, [fact]),
    ).toBe(false);
    expect(
      await setup({
        facts: [{ ...verdict, grounded: false }],
      }).policy.approveFacts('owner', source, [fact]),
    ).toBe(false);
    expect(
      await setup({
        facts: [{ ...verdict, sensitive: true }],
      }).policy.approveFacts('owner', source, [fact]),
    ).toBe(false);
    await expect(
      setup({ facts: [] }).policy.approveFacts('owner', source, [fact]),
    ).rejects.toThrow(/verdict/);
    await expect(
      setup({ facts: [verdict, verdict] }).policy.approveFacts(
        'owner',
        source,
        [fact, { ...fact, id: 'other' }],
      ),
    ).rejects.toThrow(/verdict/);
  });

  test('preserved facts remain evidence for compound corrections without authorizing invented permission', async () => {
    const source = JSON.stringify({
      sydiaSource: 1,
      userEvidence: 'I now prefer English.',
      approvedEvidence: ['I now prefer English.'],
      preservedFacts: [{ text: 'The user lives in Makassar.' }],
      permissionQuotes: [],
    });

    const { policy } = setup({
      facts: [
        {
          id: 'fact',
          grounded: true,
          durable: true,
          sensitive: false,
          evidenceQuotes: ['The user lives in Makassar.'],
          permissionQuote: null,
        },
      ],
    });

    expect(
      await policy.approveFacts('owner', source, [
        { ...fact, text: 'The user lives in Makassar.' },
      ]),
    ).toBe(true);
  });

  test('reviews all candidates in bounded batches and renews ownership before each call', async () => {
    const { policy, generate } = setup({ facts: [] });
    const beforeReview = jest.fn<() => Promise<void>>().mockResolvedValue();
    const batchIds: string[][] = [];
    generate.mockImplementation((request) => {
      const content = request.messages[1]!.content;
      if (typeof content !== 'string')
        throw new Error('Expected text evidence');
      const body = JSON.parse(content) as {
        candidates: Array<{ id: string; text: string }>;
      };

      batchIds.push(body.candidates.map(({ id }) => id));
      expect(beforeReview).toHaveBeenCalledTimes(batchIds.length);

      return Promise.resolve({
        text: JSON.stringify({
          facts: body.candidates.map(({ id }) => ({
            id,
            grounded: true,
            durable: true,
            sensitive: false,
            permissionQuote: null,
            evidenceQuotes: ['I prefer Indonesian replies.'],
          })),
        }),
        usage: {},
      });
    });
    const facts = Array.from({ length: 9 }, (_, index) => ({
      ...fact,
      id: `fact-${index}`,
    }));

    expect(
      await policy.approveFacts(
        'owner',
        JSON.stringify({ sydiaSource: 1, userEvidence: input }),
        facts,
        beforeReview,
      ),
    ).toBe(true);
    expect(batchIds.map((ids) => ids.length)).toEqual([4, 4, 1]);
    expect(batchIds.flat()).toEqual(facts.map(({ id }) => id));
    expect(generate).toHaveBeenCalledTimes(3);
  });

  test('rejects the whole source if a later batch is ungrounded', async () => {
    const { policy, generate } = setup({ facts: [] });
    let calls = 0;
    generate.mockImplementation((request) => {
      const content = request.messages[1]!.content;
      if (typeof content !== 'string')
        throw new Error('Expected text evidence');
      const body = JSON.parse(content) as {
        candidates: Array<{ id: string }>;
      };

      calls += 1;

      return Promise.resolve({
        text: JSON.stringify({
          facts: body.candidates.map(({ id }) => ({
            id,
            grounded: calls === 1,
            durable: true,
            sensitive: false,
            permissionQuote: null,
            evidenceQuotes: ['I prefer Indonesian replies.'],
          })),
        }),
        usage: {},
      });
    });
    expect(
      await policy.approveFacts(
        'owner',
        JSON.stringify({ sydiaSource: 1, userEvidence: input }),
        Array.from({ length: 9 }, (_, index) => ({
          ...fact,
          id: `fact-${index}`,
        })),
      ),
    ).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  test('rejects duplicate IDs, credentials in later batches, and oversized sources before model work', async () => {
    const { policy, generate } = setup({ facts: [] });
    const source = JSON.stringify({ sydiaSource: 1, userEvidence: input });
    expect(await policy.approveFacts('owner', source, [fact, fact])).toBe(
      false,
    );
    expect(
      await policy.approveFacts('owner', source, [
        fact,
        { ...fact, id: 'secret', text: 'My password is abcdef123!' },
      ]),
    ).toBe(false);
    expect(
      await policy.approveFacts(
        'owner',
        source,
        Array.from({ length: 201 }, (_, index) => ({
          ...fact,
          id: `${index}`,
        })),
      ),
    ).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
});
