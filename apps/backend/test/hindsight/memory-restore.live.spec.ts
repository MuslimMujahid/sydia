import { createFactReviewer } from './create-fact-reviewer';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/infra/prisma';
import { HttpHindsightGateway } from '../../src/infra/hindsight/http-hindsight.gateway';
import { HINDSIGHT_API_VERSION } from '../../src/infra/hindsight';
import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
import { ObservabilityService } from '../../src/infra/observability';
import type { QueueService } from '../../src/infra/queue';
import {
  PrismaConversationRepository,
  PrismaHindsightRepository,
  PrismaMemoryRepository,
  PrismaUserPrivacyRepository,
  PrismaUserRepository,
} from '../../src/database/repositories';
import { HindsightDeliveryService } from '../../src/modules/memories/hindsight-delivery.service';
import { MemoryAccessService } from '../../src/modules/memories/memory-access.service';
import type { MemoryMutationReceipt } from '../../src/modules/memories/memory-access.types';
import { MemoryEngineService } from '../../src/modules/memories/memory-engine.service';
import {
  MemoryPolicyService,
  MEMORY_POLICY_VERSION,
} from '../../src/modules/memories/memory-policy.service';
import type { MemoryService } from '../../src/modules/memories/memory.service';

const execute = promisify(execFile);
const enabled = process.env.HINDSIGHT_RESTORE_CONTRACT_ENABLED === 'true';
const databaseUrl = process.env.HINDSIGHT_LEDGER_CONTRACT_URL;
const apiUrl = process.env.HINDSIGHT_CONTRACT_URL;
const apiKey = process.env.HINDSIGHT_CONTRACT_KEY;
const policyKey = process.env.HINDSIGHT_POLICY_CONTRACT_KEY;
const apiContainer = 'sydia-hindsight-contract-hindsight-1';
const apiDatabaseContainer = 'sydia-hindsight-contract-hindsight-postgres-1';
const ledgerContainer = 'sydia-hindsight-ledger-contract';
const reportPath = process.env.HINDSIGHT_RESTORE_REPORT_PATH;

if (
  enabled &&
  (!databaseUrl ||
    new URL(databaseUrl).hostname !== '127.0.0.1' ||
    new URL(databaseUrl).pathname !== '/sydia_hindsight_ledger_contract' ||
    apiUrl !== 'http://127.0.0.1:8888' ||
    !apiKey ||
    !policyKey)
)
  throw new Error(
    'Restore drill requires the dedicated local synthetic services',
  );
if (reportPath && !isAbsolute(reportPath))
  throw new Error('Restore report path must be absolute');

type Runtime = {
  prisma: PrismaService;
  ledger: PrismaHindsightRepository;
  gateway: HttpHindsightGateway;
  delivery: HindsightDeliveryService;
  access: MemoryAccessService;
};

(enabled ? describe : describe.skip)('Paired memory database recovery', () => {
  test('restored recall, newer forgetting intent, retries, and deleted-owner erasure', async () => {
    const runId = randomUUID();
    // PostgreSQL truncates identifiers at 63 bytes; keep both clone names distinct.
    const suffix = runId.replaceAll('-', '').slice(0, 16);
    const userId = `synthetic-restore-${runId}`;
    const namespace = `restore-${runId}`;
    const restoredApiContainer = `sydia-hindsight-restore-contract-${suffix}`;
    const restoredApiDatabase = `sydia_hindsight_restore_contract_${suffix}`;
    const restoredLedgerDatabase = `sydia_hindsight_ledger_contract_restore_${suffix}`;
    const newerLedgerDatabase = `${restoredLedgerDatabase}_newer`;
    const directory = await mkdtemp(join(tmpdir(), 'sydia-memory-restore-'));
    const source = runtime(databaseUrl!, apiUrl!);
    const clients: Runtime[] = [source];
    const checks: string[] = [];
    let phase = 'seed';
    let restoredStarted = false;
    const startedAt = new Date().toISOString();
    const bankId = new MemoryEngineService(
      config(databaseUrl!, apiUrl!),
    ).bankId(userId);

    try {
      expect(await source.gateway.version()).toBe(HINDSIGHT_API_VERSION);
      await source.prisma.user.create({
        data: {
          id: userId,
          name: 'Synthetic restore fixture',
          email: `${userId}@example.invalid`,
        },
      });
      await source.prisma.conversation.create({
        data: { userId },
      });

      const city = await save(
        'Remember that I live in Makassar.',
        'The user lives in Makassar.',
      );

      const language = await save(
        'Remember that I prefer English replies.',
        'The user prefers replies in English.',
      );

      await settle(source, city, 'admitted');
      await settle(source, language, 'admitted');
      const languageSnapshot = (await source.ledger.snapshot(
        userId,
        language,
      ))!;

      const documentId = languageSnapshot.deliveries.at(-1)!.documentId;
      const cityDocumentId = (await source.ledger.snapshot(
        userId,
        city,
      ))!.deliveries.at(-1)!.documentId;

      const sourceReferences = await source.ledger.referencesForDocuments(
        userId,
        bankId,
        [documentId],
      );

      expect(sourceReferences.length).toBeGreaterThan(0);
      const expectedFactIds = (
        await source.gateway.listFacts(bankId, documentId)
      ).items
        .map(({ id }) => id)
        .sort();

      const segment = await source.ledger.ingestionSegment(
        userId,
        namespace,
        MEMORY_POLICY_VERSION,
        languageSnapshot.source.conversationId!,
        languageSnapshot.source.sourceMessageIds[0]!,
      );

      expect(segment).not.toBeNull();
      expect(
        await source.ledger.stageCheckpoint(segment!, [city, language]),
      ).toBe(true);
      expect(
        await source.ledger.completeCheckpoint(userId, segment!.checkpoint.id),
      ).toBe(true);
      const checkpoint =
        await source.prisma.hindsightCheckpoint.findUniqueOrThrow({
          where: { id: segment!.checkpoint.id },
        });

      checks.push(
        'two independent sources admitted through real policy and delivery; active checkpoint completed',
      );

      // Application writes are paused; background observations may still consolidate.
      phase = 'snapshot';
      await dump(apiDatabaseContainer, 'hindsight', 'hindsight', 'api.dump');
      await dump(
        ledgerContainer,
        'hindsight_contract',
        'sydia_hindsight_ledger_contract',
        'ledger.dump',
      );
      const snapshotAt = new Date().toISOString();
      expect(await source.ledger.forget(userId, language, 1)).toBe('deleted');
      expect(
        await source.ledger.resolveReference(
          userId,
          sourceReferences[0]!.reference.id,
        ),
      ).toBeNull();
      await dump(
        ledgerContainer,
        'hindsight_contract',
        'sydia_hindsight_ledger_contract',
        'newer-ledger.dump',
      );
      // The older API dump still contains the fact; the newer ledger holds erasure intent.
      expect(
        (await source.gateway.listFacts(bankId, documentId)).total,
      ).toBeGreaterThan(0);
      checks.push('post-snapshot forgetting captured before remote deletion');

      phase = 'restore';
      await restore(
        apiDatabaseContainer,
        'hindsight',
        restoredApiDatabase,
        'api.dump',
      );
      await restore(
        ledgerContainer,
        'hindsight_contract',
        restoredLedgerDatabase,
        'ledger.dump',
      );
      await restore(
        ledgerContainer,
        'hindsight_contract',
        newerLedgerDatabase,
        'newer-ledger.dump',
      );
      const inspection: unknown = JSON.parse(
        (await docker(['inspect', apiContainer])).stdout,
      );

      if (!Array.isArray(inspection))
        throw new Error('Missing isolated API configuration');
      const instance = inspection[0] as {
        Config: { Env: string[]; Image: string };
        NetworkSettings: { Networks: Record<string, unknown> };
      };

      const network = Object.keys(instance.NetworkSettings.Networks).find(
        (name) => name === 'sydia-hindsight-contract_default',
      );

      if (
        !network ||
        !instance.Config.Image.includes(
          'sha256:3c7b54a7e7dc92c3ad6a6b874aa9b3e96603b2c6fc4b215d9890a93578d2de99',
        )
      )
        throw new Error(
          'Restore requires the dedicated network and pinned image',
        );
      const environment = new Map(
        instance.Config.Env.map((entry) => {
          const index = entry.indexOf('=');

          return [entry.slice(0, index), entry.slice(index + 1)];
        }),
      );

      const restoredRemoteUrl = new URL(
        environment.get('HINDSIGHT_API_DATABASE_URL')!,
      );

      restoredRemoteUrl.pathname = `/${restoredApiDatabase}`;
      environment.set(
        'HINDSIGHT_API_DATABASE_URL',
        restoredRemoteUrl.toString(),
      );
      environment.set('HINDSIGHT_API_LLM_TRACE_ENABLED', 'false');
      environment.set('HINDSIGHT_API_AUDIT_LOG_ENABLED', 'false');
      environment.set('HINDSIGHT_API_OTEL_TRACES_ENABLED', 'false');
      environment.set('HINDSIGHT_API_WORKER_ID', restoredApiContainer);
      const environmentPath = join(directory, 'api.env');
      await writeFile(
        environmentPath,
        [...environment].map(([key, value]) => `${key}=${value}`).join('\n'),
        { mode: 0o600 },
      );
      await docker([
        'run',
        '-d',
        '--name',
        restoredApiContainer,
        '--network',
        network,
        '-p',
        '127.0.0.1::8888',
        '--env-file',
        environmentPath,
        instance.Config.Image,
      ]);
      restoredStarted = true;
      const port = (
        await docker(['port', restoredApiContainer, '8888/tcp'])
      ).stdout.trim();

      if (!/^127\.0\.0\.1:\d+$/.test(port))
        throw new Error('Restore API must bind only loopback');
      const restoredUrl = `http://${port}`;
      const baseline = runtime(ledgerUrl(restoredLedgerDatabase), restoredUrl);
      clients.push(baseline);
      const readyDeadline = Date.now() + 120_000;

      while (true) {
        try {
          await baseline.gateway.ready();
          break;
        } catch {
          if (Date.now() >= readyDeadline)
            throw new Error('Restored API not ready');
          await sleep(1000);
        }
      }

      expect(await baseline.gateway.version()).toBe(HINDSIGHT_API_VERSION);
      expect(
        (await baseline.gateway.listFacts(bankId, documentId)).items
          .map(({ id }) => id)
          .sort(),
      ).toEqual(expectedFactIds);
      expect(
        await baseline.ledger.resolveReference(
          userId,
          sourceReferences[0]!.reference.id,
        ),
      ).not.toBeNull();
      expect(
        await baseline.prisma.hindsightCheckpoint.findUnique({
          where: { id: checkpoint.id },
        }),
      ).toEqual(checkpoint);
      const baselineHits = await baseline.access.search(
        userId,
        'Which language do I prefer for replies?',
        5,
      );

      expect(baselineHits.some(({ content }) => /English/i.test(content))).toBe(
        true,
      );
      expect(
        baselineHits.every(({ evidence }) => (evidence?.length ?? 0) > 0),
      ).toBe(true);
      expect(
        await baseline.ledger.resolveReference(
          'another-owner',
          sourceReferences[0]!.reference.id,
        ),
      ).toBeNull();
      checks.push(
        'restored API readiness, version, exact fact identities, evidence recall, and owner isolation',
      );

      phase = 'newer-suppression';
      const newer = runtime(ledgerUrl(newerLedgerDatabase), restoredUrl);
      clients.push(newer);
      expect(
        (await newer.gateway.listFacts(bankId, documentId)).total,
      ).toBeGreaterThan(0);
      expect(
        await newer.ledger.resolveReference(
          userId,
          sourceReferences[0]!.reference.id,
        ),
      ).toBeNull();
      expect(
        (
          await newer.access.search(
            userId,
            'Which language do I prefer for replies?',
            5,
          )
        ).some(({ content }) => /English/i.test(content)),
      ).toBe(false);
      expect(
        await newer.ledger.suppressedMessageIds(
          userId,
          languageSnapshot.source.sourceMessageIds,
        ),
      ).toEqual(languageSnapshot.source.sourceMessageIds);
      checks.push(
        'newer ledger immediately suppresses facts still present in older remote snapshot',
      );
      expect(
        (
          await newer.ledger.enqueue({
            userId,
            bankId,
            sourceKey: 'restore:re-extraction',
            kind: 'automatic',
            content: languageSnapshot.deliveries.at(-1)!.content!,
            checksum: languageSnapshot.source.checksum,
            sourceMessageIds: languageSnapshot.source.sourceMessageIds,
            conversationId: languageSnapshot.source.conversationId,
            eventAt: languageSnapshot.source.eventAt,
          })
        ).status,
      ).toBe('suppressed');
      await settle(newer, language, 'erased');
      expect((await newer.gateway.listFacts(bankId, documentId)).total).toBe(0);
      expect(
        (await newer.gateway.listFacts(bankId, cityDocumentId)).total,
      ).toBeGreaterThan(0);
      expect(
        (await newer.access.search(userId, 'What city do I live in?', 5)).some(
          ({ content }) => /Makassar/i.test(content),
        ),
      ).toBe(true);
      await newer.delivery.flushBank(bankId);
      expect((await newer.gateway.listFacts(bankId, documentId)).total).toBe(0);
      checks.push(
        'recovery physically erases forgotten document, preserves unrelated source, and survives retry',
      );

      phase = 'deleted-owner';
      expect(
        await new PrismaUserPrivacyRepository(newer.prisma).deleteAccount(
          userId,
        ),
      ).toBe(true);
      await newer.delivery.flushBank(bankId);
      expect((await newer.ledger.findBank(userId, namespace))?.state).toBe(
        'erased',
      );
      expect(
        await newer.ledger.ensureBank(userId, namespace, bankId),
      ).toBeNull();
      await newer.delivery.flushBank(bankId);
      await expect(
        newer.gateway.recall(bankId, {
          query: 'What city does the user live in?',
          timestamp: new Date().toISOString(),
          maxTokens: 800,
        }),
      ).rejects.toMatchObject({ status: 404, retryable: false });
      expect(
        await newer.access.search(userId, 'What city do I live in?', 5),
      ).toEqual([]);
      checks.push(
        'restored account deletion erases bank and repeated recovery cannot recreate it',
      );
      phase = 'complete';
      await writeFile(
        reportPath ?? join(tmpdir(), `sydia-memory-restore-${runId}.json`),
        JSON.stringify(
          {
            runId,
            startedAt,
            snapshotAt,
            completedAt: new Date().toISOString(),
            phase,
            apiVersion: HINDSIGHT_API_VERSION,
            imageDigest:
              'sha256:3c7b54a7e7dc92c3ad6a6b874aa9b3e96603b2c6fc4b215d9890a93578d2de99',
            syntheticSources: 2,
            pairedSnapshot: true,
            postSnapshotLedgerReplay: true,
            checks,
            limits: [
              'application writes paused for synthetic logical snapshots; background observations may continue',
              'newer coordination dump supplied explicitly; not automatic WAL/tombstone recovery',
            ],
          },
          null,
          2,
        ) + '\n',
        { mode: 0o600 },
      );
      process.stdout.write(
        `Restored API/paired ledger drill passed ${checks.length} checks.\n`,
      );
    } catch (error) {
      process.stderr.write(`Restore drill failed during ${phase}.\n`);
      throw error;
    } finally {
      if (restoredStarted) await docker(['rm', '-f', restoredApiContainer]);
      await source.gateway.deleteBank(bankId);
      await source.prisma.hindsightReference.deleteMany({
        where: { delivery: { source: { bankId } } },
      });
      await source.prisma.hindsightDelivery.deleteMany({
        where: { source: { bankId } },
      });
      await source.prisma.hindsightSource.deleteMany({ where: { bankId } });
      await source.prisma.hindsightBank.deleteMany({ where: { id: bankId } });
      await source.prisma.hindsightSuppression.deleteMany({
        where: { userId },
      });
      await source.prisma.hindsightCheckpoint.deleteMany({ where: { userId } });
      await source.prisma.user.deleteMany({ where: { id: userId } });
      for (const client of clients) await client.prisma.$disconnect();
      await drop(apiDatabaseContainer, 'hindsight', restoredApiDatabase);
      await drop(ledgerContainer, 'hindsight_contract', restoredLedgerDatabase);
      await drop(ledgerContainer, 'hindsight_contract', newerLedgerDatabase);
      await rm(directory, { recursive: true, force: true });
    }

    function config(db: string, url: string): ConfigService {
      return new ConfigService({
        BACKEND_DB_URL: db,
        BACKEND_MEMORY_ENGINE: 'hindsight',
        BACKEND_HINDSIGHT_URL: url,
        BACKEND_HINDSIGHT_API_KEY: apiKey,
        BACKEND_HINDSIGHT_NAMESPACE: namespace,
        BACKEND_HINDSIGHT_TIMEOUT_MS: 30000,
        BACKEND_HINDSIGHT_RECALL_TIMEOUT_MS: 20000,
      });
    }

    function runtime(db: string, url: string): Runtime {
      const settings = config(db, url);
      const prisma = new PrismaService(settings);
      const ledger = new PrismaHindsightRepository(prisma);
      const gateway = new HttpHindsightGateway(settings);
      const model = new OpenRouterLanguageModel(
        new ConfigService({
          BACKEND_MODEL_API_KEY: policyKey,
          BACKEND_MODEL_NAME: 'qwen/qwen3.8-flash',
          BACKEND_MODEL_BASE_URL:
            process.env.HINDSIGHT_POLICY_CONTRACT_BASE_URL,
        }),
        ObservabilityService.disabled(),
      );

      const policy = new MemoryPolicyService(model, createFactReviewer());

      return {
        prisma,
        ledger,
        gateway,
        delivery: new HindsightDeliveryService(
          ledger,
          gateway,
          settings,
          policy,
        ),
        access: new MemoryAccessService(
          new MemoryEngineService(settings),
          {} as MemoryService,
          new PrismaMemoryRepository(prisma),
          ledger,
          gateway,
          new PrismaConversationRepository(prisma),
          {
            memoryDeliveries: { add: () => Promise.resolve() },
          } as unknown as QueueService,
          new PrismaUserRepository(prisma),
          policy,
        ),
      };
    }

    function ledgerUrl(database: string): string {
      const url = new URL(databaseUrl!);
      url.pathname = `/${database}`;

      return url.toString();
    }

    async function save(evidence: string, content: string): Promise<string> {
      const conversation = await source.prisma.conversation.findFirstOrThrow({
        where: { userId },
      });

      const message = await source.prisma.message.create({
        data: {
          userId,
          conversationId: conversation.id,
          role: 'user',
          content: evidence,
        },
      });

      const receipt = (await source.access.create(
        userId,
        { content, sourceType: 'chat' },
        { sourceMessageId: message.id, idempotencyKey: randomUUID() },
      )) as MemoryMutationReceipt;

      expect(receipt.status).toBe('queued');

      return receipt.sourceIds![0]!;
    }

    async function settle(
      current: Runtime,
      sourceId: string,
      state: 'admitted' | 'erased',
    ): Promise<void> {
      const deadline = Date.now() + 120000;

      while (Date.now() < deadline) {
        await current.delivery.flushBank(bankId);
        const snapshot = await current.ledger.snapshot(userId, sourceId);
        if (
          snapshot?.deliveries.some(
            (delivery) =>
              delivery.generation === snapshot.source.generation &&
              delivery.state === state,
          )
        )
          return;
        await sleep(1000);
      }

      throw new Error(`Restored source did not reach ${state}`);
    }

    async function dump(
      container: string,
      user: string,
      database: string,
      file: string,
    ): Promise<void> {
      const result = await execute(
        'docker',
        ['exec', container, 'pg_dump', '-U', user, '-d', database, '-Fc'],
        { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
      );

      await writeFile(join(directory, file), result.stdout, { mode: 0o600 });
    }

    async function restore(
      container: string,
      user: string,
      database: string,
      file: string,
    ): Promise<void> {
      await docker(['exec', container, 'createdb', '-U', user, database]);
      const remoteFile = `/tmp/${suffix}-${file}`;
      await docker(['cp', join(directory, file), `${container}:${remoteFile}`]);

      try {
        await docker([
          'exec',
          container,
          'pg_restore',
          '-U',
          user,
          '-d',
          database,
          '--no-owner',
          '--no-privileges',
          '--exit-on-error',
          remoteFile,
        ]);
      } finally {
        await docker(['exec', container, 'rm', '-f', remoteFile]);
      }
    }

    async function drop(
      container: string,
      user: string,
      database: string,
    ): Promise<void> {
      await docker([
        'exec',
        container,
        'dropdb',
        '-U',
        user,
        '--if-exists',
        '--force',
        database,
      ]);
    }
  }, 600000);
});

async function docker(args: string[]): Promise<{ stdout: string }> {
  return execute('docker', args, { maxBuffer: 8 * 1024 * 1024 });
}
