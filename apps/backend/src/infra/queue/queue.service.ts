import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export type ReminderJob = { reminderId: string; idempotencyKey: string };
export type DocumentJob = { documentId: string; userId: string };
@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly reminders: Queue<ReminderJob>;
  readonly documents: Queue<DocumentJob>;
  constructor(config: ConfigService) {
    const connection = {
      host: config.get<string>('BACKEND_REDIS_HOST', 'localhost'),
      port: config.get<number>('BACKEND_REDIS_PORT', 6379),
    };
    const defaultJobOptions = {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    };
    this.reminders = new Queue<ReminderJob>('reminders', { connection, defaultJobOptions });
    this.documents = new Queue<DocumentJob>('documents', { connection, defaultJobOptions });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.reminders.close(), this.documents.close()]);
  }
}
