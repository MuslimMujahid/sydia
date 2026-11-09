import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/infra/prisma';
import { PrismaConversationRepository } from '../src/database/repositories';
import type { ExecutionPlanWrite } from '../src/database/entities';

describe('Durable assistant execution plans', () => {
  const owner = `execution-plan-${randomUUID()}`;
  const outsider = `execution-plan-${randomUUID()}`;
  const claimedAt = new Date('2026-11-09T00:00:00Z');
  let db: PrismaService;
  let repository: PrismaConversationRepository;
  let input: ExecutionPlanWrite;

  beforeAll(async () => {
    db = new PrismaService(new ConfigService());
    repository = new PrismaConversationRepository(db);
    await db.user.createMany({
      data: [
        { id: owner, name: 'Plan owner', email: `${owner}@test.invalid` },
        {
          id: outsider,
          name: 'Other owner',
          email: `${outsider}@test.invalid`,
        },
      ],
    });
  });

  beforeEach(async () => {
    const conversation = await db.conversation.create({
      data: { userId: owner },
    });

    const message = await db.message.create({
      data: {
        conversationId: conversation.id,
        userId: owner,
        role: 'user',
        content: 'Save the results and summarize them.',
        createdAt: claimedAt,
      },
    });

    const run = await repository.createRun({
      conversationId: conversation.id,
      inputMessageId: message.id,
      idempotencyKey: randomUUID(),
      provider: 'test',
      model: 'test',
    });

    await repository.claimRun(run.id, claimedAt, claimedAt);
    input = {
      userId: owner,
      conversationId: conversation.id,
      runId: run.id,
      sourceMessageId: message.id,
      claimStartedAt: claimedAt,
      idempotencyKey: randomUUID(),
      revision: 0,
      steps: [
        {
          id: 'summary',
          description: 'Summarize the results',
          status: 'pending',
        },
      ],
    };
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [owner, outsider] } } });
    await db.onModuleDestroy();
  });

  it('restores the latest revision from a fresh repository and retains its history', async () => {
    await repository.saveExecutionPlan(input);
    await repository.saveExecutionPlan({
      ...input,
      revision: 1,
      idempotencyKey: randomUUID(),
      steps: [
        {
          id: 'summary',
          description: 'Summarize the results',
          status: 'completed',
        },
      ],
    });

    const restored = await new PrismaConversationRepository(
      db,
    ).findExecutionPlan(owner, input.conversationId);

    expect(restored).toMatchObject({
      revision: 2,
      steps: [{ status: 'completed' }],
    });
    expect(
      await db.assistantPlanRevision.count({
        where: { conversationId: input.conversationId },
      }),
    ).toBe(2);
  });

  it('replays an acknowledged write without appending another revision', async () => {
    const first = await repository.saveExecutionPlan(input);
    const replay = await repository.saveExecutionPlan(input);

    expect(replay).toEqual(first);
    expect(
      await db.assistantPlanRevision.count({
        where: { conversationId: input.conversationId },
      }),
    ).toBe(1);
  });

  it('rejects an outdated expected revision', async () => {
    await repository.saveExecutionPlan(input);

    await expect(
      repository.saveExecutionPlan({ ...input, idempotencyKey: randomUUID() }),
    ).rejects.toThrow('revision changed');
  });

  it('does not reveal a different owner’s plan', async () => {
    await repository.saveExecutionPlan(input);

    expect(
      await repository.findExecutionPlan(outsider, input.conversationId),
    ).toBeNull();
  });

  it('rejects a different owner’s write', async () => {
    await expect(
      repository.saveExecutionPlan({ ...input, userId: outsider }),
    ).rejects.toThrow('superseded');
  });

  it('rejects a worker after its run has been reclaimed', async () => {
    await repository.claimRun(
      input.runId,
      new Date('2026-11-09T00:00:01Z'),
      new Date('2026-11-09T00:00:02Z'),
    );

    await expect(repository.saveExecutionPlan(input)).rejects.toThrow(
      'superseded',
    );
  });

  it('rejects work superseded by a later user message', async () => {
    await db.message.create({
      data: {
        conversationId: input.conversationId,
        userId: owner,
        role: 'user',
        content: 'Cancel that work.',
        createdAt: new Date('2026-11-09T00:00:01Z'),
      },
    });

    await expect(repository.saveExecutionPlan(input)).rejects.toThrow(
      'superseded',
    );
  });

  it('serializes concurrent first writes instead of losing one', async () => {
    const writes = await Promise.allSettled([
      repository.saveExecutionPlan(input),
      repository.saveExecutionPlan({ ...input, idempotencyKey: randomUUID() }),
    ]);

    expect(writes.map((write) => write.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(
      await db.assistantPlanRevision.count({
        where: { conversationId: input.conversationId },
      }),
    ).toBe(1);
  });
});
