import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../../src/infra/prisma';
import type { MemoryDreamJob } from '../../src/infra/queue';

const enabled = process.env.OPTIMIZATION_CUTOVER_E2E === 'true';
const base = process.env.OPTIMIZATION_CUTOVER_URL ?? 'http://127.0.0.1:5000';
if (enabled && new URL(base).hostname !== '127.0.0.1')
  throw new Error('Cutover E2E is restricted to the local deployment');

type Tool = { name: string; status: string; assistantRunId: string };
type Detail = {
  messages: Array<{ id: string; role: string; content: string }>;
  assistantRuns: Array<{
    id: string;
    status: string;
    assistantMessageId: string;
    errorMessage?: string;
  }>;
  toolInvocations: Tool[];
};
type Archive = {
  hindsightMemory: {
    sources: Array<{ facts: Array<{ text: string }>; input: unknown }>;
  };
};

(enabled ? describe : describe.skip)(
  'Accepted optimization deployment E2E',
  () => {
    test('executes tools, admits explicit and automatic facts, recalls, forgets and erases its synthetic account', async () => {
      const id = randomUUID();
      const checks: string[] = [];
      const turns: Array<{
        label: string;
        latencyMs: number;
        tools: string[];
        retries: number;
      }> = [];

      const prisma = new PrismaService(new ConfigService(process.env));
      const queue = new Queue<MemoryDreamJob>('memory-dreams', {
        connection: { url: process.env.BACKEND_REDIS_URL! },
      });

      let cookie = '';
      let userId = '';
      let bankId = '';

      async function api<T>(
        path: string,
        method = 'GET',
        body?: unknown,
      ): Promise<T> {
        const response = await fetch(`${base}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Origin:
              process.env.FRONTEND_URL?.split(',')[0] ??
              'http://localhost:3000',
            Cookie: cookie,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(180000),
        });

        if (!response.ok)
          throw new Error(`${method} ${path}: HTTP ${response.status}`);
        const result = (await response.json()) as { data?: T };

        return (result.data ?? result) as T;
      }

      async function waitFor(
        check: () => Promise<boolean>,
        label: string,
      ): Promise<void> {
        const deadline = Date.now() + 180000;

        while (Date.now() < deadline) {
          if (await check()) {
            checks.push(label);
            console.log(`PASS: ${label}`);

            return;
          }

          await sleep(1500);
        }

        throw new Error(`Timed out: ${label}`);
      }

      async function turn(
        label: string,
        content: string,
        conversationId?: string,
      ) {
        const started = performance.now();
        const sent = await api<{
          conversation: { id: string };
          assistantRun: { id: string };
        }>('/conversations/messages', 'POST', {
          content,
          conversationId,
          idempotencyKey: randomUUID(),
        });

        let detail: Detail | undefined;
        let retries = 0;
        await waitFor(async () => {
          detail = await api<Detail>(`/conversations/${sent.conversation.id}`);
          const run = detail.assistantRuns.find(
            ({ id: runId }) => runId === sent.assistantRun.id,
          );

          if (run?.status === 'failed') {
            const attempted = detail.toolInvocations.filter(
              ({ assistantRunId }) => assistantRunId === run.id,
            );

            // Exercise the real retry endpoint only before any tool execution.
            // A mutation whose outcome is unknown must never be replayed here.
            if (retries >= 2 || attempted.length > 0)
              throw new Error(
                `Assistant failed: ${label}: ${run.errorMessage ?? 'no diagnostic'}`,
              );
            retries++;
            console.log(`RETRY: ${label} (${retries}) before tool execution`);
            const retried = await api<{ assistantRun: { id: string } }>(
              `/conversations/${sent.conversation.id}/runs/${run.id}/retry`,
              'POST',
              {},
            );

            sent.assistantRun = retried.assistantRun;

            return false;
          }

          return run?.status === 'completed';
        }, `completed ${label}`);
        const tools = detail!.toolInvocations.filter(
          ({ assistantRunId }) => assistantRunId === sent.assistantRun.id,
        );

        expect(tools.every(({ status }) => status === 'completed')).toBe(true);
        turns.push({
          label,
          latencyMs: performance.now() - started,
          tools: tools.map(({ name }) => name),
          retries,
        });

        return { sent, detail: detail!, tools };
      }

      async function facts(): Promise<string[]> {
        const archive = await api<Archive>('/users/me/export');

        return archive.hindsightMemory.sources.flatMap(({ facts }) =>
          facts.map(({ text }) => text),
        );
      }

      try {
        await waitFor(async () => {
          try {
            return (await fetch(`${base}/`)).ok;
          } catch {
            return false;
          }
        }, 'API ready');
        const signup = await fetch(`${base}/api/auth/sign-up/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin:
              process.env.FRONTEND_URL?.split(',')[0] ??
              'http://localhost:3000',
          },
          body: JSON.stringify({
            name: 'Synthetic optimization E2E',
            email: `optimization-${id}@example.invalid`,
            password: randomUUID(),
          }),
        });

        expect(signup.status).toBe(200);
        cookie = signup.headers
          .getSetCookie()
          .map((value) => value.split(';')[0])
          .join('; ');
        const identity = (await signup.json()) as { user: { id: string } };
        userId = identity.user.id;
        bankId = `${process.env.BACKEND_HINDSIGHT_NAMESPACE}-${createHash('sha256').update(userId).digest('hex')}`;
        await api('/users/me', 'PATCH', {
          locale: 'en',
          timezone: 'Asia/Makassar',
        });
        await api('/users/me/preferences', 'PATCH', {
          automaticMemoryEnabled: true,
          briefingEnabled: false,
          webNotificationsEnabled: false,
          telegramNotificationsEnabled: false,
          whatsappNotificationsEnabled: false,
        });
        expect(
          (await fetch(`${base}/memories`, { headers: { Cookie: cookie } }))
            .status,
        ).toBe(409);
        checks.push('legacy memory REST fenced');
        const plain = await turn('no domain tools', 'What is 2 plus 2?');
        expect(
          plain.tools.filter(({ name }) => name !== 'completeTurn'),
        ).toHaveLength(0);
        const task = await turn(
          'task with dependencies',
          `Create a task titled Synthetic optimization ${id}. No due date.`,
        );

        expect(task.tools.some(({ name }) => name === 'create_task')).toBe(
          true,
        );
        expect(
          await prisma.task.count({
            where: { userId, title: `Synthetic optimization ${id}` },
          }),
        ).toBe(1);
        await turn('explicit remember', 'Remember that I prefer jasmine tea.');
        await waitFor(
          async () => (await facts()).some((text) => /jasmine/i.test(text)),
          'explicit fact admitted by worker',
        );
        const automatic = await turn(
          'automatic durable fact',
          'I practice watercolor painting every Sunday morning. Just acknowledge this.',
        );

        const continuation = await turn(
          'automatic segment continuation',
          'Thanks!',
          automatic.sent.conversation.id,
        );

        const messageId = continuation.detail.messages.at(-1)!.id;

        await queue.add(
          'dream',
          {
            kind: 'dream',
            userId,
            conversationId: automatic.sent.conversation.id,
            throughMessageId: messageId,
            allowShortSegment: true,
          },
          {
            jobId: `optimization-e2e-${id}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
        await waitFor(
          async () => (await facts()).some((text) => /watercolor/i.test(text)),
          'automatic fact admitted through eligibility and fact review',
        );
        expect(await prisma.memory.count({ where: { userId } })).toBe(0);
        checks.push('legacy memory writer remains inactive');
        const recall = await turn(
          'recall in new conversation',
          'What kind of tea do I prefer, and what do I practice on Sunday mornings?',
        );

        const answer = recall.detail.messages
          .filter(({ role }) => role === 'assistant')
          .map(({ content }) => content)
          .join(' ');

        expect(answer).toMatch(/jasmine/i);
        expect(answer).toMatch(/watercolor/i);
        checks.push('recall answers both admitted facts');
        const factDeliveryIds = (
          await prisma.hindsightDelivery.findMany({
            where: { source: { bankId }, references: { some: {} } },
            select: { id: true },
          })
        ).map(({ id: deliveryId }) => deliveryId);

        expect(factDeliveryIds.length).toBeGreaterThanOrEqual(2);
        await turn(
          'forget scoped facts',
          'Forget that I prefer jasmine tea and that I practice watercolor painting every Sunday morning.',
        );
        await waitFor(
          async () => (await facts()).length === 0,
          'forget immediately removes recalled facts',
        );
        await waitFor(
          async () =>
            (await prisma.hindsightDelivery.count({
              where: { id: { in: factDeliveryIds }, state: { not: 'erased' } },
            })) === 0,
          'worker physically erases source generations',
        );
        await api('/users/me/preferences', 'PATCH', {
          automaticMemoryEnabled: false,
        });
        const optedOut = await turn(
          'automatic memory opt out',
          'I enjoy origami every Saturday. Just acknowledge.',
        );

        const optedOutJob = await queue.add(
          'dream',
          {
            kind: 'dream',
            userId,
            conversationId: optedOut.sent.conversation.id,
            throughMessageId: optedOut.detail.messages.find(
              ({ role }) => role === 'user',
            )!.id,
            allowShortSegment: true,
          },
          {
            jobId: `optimization-e2e-optout-${id}`,
            removeOnComplete: false,
            removeOnFail: false,
          },
        );

        await waitFor(async () => {
          const state = await optedOutJob.getState();
          if (state === 'failed') throw new Error('Opt-out worker job failed');

          return state === 'completed';
        }, 'worker completed opt-out job');
        await optedOutJob.remove();
        expect(
          await prisma.hindsightSource.count({
            where: { bankId, conversationId: optedOut.sent.conversation.id },
          }),
        ).toBe(0);
        checks.push('opt out prevents automatic ingestion');
      } finally {
        if (userId) {
          await api('/users/me', 'DELETE');
          expect(
            (await fetch(`${base}/users/me`, { headers: { Cookie: cookie } }))
              .status,
          ).toBe(401);
          if (await prisma.hindsightBank.findUnique({ where: { id: bankId } }))
            await waitFor(
              async () =>
                (
                  await prisma.hindsightBank.findUnique({
                    where: { id: bankId },
                  })
                )?.state === 'erased',
              'deleted account bank erased and session rejected',
            );
          const jobs = await queue.getJobs(['waiting', 'delayed']);
          for (const job of jobs)
            if (job.data.userId === userId) await job.remove();
        }

        await queue.close();
        await prisma.$disconnect();
        writeFileSync(
          '/tmp/sydia-optimization-cutover-e2e.json',
          JSON.stringify({ checks, turns }, null, 2),
          { mode: 0o600 },
        );
      }
    }, 900000);
  },
);
