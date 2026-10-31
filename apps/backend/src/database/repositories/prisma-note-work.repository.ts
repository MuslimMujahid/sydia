import { containsDecisionCredential } from '../../shared/decision-privacy';
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { NoteWork, NoteWorkPayload, NoteWorkValue } from '../entities';
import type { INoteWorkRepository } from '../interfaces';

@Injectable()
export class PrismaNoteWorkRepository implements INoteWorkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async acceptMessage(input: {
    userId: string;
    sourceMessageId: string;
    key: string;
    stage: string;
    notBefore?: Date;
    destinationRef?: string;
    payload: NoteWorkPayload;
  }) {
    const source = await this.prisma.client.message.findFirst({
      where: { id: input.sourceMessageId, userId: input.userId, role: 'user' },
      include: { user: { select: { timezone: true } } },
    });

    if (!source)
      throw new Error(
        'Note capture requires an existing owner-scoped user message.',
      );
    const work = await this.prisma.client.noteWork.upsert({
      where: { userId_key: { userId: input.userId, key: input.key } },
      create: {
        userId: input.userId,
        key: input.key,
        stage: input.stage,
        ...(input.notBefore ? { nextAttemptAt: input.notBefore } : {}),
        sourceKind: 'message',
        sourceRef: source.id,
        sourceVersion: createHash('sha256')
          .update(source.content)
          .digest('hex'),
        sourceAt: source.createdAt,
        timezone: source.user.timezone,
        sourceContent:
          input.stage === 'source' && containsDecisionCredential(source.content)
            ? ''
            : source.content,
        ...(input.stage === 'source' &&
        containsDecisionCredential(source.content)
          ? { status: 'rejected' }
          : {}),
        destinationRef: input.destinationRef,
        payload: input.payload,
      },
      update: {},
    });

    if (
      work.sourceRef !== source.id ||
      work.stage !== input.stage ||
      (work.destinationRef ?? undefined) !== input.destinationRef ||
      (input.stage !== 'source' &&
        !isDeepStrictEqual(
          work.payload,
          JSON.parse(JSON.stringify(input.payload)),
        ))
    )
      throw new Error(
        'A note work idempotency key cannot be reused for a different operation.',
      );

    return work;
  }

  apply(
    id: string,
    userId: string,
    mutation: () => Promise<NoteWorkValue>,
  ): Promise<NoteWorkValue> {
    return this.prisma.inTransaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM note_work WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE`,
      );
      const work = await tx.noteWork.findFirstOrThrow({
        where: { id, userId },
      });

      if (work.status === 'applied') return work.result;
      if (['rejected', 'stale', 'needs_clarification'].includes(work.status))
        throw new Error('Note work is no longer applicable.');
      if (!(await this.sourceValid(work)))
        throw new Error(
          'Note source was removed or changed; a fresh decision is required.',
        );
      const result = await mutation();
      await tx.noteWork.update({
        where: { id, userId },
        data: {
          status: 'applied',
          result:
            result === null
              ? Prisma.JsonNull
              : (result as Prisma.InputJsonValue),
          attempts: { increment: 1 },
          lastErrorCode: null,
        },
      });

      return result;
    });
  }

  async defer(id: string, userId: string, reason: string) {
    await this.prisma.client.noteWork.updateMany({
      where: {
        id,
        userId,
        status: {
          notIn: ['applied', 'rejected', 'stale', 'needs_clarification'],
        },
      },
      data: {
        status: 'deferred',
        lastErrorCode: reason,
        nextAttemptAt: new Date(Date.now() + 60_000),
      },
    });
  }

  async fail(id: string, userId: string, reason: string) {
    await this.prisma.client.noteWork.updateMany({
      where: {
        id,
        userId,
        status: {
          notIn: ['applied', 'rejected', 'stale', 'needs_clarification'],
        },
      },
      data: {
        status: 'failed',
        attempts: { increment: 1 },
        lastErrorCode: reason,
        nextAttemptAt: new Date(Date.now() + 60_000),
      },
    });
  }

  async expedite(userId: string, sourceWorkId?: string) {
    await this.prisma.client.noteWork.updateMany({
      where: {
        userId,
        ...(sourceWorkId ? { id: sourceWorkId } : {}),
        status: { in: ['pending', 'deferred', 'failed', 'proposal'] },
      },
      data: { nextAttemptAt: new Date(), attempts: 0 },
    });
  }

  pending(
    limit: number,
    userId?: string,
    includeProposals = false,
  ): Promise<NoteWork[]> {
    const statuses = [
      'pending',
      'deferred',
      'failed',
      ...(includeProposals ? ['proposal'] : []),
    ];

    return this.prisma.client.$queryRaw<NoteWork[]>(Prisma.sql`
      SELECT * FROM note_work WHERE status IN (${Prisma.join(statuses)})
      AND attempts < 5 AND "nextAttemptAt" <= clock_timestamp()
      ${userId ? Prisma.sql`AND "userId" = ${userId}` : Prisma.empty}
      ORDER BY "createdAt",id LIMIT ${limit}
    `);
  }

  async publishQuestions(limit: number, userId?: string, sourceRef?: string) {
    const pending = await this.prisma.client.noteWork.findMany({
      where: {
        status: 'needs_clarification',
        ...(userId ? { userId } : {}),
        ...(sourceRef ? { sourceRef } : {}),
        clarificationMessageId: null,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let published = 0;

    for (const item of pending) {
      published += await this.prisma.inTransaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM note_work WHERE id=${item.id} FOR UPDATE`,
        );
        const current = await tx.noteWork.findUniqueOrThrow({
          where: { id: item.id },
        });

        const payload =
          current.payload &&
          typeof current.payload === 'object' &&
          !Array.isArray(current.payload)
            ? current.payload
            : {};

        if (
          current.status !== 'needs_clarification' ||
          typeof payload.clarificationMessageId === 'string'
        )
          return 0;

        if (!(await this.sourceValid(current))) {
          await tx.noteWork.update({
            where: { id: current.id },
            data: { status: 'stale' },
          });

          return 0;
        }

        if (typeof payload.question !== 'string' || !payload.question.trim())
          throw new Error('Pending clarification has no question.');
        const source =
          current.sourceKind === 'message'
            ? await tx.message.findFirst({
                where: { id: current.sourceRef, userId: current.userId },
              })
            : null;

        const conversation = source
          ? await tx.conversation.findFirst({
              where: { id: source.conversationId, userId: current.userId },
            })
          : await tx.conversation.findFirst({
              where: { userId: current.userId },
              orderBy: { lastMessageAt: 'desc' },
            });

        if (!conversation) {
          Logger.warn(
            'Note clarification has no conversation; awaiting the owner to open a chat.',
            'NoteWorkRepository',
          );

          return 0;
        }

        const message = await tx.message.create({
          data: {
            userId: current.userId,
            conversationId: conversation.id,
            role: 'assistant',
            content: payload.question,
            idempotencyKey: `note-question:${current.id}:${createHash('sha256')
              .update(payload.question)
              .update(
                typeof payload.answerSourceRef === 'string'
                  ? payload.answerSourceRef
                  : 'initial',
              )
              .digest('hex')}`,
          },
        });

        await tx.noteWork.update({
          where: { id: current.id },
          data: {
            clarificationMessageId: message.id,
            payload: {
              ...payload,
              clarificationMessageId: message.id,
              clarificationConversationId: conversation.id,
            },
          },
        });
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: message.createdAt },
        });

        return 1;
      });
    }

    return published;
  }

  async questionsForMessage(userId: string, messageId: string) {
    const message = await this.prisma.client.message.findFirstOrThrow({
      where: { id: messageId, userId, role: 'user' },
    });

    return this.prisma.client.noteWork.findMany({
      where: {
        userId,
        status: 'needs_clarification',
        payload: {
          path: ['clarificationConversationId'],
          equals: message.conversationId,
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 12,
    });
  }

  async resolveQuestion(
    userId: string,
    workId: string,
    messageId: string,
    action: 'resolve' | 'reject',
    destinationRef?: string,
  ) {
    return this.prisma.inTransaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM note_work WHERE id=${workId} AND "userId"=${userId} FOR UPDATE`,
      );
      const work = await tx.noteWork.findFirstOrThrow({
        where: { id: workId, userId },
      });

      if (work.status !== 'needs_clarification') return false;
      const answer = await tx.message.findFirstOrThrow({
        where: { id: messageId, userId, role: 'user' },
      });

      const payload =
        work.payload &&
        typeof work.payload === 'object' &&
        !Array.isArray(work.payload)
          ? work.payload
          : {};

      if (payload.clarificationConversationId !== answer.conversationId)
        throw new Error(
          'The answer is outside the clarification conversation.',
        );
      if (containsDecisionCredential(answer.content))
        throw new Error('Credentials cannot resolve a note clarification.');

      if (!(await this.sourceValid(work))) {
        await tx.noteWork.update({
          where: { id: work.id },
          data: { status: 'stale' },
        });

        return false;
      }

      const nextPayload = {
        ...payload,
        // A fresh answer supersedes extracted record destinations, including
        // guesses that resolved to a real note. Tool targets remain concrete
        // execution arguments until a replacement reference is supplied.
        ...(['capture', 'organize'].includes(work.stage)
          ? { selected: null, requestedDestination: null, explicitRef: null }
          : {}),
        question: null,
        clarificationAnswer: answer.content,
        answerSourceRef: answer.id,
        answerSourceVersion: createHash('sha256')
          .update(answer.content)
          .digest('hex'),
        ...(destinationRef
          ? {
              selected: {
                ref: destinationRef,
                title:
                  typeof payload.topic === 'string' ? payload.topic : 'Catatan',
                parentId: null,
                question: null,
              },
            }
          : {}),
      };

      await tx.noteWork.update({
        where: { id: work.id },
        data: {
          status: action === 'reject' ? 'rejected' : 'pending',
          payload: nextPayload,
          ...(['capture', 'organize'].includes(work.stage) || destinationRef
            ? { destinationRef: destinationRef ?? null }
            : {}),
          nextAttemptAt: new Date(),
          attempts: 0,
        },
      });

      if (action === 'reject' && work.stage === 'source')
        await tx.noteWork.updateMany({
          where: {
            userId,
            sourceKind: work.sourceKind,
            sourceRef: work.sourceRef,
            sourceVersion: work.sourceVersion,
            id: { not: work.id },
            stage: { not: 'source' },
            status: { notIn: ['applied', 'rejected', 'stale'] },
          },
          data: { status: 'rejected', lastErrorCode: 'source_rejected' },
        });

      return true;
    });
  }

  async sourceValid(work: NoteWork): Promise<boolean> {
    const payload =
      work.payload &&
      typeof work.payload === 'object' &&
      !Array.isArray(work.payload)
        ? work.payload
        : {};

    if (typeof payload.answerSourceRef === 'string') {
      const answer = await this.prisma.client.message.findFirst({
        where: {
          id: payload.answerSourceRef,
          userId: work.userId,
          role: 'user',
        },
      });

      if (
        !answer ||
        createHash('sha256').update(answer.content).digest('hex') !==
          payload.answerSourceVersion
      )
        return false;
    }

    if (work.sourceKind === 'message') {
      const message = await this.prisma.client.message.findFirst({
        where: { id: work.sourceRef, userId: work.userId, role: 'user' },
      });

      return (
        !!message &&
        createHash('sha256').update(message.content).digest('hex') ===
          work.sourceVersion
      );
    }

    const note = await this.prisma.client.dailyNote.findFirst({
      where: { userId: work.userId, date: work.sourceRef },
    });

    if (!note) return false;
    if (
      createHash('sha256').update(note.text).digest('hex') ===
      work.sourceVersion
    )
      return true;
    const sourcePayload =
      work.payload &&
      typeof work.payload === 'object' &&
      !Array.isArray(work.payload)
        ? work.payload
        : null;

    return (
      typeof sourcePayload?.quote === 'string' &&
      note.text.includes(sourcePayload.quote)
    );
  }

  async sourceReady(work: NoteWork, idleMs: number): Promise<boolean> {
    if (work.sourceKind !== 'message') return true;
    const rows = await this.prisma.client.$queryRaw<
      Array<{ ready: boolean }>
    >(Prisma.sql`
      SELECT c."lastMessageAt" <= clock_timestamp() - (${idleMs} * interval '1 millisecond') AS ready
      FROM message m JOIN conversation c ON c.id=m."conversationId"
      WHERE m.id=${work.sourceRef} AND m."userId"=${work.userId}
    `);

    return rows[0]?.ready === true;
  }

  async previousRecords(
    work: NoteWork,
    destinationRef: string,
  ): Promise<NoteWork[]> {
    if (work.sourceKind !== 'message') return [];
    const stage = work.stage === 'organize' ? 'organize' : 'capture';
    const source = await this.prisma.client.message.findFirstOrThrow({
      where: { id: work.sourceRef, userId: work.userId, role: 'user' },
    });

    const messages = await this.prisma.client.message.findMany({
      where: {
        userId: work.userId,
        conversationId: source.conversationId,
        role: 'user',
        createdAt: { lt: source.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true },
    });

    const latest = await this.prisma.client.noteWork.findFirst({
      where: {
        userId: work.userId,
        sourceRef: { in: messages.map((message) => message.id) },
        stage,
        status: 'applied',
        OR: [
          { destinationRef },
          { result: { path: ['ref'], equals: destinationRef } },
        ],
      },
      orderBy: { sourceAt: 'desc' },
      select: { sourceRef: true },
    });

    if (!latest) return [];

    return this.prisma.client.noteWork.findMany({
      where: {
        userId: work.userId,
        sourceRef: latest.sourceRef,
        stage,
        status: 'applied',
        OR: [
          { destinationRef },
          { result: { path: ['ref'], equals: destinationRef } },
        ],
      },
    });
  }

  async recentMessages(work: NoteWork): Promise<string[]> {
    if (work.sourceKind !== 'message') return [];
    const source = await this.prisma.client.message.findFirst({
      where: { id: work.sourceRef, userId: work.userId },
    });

    if (!source) return [];
    const messages = await this.prisma.client.message.findMany({
      where: {
        userId: work.userId,
        conversationId: source.conversationId,
        role: 'user',
        createdAt: { lte: source.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { content: true },
    });

    return messages.reverse().map((message) => message.content);
  }

  async clarificationContext(work: NoteWork) {
    const payload =
      work.payload &&
      typeof work.payload === 'object' &&
      !Array.isArray(work.payload)
        ? work.payload
        : {};

    const source =
      work.sourceKind === 'message'
        ? await this.prisma.client.message.findFirstOrThrow({
            where: { id: work.sourceRef, userId: work.userId, role: 'user' },
            select: { id: true, conversationId: true, createdAt: true },
          })
        : null;

    // A dashboard capture has no conversation authority. Only a clarification
    // explicitly linked to this source can supply a later conversational answer.
    const conversationId =
      source?.conversationId ??
      (typeof payload.clarificationConversationId === 'string'
        ? payload.clarificationConversationId
        : null);

    if (!conversationId) return [];
    await this.prisma.client.conversation.findFirstOrThrow({
      where: { id: conversationId, userId: work.userId },
      select: { id: true },
    });
    const ids: string[] = [];

    if (source) {
      ids.push(source.id);
      const nextRequest = await this.prisma.client.message.findFirst({
        where: {
          userId: work.userId,
          conversationId,
          role: 'user',
          id: { not: source.id },
          createdAt: { gte: source.createdAt },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { createdAt: true },
      });

      const reply = await this.prisma.client.message.findFirst({
        where: {
          userId: work.userId,
          conversationId,
          role: 'assistant',
          createdAt: {
            gte: source.createdAt,
            ...(nextRequest ? { lt: nextRequest.createdAt } : {}),
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });

      if (reply) ids.push(reply.id);
    }

    if (typeof payload.clarificationMessageId === 'string')
      ids.push(payload.clarificationMessageId);
    if (typeof payload.answerSourceRef === 'string')
      ids.push(payload.answerSourceRef);
    const messages = await this.prisma.client.message.findMany({
      where: {
        userId: work.userId,
        conversationId,
        id: { in: ids },
        role: { in: ['user', 'assistant'] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return messages.map((message) => ({
      ...message,
      content: containsDecisionCredential(message.content)
        ? '[sensitive content omitted]'
        : message.content,
    }));
  }

  async spawn(
    parent: NoteWork,
    key: string,
    stage: string,
    payload: NoteWorkPayload,
    destinationRef?: string,
  ) {
    return this.prisma.client.noteWork.upsert({
      where: { userId_key: { userId: parent.userId, key } },
      create: {
        userId: parent.userId,
        key,
        sourceKind: parent.sourceKind,
        sourceRef: parent.sourceRef,
        sourceVersion: parent.sourceVersion,
        sourceAt: parent.sourceAt,
        timezone: parent.timezone,
        sourceContent: parent.sourceContent,
        stage,
        payload,
        destinationRef,
      },
      update: {},
    });
  }

  async mark(
    id: string,
    userId: string,
    status: string,
    payload?: NoteWorkPayload,
  ) {
    await this.prisma.inTransaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM note_work WHERE id=${id} AND "userId"=${userId} FOR UPDATE`,
      );
      const current = await tx.noteWork.findFirstOrThrow({
        where: { id, userId },
      });

      if (current.status === 'applied') return;

      const nextQuestion =
        status === 'needs_clarification' &&
        current.status !== 'needs_clarification' &&
        typeof payload?.question === 'string';

      await tx.noteWork.update({
        where: { id, userId },
        data: {
          status,
          lastErrorCode: null,
          ...(payload
            ? {
                payload: nextQuestion
                  ? { ...payload, clarificationMessageId: null }
                  : payload,
              }
            : {}),
          ...(nextQuestion ? { clarificationMessageId: null } : {}),
          nextAttemptAt: new Date(Date.now() + 15 * 60_000),
        },
      });
    });
  }

  async dailyCaptureLines(userId: string, date: string): Promise<string[]> {
    const captures = await this.prisma.client.noteWork.findMany({
      where: {
        userId,
        stage: 'capture',
        status: 'applied',
        destinationRef: `daily:${date}`,
      },
      select: { result: true },
      orderBy: { createdAt: 'asc' },
    });

    return captures.flatMap(({ result }) => {
      if (
        !result ||
        typeof result !== 'object' ||
        Array.isArray(result) ||
        !Array.isArray(result.recordLines) ||
        !result.recordLines.every((line) => typeof line === 'string')
      )
        throw new Error(
          'Daily capture receipt has no source-line tracking; review it before organizing this day.',
        );

      return result.recordLines;
    });
  }

  history(userId: string, sourceRef?: string) {
    return this.prisma.client.noteWork.findMany({
      where: { userId, ...(sourceRef ? { sourceRef } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async collectSources(limit: number, idleMs: number, userId?: string) {
    const activation =
      await this.prisma.client.noteOrganizationState.findUniqueOrThrow({
        where: { id: 'activation' },
      });

    const messages = await this.prisma.client.$queryRaw<
      Array<{ id: string; userId: string }>
    >(Prisma.sql`
      SELECT m.id, m."userId" FROM message m JOIN conversation c ON c.id = m."conversationId"
      WHERE m.role = 'user' ${userId ? Prisma.sql`AND m."userId" = ${userId}` : Prisma.empty} AND m."createdAt" >= ${activation.activatedAt}
        AND c."lastMessageAt" <= ${new Date(Date.now() - idleMs)}
        AND NOT EXISTS (SELECT 1 FROM note_work w WHERE w."userId" = m."userId" AND w.key = 'source:message:' || m.id)
      ORDER BY m."createdAt" LIMIT ${limit}
    `);

    for (const message of messages)
      await this.acceptMessage({
        userId: message.userId,
        sourceMessageId: message.id,
        key: `source:message:${message.id}`,
        stage: 'source',
        payload: {},
      });
    const daily = await this.prisma.client.$queryRaw<
      Array<{
        userId: string;
        date: string;
        text: string;
        timezone: string;
        updatedAt: Date;
      }>
    >(Prisma.sql`
      SELECT n."userId", n.date, n.text, n.timezone, n."updatedAt" FROM daily_note n
      WHERE n."sourceType" = 'dashboard' ${userId ? Prisma.sql`AND n."userId" = ${userId}` : Prisma.empty} AND n."updatedAt" >= ${activation.activatedAt}
        AND n."updatedAt" <= ${new Date(Date.now() - idleMs)}
        AND NOT EXISTS (SELECT 1 FROM note_work w WHERE w."userId" = n."userId" AND w."sourceKind" = 'daily'
          AND w."sourceRef" = n.date AND w.stage = 'source' AND w."sourceAt" >= n."updatedAt")
      ORDER BY n."updatedAt" LIMIT ${limit}
    `);

    for (const note of daily) {
      const sourceVersion = createHash('sha256')
        .update(note.text)
        .digest('hex');

      await this.prisma.client.noteWork.upsert({
        where: {
          userId_key: {
            userId: note.userId,
            key: `source:daily:${note.date}:${sourceVersion}`,
          },
        },
        create: {
          userId: note.userId,
          key: `source:daily:${note.date}:${sourceVersion}`,
          sourceKind: 'daily',
          sourceRef: note.date,
          sourceVersion,
          sourceAt: note.updatedAt,
          timezone: note.timezone,
          sourceContent: containsDecisionCredential(note.text) ? '' : note.text,
          ...(containsDecisionCredential(note.text)
            ? { status: 'rejected' }
            : {}),
          stage: 'source',
          payload: {},
        },
        update: { sourceAt: note.updatedAt },
      });
    }

    return messages.length + daily.length;
  }
}
