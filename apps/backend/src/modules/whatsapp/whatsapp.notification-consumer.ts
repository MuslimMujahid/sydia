import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import {
  REMINDER_REPOSITORY,
  WHATSAPP_CONNECTION_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  type IWhatsAppConnectionRepository,
  type INotificationRepository,
  type IReminderRepository,
} from '../../database/interfaces';
import {
  WhatsAppDeliveryQueues,
  type NotificationJob,
} from '../../infra/queue';
import { WhatsAppService } from './whatsapp.service';

@Injectable()
export class WhatsAppNotificationConsumer
  implements OnModuleInit, OnModuleDestroy
{
  private worker: Worker<NotificationJob> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsAppService,
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    private readonly deliveryQueues: WhatsAppDeliveryQueues,
    @Inject(WHATSAPP_CONNECTION_REPOSITORY)
    private readonly connections: IWhatsAppConnectionRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: INotificationRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    if (
      this.config.get<boolean>('BACKEND_WHATSAPP_RUNTIME_ENABLED', true) !==
      true
    )
      return;
    const connection = {
      url: this.config.getOrThrow<string>('BACKEND_REDIS_URL'),
    };

    await this.deliveryQueues.start((data) => this.deliver(data));

    this.worker = new Worker<NotificationJob>(
      'notifications-whatsapp',
      async (job) => {
        const delivery = await this.notifications.findDeliveryByIdempotencyKey(
          job.data.userId,
          job.data.idempotencyKey,
          'whatsapp',
        );

        const scope = delivery
          ? await this.connections.deliveryScope(delivery.id)
          : null;

        if (!scope?.connectionId || scope.generation === null) {
          // Legacy/unbound intents are retired by the domain service. They
          // never acquire the user's current connection as a substitute.
          return this.deliver(job.data);
        }

        await this.deliveryQueues.enqueue(
          { connectionId: scope.connectionId, generation: scope.generation },
          job.data,
          job.id!,
        );

        return { status: 'dispatched' };
      },
      { connection },
    );
    this.worker.on('error', (error) =>
      Logger.error(
        'WhatsApp notification dispatcher failed. Check Redis availability.',
        error,
        WhatsAppNotificationConsumer.name,
      ),
    );
    this.worker.on('failed', (job, error) =>
      Logger.error(
        `WhatsApp dispatch ${job?.id} failed; BullMQ applies its bounded retry budget.`,
        error,
        WhatsAppNotificationConsumer.name,
      ),
    );
  }

  private async deliver(data: NotificationJob) {
    const result = await this.whatsapp.deliverNotification(data);

    if (result.status === 'failed') {
      Logger.warn(
        'WhatsApp delivery failed before dispatch; retrying within the queue budget.',
        WhatsAppNotificationConsumer.name,
      );
      throw new Error(
        'WhatsApp delivery failed; inspect the notification attempt.',
      );
    }

    if (result.status === 'delivered' && data.reminderOccurrenceKey) {
      await this.reminders.markOccurrenceDelivered(data.reminderOccurrenceKey);
    }

    return result;
  }

  async onModuleDestroy(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.close();
  }
}
