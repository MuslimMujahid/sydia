import {
  createUsageRelay,
  chargeSnapshot,
  extractionCharge,
  totalExtractionCost,
} from './optimization.usage-relay';
import { createServer, type Server } from 'node:http';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test server address');

  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test('captures billing fields without content, authorization or arbitrary provider text', () => {
  const charge = extractionCharge({
    model: 'openai/gpt-oss-20b',
    provider: 'Groq',
    choices: [
      { message: { content: 'Synthetic fact text must not be saved.' } },
    ],
    usage: {
      cost: 0.0005,
      prompt_tokens: 100,
      completion_tokens: 40,
      prompt_tokens_details: { cached_tokens: 50 },
      completion_tokens_details: { reasoning_tokens: 12 },
    },
  });

  expect(charge).toEqual({
    model: 'openai/gpt-oss-20b',
    provider: 'Groq',
    costUsd: 0.0005,
    inputTokens: 100,
    outputTokens: 40,
    cachedTokens: 50,
    reasoningTokens: 12,
  });
  expect(JSON.stringify(charge)).not.toContain('Synthetic fact');
  expect(
    extractionCharge({
      provider: 'raw\nprivate text',
      usage: { cost: -1, prompt_tokens: NaN },
    }),
  ).toMatchObject({ provider: null, costUsd: null, inputTokens: null });
});
test('unknown charges cannot turn failed or missing requests into free operations', () => {
  expect(totalExtractionCost([])).toBeNull();
  expect(totalExtractionCost([{ costUsd: null } as never])).toBeNull();
  expect(
    totalExtractionCost([
      { costUsd: 0.002 } as never,
      { costUsd: 0.001 } as never,
    ]),
  ).toBeCloseTo(0.003);
});

test('forwards an authenticated completion unchanged and exposes only billing data on loopback administration', async () => {
  let incoming = '';
  const reply = JSON.stringify({
    model: 'openai/gpt-oss-20b',
    provider: 'Groq',
    choices: [{ message: { content: 'Synthetic extracted fact' } }],
    usage: { cost: 0.0005, prompt_tokens: 100, completion_tokens: 40 },
  });

  const upstream = createServer((request, response) => {
    request.on('data', (chunk: Buffer) => {
      incoming += chunk.toString('utf8');
    });
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(reply);
    });
  });

  const upstreamUrl = await listen(upstream);
  const { relay, admin } = createUsageRelay({
    apiKey: 'synthetic-key',
    upstream: upstreamUrl,
  });

  const relayUrl = await listen(relay);
  const adminUrl = await listen(admin);

  try {
    const payload = JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: 'Synthetic evidence' }],
      provider: { only: ['groq'], allow_fallbacks: false },
    });

    const result = await fetch(`${relayUrl}/gpt-oss-20b/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer synthetic-key' },
      body: payload,
    });

    expect(result.status).toBe(200);
    expect(await result.text()).toBe(reply);
    expect(incoming).toBe(payload);
    const snapshot = await chargeSnapshot(adminUrl);
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({
      arm: 'gpt-oss-20b',
      costUsd: 0.0005,
      provider: 'Groq',
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /Synthetic evidence|Synthetic extracted fact|synthetic-key/,
    );
    expect((await chargeSnapshot(adminUrl, snapshot.sequence)).rows).toEqual(
      [],
    );
    expect(
      (
        await fetch(`${relayUrl}/gpt-oss-20b/v1/chat/completions`, {
          method: 'POST',
          body: payload,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(`${relayUrl}/gpt-oss-20b/v1/chat/completions`, {
          method: 'POST',
          headers: { authorization: 'Bearer synthetic-key' },
          body: JSON.stringify({ model: 'other-model' }),
        })
      ).status,
    ).toBe(400);
    expect((await chargeSnapshot(adminUrl)).rows).toHaveLength(1);
  } finally {
    await Promise.all([close(relay), close(admin), close(upstream)]);
  }
});
