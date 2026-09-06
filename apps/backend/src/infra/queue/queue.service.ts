import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export type ReminderJob = { reminderId: string; idempotencyKey: string };
@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly reminders: Queue<ReminderJob>;
  constructor(config: ConfigService) {
    this.reminders = new Queue<ReminderJob>('reminders', {
      connection: {
        host: config.get<string>('BACKEND_REDIS_HOST', 'localhost'),
        port: config.get<number>('BACKEND_REDIS_PORT', 6379),
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.reminders.close();
  }
}
