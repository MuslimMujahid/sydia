import type {
  INotificationRepository,
  ITelegramRepository,
  IWhatsAppConnectionRepository,
} from '../../database/interfaces';
import { ReminderDeliveryService } from './reminder-delivery.service';

type Account = {
  telegramLinked?: boolean;
  whatsapp?: 'none' | 'unverified' | 'verified';
  telegramNotificationsEnabled?: boolean;
  whatsappNotificationsEnabled?: boolean;
};

function serviceFor(account: Account): ReminderDeliveryService {
  const telegram = {
    findIdentity: () =>
      Promise.resolve(account.telegramLinked ? { id: 'identity-1' } : null),
  } as unknown as ITelegramRepository;

  const whatsapp = {
    findActive: () =>
      Promise.resolve(
        !account.whatsapp || account.whatsapp === 'none'
          ? null
          : {
              id: 'connection-1',
              ownerVerifiedAt:
                account.whatsapp === 'verified' ? new Date(0) : null,
            },
      ),
  } as unknown as IWhatsAppConnectionRepository;

  const notifications = {
    getPreferences: () =>
      Promise.resolve({
        telegramNotificationsEnabled:
          account.telegramNotificationsEnabled ?? true,
        whatsappNotificationsEnabled:
          account.whatsappNotificationsEnabled ?? true,
      }),
  } as unknown as INotificationRepository;

  return new ReminderDeliveryService(telegram, whatsapp, notifications);
}

describe('ReminderDeliveryService', () => {
  it('reports no channel for a web-only account', async () => {
    await expect(serviceFor({}).check('user-1')).resolves.toEqual({
      status: 'no_channel',
    });
  });

  it('treats a WhatsApp assistant awaiting owner verification as no channel', async () => {
    await expect(
      serviceFor({ whatsapp: 'unverified' }).check('user-1'),
    ).resolves.toEqual({ status: 'no_channel' });
  });

  it('reaches a linked Telegram account with notifications on', async () => {
    await expect(
      serviceFor({ telegramLinked: true }).check('user-1'),
    ).resolves.toEqual({ status: 'reachable', channels: ['telegram'] });
  });

  it('reports notifications off when every linked channel is muted', async () => {
    await expect(
      serviceFor({
        telegramLinked: true,
        telegramNotificationsEnabled: false,
      }).check('user-1'),
    ).resolves.toEqual({ status: 'notifications_off' });
  });

  it('lists only the linked channels that still have notifications on', async () => {
    await expect(
      serviceFor({
        telegramLinked: true,
        whatsapp: 'verified',
        telegramNotificationsEnabled: false,
      }).check('user-1'),
    ).resolves.toEqual({ status: 'reachable', channels: ['whatsapp'] });
  });
});
