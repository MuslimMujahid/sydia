import { ReviewUsage, totalReviewCost } from './optimization.review-usage';

test('records actual charges per generation attempt and excludes raw content', async () => {
  const usage = new ReviewUsage();
  const request = {
    provider: 'openrouter',
    model: 'synthetic-model',
    messages: [{ role: 'user' as const, content: 'Private synthetic input' }],
    attempt: 1,
  };

  await usage.traceGeneration(request, async (trace) => {
    trace.update({
      costUsd: 0.001,
      inputTokens: 100,
      outputTokens: 10,
      output: 'Private synthetic result',
    });

    return await Promise.resolve(true);
  });
  expect(totalReviewCost(usage.charges)).toBe(0.001);
  expect(JSON.stringify(usage.charges)).not.toContain('Private');
  await expect(
    usage.traceGeneration(request, async () => {
      return await Promise.reject(new Error('ProviderUnavailable'));
    }),
  ).rejects.toThrow();
  expect(usage.charges).toHaveLength(2);
  expect(usage.charges[1]?.status).toBe('failed');
  expect(totalReviewCost(usage.charges)).toBeNull();
});
