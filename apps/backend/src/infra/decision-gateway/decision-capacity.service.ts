import { createHash, randomUUID } from 'node:crypto';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { DECISION_FEATURES } from './decision.config';

// Redis TIME avoids host clock skew; token reservations use conservative UTF-8
// byte bounds and a sliding window shared by API/worker processes.
export const RESERVE_DECISION_CAPACITY = `
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - 1000)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
local recent = redis.call('ZRANGE', KEYS[2], 0, -1)
if #recent >= 38 then return 0 end
local tokens = tonumber(ARGV[3])
for _, entry in ipairs(recent) do tokens = tokens + tonumber(string.match(entry, ':(%d+)$')) end
if tokens > 100000 then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[4]), ARGV[1])
redis.call('ZADD', KEYS[2], now, ARGV[1] .. ':' .. ARGV[3])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[4]) + 1000)
redis.call('PEXPIRE', KEYS[2], 2000)
return 1`;

@Injectable()
export class DecisionCapacityService implements OnModuleDestroy {
  private readonly redis?: Redis;
  private readonly prefix: string;
  private readonly limits: Record<'interactive' | 'background', number>;
  constructor(config: ConfigService) {
    const key =
      config.get<string>('BACKEND_DECISION_API_KEY', '').trim() ||
      (config.get('BACKEND_DECISION_PROVIDER', 'openrouter') === 'openrouter'
        ? config.get<string>('BACKEND_MODEL_API_KEY', '').trim()
        : '');

    this.prefix = `sydia:decisions:{${createHash('sha256').update(key).digest('hex').slice(0, 24)}}`;
    this.limits = {
      interactive: Number(
        config.get('BACKEND_DECISION_INTERACTIVE_CONCURRENCY', 6),
      ),
      background: Number(
        config.get('BACKEND_DECISION_BACKGROUND_CONCURRENCY', 2),
      ),
    };

    const active = Object.values(DECISION_FEATURES).some(
      (flag) => config.get<string>(flag, 'off') !== 'off',
    );

    if (key && active) {
      this.redis = new Redis(config.getOrThrow<string>('BACKEND_REDIS_URL'), {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        commandTimeout: 150,
        connectTimeout: 500,
      });
      this.redis.on('error', () => undefined); // fail closed to the incumbent path
    }
  }

  async reserve(
    lane: 'interactive' | 'background',
    bytes: number,
    timeoutMs: number,
  ): Promise<(() => Promise<void>) | null> {
    if (!this.redis || this.redis.status !== 'ready') return null;
    const id = randomUUID();
    const laneKey = `${this.prefix}:${lane}`;

    try {
      const reserved: unknown = await this.redis.eval(
        RESERVE_DECISION_CAPACITY,
        2,
        laneKey,
        `${this.prefix}:rate`,
        id,
        this.limits[lane],
        bytes,
        timeoutMs + 1000,
      );

      if (reserved !== 1) return null;

      return async () => {
        try {
          await this.redis?.zrem(laneKey, id);
        } catch {
          /* expiring lease recovers */
        }
      };
    } catch {
      return null;
    }
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }
}
