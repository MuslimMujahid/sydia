import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';

(process.env.OPTIMIZATION_CAPACITY_LIVE_ENABLED === 'true'
  ? describe
  : describe.skip)('Distributed decision capacity', () => {
  test('shares lane quotas and a token budget between separate process clients', async () => {
    const redisUrl = process.env.BACKEND_REDIS_URL;
    if (!redisUrl) throw new Error('Capacity test requires BACKEND_REDIS_URL');
    const key = `synthetic-capacity-${randomUUID()}`;
    const config = new ConfigService({
      BACKEND_REDIS_URL: redisUrl,
      BACKEND_DECISION_API_KEY: key,
      BACKEND_MEMORY_ELIGIBILITY_MODE: 'shadow',
      BACKEND_DECISION_INTERACTIVE_CONCURRENCY: 1,
      BACKEND_DECISION_BACKGROUND_CONCURRENCY: 1,
    });

    const first = new DecisionCapacityService(config);
    const second = new DecisionCapacityService(config);
    const cleanup = new Redis(redisUrl, { maxRetriesPerRequest: 0 });
    const prefix = `sydia:decisions:{${createHash('sha256').update(key).digest('hex').slice(0, 24)}}`;

    try {
      await sleep(500);
      const interactive = await first.reserve('interactive', 35000, 500);
      expect(interactive).not.toBeNull();
      expect(await second.reserve('interactive', 1, 500)).toBeNull();
      const background = await second.reserve('background', 35000, 500);
      expect(background).not.toBeNull();
      await interactive?.();
      // Lane is available, but another 35k would exceed the shared 100k/sec.
      expect(await second.reserve('interactive', 35000, 500)).toBeNull();
      const affordable = await second.reserve('interactive', 1, 500);
      expect(affordable).not.toBeNull();
      await affordable?.();
      await background?.();
      // A lost caller cannot strand a slot: the lease expires independently.
      await sleep(1100);
      expect(await first.reserve('interactive', 1, 1)).not.toBeNull();
      await sleep(1050);
      const recovered = await second.reserve('interactive', 1, 500);
      expect(recovered).not.toBeNull();
      await recovered?.();
    } finally {
      first.onModuleDestroy();
      second.onModuleDestroy();
      await cleanup.del(
        `${prefix}:interactive`,
        `${prefix}:background`,
        `${prefix}:rate`,
      );
      await cleanup.quit();
    }
  }, 15000);
});
