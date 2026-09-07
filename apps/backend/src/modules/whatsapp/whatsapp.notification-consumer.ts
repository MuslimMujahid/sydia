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
      host: this.config.get<string>('BACKEND_REDIS_HOST', 'localhost'),
      port: this.config.get<number>('BACKEND_REDIS_PORT', 6379),
    };

    this.worker = new Worker<NotificationJob>(
      'notifications',
      async (job) => {
        const result = await this.whatsapp.deliverNotification(job.data);

        if (result.status === 'delivered' && job.data.reminderOccurrenceId) {
          await this.reminders.markOccurrenceDelivered(
            job.data.reminderOccurrenceId,
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
