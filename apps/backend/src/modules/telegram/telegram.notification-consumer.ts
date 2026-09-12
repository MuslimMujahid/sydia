import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import {
  REMINDER_REPOSITORY,
  type IReminderRepository,
} from '../../database/interfaces';
import type { NotificationJob } from '../../infra/queue';
import { TelegramService } from './telegram.service';

@Injectable()
export class TelegramNotificationConsumer
  implements OnModuleInit, OnModuleDestroy
{
  private worker: Worker<NotificationJob> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly telegram: TelegramService,
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
  ) {}

  onModuleInit(): void {
    if (
      this.config.get<boolean>('BACKEND_TELEGRAM_RUNTIME_ENABLED', true) !==
      true
    )
      return;

    this.worker = new Worker<NotificationJob>(
      'notifications-telegram',
      async (job) => {
        const result = await this.telegram.deliverNotification(job.data);

        if (result.status === 'delivered' && job.data.reminderOccurrenceKey) {
          await this.reminders.markOccurrenceDelivered(
            job.data.reminderOccurrenceKey,
          );
        }

        return result;
      },
      {
        connection: {
          url: this.config.getOrThrow<string>('BACKEND_REDIS_URL'),
        },
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.close();
  }
}
