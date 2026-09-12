import { describe, expect, jest, test } from '@jest/globals';
import type {
  NotificationDelivery,
  UserPreference,
} from '../../database/entities';
import type { INotificationRepository } from '../../database/interfaces';
import type { QueueService } from '../../infra/queue';
import { NotificationService } from './notification.service';

const delivery = (channel: 'telegram' | 'whatsapp'): NotificationDelivery => ({
  id: `delivery-${channel}`,
  userId: 'user-1',
  kind: 'reminder',
  content: 'Reminder: pay invoice',
  idempotencyKey: 'reminder-1:2026-09-12T12:00:00.000Z',
  channel,
  proactive: false,
  sourceId: 'reminder-1',
  providerMessageId: null,
  status: 'pending',
  policyOutcome: null,
  attemptedAt: null,
  deliveredAt: null,
  failedAt: null,
  lastError: null,
  reminderOccurrenceId: 'occurrence-1',
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

function preferences(input: Partial<UserPreference> = {}): UserPreference {
  return {
    userId: 'user-1',
    briefingEnabled: true,
    briefingTime: '08:00',
    webNotificationsEnabled: true,
    telegramNotificationsEnabled: true,
    whatsappNotificationsEnabled: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...input,
  };
}

function setup(storedPreferences: UserPreference | null) {
  const findDeliveryByIdempotencyKey = jest
    .fn<INotificationRepository['findDeliveryByIdempotencyKey']>()
    .mockResolvedValue(null);

  const createDelivery = jest
    .fn<INotificationRepository['createDelivery']>()
    .mockImplementation((input) =>
      Promise.resolve(delivery(input.channel as 'telegram' | 'whatsapp')),
    );

  const repository = {
    getPreferences: jest.fn(() => Promise.resolve(storedPreferences)),
    findDeliveryByIdempotencyKey,
    createDelivery,
  } as unknown as INotificationRepository;

  const whatsappAdd = jest.fn(() => Promise.resolve());
  const telegramAdd = jest.fn(() => Promise.resolve());
  const queues = {
    whatsappNotifications: { add: whatsappAdd },
    telegramNotifications: { add: telegramAdd },
  } as unknown as QueueService;

  return {
    service: new NotificationService(repository, queues),
    createDelivery,
    whatsappAdd,
    telegramAdd,
  };
}

const intent = {
  userId: 'user-1',
  kind: 'reminder',
  content: 'Reminder: pay invoice',
  idempotencyKey: 'reminder-1:2026-09-12T12:00:00.000Z',
  proactive: false,
  sourceId: 'reminder-1',
  reminderOccurrenceId: 'occurrence-1',
  reminderOccurrenceKey: 'reminder-1:2026-09-12T12:00:00.000Z',
};

describe('NotificationService channel routing', () => {
  test('creates and queues one delivery per enabled external channel', async () => {
    const { service, createDelivery, whatsappAdd, telegramAdd } =
      setup(preferences());

    const result = await service.enqueue(intent);

    expect(result.deliveries).toHaveLength(2);
    expect(createDelivery).toHaveBeenCalledTimes(2);
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp' }),
    );
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'telegram' }),
    );
    expect(createDelivery.mock.calls[0]?.[0]).not.toHaveProperty(
      'reminderOccurrenceKey',
    );
    expect(whatsappAdd).toHaveBeenCalledTimes(1);
    expect(telegramAdd).toHaveBeenCalledTimes(1);
  });

  test('does not create or queue a disabled Telegram delivery', async () => {
    const { service, createDelivery, whatsappAdd, telegramAdd } = setup(
      preferences({ telegramNotificationsEnabled: false }),
    );

    const result = await service.enqueue(intent);

    expect(result.deliveries.map((item) => item.channel)).toEqual(['whatsapp']);
    expect(createDelivery).toHaveBeenCalledTimes(1);
    expect(whatsappAdd).toHaveBeenCalledTimes(1);
    expect(telegramAdd).not.toHaveBeenCalled();
  });
});
