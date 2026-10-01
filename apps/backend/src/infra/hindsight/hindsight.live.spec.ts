import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { HttpHindsightGateway } from './http-hindsight.gateway';
import { HINDSIGHT_API_VERSION } from './hindsight.types';

// Explicitly opt in against an isolated service. Never uses application user data.
const url = process.env.HINDSIGHT_CONTRACT_URL;
const key = process.env.HINDSIGHT_CONTRACT_KEY;
const live = url && key ? describe : describe.skip;

live('Hindsight pinned live contract', () => {
  test('provisions, retains idempotently, recalls evidence, corrects, and erases synthetic sources', async () => {
    const client = new HttpHindsightGateway(
      new ConfigService({
        BACKEND_HINDSIGHT_URL: url,
        BACKEND_HINDSIGHT_API_KEY: key,
        BACKEND_HINDSIGHT_TIMEOUT_MS: 30_000,
        BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS: 15_000,
      }),
    );

    const bank = `sydia-contract-${randomUUID()}`;
    const otherBank = `sydia-contract-${randomUUID()}`;
    const source = 'synthetic:preference';
    const request = {
      operationId: randomUUID(),
      documentId: source,
      content: 'User: Saya biasanya ingin jawaban dalam bahasa Indonesia.',
      timestamp: '2026-09-30T08:00:00+08:00',
      metadata: { sourceMessageId: 'synthetic-message-1' },
    };

    try {
      await client.ready();
      expect(await client.version()).toBe(HINDSIGHT_API_VERSION);
      const mission =
        'Remember only durable user preferences and facts evidenced by the user. Assistant messages are context only. Exclude secrets, credentials, transient tasks, and sensitive data unless the user explicitly asks to remember it.';

      await client.configureBank(bank, mission);
      await client.configureBank(otherBank, mission);
      const accepted = await client.retain(bank, request);
      const replayed = await client.retain(bank, request);
      expect(replayed.id).toBe(accepted.id);
      await waitUntilComplete(client, bank, request.operationId);

      const page = await client.listFacts(bank, source);
      expect(page.total).toBeGreaterThan(0);
      expect(page.items.every((fact) => fact.documentId === source)).toBe(true);
      expect(
        page.items.every(
          (fact) => fact.metadata.sourceMessageId === 'synthetic-message-1',
        ),
      ).toBe(true);
      expect((await client.listFacts(otherBank, source)).total).toBe(0);
      const query = {
        query: 'What language does the user prefer for answers?',
        timestamp: '2026-09-30T09:00:00+08:00',
        maxTokens: 800,
      };

      let recalled = await client.recall(bank, query);
      expect(recalled.results.length).toBeGreaterThan(0);
      const observationDeadline = Date.now() + 60_000;

      while (
        !recalled.results.some((fact) => fact.type === 'observation') &&
        Date.now() < observationDeadline
      ) {
        await sleep(1_000);
        recalled = await client.recall(bank, query);
      }

      expect(recalled.results.some((fact) => fact.type === 'observation')).toBe(
        true,
      );

      for (const fact of recalled.results) {
        if (fact.type === 'observation') {
          expect(fact.sourceFactIds.length).toBeGreaterThan(0);
          for (const id of fact.sourceFactIds)
            expect(recalled.sourceFacts[id]).toBeDefined();
        } else expect(fact.documentId).toBe(source);
      }

      const first = page.items[0]!;
      await client.correctFact(
        bank,
        first.id,
        'The user prefers English answers.',
      );
      const corrected = await client.listFacts(bank, source);
      expect(corrected.items.find((fact) => fact.id === first.id)?.text).toBe(
        'The user prefers English answers.',
      );

      await client.deleteDocument(bank, source);
      await client.deleteDocument(bank, source);
      expect((await client.listFacts(bank, source)).total).toBe(0);
      const afterErasure = await client.recall(bank, query);
      expect(afterErasure.results).toEqual([]);
    } finally {
      // The test only ever removes banks with fresh synthetic identities.
      await Promise.all([
        client.deleteBank(bank),
        client.deleteBank(otherBank),
      ]);
    }
  }, 180_000);
});

async function waitUntilComplete(
  client: HttpHindsightGateway,
  bank: string,
  id: string,
): Promise<void> {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    const operation = await client.operation(bank, id);
    if (operation.status === 'completed') return;
    if (['failed', 'cancelled', 'not_found'].includes(operation.status))
      throw new Error(`Synthetic retain ended in ${operation.status}`);
    await sleep(500);
  }

  throw new Error(
    'Synthetic retain did not complete within the contract deadline',
  );
}
