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
import { SNOOZABLE_OCCURRENCE_STATUSES } from '../entities';
import { PrismaConversationRepository } from './prisma-conversation.repository';
import { PrismaNotificationRepository } from './prisma-notification.repository';
import { PrismaReminderRepository } from './prisma-reminder.repository';

/**
 * Reminder lifecycle contracts against PostgreSQL (specs/006, 008, 009).
 * Opt in with REMINDER_CONTRACT_ENABLED=true; fixtures use unique ids and are
 * removed afterwards. Run under scripts/test-lock.sh.
 */
const enabled = process.env.REMINDER_CONTRACT_ENABLED === 'true';
const at = new Date('2026-11-13T01:00:00.000Z');

(enabled ? describe : describe.skip)(
  'Reminder lifecycle PostgreSQL contract',
  () => {
    let db: PrismaService;
    let reminders: PrismaReminderRepository;
    let conversations: PrismaConversationRepository;
    let notifications: PrismaNotificationRepository;
    let userId: string;

    beforeAll(async () => {
      db = new PrismaService(new ConfigService(process.env));
      await db.$connect();
      reminders = new PrismaReminderRepository(db);
      conversations = new PrismaConversationRepository(db);
      notifications = new PrismaNotificationRepository(db);
    });

    beforeEach(async () => {
      userId = `reminder-contract-${randomUUID()}`;
      await db.user.create({
        data: {
          id: userId,
          name: 'Reminder contract',
          email: `${userId}@example.test`,
          emailVerified: true,
          timezone: 'Asia/Jakarta',
          locale: 'id',
        },
      });
    });

    afterEach(async () => {
      await db.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await db.$disconnect();
    });

    async function dispatched(important: boolean, title = 'Minum obat') {
      const reminder = await reminders.create(userId, {
        title,
        notes: null,
        scheduledAt: at,
        timezone: 'Asia/Jakarta',
        important,
        repeatIntervalMinutes: 10,
      });

      const occurrence = await reminders.createOccurrence(reminder.id, at);
      expect(
        await reminders.markDispatched(occurrence.id, { important, at }),
      ).toBe(true);

      return { reminder, occurrence };
    }

    test('an important dispatch awaits acknowledgement; channel delivery only stamps time', async () => {
      const { reminder, occurrence } = await dispatched(true);
      expect(
        await reminders.markDispatched(occurrence.id, { important: true, at }),
      ).toBe(false);

      await reminders.markOccurrenceDelivered(occurrence.idempotencyKey);
      const stored = await reminders.findOccurrence(userId, occurrence.id);

      expect(stored).toMatchObject({
        status: 'awaiting_ack',
        important: true,
        messagesSent: 1,
        title: 'Minum obat',
      });
      expect(stored?.deliveredAt).toBeInstanceOf(Date);
      expect(
        (await reminders.findById(userId, reminder.id))?.latestOccurrence,
      ).toMatchObject({ id: occurrence.id, status: 'awaiting_ack' });
    });

    test('a regular dispatch is delivered and never awaits acknowledgement', async () => {
      const { occurrence } = await dispatched(false);

      expect(
        await reminders.findOccurrence(userId, occurrence.id),
      ).toMatchObject({ status: 'delivered', messagesSent: 1 });
      expect(await reminders.acknowledge(userId, occurrence.id, at)).toBeNull();
      expect(await reminders.listAwaitingAcknowledgement(userId)).toEqual([]);
    });

    test('repeat counting is compare-and-set', async () => {
      const { occurrence } = await dispatched(true);
      const later = new Date(at.getTime() + 600_000);

      expect(await reminders.recordRepeat(occurrence.id, 1, later)).toBe(true);
      expect(await reminders.recordRepeat(occurrence.id, 1, later)).toBe(false);
      expect(
        await reminders.findOccurrence(userId, occurrence.id),
      ).toMatchObject({ messagesSent: 2, lastSentAt: later });
    });

    test('acknowledgement wins once and stops further repeats', async () => {
      const { occurrence } = await dispatched(true);

      expect(await reminders.listAwaitingAcknowledgement(userId)).toHaveLength(
        1,
      );
      expect(
        await reminders.acknowledge(userId, occurrence.id, at),
      ).toMatchObject({ status: 'acknowledged', acknowledgedAt: at });
      expect(await reminders.acknowledge(userId, occurrence.id, at)).toBeNull();
      expect(await reminders.recordRepeat(occurrence.id, 1, at)).toBe(false);
      expect(await reminders.listAwaitingAcknowledgement(userId)).toEqual([]);
    });

    test("another user's occurrence is invisible", async () => {
      const { occurrence } = await dispatched(true);

      expect(
        await reminders.findOccurrence('someone-else', occurrence.id),
      ).toBeNull();
      expect(
        await reminders.acknowledge('someone-else', occurrence.id, at),
      ).toBeNull();
    });

    test('a newer occurrence supersedes; rescheduling cancels', async () => {
      const { reminder, occurrence } = await dispatched(true);
      const nextAt = new Date(at.getTime() + 86_400_000);
      const next = await reminders.createOccurrence(reminder.id, nextAt);
      await reminders.markDispatched(next.id, { important: true, at: nextAt });

      expect(await reminders.supersedeAwaiting(reminder.id, next.id)).toEqual([
        occurrence.id,
      ]);
      expect(await reminders.cancelAwaiting(reminder.id)).toEqual([next.id]);
      expect(
        (await reminders.findOccurrence(userId, occurrence.id))?.status,
      ).toBe('superseded');
      expect((await reminders.findOccurrence(userId, next.id))?.status).toBe(
        'cancelled',
      );
    });

    test('a snooze marks the occurrence and creates a linked one-time copy atomically', async () => {
      const { reminder, occurrence } = await dispatched(true);
      const until = new Date(at.getTime() + 15 * 60_000);
      const copy = await reminders.createSnoozeCopy(
        userId,
        occurrence.id,
        SNOOZABLE_OCCURRENCE_STATUSES,
        {
          title: reminder.title,
          notes: null,
          scheduledAt: until,
          timezone: 'Asia/Jakarta',
          recurrence: null,
          important: true,
          repeatIntervalMinutes: 10,
          sourceType: 'chat',
        },
      );

      expect(copy).toMatchObject({
        title: 'Minum obat',
        scheduledAt: until,
        recurrence: null,
        important: true,
        repeatIntervalMinutes: 10,
        snoozedFrom: { occurrenceId: occurrence.id, occurrenceAt: at },
        latestOccurrence: null,
      });
      expect(
        (await reminders.findOccurrence(userId, occurrence.id))?.status,
      ).toBe('snoozed');
      expect(
        await reminders.findLatestDispatchedOccurrence(userId, reminder.id),
      ).toMatchObject({ id: occurrence.id, status: 'snoozed' });
    });

    test('a pending occurrence cannot be snoozed and no copy is left behind', async () => {
      const reminder = await reminders.create(userId, {
        title: 'Belum bunyi',
        scheduledAt: at,
        timezone: 'Asia/Jakarta',
      });

      const occurrence = await reminders.createOccurrence(reminder.id, at);

      expect(
        await reminders.createSnoozeCopy(
          userId,
          occurrence.id,
          SNOOZABLE_OCCURRENCE_STATUSES,
          {
            title: 'Belum bunyi',
            scheduledAt: new Date(at.getTime() + 60_000),
            timezone: 'Asia/Jakarta',
          },
        ),
      ).toBeNull();
      expect(await reminders.list(userId)).toHaveLength(1);
      expect(
        await reminders.findLatestDispatchedOccurrence(userId, reminder.id),
      ).toBeNull();
    });

    test('recent deliveries list dispatched occurrences newest first', async () => {
      await dispatched(false, 'Pertama');
      const second = await reminders.create(userId, {
        title: 'Kedua',
        scheduledAt: new Date(at.getTime() + 60_000),
        timezone: 'Asia/Jakarta',
      });

      const occurrence = await reminders.createOccurrence(
        second.id,
        second.scheduledAt,
      );

      await reminders.markDispatched(occurrence.id, {
        important: false,
        at: second.scheduledAt,
      });

      const recent = await reminders.listRecentlyDispatched(userId, {
        since: new Date(at.getTime() - 60_000),
        limit: 20,
      });

      expect(recent.map(({ title }) => title)).toEqual(['Kedua', 'Pertama']);
    });

    test('a delivery resolves to its reminder occurrence and status', async () => {
      const { reminder, occurrence } = await dispatched(true);
      const delivery = await notifications.createDelivery({
        userId,
        kind: 'reminder_repeat',
        content: '⏰⏰⏰ Pengingat penting - Minum obat (pengingat ke-2)',
        idempotencyKey: `${occurrence.idempotencyKey}:repeat:2`,
        channel: 'telegram',
        proactive: false,
        reminderOccurrenceId: occurrence.id,
      });

      expect(
        await notifications.findDeliveryOccurrenceStatus(userId, delivery.id),
      ).toBe('awaiting_ack');
      expect(
        await notifications.findReminderReference(userId, occurrence.id),
      ).toEqual({
        reminderId: reminder.id,
        occurrenceId: occurrence.id,
        title: 'Minum obat',
        occurrenceAt: at.toISOString(),
        status: 'awaiting_ack',
        important: true,
      });
      expect(
        await notifications.findReminderReference(
          'someone-else',
          occurrence.id,
        ),
      ).toBeNull();
    });

    describe('channel history', () => {
      async function channel(lastInboundAt: Date) {
        const identity = await db.externalIdentity.create({
          data: {
            userId,
            provider: 'telegram',
            externalId: `contract-${randomUUID()}`,
            verifiedAt: at,
          },
        });

        return conversations.resolveChannelConversation({
          provider: 'telegram',
          externalIdentityId: identity.id,
          chatExternalId: identity.externalId,
          userId,
          title: 'Halo',
          activeAfter: new Date(0),
          receivedAt: lastInboundAt,
        });
      }

      const write = (deliveryId: string, when: Date) =>
        conversations.appendChannelReminderMessage({
          userId,
          provider: 'telegram',
          deliveryId,
          title: 'Minum obat',
          content: '⏰⏰⏰ Pengingat penting - Minum obat',
          metadata: {
            reminderId: 'r-1',
            occurrenceId: 'o-1',
            deliveryId,
            kind: 'reminder',
            important: true,
          },
          at: when,
        });

      test('writes once into the active conversation with its reference', async () => {
        const active = await channel(new Date(at.getTime() - 60_000));
        const first = await write('delivery-1', at);
        const replay = await write('delivery-1', at);

        expect(first).toMatchObject({
          conversationId: active.conversation.id,
          role: 'assistant',
          type: 'reminder',
          metadata: { reminderId: 'r-1', occurrenceId: 'o-1' },
        });
        expect(replay?.id).toBe(first?.id);
        expect(
          await db.message.count({
            where: { conversationId: active.conversation.id, type: 'reminder' },
          }),
        ).toBe(1);
      });

      test('a stale conversation is rotated like an inbound message would be', async () => {
        const stale = await channel(new Date(at.getTime() - 2 * 86_400_000));
        const message = await write('delivery-2', at);

        expect(message?.conversationId).not.toBe(stale.conversation.id);
        expect(
          await db.channelConversation.findUnique({
            where: { id: stale.channelConversationId },
            select: { conversationId: true },
          }),
        ).toEqual({ conversationId: message?.conversationId });
      });

      test('without any prior chat on the channel nothing is written', async () => {
        expect(await write('delivery-3', at)).toBeNull();
      });
    });
  },
);
