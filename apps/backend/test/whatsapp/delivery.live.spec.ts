import 'dotenv/config';
import { billingTestAccess } from '../support/billing-fixtures';
import { createHash, randomUUID } from 'node:crypto';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import {
  WhatsAppDeliveryQueues,
  type NotificationJob,
} from '../../src/infra/queue';
import { WhatsAppNotificationConsumer } from '../../src/modules/whatsapp/whatsapp.notification-consumer';
import { ConfigService } from '@nestjs/config';
import { TokenCipher } from '../../src/infra/crypto';
import { jest } from '@jest/globals';
import { PrismaService } from '../../src/infra/prisma';
import {
  PrismaWhatsAppConnectionRepository,
  PrismaNotificationRepository,
  PrismaUserRepository,
  PrismaAuditEventRepository,
  PrismaReminderRepository,
  PrismaCalendarRepository,
} from '../../src/database/repositories';
import {
  WhatsAppConnectionsGateway,
  type ConnectionClient,
} from '../../src/infra/whatsapp/whatsapp-connections.gateway';
import { WhatsAppService } from '../../src/modules/whatsapp/whatsapp.service';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { CalendarReminderService } from '../../src/modules/calendar/calendar-reminder.service';
import { CalendarReadService } from '../../src/modules/calendar/calendar-read.service';
import type { MessagingHandlerService } from '../../src/modules/messaging';
import type { WhatsAppConnection } from '../../src/database/entities';

const enabled = process.env.WHATSAPP_CONTRACT_ENABLED === 'true';
const now = new Date('2026-10-22T03:00:00Z'); // 10:00 in Jakarta; time does not create a delivery allowance.
const expiry = new Date('2026-10-22T03:10:00Z');
const originallyVerifiedAt = new Date('2026-10-21T03:00:00Z');

(enabled ? describe : describe.skip)(
  'WhatsApp delivery PostgreSQL and real domain contract',
  () => {
    const prisma = new PrismaService(new ConfigService(process.env));
    const repository = new PrismaWhatsAppConnectionRepository(prisma);
    const records = new PrismaNotificationRepository(prisma);
    const users = new PrismaUserRepository(prisma);
    let owner: string;
    let connection: WhatsAppConnection;
    let sent: jest.Mock<ConnectionClient['sendText']>;
    let gateway: WhatsAppConnectionsGateway;
    let service: WhatsAppService;
    let inbox: jest.Mock<MessagingHandlerService['handle']>;

    beforeEach(async () => {
      inbox = jest
        .fn<MessagingHandlerService['handle']>()
        .mockResolvedValue(true);
      owner = `whatsapp-delivery-${randomUUID()}`;
      await prisma.user.create({
        data: {
          id: owner,
          name: 'Delivery owner',
          email: `${owner}@example.test`,
          emailVerified: true,
          timezone: 'Asia/Jakarta',
          locale: 'id',
        },
      });
      const pending = await repository.create(owner, randomUUID());
      const paired = await repository.confirmAssistant(
        pending,
        `${randomUUID()}@s.whatsapp.net`,
        originallyVerifiedAt,
      );

      if (!paired) throw new Error('Failed to pair fixture.');
      await repository.issueOwnerCode(paired, 'owner-code-hash', expiry);
      const verified = await repository.verifyOwner(
        paired,
        'owner-code-hash',
        `${randomUUID()}@s.whatsapp.net`,
        originallyVerifiedAt,
      );

      if (!verified) throw new Error('Failed to verify fixture.');
      connection = verified;
      sent = jest
        .fn<ConnectionClient['sendText']>()
        .mockResolvedValue({ message_id: 'provider-accepted', status: 'sent' });
      gateway = new WhatsAppConnectionsGateway(
        repository,
        () =>
          ({
            sendText: sent,
            status: () =>
              Promise.resolve({
                device_id: connection.deviceId,
                is_connected: true,
                is_logged_in: true,
                jid: connection.assistantExternalId!,
              }),
          }) as unknown as ConnectionClient,
        new ConfigService(),
      );
      const notifications = new NotificationService(
        billingTestAccess(),
        records,
        {} as never,
        new CalendarReminderService(
          new PrismaCalendarRepository(
            prisma,
            new TokenCipher(
              new ConfigService({
                BACKEND_AUTH_SECRET: 'whatsapp-calendar-contract-secret',
              }),
            ),
          ),
          new CalendarReadService(
            new PrismaCalendarRepository(
              prisma,
              new TokenCipher(
                new ConfigService({
                  BACKEND_AUTH_SECRET: 'whatsapp-calendar-contract-secret',
                }),
              ),
            ),
          ),
          {} as never,
        ),
      );

      service = new WhatsAppService(
        gateway,
        repository,
        users,
        notifications,
        new PrismaAuditEventRepository(prisma),
        { registerAdapter: () => Promise.resolve(), handle: inbox } as never,
        {} as never,
        {} as never,
        () => now,
        records,
        new ConfigService({
          BACKEND_AUTH_SECRET: 'whatsapp-contract-challenge-secret',
        }),
      );
    });
    afterEach(async () => {
      await prisma.user.delete({ where: { id: owner } });
    });
    afterAll(async () => {
      await prisma.onModuleDestroy();
    });

    async function reminder(key = randomUUID(), scheduledAt = now) {
      const source = await prisma.reminder.create({
        data: {
          userId: owner,
          title: 'Morning reminder',
          scheduledAt,
          timezone: 'Asia/Jakarta',
        },
      });

      const occurrence = await prisma.reminderOccurrence.create({
        data: {
          reminderId: source.id,
          occurrenceAt: scheduledAt,
          idempotencyKey: key,
        },
      });

      const delivery = await records.createDelivery({
        userId: owner,
        kind: 'reminder',
        content: 'Morning reminder',
        idempotencyKey: key,
        channel: 'whatsapp',
        proactive: true,
        sourceId: source.id,
        reminderOccurrenceId: occurrence.id,
      });

      return {
        userId: owner,
        kind: 'reminder',
        content: delivery.content,
        idempotencyKey: key,
        proactive: true,
        sourceId: source.id,
      };
    }

    async function missedEpisode(outageId: string) {
      await service.onModuleInit();
      const input = await reminder();
      const offline = await repository.update(connection, {
        status: 'disconnected',
        outageId,
        disconnectedAt: new Date('2026-10-22T02:50:00Z'),
      });

      if (!offline) throw new Error('Failed to create outage fixture.');
      await service.deliverNotification(input);
      const delivery = await records.findDeliveryByIdempotencyKey(
        owner,
        input.idempotencyKey,
        'whatsapp',
      );

      if (!delivery) throw new Error('Missed fixture delivery disappeared.');

      return { offline, delivery };
    }

    async function exhaustRecovery(outageId: string, deliveryId: string) {
      for (const attemptNumber of [1, 2, 3, 4, 5]) {
        const claim = await repository.claimRecovery(
          connection,
          outageId,
          { content: 'Summary', deliveryIds: [deliveryId] },
          now,
        );

        if (claim.state !== 'claimed')
          throw new Error(
            'Fixture could not claim a safe pre-dispatch attempt.',
          );
        await records.createAttempt({
          deliveryId: claim.summary.id,
          attemptNumber,
          status: 'failed',
          attemptedAt: now,
        });
        await records.updateDelivery(owner, claim.summary.id, {
          status: 'failed',
        });
      }
    }

    async function missedCalendarEpisode(
      status = 'confirmed',
      pending = false,
    ) {
      await service.onModuleInit();
      const event = await prisma.calendarEvent.create({
        data: {
          userId: owner,
          title: 'Earlier appointment',
          provider: 'local',
          syncState: 'local',
          status,
          reminderMinutes: 10,
          startAt: new Date('2026-10-22T02:50:00Z'),
          endAt: new Date('2026-10-22T03:50:00Z'),
          timezone: 'UTC',
        },
      });

      const offline = await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-calendar',
        disconnectedAt: new Date('2026-10-22T02:30:00Z'),
      });

      if (!offline) throw new Error('Calendar outage fixture failed.');
      const delivery = await records.createDelivery({
        userId: owner,
        kind: 'event_reminder',
        content: 'Earlier appointment',
        idempotencyKey: `calendar-reminder:${event.id}:2026-10-22T02:50:00.000Z`,
        channel: 'whatsapp',
        proactive: false,
        sourceId: event.id,
        whatsappSchedule: {
          scheduledAt: new Date('2026-10-22T02:40:00Z'),
          payload: {
            eventReminder: {
              kind: 'dispatch',
              userId: owner,
              eventId: event.id,
              startAt: '2026-10-22T02:50:00.000Z',
              scheduledAt: '2026-10-22T02:40:00.000Z',
              timezone: 'UTC',
            },
          },
        },
      });

      if (pending) return { offline, event };
      await repository.recordMissed(
        delivery.id,
        'outage-calendar',
        new Date('2026-10-22T02:40:00Z'),
        {
          eventReminder: {
            kind: 'dispatch',
            userId: owner,
            eventId: event.id,
            startAt: '2026-10-22T02:50:00.000Z',
            scheduledAt: '2026-10-22T02:40:00.000Z',
            timezone: 'UTC',
          },
        },
      );
      await records.updateDelivery(owner, delivery.id, { status: 'missed' });

      return { offline, event };
    }

    test('recovery collects a delayed calendar delivery using its persisted schedule', async () => {
      const { offline } = await missedCalendarEpisode('confirmed', true);
      await gateway.refresh(offline);
      expect(sent).toHaveBeenCalledTimes(1);
      expect(sent.mock.calls[0]?.[1]).toContain('Earlier appointment');
      expect(sent.mock.calls[0]?.[1]).toContain('Pengingat yang terlewat');
    });

    test('recovery excludes a canceled delayed calendar delivery', async () => {
      const { offline } = await missedCalendarEpisode('cancelled', true);
      await gateway.refresh(offline);
      expect(sent).not.toHaveBeenCalled();
    });

    test('rearming a calendar reminder refreshes persisted schedule without changing its connection generation', async () => {
      const { event } = await missedCalendarEpisode('confirmed', true);
      const key = `calendar-reminder:${event.id}:2026-10-22T02:50:00.000Z`;
      const delivery = await records.findDeliveryByIdempotencyKey(
        owner,
        key,
        'whatsapp',
      );

      if (!delivery) throw new Error('Calendar fixture delivery disappeared.');
      await records.updateDelivery(owner, delivery.id, {
        status: 'skipped_obsolete',
      });
      await records.rearmEventReminder(owner, delivery.id, 'Updated reminder', {
        scheduledAt: new Date('2026-10-22T02:35:00Z'),
        payload: {
          eventReminder: {
            kind: 'dispatch',
            userId: owner,
            eventId: event.id,
            startAt: '2026-10-22T02:50:00.000Z',
            scheduledAt: '2026-10-22T02:35:00.000Z',
            timezone: 'UTC',
          },
        },
      });
      expect(
        await prisma.whatsAppDeliveryBinding.findUnique({
          where: { deliveryId: delivery.id },
        }),
      ).toMatchObject({
        connectionId: connection.id,
        generation: connection.generation,
        scheduledAt: new Date('2026-10-22T02:35:00Z'),
        outageId: null,
      });
      expect(
        await records.findDeliveryByIdempotencyKey(owner, key, 'whatsapp'),
      ).toMatchObject({ status: 'pending', content: 'Updated reminder' });
    });

    test('recovery reports a valid missed calendar reminder after the event has started', async () => {
      const { offline } = await missedCalendarEpisode();
      await gateway.refresh(offline);
      expect(sent).toHaveBeenCalledTimes(1);
      expect(sent.mock.calls[0]?.[1]).toContain('Earlier appointment');
      expect(sent.mock.calls[0]?.[1]).toContain('Pengingat yang terlewat');
    });

    test('recovery excludes a canceled past calendar occurrence', async () => {
      const { offline } = await missedCalendarEpisode('cancelled');
      await gateway.refresh(offline);
      expect(sent).not.toHaveBeenCalled();
    });

    test('recovery excludes a missed calendar reminder whose event moved', async () => {
      const { offline, event } = await missedCalendarEpisode();
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: {
          startAt: new Date('2026-10-22T04:00:00Z'),
          endAt: new Date('2026-10-22T05:00:00Z'),
        },
      });
      await gateway.refresh(offline);
      expect(sent).not.toHaveBeenCalled();
    });

    test('recovery rejects a calendar occurrence payload owned by another user', async () => {
      const { offline } = await missedCalendarEpisode();
      await prisma.whatsAppDeliveryBinding.updateMany({
        where: { connectionId: connection.id, outageId: 'outage-calendar' },
        data: {
          payload: {
            eventReminder: {
              kind: 'dispatch',
              userId: 'another-user',
              eventId: 'foreign-event',
              startAt: '2026-10-22T02:50:00.000Z',
              scheduledAt: '2026-10-22T02:40:00.000Z',
              timezone: 'UTC',
            },
          },
        },
      });
      await gateway.refresh(offline);
      expect(sent).not.toHaveBeenCalled();
      expect(await repository.findActive(owner)).toMatchObject({
        status: 'connected',
        outageId: 'outage-calendar',
      });
    });

    test.each([false, true])(
      'Redis dispatch preserves the original generation (owner replaced: %s)',
      async (replaceOwner) => {
        const url = new URL(process.env.BACKEND_REDIS_URL!);
        if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
          throw new Error('Redis contract requires loopback Redis.');
        url.pathname = '/15';
        const queueConfig = new ConfigService({
          BACKEND_REDIS_URL: url.toString(),
        });

        const deliveryQueues = new WhatsAppDeliveryQueues(queueConfig);
        const consumer = new WhatsAppNotificationConsumer(
          queueConfig,
          service,
          new PrismaReminderRepository(prisma),
          deliveryQueues,
          repository,
          records,
        );

        const dispatcher = new Queue<NotificationJob>(
          'notifications-whatsapp',
          { connection: { url: url.toString() } },
        );

        const events = new QueueEvents('notifications-whatsapp', {
          connection: { url: url.toString() },
        });

        const scopedName = `notifications-whatsapp-${createHash('sha256')
          .update(JSON.stringify([connection.id, connection.generation]))
          .digest('hex')}`;

        const scoped = new Queue(scopedName, {
          connection: { url: url.toString() },
        });

        const redis = new Redis(url.toString());
        let jobId: string | undefined;

        try {
          await scoped.pause();
          await events.waitUntilReady();
          await consumer.onModuleInit();
          const input = await reminder();
          const job = await dispatcher.add(
            'deliver',
            { ...input, channel: 'whatsapp' },
            { jobId: randomUUID() },
          );

          jobId = job.id;
          expect(await job.waitUntilFinished(events, 10_000)).toEqual({
            status: 'dispatched',
          });
          expect(sent).not.toHaveBeenCalled();

          if (replaceOwner) {
            const replacement = await repository.resetOwner(owner);
            if (!replacement) throw new Error('Owner replacement failed.');
            await repository.issueOwnerCode(
              replacement,
              'new-owner-proof',
              expiry,
            );
            await repository.verifyOwner(
              replacement,
              'new-owner-proof',
              `${randomUUID()}@s.whatsapp.net`,
              now,
            );
          }

          await scoped.resume();
          const deadline = Date.now() + 10_000;
          let status: string | undefined;

          do {
            status = (
              await records.findDeliveryByIdempotencyKey(
                owner,
                input.idempotencyKey,
                'whatsapp',
              )
            )?.status;
            if (status === (replaceOwner ? 'skipped_unlinked' : 'delivered'))
              break;
            await new Promise((resolve) => setTimeout(resolve, 20));
          } while (Date.now() < deadline);

          expect(status).toBe(replaceOwner ? 'skipped_unlinked' : 'delivered');
          expect(sent).toHaveBeenCalledTimes(replaceOwner ? 0 : 1);
        } finally {
          await consumer.onModuleDestroy();
          await deliveryQueues.onModuleDestroy();
          if (jobId) await dispatcher.remove(jobId);
          await scoped.obliterate({ force: true });
          await redis.srem(
            'bull:notifications-whatsapp-connections:registry',
            scopedName,
          );
          await Promise.all([
            scoped.close(),
            dispatcher.close(),
            events.close(),
            redis.quit(),
          ]);
        }
      },
      20_000,
    );

    test('concurrent setup sessions receive one usable owner verification code', async () => {
      await service.onModuleInit();
      await repository.resetOwner(owner);

      const [first, second] = await Promise.all([
        service.createLinkCode(owner),
        service.createLinkCode(owner),
      ]);

      expect(second).toEqual(first);
      await gateway.handleWebhook({
        event: 'message',
        session_id: connection.deviceId,
        device_id: connection.assistantExternalId!,
        payload: {
          id: 'verify-shared-challenge',
          from: connection.ownerExternalId!,
          chat_id: connection.ownerExternalId!,
          body: first.code,
        },
      });
      expect(await repository.findActive(owner)).toMatchObject({
        setupPhase: 'ready',
        ownerVerifiedAt: now,
      });
      expect(sent).toHaveBeenCalledTimes(1);
    });

    test('reopening setup reuses the unexpired verification message', async () => {
      await repository.resetOwner(owner);
      const first = await service.createLinkCode(owner);

      const reopened = await service.createLinkCode(owner);

      expect(reopened).toEqual(first);
    });

    test('requested reminders deliver without inbound traffic or previous replies', async () => {
      const input = await reminder();
      expect(await service.deliverNotification(input)).toEqual({
        status: 'delivered',
        providerMessageId: 'provider-accepted',
      });
      expect(sent).toHaveBeenCalledWith(
        connection.ownerExternalId,
        'Morning reminder',
      );
    });

    async function deliverReminderBurst() {
      const statuses: string[] = [];

      for (let index = 0; index < 40; index++) {
        statuses.push(
          (await service.deliverNotification(await reminder())).status,
        );
      }

      return statuses;
    }

    test('forty requested reminders at the same instant are not capped or delayed', async () => {
      expect(await deliverReminderBurst()).toEqual(Array(40).fill('delivered'));
      expect(sent).toHaveBeenCalledTimes(40);
    }, 25_000);

    test('a requested reminder at 23:00 in the owners timezone remains eligible', async () => {
      // 03:00 UTC on 22 October is 23:00 on 21 October in New York.
      await prisma.user.update({
        where: { id: owner },
        data: { timezone: 'America/New_York' },
      });
      expect((await service.deliverNotification(await reminder())).status).toBe(
        'delivered',
      );
      expect(sent).toHaveBeenCalledTimes(1);
    });

    test.each(['STOP', 'START'])(
      '%s reaches the conversation without changing notification preferences',
      async (body) => {
        const preferences = await records.getPreferences(owner);
        await service.onModuleInit();
        await gateway.handleWebhook({
          event: 'message',
          session_id: connection.deviceId,
          device_id: connection.assistantExternalId!,
          payload: {
            id: `ordinary-${body}`,
            from: connection.ownerExternalId!,
            chat_id: connection.ownerExternalId!,
            body,
          },
        });
        expect(inbox).toHaveBeenCalledTimes(1);
        expect(inbox.mock.calls[0]?.[0].message.text).toBe(body);
        expect(await records.getPreferences(owner)).toEqual(preferences);
        expect(sent).not.toHaveBeenCalled();
      },
    );

    test('a second requested reminder delivers without acknowledgment of the first', async () => {
      await service.deliverNotification(await reminder());
      expect((await service.deliverNotification(await reminder())).status).toBe(
        'delivered',
      );
      expect(sent).toHaveBeenCalledTimes(2);
    });

    test('replayed notification jobs do not send again', async () => {
      const input = await reminder();
      await service.deliverNotification(input);
      await service.deliverNotification(input);
      expect(sent).toHaveBeenCalledTimes(1);
    });

    test('settings disable WhatsApp reminders without changing their source definitions', async () => {
      const input = await reminder();
      await records.savePreferences(owner, {
        whatsappNotificationsEnabled: false,
      });
      expect((await service.deliverNotification(input)).status).toBe(
        'skipped_disabled',
      );
      expect(sent).not.toHaveBeenCalled();
      expect(await prisma.reminder.count({ where: { userId: owner } })).toBe(1);
    });

    test('old jobs cannot move to a newly paired assistant', async () => {
      const input = await reminder();
      await repository.revoke(owner, now);
      await repository.create(owner, randomUUID());
      expect((await service.deliverNotification(input)).status).toBe(
        'skipped_unlinked',
      );
      expect(sent).not.toHaveBeenCalled();
    });

    async function replaceOwnerAt(at: Date) {
      const pending = await repository.resetOwner(owner);
      if (!pending) throw new Error('Owner replacement fixture failed.');
      await repository.issueOwnerCode(
        pending,
        'replacement-owner-code',
        expiry,
      );
      const verified = await repository.verifyOwner(
        pending,
        'replacement-owner-code',
        `${randomUUID()}@s.whatsapp.net`,
        at,
      );

      if (!verified) throw new Error('Replacement proof fixture failed.');
      connection = verified;
    }

    test('a late scheduler cannot bind a past reminder to a replacement owner', async () => {
      await replaceOwnerAt(now);
      const input = await reminder(
        randomUUID(),
        new Date('2026-10-22T02:59:00Z'),
      );

      expect((await service.deliverNotification(input)).status).toBe(
        'skipped_unlinked',
      );
      expect(sent).not.toHaveBeenCalled();
    });

    test('a late scheduler cannot bind a past calendar occurrence to a replacement owner', async () => {
      await replaceOwnerAt(now);
      const delivery = await records.createDelivery({
        userId: owner,
        kind: 'event_reminder',
        content: 'Past calendar occurrence',
        idempotencyKey: randomUUID(),
        channel: 'whatsapp',
        proactive: false,
        whatsappSchedule: {
          scheduledAt: new Date('2026-10-22T02:59:00Z'),
          payload: {},
        },
      });

      expect(await repository.deliveryScope(delivery.id)).toMatchObject({
        connectionId: null,
        generation: null,
      });
    });

    test('a reminder due exactly when its replacement owner was verified remains eligible', async () => {
      await replaceOwnerAt(now);
      expect((await service.deliverNotification(await reminder())).status).toBe(
        'delivered',
      );
      expect(sent).toHaveBeenCalledWith(
        connection.ownerExternalId,
        'Morning reminder',
      );
    });

    test('rearming a calendar reminder before owner verification cannot authorize delivery', async () => {
      const delivery = await records.createDelivery({
        userId: owner,
        kind: 'event_reminder',
        content: 'Future calendar occurrence',
        idempotencyKey: randomUUID(),
        channel: 'whatsapp',
        proactive: false,
        whatsappSchedule: { scheduledAt: now, payload: {} },
      });

      await records.updateDelivery(owner, delivery.id, {
        status: 'skipped_obsolete',
      });
      const rearmed = await records.rearmEventReminder(
        owner,
        delivery.id,
        'Moved earlier',
        {
          scheduledAt: new Date('2026-10-21T02:59:00Z'),
          payload: {},
        },
      );

      expect(rearmed?.status).toBe('skipped_unlinked');
      expect(await repository.deliveryScope(delivery.id)).toMatchObject({
        connectionId: connection.id,
        generation: connection.generation,
      });
      expect(sent).not.toHaveBeenCalled();
    });

    test('a foreign reminder occurrence cannot create a WhatsApp delivery or binding', async () => {
      const input = await reminder();
      const original = await records.findDeliveryByIdempotencyKey(
        owner,
        input.idempotencyKey,
        'whatsapp',
      );

      if (!original?.reminderOccurrenceId)
        throw new Error('Occurrence fixture missing.');
      const foreign = await prisma.user.create({
        data: {
          id: `whatsapp-foreign-${randomUUID()}`,
          name: 'Foreign owner',
          email: `${randomUUID()}@example.test`,
          emailVerified: true,
        },
      });

      try {
        await expect(
          records.createDelivery({
            userId: foreign.id,
            kind: 'reminder',
            content: 'Foreign occurrence',
            idempotencyKey: 'foreign-occurrence',
            channel: 'whatsapp',
            proactive: false,
            reminderOccurrenceId: original.reminderOccurrenceId,
          }),
        ).rejects.toThrow(
          'WhatsApp reminder occurrence is missing or belongs to another user.',
        );
        expect(
          await prisma.notificationDelivery.count({
            where: { userId: foreign.id },
          }),
        ).toBe(0);
      } finally {
        await prisma.user.delete({ where: { id: foreign.id } });
      }
    });

    test('missing binding on a legacy delivery prevents sending', async () => {
      const input = await reminder();
      const delivery = await records.findDeliveryByIdempotencyKey(
        owner,
        input.idempotencyKey,
        'whatsapp',
      );

      if (!delivery) throw new Error('Missing delivery fixture.');
      await prisma.whatsAppDeliveryBinding.delete({
        where: { deliveryId: delivery.id },
      });
      expect((await service.deliverNotification(input)).status).toBe(
        'skipped_unlinked',
      );
      expect(sent).not.toHaveBeenCalled();
    });

    test('default-enabled briefing preferences are not explicit WhatsApp opt-in', async () => {
      await records.createDelivery({
        userId: owner,
        kind: 'daily_briefing',
        content: 'Briefing',
        idempotencyKey: 'briefing',
        channel: 'whatsapp',
        proactive: true,
      });
      expect(
        (
          await service.deliverNotification({
            userId: owner,
            kind: 'daily_briefing',
            content: 'Briefing',
            idempotencyKey: 'briefing',
            proactive: true,
          })
        ).status,
      ).toBe('skipped_not_opted_in');
      expect(sent).not.toHaveBeenCalled();
    });

    test('saving a relevant existing preference opts into the corresponding briefing', async () => {
      await records.savePreferences(owner, { briefingEnabled: true });
      await records.createDelivery({
        userId: owner,
        kind: 'daily_briefing',
        content: 'Briefing',
        idempotencyKey: 'briefing',
        channel: 'whatsapp',
        proactive: true,
      });
      expect(
        (
          await service.deliverNotification({
            userId: owner,
            kind: 'daily_briefing',
            content: 'Briefing',
            idempotencyKey: 'briefing',
            proactive: true,
          })
        ).status,
      ).toBe('delivered');
    });

    test('saving an unrelated preference does not authorize proactive WhatsApp messages', async () => {
      await records.savePreferences(owner, { webNotificationsEnabled: true });
      expect(await repository.hasConsent(owner, 'daily_briefing')).toBe(false);
      expect(await repository.hasConsent(owner, 'follow_up')).toBe(false);
    });

    test('uncertain provider acceptance is recorded as unknown and never replayed blindly', async () => {
      const input = await reminder();
      sent.mockRejectedValueOnce(
        new Error('Network disconnected after sending request'),
      );
      expect((await service.deliverNotification(input)).status).toBe('unknown');
      expect((await service.deliverNotification(input)).status).toBe('unknown');
      expect(sent).toHaveBeenCalledTimes(1);
    });

    test('an owner receipt reconciles a known uncertain delivery once', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const delivery = await records.findDeliveryByIdempotencyKey(
        owner,
        input.idempotencyKey,
        'whatsapp',
      );

      if (!delivery) throw new Error('Missing delivery fixture.');
      await records.updateDelivery(owner, delivery.id, {
        status: 'unknown',
        providerMessageId: 'receipt-message',
      });
      const event = {
        event: 'message.ack',
        session_id: connection.deviceId,
        device_id: connection.assistantExternalId!,
        payload: {
          ids: ['receipt-message'],
          from: connection.ownerExternalId!,
          chat_id: connection.ownerExternalId!,
          receipt_type: 'delivered',
        },
      };

      await gateway.handleWebhook(event);
      await gateway.handleWebhook(event);

      expect(
        await records.findDeliveryByIdempotencyKey(
          owner,
          input.idempotencyKey,
          'whatsapp',
        ),
      ).toMatchObject({
        status: 'delivered',
        policyOutcome: 'receipt_delivered',
      });
      expect(
        await prisma.auditEvent.count({
          where: { userId: owner, eventType: 'whatsapp.receipt' },
        }),
      ).toBe(1);
      expect(sent).not.toHaveBeenCalled();
    });

    test('out-of-order delivered receipts cannot downgrade recorded read evidence', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const delivery = await records.findDeliveryByIdempotencyKey(
        owner,
        input.idempotencyKey,
        'whatsapp',
      );

      if (!delivery) throw new Error('Missing delivery fixture.');
      await records.updateDelivery(owner, delivery.id, {
        status: 'unknown',
        providerMessageId: 'read-message',
      });
      const receipt = {
        event: 'message.ack',
        device_id: connection.deviceId,
        payload: {
          ids: ['read-message'],
          from: connection.ownerExternalId!,
          chat_id: connection.ownerExternalId!,
          receipt_type: 'read',
        },
      };

      await gateway.handleWebhook(receipt);
      await gateway.handleWebhook({
        ...receipt,
        payload: { ...receipt.payload, receipt_type: 'delivered' },
      });

      expect(
        await records.findDeliveryByIdempotencyKey(
          owner,
          input.idempotencyKey,
          'whatsapp',
        ),
      ).toMatchObject({ status: 'delivered', policyOutcome: 'receipt_read' });
      expect(
        await prisma.auditEvent.count({
          where: { userId: owner, eventType: 'whatsapp.receipt' },
        }),
      ).toBe(1);
    });

    test('a receipt cannot guess the message ID of an uncertain send', async () => {
      await service.onModuleInit();
      const input = await reminder();
      sent.mockRejectedValueOnce(new Error('Provider acknowledgement lost'));
      await service.deliverNotification(input);

      await gateway.handleWebhook({
        event: 'message.ack',
        device_id: connection.deviceId,
        payload: {
          ids: ['unmatched-message'],
          from: connection.ownerExternalId!,
          chat_id: connection.ownerExternalId!,
          receipt_type: 'delivered',
        },
      });

      expect(
        await records.findDeliveryByIdempotencyKey(
          owner,
          input.idempotencyKey,
          'whatsapp',
        ),
      ).toMatchObject({ status: 'unknown', providerMessageId: null });
      expect(sent).toHaveBeenCalledTimes(1);
    });

    test('a current-device receipt cannot reconcile a previous connection generation', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const delivery = await records.findDeliveryByIdempotencyKey(
        owner,
        input.idempotencyKey,
        'whatsapp',
      );

      if (!delivery) throw new Error('Missing delivery fixture.');
      await records.updateDelivery(owner, delivery.id, {
        status: 'unknown',
        providerMessageId: 'previous-generation',
      });
      await prisma.whatsAppDeliveryBinding.update({
        where: { deliveryId: delivery.id },
        data: { generation: connection.generation - 1 },
      });

      await gateway.handleWebhook({
        event: 'message.ack',
        device_id: connection.deviceId,
        payload: {
          ids: ['previous-generation'],
          from: connection.ownerExternalId!,
          chat_id: connection.ownerExternalId!,
          receipt_type: 'read',
        },
      });

      expect(
        await records.findDeliveryByIdempotencyKey(
          owner,
          input.idempotencyKey,
          'whatsapp',
        ),
      ).toMatchObject({ status: 'unknown' });
    });

    test('the same provider message ID on another device is not reconciled', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const delivery = await records.findDeliveryByIdempotencyKey(
        owner,
        input.idempotencyKey,
        'whatsapp',
      );

      if (!delivery) throw new Error('Missing delivery fixture.');
      await records.updateDelivery(owner, delivery.id, {
        status: 'unknown',
        providerMessageId: 'shared-provider-id',
      });
      const otherOwner = `receipt-other-${randomUUID()}`;
      await prisma.user.create({
        data: {
          id: otherOwner,
          name: 'Other receipt owner',
          email: `${otherOwner}@example.test`,
          emailVerified: true,
        },
      });

      try {
        const pending = await repository.create(otherOwner, randomUUID());
        const paired = await repository.confirmAssistant(
          pending,
          `${randomUUID()}@s.whatsapp.net`,
          now,
        );

        if (!paired) throw new Error('Failed to pair other device.');
        await repository.issueOwnerCode(paired, 'other-receipt-code', expiry);
        const verified = await repository.verifyOwner(
          paired,
          'other-receipt-code',
          `${randomUUID()}@s.whatsapp.net`,
          now,
        );

        if (!verified) throw new Error('Failed to verify other owner.');
        const otherDelivery = await records.createDelivery({
          userId: otherOwner,
          kind: 'reminder',
          channel: 'whatsapp',
          proactive: false,
          content: 'Other owners reminder',
          idempotencyKey: 'other-receipt-delivery',
        });

        await records.updateDelivery(otherOwner, otherDelivery.id, {
          status: 'unknown',
          providerMessageId: 'shared-provider-id',
        });

        await gateway.handleWebhook({
          event: 'message.ack',
          device_id: connection.deviceId,
          payload: {
            ids: ['shared-provider-id'],
            from: connection.ownerExternalId!,
            chat_id: connection.ownerExternalId!,
            receipt_type: 'delivered',
          },
        });

        expect(
          await records.findDeliveryByIdempotencyKey(
            owner,
            input.idempotencyKey,
            'whatsapp',
          ),
        ).toMatchObject({ status: 'delivered' });
        expect(
          await records.findDeliveryByIdempotencyKey(
            otherOwner,
            'other-receipt-delivery',
            'whatsapp',
          ),
        ).toMatchObject({ status: 'unknown' });
      } finally {
        await prisma.user.delete({ where: { id: otherOwner } });
      }
    });

    test('another sender cannot reconcile the owners uncertain delivery', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const delivery = await records.findDeliveryByIdempotencyKey(
        owner,
        input.idempotencyKey,
        'whatsapp',
      );

      if (!delivery) throw new Error('Missing delivery fixture.');
      await records.updateDelivery(owner, delivery.id, {
        status: 'unknown',
        providerMessageId: 'receipt-message',
      });

      await gateway.handleWebhook({
        event: 'message.ack',
        device_id: connection.deviceId,
        payload: {
          ids: ['receipt-message'],
          from: 'stranger@s.whatsapp.net',
          chat_id: connection.ownerExternalId!,
          receipt_type: 'read',
        },
      });

      expect(
        await records.findDeliveryByIdempotencyKey(
          owner,
          input.idempotencyKey,
          'whatsapp',
        ),
      ).toMatchObject({ status: 'unknown' });
      expect(
        await prisma.auditEvent.count({
          where: { userId: owner, eventType: 'whatsapp.receipt' },
        }),
      ).toBe(0);
    });

    test('disconnected reminders are recorded for one recovery summary rather than sent individually', async () => {
      const input = await reminder();
      await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-one',
        disconnectedAt: now,
      });
      expect((await service.deliverNotification(input)).status).toBe('missed');
      expect(await repository.missed(connection, 'outage-one')).toEqual([
        expect.objectContaining({
          content: 'Morning reminder',
          scheduledAt: now,
        }),
      ]);
      expect(sent).not.toHaveBeenCalled();
    });

    test('revoking owner authorization prevents old reminder delivery', async () => {
      const input = await reminder();
      await repository.resetOwner(owner);
      expect((await service.deliverNotification(input)).status).toBe(
        'skipped_unlinked',
      );
      expect(sent).not.toHaveBeenCalled();
    });
    test('recovery collects a pending reminder before its delayed worker can send it individually', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const offline = await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-delayed-worker',
        disconnectedAt: new Date('2026-10-22T02:50:00Z'),
      });

      if (!offline) throw new Error('Failed to create outage fixture.');
      await gateway.refresh(offline);
      await service.deliverNotification(input);
      expect(sent).toHaveBeenCalledTimes(1);
      expect(sent.mock.calls[0]?.[1]).toContain('Pengingat yang terlewat');
      const delivery = await records.findDeliveryByIdempotencyKey(
        owner,
        input.idempotencyKey,
        'whatsapp',
      );

      expect(delivery).toMatchObject({ status: 'missed' });
      if (!delivery) throw new Error('Missing fixture delivery.');
      expect(
        await prisma.whatsAppDeliveryBinding.findUnique({
          where: { deliveryId: delivery.id },
        }),
      ).toMatchObject({ outageId: 'outage-delayed-worker', summarizedAt: now });
    });

    test('a delivery worker waking before recovery runs records the missed reminder instead of sending it', async () => {
      await service.onModuleInit();
      const input = await reminder();
      await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-worker-race',
        disconnectedAt: new Date('2026-10-22T02:50:00Z'),
      });
      await repository.confirmAssistant(
        connection,
        connection.assistantExternalId!,
        now,
      );
      expect(await service.deliverNotification(input)).toEqual({
        status: 'missed',
      });
      expect(sent).not.toHaveBeenCalled();
      await gateway.refresh((await repository.findActive(owner))!);
      expect(sent).toHaveBeenCalledTimes(1);
      expect(sent.mock.calls[0]?.[1]).toContain('Pengingat yang terlewat');
    });

    test('recovery does not collect a pending reminder due before the outage', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const offline = await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-later',
        disconnectedAt: new Date('2026-10-22T03:01:00Z'),
      });

      if (!offline) throw new Error('Failed to create outage fixture.');
      await gateway.refresh(offline);
      expect(sent).not.toHaveBeenCalled();
      expect(
        await records.findDeliveryByIdempotencyKey(
          owner,
          input.idempotencyKey,
          'whatsapp',
        ),
      ).toMatchObject({ status: 'pending' });
    });

    test('repeated provider polls cannot expand the outage to include reminders due after recovery', async () => {
      const input = await reminder();
      await prisma.reminderOccurrence.updateMany({
        where: { reminderId: input.sourceId },
        data: { occurrenceAt: new Date('2026-10-22T03:05:00Z') },
      });
      await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-fixed-end',
        disconnectedAt: new Date('2026-10-22T02:50:00Z'),
      });
      await repository.confirmAssistant(
        connection,
        connection.assistantExternalId!,
        now,
      );
      await repository.confirmAssistant(
        connection,
        connection.assistantExternalId!,
        new Date('2026-10-22T03:10:00Z'),
      );
      expect(
        await repository.collectPendingMissed(
          connection,
          'outage-fixed-end',
          new Date('2026-10-22T03:10:00Z'),
        ),
      ).toBe(0);
      expect(
        await records.findDeliveryByIdempotencyKey(
          owner,
          input.idempotencyKey,
          'whatsapp',
        ),
      ).toMatchObject({ status: 'pending' });
    });

    test.each(['delivered', 'unknown', 'attempting'])(
      'recovery does not collect an occurrence already recorded as %s',
      async (status) => {
        await service.onModuleInit();
        const input = await reminder();
        const delivery = await records.findDeliveryByIdempotencyKey(
          owner,
          input.idempotencyKey,
          'whatsapp',
        );

        if (!delivery) throw new Error('Missing fixture delivery.');
        await records.updateDelivery(owner, delivery.id, { status });
        const offline = await repository.update(connection, {
          status: 'disconnected',
          outageId: 'outage-claimed',
          disconnectedAt: new Date('2026-10-22T02:50:00Z'),
        });

        if (!offline) throw new Error('Missing outage fixture.');
        await gateway.refresh(offline);
        expect(sent).not.toHaveBeenCalled();
        expect(
          await records.findDeliveryByIdempotencyKey(
            owner,
            input.idempotencyKey,
            'whatsapp',
          ),
        ).toMatchObject({ status });
      },
    );

    test('one catch-up summary covers missed reminders without replaying each notification', async () => {
      await service.onModuleInit();
      const first = await reminder();
      const second = await reminder();
      const offline = await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-one',
        disconnectedAt: now,
      });

      if (!offline) throw new Error('Failed to create outage fixture.');
      await service.deliverNotification(first);
      await service.deliverNotification(second);
      await gateway.refresh(offline);
      expect(sent).toHaveBeenCalledTimes(1);
      expect(sent.mock.calls[0]?.[1]).toContain('Pengingat yang terlewat');
      expect(
        await prisma.notificationDelivery.count({
          where: {
            userId: owner,
            kind: 'recovery_summary',
            status: 'delivered',
          },
        }),
      ).toBe(1);
      expect(await repository.missed(connection, 'outage-one')).toEqual([]);
    });

    test('another worker attempting the summary keeps missed reminders and the outage recoverable', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const offline = await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-in-flight',
        disconnectedAt: now,
      });

      if (!offline) throw new Error('Failed to create outage fixture.');
      await service.deliverNotification(input);
      const summary = await records.createDelivery({
        userId: owner,
        kind: 'recovery_summary',
        channel: 'whatsapp',
        proactive: false,
        content: 'Summary owned by another worker',
        idempotencyKey: `whatsapp-recovery:${connection.id}:outage-in-flight`,
      });

      await records.claimDelivery(owner, summary.id);

      await gateway.refresh(offline);

      expect(sent).not.toHaveBeenCalled();
      expect(await repository.findActive(owner)).toMatchObject({
        outageId: 'outage-in-flight',
      });
      expect(
        await repository.missed(connection, 'outage-in-flight'),
      ).toHaveLength(1);
    });

    test('retry before provider dispatch refreshes summary text and coverage together', async () => {
      await service.onModuleInit();
      const first = await reminder();
      const offline = await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-retry',
        disconnectedAt: now,
      });

      if (!offline) throw new Error('Failed to create outage fixture.');
      await service.deliverNotification(first);
      const summary = await records.createDelivery({
        userId: owner,
        kind: 'recovery_summary',
        channel: 'whatsapp',
        proactive: false,
        content: 'Stale text containing only the first reminder',
        idempotencyKey: `whatsapp-recovery:${connection.id}:outage-retry`,
      });

      await records.updateDelivery(owner, summary.id, { status: 'failed' });
      await prisma.whatsAppDeliveryBinding.update({
        where: { deliveryId: summary.id },
        data: {
          outageId: 'outage-retry',
          payload: {
            coveredDeliveryIds: [
              (await records.findDeliveryByIdempotencyKey(
                owner,
                first.idempotencyKey,
                'whatsapp',
              ))!.id,
            ],
          },
        },
      });
      const second = await reminder();
      await prisma.notificationDelivery.updateMany({
        where: { userId: owner, idempotencyKey: second.idempotencyKey },
        data: { content: 'Second late reminder' },
      });
      await service.deliverNotification(second);
      await gateway.refresh(offline);
      expect(sent).toHaveBeenCalledTimes(1);
      expect(sent.mock.calls[0]?.[1]).toContain('Second late reminder');
      expect(await repository.missed(connection, 'outage-retry')).toEqual([]);
    });

    test('a retry excludes a reminder canceled after summary preparation', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const offline = await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-cancel',
        disconnectedAt: now,
      });

      if (!offline) throw new Error('Failed to create outage fixture.');
      await service.deliverNotification(input);
      const summary = await records.createDelivery({
        userId: owner,
        kind: 'recovery_summary',
        channel: 'whatsapp',
        proactive: false,
        content: 'Canceled reminder must not be sent',
        idempotencyKey: `whatsapp-recovery:${connection.id}:outage-cancel`,
      });

      await records.updateDelivery(owner, summary.id, { status: 'failed' });
      await prisma.reminderOccurrence.updateMany({
        where: { reminderId: input.sourceId },
        data: { status: 'cancelled' },
      });
      await gateway.refresh(offline);
      expect(sent).not.toHaveBeenCalled();
      expect(
        await records.findDeliveryByIdempotencyKey(
          owner,
          summary.idempotencyKey,
          'whatsapp',
        ),
      ).toMatchObject({ status: 'skipped_obsolete' });
    });

    test('a crashed recovery claim becomes unknown without replaying the provider send', async () => {
      const { offline, delivery } = await missedEpisode('outage-crashed');
      await repository.claimRecovery(
        connection,
        'outage-crashed',
        { content: 'Persisted summary', deliveryIds: [delivery.id] },
        new Date('2026-10-22T02:58:59Z'),
      );
      await gateway.refresh(offline);
      expect(sent).not.toHaveBeenCalled();
      expect(
        await records.findDeliveryByIdempotencyKey(
          owner,
          `whatsapp-recovery:${connection.id}:outage-crashed`,
          'whatsapp',
        ),
      ).toMatchObject({ status: 'unknown' });
      expect(await repository.findActive(owner)).toMatchObject({
        status: 'connected',
        outageId: null,
      });
    });

    test('an ambiguous recovery acknowledgment is never sent a second time', async () => {
      const { offline } = await missedEpisode('outage-ambiguous');
      sent.mockRejectedValue(new Error('Provider acknowledgment timed out.'));
      await gateway.refresh(offline);
      await gateway.refresh(offline);
      expect(sent).toHaveBeenCalledTimes(1);
      expect(
        await records.findDeliveryByIdempotencyKey(
          owner,
          `whatsapp-recovery:${connection.id}:outage-ambiguous`,
          'whatsapp',
        ),
      ).toMatchObject({ status: 'unknown' });
      expect(await repository.findActive(owner)).toMatchObject({
        status: 'connected',
        outageId: null,
      });
    });

    test('a terminal summary cannot claim coverage of a reminder recorded later', async () => {
      const { offline, delivery } = await missedEpisode('outage-frozen');
      const summary = await records.createDelivery({
        userId: owner,
        kind: 'recovery_summary',
        channel: 'whatsapp',
        proactive: false,
        content: 'Already dispatched summary',
        idempotencyKey: `whatsapp-recovery:${connection.id}:outage-frozen`,
      });

      await records.updateDelivery(owner, summary.id, { status: 'unknown' });
      await prisma.whatsAppDeliveryBinding.update({
        where: { deliveryId: summary.id },
        data: {
          outageId: 'outage-frozen',
          payload: { coveredDeliveryIds: [delivery.id] },
        },
      });
      const later = await reminder();
      await service.deliverNotification(later);
      await gateway.refresh(offline);
      const laterDelivery = await records.findDeliveryByIdempotencyKey(
        owner,
        later.idempotencyKey,
        'whatsapp',
      );

      if (!laterDelivery) throw new Error('Late fixture delivery disappeared.');
      const laterBinding = await prisma.whatsAppDeliveryBinding.findUnique({
        where: { deliveryId: laterDelivery.id },
      });

      expect(laterBinding).toMatchObject({
        summarizedAt: null,
        outageId: 'outage-frozen',
      });
      expect(sent).not.toHaveBeenCalled();
    });

    test('recovery preparation failure does not create a new transport outage', async () => {
      const { offline } = await missedEpisode('outage-prepare-failed');
      await prisma.user.update({
        where: { id: owner },
        data: { timezone: 'Invalid/Zone' },
      });
      await gateway.refresh({ ...offline, status: 'connected' });
      expect(sent).not.toHaveBeenCalled();
      expect(await repository.findActive(owner)).toMatchObject({
        status: 'connected',
        outageId: 'outage-prepare-failed',
      });
    });

    test('five failed pre-dispatch attempts retain missed evidence without another send', async () => {
      const { offline, delivery } = await missedEpisode('outage-exhausted');
      await exhaustRecovery('outage-exhausted', delivery.id);
      await gateway.refresh(offline);
      expect(sent).not.toHaveBeenCalled();
      const exhausted = await repository.findActive(owner);
      expect(exhausted).toMatchObject({
        status: 'connected',
        outageId: 'outage-exhausted',
      });
      expect(exhausted?.reason).toContain('beberapa percobaan');
      expect(
        await repository.missed(connection, 'outage-exhausted'),
      ).toHaveLength(1);
    });

    test('completion of an old outage cannot clear a newer outage', async () => {
      await repository.update(connection, {
        outageId: 'newer-outage',
        disconnectedAt: now,
        status: 'disconnected',
      });

      expect(
        await repository.completeRecovery(connection, 'older-outage', [], now),
      ).toBe(false);
      expect(await repository.findActive(owner)).toMatchObject({
        outageId: 'newer-outage',
        status: 'disconnected',
      });
    });

    test('repeated recovery events cannot create a second summary', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const offline = await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-one',
        disconnectedAt: now,
      });

      if (!offline) throw new Error('Failed to create outage fixture.');
      await service.deliverNotification(input);
      await gateway.refresh(offline);
      await gateway.refresh(offline);
      expect(sent).toHaveBeenCalledTimes(1);
    });

    test('deleted reminders are excluded when connection recovers', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const offline = await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-one',
        disconnectedAt: now,
      });

      if (!offline) throw new Error('Failed to create outage fixture.');
      await service.deliverNotification(input);
      await prisma.reminder.delete({ where: { id: input.sourceId } });
      await gateway.refresh(offline);
      expect(sent).not.toHaveBeenCalled();
    });

    test('notification disablement during an outage suppresses the recovery summary', async () => {
      await service.onModuleInit();
      const input = await reminder();
      const offline = await repository.update(connection, {
        status: 'disconnected',
        outageId: 'outage-one',
        disconnectedAt: now,
      });

      if (!offline) throw new Error('Failed to create outage fixture.');
      await service.deliverNotification(input);
      await records.savePreferences(owner, {
        whatsappNotificationsEnabled: false,
      });
      await gateway.refresh(offline);
      expect(sent).not.toHaveBeenCalled();
    });
  },
);
