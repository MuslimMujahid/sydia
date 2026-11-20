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
import { TopicLifecycleService } from '../../modules/topics/topic-lifecycle.service';

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

  test('reads linked items fresh, owner-scoped, without deleted or trashed ones', async () => {
    const topic = await newTopic();
    const now = new Date();
    const later = new Date(now.getTime() + 2 * 86_400_000);
    const pending = await db.reminder.create({
      data: {
        userId,
        title: 'Bayar iuran',
        scheduledAt: later,
        timezone: 'Asia/Jakarta',
      },
      select: { id: true },
    });

    const past = await db.reminder.create({
      data: {
        userId,
        title: 'Lama',
        scheduledAt: new Date(now.getTime() - 86_400_000),
        timezone: 'Asia/Jakarta',
      },
      select: { id: true },
    });

    const done = await db.task.create({
      data: { userId, title: 'Beli tas', status: 'done', completedAt: now },
      select: { id: true },
    });

    const cancelled = await db.calendarEvent.create({
      data: {
        userId,
        title: 'Rapat',
        startAt: later,
        endAt: new Date(later.getTime() + 3_600_000),
        status: 'cancelled',
      },
      select: { id: true },
    });

    const trashed = await db.workspaceItem.create({
      data: {
        userId,
        kind: 'note',
        title: 'Dibuang',
        trashedAt: now,
        content: { type: 'doc', content: [] },
      },
      select: { id: true },
    });

    const otherUser = `${userId}-other`;
    await db.user.create({
      data: {
        id: otherUser,
        name: 'Other',
        email: `${otherUser}@example.test`,
        emailVerified: true,
        timezone: 'Asia/Jakarta',
        locale: 'id',
      },
    });
    const foreign = await db.reminder.create({
      data: {
        userId: otherUser,
        title: 'Punya orang',
        scheduledAt: later,
        timezone: 'Asia/Jakarta',
      },
      select: { id: true },
    });

    try {
      await topics.linkItems(
        topic.id,
        [
          { type: 'reminder', id: pending.id },
          { type: 'reminder', id: past.id },
          { type: 'task', id: done.id },
          { type: 'calendar_event', id: cancelled.id },
          { type: 'note', id: `custom:${trashed.id}` },
          { type: 'reminder', id: foreign.id },
          { type: 'reminder', id: 'deleted-reminder' },
        ],
        'touched',
      );

      const items = await topics.linkedItems(userId, [topic.id], now);
      const byTitle = Object.fromEntries(
        items.map((item) => [item.title, item]),
      );

      expect(Object.keys(byTitle).sort()).toEqual([
        'Bayar iuran',
        'Beli tas',
        'Lama',
        'Rapat',
      ]);
      expect(byTitle['Bayar iuran']).toMatchObject({
        active: true,
        status: 'pending',
        when: later,
      });
      expect(byTitle.Lama).toMatchObject({ active: false, status: 'past' });
      expect(byTitle['Beli tas']).toMatchObject({
        active: false,
        status: 'done',
      });
      expect(byTitle.Rapat).toMatchObject({
        active: false,
        status: 'cancelled',
      });
    } finally {
      await db.user.deleteMany({ where: { id: otherUser } });
    }
  });

  test('suppresses a topic from a point in the conversation on', async () => {
    const topic = await newTopic();
    const before = new Date(Date.now() - 1000);
    await topics.suppress(topic.id, conversationId);

    expect(await topics.suppressedTopicIds(conversationId, before)).toEqual([
      topic.id,
    ]);
    expect(
      await topics.suppressedTopicIds(
        conversationId,
        new Date(Date.now() + 60_000),
      ),
    ).toEqual([]);
  });

  test('removes a link once and keeps it from coming back', async () => {
    const topic = await newTopic();
    const reminder = { type: 'reminder' as const, id: 'r-1' };
    await topics.linkItems(topic.id, [reminder], 'touched');

    expect(await topics.removeLink(userId, topic.id, reminder)).toBe(true);
    expect(await topics.removeLink(userId, topic.id, reminder)).toBe(false);
    expect(await topics.linkItems(topic.id, [reminder], 'touched')).toBe(0);
    expect(await topics.removeLink('someone-else', topic.id, reminder)).toBe(
      false,
    );
  });

  test('deletes a topic with everything derived for it, only for its owner', async () => {
    const topic = await newTopic();
    await topics.linkItems(topic.id, [{ type: 'task', id: 't-1' }], 'touched');
    await topics.suppress(topic.id, conversationId);

    expect(await topics.deleteTopic('someone-else', topic.id)).toBe(false);
    expect(await topics.deleteTopic(userId, topic.id)).toBe(true);
    expect(await db.topicLink.count({ where: { topicId: topic.id } })).toBe(0);
    expect(
      await db.topicSuppression.count({ where: { topicId: topic.id } }),
    ).toBe(0);
  });

  test('returns the recognition logged during a turn', async () => {
    const current = await message('Iuran study tour', at);
    await topics.logRecognition({
      userId,
      conversationId,
      messageId: current.id,
      mode: 'enabled',
      candidates: [
        {
          topicId: 't-1',
          status: 'active',
          similarity: 0.6,
          salience: 1,
          score: 0.65,
          offered: true,
        },
      ],
      choice: 't-1',
      confidence: 0.9,
      accepted: true,
      assignedTopicId: null,
    });

    expect(await topics.recognitionFor(current.id)).toMatchObject({
      choice: 't-1',
      topicId: 't-1',
      candidates: [expect.objectContaining({ topicId: 't-1', offered: true })],
    });
  });

  test('the daily sweep retires quiet topics but keeps ones with a pending reminder', async () => {
    // 40 active days have passed since these topics last changed status.
    await db.topicUserState.create({
      data: { userId, activeDays: 40, lastActiveDay: '2026-11-21' },
    });
    const make = (label: string, data: Record<string, unknown>) =>
      db.topic.create({
        data: {
          userId,
          label,
          status: 'active',
          salience: 1,
          salienceAtActiveDay: 0,
          statusAtActiveDay: 0,
          ...data,
        },
        select: { id: true },
      });

    const quiet = await make('Quiet', {});
    const pending = await make('Pending', {});
    const guess = await make('Old guess', {
      status: 'candidate',
      createdAt: new Date(Date.now() - 40 * 86_400_000),
    });

    const reminder = await db.reminder.create({
      data: {
        userId,
        title: 'Bayar',
        scheduledAt: new Date(Date.now() + 86_400_000),
        timezone: 'Asia/Jakarta',
      },
      select: { id: true },
    });

    await topics.linkItems(
      pending.id,
      [{ type: 'reminder', id: reminder.id }],
      'touched',
    );

    const counts = await new TopicLifecycleService(topics).sweepUser(
      userId,
      new Date(),
    );

    expect(counts).toEqual({ dormant: 1, dismissed: 0, deleted: 1 });
    expect(
      await db.topic.findUnique({
        where: { id: quiet.id },
        select: { status: true, statusAtActiveDay: true },
      }),
    ).toEqual({ status: 'dormant', statusAtActiveDay: 40 });
    expect(
      (
        await db.topic.findUnique({
          where: { id: pending.id },
          select: { status: true },
        })
      )?.status,
    ).toBe('active');
    expect(await db.topic.count({ where: { id: guess.id } })).toBe(0);
    expect(await topics.usersWithTopics()).toContain(userId);
  });
});
