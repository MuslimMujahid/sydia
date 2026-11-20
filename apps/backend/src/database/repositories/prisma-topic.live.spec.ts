import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma';
import { PrismaConversationRepository } from './prisma-conversation.repository';
import { PrismaTopicRepository } from './prisma-topic.repository';
import { PrismaUserPrivacyRepository } from './prisma-user-privacy.repository';

/**
 * Topic persistence contracts against PostgreSQL (docs/TOPIC_CONTEXT_SPEC.md).
 * Opt in with TOPIC_CONTRACT_ENABLED=true; fixtures use unique ids and are
 * removed afterwards. Run under scripts/test-lock.sh.
 */
const enabled = process.env.TOPIC_CONTRACT_ENABLED === 'true';
const at = new Date('2026-11-21T02:00:00.000Z');

(enabled ? describe : describe.skip)('Topic PostgreSQL contract', () => {
  let db: PrismaService;
  let topics: PrismaTopicRepository;
  let userId: string;
  let conversationId: string;

  beforeAll(async () => {
    db = new PrismaService(new ConfigService(process.env));
    await db.$connect();
    topics = new PrismaTopicRepository(db);
  });

  beforeEach(async () => {
    userId = `topic-contract-${randomUUID()}`;
    await db.user.create({
      data: {
        id: userId,
        name: 'Topic contract',
        email: `${userId}@example.test`,
        emailVerified: true,
        timezone: 'Asia/Jakarta',
        locale: 'id',
      },
    });
    conversationId = (
      await db.conversation.create({
        data: { userId, channel: 'telegram' },
        select: { id: true },
      })
    ).id;
  });

  afterEach(async () => {
    await db.user.deleteMany({ where: { id: userId } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  const message = (content: string, createdAt: Date, extra = {}) =>
    db.message.create({
      data: {
        conversationId,
        userId,
        role: 'user',
        content,
        createdAt,
        ...extra,
      },
      select: { id: true },
    });

  const newTopic = () =>
    topics.create({
      userId,
      label: 'Study tour anak',
      aliases: ['karyawisata'],
      episodeKey: 'episode-1',
      activeDay: 1,
      at,
    });

  test('counts each local day once, however many messages or jobs touch it', async () => {
    expect(await topics.touchActiveDay(userId, '2026-11-21')).toBe(1);
    expect(await topics.touchActiveDay(userId, '2026-11-21')).toBe(1);
    expect(
      await Promise.all([
        topics.touchActiveDay(userId, '2026-11-22'),
        topics.touchActiveDay(userId, '2026-11-22'),
      ]),
    ).toEqual([2, 2]);
    // A late job for an earlier day does not move the clock backwards.
    expect(await topics.touchActiveDay(userId, '2026-11-20')).toBe(2);
  });

  test('never re-adds a link the user removed', async () => {
    const topic = await newTopic();
    const reminder = { type: 'reminder' as const, id: 'r-1' };

    expect(await topics.linkItems(topic.id, [reminder], 'touched')).toBe(1);
    await db.topicLink.updateMany({
      where: { topicId: topic.id },
      data: { removedAt: new Date() },
    });

    expect(await topics.linkItems(topic.id, [reminder], 'touched')).toBe(0);
    expect(await topics.hasActionableLink(topic.id)).toBe(false);
    expect(await topics.topicsLinkedTo(userId, [reminder])).toEqual([]);
  });

  test('finds topics by their live links, scoped to the owner', async () => {
    const topic = await newTopic();
    await topics.linkItems(
      topic.id,
      [{ type: 'note', id: 'custom:n-1' }],
      'touched',
    );

    expect(
      await topics.topicsLinkedTo(userId, [{ type: 'note', id: 'custom:n-1' }]),
    ).toEqual([topic.id]);
    expect(
      await topics.topicsLinkedTo('someone-else', [
        { type: 'note', id: 'custom:n-1' },
      ]),
    ).toEqual([]);
  });

  test('records a salience event once per topic, episode and kind', async () => {
    const topic = await newTopic();
    const event = {
      topicId: topic.id,
      kind: 'assigned' as const,
      weight: 1,
      episodeKey: 'episode-2',
      conversationId,
      activeDay: 2,
    };

    expect(await topics.recordEvent(event)).toBe(true);
    expect(await topics.recordEvent(event)).toBe(false);
  });

  test('keeps only the newest claims of each kind', async () => {
    const topic = await newTopic();
    const limit = { decision: 2, next_step: 3, open_question: 5 };

    for (const text of ['first', 'second', 'third'])
      await topics.addClaims(
        topic.id,
        [{ kind: 'decision', text, explicit: true, messageId: null }],
        limit,
      );

    expect((await topics.claims([topic.id])).map(({ text }) => text)).toEqual([
      'third',
      'second',
    ]);
  });

  test('drops a claim when its message is masked or deleted', async () => {
    const topic = await newTopic();
    const masked = await message('Iuran belum dibayar', at);
    const deleted = await message('Berangkat jam tujuh', at);
    await topics.addClaims(
      topic.id,
      [
        {
          kind: 'open_question',
          text: 'Iuran',
          explicit: true,
          messageId: masked.id,
        },
        {
          kind: 'next_step',
          text: 'Jam tujuh',
          explicit: true,
          messageId: deleted.id,
        },
      ],
      { decision: 3, next_step: 3, open_question: 5 },
    );

    await new PrismaConversationRepository(db).maskUserMessage(
      userId,
      masked.id,
      '[disembunyikan]',
    );
    await db.message.delete({ where: { id: deleted.id } });

    expect(await topics.claims([topic.id])).toEqual([]);
  });

  test('reads messages after the cursor with the tool calls made for them', async () => {
    const before = await message('Lama', new Date(at.getTime() - 60_000));
    const current = await message('Study tour Selasa', at, {
      activeNoteRef: 'custom:open',
      sourceSegments: [
        {
          type: 'source',
          source: { kind: 'note', id: 'daily:2026-11-20', label: 'x' },
        },
      ],
    });

    for (const [inputMessageId, name] of [
      [before.id, 'create_task'],
      [current.id, 'create_reminder'],
    ] as const) {
      const run = await db.assistantRun.create({
        data: {
          conversationId,
          inputMessageId,
          idempotencyKey: randomUUID(),
          provider: 'test',
          model: 'test',
        },
        select: { id: true },
      });

      await db.toolInvocation.create({
        data: {
          assistantRunId: run.id,
          toolCallId: randomUUID(),
          name,
          label: name,
          arguments: {},
          idempotencyKey: randomUUID(),
          status: 'completed',
          result: { reminders: [{ id: 'r-1' }] },
        },
      });
    }

    const input = await topics.formationInput(
      userId,
      conversationId,
      new Date(at.getTime() - 30_000),
    );

    expect(input.messages).toEqual([
      expect.objectContaining({
        id: current.id,
        activeNoteRef: 'custom:open',
        sourceNoteRefs: ['daily:2026-11-20'],
      }),
    ]);
    expect(input.invocations).toEqual([
      expect.objectContaining({
        inputMessageId: current.id,
        name: 'create_reminder',
      }),
    ]);
  });

  test('exports topics and erases them with the account', async () => {
    const topic = await newTopic();
    await topics.addClaims(
      topic.id,
      [{ kind: 'decision', text: 'Ikut', explicit: true, messageId: null }],
      { decision: 3, next_step: 3, open_question: 5 },
    );

    const exported = await new PrismaUserPrivacyRepository(db).exportData(
      userId,
    );

    expect(exported?.user.topics).toEqual([
      expect.objectContaining({
        label: 'Study tour anak',
        claims: [expect.objectContaining({ text: 'Ikut' })],
      }),
    ]);

    await db.user.delete({ where: { id: userId } });
    expect(await db.topic.count({ where: { id: topic.id } })).toBe(0);
    expect(await db.topicClaim.count({ where: { topicId: topic.id } })).toBe(0);
  });
});
