import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  TELEGRAM_REPOSITORY,
  WHATSAPP_CONNECTION_REPOSITORY,
  type INotificationRepository,
  type ITelegramRepository,
  type IWhatsAppConnectionRepository,
} from '../../database/interfaces';

export type ReminderChannel = 'telegram' | 'whatsapp';

/**
 * Whether a reminder that fires now would reach the owner. Reminders are only
 * sent through Telegram or WhatsApp; the web app has no notification channel.
 */
export type ReminderDelivery =
  | { status: 'reachable'; channels: ReminderChannel[] }
  /** No Telegram account or verified WhatsApp assistant is linked. */
  | { status: 'no_channel' }
  /** A channel is linked, but notifications are turned off for every one. */
  | { status: 'notifications_off' };

@Injectable()
export class ReminderDeliveryService {
  constructor(
    @Inject(TELEGRAM_REPOSITORY)
    private readonly telegram: ITelegramRepository,
    @Inject(WHATSAPP_CONNECTION_REPOSITORY)
    private readonly whatsapp: IWhatsAppConnectionRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: INotificationRepository,
  ) {}

  async check(userId: string): Promise<ReminderDelivery> {
    const [telegram, whatsapp, preferences] = await Promise.all([
      this.telegram.findIdentity(userId),
      this.whatsapp.findActive(userId),
      this.notifications.getPreferences(userId),
    ]);

    // Mirrors the channel checks in TelegramService and WhatsAppService
    // deliverNotification: a linked identity, or an owner-verified connection.
    const linked: ReminderChannel[] = [
      ...(telegram ? (['telegram'] as const) : []),
      ...(whatsapp?.ownerVerifiedAt ? (['whatsapp'] as const) : []),
    ];

    if (linked.length === 0) return { status: 'no_channel' };

    const channels = linked.filter((channel) =>
      channel === 'telegram'
        ? preferences?.telegramNotificationsEnabled !== false
        : preferences?.whatsappNotificationsEnabled !== false,
    );

    return channels.length
      ? { status: 'reachable', channels }
      : { status: 'notifications_off' };
  }
}
