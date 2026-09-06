import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { RRule } from 'rrule';
import { AppModule } from './app.module';
import {
  REMINDER_REPOSITORY,
  type IReminderRepository,
} from './database/interfaces';
import { QueueService, type ReminderJob } from './infra/queue';

async function bootstrap(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule);
  const config = context.get(ConfigService);
  const reminders = context.get<IReminderRepository>(REMINDER_REPOSITORY);
  const queues = context.get(QueueService);
  const worker = new Worker<ReminderJob>(
    'reminders',
    async (job) => {
      await reminders.markOccurrenceDelivered(job.data.idempotencyKey);
      const reminder = await reminders.findByIdForDelivery(job.data.reminderId);
      if (!reminder?.recurrence || reminder.status !== 'scheduled') return;
      const rule = new RRule({
        freq: {
          daily: RRule.DAILY,
          weekly: RRule.WEEKLY,
          monthly: RRule.MONTHLY,
          yearly: RRule.YEARLY,
        }[reminder.recurrence.frequency],
        interval: reminder.recurrence.interval,
        byweekday: reminder.recurrence.daysOfWeek,
        dtstart: reminder.scheduledAt,
        until: reminder.recurrence.endsAt
          ? new Date(reminder.recurrence.endsAt)
          : undefined,
      });

      const next = rule.after(reminder.scheduledAt, false);
      if (!next) return;
      const updated = await reminders.updateDeliverySchedule(reminder.id, next);

      if (updated) {
        const idempotencyKey = await reminders.createOccurrence(
          reminder.id,
          next,
        );

        await queues.reminders.add(
          'dispatch',
          { reminderId: reminder.id, idempotencyKey },
          {
            jobId: idempotencyKey.replaceAll(':', '-'),
            delay: Math.max(0, next.getTime() - Date.now()),
          },
        );
      }
    },
    {
      connection: {
        host: config.get<string>('BACKEND_REDIS_HOST', 'localhost'),
        port: config.get<number>('BACKEND_REDIS_PORT', 6379),
      },
    },
  );

  const close = async () => {
    await worker.close();
    await context.close();
  };

  process.on('SIGTERM', () => void close());
  process.on('SIGINT', () => void close());
}

void bootstrap();
