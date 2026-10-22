import 'dotenv/config';
import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  WhatsAppDeliveryQueues,
  type NotificationJob,
} from '../../src/infra/queue';

const enabled = process.env.WHATSAPP_CONTRACT_ENABLED === 'true';

function signal<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

async function within<T>(promise: Promise<T>, timeoutMs = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'Redis worker did not reach the expected delivery boundary.',
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

(enabled ? describe : describe.skip)('WhatsApp connection Redis queues', () => {
  let config: ConfigService;
  let redis: Redis;
  let queues: WhatsAppDeliveryQueues[];
  let scopes: { connectionId: string; generation: number }[];
  const registryKey = 'bull:notifications-whatsapp-connections:registry';

  jest.setTimeout(25_000);
  beforeAll(() => {
    const url = new URL(process.env.BACKEND_REDIS_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Redis contract requires a loopback Redis server.');
    // Isolate the running development application, without flushing any DB.
    url.pathname = '/15';
    config = new ConfigService({ BACKEND_REDIS_URL: url.toString() });
    redis = new Redis(url.toString());
  });
  beforeEach(() => {
    queues = [];
    scopes = [];
  });
  afterEach(async () => {
    await Promise.all(queues.map((queue) => queue.onModuleDestroy()));

    for (const scope of scopes) {
      // This is cleanup only. Assertions observe callbacks from real workers,
      // rather than reproducing queue-name derivation as their expected result.
      const name = `notifications-whatsapp-${createHash('sha256')
        .update(JSON.stringify([scope.connectionId, scope.generation]))
        .digest('hex')}`;

      const queue = new Queue(name, {
        connection: { url: config.getOrThrow<string>('BACKEND_REDIS_URL') },
      });

      try {
        await queue.obliterate({ force: true });
      } finally {
        await queue.close();
      }

      await redis.srem(registryKey, name);
    }
  });
  afterAll(async () => {
    await redis.quit();
  });

  function instance() {
    const queue = new WhatsAppDeliveryQueues(config);
    queues.push(queue);

    return queue;
  }

  function scope() {
    const value = { connectionId: randomUUID(), generation: 1 };
    scopes.push(value);

    return value;
  }

  function job(id: string): NotificationJob {
    return {
      userId: id,
      idempotencyKey: id,
      channel: 'whatsapp',
      kind: 'reminder',
      content: id,
      proactive: false,
    };
  }

  test('a blocked assistant does not block another, while independent workers serialize the same assistant', async () => {
    const a = scope();
    const b = scope();
    const firstStarted = signal();
    const releaseFirst = signal();
    const otherDelivered = signal();
    const secondDelivered = signal();
    const seen: string[] = [];

    const processor = async (data: NotificationJob) => {
      seen.push(data.content);

      if (data.content === 'first') {
        firstStarted.resolve();
        await releaseFirst.promise;
      }

      if (data.content === 'other') otherDelivered.resolve();
      if (data.content === 'second') secondDelivered.resolve();
    };

    const firstProcess = instance();
    const secondProcess = instance();
    await Promise.all([
      firstProcess.start(processor),
      secondProcess.start(processor),
    ]);

    try {
      await firstProcess.enqueue(a, job('first'), randomUUID());
      await within(firstStarted.promise);
      await secondProcess.enqueue(a, job('second'), randomUUID());
      await secondProcess.enqueue(b, job('other'), randomUUID());
      await within(otherDelivered.promise);
      expect(seen).toEqual(['first', 'other']);
      releaseFirst.resolve();
      await within(secondDelivered.promise);
      expect(seen).toEqual(['first', 'other', 'second']);
    } finally {
      releaseFirst.resolve();
    }
  });

  test('a separate OS process cannot overtake the same connection but another connection remains available', async () => {
    const a = scope();
    const b = scope();
    const publisher = instance();
    await publisher.enqueue(a, job('child-blocked'), randomUUID());
    const child = spawn(
      'bun',
      ['run', 'test/whatsapp/helpers/queue-process.ts'],
      {
        env: {
          ...process.env,
          WHATSAPP_TEST_REDIS_URL:
            config.getOrThrow<string>('BACKEND_REDIS_URL'),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    const entered = signal();
    const ready = signal();
    const exited = signal<number | null>();
    let childErrors = '';
    child.stderr?.on('data', (data: Buffer) => {
      childErrors += data.toString();
    });
    createInterface({ input: child.stdout }).on('line', (message) => {
      if (message === 'entered') entered.resolve();
      if (message === 'ready') ready.resolve();
      if (message.startsWith('delivered:'))
        observe(message.slice('delivered:'.length));
    });
    child.on('exit', (code) => {
      exited.resolve(code);
    });
    const seen: string[] = [];
    const otherDelivered = signal();
    const nextDelivered = signal();

    const observe = (content: string) => {
      seen.push(content);
      if (content === 'other-process') otherDelivered.resolve();
      if (content === 'after-child') nextDelivered.resolve();
    };

    try {
      await within(Promise.all([ready.promise, entered.promise]));
      const worker = instance();
      await worker.start((data) => {
        observe(data.content);

        return Promise.resolve();
      });
      await publisher.enqueue(a, job('after-child'), randomUUID());
      await publisher.enqueue(b, job('other-process'), randomUUID());
      await within(otherDelivered.promise);
      expect(seen).toEqual(['other-process']);
      child.stdin.write('release\n');
      await within(nextDelivered.promise);
      expect(seen).toEqual(['other-process', 'after-child']);
      child.stdin.write('stop\n');
      expect({
        code: await within(exited.promise),
        errors: childErrors,
      }).toEqual({ code: 0, errors: '' });
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
        await within(exited.promise);
      }
    }
  });

  test('a killed worker is recovered without allowing later work to overtake its connection', async () => {
    const a = scope();
    const b = scope();
    const publisher = instance();
    await publisher.enqueue(a, job('child-blocked'), randomUUID());
    const child = spawn(
      'bun',
      ['run', 'test/whatsapp/helpers/queue-process.ts'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          WHATSAPP_TEST_REDIS_URL:
            config.getOrThrow<string>('BACKEND_REDIS_URL'),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    const entered = signal();
    const exited = signal<NodeJS.Signals | null>();
    let childErrors = '';
    child.stderr.on('data', (data: Buffer) => {
      childErrors += data.toString();
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (line === 'entered') entered.resolve();
    });
    child.on('exit', (_code, cause) => exited.resolve(cause));
    const otherDelivered = signal();
    const followingDelivered = signal();
    const seen: string[] = [];

    try {
      await within(entered.promise);
      child.kill('SIGKILL');
      expect(await within(exited.promise)).toBe('SIGKILL');
      expect(childErrors).toBe('');
      await publisher.enqueue(a, job('after-crash'), randomUUID());
      await publisher.enqueue(b, job('other-during-crash'), randomUUID());
      const replacement = instance();
      await replacement.start((data) => {
        seen.push(data.content);
        if (data.content === 'other-during-crash') otherDelivered.resolve();
        if (data.content === 'after-crash') followingDelivered.resolve();

        return Promise.resolve();
      });
      await within(otherDelivered.promise);
      expect(seen).toEqual(['other-during-crash']);
      // Exercise production lock expiry and stalled-job scanning unchanged.
      await within(followingDelivered.promise, 100_000);
      expect(seen).toEqual([
        'other-during-crash',
        'child-blocked',
        'after-crash',
      ]);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await within(exited.promise);
      }
    }
  }, 120_000);

  test('a repeatedly failing delivery exhausts five attempts and remains failed', async () => {
    const initialNames = new Set(await redis.smembers(registryKey));
    const target = scope();
    const exhausted = signal();
    let attempts = 0;
    const worker = instance();
    await worker.start(() => {
      attempts++;
      if (attempts === 5) exhausted.resolve();

      return Promise.reject(new Error('Provider rejected before dispatch.'));
    });
    const deliveryId = randomUUID();
    await worker.enqueue(target, job('bounded-failure'), deliveryId);
    await within(exhausted.promise, 30_000);
    await worker.onModuleDestroy();
    queues.splice(queues.indexOf(worker), 1);
    const name = (await redis.smembers(registryKey)).find(
      (entry) => !initialNames.has(entry),
    );

    if (!name) throw new Error('Delivery queue was not registered.');
    const queue = new Queue(name, {
      connection: { url: config.getOrThrow<string>('BACKEND_REDIS_URL') },
    });

    try {
      const delivery = await queue.getJob(deliveryId);
      expect(attempts).toBe(5);
      expect(delivery?.attemptsMade).toBe(5);
      expect(await delivery?.getState()).toBe('failed');
    } finally {
      await queue.close();
    }
  }, 45_000);

  test('a new process discovers a queued delivery after the publisher has stopped', async () => {
    const target = scope();
    const publisher = instance();
    await publisher.enqueue(target, job('persisted'), randomUUID());
    await publisher.onModuleDestroy();
    queues.splice(queues.indexOf(publisher), 1);
    const delivered = signal<NotificationJob>();
    const replacement = instance();
    await replacement.start((data) => {
      delivered.resolve(data);

      return Promise.resolve();
    });
    expect(await within(delivered.promise)).toMatchObject({
      content: 'persisted',
      idempotencyKey: 'persisted',
    });
  });

  test('a completed job is not replayed by repeated dispatch or another process', async () => {
    const target = scope();
    const delivered = signal();
    const seen: string[] = [];

    const processor = (data: NotificationJob) => {
      seen.push(data.content);
      delivered.resolve();

      return Promise.resolve();
    };

    const publisher = instance();
    await publisher.start(processor);
    const jobId = randomUUID();
    await publisher.enqueue(target, job('once'), jobId);
    await within(delivered.promise);
    const second = instance();
    await second.start(processor);
    await second.enqueue(target, job('duplicate'), jobId);
    // Graceful shutdown waits for any active callbacks: no timing sleep needed.
    await Promise.all(queues.map((queue) => queue.onModuleDestroy()));
    queues = [];
    expect(seen).toEqual(['once']);
  });
});
