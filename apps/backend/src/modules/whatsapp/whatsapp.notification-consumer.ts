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
  type IReminderRepository,
} from '../../database/interfaces';
import { type NotificationJob } from '../../infra/queue';
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
  ) {}

  onModuleInit(): void {
    if (
      this.config.get<boolean>('BACKEND_WHATSAPP_RUNTIME_ENABLED', true) !==
      true
    )
      return;
    const connection = {
      url: this.config.getOrThrow<string>('BACKEND_REDIS_URL'),
    };

    this.worker = new Worker<NotificationJob>(
      'notifications-whatsapp',
      async (job) => {
        const result = await this.whatsapp.deliverNotification(job.data);

        if (job.data.kind === 'event_reminder' && result.status === 'failed') {
          Logger.warn(
            `Event reminder delivery ${job.data.idempotencyKey} failed; retrying.`,
            'EventReminderDelivery',
          );
          throw new Error(
            'Event reminder delivery failed; inspect the notification delivery attempt.',
          );
        }

        if (result.status === 'delivered' && job.data.reminderOccurrenceKey) {
          await this.reminders.markOccurrenceDelivered(
            job.data.reminderOccurrenceKey,
          );
        }

        return result;
      },
      { connection },
    );
  }

  async onModuleDestroy(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.close();
  }
}
