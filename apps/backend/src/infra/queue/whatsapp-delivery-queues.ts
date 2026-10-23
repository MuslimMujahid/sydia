import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { NotificationJob } from './queue.service';

type Processor = (data: NotificationJob) => Promise<unknown>;
type RunningQueue = {
  queue: Queue<NotificationJob>;
  worker: Worker<NotificationJob>;
  lastBusyAt: number;
};

/** Durable discovery survives a dispatcher or worker restart. Queue names contain no phone numbers. */
@Injectable()
export class WhatsAppDeliveryQueues implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppDeliveryQueues.name);
  private readonly connection: { url: string };
  private readonly registry: Redis;
  private readonly running = new Map<string, RunningQueue>();
  private readonly opening = new Map<string, Promise<RunningQueue>>();
  private readonly closing = new Map<string, Promise<void>>();
  private processor: Processor | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cursor = '0';
  private stopped = false;
  private discovery: Promise<void> | null = null;
  private readonly registryKey: string;

  constructor(config: ConfigService) {
    this.connection = { url: config.getOrThrow<string>('BACKEND_REDIS_URL') };
    this.registry = new Redis(this.connection.url, { maxRetriesPerRequest: 1 });
    this.registry.on('error', (error) =>
      this.logger.error(
        'WhatsApp queue registry is unavailable. Check Redis connectivity.',
        error,
      ),
    );
    this.registryKey = 'bull:notifications-whatsapp-connections:registry';
  }

  async start(processor: Processor): Promise<void> {
    if (this.processor)
      throw new Error('WhatsApp delivery processor already registered.');
    this.processor = processor;
    await this.discover();
    this.schedule();
  }

  private queue(name: string) {
    return new Queue<NotificationJob>(name, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueue(
    scope: { connectionId: string; generation: number },
    data: NotificationJob,
    jobId: string,
  ): Promise<void> {
    if (this.stopped)
      throw new Error('WhatsApp delivery queues are shutting down.');
    const name = `notifications-whatsapp-${createHash('sha256')
      .update(JSON.stringify([scope.connectionId, scope.generation]))
      .digest('hex')}`;

    // Register before enqueue. If this process dies after adding the job, another
    // process discovers the queue. Empty registry entries are harmless metadata.
    const redis = this.registry;
    await redis.sadd(this.registryKey, name);
    const queue = this.queue(name);

    try {
      await queue.setGlobalConcurrency(1);

      if (data.eventReminder) {
        const previous = await queue.getJob(jobId);

        if (previous) {
          const state = await previous.getState();

          if (state === 'active') {
            this.logger.warn(
              `Event reminder is active in ${name}; dispatch will retry.`,
            );
            throw new Error(
              'Connection reminder delivery is active; retry dispatch.',
            );
          }

          if (state === 'completed' || state === 'failed')
            await previous.remove();
          else await previous.updateData(data);
        }
      }

      await queue.add('deliver', data, { jobId });
    } finally {
      await queue.close();
    }

    if (this.processor) await this.ensureWorker(name);
  }

  private async ensureWorker(name: string): Promise<RunningQueue> {
    await this.closing.get(name);
    const running = this.running.get(name);
    if (running) return running;
    const opening = this.opening.get(name);
    if (opening) return opening;
    const operation = this.openWorker(name);
    this.opening.set(name, operation);

    try {
      return await operation;
    } finally {
      this.opening.delete(name);
    }
  }

  private async openWorker(name: string): Promise<RunningQueue> {
    const processor = this.processor;
    if (!processor || this.stopped)
      throw new Error('WhatsApp delivery processor is not running.');
    const queue = this.queue(name);

    try {
      await queue.setGlobalConcurrency(1);
      const worker = new Worker<NotificationJob>(
        name,
        async (job) => {
          const current = this.running.get(name);
          if (current) current.lastBusyAt = Date.now();

          return processor(job.data);
        },
        { connection: this.connection },
      );

      worker.on('error', (error) =>
        this.logger.error(
          `WhatsApp queue ${name} failed. Check Redis availability.`,
          error,
        ),
      );
      worker.on('failed', (job, error) =>
        this.logger.error(
          `WhatsApp job ${job?.id} in ${name} failed; BullMQ applies its bounded retry budget.`,
          error,
        ),
      );
      const running = { queue, worker, lastBusyAt: Date.now() };
      this.running.set(name, running);

      return running;
    } catch (error) {
      this.logger.error(`Could not start WhatsApp queue ${name}.`, error);
      await queue.close();
      throw error;
    }
  }

  private async discover(): Promise<void> {
    const redis = this.registry;
    const [cursor, names] = await redis.sscan(
      this.registryKey,
      this.cursor,
      'COUNT',
      100,
    );

    this.cursor = cursor;

    for (const name of names) {
      if (this.stopped) return;
      const queue = this.queue(name);
      let pending: number;

      try {
        pending = await queue.getJobCountByTypes(
          'wait',
          'active',
          'delayed',
          'prioritized',
          'waiting-children',
        );
      } finally {
        await queue.close();
      }

      if (pending > 0) await this.ensureWorker(name);
      else {
        const current = this.running.get(name);

        if (current && Date.now() - current.lastBusyAt >= 60_000) {
          const closing = (async () => {
            await current.worker.close();
            await current.queue.close();
            this.running.delete(name);
          })();

          this.closing.set(name, closing);

          try {
            await closing;
          } finally {
            this.closing.delete(name);
          }
        }
      }
    }
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.discovery = this.discover()
        .catch((error: unknown) => {
          // Discovery is explicitly degraded for one polling interval. Existing
          // workers continue; durable queued work remains pending in Redis.
          this.logger.error(
            'WhatsApp queue discovery failed; pending queues will be retried in two seconds. Check Redis availability.',
            error,
          );
        })
        .finally(() => {
          this.discovery = null;
          this.schedule();
        });
    }, 2000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.discovery;
    await Promise.all(this.opening.values());
    await Promise.all(this.closing.values());
    await Promise.all(
      [...this.running.values()].map(async ({ worker, queue }) => {
        await worker.close();
        await queue.close();
      }),
    );
    this.running.clear();
    await this.registry.quit();
  }
}
