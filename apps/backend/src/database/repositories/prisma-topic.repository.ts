import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import {
  isTopicClaimKind,
  isTopicStatus,
  type Topic,
  type TopicClaim,
  type TopicClaimKind,
  type TopicConversationState,
  type TopicItemRef,
  type TopicItemSummary,
  type TopicItemType,
  type TopicLinkOrigin,
  type TopicSourceInvocation,
  type TopicSourceMessage,
  type TopicStatus,
} from '../entities';
import type {
  ITopicRepository,
  NewTopic,
  NewTopicClaim,
  NewTopicEvent,
  NewTopicRecognitionLog,
  TopicRecognitionCandidateLog,
  TopicUpdate,
} from '../interfaces';

const OPEN_OCCURRENCE = ['pending', 'snoozed'];
const LINK_ORIGINS = new Set(['touched', 'user_stated', 'inferred']);

function dateKey(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

const topicSelect = {
  id: true,
  userId: true,
  label: true,
  aliases: true,
  embedding: true,
  status: true,
  salience: true,
  salienceAtActiveDay: true,
  gateCutoffOffset: true,
  gateOffsetAtActiveDay: true,
  episodeCount: true,
  lastEpisodeKey: true,
  lastActiveAt: true,
  createdAt: true,
} as const satisfies Prisma.TopicSelect;

type TopicRow = Prisma.TopicGetPayload<{ select: typeof topicSelect }>;

function toTopic(row: TopicRow): Topic {
  if (!isTopicStatus(row.status))
    throw new Error(`Topic ${row.id} has an unknown status.`);

  return { ...row, status: row.status };
}

/** Note refs a message's selected sources point at (`custom:`/`daily:`). */
function sourceNoteRefs(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((segment) => {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment))
      return [];
    const source = (segment as Record<string, unknown>).source;
    if (!source || typeof source !== 'object') return [];
    const { kind, id } = source as Record<string, unknown>;

    return kind === 'note' && typeof id === 'string' ? [id] : [];
  });
}

@Injectable()
export class PrismaTopicRepository implements ITopicRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, statuses: readonly TopicStatus[]) {
    const rows = await this.prisma.topic.findMany({
      where: { userId, status: { in: [...statuses] } },
      orderBy: [{ lastActiveAt: 'desc' }, { id: 'asc' }],
      select: topicSelect,
    });

    return rows.map(toTopic);
  }

  async claims(topicIds: readonly string[]): Promise<TopicClaim[]> {
    if (!topicIds.length) return [];
    const rows = await this.prisma.topicClaim.findMany({
      where: { topicId: { in: [...topicIds] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        topicId: true,
        kind: true,
        text: true,
        explicit: true,
        messageId: true,
        createdAt: true,
      },
    });

    return rows.flatMap((row) =>
      isTopicClaimKind(row.kind) ? [{ ...row, kind: row.kind }] : [],
    );
  }

  async topicsLinkedTo(userId: string, items: readonly TopicItemRef[]) {
    if (!items.length) return [];
    const rows = await this.prisma.topicLink.findMany({
      where: {
        removedAt: null,
        topic: { userId },
        OR: items.map((item) => ({ itemType: item.type, itemId: item.id })),
      },
      distinct: ['topicId'],
      select: { topicId: true },
    });

    return rows.map((row) => row.topicId);
  }

  async hasActionableLink(topicId: string): Promise<boolean> {
    const link = await this.prisma.topicLink.findFirst({
      where: {
        topicId,
        removedAt: null,
        itemType: { in: ['reminder', 'task', 'calendar_event'] },
      },
      select: { id: true },
    });

    return link !== null;
  }

  async create(input: NewTopic): Promise<Topic> {
    const row = await this.prisma.topic.create({
      data: {
        userId: input.userId,
        label: input.label,
        aliases: input.aliases,
        salience: 1,
        salienceAtActiveDay: input.activeDay,
        episodeCount: 1,
        lastEpisodeKey: input.episodeKey,
        lastActiveAt: input.at,
      },
      select: topicSelect,
    });

    return toTopic(row);
  }

  async update(userId: string, topicId: string, patch: TopicUpdate) {
    const { count } = await this.prisma.topic.updateMany({
      where: { id: topicId, userId },
      data: patch,
    });

    if (count !== 1) throw new Error(`Topic ${topicId} is not owned.`);
  }

  async linkItems(
    topicId: string,
    items: readonly TopicItemRef[],
    origin: TopicLinkOrigin,
  ): Promise<number> {
    if (!items.length) return 0;
    // An existing row, removed or not, is left alone: a removed link is the
    // user's suppression and must never come back.
    const { count } = await this.prisma.topicLink.createMany({
      data: items.map((item) => ({
        topicId,
        itemType: item.type,
        itemId: item.id,
        origin,
      })),
      skipDuplicates: true,
    });

    return count;
  }

  async addClaims(
    topicId: string,
    claims: readonly NewTopicClaim[],
    limit: Readonly<Record<TopicClaimKind, number>>,
  ) {
    if (!claims.length) return;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.topicClaim.createMany({
        data: claims.map((claim) => ({ topicId, ...claim })),
      });

      for (const kind of new Set(claims.map((claim) => claim.kind))) {
        const stale = await transaction.topicClaim.findMany({
          where: { topicId, kind },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: limit[kind],
          select: { id: true },
        });

        if (stale.length)
          await transaction.topicClaim.deleteMany({
            where: { id: { in: stale.map((claim) => claim.id) } },
          });
      }
    });
  }

  async removeClaims(topicId: string, claimIds: readonly string[]) {
    if (!claimIds.length) return;

    await this.prisma.topicClaim.deleteMany({
      where: { topicId, id: { in: [...claimIds] } },
    });
  }

  async recordEvent(input: NewTopicEvent): Promise<boolean> {
    const { count } = await this.prisma.topicEvent.createMany({
      data: [input],
      skipDuplicates: true,
    });

    return count === 1;
  }

  conversationState(
    conversationId: string,
  ): Promise<TopicConversationState | null> {
    return this.prisma.topicConversationState.findUnique({
      where: { conversationId },
      select: {
        conversationId: true,
        userId: true,
        processedThroughAt: true,
        episodeKey: true,
        episodeStartedAt: true,
        lastUserMessageAt: true,
        currentTopicId: true,
        noneStreak: true,
      },
    });
  }

  async saveConversationState(state: TopicConversationState) {
    const { conversationId, ...data } = state;

    await this.prisma.topicConversationState.upsert({
      where: { conversationId },
      create: state,
      update: data,
    });
  }

  async touchActiveDay(userId: string, localDay: string): Promise<number> {
    // One statement, so concurrent jobs for the same owner count a day once.
    const rows = await this.prisma.$queryRaw<Array<{ activeDays: number }>>`
      INSERT INTO "topic_user_state" ("userId", "activeDays", "lastActiveDay", "updatedAt")
      VALUES (${userId}, 1, ${localDay}, NOW())
      ON CONFLICT ("userId") DO UPDATE SET
        "activeDays" = CASE
          WHEN "topic_user_state"."lastActiveDay" IS NULL
            OR "topic_user_state"."lastActiveDay" < EXCLUDED."lastActiveDay"
          THEN "topic_user_state"."activeDays" + 1
          ELSE "topic_user_state"."activeDays"
        END,
        "lastActiveDay" = GREATEST(
          COALESCE("topic_user_state"."lastActiveDay", EXCLUDED."lastActiveDay"),
          EXCLUDED."lastActiveDay"
        ),
        "updatedAt" = NOW()
      RETURNING "activeDays"
    `;

    const count = rows[0]?.activeDays;
    if (typeof count !== 'number')
      throw new Error('Active-day clock update returned no row.');

    return count;
  }

  async formationInput(
    userId: string,
    conversationId: string,
    after: Date | null,
  ): Promise<{
    messages: TopicSourceMessage[];
    invocations: TopicSourceInvocation[];
  }> {
    const rows = await this.prisma.message.findMany({
      where: {
        userId,
        conversationId,
        ...(after ? { createdAt: { gt: after } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        activeNoteRef: true,
        sourceSegments: true,
        sourceDocumentIds: true,
      },
    });

    const userMessageIds = rows
      .filter((row) => row.role === 'user')
      .map((row) => row.id);

    const invocations = userMessageIds.length
      ? await this.prisma.toolInvocation.findMany({
          where: {
            status: 'completed',
            assistantRun: {
              conversationId,
              conversation: { userId },
              inputMessageId: { in: userMessageIds },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            name: true,
            arguments: true,
            result: true,
            assistantRun: { select: { inputMessageId: true } },
          },
        })
      : [];

    return {
      messages: rows.map(({ sourceSegments, ...row }) => ({
        ...row,
        sourceNoteRefs: sourceNoteRefs(sourceSegments),
      })),
      invocations: invocations.map(({ assistantRun, ...invocation }) => ({
        ...invocation,
        inputMessageId: assistantRun.inputMessageId,
      })),
    };
  }

  async logRecognition(input: NewTopicRecognitionLog) {
    const { candidates, ...rest } = input;

    await this.prisma.topicRecognitionLog.upsert({
      where: { messageId: input.messageId },
      create: { ...rest, candidates },
      update: { ...rest, candidates },
    });
  }

  async recognitionFor(messageId: string) {
    const row = await this.prisma.topicRecognitionLog.findUnique({
      where: { messageId },
      select: {
        candidates: true,
        choice: true,
        confidence: true,
        accepted: true,
      },
    });

    if (!row) return null;

    return {
      candidates: (Array.isArray(row.candidates)
        ? row.candidates
        : []) as unknown as TopicRecognitionCandidateLog[],
      choice: row.choice,
      confidence: row.confidence,
      topicId: row.accepted ? row.choice : null,
    };
  }

  async find(userId: string, topicId: string): Promise<Topic | null> {
    const row = await this.prisma.topic.findFirst({
      where: { id: topicId, userId },
      select: topicSelect,
    });

    return row ? toTopic(row) : null;
  }

  async linkedItems(
    userId: string,
    topicIds: readonly string[],
    now: Date,
  ): Promise<TopicItemSummary[]> {
    if (!topicIds.length) return [];
    const links = await this.prisma.topicLink.findMany({
      where: {
        topicId: { in: [...topicIds] },
        removedAt: null,
        topic: { userId },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        topicId: true,
        itemType: true,
        itemId: true,
        origin: true,
        createdAt: true,
      },
    });

    const ids = (type: TopicItemType, prefix = '') => [
      ...new Set(
        links
          .filter(
            (link) => link.itemType === type && link.itemId.startsWith(prefix),
          )
          .map((link) => link.itemId.slice(prefix.length)),
      ),
    ];

    const today = dateKey(now)!;

    // Every read is owner-scoped, so a link can never expose another user's item.
    const [reminders, tasks, events, notes, dailies, contacts, documents] =
      await Promise.all([
        this.prisma.reminder.findMany({
          where: { userId, id: { in: ids('reminder') } },
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            recurrence: true,
            occurrences: {
              where: {
                OR: [
                  {
                    status: { in: OPEN_OCCURRENCE },
                    occurrenceAt: { gte: now },
                  },
                  { status: 'awaiting_ack' },
                ],
              },
              orderBy: { occurrenceAt: 'asc' },
              take: 3,
              select: { occurrenceAt: true, status: true },
            },
          },
        }),
        this.prisma.task.findMany({
          where: { userId, id: { in: ids('task') } },
          select: {
            id: true,
            title: true,
            status: true,
            dueAt: true,
            completedAt: true,
          },
        }),
        this.prisma.calendarEvent.findMany({
          where: { userId, id: { in: ids('calendar_event') } },
          select: {
            id: true,
            title: true,
            startAt: true,
            endAt: true,
            allDayStartDate: true,
            allDayEndDate: true,
            recurrence: true,
            status: true,
          },
        }),
        this.prisma.workspaceItem.findMany({
          where: {
            userId,
            id: { in: ids('note', 'custom:') },
            kind: 'note',
            trashedAt: null,
          },
          select: { id: true, title: true },
        }),
        this.prisma.dailyNote.findMany({
          where: { userId, date: { in: ids('note', 'daily:') } },
          select: { date: true },
        }),
        this.prisma.contact.findMany({
          where: { userId, id: { in: ids('contact') } },
          select: { id: true, name: true },
        }),
        this.prisma.document.findMany({
          where: { userId, id: { in: ids('document') } },
          select: { id: true, title: true, status: true },
        }),
      ]);

    const found = new Map<
      string,
      Omit<TopicItemSummary, 'topicId' | 'origin' | 'linkedAt'>
    >();

    const put = (
      item: Omit<TopicItemSummary, 'topicId' | 'origin' | 'linkedAt'>,
    ) => found.set(`${item.type}:${item.id}`, item);

    for (const reminder of reminders) {
      const awaiting = reminder.occurrences.find(
        (o) => o.status === 'awaiting_ack',
      );

      const next =
        reminder.occurrences.find((o) => o.status !== 'awaiting_ack')
          ?.occurrenceAt ??
        (reminder.scheduledAt >= now ? reminder.scheduledAt : null);

      put({
        type: 'reminder',
        id: reminder.id,
        title: reminder.title,
        when: awaiting?.occurrenceAt ?? next,
        day: null,
        status: awaiting
          ? 'awaiting_acknowledgement'
          : next
            ? 'pending'
            : 'past',
        active: Boolean(awaiting || next),
        recurring: reminder.recurrence !== null,
      });
    }

    for (const task of tasks)
      put({
        type: 'task',
        id: task.id,
        title: task.title,
        when: task.dueAt,
        day: null,
        status: task.completedAt ? 'done' : task.status,
        active: !task.completedAt && task.status === 'inbox',
        recurring: false,
      });

    for (const event of events) {
      const recurring = event.recurrence.length > 0;
      const ends = event.endAt ?? event.startAt;
      const lastDay = dateKey(event.allDayEndDate ?? event.allDayStartDate);

      put({
        type: 'calendar_event',
        id: event.id,
        title: event.title,
        when: event.startAt,
        day: dateKey(event.allDayStartDate),
        status: event.status,
        active:
          event.status !== 'cancelled' &&
          (recurring ||
            (ends !== null && ends >= now) ||
            (lastDay !== null && lastDay >= today)),
        recurring,
      });
    }

    for (const note of notes)
      put({
        type: 'note',
        id: `custom:${note.id}`,
        title: note.title,
        when: null,
        day: null,
        status: 'saved',
        active: true,
        recurring: false,
      });

    for (const daily of dailies)
      put({
        type: 'note',
        id: `daily:${daily.date}`,
        title: `Daily note ${daily.date}`,
        when: null,
        day: daily.date,
        status: 'saved',
        active: true,
        recurring: false,
      });

    for (const contact of contacts)
      put({
        type: 'contact',
        id: contact.id,
        title: contact.name,
        when: null,
        day: null,
        status: 'saved',
        active: true,
        recurring: false,
      });

    for (const document of documents)
      put({
        type: 'document',
        id: document.id,
        title: document.title,
        when: null,
        day: null,
        status: document.status,
        active: document.status !== 'failed',
        recurring: false,
      });

    return links.flatMap((link) => {
      const item = found.get(`${link.itemType}:${link.itemId}`);

      return item
        ? [
            {
              ...item,
              topicId: link.topicId,
              origin: (LINK_ORIGINS.has(link.origin)
                ? link.origin
                : 'inferred') as TopicItemSummary['origin'],
              linkedAt: link.createdAt,
            },
          ]
        : [];
    });
  }

  async activeDayCount(userId: string): Promise<number> {
    const row = await this.prisma.topicUserState.findUnique({
      where: { userId },
      select: { activeDays: true },
    });

    return row?.activeDays ?? 0;
  }

  async suppressedTopicIds(conversationId: string, since: Date) {
    const rows = await this.prisma.topicSuppression.findMany({
      where: { conversationId, createdAt: { gte: since } },
      distinct: ['topicId'],
      select: { topicId: true },
    });

    return rows.map((row) => row.topicId);
  }

  async suppress(topicId: string, conversationId: string) {
    await this.prisma.topicSuppression.create({
      data: { topicId, conversationId },
    });
  }

  async removeLink(userId: string, topicId: string, item: TopicItemRef) {
    const { count } = await this.prisma.topicLink.updateMany({
      where: {
        topicId,
        topic: { userId },
        itemType: item.type,
        itemId: item.id,
        removedAt: null,
      },
      data: { removedAt: new Date() },
    });

    return count > 0;
  }

  async deleteTopic(userId: string, topicId: string) {
    const { count } = await this.prisma.topic.deleteMany({
      where: { id: topicId, userId },
    });

    return count > 0;
  }
}
